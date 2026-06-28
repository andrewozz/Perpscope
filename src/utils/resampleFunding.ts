import type { FundingPoint } from '../types/funding';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Resamples a funding history onto a fixed grid of `stepHours`-wide buckets covering the last
 * `totalHours` (ending now), forward-filling each bucket with the most recent known rate.
 *
 * - step = 1h gives the dense economic carry series (what you'd earn each hour you hold).
 * - step = the slower leg's funding period gives independent native observations, one per real
 *   funding event, so statistics aren't inflated by forward-filled duplicates.
 */
export function resampleStep(history: FundingPoint[], stepHours: number, totalHours: number, nowMs = Date.now()): number[] {
  if (history.length === 0) return [];
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const stepMs = stepHours * HOUR_MS;

  const result: number[] = [];
  let cursor = 0;
  const endBucket = Math.floor(nowMs / stepMs);
  const startBucket = endBucket - Math.floor(totalHours / stepHours) + 1;

  for (let b = startBucket; b <= endBucket; b++) {
    const bucketEnd = b * stepMs + stepMs;
    while (cursor + 1 < sorted.length && sorted[cursor + 1].timestamp <= bucketEnd) {
      cursor++;
    }
    if (sorted[cursor].timestamp <= bucketEnd) {
      result.push(sorted[cursor].rate);
    }
  }

  return result;
}

/** Convenience wrapper: hourly grid (step = 1h). */
export function resampleHourly(history: FundingPoint[], hours: number, nowMs = Date.now()): number[] {
  return resampleStep(history, 1, hours, nowMs);
}
