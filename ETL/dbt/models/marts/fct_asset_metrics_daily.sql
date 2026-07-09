-- FACT table: one row per (coin, snapshot_date), ALL assets, ALL days --
-- no rank, no LIMIT (see the Design Principle in DATA_DICTIONARY.md).
-- Feeds 5 charts across Dashboards 1 & 2 as different sorts of this one
-- table: hottest coins, strongest coins, OI dominance treemap, OI 7d
-- movers, OI/mcap leverage bar.
--
-- NEW CONCEPT: SELF-JOIN. `btc` below is int_asset_daily joined BACK TO
-- ITSELF, filtered to just the BTC rows -- this lets every other coin's row
-- pull in "what was BTC's close price on this SAME day" as its own column,
-- which is required to compute each coin's ratio to BTC (for rs_30d).
--
-- NEW CONCEPT (repeated with new offsets): LAG(column, N) OVER (PARTITION
-- BY coin ORDER BY snapshot_date) = "go back N ROWS within this coin's own
-- history and grab that value." N=1 -> yesterday. N=7 -> 7 days ago.
-- N=30 -> 30 days ago. Right now we only have 1 day of history loaded, so
-- every LAG() will return NULL (there's nothing to look back to yet) --
-- that's EXPECTED, not a bug (see VERIFICATION.md, OI-not-backfillable).
-- These columns fill in for real starting on day 2 (LAG 1), day 8 (LAG 7),
-- and day 31 (LAG 30) of the pipeline running.

with d as (

    select * from {{ ref('int_asset_daily') }}

),

btc as (

    -- just BTC's own timeline, renamed so we can join it onto every coin's
    -- row without column-name collisions.
    select
        snapshot_date,
        close_px as btc_close_px
    from d
    where coin = 'BTC'

),

with_btc_and_lags as (

    select
        d.coin,
        d.snapshot_date,
        d.mark_px,
        d.close_px,
        d.volume_24h_usd,

        -- LAG 1 day: for the 24h volume-surge / OI-change metrics
        lag(d.volume_24h_usd, 1) over (
            partition by d.coin order by d.snapshot_date
        ) as volume_24h_usd_prev,

        d.open_interest_usd,

        lag(d.open_interest_usd, 1) over (
            partition by d.coin order by d.snapshot_date
        ) as oi_usd_prev,

        -- LAG 7 days: for the weekly OI-movers / price-change metrics
        lag(d.open_interest_usd, 7) over (
            partition by d.coin order by d.snapshot_date
        ) as open_interest_usd_7d_ago,

        lag(d.close_px, 7) over (
            partition by d.coin order by d.snapshot_date
        ) as close_px_7d_ago,

        d.market_cap_usd,
        d.funding_1h,

        -- this coin's price expressed AS A RATIO of BTC's price, same day.
        -- Only possible because of the self-join above (btc.btc_close_px).
        d.close_px / btc.btc_close_px as coin_btc_ratio,

        -- LAG 30 days on a COMPUTED column (the ratio itself, not a raw
        -- column) -- window functions can operate on any expression, not
        -- just table columns.
        lag(d.close_px / btc.btc_close_px, 30) over (
            partition by d.coin order by d.snapshot_date
        ) as coin_btc_ratio_30d_ago

    from d
    inner join btc
        on d.snapshot_date = btc.snapshot_date

)

select
    w.coin,
    w.snapshot_date,
    w.mark_px,
    w.close_px,
    w.volume_24h_usd,
    w.volume_24h_usd_prev,

    -- safe_divide(a, b) = a / b, but returns NULL instead of erroring if
    -- b = 0 (e.g. a brand-new coin with no prior-day volume yet).
    safe_divide(
        w.volume_24h_usd - w.volume_24h_usd_prev,
        w.volume_24h_usd_prev
    ) as vol_change_24h_pct,

    w.open_interest_usd,

    -- SUM(...) OVER (PARTITION BY snapshot_date) with NO "order by" inside
    -- the OVER(): this sums open_interest_usd across EVERY COIN sharing the
    -- same snapshot_date (a "total for the day"), then divides each coin's
    -- own OI by that day's total -- this is how oi_dominance sums to 1.0
    -- across all coins on any given day (verified live in Phase-2 testing).
    safe_divide(
        w.open_interest_usd,
        sum(w.open_interest_usd) over (partition by w.snapshot_date)
    ) as oi_dominance,

    safe_divide(
        w.open_interest_usd - w.oi_usd_prev,
        w.oi_usd_prev
    ) as oi_change_24h_pct,

    w.open_interest_usd - w.open_interest_usd_7d_ago as oi_change_7d_usd,

    safe_divide(
        w.open_interest_usd - w.open_interest_usd_7d_ago,
        w.open_interest_usd_7d_ago
    ) as oi_change_7d_pct,

    safe_divide(w.close_px, w.close_px_7d_ago) - 1 as price_change_7d_pct,

    w.market_cap_usd,
    safe_divide(w.open_interest_usd, w.market_cap_usd) as oi_mcap_ratio,

    safe_divide(w.coin_btc_ratio, w.coin_btc_ratio_30d_ago) - 1 as rs_30d,

    w.funding_1h,
    a.market_cap_rank,
    a.is_stablecoin,
    a.is_wrapped

from with_btc_and_lags w
left join {{ ref('dim_asset') }} a
    on w.coin = a.coin
