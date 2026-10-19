## MODIFIED Requirements

### Requirement: Estimated Overall
The overall for the selected position SHALL be computed by the exact overall formula (see "Exact Overall Formula") from the projected stats of the current build, the card's height and weak-foot accuracy and the card's proficiency at that position. There SHALL be no per-card anchor, no fitted weights and no fitted proficiency penalty. The value SHALL be shown without a "~" marker or any ±1 accuracy claim. Position choice SHALL default to the card's registered position and offer all 13 positions.

#### Scenario: Estimate accuracy
- **WHEN** the formula is evaluated on every reading of the committed oracle fixture (cards, final stats, height, weak-foot accuracy, aptitudes, selected position)
- **THEN** 100% of the computed overalls equal the overall recorded for the reading, goalkeepers included.

#### Scenario: Level-1 estimate for outfield positions
- **WHEN** the formula is evaluated on the committed fixture cards at each of the 13 positions
- **THEN** every computed value equals the recorded tile for that position.

### Requirement: Proficiency-Aware Estimate
Every option of the position selector SHALL carry the card's proficiency there (full, half or none). The card's proficiency at a position SHALL change the overall only through the exact formula's stat scaling (see "Exact Overall Formula"); the panel SHALL NOT apply a separate penalty, SHALL NOT show a "±1 at full-proficiency positions" note and SHALL NOT present any figure measured against another site's data as agreement with efootbase.

#### Scenario: Half-proficiency position
- **WHEN** a user selects a position where the card has half proficiency
- **THEN** the value equals the formula evaluated with every stat scaled by the half-proficiency factor, the option is labelled half, and no penalty note or accuracy note is shown.

#### Scenario: Outfield card at goalkeeper
- **WHEN** an outfield card is evaluated at GK with no proficiency
- **THEN** the value equals the formula evaluated at GK with the non-proficient scaling, never below 40, and no "not anchored" or "not confirmed" warning is shown.

### Requirement: Max OVR Preset
The Max OVR action SHALL set the allocation that maximises the linear part of the exact overall formula at the selected position (exact weights on base stats plus training, without the proficiency bonus and its rounding) within the budget of the committed level. Like efootbase's own Max OVR build, which was the same at every proficiency level on every measured card with a recorded Max build (5 cards), the preset SHALL NOT depend on the proficiency level or on the selected manager. Max OVR SHALL keep the selected manager. On the committed fixture cards at the registered position, the displayed overall of the preset (with the bonus, both boosters and any selected manager) SHALL be within 1 of the best displayed overall reachable with the same budget and proficiency level, and on the reference card at its registered position the Max and Reset overalls at proficiency 70, 80, 85 and 90 SHALL equal efootbase's readings exactly (Max 106, 109, 109, 110; Reset 94, 97, 97, 97). Reset SHALL return every category to zero and keep the proficiency and the selected manager. Because the panel opens on the Max-OVR build, pressing Max OVR on an untouched panel SHALL change nothing. The preset's allocation is not required to equal efootbase's own Max build. On the five committed fixture cards it equals it on four and differs on the striker (c5), where efootbase's build has a lower value of the objective (133,336 against the preset's 133,360). The earlier capture adds one card that is not in the fixture, a second goalkeeper, where the two differ only by a Goalkeeper 2 / Goalkeeper 3 tie (both categories gain 399 per point at GK). Over the six distinct cards with a known efootbase Max build: four equal, two different, and the displayed overall is the same at every level read (69 of 69 fixture readings, 89 of 89 earlier-capture readings).

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
- **WHEN** the preset is compared, on every committed fixture card at its registered position and at every proficiency level from 70 to 90, with an exact search for the allocation of highest overall including the bonus
- **THEN** the displayed overall of the preset is at most 1 below the optimum's, and at levels 70–76 the two are equal.

#### Scenario: Reference card readings
- **WHEN** the reference card is shown at its registered position at proficiency 70, 80, 85 and 90, first after Reset and then after Max OVR
- **THEN** the overall reads 94, 97, 97, 97 after Reset and 106, 109, 109, 110 after Max OVR.

### Requirement: Honest Limits
The panel SHALL project every stat of every category, including goalkeeper Jump, from the rules above, and SHALL NOT claim anything the model does not cover. It SHALL state that the model reproduces efootbase's own figures for the cards measured, that stats and height come from the database dump, and that Position Training, In-Match Roles and manager tactics are not modelled. Choosing a position the card is not proficient in SHALL NOT show an accuracy warning, because the formula covers it; a goalkeeper or non-proficient result at the floor of 40 is shown as 40 without a warning. The panel SHALL NOT mark any proficiency level as an unconfirmed exception. The panel SHALL disclose the one deliberate difference from efootbase's sheet: efootbase's client limits base + training + bonus to 99 before the boosters, while the panel keeps a stat trained past 99 (the game's own max-level overall agrees better with keeping it, 94 against 65 of the 99 population cards where it matters), so on such builds the stat reads higher than on efootbase's sheet and the overall can read higher too (up to 1 on the opening Max OVR build, measured on 108 of 10,175 cards with progression).

#### Scenario: Goalkeeper Aerial training
- **WHEN** a goalkeeper buys Aerial stat points
- **THEN** Heading, Physical Contact and Jump rise by the points bought and no stat is shown as unavailable.

#### Scenario: Other full-proficiency position
- **WHEN** a user selects a position other than the registered one where the card has full proficiency
- **THEN** the overall is computed by the formula and no warning that the value is not anchored is shown.

#### Scenario: Half or non-proficient position
- **WHEN** a user selects a position where the card has half proficiency, or none with a value above 40
- **THEN** the overall is computed by the formula, and no "Not confirmed" warning and no claim that efootbase reads higher are shown.

#### Scenario: Estimate at the floor
- **WHEN** a user selects a non-proficient position where the formula gives 40 or less, such as GK for an outfield card
- **THEN** the overall reads 40 and no "Not anchored" warning is shown.

#### Scenario: Stat trained past 99
- **WHEN** the panel is shown for any card with a level cap above 1
- **THEN** its limits note states that efootbase's sheet limits base + training + bonus to 99 before the boosters, that eFootLab keeps a stat trained past 99 and why (94 against 65 of 99 population cards), and that on such builds the figure can read higher than efootbase's sheet (up to 1 on the opening Max OVR build).

### Requirement: Default Build
The Progression panel SHALL open on the Max-OVR build for the card's registered position with both boosters on, no manager selected and the Manager Proficiency control at 90. Reset SHALL return every category to zero while keeping the current proficiency and the selected manager, and Max OVR SHALL restore the optimal build.

#### Scenario: Opening state
- **WHEN** a user opens a player page whose card has a level cap above 1
- **THEN** the panel shows the Max-OVR allocation with Booster 1 and Booster 2 on, proficiency 90 and no manager, and the card shows the corresponding overall computed by the formula.

### Requirement: Honest Estimate Label
The overall SHALL be accompanied by a short description that names the proficiency setting (or the selected manager) in effect and states that the figure is computed by a formula reproduced from efootbase and checked against the number of efootbase readings the model was verified on. The panel SHALL NOT present the value as an estimate, SHALL NOT claim an anchor and SHALL NOT quote a fixed gap to efootbase's default.

#### Scenario: Label content
- **WHEN** the panel shows the overall at the registered position
- **THEN** the nearby text names the proficiency setting or the selected manager and the formula's verification, and contains no "~" and no mention of an anchor.

#### Scenario: No proficiency model
- **WHEN** the panel shows the overall and the Manager Proficiency control is shown
- **THEN** the nearby text names the current proficiency setting, makes no claim that Manager Proficiency is missing and states no fixed amount by which efootbase shows a higher or lower value.

### Requirement: Manager Proficiency Control
The panel SHALL provide a Manager Proficiency control from 70 to 90 with default 90. Each stat SHALL equal the proficiency-boosted trained stat plus the active boosters plus the selected manager's effect: the trained stat `s` (base plus training) gains the bonus of the Proficiency Band Table for the current level, the result is limited to 99 (a stat that is already 99 or more gets no bonus and is not reduced), the active boosters are added after that and may exceed 99, and the selected manager's +1 is added last. At proficiency 70 every projected stat SHALL equal the result without any bonus. Moving the control by the user SHALL deselect any selected manager. The control SHALL be operable by keyboard and expose its value to assistive technology.

#### Scenario: Proficiency 70
- **WHEN** the control is set to 70
- **THEN** every projected stat equals base plus training plus boosters.

#### Scenario: Proficiency 90
- **WHEN** the control is set to 90 on a card with stats of 80 and 83 after training
- **THEN** they show 82 and 86 before boosters (80 is in the 56–82 band, bonus 2; 83 is in the 83–98 band, bonus 3).

#### Scenario: Level 86
- **WHEN** the control is set to 86
- **THEN** the bonus follows the band table of level 86 (40–57 gives 1, 58–89 gives 2, 90–98 gives 3) like any other level, and the panel marks no level as an unconfirmed exception.

#### Scenario: Cap
- **WHEN** a stat is 98 after training and the control is at 90
- **THEN** its proficiency-boosted value is 99 (the bonus is limited to 1) and boosters and the manager's +1 are then added on top.

#### Scenario: Trained stat above 99
- **WHEN** training takes a stat to 102 (base 98 + 4) at proficiency 90
- **THEN** it gains no bonus and stays 102 before boosters; it is not cut back to 99. On the 99 cards of the population check whose eFHUB max-level stats exceed 99, the formula equals efootbase's max-level overall on 94 when such stats are kept and on 65 when they are cut to 99.

### Requirement: Training Budget
The simulator SHALL allow a card to spend at most `levelCap − 1` training points, one point per level above 1, where the selected Max Level never exceeds the card's level cap. The panel SHALL display that budget in efootbase's whole-point unit, which is twice the engine's point (a level cap of 31 reads "60 pts").

#### Scenario: Level 1 card
- **WHEN** a card has a level cap of 1
- **THEN** the detail page shows no Progression panel and a note that the card has no training points to spend because its max level is 1; the note does not claim that manager data is unavailable.

#### Scenario: Budget limit
- **WHEN** a card has a level cap of 31 (budget "60 pts") and the user has spent 58 pts
- **THEN** every further increase whose displayed next cost exceeds the 2 pts left is disabled.

### Requirement: Level Cap One Note
For cards whose level cap is 1, the page SHALL show, instead of the Progression panel, a short note that the card has no Progression panel because its max level is 1 and it therefore has no training points to spend. Since manager data exists (`manager.picker`), the note SHALL NOT say that manager data is unavailable.

#### Scenario: Level cap 1 card
- **WHEN** a user opens a card with a level cap of 1
- **THEN** no stepper is shown and the note is visible.

## ADDED Requirements

### Requirement: Proficiency Band Table
For each proficiency level from 77 to 90 the bonus of a trained stat `s` SHALL be read from a table of ranges (a minimum and a maximum of `s` mapped to a bonus of 1, 2 or 3): the bonus is 0 when `s` is below the first range's minimum or at least 99, and it is 0 for every `s` at levels 70–76. The proficiency-boosted stat SHALL be `min(99, s + bonus)` for `s` below 99; a trained stat of 99 or more SHALL keep its value (efootbase's client code would cut it back to 99, but no measured reading covers that case and the game's own max-level overall agrees with keeping it — see "Trained stat above 99"). The table SHALL reproduce efootbase's readings of every cell measured (21 levels × 2 builds × 26 stats × 5 cards).

#### Scenario: Level 90 bands
- **WHEN** the bonus is read at level 90
- **THEN** stats 40–55 give 1, 56–82 give 2, 83–98 give 3, and 99 or more gives 0.

#### Scenario: Level 86 bands
- **WHEN** the bonus is read at level 86
- **THEN** stats 40–57 give 1, 58–89 give 2, 90–98 give 3.

#### Scenario: Below the first range
- **WHEN** a trained stat is below the first range of the selected level (for example 39 at level 90)
- **THEN** its bonus is 0.

#### Scenario: Levels without bonus
- **WHEN** the level is any of 70 to 76
- **THEN** the bonus is 0 for every stat.

#### Scenario: Measured cells
- **WHEN** the table is applied to the trained stats of the oracle fixture at the recorded level
- **THEN** every projected stat equals the recorded stat.

### Requirement: Exact Overall Formula
The overall at a position SHALL be computed from an integer weight table (13 positions × 28 terms: 25 stats, defensive engagement, height and weak-foot accuracy), as follows: every stat first becomes `max(0, round(stat × f))` limited to 255, where `f` is 1.0 at a full-proficiency position, 0.97 at a half-proficiency position and 0.85 at a non-proficient position; each stat enters through `max(0, stat − 25)`, height through `max(0, height − 111 − 25)` and weak-foot accuracy through `max(0, 59 × accuracy ÷ 3 + 40 − 25)`; the overall is `floor((weighted sum + 499) ÷ 1000)` limited to 40..127. The formula SHALL reproduce efootbase's overall readings (793 of 793 measured) and position tiles (10,309 of 10,309 measured). The weight table SHALL live in one data module that records its provenance (public client of efootbase, owner-accepted terms risk, how to re-derive it) and SHALL contain integers and stat names only.

#### Scenario: Registered position reading
- **WHEN** the formula is evaluated at the registered position of every card of the oracle fixture with the recorded final stats
- **THEN** every result equals the overall efootbase displayed.

#### Scenario: Non-registered position reading
- **WHEN** the formula is evaluated at the other 12 positions with the card's aptitudes
- **THEN** every result equals the tile efootbase displayed.

#### Scenario: Tampering is detected
- **WHEN** any single weight, the rounding rule, the clamp, a scale factor or the order of the stat terms in the table is changed
- **THEN** the oracle tests fail.

#### Scenario: Floor and ceiling
- **WHEN** the weighted sum gives less than 40 or more than 127
- **THEN** the overall is 40 or 127.

### Requirement: Manager Selection
The panel SHALL offer a "Select Manager" control that opens a dialog listing the 69 managers efootbase offers in its picker, each row showing the manager's picture, rating badge and its "+1" stat pills — one or two per manager (efootbase lists 45 of the 69 with two pills and 24 with one) — with a search field that filters by manager name or by stat name. Choosing a manager SHALL set the Manager Proficiency to the manager's rating (83–90), mark the manager as selected and apply +1 to each of the manager's pill stats after the boosters, without any cap at 99, and SHALL change nothing else. Because the rating can be below 90, choosing a manager MAY lower stats through a smaller proficiency bonus. Choosing the selected manager again SHALL deselect it and leave the proficiency where it is; moving the proficiency control SHALL deselect it; Reset and Max OVR SHALL keep it. The dialog SHALL have an accessible name, trap focus, close on Escape and return focus to the opening control. The list SHALL be sorted by rating descending, then by id ascending. The stat grid SHALL show which part of each stat comes from proficiency, boosters and the manager.

#### Scenario: Choose a manager
- **WHEN** a user chooses a manager of rating 89 whose pills are Lofted Pass and Defensive Engagement (a real picker entry)
- **THEN** the proficiency control reads 89, the two stats gain +1 after the boosters on top of the level-89 bonus, and all other stats equal the plain result at proficiency 89.

#### Scenario: Manager can lower stats
- **WHEN** a manager of rating 83 is chosen while the control was at 90
- **THEN** stats whose bonus is smaller at level 83 than at level 90 are shown lower, and the manager's pill stats show that result plus 1.

#### Scenario: Manager with one pill
- **WHEN** a manager whose picker entry carries a single stat pill is chosen
- **THEN** that one stat gains +1 and every other stat equals the plain result at the manager's rating.

#### Scenario: Pill above 99
- **WHEN** a stat of the manager's pills is already above 99 through boosters
- **THEN** it still gains +1.

#### Scenario: Slider deselects
- **WHEN** a manager is selected and the user moves the proficiency control to any value
- **THEN** the manager is deselected, no pill bonus remains, and the stats equal the plain result at the new level.

#### Scenario: Reset keeps the manager
- **WHEN** a manager is selected and the user presses Reset
- **THEN** every category returns to zero and the manager and proficiency are unchanged.

#### Scenario: Choose again to deselect
- **WHEN** the selected manager is chosen again in the dialog
- **THEN** the manager is deselected and the proficiency is unchanged.

#### Scenario: Search by stat
- **WHEN** the user types a stat name in the search field
- **THEN** only managers with that stat among their pills are listed.

#### Scenario: Keyboard use
- **WHEN** a keyboard user opens the dialog, tabs through the rows and presses Escape
- **THEN** focus stays inside the dialog while it is open, and the dialog closes and returns focus to the "Select Manager" control.

#### Scenario: Picker data
- **WHEN** the picker list is requested
- **THEN** it returns 69 entries sorted by rating descending then id ascending, each with an id, a name, a rating, an image URL on the configured image host and one or two pill stat names (45 entries with two, 24 with one); a picker row without a first pill or with a pill that is not a base stat is reported as a server error, never guessed.

### Requirement: Position Tiles From The Formula
The 13 position tiles of the Pitch Map, the Best Fit indicator, the "At position" figure and the overall of the panel SHALL be computed by the exact overall formula from the stats currently shown for the card (the projected build when the panel is open, otherwise the card's displayed stats), for every card, including cards that have no eFHUB data. The tile at the selected position SHALL equal the overall shown by the panel. A tile SHALL NOT read "n/a".

#### Scenario: Tiles follow the build
- **WHEN** the user changes the allocation, a booster, the proficiency or the manager
- **THEN** all 13 tiles, Best Fit and the panel overall update from the same stats.

#### Scenario: New card without eFHUB data
- **WHEN** a card that has no stored per-position ratings is opened
- **THEN** all 13 tiles show computed values.

#### Scenario: Goalkeeper card
- **WHEN** a goalkeeper card is opened
- **THEN** its GK tile equals the formula's GK value and the other tiles use the non-proficient scaling.

#### Scenario: Level cap 1 card
- **WHEN** a card with a level cap of 1 is opened
- **THEN** the tiles are computed from the stats shown in the stat grid, and the page does not claim they equal efootbase's tiles beyond what the verification report in the change established.
