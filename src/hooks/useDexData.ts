import { useEffect, useState } from 'react';
import { DEX_META, buildDexData, getFastestGrowing } from '../utils/buildDexData';
import type { DexData, Dex30dSnapshot } from '../types/dex';

interface DexDataState {
  loading: boolean;
  error: string | null;
  dexes: DexData[];
  snapshots: Dex30dSnapshot[];
  fastestGrowing: Dex30dSnapshot | null;
}

export function useDexData(): DexDataState {
  const [state, setState] = useState<DexDataState>({
    loading: true,
    error: null,
    dexes: [],
    snapshots: [],
    fastestGrowing: null,
  });

  useEffect(() => {
    let cancelled = false;

    // Fetch each DEX independently and update the UI as each one arrives (progressive rendering),
    // so the page shows the first card in ~2s instead of waiting for the slowest DEX (~6s).
    // Results are kept at their DEX_META index so cards always appear in a stable order.
    const results: (DexData | null)[] = DEX_META.map(() => null);
    let completed = 0;

    DEX_META.forEach((meta, i) => {
      buildDexData(meta)
        .then((dex) => {
          if (!cancelled) results[i] = dex;
        })
        .catch(() => {
          /* a failed DEX stays null and is simply omitted */
        })
        .finally(() => {
          if (cancelled) return;
          completed += 1;
          const dexes = results.filter((d): d is DexData => d !== null);
          const snapshots = dexes.map((d) => d.snapshot).filter((s): s is Dex30dSnapshot => s !== null);
          const allDone = completed === DEX_META.length;
          setState({
            loading: false, // reveal content as soon as the first DEX is ready
            error: allDone && dexes.every((d) => !d.hasAnyData) ? 'Live data is currently unavailable.' : null,
            dexes,
            snapshots,
            fastestGrowing: getFastestGrowing(snapshots),
          });
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
