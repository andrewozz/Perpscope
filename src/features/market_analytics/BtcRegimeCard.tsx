import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRegimeData } from '../../hooks/useRegimeData';
import { regimeMeta } from '../engine/regimeMeta';
import { formatCompactUsd } from '../../utils/format';
import InsightCard from './InsightCard';
import type { RegimePricePoint, StateProb } from '../../types/regime';

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const RANGES = [
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

function RegimePriceChart({ prices }: { prices: RegimePricePoint[] }) {
  const [days, setDays] = useState(90);
  const data = prices.slice(-days);
  const dotR = data.length > 300 ? 1.4 : data.length > 140 ? 2 : 2.6;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">BTC price, coloured by regime</p>
        <div className="flex overflow-hidden rounded-md border border-slate-800">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setDays(r.days)}
              className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
                days === r.days ? 'bg-emerald-400/15 text-emerald-400' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={36} />
          <YAxis
            tickFormatter={(v) => formatCompactUsd(Number(v))}
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11 }}
            width={52}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(value, _n, item) => [
              `${formatCompactUsd(Number(value))} · ${(item?.payload as RegimePricePoint)?.label ?? ''}`,
              'BTC',
            ]}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#334155"
            strokeWidth={1.4}
            isAnimationActive={false}
            dot={(props) => {
              const p = props.payload as RegimePricePoint;
              return <circle key={p.date} cx={props.cx} cy={props.cy} r={dotR} fill={p.color} stroke="none" />;
            }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProbabilityBars({ items }: { items: StateProb[] }) {
  const sorted = [...items].sort((a, b) => b.prob - a.prob);
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Current regime probabilities</p>
      <div className="space-y-2.5">
        {sorted.map((s) => {
          const color = regimeMeta(s.label).color;
          return (
            <div key={s.index}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-400">{s.label}</span>
                <span className="font-medium text-slate-300">{(s.prob * 100).toFixed(1)}%</span>
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

export default function BtcRegimeCard() {
  const { loading, error, result, prices } = useRegimeData();
  const meta = result ? regimeMeta(result.label) : null;

  return (
    <InsightCard
      title="BTC Market Regime"
      subtitle="Live · Gaussian HMM classification"
      metric="A Hidden Markov Model trained on years of BTC history reads the recent sequence of price, volatility, funding and volume, then outputs the current regime and a probability for every possible state."
      insight="Sets your baseline bias — trend-follow and hold longer when Bull/Accumulation dominates; take profit faster, size down and favour shorts when Bear/Capitulation gains probability. A rising second-place probability warns a regime shift is brewing."
      className="lg:col-span-2"
    >
      {loading && (
        <div className="flex h-56 items-center justify-center">
          <p className="text-sm text-slate-500">Classifying current BTC regime…</p>
        </div>
      )}
      {!loading && (error || !result) && (
        <div className="flex h-56 items-center justify-center">
          <p className="text-sm text-rose-400">{error ?? 'Not enough live data to classify the regime.'}</p>
        </div>
      )}
      {!loading && result && meta && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: meta.color }} />
              <div>
                <p className="text-xl font-bold text-slate-100">{result.label}</p>
                <p className="text-xs text-slate-500">as of {result.date} · {meta.description}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold" style={{ color: meta.color }}>
                {(result.confidence * 100).toFixed(0)}%
              </p>
              <p className="text-[11px] text-slate-500">confidence</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RegimePriceChart prices={prices} />
            </div>
            <ProbabilityBars items={result.stateProbs} />
          </div>
        </div>
      )}
    </InsightCard>
  );
}
