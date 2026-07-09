-- Staging: top-150-by-30d-PnL trader cohort buffer.
--
-- DEDUPE KEY: (snapshot_date, trader_address) -- back to the "normal" pattern
-- (same shape as stg_hl_asset_ctxs), because unlike candles/F&G, this table
-- is NOT a rolling re-pull of history -- it's a fresh ranking snapshot each
-- day, so a given trader only appears once per snapshot_date under normal
-- operation. We still dedupe defensively (same safety-net reasoning as
-- stg_hl_asset_ctxs).
--
-- NOTE: `in_cohort` and the -500.0 sentinel filter were ALREADY applied
-- back in Python (extractors/hyperliquid.py fetch_leaderboard_cohort) --
-- staging doesn't redo business logic, it just cleans types. That
-- filtering decision lives in extraction because it needed the RAW
-- windowPerformances.allTime.pnl field, which we don't even bother
-- flattening into BigQuery (we only kept the columns we actually use).

with source as (

    select * from {{ source('raw', 'raw_hl_leaderboard') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by snapshot_date, trader_address
            order by _loaded_at desc
        ) as rn

    from source

)

select
    snapshot_date,
    trader_address,
    display_name,
    cast(account_value_usd as float64) as account_value_usd,
    cast(pnl_30d_usd       as float64) as pnl_30d_usd,
    cast(volume_30d_usd    as float64) as volume_30d_usd,
    cast(rank_30d_pnl      as int64)   as rank_30d_pnl,
    in_cohort   -- already a real BOOL in the raw table (Python set it, not a JSON string), no cast needed

from deduped
where rn = 1
