-- INTERMEDIATE: tidy per-trader-per-coin positions, with ONE addition on
-- top of stg_hl_positions -- signed_notional_usd. stg_hl_positions already
-- has position_value_usd (an UNSIGNED dollar amount: "how big is this
-- position"), but we also need a SIGNED version ("is it long or short,
-- and by how much") to compute net positioning later -- summing signed
-- notionals across a trader's book tells you their overall long/short
-- lean; summing unsigned notionals would just tell you total activity.

with p as (

    select * from {{ ref('stg_hl_positions') }}

),

prices as (

    select coin, snapshot_date, mark_px
    from {{ ref('int_asset_daily') }}

)

select
    p.snapshot_date,
    p.trader_address,
    p.coin,
    p.size_coins,
    p.entry_px,
    p.position_value_usd,

    -- signed: size_coins is already +long/-short (from Hyperliquid's szi),
    -- so multiplying by price keeps that sign -- no abs() here on purpose.
    p.size_coins * pr.mark_px as signed_notional_usd,

    p.unrealized_pnl,
    p.leverage,
    p.direction

from p
left join prices pr
    on p.coin = pr.coin
    and p.snapshot_date = pr.snapshot_date
