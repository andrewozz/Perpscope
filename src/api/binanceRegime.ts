import type { DailyBar } from '../types/regime';

const BASE = 'https://fapi.binance.com';
const START_MS = Date.parse('2019-09-08T00:00:00Z'); // BTCUSDT perpetual inception

function toIsoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

type Kline = [number, string, string, string, string, string];
async function fetchAllKlines(): Promise<Kline[]> {
  let startMs = START_MS;
  const rows: Kline[] = [];
  for (;;) {
    const res = await fetch(`${BASE}/fapi/v1/klines?symbol=BTCUSDT&interval=1d&startTime=${startMs}&limit=1500`);
    if (!res.ok) throw new Error('klines request failed');
    const data = (await res.json()) as Kline[];
    if (data.length === 0) break;
    rows.push(...data);
    if (data.length < 1500) break;
    startMs = data[data.length - 1][0] + 1;
  }
  return rows;
}

interface FundingEntry { fundingTime: number; fundingRate: string }
async function fetchAllFunding(): Promise<FundingEntry[]> {
  let startMs = START_MS;
  const rows: FundingEntry[] = [];
  for (;;) {
    const res = await fetch(`${BASE}/fapi/v1/fundingRate?symbol=BTCUSDT&startTime=${startMs}&limit=1000`);
    if (!res.ok) throw new Error('funding request failed');
    const data = (await res.json()) as FundingEntry[];
    if (data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    startMs = data[data.length - 1].fundingTime + 1;
  }
  return rows;
}

/**
 * Fetches the FULL daily BTCUSDT history (close, volume) plus daily-mean funding, aligned by date —
 * the same instrument/fields the regime HMM trained on. Full history so the chart can colour every
 * day since 2019 by its decoded regime; the latest day is what the live classification uses.
 */
export async function fetchBtcDaily(): Promise<DailyBar[]> {
  const [klines, funding] = await Promise.all([fetchAllKlines(), fetchAllFunding()]);

  // funding settles ~3×/day → average to one value per day
  const fundingByDay = new Map<string, { sum: number; n: number }>();
  for (const f of funding) {
    const day = toIsoDay(f.fundingTime);
    const e = fundingByDay.get(day) ?? { sum: 0, n: 0 };
    e.sum += Number(f.fundingRate);
    e.n += 1;
    fundingByDay.set(day, e);
  }

  const seen = new Set<string>();
  const bars: DailyBar[] = [];
  let lastFunding = 0;
  for (const k of klines) {
    const date = toIsoDay(k[0]);
    if (seen.has(date)) continue;
    seen.add(date);
    const dayFunding = fundingByDay.get(date);
    const fundingVal = dayFunding ? dayFunding.sum / dayFunding.n : lastFunding; // forward-fill gaps
    lastFunding = fundingVal;
    bars.push({ date, close: Number(k[4]), volume: Number(k[5]), funding: fundingVal });
  }
  return bars;
}
