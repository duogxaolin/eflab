## MODIFIED Requirements

### Requirement: Skills Grouping
The skills page SHALL group skills into Showtime and Classic using the stored group of each skill, SHALL list entries that efootbase does not treat as skills under a separate "Other" section, SHALL NOT use invented tier labels such as "Premium", and SHALL NOT show synthesised rarity or boosts. On player pages each skill name SHALL be a link to its skill page with a preview (artwork, name, description and stored effects) that opens on mouse hover after the tooltip delay and immediately on keyboard focus, and on touch devices the first tap SHALL open the same content as a popover containing the link to the skill page.

#### Scenario: Showtime group
- **WHEN** the skills page is opened
- **THEN** the skills stored as Showtime appear under a Showtime heading, the skills stored as Classic under a Classic heading, the entries without a group under the "Other" section, and unreleased skills do not appear.

#### Scenario: Player skill chip
- **WHEN** a keyboard user focuses a skill name on a player page
- **THEN** a preview shows the skill's artwork, description and effects at once and is announced through `aria-describedby`; Escape hides it without moving focus; Enter opens the skill page; on a touch device the first tap opens a popover with the same content and a link to the skill page, and Escape or a tap outside closes it and returns focus to the skill name.

#### Scenario: Skill popover on a short screen
- **WHEN** a skill preview or touch popover is opened from any skill name of a card with many skills on a viewport from 320×568 up to 1280×800 (including a 667×375 landscape phone)
- **THEN** the whole preview or popover lies at least 8 px inside the visible viewport on every side, the popover scrolls inside itself when it is taller than the viewport, and its link reached with Tab is visible.

#### Scenario: Skill artwork is not cropped
- **WHEN** a skill's artwork has a different aspect ratio from the 576:346 frame (9 of the 67 stills are 576×324)
- **THEN** the whole image is shown inside the frame, letterboxed, and no part of it is cut off.
