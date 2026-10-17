# catalog-browsing-parity Specification

## Purpose
Defines how the Players, Compare, Packs, Skills and home pages filter, search, sort, paginate and present real data so browsing eflab behaves like browsing efootbase.
## Requirements
### Requirement: Deterministic Pagination
Every paginated listing (player list, skill holders) SHALL return a stable total order, so that consecutive pages never repeat a card and never skip one, for every sort option the UI offers.

#### Scenario: Sorting by a heavily tied stat
- **WHEN** a user pages through the player list sorted by Speed, pages 1 to 10
- **THEN** the union of returned card ids contains no duplicates, and repeating the request returns identical ids.

### Requirement: Accent- and Case-Insensitive Search Everywhere
Text search SHALL match names ignoring diacritics and letter case on the players page, the home search, the header search and the compare picker, and SHALL treat `%` and `_` as literal characters.

#### Scenario: ASCII query for an accented name
- **WHEN** a user searches "Mbappe" or "Schar" on `/players`
- **THEN** results include Kylian Mbappé and Fabian Schär.

#### Scenario: Wildcard characters
- **WHEN** a user searches `%`
- **THEN** only players whose name contains a literal percent sign are returned (normally none).

### Requirement: Search Scope Is Visible and Changeable
The players page SHALL show which card types are included, SHALL let the user change that scope, and SHALL NOT silently exclude card types from a text search that the search dropdown showed.

#### Scenario: Dropdown and results agree
- **WHEN** the home search dropdown lists a Trending card for "cruyff" and the user presses Enter
- **THEN** the `/players` result for that query contains that card, or the page shows the active card-type scope with a one-click control to include all types.

### Requirement: Filters Use the Correct Identifiers
The Playing Style filter SHALL use the same style identifiers as the stored data, and SHALL send attack styles to the attack-style filter and defence styles to the defence-style filter. The nationality fallback list SHALL use real country ids.

#### Scenario: Target Man
- **WHEN** a user selects "Target Man" in the Playing Style filter
- **THEN** every returned card has the Target Man style, and no Prolific Winger is returned.

#### Scenario: Defence style
- **WHEN** a user selects "Anchor Man" under Defence
- **THEN** every returned card has Anchor Man as its defensive style.

### Requirement: Page State Lives in the URL
The players page SHALL reflect its query, card type, filters, sort and page in the URL, SHALL read them from the URL on load and on navigation, and SHALL reset to page 1 whenever the query or a filter changes.

#### Scenario: Reload and share
- **WHEN** a user applies filters and sort on page 3 and reloads, or opens the same URL in a new tab
- **THEN** the same filters, sort and page are active.

#### Scenario: New search from another page
- **WHEN** the user is on page 7 and runs a header search that yields 2 pages
- **THEN** the page shows results from page 1 of the new search, never an empty "Page 7 of 2" state.

### Requirement: Home Quick Filters Do What They Say
Each home quick filter SHALL produce a players list that matches its label, including "Epic & Big Time" returning the `EPIC` card type (Big Time cards are stored under `EPIC` per efootbase's own labels, so the filter sends `cardTypeIn: ["EPIC"]`) and "90+ OVR" returning only cards with overall at least 90.

#### Scenario: 90+ OVR
- **WHEN** a user clicks "90+ OVR"
- **THEN** the players list shows only cards with overall ≥ 90 and an active chip indicates the filter.

### Requirement: Pagination Controls Reach Every Page
The pagination control SHALL always let the user reach any page, show the current page as active, and scroll the grid back to the top when the page changes.

#### Scenario: Page 300
- **WHEN** a user is on page 6 or later
- **THEN** the control shows a numbered window around the current page, with the current page highlighted, plus first/last and previous/next controls.

### Requirement: Pack Pages Open From Their Links
Every link to a pack or bundle detail SHALL resolve to a page that shows that bundle's cards; no rendered link SHALL lead to "Pack not found".

#### Scenario: Homepage bundle title
- **WHEN** a user clicks a bundle title in "Latest Packs" on the home page
- **THEN** a page listing that bundle's cards in efootbase order opens, with HTTP 200.

### Requirement: Skills Pages Show Real Numbers
Skills pages SHALL display card counts, share and "top cards" computed from the player-skill data, and SHALL NOT display synthesised figures.

#### Scenario: One-Time Pass
- **WHEN** the Skills page lists One-Time Pass
- **THEN** its card count equals the number of players who have that skill (8,909 in the 2026-10 data), and its detail page shows top cards that actually have the skill.

#### Scenario: Skill without holders
- **WHEN** no card has a given skill
- **THEN** the count is 0 and the page says there are no cards, not a placeholder grid.

### Requirement: No Fabricated Community Content
The home page SHALL NOT display comments, creators, votes or follower counts that are not backed by stored data.

#### Scenario: Empty community data
- **WHEN** the comment store contains no rows
- **THEN** the home sidebar shows no comment list (or a clearly labelled empty state).

### Requirement: Player Detail Accuracy
The player detail page SHALL show height in feet and inches by flooring the feet value, SHALL show the defensive-position card from defensive data, SHALL render weak-foot stars equal to the 1–4 level, SHALL show "…" only when more skills exist than are displayed, SHALL show the real max level on the max-level badge, and SHALL NOT present controls (Progression sliders, presets) that change nothing.

#### Scenario: Height conversion
- **WHEN** a player is 182 cm tall
- **THEN** the page shows 6'0" (71.65 in → 5 ft + 11.65 in rounds to 12 in and carries), and for 170 cm shows 5'7".

#### Scenario: Progression controls
- **WHEN** a user moves a Progression slider
- **THEN** the displayed stats and OVR update using the shared progression engine within the available point budget, or the control is not shown.

### Requirement: Unknown Detail URLs Return 404
A player, pack or skill URL that does not resolve to a record, or whose base id does not match the card, SHALL return HTTP 404 and render a not-found page; each route SHALL have its own page title.

#### Scenario: Mismatched base id
- **WHEN** a user opens `/players/123/<valid card id of a different base>`
- **THEN** the response is 404.

#### Scenario: Titles
- **WHEN** a user opens a player page
- **THEN** the document title contains the player's name.

### Requirement: Dates Are Timezone-Stable
Bundle release dates SHALL be displayed in UTC so every viewer sees the same calendar date.

#### Scenario: Viewer in Los Angeles
- **WHEN** a bundle is released at 2026-10-05 03:00 UTC
- **THEN** a viewer in UTC-7 sees "Oct 5".

