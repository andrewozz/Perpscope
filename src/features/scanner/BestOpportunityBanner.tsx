import { FUNDING_EXCHANGE_META } from '../../types/funding';
import { formatPercent } from '../../utils/format';
import type { ArbOpportunity } from '../../types/funding';

export default function BestOpportunityBanner({ opportunity }: { opportunity: ArbOpportunity | null }) {
  if (!opportunity) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
        <p className="text-sm text-slate-500">No qualifying arbitrage spreads right now — check back after the next funding cycle.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="7" stroke="#34d399" strokeWidth="1.6" />
          <circle cx="9" cy="9" r="3.2" stroke="#34d399" strokeWidth="1.6" />
          <circle cx="9" cy="9" r="0.9" fill="#34d399" />
        </svg>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">Best Opportunity</p>
        <p className="mt-0.5 text-sm text-slate-200">
          <span className="font-semibold text-slate-100">{opportunity.asset}</span>: long{' '}
          <span className="font-semibold">{FUNDING_EXCHANGE_META[opportunity.longExchange].name}</span> / short{' '}
          <span className="font-semibold">{FUNDING_EXCHANGE_META[opportunity.shortExchange].name}</span> at{' '}
          <span className="font-semibold text-emerald-400">{formatPercent(opportunity.spreadApy)} APY</span>
          {opportunity.persistence7d !== null && (
            <>
              , profitable{' '}
              <span className="font-semibold text-emerald-400">
                {Math.round(opportunity.persistence7d * 100)}%
              </span>{' '}
              of the past 7 days
            </>
          )}
          .
        </p>
      </div>
    </div>
  );
}
