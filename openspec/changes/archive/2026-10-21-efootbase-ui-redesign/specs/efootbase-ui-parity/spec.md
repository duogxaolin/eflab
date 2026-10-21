## Purpose

Defines the measurable visual and behavioural contract of the eFootLab web interface rebuilt to match the efootbase.com reference captured on 2026-10-20 (kept in an outside-repo reference folder), so each page can be checked value by value at 1440, 1024, 768 and 390 px while eFootLab keeps its own branding, data and URL contracts.

## ADDED Requirements

### Requirement: Reference Design Tokens
The theme tokens SHALL take the measured reference values: canvas `#060606`, panel/surface `#181818`, elevated `#232323`, default `#272727` (hover `#2e2e2e`), card `#202020` with an inset 1 px `#ffffff0a` ring instead of a border, line `#292929`, separator `#ffffff0a`, text `#fcfcfc`, muted text `#a0a0a0`, accent `#acf41a` with foreground `#080d02`, accent hover `#99d919`, accent soft `#adf7191f` and soft foreground `#c2f879`, warning `#ffae5f`, danger `#d83864`, success `#6cc233`, the five stat tiers 90–99 `#01fec5`, 80–89 `#a8fe02`, 70–79 `#fbb206`, 100+ `#ff66cc`, below 70 `#ff2e2e`, and position colours FW `#ff2e2e`, MF `#7dff1f`, DF `#0099ff`, GK `#ffc300`. Visible text SHALL NOT use a colour with less than 4.5:1 contrast on its background — for text drawn straight on the aurora backdrop or the detail tint, against the brightest backdrop pixel behind it (so secondary text there uses a brighter on-backdrop tone than the muted token; an `aria-hidden` decorative separator is exempt) — and every consumer of tier colours SHALL keep reading them from the single tier token set.

#### Scenario: Token values
- **WHEN** the computed `background-color` of the page body and of a players-rail aside are read at 1440 px
- **THEN** they are `rgb(6, 6, 6)` and `rgb(24, 24, 24)`.

#### Scenario: Tier colours
- **WHEN** a stat of 91, 85, 74, 104 and 62 is shown on a detail page
- **THEN** their value pills are filled `#01fec5`, `#a8fe02`, `#fbb206`, `#ff66cc` and `#ff2e2e` with black text.

#### Scenario: Text over the backdrop
- **WHEN** every public page, and a detail page of each of the seven card types, is shown at 1440, 1024, 768 and 390 px, a screenshot is taken with all text made transparent, and every pixel behind each visible text line in the first 640 px is compared with that line's colour (alpha-composited over the pixel)
- **THEN** every line that is not `aria-hidden` decoration has a contrast of at least 4.5:1 against its worst pixel — breadcrumbs, page subtitles, the detail header's overall note and position · style · condition line included.

#### Scenario: Admin follows the tokens
- **WHEN** `/admin/login` is rendered after the token change
- **THEN** it uses the new token values, shows no unstyled element and keeps every control readable.

### Requirement: Aurora Backdrop
Every page SHALL show at the top a blurred strip coloured `linear-gradient(90deg, #34d9c8, #3b82f6 50%, #8b5cf6)` that fades to the canvas colour by about 600 px down, scrolls with the page, and replaces the previous radial gradients and noise layer. Player detail pages MAY add a static tint chosen by card type, faint enough that the text over it keeps the contrast required under "Reference Design Tokens".

#### Scenario: Sampled colours
- **WHEN** the home page is screenshotted at 1440×900 and pixels are sampled at y = 70 for x = 20, 720 and 1420
- **THEN** each sampled colour is within 10 % per channel of `#1a615b`, `#1a355f` and `#3f2d6d`, and the pixel at x = 20, y = 600 is within 3 per channel of the canvas.

### Requirement: Typography
The interface SHALL use Inter with no negative letter-spacing on headings: page H1 36/40 px bold (30/36 below 768 px), the `/players` H1 24/30 px bold, section H2 18/22.5 px bold, labels and buttons 14/20 px weight 500–600, captions 12/16 px, and SHALL NOT use monospace or uppercase micro-labels for visible labels except keyboard chips and code-like identifiers (card id).

#### Scenario: Detail heading
- **WHEN** a player detail page is shown at 1440 px
- **THEN** the H1 is 36 px, line-height 40 px, weight 700 and letter-spacing normal.

### Requirement: Header
The header SHALL be sticky, 64 px tall plus a 1 px `#ffffff14` bottom border, inside the 1152 px container, with a translucent blurred fill of the canvas colour (not measured on the reference): 70 % while the page is at the top (or too short to scroll), where only the backdrop strip is under it, and at least 85 % as soon as the page is scrolled — and everywhere in browsers without scroll-driven animations — because at 85 % the backdrop under its text stays at or below `#2b2b2b` even over pure-white content, so the header text keeps at least 4.5:1 whatever scrolls under it; its links (Players, Compare, Packs, Skills) SHALL be 14/20 px weight 400 in `#ffffff8c`, with the active link white on `#f5ffff1a` with radius 8 and padding 6/12, visible from 1024 px; the search trigger SHALL be 208×32 px with radius 12 and a ⌘K chip; below 1024 px the header SHALL show the logo and a search icon button and no hamburger menu. The eFootLab wordmark SHALL remain.

#### Scenario: Desktop header
- **WHEN** `/players` is shown at 1440 px
- **THEN** the header box is 65 px tall, the Players link has the active background, and the search trigger measures 208×32 with radius 12.

#### Scenario: Header text over scrolled content
- **WHEN** the brightest pages (skill detail, packs, players grid, player detail) are scrolled under the header at 1440 and 1024 px
- **THEN** every header text line (the inactive `#ffffff8c` links and the search trigger's text and ⌘K chip included) keeps at least 4.5:1 against its worst backdrop pixel at every scroll position.

#### Scenario: Below 1024
- **WHEN** any page is shown at 768 px
- **THEN** the header shows no navigation links and no hamburger, and every section remains reachable from the tab bar.

### Requirement: Floating Tab Bar
Below 1024 px a tab bar SHALL float 12 px above the bottom edge with 12 px side gutters and a maximum width of 480 px, 58 px tall, radius 16, fill `#060606b8` with a 20 px backdrop blur and saturate 1.45, border 1 px `#ffffff14`, items with 20 px icons and 11 px labels, the active item `#acf41a` and others `#ffffff8c`; the page body SHALL reserve the bar's height plus the safe-area inset so content is never hidden behind it. From 1024 px it SHALL be hidden.

#### Scenario: Phone width
- **WHEN** the home page is shown at 390×844
- **THEN** the tab bar measures 366×58, its bottom edge is 12 px above the viewport bottom, and the last footer link can be scrolled above it.

### Requirement: Footer
The footer SHALL have a top `#ffffff0a` border, 48 px top padding and, from 1024 px, the eFootLab brand block (wordmark, tagline, paragraph) beside eFootLab's own link columns (Browse and Project) of 14/20 px `#a0a0a0` links that turn white on hover — brand plus two columns rather than the reference's four, because eFootLab has no community, social or legal pages to fill more; below 1024 px the link columns SHALL be accordions; the build stamp SHALL sit at the bottom right. It SHALL keep only eFootLab's own links (browse pages, source on GitHub, report a problem) and SHALL NOT show app-store buttons, social or community columns, or legal links eFootLab does not have.

#### Scenario: Mobile accordion
- **WHEN** the footer is shown at 390 px and the user activates the "Browse" heading
- **THEN** its links expand, the heading exposes `aria-expanded="true"`, and activating it again collapses them.

### Requirement: Buttons, Chips, Fields And Dialogs
Buttons SHALL be pills with radius 24 (small 32 px tall with 12 px horizontal padding and 14/20 px weight 500; medium 40 px); primary buttons use the accent with its foreground and secondary buttons `#272727`; the accent chip SHALL be 28 px tall with padding 4/12, radius 16, 14 px weight 500; fields SHALL be `#181818` with radius 12, a transparent border that turns `#ffffff1a` on hover and `#fafafa38` on focus; modal dialogs SHALL be `#181818` with radius 24, padding 24, an inset 1 px `#ffffff4d` hairline, a 32×32 close button at the top right and a `#00000099` backdrop; segmented controls SHALL be 32 px items with radius 24 and the active item `#474747`. On coarse pointers every interactive control SHALL keep a hit area of at least 44×44 px without enlarging its visible size — except text fields and selects, which cannot carry an invisible hit area and are therefore at least 44 px tall on coarse pointers — and no overflow clip SHALL cut such an area; where controls are packed closer than 44 px (stat rows, chips, pagination), neighbouring areas share their overlapping edge.

#### Scenario: Small button
- **WHEN** the "Max OVR" button is measured
- **THEN** it is 32 px tall with radius 24 and 14 px text of weight 500.

#### Scenario: Coarse pointer hit area
- **WHEN** a progression stepper button (18×18 visible) is used on a touch device
- **THEN** its tappable area is at least 44×44 px and its visible size is unchanged.

#### Scenario: Touch areas on a phone
- **WHEN** every visible control of the public pages (and of the open filter sheet and dialogs, the Progression sheet with "About this build" open and the manager drawer) is hit-tested at 390 and 320 px with touch emulation at its centre ± 21 px horizontally and vertically
- **THEN** every point lands on the control itself (or its label), or on a neighbouring control packed closer than 44 px — never on non-interactive content.

### Requirement: Card Tile And Captions
Player card tiles SHALL keep the single pre-composited image and its overlays, and SHALL offer caption variants: "name" (one line, 12/16 px at 80 % white, full white on hover or focus) used on home, compare and skills; "styles" (the name visually hidden but kept as the accessible name, then two centred 11/13.75 px lines with a 12 px attack or defence style icon, no bordered pills) used on `/players` and `/packs`; and "none". Every variant SHALL keep the tile's accessible name, lazy loading, the near-viewport gate and the reduced-motion behaviour.

#### Scenario: Players caption
- **WHEN** `/players` is shown
- **THEN** each tile shows two style lines without pill borders and its link's accessible name contains the player name.

### Requirement: Section Header
Home and list sections SHALL use a header with an 18/22.5 px bold H2, a 28–32 px tinted icon tile before it and, where a full list exists, a "Show all" pill at the right that links to that list.

#### Scenario: Latest Players header
- **WHEN** the home page is shown
- **THEN** "Latest Players" has an icon tile and a "Show all" pill linking to the newest-first players list.

### Requirement: Home Layout
The home page SHALL show, inside the 1152 px container, a 44 px search field with radius 12 and a trailing `/` chip (keeping the live results dropdown and the `/` focus shortcut), then "Latest Players" with 12 cards in 6 columns (3 columns below 768 px, gap 12), then "Latest Packs" with each pack's 14 px weight-500 title and 12 px muted date above a horizontal row of 112 px cards (96 px below 768 px) with name captions; it SHALL NOT show the former hero, quick-filter chips or "Latest card" aside, and SHALL NOT invent feed, comment, creator or ranking content.

#### Scenario: Home grid
- **WHEN** the home page is shown at 1440 px and at 390 px
- **THEN** "Latest Players" shows 12 cards in 6 and in 3 columns respectively, and no quick-filter chip is present.

### Requirement: Players Page Layout
`/players` SHALL show a breadcrumb, a 24/30 px H1, the sort presets as a 32 px segmented control (horizontally scrollable below 768 px) next to the field-sort select, a 44 px search field with radius 12 and the result count line; from 1024 px a sticky 280 px rail (`#181818`, radius 24, padding 16, no border) with 40 px filter rows (radius 12, a 28 px icon tile and a chevron), 34 px toggles with radius 10, 36 px range fields with radius 12, and section dividers `#ffffff0f`; the card grid SHALL have 4 columns below 768 px, 6 from 768 px, 5 from 1024 px and 6 from 1280 px with a 12 px gap; numeric pagination SHALL use 36 px pill buttons. Below 1024 px a "Filters" button SHALL open the filters as a bottom sheet with top radius 16, a grab handle and a full-width accent "Done" button. Every existing URL parameter, the 13 aria-pressed position toggles and the 50-selection limit SHALL behave as before.

#### Scenario: Grid columns
- **WHEN** `/players` is shown at 390, 768, 1024 and 1440 px
- **THEN** the grid has 4, 6, 5 and 6 columns.

#### Scenario: URL contract kept
- **WHEN** the canonical URL `/players?card=5&pos=SS&pos=CF&nat=3` is opened and a filter is changed (the CB position toggled on) and reverted (toggled off)
- **THEN** the URL returns to exactly `/players?card=5&pos=SS&pos=CF&nat=3` and the same cards are listed; and when `/players?card=5&pos=SS&pos=CF&nat=3&page=2` is opened and a filter is changed and reverted, the URL becomes `/players?card=5&pos=SS&pos=CF&nat=3`, because any filter change resets the page to 1 (the default page is omitted), as before the rebuild.

#### Scenario: Bottom sheet
- **WHEN** the Filters button is activated at 390 px
- **THEN** a bottom sheet opens with a grab handle, focus moves into it, Escape closes it and focus returns to the button.

### Requirement: Filter Dialogs
The Nation, League, Team, Skills and Stats dialogs SHALL be 608 px wide (full width minus gutters on phones) with radius 24, a 36 px search field, option rows 44 px tall with radius 12 in a three-column grid from 768 px, a close button and an accent "Done" button at the bottom right; they SHALL keep native dialog semantics and the selection limit messages, and a dialog with a search field (Nation, League, Team, Skills — and the manager drawer) SHALL open with focus in that field.

#### Scenario: Nation dialog
- **WHEN** the Nation filter is opened at 1440 px
- **THEN** the dialog is 608 px wide with radius 24 and option rows are 44 px tall in three columns.

### Requirement: Player Detail Layout
The detail page SHALL show a breadcrumb (14/20 px), the H1 with the accent overall chip and a muted 12 px note that it is the dump max without proficiency bonus, a line with position, playing style and condition; from 1024 px a 280 px left column (card face 180 px wide with the condition letter and no MAX LVL or MAX OVR badges, three 28 px round nation, club and league marks, the Progression card, Card Info, other versions with 56 px thumbnails) and a main column with one "Overview" card (`#202020`, radius 24, padding 16, inset ring) holding the description, spec line, category strip, booster buttons, stats, and skills; then Body Model and Position & Playstyle cards with the same card style. Stat rows SHALL be at least 36 px tall — 36 px when the label fits on one line; a row whose label wraps, or a narrow row (two columns at 390 px) that stacks its "+N" chips above the value instead of splitting a word, grows (52–56 px), at any width — `#272727`, radius 8, padding 6/10, with 14 px weight-500 tier-coloured labels that may wrap, and 36×(row) value pills with radius 6, 14 px bold black text on the tier fill and filled cyan "+N" booster chips; stats SHALL be in three columns from 1024 px and two below, one below 360 px. Skill chips SHALL be 14 px weight 600 with radius 8 and their tooltip/popover 288 px wide with the artwork on top. Sections for which eFootLab has no data (in-match roles, community, comments, ratings, position training) SHALL NOT appear.

#### Scenario: Stat row
- **WHEN** a detail page is shown at 1440 px
- **THEN** a stat row whose label fits on one line is 36 px tall with background `#272727` and radius 8, no row is shorter than 36 px, and the stats occupy three columns.

#### Scenario: Card face
- **WHEN** a detail page is shown at 1440 px
- **THEN** the card face is 180 px wide and shows no MAX LVL or MAX OVR badge.

#### Scenario: Stats on phone
- **WHEN** a detail page is shown at 390 px
- **THEN** the stats are in two columns and no stat name is truncated with an ellipsis; at 320 px they are in one column.

### Requirement: Progression Panel, Manager Drawer And Mobile Dock
From 1024 px the Progression card SHALL be sticky in the 280 px left column — it stays in view while the page scrolls until the end of the left column's first row group (card face, marks and Progression), so it never covers Card Info or Other Versions below it — with a header of the 14 px weight-500 title, the points, a 32 px accent "Max OVR" button and a 32 px reset icon button; a 48 px "Select Manager" trigger (`#272727`, radius 24, text `#c2f879`); the Manager Proficiency row with its value in `#01fec5`; and 42 px category rows with an 18×18 stepper and a 16 px track; explanatory notes and limits SHALL stay available behind a disclosure; Max Level, the position selector and booster toggles SHALL stay operable. The manager picker SHALL open as a bottom-anchored drawer 512 px wide with top radius 16 and 74 px rows. Below 1024 px the Progression card SHALL be replaced by a floating category strip and a dock (366×50, above the tab bar) with the proficiency chip, manager avatar, points with reset and Max OVR; activating it opens a bottom sheet with the full controls. All behaviour of the Progression engine and the manager rules SHALL be unchanged.

#### Scenario: Sticky panel
- **WHEN** a detail page of a card with a level cap above 1 is scrolled at 1440 px
- **THEN** the Progression card sticks at its top offset in the left column while the first row group scrolls past, then scrolls up with the column so that it never overlaps Card Info or Other Versions, and its category rows are 42 px tall.

#### Scenario: Manager drawer
- **WHEN** "Select Manager" is activated at 1440 px
- **THEN** a drawer 512 px wide anchored to the bottom opens with focus inside, lists the 69 managers, and Escape closes it returning focus to the trigger.

#### Scenario: Mobile dock
- **WHEN** a detail page of a card with a level cap above 1 is shown at 390 px
- **THEN** a 366×50 dock sits above the tab bar, activating it opens a bottom sheet with the proficiency control, manager selection and category steppers, and the overall shown matches the engine.

### Requirement: Compare Page
`/compare` SHALL show the breadcrumb, a 36/40 px H1, a 16/26 px muted subtitle up to 768 px wide, 36×36 swap and copy-link buttons, and a console grid of 260 px / flexible / 260 px from 768 px (two columns below) with slots 160×226 px, `#232323` (hover `#272727`), radius 16, an empty state of a 48 px circle with a plus, "Add Player" and "Search and select a player"; the picker SHALL be the search palette; the filled two-player view SHALL keep its current content restyled with the tokens.

#### Scenario: Empty compare
- **WHEN** `/compare` is opened without players at 1440 px
- **THEN** the two slots are 160×226 with radius 16 and read "Add Player".

### Requirement: Packs Page
`/packs` SHALL show the 36/40 px H1, a 16/26 px muted subtitle, stat chips 30 px tall with radius 8 that keep eFootLab's counts (distinct players and cards), and per pack a baseline header with the 14 px weight-500 title linking to the pack page and the 12 px muted date, above a grid of 4, 5, 6, 7 and 8 columns at base, 640, 768, 1024 and 1280 px with a 12 px gap and "styles" captions.

#### Scenario: Packs columns
- **WHEN** `/packs` is shown at 390 and 1440 px
- **THEN** each pack grid has 4 and 8 columns.

### Requirement: Skills Index Tiles
`/skills` SHALL keep its route and groups and show a 36/40 px H1, a 16/26 px subtitle, a search field that filters the tiles by skill name (accent-insensitive), segmented group filters, section headers with an icon tile and count, and tiles (`#181818`, radius 16, padding 14/16, inset ring, hover ring `#ffffff29`) with the name 15 px bold (`#ffd700` for Showtime, white for Classic), a two-line 13/18.85 px muted description and a cards-count chip, in 3 columns from 1280 px, 2 from 768 px and 1 below; artwork, effects and top cards SHALL remain on `/skills/[slug]`.

#### Scenario: Name search
- **WHEN** "double" is typed in the skills search
- **THEN** only skills whose name contains "double" (ignoring case and accents) remain, and clearing the field restores all tiles.

#### Scenario: Skill columns
- **WHEN** `/skills` is shown at 1440, 768 and 390 px
- **THEN** the tiles are in 3, 2 and 1 columns.

### Requirement: Search Palette
The header search palette SHALL be a 576 px wide dialog with radius 16 on `#181818` with an inset `#ffffff4d` hairline over a `#00000099` backdrop, a 45 px input row with a search icon, a clear button and the Esc chip, and result rows with a 40×56 card thumbnail, the name 14/500, a 12 px muted line of position and playing styles, and the overall at the right; it SHALL keep the 250 ms debounce, the 2-character minimum, Enter to open the full list and the placeholder "Search players by name…".

#### Scenario: Palette size
- **WHEN** the palette is opened with ⌘K at 1440 px
- **THEN** its dialog is 576 px wide with radius 16 and the placeholder reads "Search players by name…".

### Requirement: Branding In Public UI
Public pages SHALL keep the eFootLab wordmark and name and SHALL NOT name a third-party data source — "efootbase", "eFHUB" / "efhub" or "pesdb", in any case — in visible text, `title`, `aria-label`, `alt`, `placeholder`, `aria-valuetext` or the document title; explanatory copy about the progression model and its checks SHALL describe them neutrally (for example "a second public dataset"). The game's name ("eFootball") and the footer's statement that eFootLab is not affiliated with Konami are not sources and stay. Admin pages are not covered by this rule.

#### Scenario: No third-party brand
- **WHEN** the text (sr-only included) and those attributes of every public page are collected at 1440 and 390 px with every disclosure and accordion open, and again with the search palette, the manager drawer (desktop and over the phone sheet), the phone Progression sheet and a skill popover open
- **THEN** they contain no "efootbase", "eFHUB" / "efhub" or "pesdb" in any case.

### Requirement: No Regressions
After the rebuild, `pnpm typecheck` and `pnpm test` SHALL pass, the web build SHALL succeed, no page SHALL scroll horizontally from 320 to 1280 px, pages SHALL log no console error, every `data-testid` present before the change SHALL still exist, the URL contracts of `/players` SHALL be unchanged, and `/admin` SHALL render and work.

#### Scenario: Test IDs kept
- **WHEN** the set of `data-testid` values in `apps/web` is compared with the set on the base commit
- **THEN** no value is missing.

#### Scenario: No horizontal scroll
- **WHEN** each public page is shown at 320, 390, 768, 1024 and 1280 px
- **THEN** `document.documentElement.scrollWidth` equals the viewport width.
