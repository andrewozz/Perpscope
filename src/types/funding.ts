export type FundingExchangeId = 'hyperliquid' | 'lighter' | 'aster';

export const FUNDING_EXCHANGE_META: Record<FundingExchangeId, { name: string; color: string }> = {
  hyperliquid: { name: 'Hyperliquid', color: '#34d399' },
  lighter: { name: 'Lighter', color: '#38bdf8' },
  aster: { name: 'Aster', color: '#f472b6' },
};

export interface FundingPoint {
  timestamp: number; // unix ms
  rate: number; // fractional rate for one funding period (not annualized)
}

export interface ExchangeFunding {
  exchange: FundingExchangeId;
  periodHours: number; // hours per funding period (1 for HL/Lighter, 8 for Aster)
  currentRate: number;
  history: FundingPoint[]; // native-resolution history, most recent last
}

export interface ArbOpportunity {
  asset: string;
  marketCapRank: number;
  longExchange: FundingExchangeId;
  shortExchange: FundingExchangeId;
  longApy: number;
  shortApy: number;
  spreadApy: number;
  /** Share of the last 24h the spread stayed in the profitable direction (> 0). null if too little history. */
  persistence24h: number | null;
  /** Share of the last 7d the spread stayed in the profitable direction (> 0). null if too little history. */
  persistence7d: number | null;
  /** Magnitude steadiness over 7d: |mean| / (|mean| + std) of |spread|. 1 = flat, →0 = spiky. null if too little history. */
  stability: number | null;
  score: number; // composite profitability rank
}
