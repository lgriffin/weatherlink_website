# Home Weather Service

A self-hosted weather dashboard for WeatherLink-connected weather stations. Polls the WeatherLink v2 API, archives observations locally in PostgreSQL, and serves a React frontend with live conditions, historical records, and trends.

## Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 9+, Docker

# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your WeatherLink API key, secret, and station ID

# 3. Start PostgreSQL
docker compose up db -d

# 4. Run database migrations
pnpm db:generate
pnpm db:migrate

# 5. Start everything
pnpm dev           # API server (port 1456) + web UI (port 5173)
pnpm dev:worker    # Background poller (separate terminal)
```

The dashboard is at `http://localhost:5173`. The API is at `http://localhost:1456`.

## Architecture

pnpm monorepo with Clean Architecture. The domain layer has zero external dependencies.

```
apps/
  api/             Fastify HTTP server (port 1456)
  web/             React + Vite + TanStack Router/Query
  worker/          Background poller (60s interval)

packages/
  domain/          Pure TS types, ports (interfaces), services
  contracts/       Zod schemas for env config and API DTOs
  application/     Use cases (orchestrate domain ports)
  http-adapter/    Fastify route plugins
  weatherlink-adapter/   WeatherLink v2 client + anti-corruption layer
  persistence-adapter/   Drizzle + PostgreSQL repositories
  observability/   Pino logger, Prometheus metrics, health checker
  test-support/    Fixtures, fakes, test utilities
```

Dependency flow: `apps/ -> http-adapter -> application -> domain <- adapters`

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/v1/station` | Current station info |
| `GET /api/v1/current` | Latest conditions with freshness state |
| `GET /health/live` | Liveness probe (always 200) |
| `GET /health/ready` | Readiness probe (503 if unhealthy) |
| `GET /metrics` | Prometheus metrics |

## Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start API + web dev servers
pnpm dev:worker       # Start background poller
pnpm test             # Run all tests (Vitest)
pnpm typecheck        # Type-check all packages
pnpm build            # Build all packages
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run migrations
pnpm archive:harvest  # Download the full WeatherLink archive (resumable)
pnpm archive:rebuild  # Re-derive observations, summaries and records from the raw archive
pnpm archive:gaps     # List outages (no usable outdoor data for 2+ hours)
```

## Full archive

The worker keeps every WeatherLink archive record exactly as the API returned it, in the `archive_records` table. Observations, daily summaries and records are all derived from it, so a mapping fix can be applied to the whole history without downloading again.

```bash
pnpm db:migrate
pnpm archive:harvest --force          # one-time: re-download everything since the station was registered
pnpm archive:rebuild                  # rebuild observations, summaries and records
pnpm archive:harvest --from 2024-01-01   # or fetch a specific range; days already synced are skipped
```

The WeatherLink API returns at most 24 hours per request, so the harvest fetches one day at a time with a 2 second pause (about 15 minutes per year of history). It can be stopped and restarted; without `--force` it only fetches days that have not been synced.

`pnpm archive:gaps` lists hardware outages: spans of more than 2 hours (`--min-hours`) with no usable outdoor reading, marked as either nothing logged or the ISS reporting nothing. Add `--json` for machine-readable output. Streak records (dry, wet, warm and frost runs) end at a missing day instead of bridging it.

Daily summaries use local calendar days in `APP_TIMEZONE`, and are built from archive intervals when a day has them (live polls are used only for days with no archive data). Daily rain is the sum of the interval rainfall, and daily highs and lows include each interval's own high and low.

## Docker

```bash
docker compose up     # Start PostgreSQL + API + worker
```

The Dockerfile uses a multi-stage build with a non-root user. The compose file runs PostgreSQL 17, the API server, and the worker as separate services.

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|---|---|---|
| `WEATHERLINK_API_KEY` | — | WeatherLink v2 API key (required) |
| `WEATHERLINK_API_SECRET` | — | WeatherLink v2 API secret (required) |
| `DATABASE_URL` | `postgresql://weather:weather@localhost:5432/weather` | PostgreSQL connection string |
| `PORT` | `1456` | API server port |
| `CURRENT_POLL_INTERVAL_MS` | `60000` | Polling interval in milliseconds |
| `APP_TIMEZONE` | `Europe/Dublin` | Station timezone for calendar calculations |
| `LOG_LEVEL` | `info` | Pino log level |
| `RETENTION_OBSERVATION_MAX_AGE_DAYS` | `0` | Delete observations older than this; `0` keeps them forever |
| `RETENTION_SUMMARY_MAX_AGE_DAYS` | `0` | Delete daily summaries older than this; `0` keeps them forever |

## Key Design Decisions

- **Canonical metric units** — all values stored as Celsius, hPa, m/s, mm, W/m², degrees, percent. Conversion happens at the WeatherLink adapter boundary.
- **JSONB measurements** — observations store measurements as JSONB to accommodate varying sensor types without schema changes.
- **Missing data is `null`** — never zero. A sensor that didn't report a value is represented as null.
- **Anti-corruption layer** — WeatherLink field names and units never leak past the adapter into the domain.
- **Manual dependency injection** — composition roots wire dependencies explicitly. No DI container.

## Delivery Phases

- **Phase 1** — Foundation (current): live dashboard, polling, persistence
- **Phase 2** — Historical data sync and backfill
- **Phase 3** — Records (all-time, monthly, yearly extremes)
- **Phase 4** — Trends and comparisons
- **Phase 5** — Data exports (CSV, JSON, PNG, SVG, PDF)
- **Phase 6** — Hardening (alerting, retention, resilience)

## License

Private
