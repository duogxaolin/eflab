## MODIFIED Requirements

### Requirement: CSS 3D Hardware-Accelerated Card View
The card presentation MUST render the single pre-composited card image with CSS only (no Three.js or WebGL). On hover or keyboard focus of a card tile, the tile SHALL scale to 1.05 with a raised stacking order and its caption text SHALL turn from 80 % white to full white; the pointer-follow 3D tilt and glare are removed. The scale transition SHALL be disabled when the operating system requests reduced motion.

#### Scenario: Pointer movement over card
- **WHEN** a user hovers a player card tile on a desktop pointer
- **THEN** the tile scales to 1.05 above its neighbours, its caption turns full white, and no 3D rotation or glare layer is applied.

#### Scenario: Reduced motion hover
- **WHEN** the operating system requests reduced motion and the user hovers a card tile
- **THEN** the tile does not animate a scale change.
