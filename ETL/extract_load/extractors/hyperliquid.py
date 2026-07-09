"""
Hyperliquid extractors.

Each function returns a list[dict] of flat records for BigQuery loading.
Every record is tagged with `snapshot_date` = the day this extraction run
happened (UTC), which is the raw-table partition key (see README.md Section 5.1).

Endpoints confirmed live during feasibility verification -- see
../docs/VERIFICATION.md for the raw responses this was checked against.
"""
from __future__ import annotations

import datetime as dt
import time

import requests

from .. import config


def _today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def _post_info(payload: dict) -> dict | list:
    r = requests.post(config.HL_INFO_URL, json=payload, timeout=config.REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.json()


# --------------------------------------------------------------------------- asset ctxs
def fetch_asset_ctxs() -> list[dict]:
    """One record per perp asset: mark/oracle price, OI, 24h volume, funding.

    Feeds: fct_asset_metrics_daily (OI dominance, OI/mcap, hottest coins).
    NOTE: openInterest is in COIN units, not USD -- the USD conversion
    (open_interest_coins * mark_px) happens downstream in dbt staging, not here.
    """
    meta, ctxs = _post_info({"type": "metaAndAssetCtxs"})
    universe = meta["universe"]
    snap = _today()

    records = []
    for asset, ctx in zip(universe, ctxs):
        try:
            records.append({
                "snapshot_date": snap,
                "coin": asset["name"],
                "mark_px": float(ctx["markPx"]),
                "oracle_px": float(ctx["oraclePx"]),
                "open_interest": float(ctx["openInterest"]),   # coin units
                "day_ntl_vlm": float(ctx["dayNtlVlm"]),         # 24h notional USD volume
                "funding": float(ctx["funding"]),
                "premium": float(ctx.get("premium") or 0),
            })
        except (KeyError, TypeError, ValueError):
            # a handful of newly-listed / delisted assets can have partial ctx data;
            # skip rather than fail the whole run
            continue
    return records


# --------------------------------------------------------------------------- candles
def fetch_candles(coin: str, days: int = config.CANDLE_LOOKBACK_DAYS) -> list[dict]:
    """Daily OHLCV candles for one coin, most recent `days` days.

    Feeds: fct_asset_metrics_daily (close_px, rs_30d, price_change_7d_pct).
    Candles ARE backfillable (unlike OI), so we re-pull a rolling window every
    day -- self-healing if a prior day's run failed or was skipped.

    Each record carries BOTH:
      - snapshot_date: the day this extraction run happened (raw partition key)
      - candle_date:   the actual date of the OHLC bar (its own timestamp)
    Staging dedupes by (coin, candle_date), keeping the most recently loaded
    version -- so a later, more-complete pull always wins over an earlier one.
    """
    end_ms = int(time.time() * 1000)
    start_ms = end_ms - days * 24 * 3600 * 1000
    resp = _post_info({
        "type": "candleSnapshot",
        "req": {"coin": coin, "interval": "1d", "startTime": start_ms, "endTime": end_ms},
    })
    snap = _today()

    records = []
    for c in resp:
        try:
            candle_date = dt.datetime.fromtimestamp(
                c["t"] / 1000, tz=dt.timezone.utc
            ).date().isoformat()
            records.append({
                "snapshot_date": snap,
                "coin": coin,
                "candle_date": candle_date,
                "open": float(c["o"]),
                "high": float(c["h"]),
                "low": float(c["l"]),
                "close": float(c["c"]),
                "volume": float(c["v"]),
                "n_trades": int(c["n"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return records


def fetch_all_candles(coins: list[str], delay: float = config.CANDLE_CALL_DELAY_SEC) -> list[dict]:
    """Candles for every coin in `coins`, one HTTP call per coin with a polite delay."""
    all_records: list[dict] = []
    for i, coin in enumerate(coins):
        all_records.extend(fetch_candles(coin))
        if i < len(coins) - 1:
            time.sleep(delay)
    return all_records


# --------------------------------------------------------------------------- leaderboard
def fetch_leaderboard_cohort(
    cohort_size: int = config.COHORT_SIZE,
    buffer_size: int = config.COHORT_BUFFER,
) -> list[dict]:
    """Top `buffer_size` traders by 30-day PnL (leaderboard's `month` window).

    Feeds: fct_trader_daily. `in_cohort` marks the top `cohort_size` (100);
    the buffer above that lets dbt track day-over-day cohort churn (see
    DATA_DICTIONARY.md, mart_inflow_outflow edge cases).

    The public leaderboard has ~40k rows and is NOT sorted by 30d PnL, so we
    pull it in full and re-rank client-side -- there's no server-side filter
    for "top N by month pnl".

    Rows whose `allTime.pnl` is the exact -500.0 sentinel are excluded BEFORE
    ranking (see config.LEADERBOARD_ALLTIME_SENTINEL_PNL). Verified live: two
    of the top-30d-PnL accounts ($900M-$2.3B account value, $200M+ monthly
    PnL) both carried this exact placeholder value where a real all-time PnL
    should be -- almost certainly a broken/untracked history (new or migrated
    wallet), not a genuine trader. Those two accounts don't appear on the
    official app.hyperliquid.xyz leaderboard UI either, so this filter aligns
    our cohort with what Hyperliquid's own UI considers a valid ranked trader.
    """
    r = requests.get(config.HL_LEADERBOARD_URL, timeout=config.LEADERBOARD_TIMEOUT)
    r.raise_for_status()
    payload = r.json()
    rows = payload.get("leaderboardRows", payload if isinstance(payload, list) else [])

    def month_pnl(row: dict) -> float:
        windows = dict(row.get("windowPerformances", []))
        try:
            return float(windows.get("month", {}).get("pnl", 0))
        except (TypeError, ValueError):
            return 0.0

    def month_volume(row: dict) -> float:
        windows = dict(row.get("windowPerformances", []))
        try:
            return float(windows.get("month", {}).get("vlm", 0))
        except (TypeError, ValueError):
            return 0.0

    def alltime_pnl(row: dict) -> float:
        windows = dict(row.get("windowPerformances", []))
        try:
            return float(windows.get("allTime", {}).get("pnl", 0))
        except (TypeError, ValueError):
            return 0.0

    valid_rows = [
        row for row in rows
        if alltime_pnl(row) != config.LEADERBOARD_ALLTIME_SENTINEL_PNL
    ]
    ranked = sorted(valid_rows, key=month_pnl, reverse=True)[:buffer_size]
    snap = _today()

    records = []
    for i, row in enumerate(ranked):
        addr = row.get("ethAddress")
        if not addr:
            continue
        records.append({
            "snapshot_date": snap,
            "trader_address": addr,
            "display_name": row.get("displayName"),
            "account_value_usd": float(row.get("accountValue") or 0),
            "pnl_30d_usd": month_pnl(row),
            "volume_30d_usd": month_volume(row),
            "rank_30d_pnl": i + 1,
            "in_cohort": (i + 1) <= cohort_size,
        })
    return records


# --------------------------------------------------------------------------- positions
def fetch_positions(addresses: list[str], delay: float = config.POSITIONS_CALL_DELAY_SEC) -> list[dict]:
    """Open positions for a list of trader addresses (the cohort).

    Feeds: fct_trader_positions, fct_asset_positioning_daily.
    One clearinghouseState call per trader; traders with zero open positions
    (all-cash) simply contribute no rows -- confirmed live that this happens
    even among top-30d-PnL traders (see VERIFICATION.md).
    """
    snap = _today()
    records: list[dict] = []

    for i, addr in enumerate(addresses):
        try:
            cs = _post_info({"type": "clearinghouseState", "user": addr})
        except requests.RequestException:
            continue

        for p in cs.get("assetPositions", []):
            pos = p.get("position", {})
            try:
                szi = float(pos["szi"])
                records.append({
                    "snapshot_date": snap,
                    "trader_address": addr,
                    "coin": pos["coin"],
                    "size_coins": szi,
                    "entry_px": float(pos.get("entryPx") or 0),
                    "position_value_usd": abs(float(pos.get("positionValue") or 0)),
                    "unrealized_pnl": float(pos.get("unrealizedPnl") or 0),
                    "leverage": float((pos.get("leverage") or {}).get("value") or 0),
                    "direction": "long" if szi > 0 else "short",
                })
            except (KeyError, TypeError, ValueError):
                continue

        if i < len(addresses) - 1:
            time.sleep(delay)

    return records
