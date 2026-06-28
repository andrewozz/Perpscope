import { useMemo, useState } from 'react';
import Pagination from '../../components/Pagination';
import { FUNDING_EXCHANGE_META } from '../../types/funding';
import { formatPercent } from '../../utils/format';
import type { ArbOpportunity } from '../../types/funding';

type SortKey = 'asset' | 'marketCapRank' | 'spreadApy' | 'persistence24h' | 'persistence7d' | 'stability';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'marketCapRank', label: 'Mkt Cap' },
  { key: 'asset', label: 'Asset' },
  { key: 'spreadApy', label: 'Est. APY' },
  { key: 'persistence24h', label: 'Persistence (24h)' },
  { key: 'persistence7d', label: 'Persistence (7d)' },
  { key: 'stability', label: 'Stability' },
];

const PAGE_SIZE = 10;

function sortValue(o: ArbOpportunity, key: SortKey): number | string {
  if (key === 'asset') return o.asset;
  // Score columns are number | null; nulls (too little history) sort last.
  if (key === 'persistence24h' || key === 'persistence7d' || key === 'stability') return o[key] ?? -1;
  return o[key];
}

function scoreColor(value: number): string {
  if (value >= 0.8) return 'text-emerald-400';
  if (value >= 0.6) return 'text-amber-400';
  return 'text-slate-400';
}

export default function ArbitrageTable({ opportunities }: { opportunities: ArbOpportunity[] }) {
  // null sortKey = default Profitability Ranker order (already sorted by composite score upstream)
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey) return opportunities;
    const rows = [...opportunities];
    rows.sort((a, b) => {
      const aVal = sortValue(a, sortKey);
      const bVal = sortValue(b, sortKey);
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : aVal - (bVal as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [opportunities, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Rank/asset read most naturally ascending (rank 1, A→Z); metrics descending (biggest first).
      setSortDir(key === 'marketCapRank' || key === 'asset' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  if (opportunities.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-5 py-10 text-center">
        <p className="text-sm text-slate-500">
          No funding spreads currently clear the {'>'}3% APY threshold across Hyperliquid, Lighter, and Aster.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              {COLUMNS.slice(0, 2).map((col) => (
                <SortableHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              ))}
              <th className="px-3 py-2 font-medium">Long</th>
              <th className="px-3 py-2 font-medium">Short</th>
              {COLUMNS.slice(2).map((col) => (
                <SortableHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((o) => (
              <tr key={o.asset} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-900/60">
                <td className="px-3 py-3 text-slate-500">#{o.marketCapRank}</td>
                <td className="px-3 py-3 font-semibold text-slate-100">{o.asset}</td>
                <td className="px-3 py-3">
                  <span style={{ color: FUNDING_EXCHANGE_META[o.longExchange].color }}>
                    {FUNDING_EXCHANGE_META[o.longExchange].name}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span style={{ color: FUNDING_EXCHANGE_META[o.shortExchange].color }}>
                    {FUNDING_EXCHANGE_META[o.shortExchange].name}
                  </span>
                </td>
                <td className="px-3 py-3 font-semibold text-emerald-400">{formatPercent(o.spreadApy)}</td>
                <ScoreCell value={o.persistence24h} />
                <ScoreCell value={o.persistence7d} />
                <ScoreCell value={o.stability} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </div>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  return (
    <td className="px-3 py-3">
      {value === null ? (
        <span className="font-medium text-slate-600" title="Too little funding history to judge">
          —
        </span>
      ) : (
        <span className={`font-semibold ${scoreColor(value)}`}>{Math.round(value * 100)}%</span>
      )}
    </td>
  );
}

function SortableHeader({
  col,
  sortKey,
  sortDir,
  onClick,
}: {
  col: { key: SortKey; label: string };
  sortKey: SortKey | null;
  sortDir: 'asc' | 'desc';
  onClick: (key: SortKey) => void;
}) {
  const active = sortKey === col.key;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onClick(col.key)}
        className={`flex items-center gap-1 transition-colors ${active ? 'text-emerald-400' : 'hover:text-slate-300'}`}
      >
        {col.label}
        <span className="text-[10px]">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}
