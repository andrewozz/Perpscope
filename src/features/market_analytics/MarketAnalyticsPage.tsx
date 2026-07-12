import { useMarketData } from './useMarketData';
import MarketStructureSection from './MarketStructureSection';
import OpenInterestSection from './OpenInterestSection';
import SmartMoneySection from './SmartMoneySection';

export default function MarketAnalyticsPage() {
  const { loading, error, data } = useMarketData();

  return (
    <div className="space-y-8 px-6 py-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-100">Market Analytics</h1>
          {data && (
            <span className="rounded-md border border-slate-700 bg-slate-800/50 px-2 py-0.5 text-xs text-slate-400">
              data as of {data.asOf}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          An automated <span className="text-slate-300">ELT pipeline</span> (Python → Google BigQuery → dbt) pulls
          Hyperliquid, CoinGecko and sentiment data daily, transforms it into insight-ready fact tables, and exports
          them as static JSON this dashboard reads live. Three lenses: overall market structure, where leverage is
          rotating, and what the smartest traders are doing.
        </p>
      </div>

      {loading && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
          <p className="text-sm text-slate-500">Loading market analytics…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4">
          <p className="text-sm text-rose-400">Couldn&apos;t load the pipeline data: {error}</p>
          <p className="mt-1 text-xs text-slate-500">
            Run <span className="font-mono text-slate-400">python -m export.export_marts</span> from the ETL folder to
            regenerate <span className="font-mono text-slate-400">public/market/*.json</span>.
          </p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-10">
          <MarketStructureSection fearGreed={data.fearGreed} />
          <OpenInterestSection assetMetrics={data.assetMetrics} />
          <SmartMoneySection
            activeTraders={data.activeTraders}
            traderPositions={data.traderPositions}
            positioning={data.positioning}
          />
        </div>
      )}

      <p className="border-t border-slate-800/60 pt-4 text-[11px] text-slate-600">
        Live cards read the BigQuery marts directly (via the daily JSON export). Cards marked{' '}
        <span className="text-amber-500/80">Mock data</span> are wired and correct, but their columns stay null until
        the pipeline accrues enough daily snapshots (24h / 7d / 30d lookbacks) — they fill in automatically over the
        first weeks of the pipeline running. See <span className="text-slate-500">ETL/docs/VERIFICATION.md</span>.
      </p>
    </div>
  );
}
