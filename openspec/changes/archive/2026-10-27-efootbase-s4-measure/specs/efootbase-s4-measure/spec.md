## ADDED Requirements

### Requirement: Compare Radar From The Build
The compare radar SHALL draw each side's polygon from the shown stats of that side's build — the stats the compare table shows (boosters on, the manager's effect when one is selected, no proficiency bonus below a manager, as the compare default) — on a 0–115 scale, six axes with integer values: SHT = ⌊(Finishing + Kicking Power) / 2⌋, PAS = ⌊(Low Pass + Lofted Pass) / 2⌋, STR = ⌊(Physical Contact + Balance) / 2⌋, DEF = ⌊(Defensive Awareness + Tackling + Defensive Engagement) / 3⌋, SPD = ⌊(Speed + Acceleration) / 2⌋, DRI = ⌊(Ball Control + Dribbling + Tight Possession) / 3⌋. The axis values are computed by one pure function of `@eflab/shared` that takes a stat vector and returns the six integers; the chart reads nothing else of the card. The rings SHALL stand at 30, 60, 90 and 115, a value above 115 is drawn at the outer ring, and a missing side draws no polygon. DEF is the owner-visible exception: the readings (7 builds of 5 cards) leave three formulas that agree on all of them (⌊(3·DA + 2·DE) / 5⌋, ⌊(DA + TAC + DE) / 3⌋, ⌊(3·DA + TAC + 2·DE) / 6⌋), eFootLab uses the equal-weight one and `openspec/ui-dna.md` and `CLAUDE.md` SHALL say it is our choice and not a measured rule. The chart SHALL carry a text alternative that states both sides' six values (side, card name, SHT, PAS, STR, DEF, SPD, DRI), updated with the build.

#### Scenario: Measured build, left side
- **WHEN** a side's shown stats are Finishing 65, Kicking Power 82, Low Pass 82, Lofted Pass 80, Physical Contact 90, Balance 72, Defensive Awareness 99, Tackling 96, Defensive Engagement 91, Speed 81, Acceleration 75, Ball Control 72, Dribbling 71, Tight Possession 79
- **THEN** the six axis values are SHT 73, PAS 81, STR 81, DEF 95, SPD 78, DRI 74 (the reference's readings of that build).

#### Scenario: All measured builds
- **WHEN** the unit test replays the numbers-only oracle of the 7 measured builds (five cards, Epic and Highlight, RWF, CB and GK)
- **THEN** the shown stats reproduce SHT, PAS, STR, SPD and DRI of every build exactly, and the DEF of every build equals the equal-weight formula.

#### Scenario: Build changes move the radar
- **WHEN** the user presses Max OVR or Reset, or selects or clears a manager, on one side (compare's booster pills are read-only and it has no category editing)
- **THEN** that side's polygon and its text alternative change to the new shown stats at once, and the other side is unchanged.

#### Scenario: Scale
- **WHEN** an axis value is 115 or more
- **THEN** its vertex sits on the outer ring; and a value of 30 sits on the first ring.

#### Scenario: Empty or loading side
- **WHEN** a slot is empty, or its card or build has not loaded
- **THEN** no polygon is drawn for it and its values are absent from the text alternative.

#### Scenario: Text alternative
- **WHEN** both slots hold a card
- **THEN** the radar has `role="img"` and an accessible name that lists "Left", the card name and its six values, then "Right" likewise, and axe-core reports no violation on `/compare`.

### Requirement: Position Training Toggle
The detail page's Build settings SHALL offer a **Position Training** toggle (`aria-pressed`, off when the page opens, `data-testid="position-training"`) for a card that has Build settings. While on, the trained positions SHALL be scored at full proficiency (scale 1.0) in the 13 position tiles, in the Best Fit marker, in the Pitch Map and in the overall of the panel when the selected position is a trained one; the card face, the shown stats, the other tiles and the URL SHALL NOT change, and the state SHALL NOT be stored (it is off again when another card opens). The trained positions are: every position of the card with half proficiency, plus every neighbour of the registered position on the pitch grid that is neither a full-proficiency position nor the goalkeeper position; a card registered as a goalkeeper trains none and its toggle SHALL be disabled with the visible reason "Not measured for goalkeepers". The grid neighbours are those of the Pitch Map's geometry: CF {SS, LWF, RWF}; SS {CF, AMF, LWF, RWF}; AMF {SS, CMF, LMF, RMF}; CMF {AMF, DMF, LMF, RMF}; DMF {CMF, CB, LMF, RMF}; CB {DMF, GK, LB, RB}; LWF {CF, SS, LMF}; RWF {CF, SS, RMF}; LMF {LWF, AMF, CMF, DMF, LB}; RMF {RWF, AMF, CMF, DMF, RB}; LB {LMF, CB, GK}; RB {RMF, CB, GK}; GK {CB, LB, RB}. On a tie for the best tile Best Fit SHALL keep the registered position (the reference breaks such ties differently; the difference is documented, not copied). The panel's disclosure SHALL state in neutral wording that the trained positions follow a rule checked on seven outfield cards (four registered positions), that other registrations use the pitch grid, and that goalkeepers are not modelled.

#### Scenario: Quaresma (registered RWF, no half positions)
- **WHEN** Position Training is turned on for a card with full proficiency at LMF, RMF, LWF and RWF and none elsewhere
- **THEN** the trained positions are CF and SS (the neighbours of RWF that are not full), and in the measured build the CF tile goes 78 → 98 and the SS tile 82 → 104 while the other 11 tiles are unchanged.

#### Scenario: Half positions first
- **WHEN** it is turned on for a card registered RWF with full proficiency at AMF, RWF, SS and CF and half at RMF and LWF
- **THEN** the trained positions are RMF and LWF, and in the measured build LWF goes 104 → 108 and RMF 102 → 106.

#### Scenario: Registered centre-back
- **WHEN** it is turned on for a card registered CB with full proficiency at CB, LB and LMF and half at RB and RMF
- **THEN** the trained positions are RB, RMF and DMF (a grid neighbour of CB), and in the measured build RB goes 96 → 101, DMF 82 → 103 and RMF 89 → 93.

#### Scenario: Registered wing and striker cards
- **WHEN** it is turned on for the four measured cards registered LWF (two) and CF (two), whose trained sets the rule predicted before they were read
- **THEN** the trained positions equal the measured ones: RWF and SS (96 → 101, 96 → 100); LMF, RWF, SS and CF (61 → 64, 64 → 67, 50 → 66, 62 → 65); LWF, RWF and SS (45 → 60, 45 → 60, 56 → 59); LWF, RWF and SS (47 → 49, 47 → 49, 49 → 52).

#### Scenario: Face, stats and URL untouched
- **WHEN** the toggle is turned on or off
- **THEN** the card face, every stat in the grid, the Max OVR and the card URL are identical, and only the tiles, the Best Fit marker, the "At position" figure and the panel overall at a trained position change.

#### Scenario: Tie keeps the registered position
- **WHEN** a trained position's tile equals the registered position's tile
- **THEN** Best Fit names the registered position.

#### Scenario: Goalkeeper card
- **WHEN** a goalkeeper card with Build settings is opened
- **THEN** the toggle is present, disabled (`aria-disabled`), carries the reason "Not measured for goalkeepers", and no tile changes.

#### Scenario: Reset on another card
- **WHEN** the toggle is on and the user opens another card (Other Versions, a link)
- **THEN** it is off on the new card.

#### Scenario: Cards without Build settings
- **WHEN** a card has no Build settings (a level-cap-1 card outside the Highlight and Trending kinds)
- **THEN** no Position Training control is shown.

### Requirement: Weak-Foot Chips
The detail page's Build settings SHALL offer a **Weak foot** toggle (`aria-pressed`, off when the page opens, `data-testid="weak-foot-toggle"`) for a card that has Build settings. While on, five stats show a flat deduction by the card's stored weak-foot accuracy (0–3): Ball Control, Low Pass, Lofted Pass, Finishing and Curl, by this table — accuracy 0: −7, −15, −15, −15, −24; accuracy 1: −4, −11, −11, −11, −17; accuracy 2: −2, −7, −7, −7, −10. The deduction SHALL be applied to the stat after the proficiency band and the cut at 99, before the boosters and the manager's +1, and the result SHALL NOT fall below 40 (a stat already at or below 40 is left as it is — it is never raised); the boosters and the manager are then added on top. The overall, the 13 tiles, Best Fit and the card face SHALL be computed from the stats before the deduction and SHALL NOT change. The stat row shows the reduced value and a "−N" chip (distinct from the cyan booster chip and the lime manager chip, readable text contrast, with a visually hidden "weak foot" label), the "Stat breakdown" list SHALL gain a weak-foot part so the parts still add up to the shown value, and the state SHALL NOT be written to the URL and is off again when another card opens. The weak-foot usage does not change the chips (checked at accuracies 0 and 2). A card with weak-foot accuracy 3 (one card measured) SHALL show the toggle disabled with the visible reason "Not measured for this weak-foot level". The disclosure SHALL state which levels were measured (accuracy 2 on three cards, accuracies 0 and 1 on two each).

#### Scenario: Accuracy 2
- **WHEN** the toggle is on for a card with weak-foot accuracy 2 and Low Pass 80 before boosters
- **THEN** Low Pass shows 73 with a "−7" chip, Ball Control shows its value minus 2, Lofted Pass and Finishing minus 7, Curl minus 10, and every other stat is unchanged.

#### Scenario: Accuracy 0 and 1
- **WHEN** the toggle is on for a card with accuracy 0 and Curl 91
- **THEN** Curl shows 67 (−24); and for a card with accuracy 1 and Ball Control 58 and another with 90 both show −4 (54 and 86).

#### Scenario: Floor at 40
- **WHEN** the toggle is on for an accuracy-2 card whose Finishing is 41 before boosters
- **THEN** Finishing shows 40 and its chip reads "−1".

#### Scenario: Below the floor
- **WHEN** a chip stat of the build is already 38 before the deduction
- **THEN** it keeps 38 and shows no chip for that stat.

#### Scenario: Boosters and manager stay on top
- **WHEN** the toggle is on, a booster adds +4 to Finishing (60 before boosters, accuracy 2)
- **THEN** Finishing shows 57 (60 − 7 + 4), the cyan "+4" chip and the "−7" chip both appear, and a selected manager's "+1" is added after the deduction.

#### Scenario: Overall, tiles and face unchanged
- **WHEN** the toggle is turned on
- **THEN** the panel overall, the 13 tiles, Best Fit and the card face are identical to the values with the toggle off.

#### Scenario: Stat breakdown adds up
- **WHEN** the toggle is on and "Stat breakdown" is open
- **THEN** each of the five stats has a weak-foot part (≤ 0) and base + training + cut + proficiency + weak foot + boosters + manager equals the shown value.

#### Scenario: Accuracy 3
- **WHEN** a card with weak-foot accuracy 3 is opened
- **THEN** the toggle is disabled (`aria-disabled`) with the reason "Not measured for this weak-foot level" and no stat changes.

#### Scenario: Other stat views
- **WHEN** the grid shows "Max" or "Base" instead of "Build"
- **THEN** the dump's stats are shown unchanged without chips; turning the toggle on switches the view back to "Build".

#### Scenario: Accessible chips
- **WHEN** the toggle is on
- **THEN** axe-core reports no violation on the detail page at 1440 and 390 px, a stat row's accessible name still contains its visible text in order (Label in Name — e.g. "Adjust Shooting: Finishing −7 weak foot 75", the hidden "Adjust …:" prefix being the accepted rule of capability `a11y-and-card-league`), and the chip's contrast is at least 4.5:1.

### Requirement: Not-Built Items Of The Fourth Survey Are Recorded
Every item the 2026-10-27 measurements examined but this change does not build SHALL be listed in `openspec/ui-dna.md` (pending register) and `CLAUDE.md` with its evidence, its grade and what would settle it: Form A–E (a standard offset table is determined for cards of overall 85 or more with a level cap above 1, a second family exists for low-rated level-cap-1 cards and the rule that selects the family is unknown; the cut at 99 before the offset rests on one stat of one card; goalkeeper stats and a selected manager rest on one card each), the remaining-stamina slider (196 of 198 cells reproduced, two cells one point off, the curve resting on two cards), the skill type chip (the earlier rule was refuted: a skill that lists a stat boost can carry the chip "Animation"), In-Match Roles (the earlier Captain rule was withdrawn on two readings; "only cards with Captaincy reach 95" still holds), the proficiency bonus and Max Level control that the reference now shows on Standard level-cap-1 cards (two cards of one type and one overall band), weak-foot accuracy 3, Best Fit on a tie after training, and the radar's DEF choice. No page SHALL show a control or a value for them. The observed reference changes (a Trending booster that opened off on one card; compare defaults that never buy Goalkeeper 1 for an outfield card and take Goalkeeper 2 before Goalkeeper 3 on a tie) SHALL be listed as observations without action.

#### Scenario: Register
- **WHEN** `openspec/ui-dna.md` is read after this change
- **THEN** its pending register lists each item above with its evidence and no page shows a control for Form, the stamina slider, a skill type chip, roles, the Standard level-cap-1 build or the accuracy-3 chips.
