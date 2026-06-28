import { cachedFetchJson } from '../utils/httpCache';
import type { CostExchangeMeta, OrderBook } from '../types/tradingCost';

const BOOK_TTL_MS = 20 * 1000; // order books move fast — keep snapshots fresh
const MARKETS_TTL_MS = 60 * 60 * 1000; // market list & fee schedule rarely change

// Taker/maker fees are published schedules (base tier). Lighter is read live from its API below
// and is currently 0/0. Update these if the venues change their fee tiers.
//  - Hyperliquid: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees (base 0.045% / 0.015%)
//  - Aster: standard perp schedule per https://docs.asterdex.com (verify current tier)
export const COST_EXCHANGES: CostExchangeMeta[] = [
  { id: 'hyperliquid', name: 'Hyperliquid', color: '#34d399', takerFeePct: 0.045, makerFeePct: 0.015, feeSource: 'hyperliquid.gitbook.io' },
  { id: 'aster', name: 'Aster', color: '#f472b6', takerFeePct: 0.035, makerFeePct: 0.01, feeSource: 'docs.asterdex.com' },
  { id: 'lighter', name: 'Lighter', color: '#38bdf8', takerFeePct: 0, makerFeePct: 0, feeSource: 'live (zklighter API)' },
];

// ---------- Hyperliquid ----------
interface HlLevel { px: string; sz: string }
export async function fetchHyperliquidBook(coin: string): Promise<OrderBook | null> {
  const data = await cachedFetchJson<{ levels: [HlLevel[], HlLevel[]] }>(
    `https://api.hyperliquid.xyz/info#l2Book:${coin}`,
    BOOK_TTL_MS,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'l2Book', coin }) },
  );
  if (!data?.levels) return null;
  const toLevels = (ls: HlLevel[]): [number, number][] => ls.map((l) => [Number(l.px), Number(l.sz)]);
  return { bids: toLevels(data.levels[0]), asks: toLevels(data.levels[1]) };
}

// ---------- Aster (Binance-style depth) ----------
export async function fetchAsterBook(symbol: string): Promise<OrderBook | null> {
  const data = await cachedFetchJson<{ bids: [string, string][]; asks: [string, string][] }>(
    `https://fapi.asterdex.com/fapi/v1/depth?symbol=${symbol}USDT&limit=500`,
    BOOK_TTL_MS,
  );
  if (!data?.bids || !data?.asks) return null;
  const toLevels = (ls: [string, string][]): [number, number][] => ls.map((l) => [Number(l[0]), Number(l[1])]);
  return { bids: toLevels(data.bids), asks: toLevels(data.asks) };
}

// ---------- Lighter (per-order book; aggregate to price levels) ----------
interface LighterOrder { price: string; remaining_base_amount: string }
export async function fetchLighterBook(marketId: number): Promise<OrderBook | null> {
  const data = await cachedFetchJson<{ bids: LighterOrder[]; asks: LighterOrder[] }>(
    `https://mainnet.zklighter.elliot.ai/api/v1/orderBookOrders?market_id=${marketId}&limit=250`,
    BOOK_TTL_MS,
  );
  if (!data?.bids || !data?.asks) return null;
  const aggregate = (orders: LighterOrder[]): Map<number, number> => {
    const levels = new Map<number, number>();
    for (const o of orders) {
      const price = Number(o.price);
      levels.set(price, (levels.get(price) ?? 0) + Number(o.remaining_base_amount));
    }
    return levels;
  };
  const bids = [...aggregate(data.bids).entries()].sort((a, b) => b[0] - a[0]);
  const asks = [...aggregate(data.asks).entries()].sort((a, b) => a[0] - b[0]);
  return { bids, asks };
}

// ---------- Lighter market list (symbol -> market id, live fees) ----------
interface LighterMarketDetail { symbol: string; market_id: number; status: string; taker_fee: string; maker_fee: string }
export interface LighterMarket { marketId: number; takerFeePct: number; makerFeePct: number }

/** Symbols listed on at least 2 of the 3 venues — i.e. assets worth comparing costs across. */
export async function fetchTradableSymbols(): Promise<Set<string>> {
  const [hl, aster, lighter] = await Promise.all([
    cachedFetchJson<{ universe: { name: string }[] }>('https://api.hyperliquid.xyz/info#meta', MARKETS_TTL_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    }),
    cachedFetchJson<{ symbol: string }[]>('https://fapi.asterdex.com/fapi/v1/premiumIndex', MARKETS_TTL_MS),
    fetchLighterMarkets(),
  ]);

  const counts = new Map<string, number>();
  const bump = (sym: string) => counts.set(sym, (counts.get(sym) ?? 0) + 1);
  hl?.universe.forEach((u) => bump(u.name.toUpperCase()));
  aster?.filter((p) => p.symbol.endsWith('USDT')).forEach((p) => bump(p.symbol.slice(0, -4).toUpperCase()));
  [...lighter.keys()].forEach((sym) => bump(sym));

  const tradable = new Set<string>();
  for (const [sym, count] of counts) if (count >= 2) tradable.add(sym);
  return tradable;
}

export async function fetchLighterMarkets(): Promise<Map<string, LighterMarket>> {
  const data = await cachedFetchJson<{ order_book_details: LighterMarketDetail[] }>(
    'https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails',
    MARKETS_TTL_MS,
  );
  const map = new Map<string, LighterMarket>();
  if (!data?.order_book_details) return map;
  for (const m of data.order_book_details) {
    if (m.status !== 'active') continue;
    map.set(m.symbol.toUpperCase(), {
      marketId: m.market_id,
      takerFeePct: Number(m.taker_fee), // already in %
      makerFeePct: Number(m.maker_fee),
    });
  }
  return map;
}
