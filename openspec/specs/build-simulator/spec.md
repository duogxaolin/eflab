# build-simulator Specification

## Purpose
The build simulator capability calculates projected player ratings and simulated attribute growths as users allocate progression points across training categories, toggle booster slots, and pair cards with managers.
## Requirements
### Requirement: Progression Point Allocation
The system MUST allow users to increment and decrement progression points across training categories (Shooting, Passing, Dribbling, Dexterity, Lower Body, Aerial, Defending, Goalkeeping) within the card's maximum level capacity.

#### Scenario: Allocating training points
- **WHEN** a user allocates 4 points to Shooting on a forward card
- **THEN** Offensive Awareness increases by +4, Finishing increases by +4, and Set Piece Taking increases by +2, with remaining training points decremented accordingly.

### Requirement: Manager Tactical Boost Projection
The simulator MUST incorporate selected manager tactics (Possession, Quick Counter, Long Ball Counter, Out Wide, Long Ball) and apply appropriate rating bonuses to affected attributes when manager playstyle proficiency thresholds are met.

#### Scenario: Selecting an 88+ Quick Counter manager
- **WHEN** a user selects a manager with Quick Counter rating >= 88
- **THEN** qualifying player stats receive a +2 team playstyle bonus and projected max OVR updates dynamically.

### Requirement: Booster Slot Toggling
The simulator MUST permit users to activate or deactivate booster slots (Booster 1, Booster 2) and instantly reflect the corresponding stat deltas in the simulated profile.

#### Scenario: Toggling Booster 1 on an Epic card
- **WHEN** Booster 1 (e.g., Defending +4) is activated
- **THEN** Defensive Awareness, Tackling, Aggression, and Defensive Engagement immediately display an additional +4 bonus and highlight green.

