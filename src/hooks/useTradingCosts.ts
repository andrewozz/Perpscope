import { useEffect, useState } from 'react';
import {
  COST_EXCHANGES,
  fetchHyperliquidBook,
  fetchAsterBook,
  fetchLighterBook,
  fetchLighterMarkets,
  fetchTradableSymbols,
} from '../api/orderbookApi';
import { computeCost, cheapestVenue } from '../utils/tradingCost';
import { fetchTopAssets } from '../api/coingecko';
import type { CostBreakdown } from '../types/tradingCost';

/** Top-20 assets by market cap (ex stablecoins/wrapped) that are listed on ≥2 of the 3 venues. */
export function useTopAssets(): string[] {
  const [assets, setAssets] = useState<string[]>(['BTC']);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTopAssets(40), fetchTradableSymbols()]).then(([top, tradable]) => {
      if (cancelled) return;
      const list = top.map((a) => a.symbol).filter((s) => tradable.has(s)).slice(0, 20);
      if (list.length > 0) setAssets(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return assets;
}

interface TradingCostsState {
  loading: boolean;
  error: string | null;
  breakdowns: CostBreakdown[];
  cheapest: CostBreakdown | null;
}

export function useTradingCosts(asset: string, sizeUsd: number): TradingCostsState {
  const [state, setState] = useState<TradingCostsState>({
    loading: true,
    error: null,
    breakdowns: [],
    cheapest: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    async function load() {
      const lighterMarkets = await fetchLighterMarkets();
      const lighterMarket = lighterMarkets.get(asset);

      const [hlBook, asterBook, lighterBook] = await Promise.all([
        fetchHyperliquidBook(asset),
        fetchAsterBook(asset),
        lighterMarket ? fetchLighterBook(lighterMarket.marketId) : Promise.resolve(null),
      ]);
      if (cancelled) return;

      const books = { hyperliquid: hlBook, aster: asterBook, lighter: lighterBook };
      const breakdowns = COST_EXCHANGES.map((meta) => computeCost(meta, books[meta.id], sizeUsd));
      const anyPriced = breakdowns.some((b) => b.available && !b.insufficientDepth);

      setState({
        loading: false,
        error: anyPriced ? null : `No live order-book data available for ${asset}.`,
        breakdowns,
        cheapest: cheapestVenue(breakdowns),
      });
    }

    load().catch(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: false, error: 'Failed to load order-book data.' }));
    });

    return () => {
      cancelled = true;
    };
  }, [asset, sizeUsd]);

  return state;
}
