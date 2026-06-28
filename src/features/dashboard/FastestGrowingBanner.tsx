import { formatPercent } from '../../utils/format';
import type { Dex30dSnapshot } from '../../types/dex';

export default function FastestGrowingBanner({ snapshot }: { snapshot: Dex30dSnapshot | null }) {
  if (!snapshot || snapshot.tvlGrowth30d === null) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
        <p className="text-sm text-slate-500">Not enough live TVL history yet to determine the fastest-growing DEX.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M3 14 7 9l3 2.5L15 5"
            stroke="#34d399"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M11 5h4v4" stroke="#34d399" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">Fastest Growing DEX</p>
        <p className="mt-0.5 text-sm text-slate-200">
          <span className="font-semibold text-slate-100">{snapshot.name}</span> leads with{' '}
          <span className="font-semibold text-emerald-400">{formatPercent(snapshot.tvlGrowth30d)}</span> TVL growth
          over the past 30 days.
        </p>
      </div>
    </div>
  );
}
