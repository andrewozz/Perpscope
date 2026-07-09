-- FACT: one row per (trader_address, snapshot_date). Top-100 trader stats.
-- `in_cohort` (already computed in Python, carried through staging) is the
-- DEFINITIONAL filter for Dashboard 3 -- the client filters on it and sorts
-- by pnl_30d_usd; no rank column needed (same rule as every other fact).
--
-- NEW CONCEPT: GROUP BY (a REAL aggregation, collapsing many rows into one
-- -- unlike the window functions we used before, which kept every row).
-- Here we collapse EACH TRADER'S MANY POSITION ROWS down into ONE summary
-- row per trader: count of positions, total exposure, etc.

with lb as (

    select * from {{ ref('stg_hl_leaderboard') }}

),

pos_agg as (

    select
        trader_address,
        snapshot_date,
        count(*)                     as n_open_positions,
        sum(position_value_usd)      as gross_exposure_usd,
        sum(signed_notional_usd)     as net_exposure_usd

    from {{ ref('int_trader_positions') }}
    group by trader_address, snapshot_date   -- one output row per trader per day

)

select
    lb.trader_address,
    lb.snapshot_date,
    lb.display_name,
    lb.pnl_30d_usd,
    lb.volume_30d_usd,
    lb.account_value_usd,

    -- traders holding ZERO positions (all-cash) simply don't appear in
    -- pos_agg at all (group by only produces rows for traders WITH
    -- positions) -- so the left join gives NULL, and coalesce() turns that
    -- into a real 0 instead. Confirmed live in VERIFICATION.md: some
    -- top-30d-PnL traders genuinely hold 0 open positions.
    coalesce(pa.n_open_positions, 0)  as n_open_positions,
    coalesce(pa.gross_exposure_usd, 0) as gross_exposure_usd,
    coalesce(pa.net_exposure_usd, 0)   as net_exposure_usd,

    lb.in_cohort

from lb
left join pos_agg pa
    on lb.trader_address = pa.trader_address
    and lb.snapshot_date = pa.snapshot_date
