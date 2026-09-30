import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type {
  IngestKindValue,
  IngestOverviewResponse,
  ForecastPayload,
  ModelScoresPayload,
  OutagesPayload,
  HarvestPayload,
} from '@weather/contracts';
import { fetchIngestOverview, uploadIngest } from '../api/client';
import { ChartCard } from '../components/ChartCard';
import { IS_STATIC } from '../config/site';

export const Route = createFileRoute('/outputs')({
  component: OutputsPage,
});

const KINDS: Array<{ key: IngestKindValue; label: string; file: string }> = [
  { key: 'forecast', label: 'Forecast', file: 'python -m wxml predict --json' },
  { key: 'model-scores', label: 'Model scores', file: 'ml/out/metrics.json' },
  { key: 'outages', label: 'Outages', file: 'pnpm archive:gaps --json' },
  { key: 'harvest', label: 'Harvest or training run', file: '{"status":"ok","task":"train"}' },
];

const TASK_LABELS: Record<string, string> = {
  night_min: 'Tonight’s low',
  day_max: 'Tomorrow’s high',
  rain_next_24h: 'Rain in the next 24 h',
  rain_next_6h: 'Rain in the next 6 h',
  temp_next_24h: 'Temperature in 24 h',
  frost_tonight: 'Frost tonight',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function pct(p: number | null | undefined): string {
  return p === null || p === undefined ? '–' : `${Math.round(p * 100)}%`;
}

function OutputsPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['ingest'],
    queryFn: fetchIngestOverview,
  });

  return (
    <div>
      <h2 className="page-title">Outputs</h2>
      <p className="compare-asof">
        Results your other machines send here: the forecast from the model box, its scores, the outage list and how
        the last harvest went.
      </p>

      {isPending && <div className="loading-container">Loading outputs...</div>}
      {isError && <div className="error-container">Failed to load outputs: {error.message}</div>}

      {data && (
        <div className="outputs-grid">
          <ForecastCard report={data.latest.forecast} />
          <HarvestCard report={data.latest.harvest} />
          <ScoresCard report={data.latest['model-scores']} />
          <OutagesCard report={data.latest.outages} />
          <RecentCard recent={data.recent} />
          {!IS_STATIC && <UploadCard enabled={data.uploadsEnabled} />}
        </div>
      )}
    </div>
  );
}

type Latest = IngestOverviewResponse['latest'];

function Sent({ report }: { report: { source: string; receivedAt: string } }) {
  return <p className="outputs-sent">Sent by {report.source}, {when(report.receivedAt)}</p>;
}

function Empty({ what }: { what: string }) {
  return <p className="outputs-empty">Nothing received yet. {what}</p>;
}

function ForecastCard({ report }: { report: Latest['forecast'] }) {
  const f: ForecastPayload | undefined = report?.payload;
  return (
    <ChartCard title="Latest forecast" subtitle={f ? `for the night of ${f.evening.date}` : undefined}>
      {!f || !report ? <Empty what="Run the forecast on the model box and send it with --json." /> : (
        <>
          <div className="run-grid outputs-numbers">
            <Figure title="Night low" value={`${f.evening.night_min.toFixed(1)}`} unit="°C"
              detail={`likely ${f.evening.night_min_range[0].toFixed(1)} to ${f.evening.night_min_range[1].toFixed(1)}`} />
            <Figure title="Frost chance" value={pct(f.evening.frost_chance)} />
            <Figure title="Tomorrow’s high" value={f.evening.day_max?.toFixed(1) ?? '–'} unit={f.evening.day_max == null ? '' : '°C'} />
            <Figure title="Rain, 24 h" value={pct(f.evening.rain_next_24h_chance)} />
          </div>
          {f.forecast && <blockquote className="outputs-forecast">{f.forecast}</blockquote>}
          <details className="outputs-details">
            <summary>The brief the numbers came from</summary>
            <pre>{f.brief}</pre>
          </details>
          <Sent report={report} />
        </>
      )}
    </ChartCard>
  );
}

function Figure({ title, value, unit, detail }: { title: string; value: string; unit?: string; detail?: string }) {
  return (
    <div className="run-card">
      <span className="run-card__title">{title}</span>
      <span className="run-card__value">{value}{unit && <span className="run-card__unit">{unit}</span>}</span>
      {detail && <span className="run-card__detail">{detail}</span>}
    </div>
  );
}

function HarvestCard({ report }: { report: Latest['harvest'] }) {
  const h: HarvestPayload | undefined = report?.payload;
  const details = h?.details ? Object.entries(h.details).filter(([, v]) => typeof v !== 'object') : [];
  return (
    <ChartCard title="Last run" subtitle={h ? h.task : undefined}>
      {!h || !report ? <Empty what="Harvest and rebuild on the NAS report here on their own." /> : (
        <>
          <p className={`outputs-status outputs-status--${h.status}`}>
            {h.status === 'ok' ? 'Finished' : 'Failed'}
            {h.finishedAt && <span> {when(h.finishedAt)}</span>}
          </p>
          {h.message && <p className="outputs-message">{h.message}</p>}
          {details.length > 0 && (
            <table className="card-table">
              <tbody>
                {details.map(([k, v]) => (
                  <tr key={k}><td className="text-muted">{k}</td><td className="text-right">{String(v)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <Sent report={report} />
        </>
      )}
    </ChartCard>
  );
}

interface ScoreRow {
  name: string;
  measure: 'MAE' | 'Brier';
  model: number;
  climatology: number | undefined;
  persistence: number | undefined;
  skill: number | null | undefined;
  testRows: number | undefined;
  skipped?: string;
}

function scoreRows(p: ModelScoresPayload): ScoreRow[] {
  const rows: ScoreRow[] = [];
  const add = (name: string, t: Record<string, unknown>) => {
    if (typeof t['skipped'] === 'string') {
      rows.push({ name, measure: 'MAE', model: NaN, climatology: undefined, persistence: undefined, skill: undefined, testRows: undefined, skipped: t['skipped'] });
      return;
    }
    const brier = t['brier'] as ScoreRow & { model: number } | undefined;
    const mae = t['mae'] as ScoreRow & { model: number } | undefined;
    const s = brier ?? mae;
    if (!s) return;
    const skill = t['skill'] as Record<string, number | null> | undefined;
    rows.push({
      name, measure: brier ? 'Brier' : 'MAE', model: s.model, climatology: s.climatology, persistence: s.persistence,
      skill: skill?.['vs_climatology'], testRows: t['test_rows'] as number | undefined,
    });
  };
  for (const [name, task] of Object.entries(p.tasks)) {
    add(name, task as Record<string, unknown>);
    const frost = (task as Record<string, unknown>)['frost_tonight'];
    if (frost && typeof frost === 'object') add('frost_tonight', frost as Record<string, unknown>);
  }
  return rows;
}

function ScoresCard({ report }: { report: Latest['model-scores'] }) {
  const rows = report ? scoreRows(report.payload) : [];
  const firstTest = report ? Object.values(report.payload.tasks).find((t) => 'test_from' in t) as { test_from?: string; test_to?: string } | undefined : undefined;
  return (
    <ChartCard title="Model scores"
      subtitle={firstTest?.test_from ? `tested on ${firstTest.test_from} to ${firstTest.test_to}` : 'lower error is better'}>
      {!report ? <Empty what="Send ml/out/metrics.json after each training run." /> : (
        <>
          <div className="annual-scroll">
            <table className="card-table">
              <thead>
                <tr>
                  <th>Forecast</th>
                  <th className="text-right">Model</th>
                  <th className="text-right">Normal for the date</th>
                  <th className="text-right">Same as yesterday</th>
                  <th className="text-right">Better than normal by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => r.skipped ? (
                  <tr key={r.name}>
                    <td className="text-bold">{TASK_LABELS[r.name] ?? r.name}</td>
                    <td colSpan={4} className="text-muted">Not trained: {r.skipped}</td>
                  </tr>
                ) : (
                  <tr key={r.name}>
                    <td className="text-bold">{TASK_LABELS[r.name] ?? r.name}<span className="annual-sofar">{r.measure === 'MAE' ? 'average miss, °C or mm' : 'Brier score'}{r.testRows ? `, ${r.testRows} tests` : ''}</span></td>
                    <td className="text-right">{fmt(r.model, r.measure)}</td>
                    <td className="text-right text-muted">{fmt(r.climatology, r.measure)}</td>
                    <td className="text-right text-muted">{fmt(r.persistence, r.measure)}</td>
                    <td className={`text-right ${r.skill != null && r.skill > 0 ? 'score--good' : 'score--bad'}`}>
                      {r.skill == null ? '–' : `${Math.round(r.skill * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Sent report={report} />
        </>
      )}
    </ChartCard>
  );
}

function fmt(n: number | undefined, measure: 'MAE' | 'Brier'): string {
  return n === undefined || Number.isNaN(n) ? '–' : n.toFixed(measure === 'Brier' ? 3 : 2);
}

function OutagesCard({ report }: { report: Latest['outages'] }) {
  const gaps: OutagesPayload = report?.payload ?? [];
  const totalHours = gaps.reduce((a, g) => a + (Date.parse(g.to) - Date.parse(g.from)) / 3_600_000, 0);
  return (
    <ChartCard title="Outages" subtitle={report ? `${gaps.length} found, ${(totalHours / 24).toFixed(1)} days in all` : undefined}>
      {!report ? <Empty what="Run pnpm archive:gaps --save on the NAS, or send its --json output." /> : gaps.length === 0 ? (
        <p className="outputs-empty">No outages in the archive.</p>
      ) : (
        <>
          <div className="outputs-scroll">
            <table className="card-table">
              <thead>
                <tr><th>From</th><th>To</th><th className="text-right">Length</th><th>Cause</th></tr>
              </thead>
              <tbody>
                {[...gaps].reverse().map((g) => {
                  const hours = (Date.parse(g.to) - Date.parse(g.from)) / 3_600_000;
                  return (
                    <tr key={`${g.from}-${g.to}`}>
                      <td>{when(g.from)}</td>
                      <td>{when(g.to)}</td>
                      <td className="text-right">{hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} h`}</td>
                      <td className="text-muted">{g.kind === 'no-data' ? 'Nothing logged'
                        : g.measurement && g.measurement !== 'temperature.outdoor' ? `No ${g.measurement}` : 'Outdoor sensor silent'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Sent report={report} />
        </>
      )}
    </ChartCard>
  );
}

function RecentCard({ recent }: { recent: IngestOverviewResponse['recent'] }) {
  return (
    <ChartCard title="Recent uploads">
      {recent.length === 0 ? <p className="outputs-empty">No uploads yet.</p> : (
        <table className="card-table">
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="text-bold">{KINDS.find((k) => k.key === r.kind)?.label ?? r.kind}</td>
                <td className="text-muted">{r.source}</td>
                <td className="text-right">{when(r.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}

function UploadCard({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<IngestKindValue>('forecast');
  const [file, setFile] = useState<File | null>(null);
  const [token, setToken] = useState('');
  const [source, setSource] = useState('browser');
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });

  if (!enabled) {
    return (
      <ChartCard title="Upload an output">
        <p className="outputs-empty">Uploads are turned off on this server. Set INGEST_TOKEN in its settings to turn them on.</p>
      </ChartCard>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setState({ busy: true, message: null, ok: false });
    try {
      const body: unknown = JSON.parse(await file.text());
      await uploadIngest(kind, body, token, source.trim());
      setState({ busy: false, message: `Uploaded ${file.name}.`, ok: true });
      await queryClient.invalidateQueries({ queryKey: ['ingest'] });
    } catch (err) {
      const message = err instanceof SyntaxError ? `${file.name} isn't valid JSON.` : (err as Error).message;
      setState({ busy: false, message, ok: false });
    }
  }

  const selected = KINDS.find((k) => k.key === kind)!;
  return (
    <ChartCard title="Upload an output" subtitle="for a file you have on this computer">
      <form className="outputs-form" onSubmit={submit}>
        <label>
          <span>What is it?</span>
          <select className="date-input" value={kind} onChange={(e) => setKind(e.target.value as IngestKindValue)}>
            {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <small>From: <code>{selected.file}</code></small>
        </label>
        <label>
          <span>JSON file</span>
          <input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          <span>Sent from</span>
          <input className="date-input" value={source} maxLength={64} onChange={(e) => setSource(e.target.value)} />
        </label>
        <label>
          <span>Upload token</span>
          <input className="date-input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <button className="download-button" type="submit" disabled={state.busy || !file || token.length === 0}>
          {state.busy ? 'Uploading...' : 'Upload'}
        </button>
        {state.message && <p className={state.ok ? 'outputs-status--ok' : 'outputs-status--failed'}>{state.message}</p>}
      </form>
    </ChartCard>
  );
}
