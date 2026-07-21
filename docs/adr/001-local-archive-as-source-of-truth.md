# ADR 001: Local Archive as the Dashboard Source of Truth

## Status
Accepted

## Context
The service retrieves observations from WeatherLink, which may be unavailable or rate-limited. The dashboard must remain functional during outages.

## Decision
All dashboard queries read from the local PostgreSQL database, never directly from WeatherLink. WeatherLink is treated solely as an upstream acquisition source.

## Consequences
- The dashboard works during WeatherLink outages.
- Data freshness depends on synchronization status.
- Storage costs are local and predictable.
