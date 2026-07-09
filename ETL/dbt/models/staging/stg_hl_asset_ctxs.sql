-- Staging models: dedupe -> cast -> rename. No joins, no business logic.
-- Grain: one row per (coin, snapshot_date).

with source as (

    select * from {{ source('raw', 'raw_hl_asset_ctxs') }}

),

deduped as (

    -- our loader is idempotent (WRITE_TRUNCATE per partition), so in practice
    -- there's only ever one _loaded_at per (coin, snapshot_date). We dedupe
    -- anyway as a safety net -- if that ever changes, this keeps the model
    -- correct instead of silently double-counting.
    select
        *,
        row_number() over (
            partition by snapshot_date, coin
            order by _loaded_at desc
        ) as rn

    from source

)

select
    snapshot_date,
    upper(coin)                    as coin,
    cast(mark_px       as float64) as mark_px,
    cast(oracle_px     as float64) as oracle_px,
    cast(open_interest as float64) as open_interest_coins,
    cast(day_ntl_vlm   as float64) as volume_24h_usd,
    cast(funding       as float64) as funding_1h,
    cast(premium       as float64) as premium

from deduped
where rn = 1
