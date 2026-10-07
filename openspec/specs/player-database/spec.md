# player-database Specification

## Purpose
The player database capability provides data querying, multi-dimensional filtering, statistical ranking, and comprehensive detailed profiling for eFootball player cards.
## Requirements
### Requirement: Multi-dimensional Player Search and Filtering
The system MUST allow users to query player cards across 11 key filter dimensions: Player Card Type (Standard, Epic, Show Time, Big Time, Highlight, Strike Arena), Position, Playing Style (Attacking & Defensive), Overall Rating (OVR), Weak Foot, Physicality, National Team, Club, and Skills.

#### Scenario: Filtering by Position and Card Type
- **WHEN** a user selects position `CB` and card type `Epic`
- **THEN** the system returns a paginated list of Epic CB cards matching the criteria sorted by descending Overall Rating by default.

#### Scenario: Searching by Player Name
- **WHEN** a user enters a search query containing English, Japanese, or accented player names (e.g., "Lewandowski", "Messi")
- **THEN** the system performs fuzzy match against `name`, `accentedName`, `japName`, and `chineseName` and returns matching results within 100ms.

### Requirement: 60+ Field Sorting
The system MUST support sorting player lists by any of the 26 base attributes, physical dimensions (height, weight, leg coverage), or overall ratings.

#### Scenario: Sorting by Physical Contact
- **WHEN** a user selects sort criterion `Physical Contact` with direction `Descending`
- **THEN** the player list displays cards ordered from highest to lowest physical contact rating.

### Requirement: Detailed Player Card Inspection
The system MUST present complete card profiles including primary position, secondary proficiencies, 26 base stats, 11 physical body parameters, 5 computed physics metrics, weak foot accuracy/usage, form consistency, and player skills.

#### Scenario: Retrieving Card Details by ID
- **WHEN** a client requests a player card by its 15-digit External PID
- **THEN** the system returns the full card record including all attributes, associated pack metadata, booster definitions, and alternate card versions for that player.

