// Types mirror the JSON exported from the BigQuery marts (ETL/export/export_marts.py).
// Nullable fields are the ones that stay null until enough daily history accrues
// (the LAG-based metrics -- see ETL/docs/VERIFICATION.md).

export interface AssetMetric {
  coin: string;
  snapshot_date: string;
  mark_px: number;
  close_px: number;
  volume_24h_usd: number;
  volume_24h_usd_prev: number | null;
  vol_change_24h_pct: number | null;
  open_interest_usd: number;
  oi_dominance: number;
  oi_change_24h_pct: number | null;
  oi_change_7d_usd: number | null;
  oi_change_7d_pct: number | null;
  price_change_7d_pct: number | null;
  market_cap_usd: number | null;
  oi_mcap_ratio: number | null;
  rs_30d: number | null;
  funding_1h: number;
  market_cap_rank: number | null;
  is_stablecoin: boolean;
  is_wrapped: boolean;
}

export interface PositioningRow {
  coin: string;
  snapshot_date: string;
  cohort_size: number;
  n_long: number;
  n_short: number;
  n_flat: number;
  pct_long: number;
  pct_short: number;
  pct_flat: number;
  cohort_net_notional_usd: number;
  cohort_net_notional_prev: number | null;
  inflow_usd: number | null;
  inflow_pct: number | null;
  market_cap_rank: number | null;
}

// One row per SMART-MONEY wallet -- the cohort is the top-100 by a 2-stage
// risk-adjusted `smart_score` (Sharpe / profit factor / max drawdown / ROI /
// PnL / volume, percentile-ranked + confidence-shrunk), computed in the extract
// phase. See ETL/"Smart wallets leaderboard.ipynb" for the full methodology.
export interface TraderRow {
  trader_address: string;
  snapshot_date: string;
  display_name: string | null;
  // leaderboard base
  pnl_30d_usd: number;
  roi_30d: number | null;
  volume_30d_usd: number;
  account_value_usd: number;
  alltime_pnl_usd: number | null;
  alltime_roi: number | null;
  // Stage-2 risk metrics (from the 30d equity curve)
  sharpe_30d: number | null;
  volatility_30d: number | null;
  profit_factor_30d: number | null;
  max_drawdown_30d: number | null; // negative: 0 = none, -1 = wiped out
  win_rate_days_30d: number | null;
  n_obs: number;
  // composite score
  composite: number | null;
  confidence: number | null;
  smart_score: number | null; // 0..1 -- the ranking metric (client sorts by this)
  stage1_rank_pnl: number | null; // where they ranked by raw 30d PnL (shows the re-rank effect)
  // position-derived (current open book)
  n_open_positions: number;
  gross_exposure_usd: number;
  net_exposure_usd: number;
  in_cohort: boolean;
}

export interface TraderPositionRow {
  snapshot_date: string;
  trader_address: string;
  coin: string;
  size_coins: number;
  entry_px: number;
  position_value_usd: number;
  signed_notional_usd: number;
  unrealized_pnl: number;
  leverage: number;
  direction: string;
  in_cohort: boolean;
}

export interface FearGreedRow {
  date: string;
  fng_value: number;
  fng_classification: string;
}

export interface MarketData {
  assetMetrics: AssetMetric[];
  positioning: PositioningRow[];
  activeTraders: TraderRow[];
  traderPositions: TraderPositionRow[];
  fearGreed: FearGreedRow[];
  asOf: string; // the latest snapshot_date across the facts
}

// ---- shared formatting helpers (our percentages are stored as FRACTIONS) ----
export const pctFrac = (frac: number, dp = 1) => `${(frac * 100).toFixed(dp)}%`;
export const signedPctFrac = (frac: number, dp = 1) =>
  `${frac >= 0 ? '+' : ''}${(frac * 100).toFixed(dp)}%`;
export const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
