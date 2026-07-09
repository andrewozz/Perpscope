-- FACT: expandable position detail per trader (the "click a trader, see
-- their book" view). Mostly a pass-through of int_trader_positions, plus
-- one convenience join so the client can filter to just cohort traders
-- without a second lookup.

select
    p.*,
    coalesce(lb.in_cohort, false) as in_cohort

from {{ ref('int_trader_positions') }} p
left join {{ ref('stg_hl_leaderboard') }} lb
    on p.trader_address = lb.trader_address
    and p.snapshot_date = lb.snapshot_date
