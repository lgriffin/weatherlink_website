import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface SparklineProps {
  data: Array<{ timestamp: number; value: number | null }>;
  color: string;
  height?: number;
}

export function Sparkline({ data, color, height = 40 }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.12}
          strokeWidth={1.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
