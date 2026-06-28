import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  caption?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function ChartCard({ title, caption, actions, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
      {caption && <p className="mt-3 text-xs leading-relaxed text-slate-500">{caption}</p>}
    </div>
  );
}
