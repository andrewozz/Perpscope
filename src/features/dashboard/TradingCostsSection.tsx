import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTradingCosts, useTopAssets } from '../../hooks/useTradingCosts';
import { formatCompactUsd } from '../../utils/format';
import type { CostBreakdown } from '../../types/tradingCost';

const SIZE_PRESETS = [1000, 10000, 50000, 100000, 500000, 1000000];
const COMPONENTS = [
  { key: 'feePct', label: 'Fee', color: '#64748b' },
  { key: 'spreadCostPct', label: 'Spread', color: '#fbbf24' },
  { key: 'slippagePct', label: 'Slippage', color: '#f43f5e' },
] as const;

const pct = (v: number) => `${v.toFixed(4)}%`;
const usd = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export default function TradingCostsSection() {
  const [asset, setAsset] = useState('BTC');
  const [size, setSize] = useState(10000);
  const assets = useTopAssets();
  const { loading, error, breakdowns, cheapest } = useTradingCosts(asset, size);

  const priced = breakdowns.filter((b) => b.available && !b.insufficientDepth);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Trading Cost Comparison</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            The real cost to enter a position = <span className="text-slate-400">fee + spread + slippage</span>. Pick an
            asset and trade size to see which venue is cheapest to market-buy right now, computed live from each DEX&rsquo;s
            order book.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          >
            {assets.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-slate-800">
            {SIZE_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  size === s ? 'bg-emerald-400/15 text-emerald-400' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {usd(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        {loading && <p className="py-8 text-center text-sm text-slate-500">Loading order books&hellip;</p>}
        {!loading && error && <p className="py-8 text-center text-sm text-rose-400">{error}</p>}

        {!loading && !error && (
          <>
            {cheapest && (
              <div className="mb-5 flex items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">Cheapest</span>
                <p className="text-sm text-slate-200">
                  <span className="font-semibold text-slate-100">{cheapest.name}</span> — total cost{' '}
                  <span className="font-semibold text-emerald-400">{pct(cheapest.totalPct)}</span> (
                  {formatCompactUsd(cheapest.totalUsd)}) to market-buy {usd(size)} of {asset}.
                </p>
              </div>
            )}

            {priced.length > 0 && (
              <ResponsiveContainer width="100%" height={60 + priced.length * 48}>
                <BarChart data={priced} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${Number(v).toFixed(3)}%`}
                    stroke="#475569"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={84}
                    stroke="#475569"
                    tick={{ fill: '#cbd5e1', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: '#1e293b', opacity: 0.4 }}
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    labelStyle={{ color: '#cbd5e1' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    formatter={(value, name) => [pct(Number(value)), name as string]}
                  />
                  {COMPONENTS.map((c) => (
                    <Bar
                      key={c.key}
                      dataKey={c.key}
                      name={c.label}
                      stackId="cost"
                      fill={c.color}
                      radius={c.key === 'slippagePct' ? [0, 4, 4, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              {COMPONENTS.map((c) => (
                <span key={c.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                  {c.label}
                </span>
              ))}
            </div>

            <CostTable breakdowns={breakdowns} cheapest={cheapest} size={size} />

            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
              Spread shown is the cost to cross to the best price (half the quoted bid-ask). Slippage is the extra
              price impact of walking the book for your size. Fees are base-tier taker fees from each venue&rsquo;s
              published schedule (Lighter is currently 0). Costs are for a market buy; maker / limit orders pay less.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function CostTable({
  breakdowns,
  cheapest,
  size,
}: {
  breakdowns: CostBreakdown[];
  cheapest: CostBreakdown | null;
  size: number;
}) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-medium">Exchange</th>
            <th className="px-3 py-2 font-medium">Fee</th>
            <th className="px-3 py-2 font-medium" title="Cost to cross to the best price (half the quoted bid-ask spread)">
              Spread
            </th>
            <th className="px-3 py-2 font-medium" title="Price impact of walking the book for your trade size">
              Slippage
            </th>
            <th className="px-3 py-2 font-medium">Total cost</th>
            <th className="px-3 py-2 font-medium">Cost on {usd(size)}</th>
          </tr>
        </thead>
        <tbody>
          {breakdowns.map((b) => {
            const isCheapest = cheapest?.exchange === b.exchange;
            if (!b.available) {
              return (
                <tr key={b.exchange} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-3 font-semibold" style={{ color: b.color }}>
                    {b.name}
                  </td>
                  <td className="px-3 py-3 text-slate-600" colSpan={5}>
                    No live order book
                  </td>
                </tr>
              );
            }
            if (b.insufficientDepth) {
              return (
                <tr key={b.exchange} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-3 font-semibold" style={{ color: b.color }}>
                    {b.name}
                  </td>
                  <td className="px-3 py-3 text-slate-600" colSpan={5}>
                    Order book too thin for {usd(size)} (spread {pct(b.quotedSpreadPct)})
                  </td>
                </tr>
              );
            }
            return (
              <tr
                key={b.exchange}
                className={`border-b border-slate-800/60 last:border-0 ${isCheapest ? 'bg-emerald-400/5' : ''}`}
              >
                <td className="px-3 py-3 font-semibold" style={{ color: b.color }}>
                  {b.name}
                  {isCheapest && <span className="ml-2 text-[10px] font-medium text-emerald-400">CHEAPEST</span>}
                </td>
                <td className="px-3 py-3 text-slate-300">{pct(b.feePct)}</td>
                <td className="px-3 py-3 text-slate-300">{pct(b.spreadCostPct)}</td>
                <td className="px-3 py-3 text-slate-300">{pct(b.slippagePct)}</td>
                <td className={`px-3 py-3 font-semibold ${isCheapest ? 'text-emerald-400' : 'text-slate-100'}`}>
                  {pct(b.totalPct)}
                </td>
                <td className="px-3 py-3 text-slate-300">{formatCompactUsd(b.totalUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
