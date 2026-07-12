"""
Shared constants for the PerpScope Market Analytics extractors.
No secrets here -- BigQuery credentials are picked up later (Phase 3) via
GOOGLE_APPLICATION_CREDENTIALS, never hardcoded.
"""

# ---------------------------------------------------------------- endpoints
HL_INFO_URL = "https://api.hyperliquid.xyz/info"
HL_LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard"
CG_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets"
FNG_URL = "https://api.alternative.me/fng/"

REQUEST_TIMEOUT = 30
LEADERBOARD_TIMEOUT = 60

# ---------------------------------------------------------------- smart-money cohort (Dashboard 3)
# The cohort is chosen by a 2-STAGE, risk-adjusted ranking (see the reference
# spec + formulas in "Smart wallets leaderboard.ipynb"), computed in the extract
# phase (extractors/smart_money.py) -- NOT a naive "sort by 30d PnL". All of the
# selection happens in Python so the loaded leaderboard IS already the final
# cohort; dbt just joins positions on top.
#
# Stage 1 (free, whole leaderboard): drop the -500.0 sentinel, require
# accountValue>0 AND 30d volume>0, sort by 30d PnL, keep the top SHORTLIST_SIZE.
# Stage 2 (one `portfolio` call each): build the 30d equity curve -> Sharpe,
# profit factor, max drawdown, win-rate; gate on >= PORTFOLIO_MIN_OBS points.
# Score: confidence-shrunk, weighted percentile-rank composite -> top COHORT_SIZE.
COHORT_SIZE = 100         # final smart-money cohort size (top-N by smart_score)
SHORTLIST_SIZE = 500      # Stage-1 candidates that advance to expensive Stage-2 scoring
PORTFOLIO_MIN_OBS = 10    # min daily equity points required to score a wallet
PROFIT_FACTOR_CAP = 5.0   # winsorize profit factor (>5 is already elite / no-loss month)
CONFIDENCE_FULL_OBS = 21  # daily observations needed for full confidence weight

# Smart-money composite weights (must sum to 1): 70% risk-adjusted skill/risk
# control (Sharpe + max drawdown + profit factor + ROI), 30% scale (PnL + volume).
SMART_MONEY_WEIGHTS = {
    "sharpe_30d": 0.25,
    "max_drawdown_30d": 0.15,
    "profit_factor_30d": 0.15,
    "roi_30d": 0.15,
    "pnl_30d_usd": 0.15,
    "volume_30d_usd": 0.15,
}

# Some leaderboard rows carry an exact allTime.pnl == -500.0 -- a placeholder
# for accounts whose all-time history isn't tracked (new/migrated wallets),
# not a real $500 loss. Verified live: these are the accounts the official
# app.hyperliquid.xyz leaderboard UI silently excludes but the raw stats-data
# feed does not. Filtered out first (before the PnL sort) in Stage 1.
LEADERBOARD_ALLTIME_SENTINEL_PNL = -500.0

# polite delays between per-wallet calls (Hyperliquid /info has no documented
# public rate limit, but _post_info retries on 429 with backoff either way)
POSITIONS_CALL_DELAY_SEC = 0.15
CANDLE_CALL_DELAY_SEC = 0.15
PORTFOLIO_CALL_DELAY_SEC = 0.08

# ---------------------------------------------------------------- candles
# Pulled fresh every day for every asset. Candles (unlike Open Interest) ARE
# backfillable from Hyperliquid, so re-landing a rolling window each day is
# self-healing: a failed run yesterday doesn't leave a permanent gap.
CANDLE_LOOKBACK_DAYS = 40  # covers the 30d relative-strength lookback + buffer

# ---------------------------------------------------------------- coingecko
CG_PAGES = 2          # per_page=250 x 2 pages = top 500 by market cap
CG_PER_PAGE = 250

# Hyperliquid ticker -> CoinGecko ticker, for the symbols that don't match
# 1:1 (confirmed live during feasibility verification, see docs/VERIFICATION.md).
CG_SYMBOL_OVERRIDE = {
    "MATIC": "POL",
    "kPEPE": "PEPE",
    "kBONK": "BONK",
    "kSHIB": "SHIB",
    "kFLOKI": "FLOKI",
    "kLUNC": "LUNC",
    "kNEIRO": "NEIRO",
    "kDOGS": "DOGS",
    "NEIROETH": "NEIRO",
    "RNDR": "RENDER",
    "FTM": "S",
}

# Excluded from "coin ranking" facts (hottest/strongest/oi-mcap etc). Kept in
# dim_asset with flags so the client decides whether to filter them.
STABLECOIN_SYMBOLS = {"USDT", "USDC", "DAI", "USDE", "FDUSD", "TUSD", "USDP"}
WRAPPED_SYMBOLS = {"WBTC", "WETH", "WSTETH", "STETH", "WEETH", "WBETH"}
