# ADR 007: Forecasting as Ports and Adapters

## Status
Accepted

## Context
ADR 006 put the forecast numbers in a Python `ml/` folder and the words in an Ollama model. The next gains come from data outside the station: forecasts from the big weather models (ECMWF, the Met Office's 2 km UK model, ICON, Harmonie-AROME), observations from nearby stations and the Atlantic buoys, and later radar. Each of those sources can change, fail or be replaced, and the same forecast should run on the Spark, the NAS or a GitHub Actions runner. Without boundaries, every new source would reach into the feature code directly.

## Decision
- The forecasting hexagon lives in Python, in `ml/wxml`. The work is data science (pandas, LightGBM, possibly GRIB files later) and Ollama is reached over HTTP from anywhere, so Python fits. TypeScript stays the serving side: the API's ingest route is the inbound adapter for finished forecasts, and the JSON contract in `packages/contracts` is the boundary. No port is implemented in both languages.
- `wxml/forecasting/` is the core: domain types, ports (`typing.Protocol`, so adapters never import the core's classes) and use cases. It does no I/O. pandas is allowed in the core because tables are the domain's natural shape here.
- `wxml/adapters/` holds one module per adapter. `wxml/__main__.py` is the composition root: it builds adapters and hands them to use cases, as `apps/api` does for the TypeScript side.
- Guidance from any source is normalised to the station's hourly layout: the same column names, canonical units (°C, hPa, m/s, mm, W/m², %), and hour buckets keyed by the UTC start of the hour. Sums and maxima stamped at the end of their hour are moved back an hour.
- Training and scoring use guidance only as it was issued (`ForecastSource.as_issued`), never a later run of the same hour. That is the forecasting version of "never train on shuffled data".
- Ports, in the order they are needed:
  - built: `ObservationStore` (SQLite), `ForecastSource` (Open-Meteo, latest and as-issued 1 to 7 days ahead), `Narrator` (Ollama);
  - planned: `ForecastLedger` (every issued forecast, for honest scoring and for the Ollama training set), `Publisher` (the site's ingest API), `ModelRunner` (LightGBM today), `NeighbourObservations` (Met Éireann stations, Irish weather buoys), `NowcastSource` (radar).
- Feature building stays a pure function in the core, not a port.
- Station coordinates are read from the database and sent only to the forecast provider, rounded to two decimals. They are never printed, logged or published. Live checks in CI use a public reference point.

## Consequences
- A new data source is one adapter module plus tests with a recorded response; nothing else changes.
- Open-Meteo's archive of past runs starts in January 2024 for most models, so guidance-aware models train on less history than the station has. The ledger fixes this going forward for any source, including ones with no archive (Met Éireann's point forecast).
- The existing modules (`data.py`, `features.py`, `models.py`, `predict.py`) keep working and move behind ports as each one is touched.
