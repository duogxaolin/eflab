# player-progression-simulator Specification

## Purpose
Lets users explore how a card develops by spending training points, toggling boosters and changing position, with stats and an estimated overall that follow the rules recovered from the eFHUB data.
## Requirements
### Requirement: Training Budget
The simulator SHALL allow a card to spend at most `levelCap − 1` training points, one point per level above 1, where the selected Max Level never exceeds the card's level cap. The panel SHALL display that budget in efootbase's whole-point unit, which is twice the engine's point (a level cap of 31 reads "60 pts").

#### Scenario: Level 1 card
- **WHEN** a card has a level cap of 1
- **THEN** the detail page shows no Progression panel and the note that progression and manager data are not available for the card.

#### Scenario: Budget limit
- **WHEN** a card has a level cap of 31 (budget "60 pts") and the user has spent 58 pts
- **THEN** every further increase whose displayed next cost exceeds the 2 pts left is disabled.

### Requirement: Ten Training Categories
Training SHALL use ten categories that each raise every stat they contain by the number of stat points bought in that category: Shooting (finishing, placeKicking, curl), Passing (lowPass, loftedPass), Dribbling (dribbling, ballControl, tightPossession), Dexterity (offensiveAwareness, acceleration, balance), Lower Body Strength (kickingPower, speed, stamina), Aerial Strength (heading, physicalContact, jump), Defending (defensiveAwareness, defensiveEngagement, ballWinning, aggression), Goalkeeper 1 (gkAwareness), Goalkeeper 2 (gkParrying — the eFHUB 'GKClearing' stat — and gkReach) and Goalkeeper 3 (gkCatching, gkReflexes). Projected stats SHALL NOT be capped at 99.

#### Scenario: Shooting gain
- **WHEN** a user buys 4 stat points in Shooting
- **THEN** Finishing, Place Kicking and Curl each rise by 4 and no other stat changes.

### Requirement: Cost Curve
The nth stat point bought in one category SHALL cost 0.5 × ceil(n / 4) engine points, so the cumulative engine cost of 2, 4, 8, 12, 16, 20 and 22 stat points is 1, 2, 6, 12, 20, 30 and 36 points. The panel SHALL show the cost of the next stat point for each category in the displayed whole-point unit (twice the engine cost: the first four stat points cost 1 pt each, the next four 2 pts each).

#### Scenario: Next cost
- **WHEN** a category already holds 4 stat points
- **THEN** the next-cost label for that category shows 2 pts and buying the 5th point deducts 2 pts from the displayed budget.

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
Typing in the Max Level field SHALL NOT change the build until the value is committed on blur or Enter; the native spinner and the arrow keys SHALL commit immediately. A committed value SHALL be clamped to 1..levelCap, an empty or non-numeric draft SHALL revert to the committed level, and the allocation SHALL be reset only when the committed level can no longer afford the points already spent, which the live region announces in the displayed unit.

#### Scenario: Retyping the level keeps an affordable allocation
- **WHEN** 12 pts are spent, the user clears the Max Level field and types 25
- **THEN** the field shows 25 after commit, the allocation is unchanged, and the budget reads "12/48 pts".

#### Scenario: Lower level cannot afford the spend
- **WHEN** 12 pts are spent and the user commits level 5
- **THEN** the allocation is reset to zero and the live region announces the reset ("allocation reset: level 5 gives 8 pts, fewer than the 12 spent").

### Requirement: Boosters Without Stat Data
A booster slot whose resolved stat vector is empty SHALL be presented like an unknown booster: its name with "(no stat data)", no ON/OFF toggle, and it SHALL NOT count toward custom-build detection.

#### Scenario: Empty booster vector
- **WHEN** a card's Booster 2 resolves to a booster with no stat deltas
- **THEN** the slot shows "(no stat data)" and offers no toggle.

### Requirement: Max OVR Preset
The Max OVR action SHALL set the allocation that maximises the estimated overall at the selected position within the budget of the committed level, and Reset SHALL return every category to zero. Because the panel opens on the Max-OVR build, pressing Max OVR on an untouched panel SHALL change nothing.

#### Scenario: Optimal allocation
- **WHEN** Max OVR is pressed on a striker with a level cap of 50 (budget "98 pts")
- **THEN** the spent points never exceed 98 pts and the estimated overall is at least the overall of the reference allocation minus 0.8.

#### Scenario: Reset then Max OVR
- **WHEN** a user presses Reset and then Max OVR
- **THEN** the panel reads "0/N pts" after Reset and returns to the opening allocation after Max OVR.

### Requirement: Boosters From Real Data
The simulator SHALL resolve boosters by id, SHALL apply every booster whose resolved stat vector is non-empty by default (Booster 1 and Booster 2 both on when the panel opens, as efootbase shows them), SHALL let the user toggle each usable booster off and on, SHALL add the active boosters' stat vectors to the result and SHALL show each booster's name and stat deltas. Turning a usable booster off counts as a custom build.

#### Scenario: Booster only given by id
- **WHEN** a card has a booster id and no inline booster data
- **THEN** its stat vector is resolved from the booster table and applied.

#### Scenario: Both boosters usable
- **WHEN** a card's Booster 1 and Booster 2 both resolve to non-empty stat vectors
- **THEN** both toggles read ON when the panel opens and the stat grid shows their combined "+N" chips.

#### Scenario: Booster toggled off
- **WHEN** the user turns Booster 1 off
- **THEN** its stat deltas leave the projected stats and the heading switches to the custom-build wording.

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

### Requirement: Default Build
The Progression panel SHALL open on the Max-OVR build for the card's registered position with both boosters on, Reset SHALL return every category to zero, and Max OVR SHALL restore the optimal build.

#### Scenario: Opening state
- **WHEN** a user opens a player page whose card has a level cap above 1
- **THEN** the panel shows the Max-OVR allocation with Booster 1 and Booster 2 on, and the card shows the corresponding estimated overall.

### Requirement: Whole-Point Unit
The panel SHALL display points in whole points equal to twice the internal half-point budget, show "used/total pts", and show next costs in the same unit (the first four stat points of a category cost 1 each).

#### Scenario: Level 32 card
- **WHEN** a card has a level cap of 32
- **THEN** the budget reads "62 pts" total and a fully spent build reads "62/62 pts".

### Requirement: Category Labels
Category labels SHALL read Shooting, Passing, Dribbling, Dexterity, Lower Body Strength, Aerial Strength, Defending and Goalkeeper 1, 2 and 3.

#### Scenario: Labels
- **WHEN** the panel is open
- **THEN** the ten category rows show those labels.

### Requirement: Honest Estimate Label
The estimated overall SHALL state that it excludes Manager Proficiency and that efootbase shows a higher value at its default proficiency, with the measured gap, unless a proficiency model verified on fresh measurements is shipped, in which case the proficiency control and its default SHALL be shown.

#### Scenario: No proficiency model
- **WHEN** the panel shows the estimated overall and no verified proficiency model ships
- **THEN** the label near the value names the missing Manager Proficiency and the measured gap.

### Requirement: Level Cap One Note
For cards whose level cap is 1, the page SHALL show a short note that progression and manager data are unavailable for the card instead of the Progression panel.

#### Scenario: Level cap 1 card
- **WHEN** a user opens a card with a level cap of 1
- **THEN** no stepper is shown and the note is visible.

