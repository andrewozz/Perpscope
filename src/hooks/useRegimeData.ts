import { useEffect, useState } from 'react';
import { fetchBtcDaily } from '../api/binanceRegime';
import { computeFeatures } from '../utils/regimeFeatures';
import { inferRegime } from '../utils/hmmInference';
import { regimeMeta } from '../features/engine/regimeMeta';
import type { RegimeResult, RegimePricePoint } from '../types/regime';

interface RegimeState {
  loading: boolean;
  error: string | null;
  result: RegimeResult | null;
  prices: RegimePricePoint[];
}

export function useRegimeData(): RegimeState {
  const [state, setState] = useState<RegimeState>({ loading: true, error: null, result: null, prices: [] });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const bars = await fetchBtcDaily();
        const features = computeFeatures(bars);
        const result = inferRegime(features);
        if (cancelled) return;
        if (!result) {
          setState({ loading: false, error: 'Not enough data to classify the regime.', result: null, prices: [] });
          return;
        }

        // join the full decoded regime history with the close prices (the chart picks the range)
        const closeByDate = new Map(bars.map((b) => [b.date, b.close]));
        const prices: RegimePricePoint[] = result.history.map((h) => ({
          date: h.date,
          close: closeByDate.get(h.date) ?? 0,
          label: h.label,
          color: regimeMeta(h.label).color,
        }));

        setState({ loading: false, error: null, result, prices });
      } catch {
        if (cancelled) return;
        setState({ loading: false, error: 'Failed to load live market data.', result: null, prices: [] });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
