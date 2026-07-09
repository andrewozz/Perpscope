import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from 'recharts';
import InsightCard from './InsightCard';
import { MOCK_OI_MOVERS, mockOiChange24h } from './mockData';
import { pctFrac, signedPctFrac, type AssetMetric } from './types';
import { formatCompactUsd } from '../../utils/format';

// colour a treemap tile by its (mock) 24h OI change: green up, red down, stronger = deeper
function changeFill(change: number): string {
  const mag = Math.min(Math.abs(change) / 0.15, 1);
  const alpha = 0.25 + mag * 0.6;
  return change >= 0 ? `rgba(16,185,129,${alpha})` : `rgba(244,63,94,${alpha})`;
}

interface TileProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  change?: number;
  dominance?: number;
}

function TreemapTile(props: TileProps) {
  const { x = 0, y = 0, width = 0, height = 0, name, change = 0, dominance = 0 } = props;
  if (width <= 0 || height <= 0) return null;
  const showLabel = width > 42 && height > 26;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        style={{ fill: changeFill(change), stroke: '#0b1120', strokeWidth: 2 }}
      />
      {showLabel && (
        <>
          <text x={x + 6} y={y + 16} className="fill-slate-100" style={{ fontSize: 12, fontWeight: 700 }}>
            {name}
          </text>
          <text x={x + 6} y={y + 30} style={{ fontSize: 10, fill: '#cbd5e1' }}>
            {pctFrac(dominance, 1)}
          </text>
        </>
      )}
    </g>
  );
}

export default function OpenInterestSection({ assetMetrics }: { assetMetrics: AssetMetric[] }) {
  const treemapData = assetMetrics
    .filter((a) => a.oi_dominance > 0)
    .sort((a, b) => b.oi_dominance - a.oi_dominance)
    .slice(0, 14)
    .map((a) => ({
      name: a.coin,
      size: a.oi_dominance,
      dominance: a.oi_dominance,
      change: mockOiChange24h(a.coin),
    }));

  const leverageData = assetMetrics
    .filter((a) => a.oi_mcap_ratio != null && (a.market_cap_usd ?? 0) > 5e7)
    .sort((a, b) => (b.oi_mcap_ratio ?? 0) - (a.oi_mcap_ratio ?? 0))
    .slice(0, 8)
    .map((a) => ({ coin: a.coin, ratio: a.oi_mcap_ratio as number }));

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">2 · Open Interest &amp; Capital Rotation</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Where leverage and fresh money is concentrated — and where it&apos;s moving.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Treemap — real size, mock colour */}
        <InsightCard
          title="Open Interest Dominance"
          subtitle="Tile size = live OI share · colour = 24h OI change"
          metric="Each asset's share of total perp open interest (the dollar value of all outstanding leveraged positions). Bigger tile = more of the market's leverage sits in that coin."
          insight="Concentration shows where a squeeze can cascade. A coin's tile growing while its colour turns green means leverage is actively rotating INTO it — often ahead of a move."
          isMock
          mockNote="Tile sizes are REAL (live OI dominance). Only the colour (24h OI change) is mocked until a 2nd snapshot exists."
          className="lg:row-span-2"
        >
          <ResponsiveContainer width="100%" height={340}>
            <Treemap
              data={treemapData}
              dataKey="size"
              stroke="#0b1120"
              isAnimationActive={false}
              content={<TreemapTile />}
            />
          </ResponsiveContainer>
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded" style={{ background: 'rgba(244,63,94,0.7)' }} /> OI falling
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded" style={{ background: 'rgba(16,185,129,0.7)' }} /> OI rising
            </span>
          </div>
        </InsightCard>

        {/* OI 7d movers — mock */}
        <InsightCard
          title="Top OI Increases (7d)"
          subtitle="Largest 7-day rise in open interest, paired with price"
          metric="Coins where the most new leveraged capital entered over the past week, shown next to their 7-day price change so you can read the direction of that money."
          insight="OI ↑ + price ↑ = new longs / real buying (bullish). OI ↑ + price ↓ = new shorts piling in (bearish). Rising OI with a flat price = a coiled spring."
          isMock
          mockNote="Needs 7 days of snapshots for the OI lookback (oi_change_7d_usd is null until day 8)."
        >
          <div className="space-y-2">
            {MOCK_OI_MOVERS.map((m) => {
              const bullish = m.priceChange >= 0;
              return (
                <div
                  key={m.coin}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-12 text-sm font-semibold text-slate-200">{m.coin}</span>
                    <span className="text-xs text-slate-500">+{formatCompactUsd(m.oiChangeUsd)} OI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold tabular-nums ${bullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {signedPctFrac(m.priceChange, 1)}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        bullish ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {bullish ? 'new longs' : 'new shorts'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </InsightCard>

        {/* OI/mcap ratio — real */}
        <InsightCard
          title="Most Leveraged Coins"
          subtitle="Live · highest OI ÷ market cap"
          metric="Open interest divided by the coin's spot market cap — how large the leveraged perp market is relative to the actual size of the asset."
          insight="A high ratio means the perp market dwarfs the real coin: crowded, reflexive, and prone to violent liquidation cascades in either direction. Handle position size with care."
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={leverageData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => pctFrac(Number(v), 1)} stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis type="category" dataKey="coin" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} width={48} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                labelStyle={{ color: '#cbd5e1' }}
                cursor={{ fill: '#1e293b', opacity: 0.4 }}
                formatter={(v) => [pctFrac(Number(v), 2), 'OI / mcap']}
              />
              <Bar dataKey="ratio" radius={[0, 4, 4, 0]}>
                {leverageData.map((d) => (
                  <Cell key={d.coin} fill="#a78bfa" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </InsightCard>
      </div>
    </section>
  );
}
