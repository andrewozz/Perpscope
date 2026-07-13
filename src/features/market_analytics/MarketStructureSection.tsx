import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import InsightCard from './InsightCard';
import BtcRegimeCard from './BtcRegimeCard';
import { MOCK_HOTTEST, MOCK_STRONGEST, type RankedCoin } from './mockData';
import { signedPctFrac, type AssetMetric, type FearGreedRow } from './types';

function fngColor(v: number): string {
  if (v < 25) return '#ef4444';
  if (v < 45) return '#f97316';
  if (v < 55) return '#eab308';
  if (v < 75) return '#84cc16';
  return '#22c55e';
}

// ---- Fear & Greed semicircular gauge ------------------------------------
const ZONES: { from: number; to: number; color: string }[] = [
  { from: 0, to: 25, color: '#ef4444' },
  { from: 25, to: 45, color: '#f97316' },
  { from: 45, to: 55, color: '#eab308' },
  { from: 55, to: 75, color: '#84cc16' },
  { from: 75, to: 100, color: '#22c55e' },
];

const CX = 100;
const CY = 104;
const R = 82;

function pointAt(value: number): [number, number] {
  const angle = (180 - (value / 100) * 180) * (Math.PI / 180);
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}

function arcPath(from: number, to: number): string {
  const [x0, y0] = pointAt(from);
  const [x1, y1] = pointAt(to);
  return `M ${x0} ${y0} A ${R} ${R} 0 0 0 ${x1} ${y1}`;
}

function FearGreedGauge({ value, classification }: { value: number; classification: string }) {
  const [mx, my] = pointAt(value);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 128" className="w-full">
        {ZONES.map((z) => (
          <path
            key={z.from}
            d={arcPath(z.from, z.to)}
            fill="none"
            stroke={z.color}
            strokeWidth={13}
            strokeLinecap="butt"
            opacity={0.85}
          />
        ))}
        <circle cx={mx} cy={my} r={7} fill="#f8fafc" stroke="#0f172a" strokeWidth={2.5} />
        <text x={CX} y={90} textAnchor="middle" className="fill-slate-100" style={{ fontSize: 34, fontWeight: 700 }}>
          {value}
        </text>
        <text x={CX} y={112} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: fngColor(value) }}>
          {classification}
        </text>
      </svg>
      <div className="mt-1 flex w-full justify-between px-1 text-[10px] text-slate-500">
        <span>Fear</span>
        <span>Greed</span>
      </div>
    </div>
  );
}

// ---- ranked horizontal bar list (used for hottest / strongest) ----------
function RankedBars({ rows, positive }: { rows: RankedCoin[]; positive?: boolean }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.coin} className="flex items-center gap-3">
          <span className="w-4 text-right text-xs font-medium text-slate-600">{i + 1}</span>
          <span className="w-14 shrink-0 text-sm font-semibold text-slate-200">{r.coin}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800/60">
            <div
              className="h-full rounded"
              style={{
                width: `${(Math.abs(r.value) / max) * 100}%`,
                backgroundColor: positive ? '#34d399' : r.value >= 0 ? '#34d399' : '#f87171',
              }}
            />
          </div>
          <span className="w-16 text-right text-sm font-semibold tabular-nums text-emerald-400">
            {signedPctFrac(r.value, 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MarketStructureSection({
  fearGreed,
  assetMetrics,
}: {
  fearGreed: FearGreedRow[];
  assetMetrics: AssetMetric[];
}) {
  const latest = fearGreed[fearGreed.length - 1];
  const history = fearGreed.slice(-90).map((d) => ({ date: d.date, value: d.fng_value }));

  const hottest: RankedCoin[] = assetMetrics
    .filter((m) => m.vol_change_24h_pct != null && !m.is_stablecoin)
    .sort((a, b) => b.vol_change_24h_pct! - a.vol_change_24h_pct!)
    .slice(0, 5)
    .map((m) => ({ coin: m.coin, value: m.vol_change_24h_pct! }));

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">1 · General Market Structure</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Is the market broadly risk-on or risk-off, and which coins are leading it?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* BTC regime — real, live HMM (same model as the Regime Engine page) */}
        <BtcRegimeCard />

        {/* Fear & Greed — real */}
        <InsightCard
          title="Fear & Greed Index"
          subtitle={`Live · sentiment on ${latest.date}`}
          metric="A 0–100 composite of volatility, momentum, volume, social and dominance signals. 0 = extreme fear (panic selling), 100 = extreme greed (euphoria)."
          insight="A contrarian gauge: extreme fear often marks capitulation lows (accumulation zones), extreme greed marks froth where risk of a pullback is highest."
        >
          <div className="flex items-center gap-4">
            <div className="w-[38%] shrink-0 px-2 py-1">
              <FearGreedGauge value={latest.fng_value} classification={latest.fng_classification} />
            </div>
            <div className="w-[60%] min-w-0">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Last 90 days</p>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={history} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fngFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#cbd5e1' }}
                    formatter={(v) => [`${v}`, 'F&G']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={1.5} fill="url(#fngFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </InsightCard>

        {/* Hottest — real once a 2nd daily snapshot exists */}
        <InsightCard
          title="Hottest Coins Today"
          subtitle="Top 5 by 24h volume surge"
          metric="Coins with the largest 24-hour jump in traded volume vs the prior day — where attention and activity is flooding in right now."
          insight="A volume spike precedes big moves; rising volume + rising price = a real breakout worth chasing, a spike with flat price = churn to avoid."
          isMock={hottest.length === 0}
          mockNote="Needs a 2nd daily snapshot to compute the 24h change (vol_change_24h_pct is null on day 1)."
        >
          <RankedBars rows={hottest.length > 0 ? hottest : MOCK_HOTTEST} positive />
        </InsightCard>

        {/* Strongest — mock */}
        <InsightCard
          title="Strongest Coins (30d)"
          subtitle="Top 5 by relative strength vs BTC"
          metric="Best 30-day performance measured against BTC — how much each coin out-paced Bitcoin over the last month (not raw price, but BTC-relative)."
          insight="Leaders keep leading: in an alt-friendly tape these are your momentum longs; if they roll over while BTC holds, it's an early risk-off warning."
          isMock
          mockNote="Needs 30 days of history for the BTC-relative lookback (rs_30d is null until day 31)."
        >
          <RankedBars rows={MOCK_STRONGEST} positive />
        </InsightCard>
      </div>
    </section>
  );
}
