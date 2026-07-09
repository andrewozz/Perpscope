-- DIMENSION table: one row per Hyperliquid asset (coin). Descriptive
-- attributes only -- no daily numbers, no metrics. This is what every fact
-- table LEFT JOINs against to pull in market_cap_rank / is_stablecoin /
-- is_wrapped without duplicating that lookup logic in every fact.
--
-- NEW CONCEPTS in this file vs the staging models:
--   - the ref() function (used below) instead of the source() function:
--     ref() points at ANOTHER DBT MODEL (something dbt builds), not a raw
--     external table. dbt reads every ref() call to build its dependency
--     graph -- it knows dim_asset must run AFTER stg_hl_asset_ctxs /
--     stg_cg_markets / symbol_overrides, and runs them in that order
--     automatically, without us writing any orchestration code.
--   - JOIN: combining two tables side-by-side on a matching key.
--   - subquery in WHERE (select max(...) from ...): "give me only today's
--     snapshot" without hardcoding today's actual date.
--   - IN (...): "is this value one of these listed values?" -> true/false.

with hl_assets as (

    -- the full list of Hyperliquid coins, as of the LATEST snapshot we have.
    -- the "select max(snapshot_date) from ..." subquery below finds today's
    -- date without us having to hardcode it -- this pattern will repeat a lot.
    select distinct coin
    from {{ ref('stg_hl_asset_ctxs') }}
    where snapshot_date = (
        select max(snapshot_date) from {{ ref('stg_hl_asset_ctxs') }}
    )

),

with_override as (

    -- LEFT JOIN to the seed: for most coins there's no override row, so
    -- `ov.cg_symbol` comes back NULL -- coalesce() says "use ov.cg_symbol
    -- if it exists, otherwise just fall back to the Hyperliquid symbol
    -- as-is" (e.g. BTC has no override row, so cg_symbol = 'BTC').
    select
        hl.coin,
        coalesce(ov.cg_symbol, hl.coin) as cg_symbol
    from hl_assets hl
    left join {{ ref('symbol_overrides') }} ov
        on hl.coin = ov.hl_symbol

),

cg_latest as (

    -- CoinGecko's latest snapshot, one row per symbol. A few symbols are
    -- shared by multiple different coins (unrelated projects that happen to
    -- use the same ticker) -- row_number() here keeps only the
    -- HIGHEST-market-cap coin per symbol, since that's almost always the
    -- "real"/intended asset, not an obscure namesake.
    select
        symbol,
        cg_id,
        name,
        market_cap_rank,
        row_number() over (
            partition by symbol
            order by market_cap_usd desc
        ) as rn
    from {{ ref('stg_cg_markets') }}
    where snapshot_date = (
        select max(snapshot_date) from {{ ref('stg_cg_markets') }}
    )

)

select
    w.coin,
    cg.cg_id,
    cg.name,
    cg.market_cap_rank,

    -- membership checks -- true/false, no cast needed, these ARE booleans
    w.coin in ('USDT','USDC','DAI','USDE','FDUSD','TUSD','USDP') as is_stablecoin,
    w.coin in ('WBTC','WETH','WSTETH','STETH','WEETH','WBETH')   as is_wrapped

from with_override w
left join cg_latest cg
    on w.cg_symbol = cg.symbol
    and cg.rn = 1     -- only match the winning (highest-mcap) row per symbol
