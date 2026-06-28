import type { CostExchangeMeta, CostBreakdown, OrderBook } from '../types/tradingCost';

/** Volume-weighted average fill price to market-buy `notionalUsd`, walking the asks. null if the book is too thin. */
function buyVwap(asks: [number, number][], notionalUsd: number): number | null {
  let remaining = notionalUsd;
  let baseFilled = 0;
  let cost = 0;
  for (const [price, size] of asks) {
    const levelUsd = price * size;
    const takeUsd = Math.min(levelUsd, remaining);
    const base = takeUsd / price;
    cost += base * price;
    baseFilled += base;
    remaining -= takeUsd;
    if (remaining <= 0) break;
  }
  if (remaining > 0 || baseFilled === 0) return null;
  return cost / baseFilled;
}

/**
 * Decomposes the all-in cost of market-buying `notionalUsd` of an asset into the three additive
 * components fee + spread + slippage (each a % of notional), which sum to the total cost:
 *   - spreadCost = (bestAsk − mid)/mid  → half the quoted spread, the cost to reach the best price
 *   - slippage   = (avgFill − bestAsk)/mid → extra impact from walking deeper for the size
 *   - fee        = taker fee
 */
export function computeCost(
  meta: CostExchangeMeta,
  book: OrderBook | null,
  notionalUsd: number,
): CostBreakdown {
  const base: CostBreakdown = {
    exchange: meta.id,
    name: meta.name,
    color: meta.color,
    available: false,
    insufficientDepth: false,
    mid: 0,
    quotedSpreadPct: 0,
    feePct: meta.takerFeePct,
    spreadCostPct: 0,
    slippagePct: 0,
    totalPct: 0,
    totalUsd: 0,
  };

  if (!book || book.bids.length === 0 || book.asks.length === 0) return base;

  const bestBid = book.bids[0][0];
  const bestAsk = book.asks[0][0];
  const mid = (bestBid + bestAsk) / 2;
  const quotedSpreadPct = ((bestAsk - bestBid) / mid) * 100;

  const avgFill = buyVwap(book.asks, notionalUsd);
  if (avgFill === null) {
    return { ...base, available: true, insufficientDepth: true, mid, quotedSpreadPct };
  }

  const spreadCostPct = ((bestAsk - mid) / mid) * 100;
  const slippagePct = ((avgFill - bestAsk) / mid) * 100;
  const totalPct = meta.takerFeePct + spreadCostPct + slippagePct;

  return {
    ...base,
    available: true,
    mid,
    quotedSpreadPct,
    spreadCostPct,
    slippagePct,
    totalPct,
    totalUsd: (totalPct / 100) * notionalUsd,
  };
}

/** Cheapest available, sufficiently-deep venue by total cost. null if none priced. */
export function cheapestVenue(breakdowns: CostBreakdown[]): CostBreakdown | null {
  const priced = breakdowns.filter((b) => b.available && !b.insufficientDepth);
  if (priced.length === 0) return null;
  return priced.reduce((best, b) => (b.totalPct < best.totalPct ? b : best));
}
