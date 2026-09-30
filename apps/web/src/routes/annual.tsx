import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import type { AnnualStatsResponse } from '@weather/contracts';
import { fetchAnnualStats } from '../api/client';
import { SegmentedControl } from '../components/SegmentedControl';
import { ChartCard } from '../components/ChartCard';

export const Route = createFileRoute('/annual')({
  component: AnnualPage,
});

type GroupKey = AnnualStatsResponse['groups'][number]['key'];

const GROUPS: Array<{ key: GroupKey; label: string; rule: string; color: string; describe: (t: number) => string }> = [
  { key: 'warm', label: 'Warm days', rule: 'Days with a high of at least', color: 'var(--chart-temp)', describe: (t) => `${t} °C+` },
  { key: 'cold', label: 'Cold days', rule: 'Days with a low of at most', color: 'var(--chart-dewpoint)', describe: (t) => `≤ ${t} °C` },
  { key: 'wet', label: 'Wet days', rule: 'Days with at least', color: 'var(--chart-rain)', describe: (t) => `${t} mm+` },
];

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Background for a count, from transparent (0) to the group colour (the busiest cell). */
function heat(count: number | null, max: number, color: string): CSSProperties {
  if (count === null || count === 0 || max === 0) return {};
  const share = count / max;
  return {
    background: `color-mix(in srgb, ${color} ${Math.round(12 + share * 73)}%, transparent)`,
    color: share > 0.55 ? '#fff' : undefined,
  };
}

function AnnualPage() {
  const [groupKey, setGroupKey] = useState<GroupKey>('warm');
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['annual'],
    queryFn: () => fetchAnnualStats(),
  });

  const meta = GROUPS.find((g) => g.key === groupKey)!;
  const group = data?.groups.find((g) => g.key === groupKey);
  const latestYear = data?.years.at(-1);

  return (
    <div>
      <h2 className="page-title">Annual stats</h2>
      {data && (
        <p className="compare-asof">
          Complete days up to {formatDate(data.asOf)}. Outage days are left out, so each month shows how many days it counts.
        </p>
      )}

      <div className="control-bar">
        <div className="control-group">
          <span className="control-group__label">Show</span>
          <SegmentedControl
            options={GROUPS.map((g) => ({ key: g.key, label: g.label }))}
            value={groupKey}
            onChange={(k) => setGroupKey(k as GroupKey)}
          />
        </div>
      </div>

      {isPending && <div className="loading-container">Loading annual stats...</div>}
      {isError && <div className="error-container">Failed to load annual stats: {error.message}</div>}

      {data && group && (
        <>
          <ChartCard title={`${meta.label} per year`} subtitle={`${meta.rule} each threshold`}>
            <div className="annual-scroll">
              <table className="card-table annual-totals">
                <thead>
                  <tr>
                    <th>Threshold</th>
                    {data.years.map((y) => (
                      <th key={y} className="text-right">
                        {y}
                        {y === latestYear && <span className="annual-sofar">so far</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => {
                    const totals = data.years.map((y) => row.byYear[y]?.total ?? 0);
                    const max = Math.max(...totals);
                    return (
                      <tr key={row.threshold}>
                        <td className="text-bold">{meta.describe(row.threshold)}</td>
                        {totals.map((total, i) => (
                          <td key={data.years[i]} className="text-right">
                            <span className="annual-bar" style={{ width: `${max ? (total / max) * 100 : 0}%`, background: meta.color }} />
                            <span className="annual-bar__value">{total}</span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <div className="annual-years">
            {data.years.map((year) => (
              <YearGrid key={year} data={data} year={year} groupKey={groupKey} isLatest={year === latestYear} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function YearGrid({ data, year, groupKey, isLatest }: {
  data: AnnualStatsResponse;
  year: string;
  groupKey: GroupKey;
  isLatest: boolean;
}) {
  const meta = GROUPS.find((g) => g.key === groupKey)!;
  const group = data.groups.find((g) => g.key === groupKey)!;
  const coverage = data.coverage.find((c) => c.year === year)!;

  // One colour scale for every year of this group, so the grids compare fairly.
  const max = Math.max(0, ...group.rows.flatMap((r) => data.years.flatMap((y) => r.byYear[y]?.months ?? [])).map((n) => n ?? 0));
  const counted = coverage.completeDays.reduce((a, n) => a + n, 0);
  const elapsed = coverage.elapsedDays.reduce((a, n) => a + n, 0);

  return (
    <ChartCard title={isLatest ? `${year} so far` : year} subtitle={`${counted} of ${elapsed} days counted`}>
      <table className="annual-grid">
        <thead>
          <tr>
            <th className="annual-grid__label" />
            {MONTH_LETTERS.map((m, i) => <th key={i}>{m}</th>)}
            <th className="annual-grid__total">Year</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => {
            const cell = row.byYear[year]!;
            return (
              <tr key={row.threshold}>
                <th className="annual-grid__label">{meta.describe(row.threshold)}</th>
                {cell.months.map((n, i) => (
                  <td key={i} style={heat(n, max, meta.color)} className={n === 0 ? 'annual-grid__zero' : undefined}>
                    {n === null ? '' : n}
                  </td>
                ))}
                <td className="annual-grid__total">{cell.total}</td>
              </tr>
            );
          })}
          <tr className="annual-grid__coverage">
            <th className="annual-grid__label">Days</th>
            {coverage.completeDays.map((n, i) => {
              const short = n < coverage.elapsedDays[i]!;
              return (
                <td key={i} className={short ? 'annual-grid__short' : undefined}
                  title={short ? `${n} of ${coverage.elapsedDays[i]} days counted` : undefined}>
                  {coverage.elapsedDays[i] ? n : ''}
                </td>
              );
            })}
            <td className="annual-grid__total">{counted}</td>
          </tr>
        </tbody>
      </table>
    </ChartCard>
  );
}
