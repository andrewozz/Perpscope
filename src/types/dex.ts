export type DexId = 'hyperliquid' | 'lighter' | 'variational' | 'aster';

export interface DexMeta {
  id: DexId;
  name: string;
  slug: string; // DefiLlama protocol/dex slug
  color: string; // chart color (hex)
}

export type DexMetricKey = 'tvl' | 'volume' | 'revenue';

export interface DexDailyPoint {
  date: string; // ISO date (yyyy-mm-dd)
  tvl?: number;
  volume?: number;
  revenue?: number;
}

export interface DexData {
  meta: DexMeta;
  hasTvl: boolean;
  hasVolume: boolean;
  hasRevenue: boolean;
  hasAnyData: boolean;
  points: DexDailyPoint[];
  snapshot: Dex30dSnapshot | null;
}

export interface Dex30dSnapshot {
  id: DexId;
  name: string;
  color: string;
  tvl: number;
  volume30d: number;
  revenue30d: number;
  capitalEfficiency: number | null; // volume30d / tvl
  tvlGrowth30d: number | null; // % change in TVL vs ~30 days ago
}
