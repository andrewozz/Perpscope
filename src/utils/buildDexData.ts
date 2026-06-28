import { fetchTvlSeries, fetchVolumeSeries, fetchFeesSeries } from '../api/defillama';
import type { DexData, DexDailyPoint, DexMeta, Dex30dSnapshot } from '../types/dex';

// Variational is intentionally excluded: it's an OTC/RFQ venue with no live TVL/volume/fees on
// DefiLlama, so it would only ever render an empty card.
export const DEX_META: DexMeta[] = [
  { id: 'hyperliquid', name: 'Hyperliquid', slug: 'hyperliquid', color: '#34d399' },
  { id: 'lighter', name: 'Lighter', slug: 'lighter', color: '#38bdf8' },
  { id: 'aster', name: 'Aster', slug: 'aster', color: '#f472b6' },
];

export async function buildDexData(meta: DexMeta): Promise<DexData> {
  const [tvlMap, volumeSummary, feesSummary] = await Promise.all([
    fetchTvlSeries(meta.slug),
    fetchVolumeSeries(meta.slug),
    fetchFeesSeries(meta.slug),
  ]);

  const hasTvl = !!tvlMap && tvlMap.size > 0;
  const hasVolume = !!volumeSummary;
  const hasRevenue = !!feesSummary;

  const dates = new Set<string>([
    ...(tvlMap?.keys() ?? []),
    ...(volumeSummary?.daily.keys() ?? []),
    ...(feesSummary?.daily.keys() ?? []),
  ]);

  const points: DexDailyPoint[] = Array.from(dates)
    .sort()
    .map((date) => ({
      date,
      tvl: tvlMap?.get(date),
      volume: volumeSummary?.daily.get(date),
      revenue: feesSummary?.daily.get(date),
    }));

  const snapshot = buildSnapshot(meta, points, volumeSummary?.total30d ?? null, feesSummary?.total30d ?? null);

  return {
    meta,
    hasTvl,
    hasVolume,
    hasRevenue,
    hasAnyData: hasTvl || hasVolume || hasRevenue,
    points,
    snapshot,
  };
}

function buildSnapshot(
  meta: DexMeta,
  points: DexDailyPoint[],
  volume30d: number | null,
  revenue30d: number | null,
): Dex30dSnapshot | null {
  const tvlPoints = points.filter((p) => p.tvl !== undefined);
  if (tvlPoints.length === 0 && volume30d === null && revenue30d === null) return null;

  const latestTvl = tvlPoints.at(-1)?.tvl ?? null;
  const referenceIndex = tvlPoints.length - 31;
  const priorTvl = referenceIndex >= 0 ? tvlPoints[referenceIndex].tvl : null;

  const tvlGrowth30d =
    latestTvl !== null && priorTvl !== null && priorTvl !== undefined && priorTvl !== 0
      ? ((latestTvl - priorTvl) / priorTvl) * 100
      : null;

  const capitalEfficiency = latestTvl !== null && latestTvl !== 0 && volume30d !== null ? volume30d / latestTvl : null;

  return {
    id: meta.id,
    name: meta.name,
    color: meta.color,
    tvl: latestTvl ?? 0,
    volume30d: volume30d ?? 0,
    revenue30d: revenue30d ?? 0,
    capitalEfficiency,
    tvlGrowth30d,
  };
}

export function getFastestGrowing(snapshots: Dex30dSnapshot[]): Dex30dSnapshot | null {
  const withGrowth = snapshots.filter((s): s is Dex30dSnapshot & { tvlGrowth30d: number } => s.tvlGrowth30d !== null);
  if (withGrowth.length === 0) return null;
  return withGrowth.reduce((best, current) => (current.tvlGrowth30d > best.tvlGrowth30d ? current : best));
}
