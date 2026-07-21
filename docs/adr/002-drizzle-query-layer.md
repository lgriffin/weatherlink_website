# ADR 002: Drizzle as the Database Query Layer

## Status
Accepted

## Context
The project needs a type-safe query layer for PostgreSQL. Kysely and Drizzle were the two finalists.

## Decision
Use Drizzle ORM with its schema-first approach and built-in migration tooling (Drizzle Kit).

## Consequences
- Schema definitions double as TypeScript types.
- Migrations are generated from schema diffs.
- The learning curve is minimal for TypeScript developers.
