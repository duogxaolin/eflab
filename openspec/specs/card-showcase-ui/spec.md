# card-showcase-ui Specification

## Purpose
The card showcase UI capability renders responsive, aesthetically distinct eFootball player cards using CSS 3D hardware-accelerated transforms, dynamic booster badges, and interactive position familiarity heatmaps without WebGL runtime overhead.
## Requirements
### Requirement: CSS 3D Hardware-Accelerated Card View
The card presentation MUST render the single pre-composited card image with CSS only (no Three.js or WebGL). On hover or keyboard focus of a card tile, the tile SHALL scale to 1.05 with a raised stacking order and its caption text SHALL turn from 80 % white to full white; the pointer-follow 3D tilt and glare are removed. The scale transition SHALL be disabled when the operating system requests reduced motion.

#### Scenario: Pointer movement over card
- **WHEN** a user hovers a player card tile on a desktop pointer
- **THEN** the tile scales to 1.05 above its neighbours, its caption turns full white, and no 3D rotation or glare layer is applied.

#### Scenario: Reduced motion hover
- **WHEN** the operating system requests reduced motion and the user hovers a card tile
- **THEN** the tile does not animate a scale change.

### Requirement: Dynamic Booster Badges
The card component MUST clearly display active booster bonuses (e.g., `+4 Defending`, `Lofted Pass +6`) matching the card's booster slot configuration.

#### Scenario: Card with active booster
- **WHEN** a card has configured booster IDs
- **THEN** the UI displays the booster badge with boosted stat categories and highlighted bonus values adjacent to the base stats.

### Requirement: Position Proficiency Heatmap
The card details view MUST display a 12-position football pitch diagram visually distinguishing Full Familiarity, Partial Familiarity, and No Familiarity, with projected OVR ratings for each eligible slot.

#### Scenario: Viewing position adaptability
- **WHEN** viewing a card with full CB and partial DMF familiarity
- **THEN** the pitch graphic highlights CB in solid color with peak rating and DMF in shaded outline with adjusted rating.

