import { useEffect, useState } from 'react';
import type { AssetMetric, FearGreedRow, MarketData, PositioningRow, TraderPositionRow, TraderRow } from './types';

// Fetches the static JSON the ETL pipeline exports from BigQuery
// (public/market/*.json). In production a daily cron overwrites these files on
// a public bucket; the app just fetch()es them -- same pattern as PerpScope's
// other features. See ETL/export/export_marts.py.

interface State {
  loading: boolean;
  error: string | null;
  data: MarketData | null;
}

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(`/market/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`);
  return res.json();
}

export function useMarketData(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [assetMetrics, positioning, activeTraders, traderPositions, fearGreed] = await Promise.all([
          getJson<AssetMetric[]>('asset_metrics'),
          getJson<PositioningRow[]>('positioning'),
          getJson<TraderRow[]>('active_traders'),
          getJson<TraderPositionRow[]>('trader_positions'),
          getJson<FearGreedRow[]>('fear_greed'),
        ]);
        if (cancelled) return;
        const asOf = assetMetrics[0]?.snapshot_date ?? '';
        setState({
          loading: false,
          error: null,
          data: { assetMetrics, positioning, activeTraders, traderPositions, fearGreed, asOf },
        });
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, error: (e as Error).message, data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
