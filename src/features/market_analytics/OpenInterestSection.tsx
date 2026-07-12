import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from 'recharts';
import InsightCard from './InsightCard';
import { MOCK_OI_MOVERS } from './mockData';
import { pctFrac, signedPctFrac, type AssetMetric } from './types';
import { formatCompactUsd } from '../../utils/format';

const NEW_TILE_FILL = 'rgba(100,116,139,0.35)'; // neutral slate -- coin has <2 days of history yet

// colour a treemap tile by its REAL 24h OI change: green = OI grew, red = OI shrank,
// deeper colour = bigger move. null = not enough history yet (see mockNote below).
function changeFill(change: number | null): string {
  if (change === null) return NEW_TILE_FILL;
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
  change?: number | null;
  dominance?: number;
  depth?: number;
}

function TreemapTile(props: TileProps) {
  const { x = 0, y = 0, width = 0, height = 0, name, change = null, dominance = 0, depth } = props;
  // Recharts calls this renderer once for the chart's own invisible ROOT node
  // too (depth 0 -- no real name/dominance/change), which without this guard
  // draws a full-container-sized ghost tile ("0.0%" / "new") behind everything.
  // Only render real per-coin leaf tiles.
  if (width <= 0 || height <= 0 || !name || depth === 0) return null;
  // Three-tier text hierarchy: ticker (biggest/brightest) > dominance
  // (secondary, muted) > 24h change (smallest, colour carries the meaning).
  const showLabel = width > 42 && height > 26;
  const showChange = width > 42 && height > 40;

  // Scale font size to the tile's own size -- a dominant coin's big tile gets
  // noticeably bigger, easier-to-read text than a sliver-sized long-tail coin,
  // clamped so text never becomes illegible-tiny or comically huge.
  const scale = Math.min(2.4, Math.max(0.65, Math.min(width, height) / 85));
  const tickerSize = Math.round(13 * scale);
  const dominanceSize = Math.round(11 * scale);
  const changeSize = Math.round(9 * scale);

  // Centre all text (both horizontally and vertically) within the tile: stack
  // each line's "slot" (font size * line-height) and centre the whole block
  // around the tile's midpoint, rather than pinning text to the top-left.
  const cx = x + width / 2;
  const cy = y + height / 2;
  const slots = showChange
    ? [tickerSize * 1.35, dominanceSize * 1.35, changeSize * 1.35]
    : [tickerSize * 1.35, dominanceSize * 1.35];
  const totalHeight = slots.reduce((sum, h) => sum + h, 0);
  let cursor = cy - totalHeight / 2;
  const tickerY = cursor + slots[0] * 0.72;
  cursor += slots[0];
  const dominanceY = cursor + slots[1] * 0.72;
  cursor += slots[1];
  const changeY = showChange ? cursor + slots[2] * 0.72 : 0;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        style={{ fill: changeFill(change), stroke: '#0b1120', strokeWidth: 1.5 }}
      />
      {showLabel && (
        <>
          <text
            x={cx}
            y={tickerY}
            textAnchor="middle"
            style={{ fontSize: tickerSize, fontWeight: 800, fill: '#f8fafc', letterSpacing: 0.2 }}
          >
            {name}
          </text>
          <text x={cx} y={dominanceY} textAnchor="middle" style={{ fontSize: dominanceSize, fontWeight: 400, fill: '#000000' }}>
            {pctFrac(dominance, 1)}
          </text>
        </>
      )}
      {showChange && (
        <text
          x={cx}
          y={changeY}
          textAnchor="middle"
          style={{ fontSize: changeSize, fontWeight: 400, fill: '#000000' }}
        >
          {change === null ? 'new' : signedPctFrac(change, 1)}
        </text>
      )}
    </g>
  );
}

interface TreemapTooltipPayloadItem {
  payload: { name: string; dominance: number; change: number | null; openInterestUsd: number };
}

function TreemapTooltip({ active, payload }: { active?: boolean; payload?: TreemapTooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-white">{d.name}</p>
      <p className="mt-1 text-slate-200">OI dominance: <span className="font-medium text-white">{pctFrac(d.dominance, 2)}</span></p>
      <p className="text-slate-200">Open interest: <span className="font-medium text-white">{formatCompactUsd(d.openInterestUsd)}</span></p>
      <p className="text-slate-200">
        24h OI change:{' '}
        <span className={`font-medium ${d.change === null ? 'text-slate-400' : d.change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {d.change === null ? 'not enough history yet' : signedPctFrac(d.change, 1)}
        </span>
      </p>
    </div>
  );
}

const TREEMAP_ASSET_COUNT = 30; // covers ~95% of total OI dominance, verified live against BigQuery

export default function OpenInterestSection({ assetMetrics }: { assetMetrics: AssetMetric[] }) {
  const treemapAssets = assetMetrics
    // drop near-zero-dominance coins: below 0.05% they'd render as a "0.0%"
    // label (rounds to zero at 1dp) -- a meaningless sliver tile, not a real signal
    .filter((a) => a.oi_dominance >= 0.0005)
    .sort((a, b) => b.oi_dominance - a.oi_dominance)
    .slice(0, TREEMAP_ASSET_COUNT);

  const treemapCoverage = treemapAssets.reduce((sum, a) => sum + a.oi_dominance, 0);

  const treemapData = treemapAssets.map((a) => ({
    name: a.coin,
    size: a.oi_dominance,
    dominance: a.oi_dominance,
    openInterestUsd: a.open_interest_usd,
    change: a.oi_change_24h_pct, // real -- (OI$ today - OI$ yesterday) / OI$ yesterday; null until day 2 for that coin
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
        {/* Treemap — real size AND real 24h colour */}
        <InsightCard
          title="Open Interest Dominance"
          subtitle={`Live · top ${treemapAssets.length} assets, ${pctFrac(treemapCoverage, 0)} of total OI · size = share · colour = 24h OI change`}
          metric={`Each asset's live share of total perp open interest (tile size), and how much that asset's OWN open interest grew or shrank in the last 24 hours (tile colour). This is the coin's own leverage flow, not a shift in market share — a tile can grow green even if its dominance % barely moves, and vice versa.`}
          insight="Concentration shows where a squeeze can cascade. A tile turning deep green means real new leverage is flowing into that specific coin right now — often ahead of a move. Grey tiles are coins with under 2 days of pipeline history — their 24h change isn't computable yet, not a data error."
          className="lg:row-span-2"
        >
          <ResponsiveContainer width="100%" height={460}>
            <Treemap
              data={treemapData}
              dataKey="size"
              stroke="#0b1120"
              isAnimationActive={false}
              content={<TreemapTile />}
            >
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded" style={{ background: 'rgba(244,63,94,0.7)' }} /> 24h OI dropped
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded" style={{ background: 'rgba(16,185,129,0.7)' }} /> 24h OI increased
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded" style={{ background: NEW_TILE_FILL }} /> not enough history yet
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
                labelStyle={{ color: '#ffffff' }}
                itemStyle={{ color: '#ffffff' }}
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
