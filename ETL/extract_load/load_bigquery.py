"""
Phase 3: loads extracted records into perpscope_raw.

Idempotent by design: each load targets a specific day's partition
(`table$YYYYMMDD`) with WRITE_TRUNCATE, so re-running the same day replaces
that day's data rather than duplicating it (see README.md Phase 3.1).

Tables are auto-created by BigQuery on first load, using the schemas below --
nothing needs to be created manually in the console.
"""
from __future__ import annotations

import datetime as dt

from google.cloud import bigquery

from . import env  # noqa: F401  -- loads ETL/secrets/.env or ETL/.env as a side effect

RAW_DATASET = "perpscope_raw"

SCHEMAS: dict[str, list[bigquery.SchemaField]] = {
    "raw_hl_asset_ctxs": [
        bigquery.SchemaField("snapshot_date", "DATE"),
        bigquery.SchemaField("coin", "STRING"),
        bigquery.SchemaField("mark_px", "FLOAT64"),
        bigquery.SchemaField("oracle_px", "FLOAT64"),
        bigquery.SchemaField("open_interest", "FLOAT64"),
        bigquery.SchemaField("day_ntl_vlm", "FLOAT64"),
        bigquery.SchemaField("funding", "FLOAT64"),
        bigquery.SchemaField("premium", "FLOAT64"),
        bigquery.SchemaField("_loaded_at", "TIMESTAMP"),
    ],
    "raw_hl_candles": [
        bigquery.SchemaField("snapshot_date", "DATE"),
        bigquery.SchemaField("coin", "STRING"),
        bigquery.SchemaField("candle_date", "DATE"),
        bigquery.SchemaField("open", "FLOAT64"),
        bigquery.SchemaField("high", "FLOAT64"),
        bigquery.SchemaField("low", "FLOAT64"),
        bigquery.SchemaField("close", "FLOAT64"),
        bigquery.SchemaField("volume", "FLOAT64"),
        bigquery.SchemaField("n_trades", "INT64"),
        bigquery.SchemaField("_loaded_at", "TIMESTAMP"),
    ],
    "raw_hl_leaderboard": [
        # The smart-money cohort (top-100 by smart_score), already selected in
        # extractors/smart_money.py -- includes the risk-adjusted score + its
        # component metrics. See "Smart wallets leaderboard.ipynb" for the math.
        bigquery.SchemaField("snapshot_date", "DATE"),
        bigquery.SchemaField("trader_address", "STRING"),
        bigquery.SchemaField("display_name", "STRING"),
        bigquery.SchemaField("account_value_usd", "FLOAT64"),
        bigquery.SchemaField("pnl_30d_usd", "FLOAT64"),
        bigquery.SchemaField("roi_30d", "FLOAT64"),
        bigquery.SchemaField("volume_30d_usd", "FLOAT64"),
        bigquery.SchemaField("alltime_pnl_usd", "FLOAT64"),
        bigquery.SchemaField("alltime_roi", "FLOAT64"),
        bigquery.SchemaField("sharpe_30d", "FLOAT64"),
        bigquery.SchemaField("volatility_30d", "FLOAT64"),
        bigquery.SchemaField("profit_factor_30d", "FLOAT64"),
        bigquery.SchemaField("max_drawdown_30d", "FLOAT64"),
        bigquery.SchemaField("win_rate_days_30d", "FLOAT64"),
        bigquery.SchemaField("n_obs", "INT64"),
        bigquery.SchemaField("composite", "FLOAT64"),
        bigquery.SchemaField("confidence", "FLOAT64"),
        bigquery.SchemaField("smart_score", "FLOAT64"),
        bigquery.SchemaField("stage1_rank_pnl", "INT64"),
        bigquery.SchemaField("_loaded_at", "TIMESTAMP"),
    ],
    "raw_hl_positions": [
        bigquery.SchemaField("snapshot_date", "DATE"),
        bigquery.SchemaField("trader_address", "STRING"),
        bigquery.SchemaField("coin", "STRING"),
        bigquery.SchemaField("size_coins", "FLOAT64"),
        bigquery.SchemaField("entry_px", "FLOAT64"),
        bigquery.SchemaField("position_value_usd", "FLOAT64"),
        bigquery.SchemaField("unrealized_pnl", "FLOAT64"),
        bigquery.SchemaField("leverage", "FLOAT64"),
        bigquery.SchemaField("direction", "STRING"),
        bigquery.SchemaField("_loaded_at", "TIMESTAMP"),
    ],
    "raw_cg_markets": [
        bigquery.SchemaField("snapshot_date", "DATE"),
        bigquery.SchemaField("cg_id", "STRING"),
        bigquery.SchemaField("symbol", "STRING"),
        bigquery.SchemaField("name", "STRING"),
        bigquery.SchemaField("market_cap_usd", "FLOAT64"),
        bigquery.SchemaField("market_cap_rank", "INT64"),
        bigquery.SchemaField("_loaded_at", "TIMESTAMP"),
    ],
    "raw_feargreed": [
        bigquery.SchemaField("snapshot_date", "DATE"),
        bigquery.SchemaField("date", "DATE"),
        bigquery.SchemaField("fng_value", "INT64"),
        bigquery.SchemaField("fng_classification", "STRING"),
        bigquery.SchemaField("_loaded_at", "TIMESTAMP"),
    ],
}

# extract/main.py source key -> raw table name
SOURCE_TO_TABLE = {
    "hl_asset_ctxs": "raw_hl_asset_ctxs",
    "hl_candles": "raw_hl_candles",
    "hl_leaderboard": "raw_hl_leaderboard",
    "hl_positions": "raw_hl_positions",
    "cg_markets": "raw_cg_markets",
    "feargreed": "raw_feargreed",
}


def get_client() -> bigquery.Client:
    """Authenticates using GOOGLE_APPLICATION_CREDENTIALS (see extract/env.py)."""
    return bigquery.Client()


def load_records(client: bigquery.Client, table: str, records: list[dict]) -> None:
    """Batch-load records into `table`, replacing only today's partition.

    Idempotent: re-running the same day overwrites that day's partition
    rather than appending duplicate rows. Table is auto-created from
    SCHEMAS[table] if it doesn't exist yet.
    """
    if not records:
        print(f"  skip {table}: no records")
        return
    if table not in SCHEMAS:
        raise ValueError(f"no schema registered for table '{table}' -- add it to SCHEMAS")

    snapshot_date = records[0]["snapshot_date"]
    loaded_at = dt.datetime.now(dt.timezone.utc).isoformat()
    for r in records:
        r["_loaded_at"] = loaded_at

    partition = snapshot_date.replace("-", "")  # 'YYYYMMDD'
    table_id = f"{client.project}.{RAW_DATASET}.{table}${partition}"

    job_config = bigquery.LoadJobConfig(
        schema=SCHEMAS[table],
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        time_partitioning=bigquery.TimePartitioning(field="snapshot_date"),
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    job = client.load_table_from_json(records, table_id, job_config=job_config)
    job.result()  # blocks until done, raises on failure
    print(f"  loaded {len(records)} rows -> {RAW_DATASET}.{table} [{partition}]")


def load_all(results: dict[str, list[dict]]) -> None:
    """Loads every source's records from extract.main.run()'s output dict."""
    client = get_client()
    print(f"\nLoading into BigQuery project: {client.project}")
    for source, records in results.items():
        table = SOURCE_TO_TABLE.get(source)
        if table is None:
            print(f"  skip {source}: no table mapping registered")
            continue
        load_records(client, table, records)
