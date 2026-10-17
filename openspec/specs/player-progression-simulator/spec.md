# player-progression-simulator Specification

## Purpose
Lets users explore how a card develops by spending training points, toggling boosters and changing position, with stats and an estimated overall that follow the rules recovered from the eFHUB data.
## Requirements
### Requirement: Training Budget
The simulator SHALL allow a card to spend at most `levelCap − 1` training points, one point per level above 1, where the selected Max Level never exceeds the card's level cap.

#### Scenario: Level 1 card
- **WHEN** a card has a level cap of 1
- **THEN** the detail page shows no Progression panel and a note that the card has no progression.

#### Scenario: Budget limit
- **WHEN** a card has a level cap of 31 and the user has spent 30 points
- **THEN** every further increase that would cost more than the remaining points is disabled.

### Requirement: Ten Training Categories
Training SHALL use ten categories that each raise every stat they contain by the number of stat points bought in that category: Shooting (finishing, placeKicking, curl), Passing (lowPass, loftedPass), Dribbling (dribbling, ballControl, tightPossession), Dexterity (offensiveAwareness, acceleration, balance), Lower Body (kickingPower, speed, stamina), Aerial (heading, physicalContact, jump), Defending (defensiveAwareness, defensiveEngagement, ballWinning, aggression), GK1 (gkAwareness), GK2 (gkParrying — the eFHUB 'GKClearing' stat — and gkReach) and GK3 (gkCatching, gkReflexes). Projected stats SHALL NOT be capped at 99.

#### Scenario: Shooting gain
- **WHEN** a user buys 4 stat points in Shooting
- **THEN** Finishing, Set Piece Taking and Curl each rise by 4 and no other stat changes.

### Requirement: Cost Curve
The nth stat point bought in one category SHALL cost 0.5 × ceil(n / 4) training points, so the cumulative cost of 2, 4, 8, 12, 16, 20 and 22 stat points is 1, 2, 6, 12, 20, 30 and 36 points. The panel SHALL show the cost of the next stat point for each category.

#### Scenario: Next cost
- **WHEN** a category already holds 4 stat points
- **THEN** the next-cost label for that category shows 1 and the 5th point deducts 1 from the remaining budget.

### Requirement: Estimated Overall
The overall for the selected position SHALL be computed as a fixed linear combination of the projected stats for that position, labelled as an estimate with a "~" marker and an accuracy note (about ±1; lower confidence for goalkeepers). Position choice SHALL default to the card's registered position and offer all 13 positions.

#### Scenario: Estimate accuracy
- **WHEN** the estimate is evaluated on the committed fixture cards for the 11 outfield positions other than CB and CF
- **THEN** at least 99% are within 1 of the reference overall.

### Requirement: Proficiency-Aware Estimate
The estimate's "±1" accuracy note SHALL be shown only for positions where the card has full proficiency. Every option of the position selector SHALL carry the card's proficiency there (full, half or none), and at a half or non-proficient position the estimate SHALL apply the fitted proficiency penalty `max(40, k × full estimate + c)` for that position and proficiency, with a note that says so and reports the measured held-out accuracy.

#### Scenario: Half-proficiency position
- **WHEN** a user selects a position where the card has half proficiency
- **THEN** the estimate is lower than the full-proficiency formula, the note names the position as half-proficiency with the penalty applied, and the "±1 at full-proficiency positions" wording is not shown.

#### Scenario: Outfield card at goalkeeper
- **WHEN** an outfield card is evaluated at GK with no proficiency
- **THEN** the estimate reads 40.

### Requirement: Max Level Editing
Typing in the Max Level field SHALL NOT change the build until the value is committed on blur or Enter; the native spinner and the arrow keys SHALL commit immediately. A committed value SHALL be clamped to 1..levelCap, an empty or non-numeric draft SHALL revert to the committed level, and the allocation SHALL be reset only when the committed level can no longer afford the points already spent, which the live region announces.

#### Scenario: Retyping the level keeps an affordable allocation
- **WHEN** 6 points are spent, the user clears the Max Level field and types 25
- **THEN** the field shows 25 after commit, the allocation is unchanged, and the budget reads 24.

#### Scenario: Lower level cannot afford the spend
- **WHEN** 6 points are spent and the user commits level 5
- **THEN** the allocation is reset to zero and the live region announces the reset.

### Requirement: Boosters Without Stat Data
A booster slot whose resolved stat vector is empty SHALL be presented like an unknown booster: its name with "(no stat data)", no ON/OFF toggle, and it SHALL NOT count toward custom-build detection.

#### Scenario: Empty booster vector
- **WHEN** a card's Booster 2 resolves to a booster with no stat deltas
- **THEN** the slot shows "(no stat data)" and offers no toggle.

### Requirement: Max OVR Preset
The Max OVR action SHALL set the allocation that maximises the estimated overall at the selected position within the remaining budget, and Reset SHALL return every category to zero.

#### Scenario: Optimal allocation
- **WHEN** Max OVR is pressed on a striker with budget 49
- **THEN** the spent points never exceed 49 and the estimated overall is at least the overall of the reference allocation minus 0.8.

### Requirement: Boosters From Real Data
The simulator SHALL resolve boosters by id, apply Booster 1 by default and Booster 2 only when toggled, add their stat vectors to the result and show each booster's name and stat deltas.

#### Scenario: Booster only given by id
- **WHEN** a card has a booster id and no inline booster data
- **THEN** its stat vector is resolved from the booster table and applied.

### Requirement: Honest Limits
The panel SHALL NOT offer a manager control, SHALL mark goalkeeper Jump as card-specific instead of projecting it, and SHALL NOT claim exact overall values.

#### Scenario: Goalkeeper Aerial training
- **WHEN** a goalkeeper buys Aerial stat points
- **THEN** Heading and Physical Contact rise and Jump shows "n/a (card-specific)".

### Requirement: Accessible and Responsive Panel
Every stepper SHALL be keyboard operable with a label and current value exposed to assistive technology, and the panel SHALL fit without horizontal page scrolling at 320 to 480 px.

#### Scenario: Keyboard use
- **WHEN** a keyboard user focuses a category stepper and presses the increase key
- **THEN** the value rises by one stat point, the remaining budget and the estimated overall update, and the change is announced through a live region.

