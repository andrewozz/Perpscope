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

export interface TraderRow {
  trader_address: string;
  snapshot_date: string;
  display_name: string | null;
  pnl_30d_usd: number;
  volume_30d_usd: number;
  account_value_usd: number;
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
  traders: TraderRow[];
  traderPositions: TraderPositionRow[];
  fearGreed: FearGreedRow[];
  asOf: string; // the latest snapshot_date across the facts
}

// ---- shared formatting helpers (our percentages are stored as FRACTIONS) ----
export const pctFrac = (frac: number, dp = 1) => `${(frac * 100).toFixed(dp)}%`;
export const signedPctFrac = (frac: number, dp = 1) =>
  `${frac >= 0 ? '+' : ''}${(frac * 100).toFixed(dp)}%`;
export const truncAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
