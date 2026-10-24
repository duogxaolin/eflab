## MODIFIED Requirements

### Requirement: Home Layout
The home page SHALL show, inside the 1152 px container, a 44 px search field with radius 12 and a trailing `/` chip (keeping the live results dropdown and the `/` focus shortcut), then "Latest Players" with 12 cards in 6 columns (3 columns below 768 px, gap 12), then "Latest Packs" with the first three bundles of the `/packs` order, each with its 14 px weight-500 title as plain text (not a link) and 12 px muted date above a horizontal row of 112 px cards (96 px below 768 px) with name captions; pack rows SHALL NOT scroll by themselves, SHALL have no arrow buttons, and SHALL scroll by touch, trackpad or wheel and by moving keyboard focus through their card links; the section's "Show all" links to `/packs`; it SHALL NOT show the former hero, quick-filter chips or "Latest card" aside, and SHALL NOT invent feed, comment, creator or ranking content.

#### Scenario: Home grid
- **WHEN** the home page is shown at 1440 px and at 390 px
- **THEN** "Latest Players" shows 12 cards in 6 and in 3 columns respectively, and no quick-filter chip is present.

#### Scenario: Pack rows stay still
- **WHEN** the home page is left untouched for 7 seconds and then Tab moves focus to a pack card outside the visible part of its row
- **THEN** no pack row changes its scroll position while untouched, no row has an arrow button, and the focused card is scrolled into view.

#### Scenario: Three packs, plain titles
- **WHEN** the home page is shown
- **THEN** "Latest Packs" lists exactly the first three bundles of `/packs` and none of their titles is a link.

### Requirement: Players Page Layout
`/players` SHALL show a breadcrumb, a 24/30 px H1, the sort presets New cards, High to low and Low to high as a 32 px segmented control (horizontally scrollable below 768 px) next to the field-sort select, a 44 px search field with radius 12, the row of active-filter chips under it and the result count line; from 1024 px a sticky 280 px rail (`#181818`, radius 24, padding 16, no border) with 40 px filter rows (radius 12, a 28 px icon tile, a count badge for the dialog rows and a chevron), 34 px toggles with radius 10, 36 px range fields with radius 12, and section dividers `#ffffff0f`; the card grid SHALL show 72 cards per page and have 4 columns below 768 px, 6 from 768 px, 5 from 1024 px and 6 from 1280 px with a 12 px gap; numeric pagination SHALL use 36 px pill buttons. Below 1024 px a "Filters" button SHALL open the filters as a bottom sheet with top radius 16, a grab handle and a full-width accent "Done" button. The URL SHALL follow catalog-browsing-parity "Page State Lives in the URL" (the reference's parameter names and encodings where verified; every older eFootLab link still read); the 13 aria-pressed position toggles and the 50-selection limit SHALL behave as before.

#### Scenario: Grid columns
- **WHEN** `/players` is shown at 390, 768, 1024 and 1440 px
- **THEN** the grid has 4, 6, 5 and 6 columns, page 1 shows 72 cards, and at 1440×900 scrolled to 1500 px the rail's top is 96 ± 1 px.

#### Scenario: URL contract kept
- **WHEN** the canonical URL `/players?pos=11&pos=12&card=5&nat=14` is opened and a filter is changed (the CB position toggled on) and reverted (toggled off), and the older form `/players?card=5&pos=SS&pos=CF&nat=14` is opened and changed and reverted the same way
- **THEN** the first URL returns to exactly `/players?pos=11&pos=12&card=5&nat=14`, the older form lists the same cards (27 in the 2026-10-18 data — a link that lists no card would prove nothing) and becomes `/players?pos=11&pos=12&card=5&nat=14`; and when `/players?pos=11&pos=12&card=5&nat=14&page=2` is changed and reverted the URL becomes `/players?pos=11&pos=12&card=5&nat=14`, because any filter change resets the page to 1 (the default page is omitted).

#### Scenario: Bottom sheet
- **WHEN** the Filters button is activated at 390 px
- **THEN** a bottom sheet opens with a grab handle, focus moves into it, Escape closes it and focus returns to the button.

### Requirement: Player Detail Layout
The detail page SHALL show a breadcrumb (14/20 px), the H1 with the accent overall chip and a muted 12 px note that it is the dump max without proficiency bonus, a line with position, playing-style triggers and condition; from 1024 px a 280 px left column (card face 180 px wide with the condition letter and no MAX LVL or MAX OVR badges, three 28 px round nation, club and league marks, the pinned Progression card and the Build settings card) and a main column with one "Overview" card (`#202020`, radius 24, padding 16, inset ring) holding the description, spec line, category strip, booster buttons, stats, and skills, plus a 32×32 Compare shortcut in its heading; then Body Model and Position & Playstyle cards with the same card style; Card Info and Other Versions (56 px thumbnails) sit in a full-width row below. Stat rows SHALL be at least 36 px tall — 36 px when the label fits on one line; a row whose label wraps, or a narrow row (two columns at 390 px) that stacks its "+N" chips above the value instead of splitting a word, grows (52–56 px), at any width — `#272727`, radius 8, padding 6/10, with 14 px weight-500 tier-coloured labels that may wrap, and 36×(row) value pills with radius 6, 14 px bold black text on the tier fill and filled cyan "+N" booster chips; activating a stat row SHALL open its Adjust popover when the build can spend training points, and the rows SHALL be plain otherwise (efootbase-behaviour-parity "Stat Row Adjust Popover"); stats SHALL be in three columns from 1024 px and two below, one below 360 px. Skill names SHALL be 14 px weight-600 links with radius 8 and a 288 px preview with the artwork on top. Sections for which eFootLab has no data (in-match roles, community, comments, ratings, position training) SHALL NOT appear.

#### Scenario: Stat row
- **WHEN** a detail page is shown at 1440 px
- **THEN** a stat row whose label fits on one line is 36 px tall with background `#272727` and radius 8, no row is shorter than 36 px, and the stats occupy three columns.

#### Scenario: Card face
- **WHEN** a detail page is shown at 1440 px
- **THEN** the card face is 180 px wide and shows no MAX LVL or MAX OVR badge.

#### Scenario: Stats on phone
- **WHEN** a detail page is shown at 390 px
- **THEN** the stats are in two columns and no stat name is truncated with an ellipsis; at 320 px they are in one column.

#### Scenario: Card Info below the columns
- **WHEN** a detail page is shown at 1440 px
- **THEN** Card Info and Other Versions start below the bottom of both columns and span the container width.

### Requirement: Progression Panel, Manager Drawer And Mobile Dock
From 1024 px the Progression card SHALL be pinned at a 64 px top offset in the 280 px left column while the two-column area still extends below the card; at the end of that area it SHALL scroll up with it and SHALL never overlap Card Info or Other Versions (a pinned card cannot stay at 64 px past the point where its bottom meets the end of the column without covering what follows); it SHALL fit a 1440×900 viewport without an inner scrollbar (at most 819 px tall) by holding only the header (14 px weight-500 title, the points, a 32 px accent "Max OVR" button and a 32 px reset icon button), a 48 px "Select Manager" trigger (`#272727`, radius 24, text `#c2f879`), the Manager Proficiency row with its value in `#01fec5`, and 42 px category rows with an 18×18 stepper, a 16 px track and the visible next cost; for a Highlight card with a level cap of 1 it SHALL also hold the Max Level slider and its note, and for a Trending card it SHALL be the "Build" panel (title "Build", Select Manager and the proficiency row only). Max Level (for a card with a level cap above 1), the position selector, the estimate at the selected position and the "About this build" disclosure (explanatory notes, limits and the "Stat breakdown" list) SHALL live in a non-sticky "Build settings" card at the end of the left column, below the pinned card's travel (the pinned card moves only above it and never covers it), and Card Info and Other Versions SHALL sit in a full-width row below the two-column layout so the pinned card never covers them; booster toggles stay in the Overview card. The manager picker SHALL open as a bottom-anchored drawer 512 px wide with top radius 16 and 74 px rows; when a manager is selected it SHALL be listed first with an accent border and a "Clear" button. Below 1024 px the Progression card SHALL be replaced by a floating category strip and a dock (366×50, above the tab bar) with the proficiency chip, manager avatar, the points as remaining/total ("60/60" for a build without points, "0/60" for a full one) with reset, and Max OVR; the proficiency chip and the avatar open a small non-modal popover above the dock (manager selection and the proficiency control with 36 px −/+ buttons), a strip item opens that category's Adjust popover, and the points and the Progression button open a bottom sheet with the full controls scrolled to the categories. All behaviour of the Progression engine and the manager rules SHALL be unchanged except where player-progression-simulator and efootbase-function-parity change them. The pin cannot hold while the left column is longer than the main column (for example with the "About this build" disclosure open): the Progression card then scrolls with the column instead of staying at 64 px.

#### Scenario: Sticky panel
- **WHEN** the detail page of a card with a level cap above 1 (Messi, `/players/7511/89136409091415`), with the "About this build" disclosure closed, is scrolled at 1440×900 to 1000 and to 1500 px, and then on to the end of the page
- **THEN** at 1000 and 1500 px the Progression card's top is at 64 ± 1 px; it has no inner scrollbar; at no scroll position does it overlap the Build settings card, Card Info or Other Versions (at the end of the two-column area it has scrolled up with the column); and its category rows are 42 px tall.

#### Scenario: Manager drawer
- **WHEN** "Select Manager" is activated at 1440 px
- **THEN** a drawer 512 px wide anchored to the bottom opens with focus in its search field, lists the 69 managers, and one Escape closes it returning focus to the trigger even when the search field holds text.

#### Scenario: Mobile dock
- **WHEN** a detail page of a card with a level cap above 1 is shown at 390 px and the proficiency chip in the dock is tapped
- **THEN** a non-modal popover appears above the dock with the manager selection and the proficiency control; tapping "+" changes the proficiency by 1; Escape or a tap outside closes it and returns focus to the chip; tapping a category strip item instead opens that category's Adjust popover, tapping the points opens the bottom sheet with the category rows in view, the dock's points read remaining/total, and the overall shown matches the engine.

### Requirement: Compare Page
`/compare` SHALL show the breadcrumb, a 36/40 px H1, a 16/26 px muted subtitle up to 768 px wide that says both builds can be trained, 36×36 swap and copy-link buttons, and a console grid of 260 px / flexible / 260 px from 768 px (two columns side by side below) with slots 160×226 px, `#232323` (hover `#272727`), radius 16, an empty state of a 48 px circle with a plus, "Add Player" and "Search and select a player"; the picker SHALL be the search palette; a filled slot SHALL hold the build controls of efootbase-function-parity "Two-Build Compare" restyled with the tokens, and the table SHALL use value pills with the difference shown next to both pills.

#### Scenario: Empty compare
- **WHEN** `/compare` is opened without players at 1440 px
- **THEN** the two slots are 160×226 with radius 16 and read "Add Player".

### Requirement: Packs Page
`/packs` SHALL show the 36/40 px H1, a 16/26 px muted subtitle, stat chips 30 px tall with radius 8 that keep eFootLab's counts (packs, distinct players and cards) followed by a "Last updated" chip, the bundles in their stored order, and per pack a baseline header with the 14 px weight-500 title linking to the pack page and the 12 px muted date, above a grid of 4, 5, 6, 7 and 8 columns at base, 640, 768, 1024 and 1280 px with a 12 px gap and "styles" captions.

#### Scenario: Packs columns
- **WHEN** `/packs` is shown at 390 and 1440 px
- **THEN** each pack grid has 4 and 8 columns.

### Requirement: Skills Index Tiles
The skills index SHALL live at `/wiki/skills` (`/skills` redirects there) and show a 36/40 px H1, a 16/26 px subtitle, a search field that filters the tiles by skill name (accent-insensitive), segmented Showtime / Classic group filters, from 1024 px the wiki rail, the Showtime and Classic sections only (no "Other" section) with headers carrying an icon tile and count, and tiles (`#181818`, radius 16, padding 14/16, inset ring, hover ring `#ffffff29`) with the name 15 px bold (`#ffd700` for Showtime, white for Classic), a two-line 13/18.85 px muted description, the leader chip (card thumbnail and player name) and a cards-count chip, in 3 columns from 1280 px, 2 from 768 px and 1 below; artwork, effects, rank and top cards SHALL remain on the skill page.

#### Scenario: Name search
- **WHEN** "double" is typed in the skills search on `/wiki/skills`
- **THEN** only skills whose name contains "double" (ignoring case and accents) remain, and clearing the field restores all tiles.

#### Scenario: Skill columns
- **WHEN** `/wiki/skills` is shown at 1440, 768 and 390 px
- **THEN** the tiles are in 3, 2 and 1 columns.

### Requirement: Search Palette
The header search palette SHALL be a 576 px wide dialog with radius 16 on `#181818` with an inset `#ffffff4d` hairline over a `#00000099` backdrop, a 45 px input row with a search icon, a clear button and the Esc chip, and result rows with a 40×56 card thumbnail, the name 14/500, a 12 px muted line of position and playing styles, the pack / campaign chip and the max overall at the right; it SHALL query after a 200 ms pause from 3 characters, list results in pages of 12 with more loaded on scroll, make the first row active while typing so that Enter opens it, and use the placeholder "Search players by name…".

#### Scenario: Palette size
- **WHEN** the palette is opened with ⌘K at 1440 px
- **THEN** its dialog is 576 px wide with radius 16 and the placeholder reads "Search players by name…".

### Requirement: No Regressions
After the rebuild, `pnpm typecheck` and `pnpm test` SHALL pass, the web build SHALL succeed, no page SHALL scroll horizontally from 320 to 1280 px, pages SHALL log no console error, every `data-testid` present before the change SHALL still exist except those of controls removed by change `efootbase-function-parity` (listed in its design), the URL contracts of `/players` SHALL follow catalog-browsing-parity "Page State Lives in the URL" with every older link still read, and `/admin` SHALL render and work.

#### Scenario: Test IDs kept
- **WHEN** the set of `data-testid` values in `apps/web` is compared with the set on the base commit
- **THEN** no value is missing except the ones the design lists as removed with their control.

#### Scenario: No horizontal scroll
- **WHEN** each public page is shown at 320, 390, 768, 1024 and 1280 px
- **THEN** `document.documentElement.scrollWidth` equals the viewport width.
