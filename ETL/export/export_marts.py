"""
Phase 6: export the finished BigQuery marts to static JSON the React app can
fetch() -- keyless, exactly the pattern the frontend already uses elsewhere.

The React app can't query BigQuery directly (no browser-safe credentials), so
this scheduled step runs a SELECT on each mart and writes the result to
PerpScope/public/market/*.json. Vite serves /public at the site root, so the
app fetches e.g. fetch('/market/asset_metrics.json').

Run from ETL/:
    python -m export.export_marts
"""
from __future__ import annotations

import json
import math
import pathlib

from extract_load.load_bigquery import get_client

# ETL/export/export_marts.py -> PerpScope/public/market
OUT_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "public" / "market"

PROJECT_MARTS = "perpscope-analytics.perpscope_marts"

# Each export: a filename + the SQL that produces it. The daily facts are
# filtered to the LATEST snapshot_date (the charts show "today"); fear & greed
# keeps its full history for the line chart.
EXPORTS: dict[str, str] = {
    "fear_greed": f"""
        SELECT date, fng_value, fng_classification
        FROM `{PROJECT_MARTS}.fct_fear_greed`
        ORDER BY date
    """,
    "asset_metrics": f"""
        SELECT *
        FROM `{PROJECT_MARTS}.fct_asset_metrics_daily`
        WHERE snapshot_date = (
            SELECT MAX(snapshot_date) FROM `{PROJECT_MARTS}.fct_asset_metrics_daily`
        )
    """,
    "positioning": f"""
        SELECT *
        FROM `{PROJECT_MARTS}.fct_asset_positioning_daily`
        WHERE snapshot_date = (
            SELECT MAX(snapshot_date) FROM `{PROJECT_MARTS}.fct_asset_positioning_daily`
        )
    """,
    "active_traders": f"""
        -- The smart-money cohort: top-100 wallets by a 2-stage risk-adjusted
        -- `smart_score` (Sharpe / profit factor / max drawdown / ROI / PnL /
        -- volume -> percentile-ranked, weighted, confidence-shrunk). The whole
        -- selection happens in the extract phase (extractors/smart_money.py, see
        -- "Smart wallets leaderboard.ipynb"), so in_cohort is already the final
        -- cohort. We sort by smart_score so the strongest wallets lead.
        SELECT *
        FROM `{PROJECT_MARTS}.fct_trader_daily`
        WHERE snapshot_date = (
            SELECT MAX(snapshot_date) FROM `{PROJECT_MARTS}.fct_trader_daily`
        )
        AND in_cohort
        ORDER BY smart_score DESC
    """,
    "trader_positions": f"""
        SELECT *
        FROM `{PROJECT_MARTS}.fct_trader_positions`
        WHERE snapshot_date = (
            SELECT MAX(snapshot_date) FROM `{PROJECT_MARTS}.fct_trader_positions`
        )
        AND in_cohort
    """,
}


def _clean(value):
    """JSON.parse rejects NaN/Infinity; convert them to null. Dates -> ISO str."""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    client = get_client()
    print(f"Exporting marts from {client.project} -> {OUT_DIR}")

    for name, query in EXPORTS.items():
        rows = [
            {k: _clean(v) for k, v in dict(row).items()}
            for row in client.query(query).result()
        ]
        out_path = OUT_DIR / f"{name}.json"
        out_path.write_text(json.dumps(rows), encoding="utf-8")
        print(f"  wrote {len(rows):>5} rows -> public/market/{name}.json")


if __name__ == "__main__":
    main()
