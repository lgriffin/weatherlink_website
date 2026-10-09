/**
 * Write every response the web app needs as static JSON, for hosting the
 * site without a server (GitHub Pages).
 *
 *   pnpm site:snapshot [outDir]      (default: apps/web/dist/data)
 *
 * Reads the local database only; it never calls WeatherLink. The published
 * site is public, so the station's coordinates are coarsened to the level
 * PUBLIC_LOCATION allows (approximate by default) for the Map page.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvSchema } from '@weather/contracts';
import { RUNNING_TOTAL_METRICS } from '@weather/application';
import { publicLocation } from '@weather/domain';
import { buildApp } from './app.js';

// Series windows and resolutions the Trends page and sparklines offer.
const SERIES_HOURS = [24, 168, 720] as const;
const SERIES_RESOLUTIONS = ['raw', 'hourly', 'daily'] as const;
const RECORD_SCOPES = ['all-time', 'yearly', 'monthly'] as const;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(process.argv[2] ?? resolve(repoRoot, 'apps/web/dist/data'));

// The snapshot only reads the database, so WeatherLink credentials are optional.
process.env['WEATHERLINK_API_KEY'] ||= 'not-used';
process.env['WEATHERLINK_API_SECRET'] ||= 'not-used';
process.env['LOG_LEVEL'] ||= 'warn';
const env = EnvSchema.parse(process.env);
const { app, client } = await buildApp(env);

let files = 0;

async function save(path: string, body: unknown): Promise<void> {
  const file = resolve(outDir, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(body));
  files++;
}

async function get(url: string, { allowError = false } = {}): Promise<unknown> {
  const res = await app.inject({ method: 'GET', url });
  if (res.statusCode >= 400 && !allowError) {
    throw new Error(`${url} returned ${res.statusCode}: ${res.body.slice(0, 200)}`);
  }
  return res.json();
}

function allMonthDays(): string[] {
  const days: string[] = [];
  for (let d = new Date(Date.UTC(2024, 0, 1)); d.getUTCFullYear() === 2024; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().substring(5, 10));
  }
  return days;
}

async function seriesMetrics(): Promise<string[]> {
  const since = Math.floor(Date.now() / 1000) - 31 * 86_400;
  // Raw readings, plus daily-only measurements such as rain.daily.
  const result = await client.execute({
    sql: `SELECT DISTINCT j.key AS name FROM observations, json_each(observations.measurements) AS j
          WHERE observations.timestamp >= ?
          UNION SELECT DISTINCT measurement_name FROM daily_summaries`,
    args: [since],
  });
  return result.rows.map((r) => String(r['name'])).sort();
}

try {
  const generatedAt = new Date();

  const station = (await get('/api/v1/station')) as {
    stations: Array<{ latitude: number | null; longitude: number | null }>;
  };
  station.stations = station.stations.map((s) => {
    const loc = publicLocation(s.latitude, s.longitude, env.PUBLIC_LOCATION);
    return {
      ...s,
      latitude: loc?.latitude ?? null,
      longitude: loc?.longitude ?? null,
      locationRadiusMetres: loc?.radiusMetres ?? null,
    };
  });
  await save('station.json', station);

  await save('current.json', await get('/api/v1/current', { allowError: true }));
  await save('health.json', await get('/health/ready', { allowError: true }));

  for (const scope of RECORD_SCOPES) {
    await save(`records/${scope}.json`, await get(`/api/v1/records?scope=${scope}`));
  }

  for (const day of allMonthDays()) {
    await save(`history/${day}.json`, await get(`/api/v1/history?date=${day}`));
  }

  await save('annual.json', await get('/api/v1/annual'));
  await save('ingest.json', { ...(await get('/api/v1/ingest') as object), uploadsEnabled: false });

  for (const metric of RUNNING_TOTAL_METRICS) {
    for (let month = 1; month <= 12; month++) {
      await save(`compare/${metric}/${month}.json`, await get(`/api/v1/compare?metric=${metric}&month=${month}`));
    }
  }

  const metrics = await seriesMetrics();
  for (const hours of SERIES_HOURS) {
    const from = new Date(generatedAt.getTime() - hours * 3_600_000).toISOString();
    const to = generatedAt.toISOString();
    for (const resolution of SERIES_RESOLUTIONS) {
      for (const metric of metrics) {
        const params = new URLSearchParams({ metrics: metric, from, to, resolution });
        const body = (await get(`/api/v1/series?${params}`)) as { series: unknown[] };
        await save(`series/${resolution}/${hours}/${metric}.json`, body.series[0] ?? null);
      }
    }
  }

  await save('meta.json', { generatedAt: generatedAt.toISOString(), seriesMetrics: metrics });
  console.log(`Wrote ${files} files to ${outDir}`);
} finally {
  await app.close();
  client.close();
}
