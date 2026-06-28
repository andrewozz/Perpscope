import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import ChartCard from '../../components/ChartCard';
import { formatCompactNumber } from '../../utils/format';
import type { Dex30dSnapshot } from '../../types/dex';

interface ComparisonBarChartProps {
  title: string;
  caption: string;
  snapshots: Dex30dSnapshot[];
  valueKey: 'capitalEfficiency' | 'revenue30d';
  valueFormatter?: (value: number) => string;
}

export default function ComparisonBarChart({
  title,
  caption,
  snapshots,
  valueKey,
  valueFormatter = formatCompactNumber,
}: ComparisonBarChartProps) {
  const data = snapshots.filter((s) => s[valueKey] !== null);

  if (data.length === 0) {
    return (
      <ChartCard title={title} caption={caption}>
        <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-slate-800">
          <p className="px-6 text-center text-sm text-slate-500">No live data available for this metric yet.</p>
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={title} caption={caption}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis
            tickFormatter={(v) => valueFormatter(Number(v))}
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11 }}
            width={56}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
            labelStyle={{ color: '#cbd5e1' }}
            itemStyle={{ color: '#e2e8f0' }}
            cursor={{ fill: '#1e293b', opacity: 0.4 }}
            formatter={(value) => valueFormatter(Number(value))}
          />
          <Bar dataKey={valueKey} radius={[4, 4, 0, 0]}>
            {data.map((s) => (
              <Cell key={s.id} fill={s.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
