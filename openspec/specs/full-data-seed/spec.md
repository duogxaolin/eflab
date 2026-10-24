# full-data-seed Specification

## Purpose
Production ingestion of the full 44,028-player efhub SQLite dump into PostgreSQL with Postgres extensions and index tuning for sub-100ms query latency.
## Requirements
### Requirement: Full Dataset Ingestion
The `pnpm db:seed` script MUST ingest all player cards (50,691 in the 2026-10-18 efootbase dump), managers, teams, leagues, countries, 67 skills, boosters, featured bundles, and packs from the efootbase dump into PostgreSQL, applying faithful field mapping and BigInt ID mapping, WITHOUT deleting user-generated data unless explicitly requested and replacing catalogue data atomically. The `pnpm db:refresh` script MUST run the seed followed by the eFHUB cross-fill.

#### Scenario: Running full seed
- **WHEN** `pnpm db:seed` completes
- **THEN** `SELECT COUNT(*) FROM "Player"` returns at least the number of rows of the dump (50,691 on the 2026-10-18 dump; earlier cards missing from a newer dump are kept unless `--prune`), managers, teams, leagues, skills, boosters, packs and featured bundles are loaded, and user, account and session rows are unchanged.

#### Scenario: Running the refresh
- **WHEN** `pnpm db:refresh` completes
- **THEN** the player count is the dump's plus the eFHUB-only players (50,694 on the 2026-10-18 dump), the managers the eFHUB file can fill carry non-zero tactics (at least 1,475 on 2026-10-18), and tier badges are present as the eFHUB file gives them (10,745 on 2026-10-18).

### Requirement: Fuzzy Multilingual Search
The system MUST enable `pg_trgm` and `unaccent` PostgreSQL extensions through a migration or bootstrap step that runs on a fresh database, and MUST create index(es) that serve name search so accent- and case-insensitive substring and fuzzy queries across English, accented, Japanese, and Chinese names use an index scan.

#### Scenario: Fuzzy search with accents
- **WHEN** a user searches "schar"
- **THEN** the search returns "Fabian Schär" (accent-insensitive match) in under 50ms using an index scan.

#### Scenario: Fresh database
- **WHEN** the documented setup is run on an empty database
- **THEN** the extensions and the name indexes exist and search succeeds.

### Requirement: Query Performance at Scale
The system MUST validate that default paginated player listings (sorted by OVR descending, 24 per page) return in under 100ms against the full 44,028-row dataset.

#### Scenario: Default listing latency
- **WHEN** a client requests `player.list` with no filters, page 1, limit 24, sort OVR desc
- **THEN** the tRPC endpoint returns results in under 100ms as measured server-side.

