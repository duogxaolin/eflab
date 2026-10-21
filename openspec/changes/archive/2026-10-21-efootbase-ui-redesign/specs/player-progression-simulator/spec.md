## MODIFIED Requirements

### Requirement: Cost Curve
The nth stat point bought in one category SHALL cost 0.5 × ceil(n / 4) engine points, so the cumulative engine cost of 2, 4, 8, 12, 16, 20 and 22 stat points is 1, 2, 6, 12, 20, 30 and 36 points. The panel SHALL show the cost of the next stat point for each category in the displayed whole-point unit (twice the engine cost: the first four stat points cost 1 pt each, the next four 2 pts each), visibly in each category row as a compact "next N" between the label and the stepper — without truncating the label or changing the 42 px row, in the 248 px desktop row and in the phone sheet from 320 px — and in the stepper's accessible value text ("N stat points, X pts spent, next costs Y").

#### Scenario: Next cost
- **WHEN** a category already holds 4 stat points
- **THEN** the next-cost label for that category shows 2 pts ("next 2" in its row, "next costs 2" in the stepper's value text) and buying the 5th point deducts 2 pts from the displayed budget.

### Requirement: Max OVR Preset
The Max OVR action SHALL set the allocation that maximises the linear part of the exact overall formula at the selected position (exact weights on base stats plus training, without the proficiency bonus, the cut at 99 and the rounding) within the budget of the committed level. Because the objective ignores the cut at 99, the preset can buy stat points past 99 that are not counted: on the 108 of 10,175 dump cards with progression whose preset trains a stat past 99, an exact bonus- and cap-aware search reads up to 2 higher (2 on 31, 1 on 912 of 2,268 card × level pairs, also at levels 70–76); on the other cards it reads at most 1 higher and never at 70–76. The panel SHALL say so in its explanatory disclosure ("About this build"), in neutral wording that does not name a third-party site. Like efootbase's own Max OVR build, which was the same at every proficiency level on every measured card with a recorded Max build (5 cards), the preset SHALL NOT depend on the proficiency level or on the selected manager. Max OVR SHALL keep the selected manager. On the committed fixture cards at the registered position, the displayed overall of the preset (with the bonus, both boosters and any selected manager) SHALL be within 1 of the best displayed overall reachable with the same budget and proficiency level, and on the reference card at its registered position the Max and Reset overalls at proficiency 70, 80, 85 and 90 SHALL equal efootbase's readings exactly (Max 106, 109, 109, 110; Reset 94, 97, 97, 97). Reset SHALL return every category to zero and keep the proficiency and the selected manager. Because the panel opens on the Max-OVR build, pressing Max OVR on an untouched panel SHALL change nothing. The preset's allocation is not required to equal efootbase's own Max build. On the five committed fixture cards it equals it on four and differs on the striker (c5), where efootbase's build has a lower value of the objective (133,336 against the preset's 133,360). The earlier capture adds one card that is not in the fixture, a second goalkeeper, where the two differ only by a Goalkeeper 2 / Goalkeeper 3 tie (both categories gain 399 per point at GK). Over the six distinct cards with a known efootbase Max build: four equal, two different, and the displayed overall is the same at every level read (69 of 69 fixture readings, 89 of 89 earlier-capture readings).

#### Scenario: efootbase's Max readings
- **WHEN** the preset is simulated, without a manager, at the levels at which efootbase's own Max OVR overall was recorded for the committed fixture cards
- **THEN** it reads exactly that overall on every recorded reading.

#### Scenario: Optimal allocation
- **WHEN** Max OVR is pressed on a striker with a level cap of 50 (budget "98 pts")
- **THEN** the spent points never exceed 98 pts and the linear part of the formula at the preset is at least that of the reference allocation minus 0.8.

#### Scenario: Reset then Max OVR
- **WHEN** a user presses Reset and then Max OVR
- **THEN** the panel reads "0/N pts" after Reset and returns to the opening allocation after Max OVR.

#### Scenario: Same build at every proficiency
- **WHEN** Max OVR is pressed on the same card at proficiency 70 and at proficiency 90
- **THEN** both presses set the same allocation.

#### Scenario: Bound against the bonus-aware optimum
- **WHEN** the preset is compared, on every committed fixture card at its registered position and at every proficiency level from 70 to 90, with an exact search for the allocation of highest overall including the bonus and the cut at 99
- **THEN** the displayed overall of the preset is at most 1 below the optimum's, and at levels 70–76 the two are equal (no fixture card's preset trains a stat past 99).

#### Scenario: Reference card readings
- **WHEN** the reference card is shown at its registered position at proficiency 70, 80, 85 and 90, first after Reset and then after Max OVR
- **THEN** the overall reads 94, 97, 97, 97 after Reset and 106, 109, 109, 110 after Max OVR.

### Requirement: Honest Limits
The panel SHALL project every stat of every category, including goalkeeper Jump, from the rules above, and SHALL NOT claim anything the model does not cover. The panel's explanatory disclosure ("About this build"), which holds its limits note, SHALL state, in neutral wording that does not name a third-party site, that the formula reproduced every reading measured on the surveyed cards and that other cards were checked in bulk only, that stats, height and weak-foot accuracy come from the database dump, and that Position Training, In-Match Roles and manager tactics are not modelled. Choosing a position the card is not proficient in SHALL NOT show an accuracy warning, because the formula covers it; a goalkeeper or non-proficient result at the floor of 40 is shown as 40 without a warning. The panel SHALL NOT mark any proficiency level as an unconfirmed exception. The limits note SHALL state that base + training + bonus stops at 99 before the boosters (the source model's rule), so stat points bought past 99 are not counted, and the stat grid's tooltip SHALL show the part cut at 99.

#### Scenario: Goalkeeper Aerial training
- **WHEN** a goalkeeper buys Aerial stat points
- **THEN** Heading, Physical Contact and Jump rise by the points bought and no stat is shown as unavailable.

#### Scenario: Other full-proficiency position
- **WHEN** a user selects a position other than the registered one where the card has full proficiency
- **THEN** the overall is computed by the formula and no warning that the value is not anchored is shown.

#### Scenario: Half or non-proficient position
- **WHEN** a user selects a position where the card has half proficiency, or none with a value above 40
- **THEN** the overall is computed by the formula, and no "Not confirmed" warning and no claim that another site reads higher are shown.

#### Scenario: Estimate at the floor
- **WHEN** a user selects a non-proficient position where the formula gives 40 or less, such as GK for an outfield card
- **THEN** the overall reads 40 and no "Not anchored" warning is shown.

#### Scenario: Stat trained past 99
- **WHEN** a stat of 98 is trained +3 (101 after training)
- **THEN** it shows 99 before the boosters (the source model's rule); active boosters and the manager's +1 are added on top of 99; the stat's tooltip shows the 2 points cut at 99; and the limits note in the panel's disclosure states that base + training + bonus stops at 99 before the boosters, without naming a third-party site.

### Requirement: Accessible and Responsive Panel
Every stepper SHALL be keyboard operable with a label and current value exposed to assistive technology, and the panel SHALL fit without horizontal page scrolling at 320 to 480 px. From 1024 px the panel SHALL be a card in the left column of the detail page; below 1024 px it SHALL NOT be rendered in the page column but SHALL live in a bottom sheet (a native modal dialog with an accessible name, focus trap, Escape and focus return) opened from a floating category strip and a dock above the tab bar, and the dock's Reset and Max OVR SHALL act through the same state as the panel and announce their result through a live region. Desktop and mobile SHALL share one state, so both always show the same build.

#### Scenario: Keyboard use
- **WHEN** a keyboard user focuses a category stepper and presses the increase key
- **THEN** the value rises by one stat point, the remaining budget and the estimated overall update, and the change is announced through a live region.

### Requirement: Honest Estimate Label
The overall SHALL be accompanied by a short line next to it that names the build status and the proficiency setting (or the selected manager) in effect, and the panel's explanatory disclosure ("About this build") SHALL hold a description that names the same setting and states, in neutral wording that does not name a third-party site, that the figure is computed with the game's overall formula as measured and checked against the number of readings the model was verified on. The panel SHALL NOT present the value as an estimate, SHALL NOT claim an anchor and SHALL NOT quote a fixed gap to another site's default.

#### Scenario: Label content
- **WHEN** the panel shows the overall at the registered position
- **THEN** the line next to it names the proficiency setting or the selected manager, the disclosure's description names the setting and the formula's verification, and neither contains a "~", a mention of an anchor or the name of a third-party site.

#### Scenario: No proficiency model
- **WHEN** the panel shows the overall and the Manager Proficiency control is shown
- **THEN** the nearby text names the current proficiency setting, makes no claim that Manager Proficiency is missing and states no fixed amount by which another site shows a higher or lower value.
