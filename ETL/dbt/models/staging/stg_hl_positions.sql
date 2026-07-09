-- Staging: open positions for cohort traders.
--
-- DEDUPE KEY: (snapshot_date, trader_address, coin) -- THREE columns this
-- time, because the grain here is finer: one row per trader PER COIN they
-- hold, per day. A trader can hold BTC and ETH positions simultaneously --
-- those are two separate rows, both valid, not duplicates. Only an EXACT
-- match on all three columns counts as a duplicate to dedupe away.

with source as (

    select * from {{ source('raw', 'raw_hl_positions') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by snapshot_date, trader_address, coin
            order by _loaded_at desc
        ) as rn

    from source

)

select
    snapshot_date,
    trader_address,
    upper(coin)                          as coin,
    cast(size_coins         as float64)  as size_coins,          -- signed: +long / -short
    cast(entry_px           as float64)  as entry_px,
    cast(position_value_usd as float64)  as position_value_usd,  -- unsigned notional
    cast(unrealized_pnl     as float64)  as unrealized_pnl,
    cast(leverage           as float64)  as leverage,
    direction

from deduped
where rn = 1
