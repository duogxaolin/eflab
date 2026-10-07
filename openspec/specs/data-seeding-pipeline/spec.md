# data-seeding-pipeline Specification

## Purpose
The data seeding pipeline capability ingests, transforms, and synchronizes eFootball entity datasets into PostgreSQL, supporting both lightweight test fixtures and full-scale external database imports.
## Requirements
### Requirement: Mock Fixture Ingestion for Rapid Prototyping
The pipeline MUST support seeding 20–50 representative player cards (covering Epic, Showtime, Standard, different positions and nationalities) and 5 managers into PostgreSQL via a single CLI command (`pnpm seed:mock`).

#### Scenario: Running initial seed
- **WHEN** developer runs the mock seed script
- **THEN** sample players (including Lewandowski, Messi, Bonucci, Chiellini), skills, packs, and managers populate the database within 5 seconds without requiring external network dependencies.

### Requirement: Full-Scale SQLite Import Pipeline
The pipeline MUST parse external SQLite dumps (such as extracted efhub 44,000+ card schemas), normalize field naming differences (e.g., mapping `GKClearing` to internal schema and converting 15-digit IDs to BigInt), and bulk upsert records without primary key collisions.

#### Scenario: Running full SQLite synchronization
- **WHEN** synchronization script runs against a valid eFootball SQLite dump
- **THEN** 44,000+ player cards, associated appearance metrics, and manager records are upserted into PostgreSQL with transactional safety.

