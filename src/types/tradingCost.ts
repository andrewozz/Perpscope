export type CostExchangeId = 'hyperliquid' | 'aster' | 'lighter';

export interface CostExchangeMeta {
  id: CostExchangeId;
  name: string;
  color: string;
  takerFeePct: number; // % per side
  makerFeePct: number; // %
  feeSource: string;
}

/** Order book with [price, size] levels — bids descending, asks ascending. */
export interface OrderBook {
  bids: [number, number][];
  asks: [number, number][];
}

export interface CostBreakdown {
  exchange: CostExchangeId;
  name: string;
  color: string;
  available: boolean; // book fetched and priced
  insufficientDepth: boolean; // book too thin for the trade size
  mid: number;
  quotedSpreadPct: number; // full bid-ask spread (liquidity indicator)
  feePct: number; // taker fee
  spreadCostPct: number; // half-spread: cost to cross to the best price
  slippagePct: number; // depth impact beyond the best price for the size
  totalPct: number; // feePct + spreadCostPct + slippagePct
  totalUsd: number; // totalPct% of the trade size
}
