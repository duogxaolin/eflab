# tier-list-creator Specification

> **API removed in change `remove-dead-surface` (2026-10-18)** — the `tierList` router and the TierList / TierVote tables were deleted; `Player.communityTier` (eFHUB cross-fill) is unaffected.

> **Status: removed from the web UI on 2026-10-07; API remains** (`tierList` router and TierList/TierVote tables are unused by the web; `Player.communityTier` badges now come from the eFHUB cross-fill instead). Requirements below are kept as the historical record.

## Purpose
Drag-and-drop tier list builder (S/A/B/C/D tiers), community tier list browser, and consensus tier aggregation on player cards.
## Requirements
### Requirement: Tier List Creation
Authenticated users MUST be able to create a tier list by dragging player card thumbnails into S/A/B/C/D tiers, naming the list, and saving it as public.

#### Scenario: Saving a tier list
- **WHEN** a user arranges 18 players into tiers and clicks "Save"
- **THEN** a `TierList` record is persisted with the tier assignments as JSON, marked public, and appears in the community tier list browser.

### Requirement: Community Tier Consensus
The system MUST aggregate all individual `TierVote` records for a player card into a consensus tier badge (S/A/B/C/D) displayed on the card.

#### Scenario: Consensus recalulation after vote
- **WHEN** 100 users vote a card: 60 vote "S", 30 vote "A", 10 vote "B"
- **THEN** the card's `communityTier` field is set to "S" (plurality) and the badge renders "S" on the card UI.

