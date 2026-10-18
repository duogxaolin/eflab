## MODIFIED Requirements

### Requirement: Progression Point Allocation
The system MUST allow users to increment and decrement stat points across the ten training categories (Shooting, Passing, Dribbling, Dexterity, Lower Body, Aerial, Defending, GK1, GK2, GK3) within a budget of the card's level cap minus 1 training points, using the cost curve in the progression rules, and MUST show the remaining budget.

#### Scenario: Allocating training points
- **WHEN** a user buys 4 stat points in Shooting on a forward card with at least 2 training points available
- **THEN** Finishing, Set Piece Taking and Curl each increase by 4, and 2 training points are deducted from the remaining budget.

### Requirement: Booster Slot Toggling
The simulator MUST permit users to activate or deactivate booster slots (Booster 1, Booster 2) and instantly reflect the corresponding stat deltas, taken from the booster's real stat vector, in the simulated profile.

#### Scenario: Toggling Booster 1 on an Epic card
- **WHEN** Booster 1 (e.g., Defending +4) is activated
- **THEN** the stats in the booster's vector immediately show an additional +4 bonus and are highlighted.

## REMOVED Requirements

### Requirement: Manager Tactical Boost Projection
**Reason**: No available dataset defines how a manager changes stats or overall, so the previous thresholds and bonuses were invented and could not be verified.
**Migration**: The simulator no longer offers a manager control. Reintroduce it as a new requirement once a verifiable data source exists.
