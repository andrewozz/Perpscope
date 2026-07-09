"""
Orchestrates all extractors for one daily run, then (unless --dry-run) loads
the results into perpscope_raw via load_bigquery.py.

Usage:
    python -m extract.main --dry-run                    # extract + print only, no BigQuery
    python -m extract.main --dry-run --limit-coins 10    # fast run while testing
    python -m extract.main                               # extract AND load into BigQuery for real
"""
from __future__ import annotations

import argparse
import json
import time

from .extractors import coingecko, feargreed, hyperliquid


def _summarize(name: str, records: list[dict], elapsed: float) -> None:
    print(f"\n[{name}] {len(records)} rows  ({elapsed:.1f}s)")
    if records:
        print(f"  sample: {json.dumps(records[0], default=str)}")


def run(dry_run: bool, limit_coins: int | None) -> dict[str, list[dict]]:
    results: dict[str, list[dict]] = {}

    t0 = time.time()
    asset_ctxs = hyperliquid.fetch_asset_ctxs()
    _summarize("hl_asset_ctxs", asset_ctxs, time.time() - t0)
    results["hl_asset_ctxs"] = asset_ctxs

    coins = [r["coin"] for r in asset_ctxs]
    if limit_coins:
        coins = coins[:limit_coins]
        print(f"\n(--limit-coins active: pulling candles for {len(coins)}/{len(asset_ctxs)} coins)")

    t0 = time.time()
    candles = hyperliquid.fetch_all_candles(coins)
    _summarize("hl_candles", candles, time.time() - t0)
    results["hl_candles"] = candles

    t0 = time.time()
    leaderboard = hyperliquid.fetch_leaderboard_cohort()
    _summarize("hl_leaderboard", leaderboard, time.time() - t0)
    results["hl_leaderboard"] = leaderboard

    cohort_addrs = [r["trader_address"] for r in leaderboard if r["in_cohort"]]
    t0 = time.time()
    positions = hyperliquid.fetch_positions(cohort_addrs)
    _summarize("hl_positions", positions, time.time() - t0)
    results["hl_positions"] = positions

    t0 = time.time()
    cg_markets = coingecko.fetch_markets()
    _summarize("cg_markets", cg_markets, time.time() - t0)
    results["cg_markets"] = cg_markets

    t0 = time.time()
    fng = feargreed.fetch_feargreed()
    _summarize("feargreed", fng, time.time() - t0)
    results["feargreed"] = fng

    print("\n" + "=" * 60)
    total = sum(len(v) for v in results.values())
    print(f"TOTAL: {total} records across {len(results)} sources")

    if dry_run:
        print("(--dry-run: no BigQuery writes.)")
    else:
        from . import load_bigquery
        load_bigquery.load_all(results)

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="PerpScope Market Analytics -- daily extract + load")
    parser.add_argument("--dry-run", action="store_true",
                         help="extract only, skip BigQuery load")
    parser.add_argument("--limit-coins", type=int, default=None,
                         help="only pull candles for the first N coins (faster local testing)")
    args = parser.parse_args()
    run(dry_run=args.dry_run, limit_coins=args.limit_coins)


if __name__ == "__main__":
    main()
