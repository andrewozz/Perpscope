import { fetchJsonNoCache } from '../utils/httpCache';

const BASE_URL = 'https://api.llama.fi';

function toIsoDay(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

interface ChainTvlPoint {
  date: number;
  totalLiquidityUSD: number;
}

interface ProtocolResponse {
  tvl?: ChainTvlPoint[];
  chainTvls?: Record<string, { tvl?: ChainTvlPoint[] }>;
}

export async function fetchTvlSeries(slug: string): Promise<Map<string, number> | null> {
  const data = await fetchJsonNoCache<ProtocolResponse>(`${BASE_URL}/protocol/${slug}`);
  if (!data) return null;

  // Prefer the pre-aggregated top-level series; fall back to summing raw chain series.
  let series = data.tvl;
  if (!series || series.length === 0) {
    const byDate = new Map<number, number>();
    for (const [chainName, chain] of Object.entries(data.chainTvls ?? {})) {
      if (chainName.includes('-')) continue; // skip staking/pool2/borrowed breakdowns to avoid double counting
      for (const point of chain.tvl ?? []) {
        byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.totalLiquidityUSD);
      }
    }
    series = Array.from(byDate.entries()).map(([date, totalLiquidityUSD]) => ({ date, totalLiquidityUSD }));
  }

  if (!series || series.length === 0) return null;
  const map = new Map<string, number>();
  for (const point of series) {
    map.set(toIsoDay(point.date), point.totalLiquidityUSD);
  }
  return map;
}

interface SummaryResponse {
  totalDataChart?: [number, number][];
  total24h?: number;
  total7d?: number;
  total30d?: number;
}

interface SummarySeries {
  daily: Map<string, number>;
  total24h: number | null;
  total30d: number | null;
}

async function fetchSummarySeries(path: 'dexs' | 'fees', slug: string): Promise<SummarySeries | null> {
  const data = await fetchJsonNoCache<SummaryResponse>(
    `${BASE_URL}/summary/${path}/${slug}?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true`,
  );
  if (!data || !data.totalDataChart || data.totalDataChart.length === 0) return null;

  const daily = new Map<string, number>();
  for (const [timestamp, value] of data.totalDataChart) {
    daily.set(toIsoDay(timestamp), value);
  }
  return {
    daily,
    total24h: data.total24h ?? null,
    total30d: data.total30d ?? null,
  };
}

export function fetchVolumeSeries(slug: string) {
  return fetchSummarySeries('dexs', slug);
}

export function fetchFeesSeries(slug: string) {
  return fetchSummarySeries('fees', slug);
}
