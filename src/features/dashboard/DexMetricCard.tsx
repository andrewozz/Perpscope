import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Brush,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import ChartCard from '../../components/ChartCard';
import { formatCompactUsd } from '../../utils/format';
import { aggregateDexPoints, formatGranularLabel, GRANULARITIES } from '../../utils/aggregateSeries';
import type { Granularity } from '../../utils/aggregateSeries';
import type { DexData, DexMetricKey } from '../../types/dex';

const METRIC_OPTIONS: { key: DexMetricKey; label: string }[] = [
  { key: 'tvl', label: 'TVL' },
  { key: 'volume', label: 'Volume' },
  { key: 'revenue', label: 'Revenue' },
];

const GRANULARITY_LABEL: Record<Granularity, string> = { D: 'daily', W: 'weekly', M: 'monthly', Q: 'quarterly', Y: 'yearly' };

export default function DexMetricCard({ dex }: { dex: DexData }) {
  const available = METRIC_OPTIONS.filter(
    (opt) => (opt.key === 'tvl' && dex.hasTvl) || (opt.key === 'volume' && dex.hasVolume) || (opt.key === 'revenue' && dex.hasRevenue),
  );
  const [metric, setMetric] = useState<DexMetricKey>(available[0]?.key ?? 'tvl');
  const [granularity, setGranularity] = useState<Granularity>('D');

  const data = useMemo(() => aggregateDexPoints(dex.points, metric, granularity), [dex.points, metric, granularity]);
  const isFlow = metric !== 'tvl';

  if (!dex.hasAnyData) {
    return (
      <ChartCard title={dex.meta.name}>
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-800 text-center">
          <p className="px-6 text-sm text-slate-500">
            No live data source is currently available for {dex.meta.name} on DefiLlama.
          </p>
        </div>
      </ChartCard>
    );
  }

  const metricLabel = available.find((m) => m.key === metric)?.label.toLowerCase();

  return (
    <ChartCard
      title={dex.meta.name}
      caption={`${GRANULARITY_LABEL[granularity]} ${metricLabel} for ${dex.meta.name}${
        isFlow ? ' (summed per period)' : ' (end of period)'
      }, live from DefiLlama. Drag the handles below to zoom.`}
      actions={
        <div className="flex flex-wrap justify-end gap-1">
          {available.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMetric(opt.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                metric === opt.key
                  ? 'bg-emerald-400/15 text-emerald-400'
                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-3 flex justify-end gap-1">
        {GRANULARITIES.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGranularity(g.key)}
            className={`h-6 w-6 rounded text-[11px] font-semibold transition-colors ${
              granularity === g.key
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
            }`}
            title={GRANULARITY_LABEL[g.key]}
          >
            {g.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        {isFlow ? (
          <BarChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatGranularLabel(String(d), granularity)}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) => formatCompactUsd(Number(v))}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              width={56}
            />
            <Tooltip
              cursor={{ fill: '#1e293b', opacity: 0.4 }}
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              labelStyle={{ color: '#cbd5e1' }}
              itemStyle={{ color: '#e2e8f0' }}
              labelFormatter={(label) => formatGranularLabel(String(label), granularity)}
              formatter={(value) => [formatCompactUsd(Number(value)), metricLabel ?? '']}
            />
            <Bar dataKey="value" fill={dex.meta.color} radius={[2, 2, 0, 0]} />
            <Brush
              dataKey="date"
              height={20}
              stroke="#334155"
              fill="#0f172a"
              travellerWidth={8}
              tickFormatter={(d) => formatGranularLabel(String(d), granularity)}
            />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatGranularLabel(String(d), granularity)}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) => formatCompactUsd(Number(v))}
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              width={56}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              labelStyle={{ color: '#cbd5e1' }}
              itemStyle={{ color: '#e2e8f0' }}
              labelFormatter={(label) => formatGranularLabel(String(label), granularity)}
              formatter={(value) => [formatCompactUsd(Number(value)), metricLabel ?? '']}
            />
            <Line type="monotone" dataKey="value" stroke={dex.meta.color} strokeWidth={2} dot={false} connectNulls />
            <Brush
              dataKey="date"
              height={20}
              stroke="#334155"
              fill="#0f172a"
              travellerWidth={8}
              tickFormatter={(d) => formatGranularLabel(String(d), granularity)}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  );
}
