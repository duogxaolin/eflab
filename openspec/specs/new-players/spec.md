# new-players Specification

> **API removed in change `remove-dead-surface` (2026-10-18)** — the `pages.newPlayers` procedure (`pages` router) and the `pack` router were deleted; the Pack / PackCard tables stay as data.

> **Status: removed from the web UI on 2026-10-07** (`/new-players` is gone; the home "Latest Packs" carousel and `/packs` cover new releases through `FeaturedBundle`). Requirements below are kept as the historical record.

## Purpose
A page listing the latest player cards grouped by pack release date — the efhub `/new-players` equivalent.
## Requirements
### Requirement: New Players by Pack
The `/new-players` page MUST list the most recently released player cards, grouped by their parent pack, with release dates in descending order.

#### Scenario: Viewing newest cards
- **WHEN** a visitor navigates to `/new-players`
- **THEN** the page displays packs (e.g., "Power Tackle — Sep 24, 2026") with their constituent new player cards as thumbnails, newest pack first.

