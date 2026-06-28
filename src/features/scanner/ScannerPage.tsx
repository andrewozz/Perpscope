import { useArbitrageData } from '../../hooks/useArbitrageData';
import BestOpportunityBanner from './BestOpportunityBanner';
import ArbitrageTable from './ArbitrageTable';

export default function ScannerPage() {
  const { loading, error, opportunities } = useArbitrageData();

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Funding Rate Arbitrage Scanner</h1>
        <p className="mt-1 text-sm text-slate-400">
          Live funding rates for the top 20 assets by market cap across Hyperliquid, Lighter, and Aster. Spreads
          below 3% APY are filtered out as not worth the trade.
        </p>
      </div>

      {loading && (
        <div className="flex h-24 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
          <p className="text-sm text-slate-500">Scanning live funding rates&hellip;</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <BestOpportunityBanner opportunity={opportunities[0] ?? null} />

          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Arbitrage Opportunities</h2>
              <p className="mt-1 text-xs text-slate-500">
                Est. APY is the annualized funding rate spread between the cheapest exchange to go long and the
                richest exchange to go short. <span className="text-slate-400">Persistence (24h / 7d)</span> is the
                share of that window the spread stayed in the profitable direction — 100% means the position would
                have earned funding every hour (&ldquo;always earning&rdquo;), 50% means it flipped against you half
                the time. <span className="text-slate-400">Stability</span> is |mean| ÷ (|mean| + std) of the spread&rsquo;s
                magnitude over 7 days — how steady the spread&rsquo;s size has been (100% ≈ a flat line, low ≈ spikes
                here and there), independent of direction. So read them together: high Persistence = reliably
                earning, high Stability = steady size, big Est. APY = worth it. A “—” means too little funding
                history to judge. Sorted by a blended rank of spread size and persistence by default; click any
                column to re-sort.
              </p>
            </div>
            <ArbitrageTable opportunities={opportunities} />
          </section>
        </>
      )}
    </div>
  );
}
