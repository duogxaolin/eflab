## MODIFIED Requirements

### Requirement: Full Dataset Ingestion
The `pnpm db:seed` script MUST ingest all player cards (50,691 in the 2026-10-18 efootbase dump), managers, teams, leagues, countries, 67 skills, boosters, featured bundles, and packs from the efootbase dump into PostgreSQL, applying faithful field mapping and BigInt ID mapping, WITHOUT deleting user-generated data unless explicitly requested and replacing catalogue data atomically. The `pnpm db:refresh` script MUST run the seed followed by the eFHUB cross-fill.

#### Scenario: Running full seed
- **WHEN** `pnpm db:seed` completes
- **THEN** `SELECT COUNT(*) FROM "Player"` returns at least the number of rows of the dump (50,691 on the 2026-10-18 dump; earlier cards missing from a newer dump are kept unless `--prune`), managers, teams, leagues, skills, boosters, packs and featured bundles are loaded, and user, account and session rows are unchanged.

#### Scenario: Running the refresh
- **WHEN** `pnpm db:refresh` completes
- **THEN** the player count is the dump's plus the eFHUB-only players (50,694 on the 2026-10-18 dump), the managers the eFHUB file can fill carry non-zero tactics (at least 1,475 on 2026-10-18), and tier badges are present as the eFHUB file gives them (10,745 on 2026-10-18).
