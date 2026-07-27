import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { getColor, getUnitSymbol } from '../config/measurements';

interface YearSummary {
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}

interface YearComparisonChartProps {
  metric: string;
  yearData: Record<string, YearSummary>;
  unit: string;
}

export function YearComparisonChart({ metric, yearData, unit }: YearComparisonChartProps) {
  const years = Object.keys(yearData).sort();
  if (years.length === 0) return null;

  const color = getColor(metric);
  const unitSymbol = getUnitSymbol(unit);

  const chartData = years.map((year) => {
    const d = yearData[year]!;
    return {
      year,
      min: d.min,
      max: d.max,
      avg: d.avg,
      range: d.min !== null && d.max !== null ? [d.min, d.max] : [0, 0],
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="year" stroke="var(--color-text-muted)" fontSize={12} />
        <YAxis
          stroke="var(--color-text-muted)"
          fontSize={12}
          label={{ value: unitSymbol, position: 'insideLeft', offset: 10, style: { fill: 'var(--color-text-muted)', fontSize: 11 } }}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
          }}
          formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : '—')}
        />
        <Legend />
        <Bar dataKey="min" name="Min" fill={color} fillOpacity={0.3} radius={[2, 2, 0, 0]} />
        <Bar dataKey="max" name="Max" fill={color} fillOpacity={0.6} radius={[2, 2, 0, 0]} />
        <Line
          type="monotone"
          dataKey="avg"
          name="Avg"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
