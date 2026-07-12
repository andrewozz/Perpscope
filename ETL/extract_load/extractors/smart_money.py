"""
Smart-money cohort selection -- a 2-stage, risk-adjusted ranking of Hyperliquid
wallets, run entirely in the extract phase. Ports the reference spec in
ETL/"Smart wallets leaderboard.ipynb" (all formulas + methodology are in that
notebook's final cell).

Why not just "sort by 30d PnL": raw PnL rewards account size and floods the top
with passive holders / stale accounts. Instead:

  Stage 1 (free, ~40k leaderboard rows, one GET):
      drop the -500.0 sentinel; require accountValue>0 AND 30d volume>0;
      sort by 30d PnL; keep the top SHORTLIST_SIZE candidates.
  Stage 2 (one `portfolio` call per candidate):
      build the 30d daily equity curve -> Sharpe, profit factor, max drawdown,
      win-rate; gate on >= PORTFOLIO_MIN_OBS daily points.
  Score:
      smart_score = confidence * weighted percentile-rank composite  ->  top COHORT_SIZE.

The returned records ARE the final cohort (already limited to COHORT_SIZE), ready
to load into raw_hl_leaderboard. dbt does no further cohort selection -- it only
joins current positions on top and exposes smart_score/metrics as columns.
"""
from __future__ import annotations

import time

import numpy as np
import pandas as pd
import requests

from .. import config
from .hyperliquid import _post_info, _today


def _f(x) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return np.nan


def _num(x):
    """numpy/NaN/inf -> plain float or None, so BigQuery JSON load never chokes."""
    if x is None:
        return None
    v = float(x)
    return None if (np.isnan(v) or np.isinf(v)) else v


# --------------------------------------------------------------------------- Stage 1
def stage1_shortlist(shortlist_size: int = config.SHORTLIST_SIZE) -> pd.DataFrame:
    """Cut ~40k leaderboard wallets to the top `shortlist_size` by 30d PnL using
    only free leaderboard fields (one GET). Filters, in order:
      1. drop the -500.0 all-time-PnL sentinel (untracked/migrated wallets);
      2. accountValue > 0 (must hold capital);
      3. 30d volume > 0 (traded at least once in the window -> not a passive holder).
    """
    raw = requests.get(config.HL_LEADERBOARD_URL, timeout=config.LEADERBOARD_TIMEOUT).json()
    rows = raw.get("leaderboardRows", raw if isinstance(raw, list) else [])

    def win(r, w):
        return dict(r.get("windowPerformances", [])).get(w, {})

    recs = []
    for r in rows:
        if _f(win(r, "allTime").get("pnl")) == config.LEADERBOARD_ALLTIME_SENTINEL_PNL:
            continue
        acc = _f(r.get("accountValue"))
        vlm = _f(win(r, "month").get("vlm"))
        if not (acc > 0) or not (vlm > 0):
            continue
        recs.append({
            "trader_address":    r.get("ethAddress"),
            "display_name":      r.get("displayName"),
            "account_value_usd": acc,
            "pnl_30d_usd":       _f(win(r, "month").get("pnl")),
            "roi_30d":           _f(win(r, "month").get("roi")),
            "volume_30d_usd":    vlm,
            "alltime_pnl_usd":   _f(win(r, "allTime").get("pnl")),
            "alltime_roi":       _f(win(r, "allTime").get("roi")),
        })

    df = pd.DataFrame(recs).sort_values("pnl_30d_usd", ascending=False).reset_index(drop=True)
    df.insert(0, "stage1_rank_pnl", df.index + 1)
    return df.head(shortlist_size)


# --------------------------------------------------------------------------- Stage 2
def portfolio_metrics(port, pf_cap: float = config.PROFIT_FACTOR_CAP) -> dict:
    """Sharpe, volatility, profit factor, max drawdown, win-rate over the trailing
    30 days from a wallet's `portfolio` response (its `month` window). Uses the
    CUMULATIVE pnl curve for daily P&L (isolates trading P&L from deposits), and
    the account-value curve for drawdown. See the notebook for the full math."""
    seg = dict(port).get("month", {})
    avh = seg.get("accountValueHistory", [])
    ph = seg.get("pnlHistory", [])
    if len(avh) < 3 or len(ph) < 3:
        return {"n_obs": 0}

    curve = pd.DataFrame({
        "t":       pd.to_datetime([p[0] for p in avh], unit="ms"),
        "acc":     [float(p[1]) for p in avh],
        "cum_pnl": [float(p[1]) for p in ph],
    }).set_index("t").sort_index()

    daily = curve.resample("1D").last().dropna()
    daily["pnl"] = daily["cum_pnl"].diff()
    daily["ret"] = (daily["pnl"] / daily["acc"].shift(1).replace(0, np.nan)).replace([np.inf, -np.inf], np.nan)

    ret = daily["ret"].dropna()
    n = len(ret)
    if n < 2:
        return {"n_obs": n}

    sd = ret.std(ddof=1)
    gross_up = daily["pnl"][daily["pnl"] > 0].sum()
    gross_down = -daily["pnl"][daily["pnl"] < 0].sum()
    pf = (gross_up / gross_down) if gross_down > 0 else (pf_cap if gross_up > 0 else np.nan)
    eq = daily["acc"]

    return {
        "n_obs":             n,
        "sharpe_30d":        (ret.mean() / sd) * np.sqrt(365) if sd and sd > 0 else np.nan,
        "volatility_30d":    sd * np.sqrt(365) if sd else np.nan,
        "profit_factor_30d": min(pf, pf_cap) if pd.notna(pf) else np.nan,
        "max_drawdown_30d":  float((eq / eq.cummax() - 1).min()),
        "win_rate_days_30d": float((daily["pnl"].dropna() > 0).mean()),
    }


def _build_metrics(shortlist: pd.DataFrame, delay: float = config.PORTFOLIO_CALL_DELAY_SEC) -> pd.DataFrame:
    """One `portfolio` call per shortlisted wallet; attach the metrics."""
    rows = []
    total = len(shortlist)
    for i, addr in enumerate(shortlist["trader_address"]):
        try:
            rows.append(portfolio_metrics(_post_info({"type": "portfolio", "user": addr})))
        except (requests.RequestException, RuntimeError, ValueError, KeyError):
            rows.append({"n_obs": 0})
        time.sleep(delay)
        if (i + 1) % 100 == 0:
            print(f"    portfolio {i + 1}/{total}")
    return pd.concat([shortlist.reset_index(drop=True), pd.DataFrame(rows)], axis=1)


# --------------------------------------------------------------------------- Smart score
def _score(df: pd.DataFrame) -> pd.DataFrame:
    """Percentile-ranked, weighted, confidence-shrunk composite -> top COHORT_SIZE."""
    weights = config.SMART_MONEY_WEIGHTS
    scored = df[df["n_obs"].fillna(0) >= config.PORTFOLIO_MIN_OBS].copy()

    for m in weights:
        scored[f"p_{m}"] = scored[m].rank(pct=True)

    scored["composite"] = sum(w * scored[f"p_{m}"] for m, w in weights.items())
    scored["confidence"] = (scored["n_obs"] / config.CONFIDENCE_FULL_OBS).clip(0.3, 1.0)
    scored["smart_score"] = scored["composite"] * scored["confidence"]

    scored = scored.sort_values("smart_score", ascending=False).reset_index(drop=True)
    return scored.head(config.COHORT_SIZE)


# --------------------------------------------------------------------------- public entry point
def fetch_smart_money_cohort() -> list[dict]:
    """Run the full 2-stage pipeline and return the top-COHORT_SIZE cohort as flat
    records ready for BigQuery (raw_hl_leaderboard)."""
    snap = _today()

    shortlist = stage1_shortlist()
    print(f"    Stage 1: {len(shortlist)} candidates (top {config.SHORTLIST_SIZE} by 30d PnL, "
          f"accountValue>0, volume>0, sentinel dropped)")

    metrics = _build_metrics(shortlist)
    n_scorable = int((metrics["n_obs"].fillna(0) >= config.PORTFOLIO_MIN_OBS).sum())
    print(f"    Stage 2: {n_scorable}/{len(metrics)} candidates had enough equity history to score")

    cohort = _score(metrics)
    print(f"    Cohort : top {len(cohort)} by smart_score")

    records = []
    for _, r in cohort.iterrows():
        records.append({
            "snapshot_date":     snap,
            "trader_address":    r["trader_address"],
            "display_name":      r["display_name"] if pd.notna(r["display_name"]) else None,
            "account_value_usd": _num(r["account_value_usd"]),
            "pnl_30d_usd":       _num(r["pnl_30d_usd"]),
            "roi_30d":           _num(r["roi_30d"]),
            "volume_30d_usd":    _num(r["volume_30d_usd"]),
            "alltime_pnl_usd":   _num(r["alltime_pnl_usd"]),
            "alltime_roi":       _num(r["alltime_roi"]),
            "sharpe_30d":        _num(r["sharpe_30d"]),
            "volatility_30d":    _num(r["volatility_30d"]),
            "profit_factor_30d": _num(r["profit_factor_30d"]),
            "max_drawdown_30d":  _num(r["max_drawdown_30d"]),
            "win_rate_days_30d": _num(r["win_rate_days_30d"]),
            "n_obs":             int(r["n_obs"]),
            "composite":         _num(r["composite"]),
            "confidence":        _num(r["confidence"]),
            "smart_score":       _num(r["smart_score"]),
            "stage1_rank_pnl":   int(r["stage1_rank_pnl"]),
        })
    return records
