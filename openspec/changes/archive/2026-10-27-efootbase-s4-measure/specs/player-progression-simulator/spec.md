## MODIFIED Requirements

### Requirement: Honest Limits
The panel SHALL project every stat of every category, including goalkeeper Jump, from the rules above, and SHALL NOT claim anything the model does not cover. The panel's explanatory disclosure ("About this build"), which holds its limits note, SHALL state, in neutral wording that does not name a third-party site, that the formula reproduced every reading measured on the surveyed cards and that other cards were checked in bulk only, that stats, height and weak-foot accuracy come from the database dump, that Form, the remaining-stamina effect, In-Match Roles and manager tactics are not modelled, and what the Position Training and Weak foot toggles cover (the rules of capability `efootbase-s4-measure`: which weak-foot levels were measured, that other registrations than the four measured ones use the pitch grid, that goalkeepers are not modelled). Choosing a position the card is not proficient in SHALL NOT show an accuracy warning, because the formula covers it; a goalkeeper or non-proficient result at the floor of 40 is shown as 40 without a warning. The panel SHALL NOT mark any proficiency level as an unconfirmed exception. The limits note SHALL state that base + training + bonus stops at 99 before the boosters (the source model's rule), so stat points bought past 99 are not counted, and the "Stat breakdown" list in "About this build" SHALL show the part cut at 99 (the stat rows carry no `title` tooltip and the Adjust popover holds controls only).

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

#### Scenario: Limits note names the toggles
- **WHEN** the disclosure is opened on a card with Build settings
- **THEN** it says Form and the stamina effect are not modelled and states what Position Training and Weak foot cover, without naming a third-party site.

### Requirement: Position Tiles From The Formula
The 13 position tiles of the Pitch Map, the Best Fit indicator, the "At position" figure and the overall of the panel SHALL be computed by the exact overall formula from the stats currently shown for the card (the projected build when the panel is open, otherwise the card's displayed stats), for every card, including cards that have no eFHUB data. The stats the formula reads are the stats before any weak-foot deduction (the weak-foot chips change the shown value only), and while Position Training is on the positions it trains are scored at full proficiency. The tile at the selected position SHALL equal the overall shown by the panel. A tile SHALL NOT read "n/a".

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

#### Scenario: Weak foot and Position Training
- **WHEN** the Weak foot toggle is turned on, or Position Training is turned on
- **THEN** the weak-foot deduction changes no tile and no overall, and Position Training changes only the tiles of the trained positions, as specified in capability `efootbase-s4-measure`.
