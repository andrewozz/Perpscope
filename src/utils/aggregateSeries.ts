import type { DexDailyPoint, DexMetricKey } from '../types/dex';

export type Granularity = 'D' | 'W' | 'M' | 'Q' | 'Y';

export const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'D', label: 'D' },
  { key: 'W', label: 'W' },
  { key: 'M', label: 'M' },
  { key: 'Q', label: 'Q' },
  { key: 'Y', label: 'Y' },
];

export interface AggPoint {
  date: string;
  value: number;
}

// Volume and revenue are FLOWS (accumulate over a period → sum). TVL is a STOCK (a level at a
// point in time → take the end-of-period value, never sum). Getting this distinction right is
// what keeps the numbers correct when the granularity changes.
const FLOW_METRICS = new Set<DexMetricKey>(['volume', 'revenue']);

function periodStart(dateStr: string, g: Granularity): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  switch (g) {
    case 'D':
      return dateStr;
    case 'W': {
      const d = new Date(date);
      const dow = d.getUTCDay() || 7; // Mon=1..Sun=7
      d.setUTCDate(d.getUTCDate() - dow + 1); // back to Monday
      return d.toISOString().slice(0, 10);
    }
    case 'M':
      return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    case 'Q':
      return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1)).toISOString().slice(0, 10);
    case 'Y':
      return new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10);
  }
}

/** Aggregates a daily series to the chosen granularity: flows are summed, stocks take the last value. */
export function aggregateDexPoints(points: DexDailyPoint[], metric: DexMetricKey, g: Granularity): AggPoint[] {
  const valid = points.filter((p) => p[metric] !== undefined) as (DexDailyPoint & Record<DexMetricKey, number>)[];
  if (g === 'D') return valid.map((p) => ({ date: p.date, value: p[metric] }));

  const isFlow = FLOW_METRICS.has(metric);
  const buckets = new Map<string, { sum: number; last: number }>();
  // points are chronologically ascending, so the last write per bucket is the end-of-period value
  for (const p of valid) {
    const key = periodStart(p.date, g);
    const v = p[metric];
    const b = buckets.get(key);
    if (!b) buckets.set(key, { sum: v, last: v });
    else {
      b.sum += v;
      b.last = v;
    }
  }

  return [...buckets.entries()]
    .map(([date, b]) => ({ date, value: isFlow ? b.sum : b.last }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function formatGranularLabel(isoDate: string, g: Granularity): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (g === 'Y') return String(d.getUTCFullYear());
  if (g === 'Q') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${String(d.getUTCFullYear()).slice(2)}`;
  if (g === 'M') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  // Daily / Weekly: include the 2-digit year so the timeline isn't ambiguous across years.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
}
