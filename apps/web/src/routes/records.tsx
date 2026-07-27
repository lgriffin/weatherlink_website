import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchRecords, fetchCurrentConditions } from '../api/client';
import { SegmentedControl } from '../components/SegmentedControl';
import { RecordBar } from '../components/RecordBar';
import { getLabel, getCategory, getUnitSymbol, CATEGORY_ORDER } from '../config/measurements';
import type { RecordResponse } from '@weather/contracts';

export const Route = createFileRoute('/records')({
  component: RecordsPage,
});

const SCOPES = [
  { key: 'all-time', label: 'All-Time' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'monthly', label: 'Monthly' },
];

const DERIVED_TYPES = new Set(['streak', 'count', 'derived']);

function RecordsPage() {
  const [scope, setScope] = useState('all-time');
  const [view, setView] = useState<'visual' | 'table'>('visual');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['records', scope],
    queryFn: () => fetchRecords(scope),
    staleTime: 60_000,
  });

  const currentQuery = useQuery({
    queryKey: ['current'],
    queryFn: fetchCurrentConditions,
    staleTime: 30_000,
  });

  const allRecords = data?.records ?? [];
  const standardRecords = allRecords.filter((r) => !DERIVED_TYPES.has(r.recordType));
  const derivedRecords = allRecords.filter((r) => DERIVED_TYPES.has(r.recordType));
  const grouped = groupRecordsByMeasurement(standardRecords);

  const currentValues = new Map<string, number | null>();
  if (currentQuery.data) {
    for (const [key, m] of Object.entries(currentQuery.data.measurements)) {
      currentValues.set(key, m.value);
    }
  }

  return (
    <div>
      <h2 className="page-title">Records</h2>

      <div className="control-bar">
        <div className="control-group">
          <span className="control-group__label">Scope</span>
          <SegmentedControl options={SCOPES} value={scope} onChange={setScope} />
        </div>
        <div className="control-group">
          <span className="control-group__label">View</span>
          <SegmentedControl
            options={[
              { key: 'visual', label: 'Visual' },
              { key: 'table', label: 'Table' },
            ]}
            value={view}
            onChange={(k) => setView(k as 'visual' | 'table')}
          />
        </div>
      </div>

      {isPending && <div className="loading-container">Loading records...</div>}
      {isError && <div className="error-container">Failed to load records: {error.message}</div>}

      {data && allRecords.length === 0 && (
        <div className="loading-container">No records available yet. Data will appear after observations are collected and processed.</div>
      )}

      {derivedRecords.length > 0 && (
        <HighlightsSection records={derivedRecords} />
      )}

      {view === 'visual' ? (
        <VisualView grouped={grouped} currentValues={currentValues} scope={scope} />
      ) : (
        <TableView grouped={grouped} scope={scope} />
      )}
    </div>
  );
}

function HighlightsSection({ records }: { records: RecordResponse[] }) {
  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <div className="category-section__header">Highlights</div>
      <div className="dashboard-grid" style={{ marginTop: 'var(--space-sm)' }}>
        {records.map((r, i) => (
          <div key={i} className="measurement-card">
            <div className="measurement-card__label">
              {r.description ?? getLabel(r.measurementName)}
            </div>
            <div className="measurement-card__value">
              {formatDerivedValue(r)}
              <span className="measurement-card__unit">
                {getDerivedUnit(r)}
              </span>
            </div>
            {r.date && (
              <div className="measurement-card__timestamp">{r.date}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDerivedValue(r: RecordResponse): string {
  if (r.recordType === 'streak') return String(r.value);
  if (r.recordType === 'count') return String(r.value);
  return r.value.toFixed(1);
}

function getDerivedUnit(r: RecordResponse): string {
  if (r.recordType === 'streak') return ' days';
  if (r.recordType === 'count') return ' days';
  return ` ${getUnitSymbol(r.unit)}`;
}

function VisualView({
  grouped,
  currentValues,
  scope,
}: {
  grouped: [string, RecordResponse[]][];
  currentValues: Map<string, number | null>;
  scope: string;
}) {
  const byCategory = new Map<string, [string, RecordResponse[]][]>();
  for (const entry of grouped) {
    const cat = getCategory(entry[0]);
    let list = byCategory.get(cat);
    if (!list) {
      list = [];
      byCategory.set(cat, list);
    }
    list.push(entry);
  }

  return (
    <div>
      {CATEGORY_ORDER.map((cat) => {
        const entries = byCategory.get(cat.key);
        if (!entries || entries.length === 0) return null;
        return (
          <div key={cat.key} className="measurement-card" style={{ marginBottom: 'var(--space-md)' }}>
            <div className="measurement-card__label">{cat.label}</div>
            <div style={{ padding: 'var(--space-sm) 0' }}>
              {entries.map(([measurement, records]) => {
                const high = records.find((r) => r.recordType === 'high');
                const low = records.find((r) => r.recordType === 'low');
                const label = scope !== 'all-time' && high?.scopeKey
                  ? `${getLabel(measurement)} (${high.scopeKey})`
                  : getLabel(measurement);

                return (
                  <RecordBar
                    key={measurement + (high?.scopeKey ?? '')}
                    label={label}
                    high={high?.value ?? null}
                    low={low?.value ?? null}
                    current={currentValues.get(measurement) ?? null}
                    unit={high?.unit ?? low?.unit ?? ''}
                    highDate={high?.date ?? ''}
                    lowDate={low?.date ?? ''}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {(() => {
        const knownCats = new Set(CATEGORY_ORDER.map((c) => c.key));
        const uncategorized = grouped.filter(([m]) => !knownCats.has(getCategory(m)));
        if (uncategorized.length === 0) return null;
        return (
          <div className="measurement-card" style={{ marginBottom: 'var(--space-md)' }}>
            <div className="measurement-card__label">Other</div>
            <div style={{ padding: 'var(--space-sm) 0' }}>
              {uncategorized.map(([measurement, records]) => {
                const high = records.find((r) => r.recordType === 'high');
                const low = records.find((r) => r.recordType === 'low');
                return (
                  <RecordBar
                    key={measurement}
                    label={getLabel(measurement)}
                    high={high?.value ?? null}
                    low={low?.value ?? null}
                    current={currentValues.get(measurement) ?? null}
                    unit={high?.unit ?? low?.unit ?? ''}
                    highDate={high?.date ?? ''}
                    lowDate={low?.date ?? ''}
                  />
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TableView({
  grouped,
  scope,
}: {
  grouped: [string, RecordResponse[]][];
  scope: string;
}) {
  return (
    <div>
      {grouped.map(([measurement, records]) => (
        <div key={measurement} className="measurement-card" style={{ marginBottom: 'var(--space-md)' }}>
          <div className="measurement-card__label">{getLabel(measurement)}</div>
          <table className="card-table">
            <thead>
              <tr>
                {scope !== 'all-time' && <th>Period</th>}
                <th>Type</th>
                <th className="text-right">Value</th>
                <th className="text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  {scope !== 'all-time' && <td>{r.scopeKey}</td>}
                  <td style={{ textTransform: 'capitalize' }}>{r.recordType}</td>
                  <td className="text-right text-bold">
                    {r.value.toFixed(1)}{' '}
                    <span className="text-muted" style={{ fontWeight: 400 }}>{r.unit}</span>
                  </td>
                  <td className="text-right text-muted">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function groupRecordsByMeasurement(records: RecordResponse[]): [string, RecordResponse[]][] {
  const map = new Map<string, RecordResponse[]>();
  for (const r of records) {
    let list = map.get(r.measurementName);
    if (!list) {
      list = [];
      map.set(r.measurementName, list);
    }
    list.push(r);
  }
  return Array.from(map.entries());
}
