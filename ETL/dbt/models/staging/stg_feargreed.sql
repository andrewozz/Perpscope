-- Staging: Fear & Greed index. Same dedupe -> cast -> rename recipe as
-- stg_hl_asset_ctxs.sql, but the DEDUPE KEY IS DIFFERENT:
--
--   stg_hl_asset_ctxs dedupes on (snapshot_date, coin)  -- one row per asset per pull-day
--   stg_feargreed     dedupes on (date)                 -- one row per F&G calendar date
--
-- Why the difference: the F&G extractor re-pulls the ENTIRE history every
-- single day (it's a small payload, see feargreed.py). So the same `date`
-- (e.g. 2026-07-01) shows up inside MANY different days' raw loads
-- (snapshot_date = 2026-07-01, 2026-07-02, 2026-07-03, ...) -- every daily
-- pull re-sends that same historical row. We want ONE row per real-world
-- `date`, keeping whichever pull loaded it most recently (_loaded_at desc).

with source as (

    select * from {{ source('raw', 'raw_feargreed') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by date          -- bucket by the F&G date, NOT snapshot_date
            order by _loaded_at desc   -- newest load wins within each date
        ) as rn

    from source

)

select
    date,
    cast(fng_value as int64) as fng_value,
    fng_classification

from deduped
where rn = 1
