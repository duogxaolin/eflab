## MODIFIED Requirements

### Requirement: Manager Selection
The panel SHALL offer a "Select Manager" control that opens a dialog listing the managers efootbase offers in its picker (69 on 2026-10-18), each row showing the manager's picture, rating badge and its "+1" stat pills — one or two per manager (on 2026-10-18 efootbase listed 45 of the 69 with two pills and 24 with one) — with a search field that filters by manager name or by stat name. Choosing a manager SHALL set the Manager Proficiency to the manager's rating (83–90), mark the manager as selected, remember it (efootbase-function-parity "Remembered Manager"), close the dialog and apply +1 to each of the manager's pill stats after the boosters, without any cap at 99, and SHALL change nothing else. Because the rating can be below 90, choosing a manager MAY lower stats through a smaller proficiency bonus. While a manager is selected the dialog SHALL list it first with an accent border and a "Clear" button. Choosing the selected manager again, or "Clear", SHALL deselect it, forget it, close the dialog and set the proficiency back to 90; moving the proficiency control SHALL deselect it; Reset and Max OVR SHALL keep it. The dialog SHALL have an accessible name, trap focus, close on Escape and return focus to the opening control. The list SHALL be sorted by rating descending, then by the reference's picker order (catalogue-data-refresh "Manager Picker Order"), then by id ascending. The stat grid SHALL show which part of each stat comes from proficiency, boosters and the manager.

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
- **THEN** it returns the snapshot's managers (69 on 2026-10-18) sorted by rating descending, then picker order, then id ascending, each with an id, a name, a rating, an image URL on the configured image host and one or two pill stat names; a picker row without a first pill or with a pill that is not a base stat is reported as a server error, never guessed.

#### Scenario: Clear
- **WHEN** the dialog is reopened while a manager is selected and "Clear" is activated
- **THEN** the selected manager was listed first with an accent border, and after "Clear" no manager is selected, the proficiency reads 90 and the dialog is closed.
