## MODIFIED Requirements

### Requirement: Player Detail Information Sections
The player detail page SHALL show a single overall pill, a Card Info block (name, featured pack, card type, nation, team, league — the card's own league, see a11y-and-card-league "Card League In The Card DTO" —, position, age, strong foot, height, weight, condition, card id with a copy control, release date), a Body Model section, Injury Resistance and Form, with stat names never truncated at 1280 and 390 px, "+N" booster chips on affected stats, a fifth tier colour for values of 100 or more taken from the tier tokens, click-to-highlight (pinned) of stats belonging to a category, with a hover / keyboard-focus preview of a category before it is pinned, efootbase skill labels with Showtime skills first, and proficiency text of the form "N Full · N Half".

#### Scenario: Card info
- **WHEN** a user opens a player page
- **THEN** the Card Info block lists the fields above and the card id copy control copies the id.

#### Scenario: Stat names
- **WHEN** the detail page is viewed at 390 px
- **THEN** no stat name is truncated with an ellipsis.

#### Scenario: League row
- **WHEN** a player page is opened
- **THEN** Card Info shows a "League" row with the card's own league name (no row for a card that has no league and no team), and it equals the league the League filter matches for that card.
