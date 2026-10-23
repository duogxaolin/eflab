## MODIFIED Requirements

### Requirement: Honest Limits
The panel SHALL project every stat of every category, including goalkeeper Jump, from the rules above, and SHALL NOT claim anything the model does not cover. The panel's explanatory disclosure ("About this build"), which holds its limits note, SHALL state, in neutral wording that does not name a third-party site, that the formula reproduced every reading measured on the surveyed cards and that other cards were checked in bulk only, that stats, height and weak-foot accuracy come from the database dump, and that Position Training, In-Match Roles and manager tactics are not modelled. Choosing a position the card is not proficient in SHALL NOT show an accuracy warning, because the formula covers it; a goalkeeper or non-proficient result at the floor of 40 is shown as 40 without a warning. The panel SHALL NOT mark any proficiency level as an unconfirmed exception. The limits note SHALL state that base + training + bonus stops at 99 before the boosters (the source model's rule), so stat points bought past 99 are not counted, and the breakdown in the stat row's Adjust popover SHALL show the part cut at 99 (the stat rows carry no `title` tooltip since change `efootbase-behaviour-parity`).

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
- **THEN** it shows 99 before the boosters (the source model's rule); active boosters and the manager's +1 are added on top of 99; the breakdown in that stat row's Adjust popover shows the 2 points cut at 99; and the limits note in the panel's disclosure states that base + training + bonus stops at 99 before the boosters, without naming a third-party site.
