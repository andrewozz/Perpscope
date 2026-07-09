import type { ReactNode } from 'react';

interface InsightCardProps {
  title: string;
  subtitle?: string;
  /** what the metric measures (the "definition") */
  metric: string;
  /** how a trader reads it to get an edge (the "so what") */
  insight: string;
  /** show the amber "Mock data" pill when the underlying column isn't populated yet */
  isMock?: boolean;
  /** optional extra note under the mock pill (e.g. why it's mock) */
  mockNote?: string;
  className?: string;
  children: ReactNode;
}

export default function InsightCard({
  title,
  subtitle,
  metric,
  insight,
  isMock = false,
  mockNote,
  className = '',
  children,
}: InsightCardProps) {
  return (
    <div className={`flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {isMock && (
          <span
            title={mockNote ?? 'Placeholder values — the real metric needs more daily history to accrue.'}
            className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400"
          >
            Mock data
          </span>
        )}
      </div>

      <div className="flex-1 px-5 py-4">{children}</div>

      <div className="space-y-2 border-t border-slate-800/70 bg-slate-950/30 px-5 py-3.5">
        <p className="text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">Metric · </span>
          {metric}
        </p>
        <p className="text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-emerald-400/90">Insight · </span>
          {insight}
        </p>
        {isMock && mockNote && <p className="text-[11px] italic text-amber-500/70">{mockNote}</p>}
      </div>
    </div>
  );
}
