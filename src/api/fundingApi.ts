import { cachedFetchJson } from '../utils/httpCache';
import type { FundingPoint } from '../types/funding';

const CURRENT_TTL_MS = 1 * 60 * 1000; // refresh current rate every 1min so the spread tracks live
const HISTORY_TTL_MS = 20 * 60 * 1000;

// ---------- Hyperliquid (api.hyperliquid.xyz) — native 1h funding period ----------

interface HlAssetCtx {
  funding: string;
}
interface HlMeta {
  universe: { name: string }[];
}

async function postJson<T>(url: string, body: unknown, ttlMs: number): Promise<T | null> {
  return cachedFetchJson<T>(`${url}#${JSON.stringify(body)}`, ttlMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchHyperliquidCurrentRates(): Promise<Map<string, number>> {
  const data = await postJson<[HlMeta, HlAssetCtx[]]>(
    'https://api.hyperliquid.xyz/info',
    { type: 'metaAndAssetCtxs' },
    CURRENT_TTL_MS,
  );
  const rates = new Map<string, number>();
  if (!data) return rates;
  const [meta, ctxs] = data;
  meta.universe.forEach((asset, i) => {
    const funding = ctxs[i]?.funding;
    if (funding !== undefined) rates.set(asset.name, Number(funding));
  });
  return rates;
}

interface HlFundingEntry {
  time: number;
  fundingRate: string;
}

export async function fetchHyperliquidHistory(asset: string, sinceMs: number): Promise<FundingPoint[]> {
  const data = await postJson<HlFundingEntry[]>(
    'https://api.hyperliquid.xyz/info',
    { type: 'fundingHistory', coin: asset, startTime: sinceMs },
    HISTORY_TTL_MS,
  );
  if (!data) return [];
  return data.map((e) => ({ timestamp: e.time, rate: Number(e.fundingRate) }));
}

// ---------- Aster (fapi.asterdex.com) — native 8h funding period ----------
// CORS split: premiumIndex (current rate) sends CORS headers, so it's fetched directly and works
// everywhere. fundingRate (history) does NOT, so it's routed through the relative `/aster-api`
// path — proxied server-side by the Vite dev server in development, and by a one-line host rewrite
// (Vercel/Netlify) in production. If no proxy is present, only history degrades to empty (the
// current rate still loads), so Aster never fully disappears.

interface AsterPremium {
  symbol: string;
  lastFundingRate: string;
}

export async function fetchAsterCurrentRates(): Promise<Map<string, number>> {
  const data = await cachedFetchJson<AsterPremium[]>('https://fapi.asterdex.com/fapi/v1/premiumIndex', CURRENT_TTL_MS);
  const rates = new Map<string, number>();
  if (!data) return rates;
  for (const p of data) {
    if (!p.symbol.endsWith('USDT')) continue;
    rates.set(p.symbol.slice(0, -4), Number(p.lastFundingRate));
  }
  return rates;
}

interface AsterFundingEntry {
  fundingTime: number;
  fundingRate: string;
}

export async function fetchAsterHistory(symbol: string, limit: number): Promise<FundingPoint[]> {
  const data = await cachedFetchJson<AsterFundingEntry[]>(
    `/aster-api/fapi/v1/fundingRate?symbol=${symbol}USDT&limit=${limit}`,
    HISTORY_TTL_MS,
  );
  if (!data) return [];
  return data.map((e) => ({ timestamp: e.fundingTime, rate: Number(e.fundingRate) }));
}

// ---------- Lighter (mainnet.zklighter.elliot.ai) ----------
// Unit gotcha: Lighter's two funding endpoints use different units. The current `funding-rates`
// `rate` is an 8-HOUR fraction; the `fundings` history `rate` is a PER-HOUR PERCENT. We normalize
// both to the per-hour fraction the rest of the pipeline expects (so periodHours stays 1).

interface LighterCurrentEntry {
  market_id: number;
  exchange: string;
  symbol: string;
  rate: number;
}

export async function fetchLighterCurrentRates(): Promise<Map<string, { rate: number; marketId: number }>> {
  const data = await cachedFetchJson<{ funding_rates: LighterCurrentEntry[] }>(
    'https://mainnet.zklighter.elliot.ai/api/v1/funding-rates',
    CURRENT_TTL_MS,
  );
  const rates = new Map<string, { rate: number; marketId: number }>();
  if (!data) return rates;
  for (const entry of data.funding_rates) {
    if (entry.exchange === 'lighter') {
      // rate is an 8h fraction → ÷8 to a per-hour fraction.
      rates.set(entry.symbol.toUpperCase(), { rate: entry.rate / 8, marketId: entry.market_id });
    }
  }
  return rates;
}

interface LighterFundingEntry {
  timestamp: number;
  rate: string;
  direction: 'long' | 'short';
}

export async function fetchLighterHistory(marketId: number, sinceMs: number): Promise<FundingPoint[]> {
  const data = await cachedFetchJson<{ fundings: LighterFundingEntry[] }>(
    `https://mainnet.zklighter.elliot.ai/api/v1/fundings?market_id=${marketId}&resolution=1h&start_timestamp=${sinceMs}&end_timestamp=${Date.now()}&count_back=168`,
    HISTORY_TTL_MS,
  );
  if (!data) return [];
  return data.fundings.map((e) => ({
    timestamp: e.timestamp * 1000,
    // history rate is a per-hour PERCENT → ÷100 to a per-hour fraction; sign by direction.
    rate: ((e.direction === 'short' ? -1 : 1) * Number(e.rate)) / 100,
  }));
}
