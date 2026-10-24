## MODIFIED Requirements

### Requirement: Training Budget
The simulator SHALL allow a card to spend at most `Max Level − 1` training points, one point per level above 1, where the committed Max Level is 1..levelCap for a card with a level cap above 1 and 1..80 for a Highlight card with a level cap of 1 (see efootbase-function-parity "Level-Cap-1 Highlight Max Level"). The panel SHALL display that budget in efootbase's whole-point unit, which is twice the engine's point (a level cap of 31 reads "60 pts").

#### Scenario: Level 1 card
- **WHEN** a card has a level cap of 1
- **THEN** a Highlight card shows the Progression panel at Max Level 1 with no point to spend, a Trending card shows the "Build" panel without training, and any other card shows no Progression panel and a note that the card has no training points to spend because its max level is 1; the note does not claim that manager data is unavailable.

#### Scenario: Budget limit
- **WHEN** a card has a level cap of 31 (budget "60 pts") and the user has spent 58 pts
- **THEN** every further increase whose displayed next cost exceeds the 2 pts left is disabled.

### Requirement: Max Level Editing
For a card with a level cap above 1, typing in the Max Level field SHALL NOT change the build until the value is committed on blur or Enter; the native spinner and the arrow keys SHALL commit immediately; a committed value SHALL be clamped to 1..levelCap and an empty or non-numeric draft SHALL revert to the committed level. For a Highlight card with a level cap of 1, Max Level SHALL be a slider from 1 to 80 with − and + buttons. Whenever the committed level can no longer afford the points already spent, stat points SHALL be removed one at a time from the last category that holds points (Goalkeeper 3 back to Shooting) until the build fits, and the live region SHALL announce the change in the displayed unit; an allocation that still fits SHALL stay unchanged.

#### Scenario: Retyping the level keeps an affordable allocation
- **WHEN** 12 pts are spent, the user clears the Max Level field and types 25
- **THEN** the field shows 25 after commit, the allocation is unchanged, and the budget reads "12/48 pts".

#### Scenario: Lower level cannot afford the spend
- **WHEN** 12 pts are spent and the user commits level 5
- **THEN** points are removed from the last categories that hold them until the build costs at most 8 pts, and the live region announces it ("level 5 gives 8 pts; points removed from the last categories").

#### Scenario: Highlight slider
- **WHEN** the Max Level slider of a Highlight card with a level cap of 1 is moved from 10 to 9 after Max OVR
- **THEN** only the last category holding points loses points, by the fewest stat points that make the build fit 16 pts.

### Requirement: Boosters Without Stat Data
A Booster 1 whose resolved stat vector is empty SHALL be presented like an unknown booster: its name with "(no stat data)", no ON/OFF toggle, and it SHALL NOT count toward custom-build detection. A Booster 2 that is absent or whose resolved stat vector is empty SHALL instead be presented as the "Select Booster" slot of efootbase-function-parity "Second Booster Choice" on a card with a level cap above 1, and SHALL NOT be shown on a card with a level cap of 1.

#### Scenario: Empty booster vector
- **WHEN** the Booster 2 of a card with a level cap above 1 resolves to a booster with no stat deltas, and another card's Booster 1 does
- **THEN** the first card's second slot reads "Select Booster" and opens the second-booster drawer, never "(no stat data)", and the second card's Booster 1 shows "(no stat data)" and offers no toggle.

### Requirement: Boosters From Real Data
The simulator SHALL resolve boosters by id, SHALL apply every booster whose resolved stat vector is non-empty by default (Booster 1 and Booster 2 both on when the panel opens, as efootbase shows them), SHALL let the user turn each usable booster off and on — a Trending card's Booster 1 through its levels +3, off, +1, +2 (see efootbase-function-parity "Own Booster 2 And Booster Levels") — SHALL let the user choose a second booster where the card has none (see "Second Booster Choice"), SHALL add the active boosters' stat vectors (at the current level) after the cut at 99, and SHALL show each booster's name and stat deltas. Turning a usable booster off, changing its level or choosing a second booster counts as a custom build.

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
The panel SHALL project every stat of every category, including goalkeeper Jump, from the rules above, and SHALL NOT claim anything the model does not cover. The panel's explanatory disclosure ("About this build"), which holds its limits note, SHALL state, in neutral wording that does not name a third-party site, that the formula reproduced every reading measured on the surveyed cards and that other cards were checked in bulk only, that stats, height and weak-foot accuracy come from the database dump, and that Form, Position Training, the weak-foot and stamina effects, In-Match Roles and manager tactics are not modelled. Choosing a position the card is not proficient in SHALL NOT show an accuracy warning, because the formula covers it; a goalkeeper or non-proficient result at the floor of 40 is shown as 40 without a warning. The panel SHALL NOT mark any proficiency level as an unconfirmed exception. The limits note SHALL state that base + training + bonus stops at 99 before the boosters (the source model's rule), so stat points bought past 99 are not counted, and the "Stat breakdown" list in "About this build" SHALL show the part cut at 99 (the stat rows carry no `title` tooltip and the Adjust popover holds controls only).

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
- **THEN** it shows 99 before the boosters (the source model's rule); active boosters and the manager's +1 are added on top of 99; the "Stat breakdown" row of that stat shows the 2 points cut at 99; and the limits note in the panel's disclosure states that base + training + bonus stops at 99 before the boosters, without naming a third-party site.

### Requirement: Accessible and Responsive Panel
Every stepper and slider SHALL be keyboard operable with a label and current value exposed to assistive technology, and the panel SHALL fit without horizontal page scrolling at 320 to 480 px. From 1024 px the panel SHALL be a card in the left column of the detail page; below 1024 px it SHALL NOT be rendered in the page column but SHALL live in a bottom sheet (a native modal dialog with an accessible name, focus trap, Escape and focus return) opened from the dock's points and Progression button, while a category strip item opens that category's Adjust popover; the dock's Reset and Max OVR SHALL act through the same state as the panel and announce their result through a live region. Desktop and mobile SHALL share one state, so both always show the same build.

#### Scenario: Keyboard use
- **WHEN** a keyboard user focuses a category stepper and presses the increase key
- **THEN** the value rises by one stat point, the remaining budget and the estimated overall update, and the change is announced through a live region.

### Requirement: Default Build
The Progression panel SHALL open on the Max-OVR build for the card's registered position with both boosters on, the remembered manager selected when one is remembered (see efootbase-function-parity "Remembered Manager") and otherwise no manager, and the Manager Proficiency control at 90 (or at the remembered manager's rating). A link with build parameters SHALL open the build it describes instead. Reset SHALL return every category to zero while keeping the current proficiency, the selected manager, the booster states and the Max Level, and Max OVR SHALL restore the optimal build.

#### Scenario: Opening state
- **WHEN** a user without a remembered manager opens a player page whose card has a level cap above 1, without a query
- **THEN** the panel shows the Max-OVR allocation with Booster 1 and Booster 2 on, proficiency 90 and no manager, and the card shows the corresponding overall computed by the formula.

### Requirement: Level Cap One Note
For cards whose level cap is 1 and that are neither Highlight nor Trending cards, the page SHALL show, instead of the Progression panel, a short note that the card has no Progression panel because its max level is 1 and it therefore has no training points to spend. Since manager data exists (`manager.picker`), the note SHALL NOT say that manager data is unavailable. Highlight cards with a level cap of 1 get the Max Level panel and Trending cards the "Build" panel (efootbase-function-parity).

#### Scenario: Level cap 1 card
- **WHEN** a user opens a Standard card with a level cap of 1
- **THEN** no stepper is shown and the note is visible.

### Requirement: Manager Selection
The panel SHALL offer a "Select Manager" control that opens a dialog listing the 69 managers efootbase offers in its picker, each row showing the manager's picture, rating badge and its "+1" stat pills — one or two per manager (efootbase lists 45 of the 69 with two pills and 24 with one) — with a search field that filters by manager name or by stat name. Choosing a manager SHALL set the Manager Proficiency to the manager's rating (83–90), mark the manager as selected, remember it (efootbase-function-parity "Remembered Manager"), close the dialog and apply +1 to each of the manager's pill stats after the boosters, without any cap at 99, and SHALL change nothing else. Because the rating can be below 90, choosing a manager MAY lower stats through a smaller proficiency bonus. While a manager is selected the dialog SHALL list it first with an accent border and a "Clear" button. Choosing the selected manager again, or "Clear", SHALL deselect it, forget it, close the dialog and set the proficiency back to 90; moving the proficiency control SHALL deselect it; Reset and Max OVR SHALL keep it. The dialog SHALL have an accessible name, trap focus, close on Escape and return focus to the opening control. The list SHALL be sorted by rating descending, then by id ascending. The stat grid SHALL show which part of each stat comes from proficiency, boosters and the manager.

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
- **WHEN** the selected manager is chosen again in the dialog, after the proficiency had been 80 before the manager was chosen
- **THEN** the manager is deselected, the dialog closes and the proficiency reads 90.

#### Scenario: Search by stat
- **WHEN** the user types a stat name in the search field
- **THEN** only managers with that stat among their pills are listed.

#### Scenario: Keyboard use
- **WHEN** a keyboard user opens the dialog, tabs through the rows and presses Escape
- **THEN** focus stays inside the dialog while it is open, and the dialog closes and returns focus to the "Select Manager" control.

#### Scenario: Picker data
- **WHEN** the picker list is requested
- **THEN** it returns 69 entries sorted by rating descending then id ascending, each with an id, a name, a rating, an image URL on the configured image host and one or two pill stat names (45 entries with two, 24 with one); a picker row without a first pill or with a pill that is not a base stat is reported as a server error, never guessed.

#### Scenario: Clear
- **WHEN** the dialog is reopened while a manager is selected and "Clear" is activated
- **THEN** the selected manager was listed first with an accent border, and after "Clear" no manager is selected, the proficiency reads 90 and the dialog is closed.
