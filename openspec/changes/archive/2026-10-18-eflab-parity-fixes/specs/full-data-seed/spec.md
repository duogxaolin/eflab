## MODIFIED Requirements

### Requirement: Full Dataset Ingestion
The `pnpm db:seed` script MUST ingest all player cards (48,407 in the 2026-10 efootbase dump), managers, teams, leagues, countries, 67 skills, boosters, featured bundles, and packs from the efootbase dump into PostgreSQL, applying faithful field mapping and BigInt ID mapping, WITHOUT deleting user-generated data unless explicitly requested and replacing catalogue data atomically. The `pnpm db:refresh` script MUST run the seed followed by the eFHUB cross-fill.

#### Scenario: Running full seed
- **WHEN** `pnpm db:seed` completes
- **THEN** `SELECT COUNT(*) FROM "Player"` returns 48407, managers, teams, leagues, skills, boosters, packs and featured bundles are loaded, and user, account and session rows are unchanged.

#### Scenario: Running the refresh
- **WHEN** `pnpm db:refresh` completes
- **THEN** the player count is 48410, managers number at least 1,475 with non-zero tactics, and tier badges are present on 10,745 players.

### Requirement: Fuzzy Multilingual Search
The system MUST enable `pg_trgm` and `unaccent` PostgreSQL extensions through a migration or bootstrap step that runs on a fresh database, and MUST create index(es) that serve name search so accent- and case-insensitive substring and fuzzy queries across English, accented, Japanese, and Chinese names use an index scan.

#### Scenario: Fuzzy search with accents
- **WHEN** a user searches "schar"
- **THEN** the search returns "Fabian Schär" (accent-insensitive match) in under 50ms using an index scan.

#### Scenario: Fresh database
- **WHEN** the documented setup is run on an empty database
- **THEN** the extensions and the name indexes exist and search succeeds.
