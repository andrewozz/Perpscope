# ETL Feasibility Verification — Results

> **Purpose:** before building, prove every data source is reachable and every chart's
> calculation is computable. Ran live against production APIs on **2026-07-04**. All six
> sources returned data; all 10 charts (6 fact tables) are feasible. This document records the confirmed
> endpoint shapes, the calculations that succeeded, and the **two real constraints** the
> build must design around.
>
> Reproduce with `ETL/../scratchpad/verify_apis.py` + `verify_part2.py` (stdlib + `requests`).

---

## Verdict: ✅ the pipeline idea is sound

| # | Source | Endpoint (confirmed working) | Returned | Feeds |
|---|---|---|---|---|
| 1 | Hyperliquid ctxs | `POST /info {"type":"metaAndAssetCtxs"}` | **231 assets**, each with `markPx`, `openInterest`, `dayNtlVlm`, `funding` | OI dominance, OI/mcap, hottest, movers |
| 2 | Hyperliquid candles | `POST /info {"type":"candleSnapshot","req":{coin,interval:"1d",...}}` | daily OHLCV, keys `t,T,s,i,o,c,h,l,v,n` | strongest coins, 7d price, regime |
| 3 | Hyperliquid leaderboard | `GET stats-data.hyperliquid.xyz/Mainnet/leaderboard` | **40,218 rows**, `windowPerformances` = day/week/**month**/allTime | top-100 traders |
| 4 | Hyperliquid positions | `POST /info {"type":"clearinghouseState","user":addr}` | `assetPositions[]` with `szi`, `positionValue`, `unrealizedPnl`, `leverage` | positions, net positioning, inflow/outflow |
| 5 | CoinGecko | `GET /coins/markets?order=market_cap_desc&per_page=250` | market cap by symbol | OI/mcap, top-by-mcap |
| 6 | Alternative.me | `GET /fng/?limit=N` | F&G value + classification, daily history | fear/greed |

---

## Calculations proven with live data

Actual numbers observed on 2026-07-04 (BTC ≈ \$62,472):

Each bullet notes the fact table + column the calc feeds (see [Data Dictionary](DATA_DICTIONARY.md)):

- **`fct_asset_metrics_daily.oi_dominance`** ✅ — BTC 30.56%, HYPE 21.72%, ETH 19.50%,
  SOL 7.05%, ZEC 3.04%. Dominance across all 231 assets **sums to exactly 1.0000** → treemap valid.
- **`fct_asset_metrics_daily.oi_mcap_ratio`** ✅ — HYPE 0.098, NEAR 0.030, ZEC 0.028 (OI$ ÷ mcap).
- **`fct_asset_metrics_daily.rs_30d`** ✅ — 30d relative-strength vs BTC: SOL +21.4%,
  HYPE +12.1%, ETH +1.5% — computed purely from daily candles.
- **`fct_asset_metrics_daily.price_change_7d_pct`** ✅ — SOL +16.1%, HYPE +14.6%, ETH +11.8%.
- **`fct_asset_positioning_daily`** (net positioning) ✅ — across a real 40-trader cohort:
  BTC 10 long / 8 short / 22 flat (25% long), HYPE 22% long. `pct_long+pct_short+pct_flat = 1` per asset.
- **`fct_asset_positioning_daily`** (inflow basis) ✅ — cohort net notional: HYPE net −\$60.7M
  (crowd net-short), SOL −\$21.1M, BTC −\$16.5M. (Daily *delta* of this = `inflow_usd`.)
- **`fct_trader_daily`** ✅ — top 100 by 30d PnL; #1 = \$133.4M.
- **`fct_fear_greed`** ✅ — latest = 22 (Extreme Fear), with history.

---

## ⚠️ Constraint 1 — Open Interest history is NOT backfillable (design around it)

Hyperliquid's API returns **only the current OI** (`metaAndAssetCtxs`). There is **no OI
history endpoint**, and candles carry price+volume but **not** OI. Therefore:

- **OI-delta columns** — `oi_change_24h_pct`, `oi_change_7d_usd` in `fct_asset_metrics_daily` —
  can only be computed **once the pipeline has accumulated its own daily OI snapshots.**
- **Day 1:** OI *levels* work (`oi_dominance`, `oi_mcap_ratio`) but OI *changes* are `NULL`.
  **Day 2:** 24h OI change becomes available. **Day 8:** 7d OI movers become available.
- **Implication for the build:** start the daily snapshot job **as early as possible** so
  history accrues. The facts must handle "no prior snapshot yet" gracefully (`NULL` / render
  "new"), and we should **not** promise 7d OI charts until a week of snapshots exists.
- Same logic applies to `vol_change_24h_pct` (hottest coins) and `inflow_usd` in
  `fct_asset_positioning_daily` (day-over-day net-notional delta): they compare **snapshots**.
  - **Mitigation for hottest coins:** the daily candle `v` field gives backfillable daily
    volume, so 24h/Nd volume-surge *can* be seeded from candle history instead of waiting for
    two snapshots. OI has no such fallback.

**This is not a blocker** — it's the whole reason the pipeline snapshots daily. But it means
the OI/flow dashboards populate over the first week rather than instantly. Worth stating in the
app UI ("OI trend data accrues daily").

---

## ⚠️ Constraint 2 — Symbol mapping (Hyperliquid ↔ CoinGecko)

Joining HL perps to CoinGecko market caps by raw symbol is lossy:
- Top-50 CoinGecko only matched **27/231**; widening to **500 coins + a small override map**
  raised it to **135/231**.
- Causes: HL uses **`k`-prefixed** tickers for 1000× perps (`kPEPE`, `kBONK`, `kSHIB`),
  **renamed** tokens (`MATIC`→POL, `RNDR`→RENDER, `FTM`→S), and low-mcap/delisted long-tail
  perps with no CoinGecko listing.
- **The 96 unmatched are all low-mcap perps the client filters out of rankings anyway** — every
  asset we actually rank on (top by OI, top by mcap) matched.
- **Build decision:** map via a maintained `dim_asset` override table, prefer joining on
  **CoinGecko `id`** (not symbol) for the assets we care about, and add a dbt test that fails
  if a *top-OI or top-mcap* asset is missing its mcap. Long-tail misses are acceptable.

---

## Other confirmed facts worth remembering

- **Leaderboard is huge (40k rows) and pre-sorted by its own metric** → we pull it once and
  **re-rank client-side by `windowPerformances.month.pnl`** for our top-100-by-30d-PnL cohort.
  `month` is Hyperliquid's ~30-day window.
- **Some top-PnL traders hold 0 open positions** (all-cash). In a 40-trader sample, **25 had
  ≥1 position.** The cohort aggregation is robust to this (flat traders count toward "not
  involved"), but it confirms the **denominator must be the full cohort (100)**, not just
  traders with positions.
- **100 `clearinghouseState` calls/day** (one per top trader) is well within rate limits; add
  a ~150 ms polite delay between calls (the verification used 0.15 s with no throttling).
- **Candle history depth:** a 35-day request returned 36 daily candles. 30-day-lookback metrics
  are fine; deep history (multi-year regime training) still uses the existing Binance dataset
  from Feature 3, not Hyperliquid.

---

## Net conclusion

Every source works, every calculation is proven, and the only real constraints are
**time-based (OI/flow history accrues over the first days/week)** and **a symbol-mapping
override map** — both already accounted for in the [Data Dictionary](DATA_DICTIONARY.md). The
build can proceed to Phase 1.
