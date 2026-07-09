"""
CoinGecko extractor -- market cap universe for dim_asset / OI-mcap ratio.
"""
from __future__ import annotations

import datetime as dt
import time

import requests

from .. import config


def _today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def _get_with_retry(url: str, params: dict, max_attempts: int = 5) -> requests.Response:
    """GET with exponential backoff on HTTP 429.

    CoinGecko's free tier has a tight per-minute rate limit. Verified live
    that hammering it (e.g. several quick test calls) returns 429 -- and, more
    dangerously, can return a *200* with a truncated/degraded coin list rather
    than an error (seen live: page 1 missing BTC/ETH entirely). So on top of
    retrying 429s, the caller sanity-checks the row count before trusting it.
    """
    delay = 10.0
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        r = requests.get(url, params=params, timeout=config.REQUEST_TIMEOUT)
        if r.status_code == 429:
            retry_after = float(r.headers.get("Retry-After", delay))
            print(f"  [coingecko] 429 rate-limited, retrying in {retry_after:.0f}s "
                  f"(attempt {attempt + 1}/{max_attempts})")
            time.sleep(retry_after)
            delay *= 2
            continue
        r.raise_for_status()
        return r
    raise RuntimeError(f"CoinGecko still rate-limited after {max_attempts} attempts") from last_exc


def fetch_markets(pages: int = config.CG_PAGES, per_page: int = config.CG_PER_PAGE) -> list[dict]:
    """Top `pages * per_page` coins by market cap.

    Feeds: dim_asset (market_cap_rank), fct_asset_metrics_daily (oi_mcap_ratio).

    Verified live: matching by raw symbol only covers ~135/231 Hyperliquid
    assets even at 500 coins (k-prefixed 1000x perps, renamed tokens,
    long-tail delisted coins). That's acceptable -- every asset actually used
    in a ranking chart (top-OI, top-mcap) matches; see VERIFICATION.md.
    The symbol -> CoinGecko-symbol override map lives in config.CG_SYMBOL_OVERRIDE
    and is applied downstream in dbt (dim_asset), not here -- this extractor
    just lands CoinGecko's data as-is.
    """
    snap = _today()
    records: list[dict] = []

    for page in range(1, pages + 1):
        r = _get_with_retry(config.CG_MARKETS_URL, params={
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": per_page,
            "page": page,
        })
        page_rows = r.json()

        if page == 1:
            symbols = {c["symbol"].upper() for c in page_rows}
            if not {"BTC", "ETH"} & symbols:
                # A degraded/throttled response can come back as HTTP 200 with a
                # truncated or nonsensical coin list (confirmed live -- BTC/ETH
                # missing, a handful of small tokenized-fund coins ranked #1-10).
                # Treat that as a failure rather than silently loading garbage mcaps.
                raise RuntimeError(
                    "CoinGecko page 1 is missing BTC/ETH -- likely a rate-limited "
                    "or degraded response. Not loading this run's market data."
                )

        for c in page_rows:
            if not c.get("market_cap"):
                continue
            records.append({
                "snapshot_date": snap,
                "cg_id": c["id"],
                "symbol": c["symbol"].upper(),
                "name": c["name"],
                "market_cap_usd": float(c["market_cap"]),
                "market_cap_rank": c.get("market_cap_rank"),
            })

        if page < pages:
            time.sleep(15)  # stay comfortably under the free-tier per-minute limit

    return records
