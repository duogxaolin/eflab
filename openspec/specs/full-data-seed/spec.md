# full-data-seed Specification

## Purpose
Production ingestion of the full 44,028-player efhub SQLite dump into PostgreSQL with Postgres extensions and index tuning for sub-100ms query latency.
## Requirements
### Requirement: Full Dataset Ingestion
The `pnpm db:seed:full` script MUST ingest all 44,028 player cards, 1,525 managers, 981 teams, 67 skills, boosters, and packs from `docs/efhub_db_202609240.sqlite` into PostgreSQL within 10 minutes, with field alias normalization (`GKClearing`→`gkParrying`, `BallWinning`→`tackling`) and BigInt ID mapping.

#### Scenario: Running full seed
- **WHEN** `pnpm db:seed:full` completes
- **THEN** the database contains 44,028 player rows, 1,525 manager rows, and a `SELECT COUNT(*) FROM "Player"` returns 44028.

### Requirement: Fuzzy Multilingual Search
The system MUST enable `pg_trgm` and `unaccent` PostgreSQL extensions and create a trigram GIN index on the player name columns to support fuzzy search across English, accented, Japanese, and Chinese names.

#### Scenario: Fuzzy search with accents
- **WHEN** a user searches "schar"
- **THEN** the search returns "Fabian Schär" (accent-insensitive trigram match) within 100ms.

### Requirement: Query Performance at Scale
The system MUST validate that default paginated player listings (sorted by OVR descending, 24 per page) return in under 100ms against the full 44,028-row dataset.

#### Scenario: Default listing latency
- **WHEN** a client requests `player.list` with no filters, page 1, limit 24, sort OVR desc
- **THEN** the tRPC endpoint returns results in under 100ms as measured server-side.

