# Home Weather Service

## Architecture

pnpm monorepo with Clean Architecture. Dependency flow:

```
apps/ → http-adapter → application → domain ← persistence-adapter ← weatherlink-adapter
```

**Domain has ZERO external dependencies.** No framework imports, no DB clients, no HTTP libraries.

## Packages

- `packages/domain` — Pure TS types, interfaces (ports), value objects
- `packages/contracts` — Zod schemas for env config and API DTOs
- `packages/observability` — Pino logger, prom-client metrics, health checker
- `packages/weatherlink-adapter` — WeatherLink v2 API client + anti-corruption layer
- `packages/persistence-adapter` — Drizzle + PostgreSQL repositories
- `packages/application` — Use cases (orchestrate domain ports)
- `packages/http-adapter` — Fastify route plugins
- `packages/analytics` — [stub] Aggregation, records, trends
- `packages/exports` — [stub] CSV/JSON/PNG/SVG/PDF renderers
- `packages/test-support` — Fixtures, fakes, test utilities

## Apps

- `apps/api` — Fastify server, composition root (port 1456)
- `apps/web` — React + Vite + TanStack Router/Query
- `apps/worker` — Background poller

## Key Conventions

- Canonical units: Celsius, hPa, m/s, mm, W/m², degrees, percent
- Missing data is `null`, never zero
- Branded types for IDs (StationId, SensorId, ObservationId)
- Manual DI in composition roots (no DI container)
- Observations store measurements as JSONB
- Raw WeatherLink archive records are kept in `archive_records` (opaque payload to the domain); observations are derived from them
- Daily summaries use local days in `APP_TIMEZONE` and archive intervals when present
- WeatherLink field names never leak past the adapter

## Commands

```bash
pnpm install                              # Install all dependencies
docker compose up db -d                   # Start PostgreSQL
pnpm db:generate                          # Generate Drizzle migrations
pnpm db:migrate                           # Run migrations
pnpm dev                                  # Start API + web dev servers
pnpm dev:worker                           # Start background poller
pnpm archive:harvest [--from D] [--force] # Download full WeatherLink archive
pnpm archive:rebuild                      # Re-derive everything from raw archive
pnpm archive:gaps [--min-hours N] [--json] # List hardware outages
pnpm test                                 # Run all tests
pnpm typecheck                            # Type-check all packages
```

## Testing

- Vitest for unit/integration tests
- Test fakes in `packages/test-support` (FakeClock, InMemory repos, FakeMetrics)
- Fixture factories: `aStation()`, `aSensor()`, `anObservation()`, `aMeasurement()`
