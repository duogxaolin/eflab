## MODIFIED Requirements

### Requirement: Real Position Ratings
The eFHUB cross-fill (`overallGK` … `overallCF`) SHALL keep storing per-position ratings as reference columns, storing no value where eFHUB has none, but those columns SHALL NOT be displayed. The Pitch Map, the Best Fit indicator, the "At position" figure and the position dots of the compare page SHALL show values computed from the exact overall formula (see `player-progression-simulator`, "Position Tiles From The Formula") for every card, whether or not eFHUB knows the card, and SHALL NOT display "n/a" for a position.

#### Scenario: Cross-filled ratings
- **WHEN** the cross-fill completes for a player present in eFHUB
- **THEN** the player has a stored rating for every position equal to the eFHUB value, and the Pitch Map shows the values computed from the formula, not the stored ones.

#### Scenario: Player absent from eFHUB
- **WHEN** a player is not present in the eFHUB data
- **THEN** all 13 positions on the Pitch Map show a computed value, no position shows "n/a", and the Best Fit indicator shows the position with the highest computed value.
