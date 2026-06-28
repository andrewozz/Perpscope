import { mean, sampleStdDev } from './stats';
import type { DailyBar, FeatureRow } from '../types/regime';

const ANNUALISE = Math.sqrt(365);

function rollingMean(arr: number[], end: number, window: number): number {
  return mean(arr.slice(end - window + 1, end + 1));
}
function rollingStd(arr: number[], end: number, window: number): number {
  return sampleStdDev(arr.slice(end - window + 1, end + 1));
}

/**
 * Computes the 6 regime features for each day, replicating the exact pandas pipeline the HMM was
 * trained on. Rows whose rolling windows aren't yet full (the first ~50 days) are dropped, so every
 * returned row has all 6 features defined.
 */
export function computeFeatures(bars: DailyBar[]): FeatureRow[] {
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume);
  const funding = bars.map((b) => b.funding);
  const logClose = close.map((c) => Math.log(c));

  // 1-day log returns (index 0 has none)
  const ret: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) ret[i] = logClose[i] - logClose[i - 1];
  const downRet = ret.map((r) => (Number.isNaN(r) ? NaN : Math.min(r, 0)));

  const rows: FeatureRow[] = [];
  // 50-day SMA is the most demanding window -> features valid from index 49
  for (let i = 49; i < n; i++) {
    const sma50 = rollingMean(close, i, 50);
    const volStd = rollingStd(volume, i, 30);
    rows.push({
      date: bars[i].date,
      mom_20: logClose[i] - logClose[i - 20],
      trend: close[i] / sma50 - 1,
      vol_14: rollingStd(ret, i, 14) * ANNUALISE,
      downside_vol: rollingStd(downRet, i, 14) * ANNUALISE,
      funding_ma: rollingMean(funding, i, 7),
      vol_z: volStd === 0 ? 0 : (volume[i] - rollingMean(volume, i, 30)) / volStd,
    });
  }
  return rows;
}
