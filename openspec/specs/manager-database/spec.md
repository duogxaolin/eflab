# manager-database Specification

> **Status: removed from the web UI on 2026-10-07; API remains** (`/managers` is gone; the `manager` router stays live and the Manager table is kept current by `pnpm db:refresh` — 1,475 managers with eFHUB tactic ratings — and is exercised by `scripts/smoke-test.sh`). Requirements below are kept as the historical record.

## Purpose
The manager database capability catalogs managerial tactical profiles, playstyle ratings, team playstyle bonuses, and squad compatibility rankings.
## Requirements
### Requirement: Manager Directory and Filtering
The system MUST catalog eFootball managers with their ratings across 6 tactical styles: Possession Game, Quick Counter, Long Ball Counter, Out Wide, Long Ball, and Overload.

#### Scenario: Searching for high Quick Counter managers
- **WHEN** user filters managers for Quick Counter >= 88
- **THEN** matching managers (e.g., Antonio Conte) are listed with their full tactical scorecards and associated attribute boosters.

### Requirement: Manager Tactical Compatibility
The system MUST calculate compatibility between a selected manager and target squad or player cards based on tactical affinity scores.

#### Scenario: Inspecting player compatibility with manager
- **WHEN** viewing a manager detail page
- **THEN** the system lists compatible player roles and displays expected in-game team spirit ratings.

