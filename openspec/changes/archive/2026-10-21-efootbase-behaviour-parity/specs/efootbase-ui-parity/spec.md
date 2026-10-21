## MODIFIED Requirements

### Requirement: Progression Panel, Manager Drawer And Mobile Dock
From 1024 px the Progression card SHALL be pinned at a 64 px top offset in the 280 px left column while the two-column area still extends below the card; at the end of that area it SHALL scroll up with it and SHALL never overlap Card Info or Other Versions (a pinned card cannot stay at 64 px past the point where its bottom meets the end of the column without covering what follows); it SHALL fit a 1440×900 viewport without an inner scrollbar (at most 819 px tall) by holding only the header (14 px weight-500 title, the points, a 32 px accent "Max OVR" button and a 32 px reset icon button), a 48 px "Select Manager" trigger (`#272727`, radius 24, text `#c2f879`), the Manager Proficiency row with its value in `#01fec5`, and 42 px category rows with an 18×18 stepper, a 16 px track and the visible next cost. Max Level, the position selector, the estimate at the selected position and the "About this build" disclosure (explanatory notes and limits) SHALL live in a non-sticky "Build settings" card at the end of the left column, below the pinned card's travel (the pinned card moves only above it and never covers it), and Card Info and Other Versions SHALL sit in a full-width row below the two-column layout so the pinned card never covers them; booster toggles stay in the Overview card. The manager picker SHALL open as a bottom-anchored drawer 512 px wide with top radius 16 and 74 px rows. Below 1024 px the Progression card SHALL be replaced by a floating category strip and a dock (366×50, above the tab bar) with the proficiency chip, manager avatar, points with reset and Max OVR; the proficiency chip and the avatar open a small non-modal popover above the dock (manager selection and the proficiency control with 36 px −/+ buttons), and the strip, the points and the Progression button open a bottom sheet with the full controls scrolled to the categories. All behaviour of the Progression engine and the manager rules SHALL be unchanged. The pin cannot hold while the left column is longer than the main column (for example with the "About this build" disclosure open): the Progression card then scrolls with the column instead of staying at 64 px.

#### Scenario: Sticky panel
- **WHEN** the detail page of a card with a level cap above 1 (Messi, `/players/7511/89136409091415`), with the "About this build" disclosure closed, is scrolled at 1440×900 to 1000 and to 1500 px, and then on to the end of the page
- **THEN** at 1000 and 1500 px the Progression card's top is at 64 ± 1 px; it has no inner scrollbar; at no scroll position does it overlap the Build settings card, Card Info or Other Versions (at the end of the two-column area it has scrolled up with the column); and its category rows are 42 px tall.

#### Scenario: Manager drawer
- **WHEN** "Select Manager" is activated at 1440 px
- **THEN** a drawer 512 px wide anchored to the bottom opens with focus in its search field, lists the 69 managers, and one Escape closes it returning focus to the trigger even when the search field holds text.

#### Scenario: Mobile dock
- **WHEN** a detail page of a card with a level cap above 1 is shown at 390 px and the proficiency chip in the dock is tapped
- **THEN** a non-modal popover appears above the dock with the manager selection and the proficiency control; tapping "+" changes the proficiency by 1; Escape or a tap outside closes it and returns focus to the chip; tapping the category strip instead opens the bottom sheet with the category rows in view, and the overall shown matches the engine.

### Requirement: Players Page Layout
`/players` SHALL show a breadcrumb, a 24/30 px H1, the sort presets as a 32 px segmented control (horizontally scrollable below 768 px) next to the field-sort select, a 44 px search field with radius 12 and the result count line; from 1024 px a sticky 280 px rail (`#181818`, radius 24, padding 16, no border) with 40 px filter rows (radius 12, a 28 px icon tile and a chevron), 34 px toggles with radius 10, 36 px range fields with radius 12, and section dividers `#ffffff0f`; the card grid SHALL show 72 cards per page and have 4 columns below 768 px, 6 from 768 px, 5 from 1024 px and 6 from 1280 px with a 12 px gap; numeric pagination SHALL use 36 px pill buttons. Below 1024 px a "Filters" button SHALL open the filters as a bottom sheet with top radius 16, a grab handle and a full-width accent "Done" button. Every existing URL parameter, the 13 aria-pressed position toggles and the 50-selection limit SHALL behave as before, except the documented name-sort default: a name-type sort without `order` now means ascending (A→Z) instead of Z→A (efootbase-behaviour-parity "Players Paging, Search And Filters").

#### Scenario: Grid columns
- **WHEN** `/players` is shown at 390, 768, 1024 and 1440 px
- **THEN** the grid has 4, 6, 5 and 6 columns, page 1 shows 72 cards, and at 1440×900 scrolled to 1500 px the rail's top is 96 ± 1 px.

#### Scenario: URL contract kept
- **WHEN** the canonical URL `/players?card=5&pos=SS&pos=CF&nat=3` is opened and a filter is changed (the CB position toggled on) and reverted (toggled off)
- **THEN** the URL returns to exactly `/players?card=5&pos=SS&pos=CF&nat=3` and the same cards are listed; and when `/players?card=5&pos=SS&pos=CF&nat=3&page=2` is opened and a filter is changed and reverted, the URL becomes `/players?card=5&pos=SS&pos=CF&nat=3`, because any filter change resets the page to 1 (the default page is omitted), as before the rebuild.

#### Scenario: Bottom sheet
- **WHEN** the Filters button is activated at 390 px
- **THEN** a bottom sheet opens with a grab handle, focus moves into it, Escape closes it and focus returns to the button.

### Requirement: Home Layout
The home page SHALL show, inside the 1152 px container, a 44 px search field with radius 12 and a trailing `/` chip (keeping the live results dropdown and the `/` focus shortcut), then "Latest Players" with 12 cards in 6 columns (3 columns below 768 px, gap 12), then "Latest Packs" with each pack's 14 px weight-500 title and 12 px muted date above a horizontal row of 112 px cards (96 px below 768 px) with name captions; pack rows SHALL NOT scroll by themselves and SHALL offer previous/next arrow buttons that appear on hover and on focus within the row and are always visible on devices without hover; it SHALL NOT show the former hero, quick-filter chips or "Latest card" aside, and SHALL NOT invent feed, comment, creator or ranking content.

#### Scenario: Home grid
- **WHEN** the home page is shown at 1440 px and at 390 px
- **THEN** "Latest Players" shows 12 cards in 6 and in 3 columns respectively, and no quick-filter chip is present.

#### Scenario: Pack rows stay still
- **WHEN** the home page is left untouched for 7 seconds
- **THEN** no pack row changes its scroll position, and activating a row's next arrow scrolls it forward.

### Requirement: Player Detail Layout
The detail page SHALL show a breadcrumb (14/20 px), the H1 with the accent overall chip and a muted 12 px note that it is the dump max without proficiency bonus, a line with position, playing-style triggers and condition; from 1024 px a 280 px left column (card face 180 px wide with the condition letter and no MAX LVL or MAX OVR badges, three 28 px round nation, club and league marks, the pinned Progression card and the Build settings card) and a main column with one "Overview" card (`#202020`, radius 24, padding 16, inset ring) holding the description, spec line, category strip, booster buttons, stats, and skills, plus a 32×32 Compare shortcut in its heading; then Body Model and Position & Playstyle cards with the same card style; Card Info and Other Versions (56 px thumbnails) sit in a full-width row below. Stat rows SHALL be at least 36 px tall — 36 px when the label fits on one line; a row whose label wraps, or a narrow row (two columns at 390 px) that stacks its "+N" chips above the value instead of splitting a word, grows (52–56 px), at any width — `#272727`, radius 8, padding 6/10, with 14 px weight-500 tier-coloured labels that may wrap, and 36×(row) value pills with radius 6, 14 px bold black text on the tier fill and filled cyan "+N" booster chips; activating a stat row SHALL open its Adjust popover; stats SHALL be in three columns from 1024 px and two below, one below 360 px. Skill names SHALL be 14 px weight-600 links with radius 8 and a 288 px preview with the artwork on top. Sections for which eFootLab has no data (in-match roles, community, comments, ratings, position training) SHALL NOT appear.

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
