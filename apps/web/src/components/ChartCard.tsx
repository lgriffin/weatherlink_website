import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div className="chart-card">
      <div className="chart-card__header">
        <span className="chart-card__title">{title}</span>
        {subtitle && <span className="chart-card__subtitle">{subtitle}</span>}
      </div>
      <div className="chart-card__body">{children}</div>
    </div>
  );
}
