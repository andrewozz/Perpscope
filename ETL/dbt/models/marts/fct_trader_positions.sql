-- FACT: expandable position detail per trader (the "click a trader, see
-- their book" view). Mostly a pass-through of int_trader_positions, plus
-- one convenience join so the client can filter to just cohort traders
-- without a second lookup. in_cohort comes from int_active_cohort.sql (the
-- single source of truth for cohort membership -- see that file).

select
    p.*,
    coalesce(c.in_cohort, false) as in_cohort

from {{ ref('int_trader_positions') }} p
left join {{ ref('int_active_cohort') }} c
    on p.trader_address = c.trader_address
    and p.snapshot_date = c.snapshot_date
