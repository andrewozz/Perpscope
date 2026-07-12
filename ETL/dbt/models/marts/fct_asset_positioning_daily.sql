-- FACT: one row per (coin, snapshot_date) -- every asset the smart-money
-- cohort holds, all days. Feeds TWO charts: net positioning stacked bar,
-- and daily inflow/outflow. This is the most involved model in the
-- project, so it's built in clearly separated steps.

with cohort as (

    -- STEP 1: who counts as "smart money" today? This is the one
    -- DEFINITIONAL filter allowed in the warehouse (see Design Principle
    -- in DATA_DICTIONARY.md) -- everything else in this file is
    -- presentation-agnostic (no rank, no LIMIT). in_cohort is decided once,
    -- centrally, in int_active_cohort.sql (active traders only -- see that
    -- file for why), so every Dashboard 3 fact agrees on who's in it.
    select snapshot_date, trader_address
    from {{ ref('int_active_cohort') }}
    where in_cohort

),

cohort_positions as (

    -- STEP 2: restrict int_trader_positions down to ONLY cohort members'
    -- positions (an INNER JOIN here, not LEFT -- we deliberately DROP any
    -- position belonging to a trader outside the top-100 buffer).
    select
        p.snapshot_date,
        p.trader_address,
        p.coin,
        p.signed_notional_usd
    from {{ ref('int_trader_positions') }} p
    inner join cohort c
        on p.trader_address = c.trader_address
        and p.snapshot_date = c.snapshot_date

),

per_coin as (

    -- STEP 3: the real GROUP BY -- collapse many trader-rows into one row
    -- per coin. countif(condition) is a BigQuery shortcut for
    -- "count only the rows where this condition is true" -- equivalent to
    -- sum(case when signed_notional_usd > 0 then 1 else 0 end), just
    -- shorter to write.
    select
        snapshot_date,
        coin,
        countif(signed_notional_usd > 0) as n_long,
        countif(signed_notional_usd < 0) as n_short,
        sum(signed_notional_usd)         as cohort_net_notional_usd

    from cohort_positions
    group by snapshot_date, coin

),

cohort_sizes as (

    -- STEP 4: how many traders were actually in the cohort each day (should
    -- be 100, but computed for real rather than hardcoded -- an audit trail
    -- if cohort membership rules ever change).
    select snapshot_date, count(*) as cohort_size
    from cohort
    group by snapshot_date

),

with_flat_and_pct as (

    select
        p.snapshot_date,
        p.coin,
        cs.cohort_size,
        p.n_long,
        p.n_short,

        -- "not involved" isn't a row in the data at all (a trader holding
        -- nothing in a coin has NO position row for it) -- we derive it
        -- arithmetically instead: whoever isn't long and isn't short must
        -- be flat.
        cs.cohort_size - p.n_long - p.n_short as n_flat,

        safe_divide(p.n_long, cs.cohort_size)  as pct_long,
        safe_divide(p.n_short, cs.cohort_size) as pct_short,
        safe_divide(cs.cohort_size - p.n_long - p.n_short, cs.cohort_size) as pct_flat,

        p.cohort_net_notional_usd

    from per_coin p
    inner join cohort_sizes cs
        on p.snapshot_date = cs.snapshot_date

)

select
    w.coin,
    w.snapshot_date,
    w.cohort_size,
    w.n_long,
    w.n_short,
    w.n_flat,
    w.pct_long,
    w.pct_short,
    w.pct_flat,
    w.cohort_net_notional_usd,

    -- same day-over-day LAG pattern as fct_asset_metrics_daily -- will be
    -- NULL until there's a 2nd day of history, same warm-up-period reasoning.
    lag(w.cohort_net_notional_usd, 1) over (
        partition by w.coin order by w.snapshot_date
    ) as cohort_net_notional_prev,

    w.cohort_net_notional_usd - lag(w.cohort_net_notional_usd, 1) over (
        partition by w.coin order by w.snapshot_date
    ) as inflow_usd,

    safe_divide(
        w.cohort_net_notional_usd - lag(w.cohort_net_notional_usd, 1) over (
            partition by w.coin order by w.snapshot_date
        ),
        abs(lag(w.cohort_net_notional_usd, 1) over (
            partition by w.coin order by w.snapshot_date
        ))
    ) as inflow_pct,

    a.market_cap_rank

from with_flat_and_pct w
left join {{ ref('dim_asset') }} a
    on w.coin = a.coin
