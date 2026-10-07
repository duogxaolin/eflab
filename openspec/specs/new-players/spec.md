# new-players Specification

## Purpose
A page listing the latest player cards grouped by pack release date — the efhub `/new-players` equivalent.
## Requirements
### Requirement: New Players by Pack
The `/new-players` page MUST list the most recently released player cards, grouped by their parent pack, with release dates in descending order.

#### Scenario: Viewing newest cards
- **WHEN** a visitor navigates to `/new-players`
- **THEN** the page displays packs (e.g., "Power Tackle — Sep 24, 2026") with their constituent new player cards as thumbnails, newest pack first.

