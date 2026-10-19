## ADDED Requirements

### Requirement: One Row Mapping For Every efootbase Write Path
Every code path that writes efootbase player data to the database (the seed and the sync worker) SHALL build rows with the same mapping functions, so that a card written by either path has identical column values for identical input, and the seed SHALL accept its dump, metadata, packs and static-snapshot locations from configuration so a staging directory can be seeded.

#### Scenario: Same row from both paths
- **WHEN** the same dump row is mapped for the seed and for an incremental sync
- **THEN** the resulting player column values are equal.

#### Scenario: Seed behaviour unchanged
- **WHEN** the seed is run on the standard dump after the mapping is moved into the shared module
- **THEN** `scripts/verify-seed.py` reports no mismatch and the row counts equal those before the change.

#### Scenario: Staging directory
- **WHEN** the seed is started with the location variables pointing at a temporary directory
- **THEN** it reads the dump, metadata, packs and snapshot from that directory and writes nothing there.
