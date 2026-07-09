-- Staging: CoinGecko top-500-by-market-cap universe.
--
-- DEDUPE KEY: (snapshot_date, cg_id) -- we use `cg_id` (CoinGecko's own
-- unique id, e.g. "bitcoin"), NOT `symbol`. Reminder from the Data
-- Dictionary: `symbol` can collide (multiple different coins can share a
-- ticker like "BTC"-lookalikes), so cg_id is the trustworthy unique key.
-- The messy symbol -> cg_id MAPPING for joining to Hyperliquid assets
-- happens later, in dim_asset -- staging just cleans this table on its own.

with source as (

    select * from {{ source('raw', 'raw_cg_markets') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by snapshot_date, cg_id
            order by _loaded_at desc
        ) as rn

    from source

)

select
    snapshot_date,
    cg_id,
    upper(symbol)                    as symbol,
    name,
    cast(market_cap_usd  as float64) as market_cap_usd,
    cast(market_cap_rank as int64)   as market_cap_rank

from deduped
where rn = 1
