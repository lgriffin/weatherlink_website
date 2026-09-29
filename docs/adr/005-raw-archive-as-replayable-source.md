# ADR 005: Raw Archive as a Replayable Source

## Status
Accepted

## Context
Historic observations were mapped from WeatherLink archive records at download time and the raw record was discarded. When the mapping was wrong (interval rainfall stored as a daily total; interval highs and lows dropped), the only fix was to download the history again. Observations were also deleted after 365 days while their sync windows remained, so deleted history was never fetched again.

The station archive is also the training set for local forecasting, which needs the full history at interval resolution.

## Decision
Store every archive record exactly as the API returned it in `archive_records`, keyed by station, sensor and timestamp. The payload is opaque to the domain (`ArchiveRecord.payload: unknown`); only the WeatherLink adapter interprets it through `WeatherDataSource.mapArchiveRecords`.

Historic observations, daily summaries and records are derived data and can be rebuilt from the raw archive at any time (`pnpm archive:rebuild`). Local retention defaults to keeping everything.

## Consequences
- A mapping fix is applied to the whole history with a rebuild, without calling WeatherLink.
- Storage grows by roughly 100k rows per sensor per year at 5-minute intervals, which SQLite handles comfortably.
- WeatherLink field names still never leave the adapter.
