## MODIFIED Requirements

### Requirement: Skills Pages Show Real Numbers
Skills pages SHALL display card counts, share and "top cards" computed from the player-skill data, together with the skill's icon, description, stat effects and activation text taken from the stored efootbase data, and SHALL NOT display synthesised figures. Display labels MAY differ from the stored fixture names (`lib/skill-labels.ts`), but counts SHALL always be computed from the stored skill.

#### Scenario: One-Time Pass
- **WHEN** the Skills page lists One-touch Pass (efootbase's name, stored by the seed from the snapshot; fixture name "One-Time Pass", slug `one-touch-pass`)
- **THEN** its card count equals the number of players who have that skill (9,125 in the 2026-10-18 data), and its detail page shows top cards that actually have the skill.

#### Scenario: Skill without holders
- **WHEN** no card has a given skill
- **THEN** the count is 0 and the page says there are no cards, not a placeholder grid.

#### Scenario: Skill with effects
- **WHEN** the detail page of a skill that has stat effects is opened
- **THEN** it lists each affected stat with its bonus (for example +6 Dribbling) and the activation text when one exists, and the icon is shown.

### Requirement: Skills Grouping
The skills page SHALL group skills into Showtime and Classic using the stored group of each skill, SHALL list entries that efootbase does not treat as skills under a separate "Other" section, SHALL NOT use invented tier labels such as "Premium", and SHALL NOT show synthesised rarity or boosts.

#### Scenario: Showtime group
- **WHEN** the skills page is opened
- **THEN** the skills stored as Showtime appear under a Showtime heading, the skills stored as Classic under a Classic heading, the entries without a group under the "Other" section, and unreleased skills do not appear.

#### Scenario: Player skill chip
- **WHEN** a keyboard user focuses a skill chip on a player page and activates it
- **THEN** a popover shows the skill's icon, description and effects, the chip reports its expanded state, and Escape closes it and returns focus to the chip.

#### Scenario: Skill popover on a short screen
- **WHEN** a skill popover is opened from any chip of a card with many skills on a viewport from 320×568 up to 1280×800 (including a 667×375 landscape phone)
- **THEN** the whole popover lies at least 8 px inside the visible viewport on every side, it scrolls inside itself when it is taller than the viewport, and the link reached with Tab is visible.

#### Scenario: Skill artwork is not cropped
- **WHEN** a skill's artwork has a different aspect ratio from the 576:346 frame (9 of the 67 stills are 576×324)
- **THEN** the whole image is shown inside the frame, letterboxed, and no part of it is cut off.
