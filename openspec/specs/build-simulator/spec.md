# build-simulator Specification

> **Status: removed from the web UI in change `eflab-parity-fixes` (2026-10-17); API remains** (the detail-page Progression sliders, Max OVR preset and Manager Proficiency control were removed because the efootbase dump carries no training rules; `packages/shared/src/progression.ts` remained; the headless `components/build-simulator/BuildSimulator.tsx` and `community.simulate` were deleted in change `remove-dead-surface` on 2026-10-18 — the engine now runs only client-side in `ProgressionPanel.tsx`, see `player-progression-simulator`). Requirements below are kept as the historical record.

## Purpose
The build simulator capability calculates projected player ratings and simulated attribute growths as users allocate progression points across training categories, toggle booster slots, and pair cards with managers.
## Requirements
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

