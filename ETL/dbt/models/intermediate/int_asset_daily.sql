-- INTERMEDIATE spine: one row per (coin, snapshot_date), combining THREE
-- different staging tables into one clean per-asset-per-day timeline. This
-- is the single most-reused model in the whole project -- every Dashboard
-- 1 & 2 metric in fct_asset_metrics_daily is a window function computed
-- ON TOP of this table.
--
-- NEW CONCEPT: multiple LEFT JOINs. asset_ctxs is the "anchor" table (every
-- row we want to keep); candles and mcap are joined ON so we can pull in
-- extra columns from them, matched by (coin, snapshot_date). LEFT JOIN
-- means: keep every asset_ctxs row even if there's no matching candle or
-- mcap row yet (e.g. a brand-new asset with no CoinGecko listing) -- the
-- joined columns just come back NULL instead of dropping the row entirely.

with asset_ctxs as (

    select * from {{ ref('stg_hl_asset_ctxs') }}

),

candles as (

    -- rename candle_date -> snapshot_date so the join key names line up.
    -- The extractor pulls a 40-day CANDLE window per coin, but we only need
    -- one column (close_px) here -- the 7d/30d lookback math happens later,
    -- in fct_asset_metrics_daily, using LAG() over this table's full history.
    select
        coin,
        candle_date as snapshot_date,
        close_px
    from {{ ref('stg_hl_candles') }}

),

mcap as (

    -- dim_asset gives us the coin -> cg_id mapping (the fuzzy symbol join,
    -- solved once). We use THAT id to pull each day's ACTUAL market cap
    -- from stg_cg_markets -- not dim_asset's cached snapshot, since we want
    -- a real daily time series of market cap, not just "today's" value.
    select
        d.coin,
        cg.snapshot_date,
        cg.market_cap_usd
    from {{ ref('dim_asset') }} d
    inner join {{ ref('stg_cg_markets') }} cg
        on d.cg_id = cg.cg_id

)

select
    a.coin,
    a.snapshot_date,
    a.mark_px,

    -- fallback pattern (same coalesce() idea as dim_asset): prefer the
    -- candle's official daily close, but if no candle matched yet, fall
    -- back to today's live mark price rather than leaving this NULL.
    coalesce(c.close_px, a.mark_px) as close_px,

    a.open_interest_coins,

    -- COMPUTED COLUMN: open interest is stored in COIN units in the raw
    -- table (see extractors/hyperliquid.py comments) -- this is exactly the
    -- "why type casting is necessary" multiplication from earlier: coin
    -- units * price = USD notional. This is real math on real FLOAT64
    -- columns, only possible because staging already cast them properly.
    a.open_interest_coins * a.mark_px as open_interest_usd,

    a.volume_24h_usd,
    a.funding_1h,
    m.market_cap_usd

from asset_ctxs a
left join candles c
    on a.coin = c.coin
    and a.snapshot_date = c.snapshot_date
left join mcap m
    on a.coin = m.coin
    and a.snapshot_date = m.snapshot_date
