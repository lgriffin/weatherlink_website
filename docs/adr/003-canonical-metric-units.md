# ADR 003: Canonical Metric Units for Persistence

## Status
Accepted

## Context
WeatherLink provides data in US customary units (Fahrenheit, mph, inHg, inches). The spec requires metric canonical units.

## Decision
Convert all measurements to canonical metric units at the anti-corruption layer boundary. Store only canonical values. Convert to display units at presentation boundaries.

## Consequences
- All comparisons, aggregations, and records use consistent units.
- Display conversion is a pure presentation concern.
- The WeatherLink adapter handles all unit conversion.
