import { useDexData } from '../../hooks/useDexData';
import { formatCompactUsd } from '../../utils/format';
import DexMetricCard from './DexMetricCard';
import ComparisonLineChart from './ComparisonLineChart';
import ComparisonBarChart from './ComparisonBarChart';
import FastestGrowingBanner from './FastestGrowingBanner';
import TradingCostsSection from './TradingCostsSection';

export default function DashboardPage() {
  const { loading, error, dexes, snapshots, fastestGrowing } = useDexData();

  return (
    <div className="space-y-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">DEX Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Live TVL, volume, and revenue across Hyperliquid, Lighter, and Aster, sourced from{' '}
          <a href="https://defillama.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
            DefiLlama
          </a>
          .
        </p>
      </div>

      {loading && (
        <div className="flex h-24 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
          <p className="text-sm text-slate-500">Loading live DEX data&hellip;</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <FastestGrowingBanner snapshot={fastestGrowing} />

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Per-DEX Fundamentals
            </h2>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {dexes.map((d) => (
                <DexMetricCard key={d.meta.id} dex={d} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Cross-DEX Comparison
            </h2>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ComparisonLineChart
                title="Total Value Locked (TVL)"
                caption="Tracks each DEX's locked capital over time. Sustained TVL growth signals deepening liquidity and user trust."
                dexes={dexes}
                metricKey="tvl"
              />
              <ComparisonLineChart
                title="DEX Volume"
                caption="Daily trading volume per DEX. Higher and steadier volume reflects stronger trading activity and order flow."
                dexes={dexes}
                metricKey="volume"
              />
              <ComparisonBarChart
                title="Capital Efficiency"
                caption="30-day volume divided by current TVL. Measures how much trading activity each dollar of locked capital generates — higher is more capital-efficient."
                snapshots={snapshots}
                valueKey="capitalEfficiency"
                valueFormatter={(v) => `${v.toFixed(1)}x`}
              />
              <ComparisonBarChart
                title="Revenue (30d)"
                caption="Protocol fee revenue generated over the trailing 30 days."
                snapshots={snapshots}
                valueKey="revenue30d"
                valueFormatter={formatCompactUsd}
              />
            </div>
          </section>

          <TradingCostsSection />
        </>
      )}
    </div>
  );
}
