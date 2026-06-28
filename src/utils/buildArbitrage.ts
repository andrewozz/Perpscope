import { fetchTopAssets } from '../api/coingecko';
import {
  fetchAsterCurrentRates,
  fetchAsterHistory,
  fetchHyperliquidCurrentRates,
  fetchHyperliquidHistory,
  fetchLighterCurrentRates,
  fetchLighterHistory,
} from '../api/fundingApi';
import { mean, sampleStdDev } from './stats';
import { resampleStep } from './resampleFunding';
import type { ArbOpportunity, FundingExchangeId } from '../types/funding';

const HOURS_PER_YEAR = 24 * 365;
const MIN_SPREAD_APY = 3; // % — floor for what counts as a "good" opportunity
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_POINTS = 4; // need a few hourly points to estimate a mean/std at all

function toApy(rate: number, periodHours: number): number {
  return rate * (HOURS_PER_YEAR / periodHours) * 100;
}

/**
 * Persistence = share of the window where the spread stayed in the profitable direction (> 0).
 * The spread is built short-leg − long-leg with the *current* trade direction, so spread > 0 means
 * holding that position earns funding that hour. 100% ⇒ you'd have earned every hour ("always
 * earning money"); 50% ⇒ the spread flipped against you half the time. Sign-aware by design.
 */
function persistence(spread: number[]): number | null {
  if (spread.length < MIN_POINTS) return null;
  return spread.filter((v) => v > 0).length / spread.length;
}

/**
 * Stability = |mean| / (|mean| + stdDev) of the spread's *magnitude* (|spread|), i.e. 1/(1+CV) of
 * the absolute spread. It asks whether the size of the spread holds steady or spikes around,
 * independent of direction: a spread that sits near a constant magnitude scores ~1, one that's
 * mostly small with occasional spikes scores low. The |mean|/std ratio is the t-statistic's
 * signal-to-noise core, applied to magnitude.
 */
function stabilityOf(spread: number[]): number | null {
  if (spread.length < MIN_POINTS) return null;
  const mags = spread.map((v) => Math.abs(v));
  const m = mean(mags);
  const stdDev = sampleStdDev(mags, m);
  const denom = m + stdDev;
  return denom === 0 ? 0 : m / denom;
}

function buildSpread(longApyHistory: { timestamp: number; rate: number }[], shortApyHistory: { timestamp: number; rate: number }[], stepHours: number, totalHours: number): number[] {
  const longLeg = resampleStep(longApyHistory, stepHours, totalHours);
  const shortLeg = resampleStep(shortApyHistory, stepHours, totalHours);
  const n = Math.min(longLeg.length, shortLeg.length);
  return Array.from({ length: n }, (_, i) => shortLeg[shortLeg.length - n + i] - longLeg[longLeg.length - n + i]);
}

export async function buildArbitrageOpportunities(): Promise<ArbOpportunity[]> {
  const [assets, hlCurrent, asterCurrent, lighterCurrent] = await Promise.all([
    fetchTopAssets(20),
    fetchHyperliquidCurrentRates(),
    fetchAsterCurrentRates(),
    fetchLighterCurrentRates(),
  ]);

  const since7d = Date.now() - SEVEN_DAYS_MS;

  const opportunities = await Promise.all(
    assets.map(async ({ symbol, rank }) => {
      const available: { exchange: FundingExchangeId; rate: number; periodHours: number; marketId?: number }[] = [];
      if (hlCurrent.has(symbol)) available.push({ exchange: 'hyperliquid', rate: hlCurrent.get(symbol)!, periodHours: 1 });
      if (asterCurrent.has(symbol)) available.push({ exchange: 'aster', rate: asterCurrent.get(symbol)!, periodHours: 8 });
      const lighterEntry = lighterCurrent.get(symbol);
      if (lighterEntry) available.push({ exchange: 'lighter', rate: lighterEntry.rate, periodHours: 1, marketId: lighterEntry.marketId });

      if (available.length < 2) return null;

      const byApy = [...available].sort((a, b) => toApy(a.rate, a.periodHours) - toApy(b.rate, b.periodHours));
      const longSide = byApy[0];
      const shortSide = byApy[byApy.length - 1];
      const longApy = toApy(longSide.rate, longSide.periodHours);
      const shortApy = toApy(shortSide.rate, shortSide.periodHours);
      const spreadApy = shortApy - longApy;
      if (spreadApy < MIN_SPREAD_APY) return null;

      const [longHistory, shortHistory] = await Promise.all([
        fetchHistoryFor(symbol, longSide.exchange, longSide.marketId, since7d),
        fetchHistoryFor(symbol, shortSide.exchange, shortSide.marketId, since7d),
      ]);

      // Annualize each native-period rate to APY *before* resampling, so forward-filling
      // an 8h Aster rate across hourly buckets doesn't get re-annualized as if it were hourly.
      const longApyHistory = longHistory.map((p) => ({ timestamp: p.timestamp, rate: toApy(p.rate, longSide.periodHours) }));
      const shortApyHistory = shortHistory.map((p) => ({ timestamp: p.timestamp, rate: toApy(p.rate, shortSide.periodHours) }));

      // Hourly carry series over the last 7 days; the 24h window is just its last 24 points.
      const hourlySpread = buildSpread(longApyHistory, shortApyHistory, 1, 168);

      const persistence7d = persistence(hourlySpread);
      const persistence24h = persistence(hourlySpread.slice(-24));
      const stability = stabilityOf(hourlySpread);
      const rankPersistence = persistence7d ?? 0;

      const opportunity: ArbOpportunity = {
        asset: symbol,
        marketCapRank: rank,
        longExchange: longSide.exchange,
        shortExchange: shortSide.exchange,
        longApy,
        shortApy,
        spreadApy,
        persistence24h,
        persistence7d,
        stability,
        score: spreadApy * (1 + rankPersistence),
      };
      return opportunity;
    }),
  );

  return opportunities
    .filter((o): o is ArbOpportunity => o !== null)
    .sort((a, b) => b.score - a.score);
}

function fetchHistoryFor(symbol: string, exchange: FundingExchangeId, marketId: number | undefined, sinceMs: number) {
  if (exchange === 'hyperliquid') return fetchHyperliquidHistory(symbol, sinceMs);
  if (exchange === 'aster') return fetchAsterHistory(symbol, 40);
  return fetchLighterHistory(marketId!, sinceMs);
}
