-- Staging: the smart-money cohort (top-100 by smart_score) with its
-- risk-adjusted score and component metrics. The whole 2-stage selection +
-- scoring happens in the extract phase (extractors/smart_money.py), so this
-- table is ALREADY the final cohort -- staging just cleans types.
--
-- DEDUPE KEY: (snapshot_date, trader_address) -- one fresh ranking snapshot per
-- day; dedupe defensively as elsewhere. See "Smart wallets leaderboard.ipynb"
-- for the smart_score formulas (Sharpe / profit factor / max drawdown / ROI /
-- PnL / volume -> percentile-ranked, weighted, confidence-shrunk composite).

with source as (

    select * from {{ source('raw', 'raw_hl_leaderboard') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by snapshot_date, trader_address
            order by _loaded_at desc
        ) as rn

    from source

)

select
    snapshot_date,
    trader_address,
    display_name,
    cast(account_value_usd as float64) as account_value_usd,
    cast(pnl_30d_usd       as float64) as pnl_30d_usd,
    cast(roi_30d           as float64) as roi_30d,
    cast(volume_30d_usd    as float64) as volume_30d_usd,
    cast(alltime_pnl_usd   as float64) as alltime_pnl_usd,
    cast(alltime_roi       as float64) as alltime_roi,
    cast(sharpe_30d        as float64) as sharpe_30d,
    cast(volatility_30d    as float64) as volatility_30d,
    cast(profit_factor_30d as float64) as profit_factor_30d,
    cast(max_drawdown_30d  as float64) as max_drawdown_30d,
    cast(win_rate_days_30d as float64) as win_rate_days_30d,
    cast(n_obs             as int64)   as n_obs,
    cast(composite         as float64) as composite,
    cast(confidence        as float64) as confidence,
    cast(smart_score       as float64) as smart_score,
    cast(stage1_rank_pnl   as int64)   as stage1_rank_pnl

from deduped
where rn = 1
