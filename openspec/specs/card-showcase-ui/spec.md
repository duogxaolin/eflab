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
The card details view MUST display a 13-position football pitch diagram visually distinguishing Full Familiarity, Partial Familiarity, and No Familiarity, with the computed OVR for every position. The pitch SHALL sit in a tertiary-surface box (radius 12, padding 16) and be laid out as a left column (LWF, LMF, LB), a centre column of seven rows (CF, SS, AMF, CMF, DMF, CB, GK — position and value side by side) and a right column (RWF, RMF, RB — position above value), the side cells spanning two, three and two of the centre rows. Full proficiency SHALL be a lime fill at 70 % opacity, half proficiency the same lime at about 30 %, and no proficiency a dark grey; each value SHALL sit in a dark badge in its tier colour, and the proficiency SHALL also be part of each tile's accessible name.

#### Scenario: Viewing position adaptability
- **WHEN** viewing a card with full CB and partial DMF familiarity
- **THEN** the pitch graphic shows CB on the solid lime fill and DMF on the fainter lime fill, each with its computed overall in a tier-coloured badge, and the other positions on the dark grey fill.

