export interface RegimeMeta {
  color: string;
  description: string;
  guidance: string;
}

/** Display metadata keyed by the HMM's state labels. */
export const REGIME_META: Record<string, RegimeMeta> = {
  'Bull / Risk-on': {
    color: '#34d399',
    description: 'Strong, sustained uptrend with healthy participation.',
    guidance: 'Trend-follow — ride longs and buy dips. Watch funding: richly positive means crowded longs.',
  },
  'Accumulation / Recovery': {
    color: '#38bdf8',
    description: 'Quiet, low-volatility base — often built before a larger move.',
    guidance: 'Position early with good risk/reward; watch for a breakout as volatility expands.',
  },
  'Range / Neutral': {
    color: '#fbbf24',
    description: 'Choppy, sideways market with no clear trend.',
    guidance: 'Mean-revert — fade the edges, keep leverage low. Market-neutral / funding-arb shines here.',
  },
  'Bear / Downtrend': {
    color: '#ec4899',
    description: 'Sustained downtrend — falling prices with elevated volatility.',
    guidance: 'Risk-off — favour shorts or cash, avoid bottom-picking, keep size small.',
  },
  'Capitulation / Crash': {
    color: '#ef4444',
    description: 'Violent, high-volatility selloff — rare and short-lived.',
    guidance: 'Capital preservation — cut leverage hard, do not catch the falling knife.',
  },
};

const FALLBACK: RegimeMeta = { color: '#94a3b8', description: 'Transitional state.', guidance: 'Wait for a clearer regime.' };

export function regimeMeta(label: string): RegimeMeta {
  return REGIME_META[label] ?? FALLBACK;
}
