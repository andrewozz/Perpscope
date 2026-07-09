// Placeholder values for the charts whose real columns are still NULL because
// the pipeline needs more daily snapshots to accrue (24h / 7d / 30d lookbacks,
// and the not-yet-built BTC regime model). Every one of these is clearly badged
// "Mock data" in the UI. They get replaced by real BigQuery values automatically
// once enough history exists -- nothing here needs code changes, just time.

export interface RankedCoin {
  coin: string;
  value: number; // fraction (e.g. 0.42 = +42%)
  secondary?: number; // optional paired metric, also a fraction
}

// Dashboard 1 -------------------------------------------------------------
export const MOCK_BTC_REGIME = {
  label: 'Accumulation',
  confidence: 0.71,
};

// hottest = biggest 24h jump in traded volume
export const MOCK_HOTTEST: RankedCoin[] = [
  { coin: 'PENGU', value: 1.87 },
  { coin: 'WIF', value: 1.24 },
  { coin: 'ENA', value: 0.96 },
  { coin: 'JUP', value: 0.71 },
  { coin: 'TIA', value: 0.58 },
];

// strongest = best 30d performance vs BTC (relative strength)
export const MOCK_STRONGEST: RankedCoin[] = [
  { coin: 'HYPE', value: 0.42 },
  { coin: 'SOL', value: 0.28 },
  { coin: 'SUI', value: 0.19 },
  { coin: 'AAVE', value: 0.14 },
  { coin: 'LINK', value: 0.09 },
];

// Dashboard 2 -------------------------------------------------------------
// top OI increases over 7d (value = 7d OI$ change, secondary = 7d price change)
export const MOCK_OI_MOVERS: { coin: string; oiChangeUsd: number; priceChange: number }[] = [
  { coin: 'SOL', oiChangeUsd: 184_000_000, priceChange: 0.12 },
  { coin: 'HYPE', oiChangeUsd: 156_000_000, priceChange: 0.15 },
  { coin: 'ETH', oiChangeUsd: 98_000_000, priceChange: 0.06 },
  { coin: 'XRP', oiChangeUsd: 61_000_000, priceChange: -0.03 },
  { coin: 'DOGE', oiChangeUsd: 44_000_000, priceChange: 0.08 },
];

// deterministic mock 24h OI change per coin, for the treemap colour only
export function mockOiChange24h(coin: string): number {
  let h = 0;
  for (let i = 0; i < coin.length; i++) h = (h * 31 + coin.charCodeAt(i)) % 1000;
  return (h / 1000) * 0.3 - 0.15; // -15%..+15%
}

// Dashboard 3 -------------------------------------------------------------
// daily net-notional flow among the cohort, top assets by mcap
export const MOCK_INFLOW: { coin: string; usd: number; pct: number }[] = [
  { coin: 'BTC', usd: 4_200_000, pct: 0.11 },
  { coin: 'ETH', usd: 1_500_000, pct: 0.08 },
  { coin: 'SOL', usd: -820_000, pct: -0.06 },
  { coin: 'BNB', usd: 340_000, pct: 0.04 },
  { coin: 'XRP', usd: -210_000, pct: -0.03 },
  { coin: 'DOGE', usd: 95_000, pct: 0.02 },
];
