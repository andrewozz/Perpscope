# PerpScope Market Analytics — Data Dictionary

> The **single source of truth** for what every column *means*. Each fact table's SQL must
> match its entry here. When a spec ("highest avg coin/btc ratio") was analytically shaky, this
> is where the refined, defensible definition is documented **and justified** — that reasoning
> is itself a résumé talking point ("I caught and corrected a misleading metric").
>
> Companion to [`../README.md`](../README.md). Notation: **OI$** = open interest in USD
> notional = `open_interest_coins × mark_px`.

---

## Table of contents
- [Design principle](#design-principle--clean-reusable-tables-the-appbi-sorts-and-slices)
- [Shared building blocks](#shared-building-blocks) — `dim_asset`, `int_asset_daily`, `int_trader_positions`
- [The fact tables](#the-fact-tables) (what actually gets consumed)
  - [`fct_asset_metrics_daily`](#fct_asset_metrics_daily) — Dashboards 1 & 2, per asset
  - [`fct_fear_greed`](#fct_fear_greed) — Dashboard 1
  - [`fct_btc_regime`](#fct_btc_regime) — Dashboard 1
  - [`fct_asset_positioning_daily`](#fct_asset_positioning_daily) — Dashboard 3
  - [`fct_trader_daily`](#fct_trader_daily) — Dashboard 3
  - [`fct_trader_positions`](#fct_trader_positions) — Dashboard 3
- [Chart → table map](#chart--table-map)
- [Cross-cutting notes & gotchas](#cross-cutting-notes--gotchas)

---

## Design principle — clean reusable tables; the app/BI sorts and slices

We build a **small set of clean, insightful fact tables**, each usable by many components —
**not** one narrow table per chart. Concretely:

- **A fact table holds every row at its grain** (all assets, all days after quality filters),
  plus **every column a component might need to sort or filter on.**
- **No `rank`, no `LIMIT`, no `is_latest`, no top-N in the warehouse.** Ordering and slicing
  are **presentation** concerns — React (Recharts) and Power BI sort by whatever column they
  want and take however many rows they want. A component showing "top 5" and another showing
  "top 20" read the *same* table with a different `ORDER BY … LIMIT`.
- **Keep each metric's raw inputs** (e.g. both `volume_24h_usd` and `volume_24h_usd_prev`) so a
  component can re-threshold, recompute, or show tooltips without another round-trip.
- **Definitional filters stay; presentation filters go.** "Top-100 traders by 30d PnL" is the
  *analytical universe* of Dashboard 3 → it stays in the warehouse (via an `in_cohort` flag).
  "Show the 10 assets with the highest %-long" is a *display* choice → the table stores all
  assets, the chart shows 10.

**Result:** the per-asset metrics for Dashboards 1 & 2 (volume surge, 30d relative strength,
OI dominance, OI 7d change, OI/mcap) are all just **different sorts of the same asset×day
population**, so they live as **columns of one wide fact, `fct_asset_metrics_daily`**.
Dashboard 3's positioning + flow collapse into `fct_asset_positioning_daily`. Six fact tables
(plus `dim_asset`) feed all ten charts.

---

## Shared building blocks

These are dbt **intermediate views** — internal plumbing, not consumed directly. They exist so
the fact tables stay thin and consistent.

### `dim_asset`
**Grain:** one row per asset (`coin`).
| Column | Type | Definition |
|---|---|---|
| `coin` | STRING | Uppercased Hyperliquid perp symbol (e.g. `BTC`). Primary key. |
| `cg_id` | STRING | CoinGecko id mapped from symbol (for mcap joins). |
| `name` | STRING | Human name from CoinGecko. |
| `market_cap_rank` | INT | Latest CoinGecko rank. |
| `is_stablecoin` | BOOL | Symbol in the stablecoin exclude-list (USDT/USDC/DAI/…). |
| `is_wrapped` | BOOL | Wrapped/staked derivative (WBTC/WETH/stETH/…). |

**Notes:** symbol→CoinGecko mapping is the one fuzzy join in the project (Hyperliquid uses
`BTC`, CoinGecko uses `bitcoin`). Maintain a small explicit override map for ambiguous tickers
(and HL's `k`-prefixed 1000× perps). Stablecoin/wrapped flags let every fact filter them out
consistently. `market_cap_rank` is denormalized into the per-asset facts so a component can
say "top-10 by mcap" without joining.

### `int_asset_daily` (the spine)
**Grain:** one row per `(coin, snapshot_date)`. Feeds `fct_asset_metrics_daily`.
| Column | Type | Source | Definition |
|---|---|---|---|
| `coin` | STRING | HL | Asset symbol. |
| `snapshot_date` | DATE | — | Logical pull day (partition key). |
| `mark_px` | FLOAT | HL ctxs | Mark price at snapshot. |
| `close_px` | FLOAT | HL candle | Daily close (preferred for returns; falls back to `mark_px`). |
| `open_interest_coins` | FLOAT | HL ctxs | OI in coin units. |
| `open_interest_usd` | FLOAT | derived | `open_interest_coins × mark_px` = **OI$**. |
| `volume_24h_usd` | FLOAT | HL ctxs `dayNtlVlm` | Trailing-24h notional volume at snapshot. |
| `funding_1h` | FLOAT | HL ctxs | Current 1h funding rate. |
| `market_cap_usd` | FLOAT | CoinGecko | Latest market cap (spot), joined via `dim_asset`. |

**Why a spine:** every Dashboard-1/2 metric is a window function over this table (`lag` for
day-over-day, 30-day offsets, `sum() over ()` for shares). Build it once; the fact adds the
derived columns on top.

### `int_trader_positions`
**Grain:** one row per `(trader_address, coin, snapshot_date)`. Feeds `fct_asset_positioning_daily`
and is exposed almost verbatim as `fct_trader_positions`.
| Column | Type | Definition |
|---|---|---|
| `trader_address` | STRING | Wallet from leaderboard. |
| `coin` | STRING | Position asset. |
| `snapshot_date` | DATE | Pull day. |
| `size_coins` | FLOAT | Signed position size (`szi`): **+ = long, − = short**. |
| `position_value_usd` | FLOAT | `abs(size_coins) × mark_px` (notional). |
| `signed_notional_usd` | FLOAT | `size_coins × mark_px` (**signed**: + long / − short). |
| `entry_px` | FLOAT | Average entry price. |
| `unrealized_pnl` | FLOAT | Unrealized PnL reported by HL. |
| `leverage` | FLOAT | Position leverage. |
| `direction` | STRING | `'long'` if `szi>0`, `'short'` if `szi<0`. |

---

## The fact tables

These are the clean, reusable tables the React app and Power BI actually consume. All are at
**all-assets / all-days** grain unless noted. No `rank`, no top-N — sort in the client.

### `fct_asset_metrics_daily`
**One wide per-asset daily fact — feeds five charts** across Dashboards 1 & 2 (hottest coins,
strongest coins, OI dominance treemap, OI 7d movers, OI/mcap leverage).
**Grain:** one row per `(coin, snapshot_date)` — all assets, all days.

| Column | Definition | Used by |
|---|---|---|
| `coin`, `snapshot_date` | keys | all |
| `mark_px`, `close_px` | price at snapshot / daily close | — |
| `volume_24h_usd` | trailing-24h notional volume | hottest |
| `volume_24h_usd_prev` | prior day's `volume_24h_usd` (`lag`) | hottest (raw input) |
| `vol_change_24h_pct` | `(volume_24h_usd − volume_24h_usd_prev) / volume_24h_usd_prev` | **hottest coins** (sort desc) |
| `open_interest_usd` | OI$ = `open_interest_coins × mark_px` | dominance, movers, oi/mcap |
| `oi_dominance` | `open_interest_usd / sum(open_interest_usd) over (partition by snapshot_date)` (0–1, sums to 1 per day) | **OI dominance treemap** (area) |
| `oi_change_24h_pct` | `(OI$_today − OI$_yesterday) / OI$_yesterday` | **OI dominance treemap** (color) |
| `open_interest_usd_7d_ago` | OI$ 7 days ago (`lag` 7) | movers (raw input) |
| `oi_change_7d_usd` | `open_interest_usd − open_interest_usd_7d_ago` | **OI 7d movers** (sort desc) |
| `oi_change_7d_pct` | same as % of 7d-ago | OI 7d movers |
| `close_px_7d_ago` | close 7 days ago | movers (raw input) |
| `price_change_7d_pct` | `(close_px / close_px_7d_ago) − 1` — pair with OI so "OI↑ & price↑ = new longs" | **OI 7d movers** |
| `market_cap_usd` | spot market cap (CoinGecko) | oi/mcap |
| `oi_mcap_ratio` | `open_interest_usd / market_cap_usd` — perp leverage vs spot size | **OI/mcap leverage bar** (sort desc) |
| `btc_close_px` | BTC daily close that day (for the ratio) | strongest (raw input) |
| `coin_btc_ratio` | `close_px / btc_close_px` | strongest (raw input) |
| `coin_btc_ratio_30d_ago` | same ratio 30 days ago | strongest (raw input) |
| `rs_30d` | `(coin_btc_ratio / coin_btc_ratio_30d_ago) − 1` — 30d outperformance vs BTC | **strongest coins** (sort desc) |
| `funding_1h` | current 1h funding rate | (bonus / tooltips) |
| `market_cap_rank` | CoinGecko rank (from `dim_asset`) | any "top-N by mcap" filter |
| `is_stablecoin`, `is_wrapped` | exclusion flags (from `dim_asset`) | client filters these out of rankings |

> ⚠️ **Metric correction — `rs_30d` (worth telling in an interview).** The spec said *"highest
> **avg** coin/btc ratio over 30d."* Taken literally that ranks by the **price level** of
> `coinPx/btcPx`, which is scale-dependent and meaningless (a \$0.40 coin always has a tiny
> ratio, a \$4,000 coin a large one — regardless of strength). "Strength" must measure
> **outperformance vs BTC**, so we store `rs_30d` = the 30-day change in the coin/BTC ratio.
> `+0.25` = beat BTC by 25%. (Alternative also defensible: mean daily BTC-relative return over
> 30d, `avg(ret_coin − ret_btc)` — decide in Phase 4.)

**Edge cases & filters (applied here, not per-chart):** keep `is_stablecoin`/`is_wrapped` rows
in the table (with flags) so the client decides; null-out change metrics when the prior/lag row
is missing (new listings, `oi_change_7d_usd` before 7 days of snapshots exist); guard divides
with `safe_divide`. A **min-volume / min-mcap floor** is *not* baked in — instead the client
filters on `volume_24h_usd` / `market_cap_usd` thresholds it prefers (the columns are right
there). `oi_dominance` must sum to ~1.0 per day (dbt reconciliation test).

### `fct_fear_greed`
**Feeds:** Fear & Greed gauge + line chart (Dashboard 1).
**Grain:** one row per `date`.
| Column | Source | Definition |
|---|---|---|
| `date` | Alternative.me | Index date. |
| `fng_value` | `data[].value` | 0–100 index. |
| `fng_classification` | `data[].value_classification` | `Extreme Fear`…`Extreme Greed`. |

**Logic:** pass-through of `GET api.alternative.me/fng/?limit=0` (full history in one call),
deduped by date. The "current" gauge = the client reads the max `date` (no `is_latest` flag
needed).

### `fct_btc_regime`
**Feeds:** BTC bull/bear regime badge + history (Dashboard 1).
**Grain:** one row per `snapshot_date` (BTC only).
| Column | Definition |
|---|---|
| `snapshot_date` | Day. |
| `regime` | `Bull` / `Bear` / `Range` / `Accumulation`. |
| `regime_confidence` | Posterior probability of the assigned state (0–1). |
| `model_version` | Version tag of the HMM params used (auditability across retrains). |

**Logic:** reuses your existing HMM regime model (Feature 3 / `src/features/engine`).
Recommended: a Python step computes the 6 regime features from BTC daily OHLCV+funding and runs
the trained HMM → `(regime, confidence)` per day → loaded raw → surfaced here, so the regime is
part of the automated warehouse. Warm-up: `regime = 'Unknown'` until enough history exists.

### `fct_asset_positioning_daily`
**One per-asset daily fact for the smart-money cohort — feeds two charts** (net positioning
stacked bar, daily inflow/outflow).
**Grain:** one row per `(coin, snapshot_date)` — every asset the cohort holds, all days.
**Cohort:** the **top-100 smart-money wallets by `smart_score`** (2-stage risk-adjusted ranking;
definitional universe — see `fct_trader_daily`).

| Column | Definition | Used by |
|---|---|---|
| `coin`, `snapshot_date` | keys | both |
| `cohort_size` | # traders in the cohort that day (100; stored so `pct_*` is auditable) | both |
| `n_long` | # cohort traders **net-long** this coin (per-trader `sum(signed_notional_usd) > 0`) | net positioning |
| `n_short` | # cohort traders net-short | net positioning |
| `n_flat` | `cohort_size − n_long − n_short` (not involved) | net positioning |
| `pct_long` | `n_long / cohort_size` | **net positioning** (sort desc to rank assets) |
| `pct_short` | `n_short / cohort_size` | net positioning |
| `pct_flat` | `n_flat / cohort_size` | net positioning |
| `cohort_net_notional_usd` | `sum(signed_notional_usd)` across the cohort (signed: + net-long) | inflow |
| `cohort_net_notional_prev` | same, yesterday (`lag`) | inflow (raw input) |
| `inflow_usd` | `cohort_net_notional_usd − cohort_net_notional_prev` (**+ = cohort added long exposure / inflow; − = reduced / outflow**) | **inflow/outflow** |
| `inflow_pct` | `inflow_usd / abs(cohort_net_notional_prev)` | inflow/outflow |
| `market_cap_rank` | from `dim_asset` — lets the client show "top-10 by mcap" | inflow/outflow filter |

**Logic:** per `(trader, coin)` sum `signed_notional_usd` → sign = that trader's net stance;
count stances across the cohort. **Denominator is the full cohort (100)**, so `pct_long +
pct_short + pct_flat = 1` and "not involved" is meaningful (that's the point of the stacked
bar). Computed for **all** held assets; the client sorts by `pct_long` (net positioning) or by
`market_cap_rank` then `inflow_usd` (inflow/outflow) and takes its top-N.

**Edge case — cohort churn (decide in Phase 4):** membership changes daily, so a naïve
`inflow_usd` conflates "trader entered cohort" with "trader added size." Prefer the
**fixed-cohort diff** (only addresses in *both* days' cohorts) and expose a churn count
separately; the simpler as-is diff is acceptable if documented.

### `fct_trader_daily`
**Feeds:** smart-money leaderboard (Dashboard 3).
**Grain:** one row per `(trader_address, snapshot_date)`.
| Column | Definition |
|---|---|
| `trader_address` | wallet |
| `snapshot_date` | day |
| `smart_score` | **0–1 composite ranking score** (client sorts by this) — see below |
| `sharpe_30d` | annualised risk-adjusted return of daily returns (mean/σ × √365) |
| `profit_factor_30d` | gross up-day P&L ÷ gross down-day P&L over the 30d equity curve (cap 5) |
| `max_drawdown_30d` | worst peak-to-trough of the 30d equity curve (negative; 0 = none, −1 = wiped out) |
| `roi_30d` / `pnl_30d_usd` / `volume_30d_usd` | 30-day return / PnL / traded volume (leaderboard `month`) |
| `win_rate_days_30d` | fraction of days with positive trading P&L |
| `volatility_30d` | annualised daily-return σ |
| `account_value_usd` | current account value |
| `alltime_pnl_usd` / `alltime_roi` | full-history PnL / ROI (leaderboard `allTime`) |
| `n_obs` | daily equity-curve points used (confidence input) |
| `composite` / `confidence` | the pre-shrink blend and the `clip(n_obs/21, .3, 1)` confidence weight |
| `stage1_rank_pnl` | where the wallet ranked by raw 30d PnL (shows the re-rank effect) |
| `n_open_positions` / `gross_exposure_usd` / `net_exposure_usd` | current open-book aggregates |
| `in_cohort` | TRUE for all loaded wallets (they ARE the cohort — selected in Python) |

**Logic — the cohort is a 2-stage risk-adjusted ranking, computed in the EXTRACT phase**
(`extract_load/extractors/smart_money.py`; full formulas in `ETL/Smart wallets leaderboard.ipynb`),
**not** a naive "sort by 30d PnL" (which just rewards account size and floods the top with
passive holders / stale accounts):
- **Stage 1** (free, whole leaderboard): drop the `-500.0` sentinel, require `accountValue > 0`
  AND `volume_30d > 0`, sort by 30d PnL, keep the top `SHORTLIST_SIZE` (500).
- **Stage 2** (one `portfolio` call each): build the 30-day daily equity curve → Sharpe,
  profit factor, max drawdown, ROI, win-rate; gate on `n_obs ≥ 10`.
- **Score:** percentile-rank each of 6 metrics, weight (70% skill: Sharpe+MaxDD+PF+ROI, 30%
  size: PnL+Volume), `composite × confidence` = `smart_score`; take the top `COHORT_SIZE` (100).

Because selection happens in Python, every loaded row is the cohort (`in_cohort = TRUE`); dbt
only joins current positions and passes `smart_score`/metrics through. The client sorts by
`smart_score`. Some wallets hold 0 positions right now → `n_open_positions = 0` (expected).

### `fct_trader_positions`
**Feeds:** the expandable "positions" detail under each trader (Dashboard 3), and is the source
for `fct_asset_positioning_daily`.
**Grain / columns:** identical to [`int_trader_positions`](#int_trader_positions) (exposed as a
consumable fact), optionally joined to `in_cohort` so the client can show only cohort traders'
books.

---

## Chart → table map

Every chart is a **sort/filter of one clean table** — no chart-specific tables exist.

| Dashboard | Chart | Table | Client does |
|---|---|---|---|
| 1 Market Overview | BTC regime badge | `fct_btc_regime` | latest row |
| 1 | Fear & Greed gauge + line | `fct_fear_greed` | latest + time series |
| 1 | Hottest 5 coins | `fct_asset_metrics_daily` | latest day, sort `vol_change_24h_pct` desc, take 5 |
| 1 | Strongest 5 coins | `fct_asset_metrics_daily` | latest day, sort `rs_30d` desc, take 5 |
| 2 Capital Rotation | OI dominance treemap | `fct_asset_metrics_daily` | latest day, `oi_dominance` (area) + `oi_change_24h_pct` (color) |
| 2 | Top OI movers (7d) | `fct_asset_metrics_daily` | latest day, sort `oi_change_7d_usd` desc, take 5, show `price_change_7d_pct` |
| 2 | OI/mcap leverage bar | `fct_asset_metrics_daily` | latest day, sort `oi_mcap_ratio` desc, take 5 |
| 3 Smart Money | Smart-money leaderboard + positions | `fct_trader_daily` (+ `fct_trader_positions`) | filter `in_cohort`, sort `smart_score` desc |
| 3 | Net positioning stacked bar | `fct_asset_positioning_daily` | latest day, sort `pct_long` desc, take 10 |
| 3 | Daily inflow/outflow | `fct_asset_positioning_daily` | latest day, filter `market_cap_rank ≤ 10`, show `inflow_usd`/`inflow_pct` |

---

## Cross-cutting notes & gotchas

- **Units:** Hyperliquid `openInterest` is in **coin units** — always multiply by `mark_px`
  for USD. `dayNtlVlm` is already USD notional. `szi` is signed size in coin units.
- **Symbol mapping** (HL `BTC` ↔ CoinGecko `bitcoin`) is the main join risk — keep the override
  map in `dim_asset`, prefer joining by CoinGecko `id`, and add a dbt test that fails if a
  **top-OI or top-mcap** asset is missing its mcap. Long-tail misses (low-mcap perps) are fine.
- **OI history is not backfillable** (HL exposes only current OI) — `oi_change_24h_pct` and
  `oi_change_7d_usd` are `NULL` until the pipeline has accumulated 2 / 8 daily snapshots. See
  [`VERIFICATION.md`](VERIFICATION.md). Start the daily job early.
- **Snapshot semantics:** daily snapshots, not tick data. "24h volume" = HL's trailing-24h
  figure *at snapshot time*; day-over-day deltas compare snapshots. Document the cron hour.
- **Timezone:** everything keys on **UTC** `snapshot_date`; keep the cron hour fixed so
  `lag`-based math is consistent.
- **Filtering is the client's job, thresholds are its choice:** stablecoin/wrapped flags and
  raw `volume`/`mcap` columns travel in the facts so React/Power BI apply whatever floors and
  exclusions each component wants — the warehouse doesn't pre-decide.
- **History depth:** BigQuery sandbox expires partitions at 60 days. 30d-lookback metrics work
  fine; for >60d history attach billing or periodically export raw to GCS as Parquet and reload.
