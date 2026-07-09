# PerpScope Market Analytics — ETL Pipeline Manual

> **What this is:** a complete, build-it-yourself manual for the automated ETL pipeline
> that powers PerpScope's new **Market Analytics** feature (React app) and a **Power BI**
> dashboard. It is written so you can implement it **one phase at a time** — each phase has
> an explanation ("why"), the concrete code/config ("how"), and a **Definition of Done**.
>
> **Audience:** you, building a data-analytics-engineer résumé piece. Every tool chosen here
> is one that appears in real analytics-engineer job posts: **Python extraction, BigQuery
> warehouse, dbt transformations, GitHub Actions orchestration (CI/CD), dimensional modeling,
> Power BI**.

---

## 0. Table of Contents

1. [The 10,000-ft picture](#1-the-10000-ft-picture)
2. [Tech stack & why each piece](#2-tech-stack--why-each-piece)
3. [The three dashboards we are building toward](#3-the-three-dashboards-we-are-building-toward)
4. [Repository / folder layout](#4-repository--folder-layout)
5. [Data architecture: raw → staging → marts (the layers)](#5-data-architecture-raw--staging--marts-the-layers)
6. [Phase-by-phase build roadmap](#6-phase-by-phase-build-roadmap)
7. [Phase 1 — Google Cloud & BigQuery setup](#phase-1--google-cloud--bigquery-setup)
8. [Phase 2 — Extract (Python)](#phase-2--extract-python)
9. [Phase 3 — Load into BigQuery (raw)](#phase-3--load-into-bigquery-raw)
10. [Phase 4 — Transform with dbt (staging → marts)](#phase-4--transform-with-dbt-staging--marts)
11. [Phase 5 — Orchestrate daily with GitHub Actions](#phase-5--orchestrate-daily-with-github-actions)
12. [Phase 6 — Serve to the React app (static JSON export)](#phase-6--serve-to-the-react-app-static-json-export)
13. [Phase 7 — Power BI dashboard](#phase-7--power-bi-dashboard)
14. [Data quality, testing & monitoring](#8-data-quality-testing--monitoring)
15. [Cost & free-tier limits](#9-cost--free-tier-limits)
16. [Appendix: the metric/data dictionary](#10-appendix-the-metricdata-dictionary)

---

## 1. The 10,000-ft picture

```
                          ┌────────────────────────────────────────────────────────┐
                          │                    DAILY (GitHub Actions cron)           │
                          └────────────────────────────────────────────────────────┘

  SOURCES                    EXTRACT + LOAD (Python)          TRANSFORM (dbt on BigQuery)
  ─────────                  ───────────────────────          ───────────────────────────
  Hyperliquid  ┐                                              perpscope_raw   (landing)
  CoinGecko    ├──►  python extract_load/main.py  ──►  load  ──►   perpscope_staging (stg_*)
  Alternative.me(F&G)           │                             perpscope_marts   (fct_*/dim_*)
                                │                                        │
                                ▼                                        │
                        raw JSON rows tagged                             │
                        with snapshot_date                               │
                                                                         ▼
                                                       ┌─────────────────┴──────────────────┐
                                                       │                                     │
                                              EXPORT (SQL → JSON)                  Power BI (native
                                              export/export_marts.py              BigQuery connector,
                                                       │                          scheduled refresh)
                                                       ▼
                                              public JSON files
                                              (GCS bucket / repo)
                                                       │
                                                       ▼
                                              React app  fetch()
                                              (Market Analytics feature)
```

**One sentence:** every day a scheduled job pulls fresh market data, drops it *raw* into
BigQuery, dbt cleans and reshapes it into **fact/dimension tables**, and the finished marts
feed two consumers — a **Power BI** dashboard (live SQL connection) and the **React app**
(via a nightly JSON export).

**Why this shape (ELT, not ETL):** we **E**xtract, **L**oad raw first, then **T**ransform
*inside the warehouse* with SQL/dbt. This is the modern pattern (ELT) and it's what BigQuery
+ dbt are built for. We still call the folder `ETL` because that's the umbrella term you used,
but architecturally it's ELT. Worth a sentence in your résumé: *"Built an ELT pipeline
(Python → BigQuery → dbt)."*

---

## 2. Tech stack & why each piece

| Layer | Tool | Why (and the résumé line it earns you) |
|---|---|---|
| Extraction | **Python 3.11 + `requests`** | Universal for API pulls. Simple, testable. |
| Data warehouse | **Google BigQuery (sandbox/free)** | Serverless, 10 GB storage + 1 TB query/month free — our data is tiny (KBs/day). Columnar, SQL-native. |
| Load | **`google-cloud-bigquery` client** | Loads newline-delimited JSON straight into partitioned raw tables. |
| Transform | **dbt Core** (`dbt-bigquery`) | *The* analytics-engineering tool: layered SQL models, tests, docs, lineage graph. This is the single strongest signal on the résumé. |
| Orchestration | **GitHub Actions (cron)** | Free, YAML, lives in the repo. Demonstrates CI/CD + scheduling. |
| Serving → app | **Static JSON export** to a public GCS bucket | Keyless & free; matches how PerpScope already fetches data client-side. |
| Serving → BI | **Power BI Desktop/Service** | Native BigQuery connector, scheduled refresh. |
| Version control / secrets | **Git + GitHub Secrets** | Service-account key stored as an encrypted secret, never in code. |

> **A note on "free":** BigQuery **sandbox** (no billing account attached) is genuinely free
> but tables get a 60-day expiration and you can't use streaming inserts. We avoid streaming
> (we use batch load jobs) and we set explicit partition expirations, so sandbox is fine for a
> résumé project. If you attach a billing account you stay inside the free tier anyway at this
> data volume. Detail in [§9](#9-cost--free-tier-limits).

---

## 3. The three dashboards we are building toward

Every mart table exists to feed one specific chart. Keep this mapping in mind — it's the
"north star" for the whole warehouse. Full metric math is in the [Data Dictionary](#10-appendix-the-metricdata-dictionary).

Charts don't get their own tables — each is a **sort/filter of a clean fact** (see the
[Data Dictionary](docs/DATA_DICTIONARY.md)). Six facts + `dim_asset` feed all ten charts.

### Dashboard 1 — Market Overview
| Chart | Fact table | Client does |
|---|---|---|
| BTC market regime (bull/bear) | `fct_btc_regime` | latest row (HMM label + confidence) |
| Fear / Greed index + history | `fct_fear_greed` | latest + time series |
| Hottest 5 coins today | `fct_asset_metrics_daily` | sort `vol_change_24h_pct` desc, take 5 |
| Strongest 5 coins (30d) | `fct_asset_metrics_daily` | sort `rs_30d` desc, take 5 (refined from "avg coin/btc ratio") |

### Dashboard 2 — Capital Rotation (Open Interest)
| Chart | Fact table | Client does |
|---|---|---|
| Treemap: OI dominance | `fct_asset_metrics_daily` | `oi_dominance` (area) + `oi_change_24h_pct` (color) |
| Top 5 OI increases (7d) | `fct_asset_metrics_daily` | sort `oi_change_7d_usd` desc, take 5, show `price_change_7d_pct` |
| Bar: highest OI/mcap ratio | `fct_asset_metrics_daily` | sort `oi_mcap_ratio` desc, take 5 |

### Dashboard 3 — Smart Money Analytics (top 100 traders, 30d)
| Chart | Fact table | Client does |
|---|---|---|
| Top 100 trader stats + positions | `fct_trader_daily` (+ `fct_trader_positions`) | filter `in_cohort`, sort `pnl_30d_usd` desc |
| Net positioning by asset (stacked bar) | `fct_asset_positioning_daily` | sort `pct_long` desc, take 10 |
| Daily inflow/outflow (top 10 by mcap) | `fct_asset_positioning_daily` | filter `market_cap_rank ≤ 10`, show `inflow_usd`/`inflow_pct` |

---

## 4. Repository / folder layout

Everything ETL lives in `PerpScope/ETL/`, **except** the GitHub Actions workflow, which
*must* live at the repo root under `.github/workflows/` (GitHub only reads workflows there).

```
PerpScope/
├── .github/
│   └── workflows/
│       └── market_analytics_etl.yml     # Phase 5 — daily cron
│
├── ETL/
│   ├── README.md                        # ← this manual
│   ├── docs/
│   │   └── DATA_DICTIONARY.md            # every metric's exact definition + SQL sketch
│   │
│   ├── extract_load/                    # Phase 2 & 3 — Python E+L
│   │   ├── extractors/
│   │   │   ├── hyperliquid.py           # asset ctxs (OI/vol/funding), candles, leaderboard, positions
│   │   │   ├── coingecko.py             # market caps, top-by-mcap universe
│   │   │   └── feargreed.py             # Alternative.me F&G index
│   │   ├── load_bigquery.py             # generic raw-JSON → BigQuery loader
│   │   ├── main.py                      # runs all extractors, then loads
│   │   ├── config.py                    # dataset names, asset universe, constants
│   │   └── requirements.txt
│   │
│   ├── dbt/                             # Phase 4 — transformations
│   │   ├── dbt_project.yml
│   │   ├── profiles.yml                 # (uses env vars; real secret only in CI)
│   │   ├── packages.yml                 # dbt_utils
│   │   └── models/
│   │       ├── staging/
│   │       │   ├── _sources.yml         # declares perpscope_raw tables + freshness
│   │       │   ├── _staging.yml         # column tests/docs
│   │       │   ├── stg_hl_asset_ctxs.sql
│   │       │   ├── stg_hl_candles.sql
│   │       │   ├── stg_hl_leaderboard.sql
│   │       │   ├── stg_hl_positions.sql
│   │       │   ├── stg_cg_markets.sql
│   │       │   └── stg_feargreed.sql
│   │       ├── intermediate/
│   │       │   ├── int_asset_daily.sql          # one row per asset per day (price/vol/OI/funding/mcap)
│   │       │   └── int_trader_positions.sql     # tidy per-trader-per-asset positions
│   │       ├── marts/                   # clean reusable facts (6 tables feed all 10 charts)
│   │       │   ├── dim_asset.sql
│   │       │   ├── fct_asset_metrics_daily.sql     # Dashboards 1 & 2 (5 charts, per asset)
│   │       │   ├── fct_fear_greed.sql              # Dashboard 1
│   │       │   ├── fct_btc_regime.sql              # Dashboard 1
│   │       │   ├── fct_asset_positioning_daily.sql # Dashboard 3 (net positioning + inflow)
│   │       │   ├── fct_trader_daily.sql            # Dashboard 3 (top-100 stats)
│   │       │   └── fct_trader_positions.sql        # Dashboard 3 (positions detail)
│   │       └── _marts.yml               # tests + descriptions for facts
│   │
│   └── export/                         # Phase 6 — marts → static JSON for React
│       └── export_marts.py
│
└── src/features/market/                # (React side, built later as its own feature)
    └── data/                           # OR fetched from the public GCS bucket
```

---

## 5. Data architecture: raw → staging → marts (the layers)

This is the heart of "analytics engineering." Three BigQuery **datasets**, three purposes.

### 5.1 `perpscope_raw` — the landing zone
- **Purpose:** land API responses *exactly as received*, with minimal parsing. Never
  transformed. This is your audit trail and lets you re-run transformations without re-hitting
  APIs.
- **Every raw table has these bookkeeping columns:**
  - `snapshot_date` (DATE) — the logical day of the pull; **the partition key**.
  - `_loaded_at` (TIMESTAMP) — when the row was loaded.
  - `payload` (JSON/STRING) — the raw object, plus the fields we flatten for convenience.
- **Partitioning:** partition by `snapshot_date` so every query and every dbt incremental
  model scans only the days it needs (keeps you deep inside the free query tier).
- **Tables:** `raw_hl_asset_ctxs`, `raw_hl_candles`, `raw_hl_leaderboard`,
  `raw_hl_positions`, `raw_cg_markets`, `raw_feargreed`.

### 5.2 `perpscope_staging` — clean, typed, renamed (dbt views)
- **Purpose:** one staging model per raw table. **1:1** with the source — no joins, no
  business logic. Just: cast types, rename to snake_case, deduplicate to the latest load per
  day, parse the JSON payload into real columns.
- Materialized as **views** (cheap, always fresh).
- Naming: `stg_<source>_<entity>`.

### 5.3 `perpscope_marts` — the analytics layer (dbt tables)
- **Purpose:** business logic lives here. Two sub-kinds:
  - **Dimensions** (`dim_asset`) — descriptive attributes (symbol, name, is_stablecoin…).
  - **Facts** (`fct_*`) — clean, insightful, **reusable** tables at all-assets/all-days grain.
- Materialized as **tables** (fast for BI/JSON export). Small enough to fully rebuild daily;
  we can switch the heavy ones to **incremental** later.
- **The `int_` (intermediate) models** sit between staging and facts to hold reusable
  building blocks — most importantly `int_asset_daily`, the **one-row-per-asset-per-day**
  spine that `fct_asset_metrics_daily` builds on.
- **Facts store the full population; the client sorts and slices.** A fact holds *every* asset
  at its grain plus every column a component might sort or filter on — **no `rank`, no `LIMIT`,
  no top-N in the warehouse.** React and Power BI apply `ORDER BY` / `LIMIT` / "top 10"
  themselves, so one component wanting top 20 (or a watchlist) needs no schema change. Only
  *definitional* filters (e.g. the top-100-trader cohort, via an `in_cohort` flag) live in the
  warehouse. That's why the 10 charts need just **6 facts** — the Dashboard-1/2 per-asset
  metrics are all columns of one wide `fct_asset_metrics_daily`. Full column-level detail:
  [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md).

**The dependency flow (dbt builds this lineage graph for you):**
```
raw ──► stg_* (views) ──► int_asset_daily ┐
                          int_trader_positions ┤──► fct_* (tables) ──► JSON / Power BI
                          dim_asset ────────────┘
```

---

## 6. Phase-by-phase build roadmap

Build in this order. **Each phase is independently testable** — you'll prompt me to do them
one at a time, and we'll confirm the Definition of Done before moving on.

| Phase | What you get | Depends on | Prompt me with |
|---|---|---|---|
| **1. Cloud setup** | GCP project, BigQuery datasets, service account key | — | "Do Phase 1" (mostly a checklist you run; I generate scripts) |
| **2. Extract** | Python extractors that print clean records from every API | 1 | "Build the extractors" |
| **3. Load** | Raw tables populated in `perpscope_raw` | 1, 2 | "Build the BigQuery loader" |
| **4. Transform** | dbt project: staging → int → 6 reusable facts | 3 | "Build the dbt models" (we'll do staging, then the facts) |
| **5. Orchestrate** | GitHub Actions runs the whole thing daily | 2–4 | "Wire up GitHub Actions" |
| **6. Serve → React** | Nightly JSON export the app can fetch | 4, 5 | "Build the JSON export" |
| **7. Power BI** | Dashboard connected to BigQuery marts | 4 | "Help me build the Power BI dashboard" |

> We do NOT build the React UI in this manual — that's a separate PerpScope feature you'll
> spec later (like your other features). This manual's job is to make the **data** exist,
> correct and automated. Phase 6 just makes it fetchable.

The rest of this document is the detailed reference for each phase. Skim it now; we'll go deep
phase-by-phase when you prompt.

---

## Phase 1 — Google Cloud & BigQuery setup

**Goal:** an empty but ready warehouse + credentials the pipeline can use.

**Steps (you do these once in the browser + gcloud):**
1. Create a Google Cloud project, e.g. `perpscope-analytics`.
2. Enable the **BigQuery API**.
3. Create three datasets (region `US` to stay in free tier), we'll script this:
   - `perpscope_raw`, `perpscope_staging`, `perpscope_marts`.
4. Create a **service account** `etl-runner` with roles **BigQuery Data Editor** +
   **BigQuery Job User**. Download its JSON key **once**.
5. Store that key as a **GitHub Secret** named `GCP_SA_KEY` (Phase 5 uses it). For local dev,
   save it outside the repo and point `GOOGLE_APPLICATION_CREDENTIALS` at it.

**Scripted dataset creation** (`ETL/extract_load/setup_datasets.py`, generated in Phase 1):
```python
from google.cloud import bigquery

client = bigquery.Client()  # uses GOOGLE_APPLICATION_CREDENTIALS
for name in ["perpscope_raw", "perpscope_staging", "perpscope_marts"]:
    ds = bigquery.Dataset(f"{client.project}.{name}")
    ds.location = "US"
    client.create_dataset(ds, exists_ok=True)
    print("ready:", name)
```

**Definition of Done:** `bq ls` shows the three datasets; `python setup_datasets.py` runs
clean; the service-account key is in GitHub Secrets and gitignored locally.

> ⚠️ **Security:** the key file must NEVER be committed. We add `*.json` key patterns to
> `.gitignore` and only ever pass the key via env var / GitHub Secret.

---

## Phase 2 — Extract (Python)

**Goal:** for each source, a function that returns a **list of flat dict records** for today,
already tagged with `snapshot_date`. No BigQuery yet — extractors just return data (easy to
unit-test / print).

### 2.1 The sources & endpoints

| Source | Endpoint | Gives us | Feeds |
|---|---|---|---|
| Hyperliquid | `POST api.hyperliquid.xyz/info` `{"type":"metaAndAssetCtxs"}` | per-asset: `markPx`, `oraclePx`, `openInterest`, `dayNtlVlm` (24h volume), `funding`, `premium` | hottest coins, OI dominance, OI/mcap, OI movers |
| Hyperliquid | `POST /info` `{"type":"candleSnapshot","req":{"coin","interval":"1d","startTime","endTime"}}` | daily OHLCV per asset | strongest coins, 7d price change, regime |
| Hyperliquid | `GET stats-data.hyperliquid.xyz/Mainnet/leaderboard` | leaderboard rows: address + windowed PnL/volume (day/week/month/allTime) | top-100 traders |
| Hyperliquid | `POST /info` `{"type":"clearinghouseState","user":"0x…"}` | one trader's open positions (coin, szi, entryPx, positionValue, unrealizedPnl, leverage) | positions, net positioning, inflow/outflow |
| CoinGecko | `GET /api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250` | market cap, symbol, rank | OI/mcap ratio, top-10-by-mcap, symbol mapping |
| Alternative.me | `GET api.alternative.me/fng/?limit=0` | Fear & Greed index history | F&G chart |

> **Verify-before-trust:** endpoint shapes drift. In Phase 2 the very first thing each
> extractor does is a live call whose JSON we print and eyeball before wiring it in. The
> Hyperliquid leaderboard host in particular has changed before — we confirm it live.
> Your existing `src/api/*.ts` files already prove the CoinGecko + Hyperliquid `/info` shapes.

### 2.2 Extractor contract (every extractor follows this)
```python
# extract_load/extractors/hyperliquid.py  (representative shape — full version in Phase 2)
import requests, datetime as dt

INFO_URL = "https://api.hyperliquid.xyz/info"

def _today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()

def fetch_asset_ctxs() -> list[dict]:
    """One record per perp asset: OI, 24h volume, funding, mark/oracle price."""
    r = requests.post(INFO_URL, json={"type": "metaAndAssetCtxs"}, timeout=30)
    r.raise_for_status()
    meta, ctxs = r.json()                 # [ {universe:[...]}, [ctx, ctx, ...] ]
    universe = meta["universe"]
    snap = _today()
    records = []
    for asset, ctx in zip(universe, ctxs):
        records.append({
            "snapshot_date": snap,
            "coin": asset["name"],
            "mark_px": float(ctx["markPx"]),
            "oracle_px": float(ctx["oraclePx"]),
            "open_interest": float(ctx["openInterest"]),   # in coin units
            "day_ntl_vlm": float(ctx["dayNtlVlm"]),        # 24h notional USD volume
            "funding": float(ctx["funding"]),
            "premium": float(ctx.get("premium") or 0),
        })
    return records
```

Each extractor exposes small pure functions returning `list[dict]`. `main.py` calls them.

**Definition of Done:** `python -m extract_load.main --dry-run` prints record counts and a sample
row per source (e.g. "asset_ctxs: 210 rows", "leaderboard: 100 rows", "positions: 100 users",
"cg_markets: 250 rows", "feargreed: 1 row"). No BigQuery writes yet.

---

## Phase 3 — Load into BigQuery (raw)

**Goal:** push each extractor's records into its `perpscope_raw.raw_*` table as a **batch
load job**, partitioned by `snapshot_date`, **idempotent** (re-running the same day replaces
that day, never duplicates).

### 3.1 Idempotency strategy: `WRITE_TRUNCATE` per partition
Because the DAG may re-run, we must not double-insert. Two clean options:
- **Partition decorator load** — load into `raw_table$YYYYMMDD` with `WRITE_TRUNCATE`, which
  atomically replaces just today's partition. **This is what we use.**
- (Alternative: `MERGE`/delete-then-insert — more code, unnecessary here.)

### 3.2 The generic loader
```python
# extract/load_bigquery.py  (representative)
from google.cloud import bigquery

def load_records(client, dataset, table, records, snapshot_date, schema):
    """Batch-load today's records, replacing only today's partition (idempotent)."""
    if not records:
        print(f"skip {table}: no records"); return
    part = snapshot_date.replace("-", "")                 # 'YYYYMMDD'
    table_id = f"{client.project}.{dataset}.{table}${part}"
    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition="WRITE_TRUNCATE",               # replace this partition only
        time_partitioning=bigquery.TimePartitioning(field="snapshot_date"),
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    job = client.load_table_from_json(records, table_id, job_config=job_config)
    job.result()
    print(f"loaded {len(records)} → {dataset}.{table} [{part}]")
```

`main.py` wires extract → load for every source in one run, adding `_loaded_at` and stamping
`snapshot_date`.

**Definition of Done:** after one run, `SELECT snapshot_date, COUNT(*) FROM
perpscope_raw.raw_hl_asset_ctxs GROUP BY 1` shows today's row count; re-running the job keeps
the count identical (idempotent).

---

## Phase 4 — Transform with dbt (staging → marts)

**Goal:** the 6 fact tables (feeding all 10 charts), built by dbt, tested, documented. This is
the biggest phase; we'll do it in sub-steps: **(a) project init + sources, (b) staging,
(c) `int_asset_daily` + `dim_asset`, (d) `fct_asset_metrics_daily` (Dashboards 1 & 2) +
`fct_fear_greed` + `fct_btc_regime`, (e) `fct_asset_positioning_daily` + `fct_trader_daily` +
`fct_trader_positions` (Dashboard 3).**

### 4.1 Project config
```yaml
# ETL/dbt/dbt_project.yml
name: perpscope
version: "1.0.0"
profile: perpscope
model-paths: ["models"]
models:
  perpscope:
    staging:      { +materialized: view,  +schema: staging }
    intermediate: { +materialized: view,  +schema: staging }
    marts:        { +materialized: table, +schema: marts }
```
```yaml
# ETL/dbt/profiles.yml  — credentials come from env vars (real key only in CI)
perpscope:
  target: prod
  outputs:
    prod:
      type: bigquery
      method: service-account
      keyfile: "{{ env_var('GOOGLE_APPLICATION_CREDENTIALS') }}"
      project: "{{ env_var('GCP_PROJECT') }}"
      dataset: perpscope_marts          # default; per-layer +schema overrides it
      location: US
      threads: 4
```

### 4.2 Declare sources (with freshness checks)
```yaml
# models/staging/_sources.yml
version: 2
sources:
  - name: raw
    schema: perpscope_raw
    tables:
      - name: raw_hl_asset_ctxs
        loaded_at_field: _loaded_at
        freshness:                       # alert if today's load didn't happen
          warn_after:  { count: 26, period: hour }
          error_after: { count: 48, period: hour }
      - name: raw_hl_candles
      - name: raw_hl_leaderboard
      - name: raw_hl_positions
      - name: raw_cg_markets
      - name: raw_feargreed
```

### 4.3 Staging example (dedupe to latest load per day, cast, rename)
```sql
-- models/staging/stg_hl_asset_ctxs.sql
with src as (
    select *,
           row_number() over (
             partition by snapshot_date, coin order by _loaded_at desc
           ) as rn
    from {{ source('raw', 'raw_hl_asset_ctxs') }}
)
select
    snapshot_date,
    upper(coin)                       as coin,
    cast(mark_px       as float64)    as mark_px,
    cast(open_interest as float64)    as open_interest_coins,
    mark_px * open_interest           as open_interest_usd,   -- notional OI
    cast(day_ntl_vlm   as float64)    as volume_24h_usd,
    cast(funding       as float64)    as funding_1h
from src
where rn = 1                           -- keep only the freshest load for the day
```

### 4.4 The spine: `int_asset_daily`
One row per `(coin, snapshot_date)` combining ctxs + candle close + CoinGecko mcap. Feeds the
wide fact below. (Full SQL delivered in Phase 4c.)

### 4.5 Facts — clean, reusable, all-assets/all-days (no top-N)
Six facts feed all ten charts; each chart is a **client-side sort** of a fact (full column
math in the [Data Dictionary](docs/DATA_DICTIONARY.md)). The Dashboard-1/2 per-asset metrics
are all columns of **one** wide fact — no per-chart tables, no `rank`, no `LIMIT`:

```sql
-- models/marts/fct_asset_metrics_daily.sql   (one wide fact -> 5 charts)
with d as (select * from {{ ref('int_asset_daily') }}),
btc as (select snapshot_date, close_px as btc_close_px from d where coin = 'BTC'),
w as (
  select
    d.coin, d.snapshot_date, d.mark_px, d.close_px,
    d.volume_24h_usd,
    lag(d.volume_24h_usd, 1) over (partition by d.coin order by d.snapshot_date) as volume_24h_usd_prev,
    d.open_interest_usd,
    lag(d.open_interest_usd, 1) over (partition by d.coin order by d.snapshot_date) as oi_usd_prev,
    lag(d.open_interest_usd, 7) over (partition by d.coin order by d.snapshot_date) as open_interest_usd_7d_ago,
    lag(d.close_px,          7) over (partition by d.coin order by d.snapshot_date) as close_px_7d_ago,
    d.market_cap_usd, d.funding_1h,
    d.close_px / b.btc_close_px as coin_btc_ratio,
    lag(d.close_px / b.btc_close_px, 30) over (partition by d.coin order by d.snapshot_date) as coin_btc_ratio_30d_ago
  from d join btc b using (snapshot_date)
)
select
  w.*,
  -- shares & changes (all assets, all days; NULL until enough history — see VERIFICATION.md)
  safe_divide(volume_24h_usd - volume_24h_usd_prev, volume_24h_usd_prev)          as vol_change_24h_pct,
  open_interest_usd / sum(open_interest_usd) over (partition by snapshot_date)    as oi_dominance,
  safe_divide(open_interest_usd - oi_usd_prev, oi_usd_prev)                       as oi_change_24h_pct,
  open_interest_usd - open_interest_usd_7d_ago                                    as oi_change_7d_usd,
  safe_divide(open_interest_usd - open_interest_usd_7d_ago, open_interest_usd_7d_ago) as oi_change_7d_pct,
  safe_divide(close_px, close_px_7d_ago) - 1                                      as price_change_7d_pct,
  safe_divide(open_interest_usd, market_cap_usd)                                  as oi_mcap_ratio,
  safe_divide(coin_btc_ratio, coin_btc_ratio_30d_ago) - 1                         as rs_30d,
  a.market_cap_rank, a.is_stablecoin, a.is_wrapped
from w left join {{ ref('dim_asset') }} a using (coin)
-- No WHERE latest, no ORDER BY, no LIMIT: the app/Power BI slice this. Client filters
-- is_stablecoin / thresholds itself. (See "Design principle" in DATA_DICTIONARY.md.)
```

`fct_asset_positioning_daily` follows the same shape for the smart-money cohort (per-coin
long/short/flat counts + signed net-notional day-over-day delta), and `fct_fear_greed` /
`fct_btc_regime` / `fct_trader_daily` / `fct_trader_positions` are the four thin facts.

### 4.6 Tests
In `_marts.yml` / `_staging.yml` add dbt tests: `not_null` + `unique` on grain keys
(`coin + snapshot_date`), `accepted_range` (e.g. `oi_dominance` 0–1; `pct_long`+`pct_short`+
`pct_flat` = 1), `relationships` from positions → `dim_asset`, and a reconciliation test that
`sum(oi_dominance)` ≈ 1 per day. `dbt build` runs models **and** tests.

**Definition of Done:** `dbt build` succeeds; `dbt docs generate` produces the lineage graph;
all 6 fact tables (+ `dim_asset`) exist in `perpscope_marts` with sane numbers spot-checked
against the live app.

---

## Phase 5 — Orchestrate daily with GitHub Actions

**Goal:** one workflow that, every day, runs extract+load, then `dbt build`, then the JSON
export — with the service-account key injected from Secrets.

```yaml
# .github/workflows/market_analytics_etl.yml
name: Market Analytics ETL
on:
  schedule:
    - cron: "0 6 * * *"      # 06:00 UTC daily (after CoinGecko/HL have a full prior day)
  workflow_dispatch: {}       # manual "Run" button for testing

jobs:
  etl:
    runs-on: ubuntu-latest
    env:
      GCP_PROJECT: ${{ secrets.GCP_PROJECT }}
      GOOGLE_APPLICATION_CREDENTIALS: ${{ github.workspace }}/sa_key.json
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }

      - name: Write service-account key from secret
        run: echo '${{ secrets.GCP_SA_KEY }}' > "$GOOGLE_APPLICATION_CREDENTIALS"

      - name: Install deps
        run: |
          pip install -r ETL/extract_load/requirements.txt
          pip install dbt-bigquery

      - name: Extract + Load
        run: python -m extract_load.main
        working-directory: ETL

      - name: Transform (dbt)
        run: dbt build --project-dir ETL/dbt --profiles-dir ETL/dbt

      - name: Export marts → JSON
        run: python -m export.export_marts
        working-directory: ETL

      - name: Publish JSON to GCS   # or commit to repo / upload artifact
        run: gsutil -m cp -r ETL/export/out/*.json gs://perpscope-public/market/
```

**Notes:**
- The cron is UTC. Pick a time after your sources have finalized the prior UTC day.
- `workflow_dispatch` lets you click **Run workflow** to test without waiting for the cron.
- Free minutes: this job runs ~2–3 min/day → trivial against the 2000 min/month private limit
  (and unlimited if the repo is public).

**Definition of Done:** a manual `workflow_dispatch` run goes green end-to-end; the next
morning it fires on its own and marts show the new `snapshot_date`.

---

## Phase 6 — Serve to the React app (static JSON export)

**Goal:** turn the finished marts into small JSON files the browser can `fetch()` — keyless,
free, cached, exactly like PerpScope's other features. **This is where "SQL for the app"
lives:** the export runs `SELECT * FROM <mart>` and writes JSON.

```python
# export/export_marts.py  (representative)
import json, pathlib
from google.cloud import bigquery

OUT = pathlib.Path("export/out"); OUT.mkdir(parents=True, exist_ok=True)
client = bigquery.Client()

FACTS = [
    "fct_asset_metrics_daily", "fct_fear_greed", "fct_btc_regime",
    "fct_asset_positioning_daily", "fct_trader_daily", "fct_trader_positions",
    "dim_asset",
]
for m in FACTS:
    rows = [dict(r) for r in client.query(
        f"SELECT * FROM `{client.project}.perpscope_marts.{m}`").result()]
    (OUT / f"{m}.json").write_text(json.dumps(rows, default=str))
    print(f"exported {len(rows)} rows → {m}.json")
```

**Two ways to publish (pick one; recommended = GCS bucket):**
- **Public GCS bucket** `gs://perpscope-public/market/*.json` → React fetches
  `https://storage.googleapis.com/perpscope-public/market/fct_asset_metrics_daily.json`. Clean,
  no repo noise, CDN-cached.
- **Commit into the repo** under `src/features/market/data/` → simplest, but adds a daily
  auto-commit. Fine for a résumé project if you'd rather avoid a bucket.

The React side later just does `fetch(url)` and renders with Recharts (treemap, stacked bar,
etc.) — same pattern as your existing features. We build that as a separate feature spec.

**Definition of Done:** the fact JSON files are reachable at a stable public URL and contain
the full history (the app slices to the latest day itself).

---

## Phase 7 — Power BI dashboard

**Goal:** a Power BI report reading the **same marts** live from BigQuery.

**Steps:**
1. Power BI Desktop → **Get Data → Google BigQuery** → sign in.
2. Select `perpscope_marts` → load the mart tables (or write a custom SQL query).
3. Build the three report pages mirroring the three dashboards (treemap visual for OI
   dominance, stacked bar for net positioning, cards for F&G, etc.).
4. Publish to Power BI Service → configure **scheduled refresh** (daily, after the ETL cron).

**Modeling tip:** relate every fact table to `dim_asset` on `coin` in the Power BI model view,
so slicers (by asset) work across visuals. Because marts are pre-aggregated to chart grain,
DAX stays minimal — the heavy lifting was done in dbt (that's the point of the marts layer).

**Definition of Done:** three-page report refreshes on schedule from BigQuery; numbers match
the React app and your spot-checks.

---

## 8. Data quality, testing & monitoring

- **dbt tests** (Phase 4.6): schema tests on every grain key; range tests on ratios/percents.
- **Source freshness** (`dbt source freshness`): fails loudly if a day's extract didn't land.
- **CI on pull requests:** a second, lightweight GitHub Actions workflow runs `dbt build
  --select state:modified+` against a scratch dataset so model changes are tested before merge.
- **Idempotency:** partition-truncate loads mean re-runs never duplicate.
- **Backfill:** because raw is retained and partitioned, you can re-run dbt for any historical
  range without re-hitting APIs.
- **Alerting (optional):** pipe a failure notification from the workflow to email/Discord.

---

## 9. Cost & free-tier limits

| Resource | Free limit | Our usage | Verdict |
|---|---|---|---|
| BigQuery storage | 10 GB | ~KBs/day (≈ a few MB/year) | ✅ nowhere close |
| BigQuery query | 1 TB scanned/month | partitioned; MBs/run | ✅ nowhere close |
| BigQuery sandbox | 60-day partition expiry, no streaming | we batch-load, set expirations, and can extend history via retained exports if needed | ✅ fine (attach billing later if you want unlimited history) |
| GitHub Actions | 2000 min/mo (private), ∞ (public) | ~3 min/day ≈ 90 min/mo | ✅ fine |
| GCS bucket | 5 GB free tier | KBs of JSON | ✅ fine |
| CoinGecko / Alternative.me / Hyperliquid | public, rate-limited | ≤ a few hundred calls/day | ✅ within limits (add polite sleeps) |

**Bottom line:** the whole pipeline runs at **$0** at this data volume. The only paid path is
if you attach a BigQuery billing account for >60-day history — and even then you'd stay inside
the perpetual free tier.

---

## 10. Appendix: the metric/data dictionary

The exact math for every chart — sources, grain, formula, and edge cases — lives in
[`ETL/docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md). **Read that before building any
mart**; it's where the analytical decisions (e.g. the "strongest coins" redefinition) are
justified. A mart's SQL should always match its dictionary entry.

---

### How to use this manual from here

Prompt me phase by phase, e.g. **"Do Phase 1"**, then **"Build the extractors"**, etc. For
each phase I'll deliver the real files, we'll run them, and we'll confirm the **Definition of
Done** before advancing. Start whenever you're ready.
