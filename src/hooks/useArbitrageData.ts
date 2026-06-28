import { useEffect, useState } from 'react';
import { buildArbitrageOpportunities } from '../utils/buildArbitrage';
import type { ArbOpportunity } from '../types/funding';

interface ArbitrageState {
  loading: boolean;
  error: string | null;
  opportunities: ArbOpportunity[];
}

export function useArbitrageData(): ArbitrageState {
  const [state, setState] = useState<ArbitrageState>({ loading: true, error: null, opportunities: [] });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const opportunities = await buildArbitrageOpportunities();
        if (cancelled) return;
        setState({ loading: false, error: null, opportunities });
      } catch {
        if (cancelled) return;
        setState({ loading: false, error: 'Failed to load live funding rate data.', opportunities: [] });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
