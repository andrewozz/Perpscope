import { useState } from 'react';
import { Brush, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRegimeData } from '../../hooks/useRegimeData';
import { regimeMeta, REGIME_META } from './regimeMeta';
import { REGIME_MODEL } from './regimeModel';
import { formatCompactUsd } from '../../utils/format';
import type { FeatureRow, RegimePricePoint, RegimeResult, StateProb } from '../../types/regime';

const HOURS_PER_YEAR = 24 * 365;
const signedPct = (v: number, dp = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(dp)}%`;
const pct = (v: number, dp = 0) => `${(v * 100).toFixed(dp)}%`;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function EnginePage() {
  const { loading, error, result, prices } = useRegimeData();

  return (
    <div className="space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Market Regime Detection Engine</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          A Gaussian Hidden Markov Model — trained offline on {REGIME_MODEL.trainedOn.rows.toLocaleString()} days of
          Bitcoin history — reads the <span className="text-slate-300">recent sequence</span> of live price, volatility,
          funding, and volume signals (via the forward algorithm) to classify the current market regime.
        </p>
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40">
          <p className="text-sm text-slate-500">Classifying current regime&hellip;</p>
        </div>
      )}
      {!loading && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4">
          <p className="text-sm text-rose-400">{error}</p>
        </div>
      )}

      {!loading && !error && result && (
        <div className="space-y-6">
          <RegimeHero result={result} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RegimePriceChart prices={prices} />
            </div>
            <ProbabilityPanel title="Current regime probabilities" items={result.stateProbs} />
          </div>
          <ModelInputs features={result.features} />
        </div>
      )}

      <p className="text-[11px] text-slate-600">
        Model: Gaussian HMM (diagonal covariance, {REGIME_MODEL.nStates} regimes), trained{' '}
        {REGIME_MODEL.trainedOn.from} → {REGIME_MODEL.trainedOn.to}. Inference (forward algorithm) runs in-browser on
        live Binance BTCUSDT data. See <span className="text-slate-500">src/features/engine/regime_research</span> for
        the full model-selection study.
      </p>
    </div>
  );
}

function RegimeHero({ result }: { result: RegimeResult }) {
  const meta = regimeMeta(result.label);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="h-1.5 w-full" style={{ backgroundColor: meta.color }} />
      <div className="p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current BTC regime · as of {result.date}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: meta.color }} />
            <h2 className="text-3xl font-bold text-slate-100">{result.label}</h2>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold" style={{ color: meta.color }}>
              {pct(result.confidence)}
            </p>
            <p className="text-xs text-slate-500">model confidence</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-300">{meta.description}</p>
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">What this regime favors</p>
          <p className="mt-1 text-sm text-slate-200">{meta.guidance}</p>
        </div>
      </div>
    </div>
  );
}

const RANGE_PRESETS: { label: string; days: number }[] = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'All', days: Infinity },
];

function RegimePriceChart({ prices }: { prices: RegimePricePoint[] }) {
  const [rangeDays, setRangeDays] = useState(90);
  const data = Number.isFinite(rangeDays) ? prices.slice(-rangeDays) : prices;

  // keep the chart readable as the range grows: smaller dots, year in the labels for long spans
  const dotRadius = data.length > 400 ? 1.3 : data.length > 150 ? 2 : 2.8;
  const longSpan = data.length > 200;
  const tickFmt = (iso: string) =>
    longSpan
      ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      : shortDate(iso);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">BTC price, coloured by regime</h3>
          <p className="mt-1 text-xs text-slate-500">
            Each dot is a day, coloured by the regime the model decoded for it. Drag the slider to zoom.
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-800">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeDays(r.days)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                rangeDays === r.days ? 'bg-emerald-400/15 text-emerald-400' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={tickFmt} stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={32} />
            <YAxis
              tickFormatter={(v) => formatCompactUsd(Number(v))}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              width={56}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              labelStyle={{ color: '#cbd5e1' }}
              labelFormatter={(l) =>
                new Date(`${String(l)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
              }
              formatter={(value, _name, item) => [
                `${formatCompactUsd(Number(value))} · ${(item?.payload as RegimePricePoint)?.label ?? ''}`,
                'BTC',
              ]}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#334155"
              strokeWidth={1.5}
              isAnimationActive={false}
              dot={(props) => {
                const p = props.payload as RegimePricePoint;
                return <circle key={p.date} cx={props.cx} cy={props.cy} r={dotRadius} fill={p.color} stroke="none" />;
              }}
              activeDot={{ r: 4 }}
            />
            <Brush dataKey="date" height={20} stroke="#334155" fill="#0f172a" travellerWidth={8} tickFormatter={tickFmt} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        {Object.entries(REGIME_META).map(([label, m]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProbabilityPanel({ title, items }: { title: string; items: StateProb[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((s) => {
          const color = regimeMeta(s.label).color;
          return (
            <div key={s.index}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-400">{s.label}</span>
                <span className="font-medium text-slate-300">{pct(s.prob, 1)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full" style={{ width: `${Math.max(s.prob * 100, 0.5)}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelInputs({ features }: { features: FeatureRow }) {
  const fundingApy = features.funding_ma * HOURS_PER_YEAR * 100;
  const rows = [
    {
      label: 'Momentum (20d)',
      value: signedPct(features.mom_20),
      note: features.mom_20 >= 0 ? 'rising over 20 days' : 'falling over 20 days',
    },
    {
      label: 'Trend (vs 50d avg)',
      value: signedPct(features.trend),
      note: features.trend >= 0 ? 'above its 50-day average' : 'below its 50-day average',
    },
    {
      label: 'Volatility (14d, ann.)',
      value: pct(features.vol_14),
      note: features.vol_14 < 0.4 ? 'low / calm' : features.vol_14 < 0.8 ? 'elevated' : 'high / turbulent',
    },
    {
      label: 'Downside volatility',
      value: pct(features.downside_vol),
      note: 'crash-stress component',
    },
    {
      label: 'Funding sentiment (7d)',
      value: `${fundingApy >= 0 ? '+' : ''}${fundingApy.toFixed(1)}% APR`,
      note: Math.abs(fundingApy) < 3 ? 'neutral' : fundingApy > 0 ? 'longs crowded' : 'shorts crowded',
    },
    {
      label: 'Volume vs normal',
      value: `${features.vol_z >= 0 ? '+' : ''}${features.vol_z.toFixed(2)}σ`,
      note: features.vol_z > 0.5 ? 'above normal' : features.vol_z < -0.5 ? 'below normal / quiet' : 'normal',
    },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-sm font-semibold text-slate-200">Model inputs — latest features</h3>
      <p className="mt-1 text-xs text-slate-500">
        The 6 signals the HMM reads. It classifies from the recent <span className="text-slate-400">sequence</span> of
        these (the forward algorithm chains the days together), not today alone — the latest day's values are shown.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
            <p className="text-xs text-slate-500">{r.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{r.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{r.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
