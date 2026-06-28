import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import ChartCard from '../../components/ChartCard';
import { formatCompactUsd, formatMonthLabel } from '../../utils/format';
import type { DexData, DexMetricKey } from '../../types/dex';

interface ComparisonLineChartProps {
  title: string;
  caption: string;
  dexes: DexData[];
  metricKey: DexMetricKey;
}

export default function ComparisonLineChart({ title, caption, dexes, metricKey }: ComparisonLineChartProps) {
  const eligible = dexes.filter((d) =>
    metricKey === 'tvl' ? d.hasTvl : metricKey === 'volume' ? d.hasVolume : d.hasRevenue,
  );

  const merged = useMemo(() => {
    const rows = new Map<string, Record<string, number | string>>();
    for (const { meta, points } of eligible) {
      for (const point of points) {
        const value = point[metricKey];
        if (value === undefined) continue;
        const row = rows.get(point.date) ?? { date: point.date };
        row[meta.id] = value;
        rows.set(point.date, row);
      }
    }
    return Array.from(rows.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [eligible, metricKey]);

  if (eligible.length === 0) {
    return (
      <ChartCard title={title} caption={caption}>
        <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-800">
          <p className="px-6 text-center text-sm text-slate-500">No live data available for this metric yet.</p>
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={title} caption={caption}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={merged} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatMonthLabel}
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
            labelFormatter={(label) => formatMonthLabel(String(label))}
            formatter={(value) => formatCompactUsd(Number(value))}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          {eligible.map(({ meta }) => (
            <Line
              key={meta.id}
              type="monotone"
              dataKey={meta.id}
              name={meta.name}
              stroke={meta.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
