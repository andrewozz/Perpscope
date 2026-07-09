-- Staging: daily OHLCV candles.
--
-- DEDUPE KEY: (coin, candle_date) -- NOT snapshot_date.
-- Reminder from extractors/hyperliquid.py: every day we re-pull a rolling
-- 40-day WINDOW of candles per coin (candles are backfillable, unlike OI).
-- So candle_date=2026-07-01 for BTC gets loaded again and again across many
-- different snapshot_date pulls (07-01, 07-02, 07-03, ...) as it stays
-- inside that rolling window. We want ONE row per (coin, candle_date) --
-- the actual calendar day the candle represents -- keeping the freshest
-- pull, same reasoning as stg_feargreed.sql.

with source as (

    select * from {{ source('raw', 'raw_hl_candles') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by coin, candle_date   -- bucket by the candle's OWN date, not the pull day
            order by _loaded_at desc
        ) as rn

    from source

)

select
    upper(coin)               as coin,
    candle_date,
    cast(open      as float64) as open_px,
    cast(high      as float64) as high_px,
    cast(low       as float64) as low_px,
    cast(close     as float64) as close_px,
    cast(volume    as float64) as volume,
    cast(n_trades  as int64)   as n_trades

from deduped
where rn = 1
