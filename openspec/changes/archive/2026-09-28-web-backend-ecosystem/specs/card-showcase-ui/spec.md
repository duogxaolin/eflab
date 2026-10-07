## Purpose

The card showcase UI capability renders responsive, aesthetically distinct eFootball player cards using CSS 3D hardware-accelerated transforms, dynamic booster badges, and interactive position familiarity heatmaps without WebGL runtime overhead.

## ADDED Requirements

### Requirement: CSS 3D Hardware-Accelerated Card View
The card presentation MUST render using standard CSS 3D transforms (`rotateX`, `rotateY`, `perspective`) and pointer-follow tilt animations rather than Three.js or WebGL contexts.

#### Scenario: Pointer movement over card
- **WHEN** a user hovers or drags across a player card on desktop or touch devices
- **THEN** the card applies smooth interactive 3D rotation, dynamic foil reflections, and lighting glare effects at 60 FPS without crashing headless or low-end rendering contexts.

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
