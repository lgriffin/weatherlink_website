# ADR 004: JSONB for Observation Measurements

## Status
Accepted

## Context
Weather stations have varying sensor capabilities. Different data structure types produce different fields. A fixed-column schema would require migrations for each new measurement type.

## Decision
Store observation measurements as a JSONB column keyed by canonical measurement name. Each entry contains the value, unit, and timestamp.

## Consequences
- New measurement types require no schema changes.
- JSONB operators enable querying specific measurements.
- Type safety is enforced at the application layer, not the database layer.
- Slightly larger storage footprint than normalized columns.
