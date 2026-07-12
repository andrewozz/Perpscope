-- INTERMEDIATE: the smart-money cohort spine, one row per (trader, day). The
-- cohort itself (top-100 by the 2-stage risk-adjusted smart_score) is already
-- selected in the extract phase (extractors/smart_money.py), so EVERY loaded
-- leaderboard row is in the cohort -- there's no ranking/filtering to redo here.
-- This model just:
--   * joins each cohort wallet's CURRENT open positions (n_open_positions,
--     gross/net exposure) from int_trader_positions, and
--   * carries the smart_score + component metrics straight through.
-- It's the single source of truth every Dashboard-3 fact reads `in_cohort` from
-- (fct_trader_daily, fct_trader_positions, fct_asset_positioning_daily).

with lb as (

    select * from {{ ref('stg_hl_leaderboard') }}

),

pos_agg as (

    select
        trader_address,
        snapshot_date,
        count(*)                 as n_open_positions,
        sum(position_value_usd)  as gross_exposure_usd,
        sum(signed_notional_usd) as net_exposure_usd

    from {{ ref('int_trader_positions') }}
    group by trader_address, snapshot_date

)

select
    lb.*,
    -- wallets holding nothing right now don't appear in pos_agg -> coalesce to 0
    coalesce(pa.n_open_positions, 0)   as n_open_positions,
    coalesce(pa.gross_exposure_usd, 0) as gross_exposure_usd,
    coalesce(pa.net_exposure_usd, 0)   as net_exposure_usd,
    -- every loaded wallet IS the cohort (selected in Python) -- kept as an
    -- explicit column so downstream facts filter on one consistent flag.
    true as in_cohort

from lb
left join pos_agg pa
    on lb.trader_address = pa.trader_address
    and lb.snapshot_date = pa.snapshot_date
