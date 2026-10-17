# community-hub Specification

> **Status: removed from the web UI on 2026-10-07; API remains** (`community` router — builds, reviews, tier votes, `simulate` — and its tables are still registered but unused by the web; the build simulator panel was also removed from the detail page in change `eflab-parity-fixes`). Requirements below are kept as the historical record.

## Purpose
The community hub capability provides user authentication, custom build saving and sharing, community tier list creation and voting, and player reviews.
## Requirements
### Requirement: Custom Build Bookmarking and Sharing
The system MUST permit authenticated users to save their progression builds with custom level distributions, assign notes, generate public shareable permalinks, and browse community-submitted builds.

#### Scenario: Saving a progression build
- **WHEN** an authenticated user clicks "Save Build" on a configured player card
- **THEN** the build record is persisted with its attribute point allocations and is made available under the user's profile and public card build tab.

### Requirement: Community Tier List Creation and Aggregation
The system MUST allow users to construct drag-and-drop tier lists (S, A, B, C, D tiers) for any pack or curated player group, and aggregate community submissions into a consensus tier rating.

#### Scenario: Voting on player tier
- **WHEN** an authenticated user votes a card into tier "S"
- **THEN** the card's community tier vote count updates and the consensus badge (e.g., "Tier A") recalculates dynamically.

### Requirement: Player Card Reviews
The system MUST allow registered users to submit text reviews and numerical 1–5 ratings for individual player cards.

#### Scenario: Submitting a card review
- **WHEN** a user posts a review with rating 5 and commentary
- **THEN** the review appears in the card's review thread and updates the aggregate community satisfaction score.

