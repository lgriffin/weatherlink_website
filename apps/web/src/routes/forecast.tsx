import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { ForecastPayload, ForecastResponse, ModelSaid, WeatherWarningDto } from '@weather/contracts';
import { fetchForecast } from '../api/client';
import { ChartCard } from '../components/ChartCard';

export const Route = createFileRoute('/forecast')({
  component: ForecastPage,
});

const MODEL_NAMES: Record<string, string> = {
  ecmwf_ifs025: 'ECMWF',
  ukmo_seamless: 'Met Office',
  icon_seamless: 'ICON (DWD)',
  knmi_harmonie_arome_europe: 'Harmonie (KNMI)',
  met_eireann: 'Met Éireann',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function pct(p: number | null | undefined): string {
  return p == null ? '–' : `${Math.round(p * 100)}%`;
}

function temp(t: number | null | undefined): string {
  return t == null ? '–' : `${t.toFixed(1)} °C`;
}

function ForecastPage() {
  const { data, isPending, isError, error } = useQuery({ queryKey: ['forecast'], queryFn: fetchForecast });

  return (
    <div>
      <h2 className="page-title">Forecast</h2>
      <p className="compare-asof">
        Tonight and tomorrow at the station, from its own models. They learn this spot from its history and
        correct what the big weather models say for it.
      </p>

      {isPending && <div className="loading-container">Loading the forecast...</div>}
      {isError && <div className="error-container">Failed to load the forecast: {error.message}</div>}

      {data && (
        <div className="outputs-grid">
          <Warnings warnings={data.warnings} />
          <Tonight forecast={data.forecast} />
          {data.forecast?.payload.guidance && <WeatherModels f={data.forecast.payload} />}
          <Credits />
        </div>
      )}
    </div>
  );
}

function Tonight({ forecast }: { forecast: ForecastResponse['forecast'] }) {
  if (!forecast) {
    return (
      <ChartCard title="Tonight and tomorrow">
        <p className="outputs-empty">No forecast yet. The first one is made after 18:00, once the evening reading is in.</p>
      </ChartCard>
    );
  }
  const f = forecast.payload;
  const e = f.evening;
  const corrected = Object.values(f.models ?? {}).some((m) => m.endsWith('+guidance'));
  const issued = f.issued_at ?? forecast.receivedAt;
  return (
    <ChartCard title="Tonight and tomorrow" subtitle={`issued ${when(issued)}`}>
      {forecast.stale && (
        <p className="forecast-stale" role="status">
          This is from the evening of {e.date}; tonight&rsquo;s forecast hasn&rsquo;t arrived yet.
        </p>
      )}
      <div className="run-grid outputs-numbers">
        <Figure title="Tonight’s low" value={e.night_min.toFixed(1)} unit="°C"
          detail={`likely ${e.night_min_range[0].toFixed(1)} to ${e.night_min_range[1].toFixed(1)}`} />
        <Figure title="Frost" value={pct(e.frost_chance)} detail="chance of 0 °C or below" />
        <Figure title="Tomorrow’s high" value={e.day_max?.toFixed(1) ?? '–'} unit={e.day_max == null ? '' : '°C'}
          detail="09:00 to 18:00" />
        <Figure title="Rain" value={pct(e.rain_next_24h_chance)} detail="0.2 mm or more by 18:00 tomorrow" />
      </div>
      {f.forecast && (
        <blockquote className="outputs-forecast">
          {f.forecast}
          {f.narrator && <span className="forecast-narrator">Written by {f.narrator} from the numbers above.</span>}
        </blockquote>
      )}
      {e.normal_low != null && e.normal_high != null && (
        <p className="outputs-sent">Normal for the date: low {temp(e.normal_low)}, high {temp(e.normal_high)}.</p>
      )}
      <p className="outputs-sent">
        {corrected
          ? 'Corrected for here: the station’s models were given what the weather models said.'
          : 'From the station’s own readings alone.'}
      </p>
      <details className="outputs-details">
        <summary>The brief the numbers came from</summary>
        <pre>{f.brief}</pre>
      </details>
    </ChartCard>
  );
}

function WeatherModels({ f }: { f: ForecastPayload }) {
  const rows = Object.entries(f.guidance ?? {}) as Array<[string, ModelSaid]>;
  return (
    <ChartCard title="What the weather models said" subtitle="for the same windows, before correcting for here">
      <table className="card-table">
        <thead>
          <tr>
            <th>Model</th>
            <th className="text-right">Tonight’s low</th>
            <th className="text-right">Tomorrow’s high</th>
            <th className="text-right">Rain, 24 h</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-bold">This station</td>
            <td className="text-right text-bold">{temp(f.evening.night_min)}</td>
            <td className="text-right text-bold">{temp(f.evening.day_max)}</td>
            <td className="text-right text-bold">{pct(f.evening.rain_next_24h_chance)}</td>
          </tr>
          {rows.map(([model, said]) => (
            <tr key={model}>
              <td>{MODEL_NAMES[model] ?? model}</td>
              <td className="text-right">{temp(said.night_min)}</td>
              <td className="text-right">{temp(said.day_max)}</td>
              <td className="text-right">{said.rain_24h == null ? '–' : `${said.rain_24h.toFixed(1)} mm`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="outputs-sent">
        The station gives a chance of rain; the weather models give an amount. Tonight runs 18:00 to 09:00 local time.
      </p>
    </ChartCard>
  );
}

const LEVEL_LABEL: Record<WeatherWarningDto['level'], string> = {
  yellow: 'Yellow', orange: 'Orange', red: 'Red', unknown: '',
};

function Warnings({ warnings }: { warnings: ForecastResponse['warnings'] }) {
  return (
    <ChartCard title="Met Éireann warnings" subtitle="in force or coming up, for Ireland">
      {warnings === null ? (
        <p className="outputs-empty">
          Couldn&rsquo;t reach Met Éireann for warnings. Check <a href="https://www.met.ie/warnings" target="_blank" rel="noreferrer">met.ie/warnings</a>.
        </p>
      ) : warnings.length === 0 ? (
        <p className="outputs-empty">No weather warnings in force or coming up.</p>
      ) : (
        <ul className="forecast-warnings">
          {warnings.map((w, i) => (
            <li key={`${w.headline}-${i}`} className={`forecast-warning forecast-warning--${w.level}`}>
              <span className="forecast-warning__title">{LEVEL_LABEL[w.level]} {w.type} warning</span>
              <span className="forecast-warning__headline">{w.headline}</span>
              {(w.onset || w.expiry) && (
                <span className="forecast-warning__when">
                  {w.onset ? `from ${when(w.onset)}` : ''}{w.onset && w.expiry ? ' ' : ''}{w.expiry ? `until ${when(w.expiry)}` : ''}
                </span>
              )}
              {w.description && <span className="forecast-warning__text">{w.description}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="outputs-sent">
        <a href="https://www.met.ie/warnings" target="_blank" rel="noreferrer">Full details on met.ie</a>
      </p>
    </ChartCard>
  );
}

function Credits() {
  return (
    <ChartCard title="Where the data comes from">
      <ul className="forecast-credits">
        <li>The station&rsquo;s own readings, and its models trained on them.</li>
        <li>
          Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0):
          ECMWF, the Met Office, DWD&rsquo;s ICON and KNMI&rsquo;s Harmonie.
        </li>
        <li>
          Forecast and warnings: Copyright <a href="https://www.met.ie/" target="_blank" rel="noreferrer">Met Éireann</a>,
          CC BY 4.0. Station readings from Met Éireann and the Irish weather buoys
          (<a href="https://www.marine.ie/" target="_blank" rel="noreferrer">Marine Institute</a>, CC BY 4.0).
        </li>
      </ul>
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
