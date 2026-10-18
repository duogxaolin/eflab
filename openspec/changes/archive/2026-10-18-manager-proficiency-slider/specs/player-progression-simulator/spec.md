## MODIFIED Requirements

### Requirement: Ten Training Categories
Training SHALL use ten categories that each raise every stat they contain by the number of stat points bought in that category: Shooting (finishing, placeKicking, curl), Passing (lowPass, loftedPass), Dribbling (dribbling, ballControl, tightPossession), Dexterity (offensiveAwareness, acceleration, balance), Lower Body Strength (kickingPower, speed, stamina), Aerial Strength (heading, physicalContact, jump), Defending (defensiveAwareness, defensiveEngagement, ballWinning, aggression), Goalkeeper 1 (gkAwareness and jump), Goalkeeper 2 (gkParrying — the eFHUB 'GKClearing' stat — and gkReach) and Goalkeeper 3 (gkCatching, gkReflexes). Jump therefore rises with stat points in Aerial Strength and in Goalkeeper 1 together. Projected stats SHALL NOT be clamped at 99: training and boosters may take a stat above 99; only the Manager Proficiency bonus stops at 99 (see Manager Proficiency Control).

#### Scenario: Shooting gain
- **WHEN** a user buys 4 stat points in Shooting
- **THEN** Finishing, Place Kicking and Curl each rise by 4 and no other stat changes.

#### Scenario: Jump from two categories
- **WHEN** a user buys 6 stat points in Aerial Strength and 6 in Goalkeeper 1
- **THEN** Jump rises by 12, Heading and Physical Contact rise by 6, and Goalkeeper Awareness rises by 6.

#### Scenario: Outfield opening build may include Goalkeeper 1
- **WHEN** the Max-OVR opening build of an outfield card is computed and Goalkeeper 1's Jump contribution raises the linear estimate more than any other category for the last point
- **THEN** that build may include a Goalkeeper 1 point, and the displayed overall is unaffected beyond rounding.

#### Scenario: Goalkeeper 1 alone
- **WHEN** a goalkeeper buys 12 stat points in Goalkeeper 1 and none in Aerial Strength
- **THEN** Goalkeeper Awareness and Jump each rise by 12.

### Requirement: Estimated Overall
The overall for the selected position SHALL be computed as a fixed linear combination of the projected stats for that position. At the card's registered position it SHALL additionally include a per-card anchor (the card's displayed overall minus the same combination evaluated on its base stats without boosters). The value SHALL be labelled as an estimate with a "~" marker and an accuracy note (about ±1 at the registered position; lower confidence at other positions and for goalkeepers). Position choice SHALL default to the card's registered position and offer all 13 positions.

#### Scenario: Estimate accuracy
- **WHEN** the anchored estimate is evaluated at the registered position on the builds of the committed proficiency fixture, which are in-sample (the rates were fitted on the same six cards) and therefore a regression guard rather than a validation
- **THEN** at least 95% are within 1 of the displayed overall recorded for the build, goalkeepers included.

#### Scenario: Level-1 estimate for outfield positions
- **WHEN** the unanchored estimate is evaluated on the committed fixture cards for the 11 outfield positions other than CB and CF
- **THEN** at least 99% are within 1 of the reference overall.

### Requirement: Proficiency-Aware Estimate
The estimate's "±1" accuracy note SHALL be shown only for positions where the card has full proficiency. Every option of the position selector SHALL carry the card's proficiency there (full, half or none), and at a half or non-proficient position the estimate SHALL apply the fitted proficiency penalty `max(40, k × full estimate + c)` for that position and proficiency, with a note that says so, reports the measured held-out accuracy against the eFHUB hub overall and names it as a hub figure, and SHALL NOT present that figure as agreement with efootbase.

#### Scenario: Half-proficiency position
- **WHEN** a user selects a position where the card has half proficiency
- **THEN** the estimate is lower than the full-proficiency formula, the note names the position as half-proficiency with the penalty applied, and the "±1 at full-proficiency positions" wording is not shown.

#### Scenario: Outfield card at goalkeeper
- **WHEN** an outfield card is evaluated at GK with no proficiency
- **THEN** the estimate reads 40.

### Requirement: Max OVR Preset
The Max OVR action SHALL set the allocation that maximises the linear estimate (the fitted formula on base stats plus training, without the Manager Proficiency bonus and its rounding floors) at the selected position within the budget of the committed level. Like efootbase's own Max OVR build, which was the same at every proficiency level on every measured card with a recorded Max build (5 cards), the preset SHALL NOT depend on the proficiency level. On the committed hub fixture cards at the registered position, the displayed overall of the preset (with the bonus, both boosters and the anchor) SHALL be within 1 of the best displayed overall reachable with the same budget and proficiency level. Reset SHALL return every category to zero and keep the proficiency. Because the panel opens on the Max-OVR build, pressing Max OVR on an untouched panel SHALL change nothing.

#### Scenario: Optimal allocation
- **WHEN** Max OVR is pressed on a striker with a level cap of 50 (budget "98 pts")
- **THEN** the spent points never exceed 98 pts and the linear estimate is at least the linear estimate of the reference allocation minus 0.8.

#### Scenario: Reset then Max OVR
- **WHEN** a user presses Reset and then Max OVR
- **THEN** the panel reads "0/N pts" after Reset and returns to the opening allocation after Max OVR.

#### Scenario: Same build at every proficiency
- **WHEN** Max OVR is pressed on the same card at proficiency 70 and at proficiency 90
- **THEN** both presses set the same allocation.

#### Scenario: Bound against the bonus-aware optimum
- **WHEN** the preset is compared, on every committed hub fixture card at its registered position and at every proficiency level from 70 to 90, with an exact search for the allocation of highest estimate including the bonus
- **THEN** the unrounded estimate of the preset is less than 1 below that optimum, its displayed overall is at most 1 below the optimum's, and at levels 70–76 the two are equal.

### Requirement: Honest Limits
The panel SHALL NOT offer a choice of individual managers and SHALL NOT claim exact overall values; it SHALL project every stat of every category, including goalkeeper Jump, from the rules above. It SHALL state that the estimate is anchored only at the card's registered position. Away from that position it SHALL show a warning: at a full-proficiency position, that the estimate is not anchored there; at a half-proficiency position, and at a non-proficient position where the estimate is above the floor of 40, that the estimate is not confirmed and that efootbase's position tiles read higher on the measured cards (about 4 higher at half proficiency, about 2–3 higher at none); at a non-proficient position where the estimate sits at the floor of 40 (an outfield card at GK, a goalkeeper card far from its position), that the estimate is not anchored, without claiming that efootbase reads higher. When level 86 is selected it SHALL state that the level 86 bonus is an unconfirmed exception.

#### Scenario: Goalkeeper Aerial training
- **WHEN** a goalkeeper buys Aerial stat points
- **THEN** Heading, Physical Contact and Jump rise by the points bought and no stat is shown as unavailable.

#### Scenario: Other full-proficiency position
- **WHEN** a user selects a position other than the registered one where the card has full proficiency
- **THEN** the panel shows a warning that the estimate there is not anchored, and does not claim that efootbase reads higher.

#### Scenario: Half or non-proficient position
- **WHEN** a user selects a position where the card has half proficiency, or none with an estimate above 40
- **THEN** the panel shows a "Not confirmed" warning saying that efootbase tends to show a higher overall there, with the measured size of the gap.

#### Scenario: Estimate at the floor
- **WHEN** a user selects a non-proficient position where the estimate reads 40, such as GK for an outfield card
- **THEN** the panel shows a "Not anchored" warning and does not claim that efootbase reads higher.

### Requirement: Default Build
The Progression panel SHALL open on the Max-OVR build for the card's registered position with both boosters on and the Manager Proficiency control at 90, Reset SHALL return every category to zero while keeping the current proficiency, and Max OVR SHALL restore the optimal build.

#### Scenario: Opening state
- **WHEN** a user opens a player page whose card has a level cap above 1
- **THEN** the panel shows the Max-OVR allocation with Booster 1 and Booster 2 on and proficiency 90, and the card shows the corresponding estimated overall.

### Requirement: Honest Estimate Label
The estimated overall SHALL be accompanied by a short description that it includes the Manager Proficiency bonus shown by the control, that the value is anchored at the registered position, and that other positions are less accurate. Because a proficiency model ships, the panel SHALL NOT describe Manager Proficiency as missing or quote a fixed gap to efootbase's default.

#### Scenario: Label content
- **WHEN** the panel shows the estimated overall at the registered position
- **THEN** the nearby text names the proficiency setting and the anchor, and does not claim exactness.

#### Scenario: No proficiency model
- **WHEN** the panel shows the estimated overall and the Manager Proficiency control is shown
- **THEN** the nearby text names the current proficiency setting and makes no claim that Manager Proficiency is missing or that efootbase shows a fixed amount higher.

## ADDED Requirements

### Requirement: Manager Proficiency Control
The panel SHALL provide a Manager Proficiency control from 70 to 90 with default 90. Each stat SHALL equal base plus training plus a bonus plus the boosters, where the bonus is 0 when base plus training is at least 99 and otherwise `min(99 − s, floor(s × r))` with a rate `r` that depends on the proficiency level, and boosters are added after the bonus and may exceed 99. At proficiency 70 every projected stat SHALL equal the result without any bonus. The control SHALL be operable by keyboard and expose its value to assistive technology.

#### Scenario: Proficiency 70
- **WHEN** the control is set to 70
- **THEN** every projected stat equals base plus training plus boosters, as before the control existed (the overall at the registered position differs from the pre-control engine only by the anchor).

#### Scenario: Proficiency 90
- **WHEN** the control is set to 90 on a card with stats of 80 and 83 after training
- **THEN** they show 82 and 86 before boosters (80 + floor(80 × 0.03625) = 80 + 2; 83 + floor(83 × 0.03625) = 83 + 3).

#### Scenario: Level 86
- **WHEN** the control is set to 86
- **THEN** the bonus is `floor((s + 6) / 32)` (capped the same way) and the panel marks level 86 as an unconfirmed exception.

#### Scenario: Cap
- **WHEN** a stat is 98 after training and the control is at 90
- **THEN** its bonus is limited to 1 and boosters are then added on top.
