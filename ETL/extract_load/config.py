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

# ---------------------------------------------------------------- cohort (Dashboard 3)
# Definitional filter -- lives in the extractor because the leaderboard API has
# no server-side sort by 30d PnL; we rank client-side. Keep a buffer above 100
# so dbt can track cohort churn day over day (see DATA_DICTIONARY.md).
COHORT_SIZE = 100
COHORT_BUFFER = 150

# Some leaderboard rows carry an exact allTime.pnl == -500.0 -- a placeholder
# for accounts whose all-time history isn't tracked (new/migrated wallets),
# not a real $500 loss. Verified live: these are the accounts the official
# app.hyperliquid.xyz leaderboard UI silently excludes but the raw stats-data
# feed does not. Filtered out in fetch_leaderboard_cohort before ranking.
LEADERBOARD_ALLTIME_SENTINEL_PNL = -500.0

# polite delay between per-trader clearinghouseState calls (Hyperliquid has no
# documented public rate limit for /info, but we don't hammer it)
POSITIONS_CALL_DELAY_SEC = 0.15
CANDLE_CALL_DELAY_SEC = 0.15

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
