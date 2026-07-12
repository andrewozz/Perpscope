-- FACT: one row per (trader_address, snapshot_date), covering every
-- leaderboard candidate (active or not). `in_cohort` (computed in
-- int_active_cohort.sql -- see that file for the active/ranking logic) is
-- the DEFINITIONAL filter for Dashboard 3: the client filters on it and
-- sorts by pnl_30d_usd. No rank column needed (same rule as every fact --
-- sorting/slicing is a client concern).

select * from {{ ref('int_active_cohort') }}
