## MODIFIED Requirements

### Requirement: Search Scope Is Visible and Changeable
The players page SHALL default to all card types (no card type pre-selected, matching efootbase), SHALL show which card types are included, SHALL let the user select several card types, and SHALL NOT silently exclude card types from a text search that the search dropdown showed.

#### Scenario: Default scope
- **WHEN** a user opens `/players` without parameters
- **THEN** no card type is pre-selected, the result count equals the whole catalogue (48,410 cards), and Trending cards are included.

#### Scenario: Dropdown and results agree
- **WHEN** the home search dropdown lists cards for "cruyff" (9 cards in the 2026-10 data: 7 Epic, 2 Legendary) and the user presses Enter
- **THEN** `/players?search=cruyff` returns every card the dropdown listed (9 of 9) and no card type is pre-selected.

### Requirement: Filters Use the Correct Identifiers
The Playing Style filter SHALL use the same style identifiers as the stored data and SHALL send one `playingStyle` parameter that the API matches in either slot (`playingStyleAttack OR playingStyleDefense`), because efootbase groups and filters by style, not by slot. The filter SHALL present the styles in Attack, Defence and AI groups, SHALL list styles that no stored card carries as unavailable without inventing an identifier, and the AI group SHALL map to the stored boolean flag columns. The nationality fallback list SHALL use real country ids.

#### Scenario: Target Man
- **WHEN** a user selects "Target Man" in the Playing Style filter
- **THEN** every returned card has Target Man in its attack or defence slot, and no card without that style (for example a Prolific Winger with another defence style) is returned.

#### Scenario: Defence style
- **WHEN** a user selects "Anchor Man" under Defence
- **THEN** the URL carries `playingStyle=<Anchor Man id>` and every returned card has Anchor Man in its attack or defence slot (the style sits in both slots on real cards).

#### Scenario: Unavailable style
- **WHEN** the Playing Style dialog is open
- **THEN** Build-up GK, Deep Defender, Press Back and Tough Marker are shown disabled and cannot be sent to the API.

### Requirement: Page State Lives in the URL
The players page SHALL reflect its query, card types, filters, sort and page in the URL using efootbase's parameter names where observed — `search`, `card` (repeatable card-type code), `pos`, `playingStyle`, `ai`, `nat`, `league`, `team`, `foot`, `base` and `ovr` (Base / Max Overall Rating ranges as `min-max`), `condition`, `form`, `wfa`, `wfu`, `height`, `weight`, `age`, `skill`, `stat` (+ `smax`), `body`, `sort`, `order`, `page` — SHALL omit defaults, SHALL still read the older `q`, `type`, `style`, `dstyle`, `ovrMin`/`ovrMax` and `maxOvrMin`/`maxOvrMax` parameters without writing them, SHALL drop out-of-range or inverted values instead of sending them, SHALL read the state from the URL on load and on navigation, and SHALL reset to page 1 whenever the query or a filter changes.

#### Scenario: Reload and share
- **WHEN** a user applies filters and sort on page 3 and reloads, or opens the same URL in a new tab
- **THEN** the same filters, sort and page are active.

#### Scenario: New search from another page
- **WHEN** the user is on page 7 and runs a header search that yields 2 pages
- **THEN** the page shows results from page 1 of the new search, never an empty "Page 7 of 2" state.

#### Scenario: Old link
- **WHEN** a user opens `/players?q=messi&type=EPIC`
- **THEN** the page shows the Epic cards matching "messi" and rewrites the URL as `search=messi&card=5` on the next change.

### Requirement: Home Quick Filters Do What They Say
Each home quick filter SHALL produce a players list that matches its label: the card-type chips send the efootbase card-type code (`/players?card=5` for "Epic & Big Time" — Big Time cards are stored under `EPIC` per efootbase's own labels — `card=6` for "Highlight & Show Time", `card=1` for "Legendary") and "90+ OVR" SHALL send `/players?base=90-`, returning only cards with base overall at least 90.

#### Scenario: 90+ OVR
- **WHEN** a user clicks "90+ OVR"
- **THEN** the players list shows only cards with base overall ≥ 90, the Base Overall Rating filter reads "≥ 90", the Filters button shows one active filter and the Reset control is visible.

#### Scenario: Epic & Big Time
- **WHEN** a user clicks "Epic & Big Time"
- **THEN** the URL is `/players?card=5` and every returned card is of type Epic (1,083 cards in the 2026-10 data).

### Requirement: Skills Pages Show Real Numbers
Skills pages SHALL display card counts, share and "top cards" computed from the player-skill data, and SHALL NOT display synthesised figures. Display labels MAY differ from the stored fixture names (`lib/skill-labels.ts`), but counts SHALL always be computed from the stored skill.

#### Scenario: One-Time Pass
- **WHEN** the Skills page lists One-touch Pass (the display label of the stored skill "One-Time Pass")
- **THEN** its card count equals the number of players who have that skill (8,909 in the 2026-10 data), and its detail page shows top cards that actually have the skill.

#### Scenario: Skill without holders
- **WHEN** no card has a given skill
- **THEN** the count is 0 and the page says there are no cards, not a placeholder grid.

## ADDED Requirements

### Requirement: Efootbase Labels
User-visible names SHALL follow efootbase where this was observed and verified against the data's own labels: "Nation" for the nationality filter, "Base Overall Rating" and "Max Overall Rating" for the overall ranges, and the card-type names taken from the single label table.

#### Scenario: Filter labels
- **WHEN** the filter panel is open
- **THEN** it shows "Nation", "Base Overall Rating" and "Max Overall Rating" and no "Nationality".

### Requirement: Sort Presets
The players page SHALL expose a sort control named "Sort" that shows the current choice and offers Trending (default), New cards, Top rated, High to low and Low to high, each with a documented, data-verifiable definition, in addition to any existing field sorts.

#### Scenario: Sort control
- **WHEN** a user opens the sort control and chooses "New cards"
- **THEN** the list is ordered by release date descending with a stable tiebreaker and the URL records the choice.

### Requirement: Additional Player Filters
The players page SHALL offer filters for base and max overall ranges, condition, form, weak-foot accuracy and usage, height, weight and age ranges, skills, league, team, stat ranges and body-model ranges, in that priority order. Each filter that ships SHALL be applied by the API, SHALL be recorded in the URL, and SHALL reset the page to 1 when changed. A filter that cannot be delivered correctly SHALL NOT ship.

#### Scenario: Overall range
- **WHEN** a user sets Base Overall Rating minimum to 90
- **THEN** every returned card has base overall at least 90 and the URL contains the minimum.

#### Scenario: Skill filter
- **WHEN** a user selects the skill One-touch Pass (stored as "One-Time Pass")
- **THEN** every returned card has that skill.

### Requirement: Playing Style Lists Match the Data
The Playing Style filter SHALL list only styles whose identifiers are verified against the dump, SHALL group attack, defence and AI styles separately where the data supports it, and SHALL NOT invent identifiers for styles that no card in the database carries.

#### Scenario: Style without cards
- **WHEN** a style exists on efootbase but no card in the database carries it
- **THEN** the filter does not offer a made-up identifier for it and the documentation lists it as unavailable.

### Requirement: Player Detail Information Sections
The player detail page SHALL show a single overall pill, a Card Info block (name, featured pack, card type, nation, team, position, age, strong foot, height, weight, condition, card id with a copy control, release date), a Body Model section, Injury Resistance and Form, with stat names never truncated at 1280 and 390 px, "+N" booster chips on affected stats, a fifth tier colour for values of 100 or more taken from the tier tokens, click-to-highlight of stats belonging to a category, efootbase skill labels with Showtime skills first, and proficiency text of the form "N Full · N Half".

#### Scenario: Card info
- **WHEN** a user opens a player page
- **THEN** the Card Info block lists the fields above and the card id copy control copies the id.

#### Scenario: Stat names
- **WHEN** the detail page is viewed at 390 px
- **THEN** no stat name is truncated with an ellipsis.

### Requirement: Packs Header and Counts
The packs page SHALL NOT use emoji in its header and SHALL count players as unique players across bundles.

#### Scenario: Unique players
- **WHEN** the packs page is loaded
- **THEN** the displayed player count equals the number of distinct players in the listed bundles, not the number of card rows.

### Requirement: Skills Grouping
The skills page SHALL group skills into Showtime and Classic where this grouping is verified against efootbase's list, SHALL NOT use invented tier labels such as "Premium", and SHALL NOT show synthesised rarity or boosts.

#### Scenario: Showtime group
- **WHEN** the skills page is opened
- **THEN** the skills observed as Showtime on efootbase appear under a Showtime heading and the others under Classic.

### Requirement: Command Palette Wording
The header search palette SHALL use the placeholder "Search players by name…", SHALL show an Esc chip, and the `/` key SHALL focus the home search.

#### Scenario: Slash shortcut
- **WHEN** a user presses `/` on the home page outside a text field
- **THEN** the home search input receives focus.
