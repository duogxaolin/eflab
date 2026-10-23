# efootbase-behaviour-parity Specification

## Purpose
Defines how the eFootLab web interface behaves when people use it — hover previews, popovers, dialogs, pinned regions, paging, search and URL state — so that it works like the efootbase.com reference captured on 2026-10-20 while staying usable by keyboard, touch and screen readers.
## Requirements
### Requirement: Tooltip Primitive
The interface SHALL provide one tooltip behaviour for hover previews: it opens after the mouse rests on its trigger for 1500 ms, opens without delay when another tooltip closed less than 500 ms earlier, closes 500 ms after the pointer has left both the trigger and the tooltip, stays open while the pointer is over the tooltip, opens immediately on keyboard focus of the trigger and closes on blur, closes on Escape without moving focus, is exposed as `role="tooltip"` referenced by the trigger's `aria-describedby`, contains no interactive element, stays at least 8 px inside the viewport, and does not open from touch input. Delay values SHALL be defined once.

#### Scenario: Hover delay
- **WHEN** the mouse rests on a skill name for 1400 ms and then for 1600 ms
- **THEN** no preview is visible at 1400 ms and the preview is visible at 1600 ms.

#### Scenario: Warm-up
- **WHEN** a preview has just closed and the mouse enters another skill name within 500 ms
- **THEN** that preview opens in under 100 ms.

#### Scenario: Hoverable and dismissable
- **WHEN** the pointer moves from a skill name onto its open preview and then Escape is pressed
- **THEN** the preview stays open while the pointer is over it and closes on Escape while focus stays where it was.

### Requirement: Popover Primitive
The interface SHALL provide one click popover behaviour: activating its trigger (click, Enter, Space, tap) toggles a non-modal `role="dialog"` named by its heading, the trigger exposes `aria-haspopup="dialog"` and `aria-expanded`, focus moves to the popover's primary control (its first control unless the popover names one), Escape or a click outside closes it and returns focus to the trigger, and it stays at least 8 px inside the viewport, scrolling inside itself when taller than the viewport.

#### Scenario: Keyboard toggle
- **WHEN** a keyboard user focuses a popover trigger and presses Enter, then Escape
- **THEN** the popover opens with focus inside and `aria-expanded="true"`, and Escape closes it and returns focus to the trigger with `aria-expanded="false"`.

### Requirement: Dialog Behaviour
Every modal dialog, drawer and sheet SHALL close on a single Escape even when a search field inside it holds text, unless a control inside already handled that Escape (for example a Max Level draft reverting); when a drawer is open over a sheet, Escape SHALL close only the drawer; search fields of the filter dialogs and of the manager drawer SHALL stay pinned at the top of the dialog while its list scrolls; drawers and sheets SHALL slide in and out over 250 ms with `cubic-bezier(.32,.72,0,1)` and appear instantly under reduced motion.

#### Scenario: One Escape with text
- **WHEN** the Nation dialog is open, "bra" is typed in its search field and Escape is pressed once
- **THEN** the dialog closes and focus returns to the Nation row.

#### Scenario: Pinned dialog search
- **WHEN** the Nation dialog's list is scrolled by 600 px
- **THEN** the search field's top position is unchanged within 2 px.

#### Scenario: Drawer over sheet
- **WHEN** on a 390 px phone the manager drawer is open over the Progression sheet and Escape is pressed
- **THEN** the drawer closes and the sheet stays open.

### Requirement: Skill Links And Previews
On player pages each skill name (in the Skills section and in the Overview paragraph) SHALL be a link to its skill page; mouse hover and keyboard focus SHALL show a 288 px preview (artwork on top, letterboxed, the name in 14 px weight 600 — gold for Showtime — the description, and the stored effects and activation when known); a mouse click or Enter SHALL navigate; on touch devices the first tap SHALL open a popover with the same content and a "Skill page and cards" link, and tapping that link SHALL navigate.

#### Scenario: Hover then click
- **WHEN** a mouse user hovers a skill name for 1.6 s and then clicks it
- **THEN** a 288 px preview with the artwork on top is shown, and the click opens that skill's page.

#### Scenario: Touch
- **WHEN** on a touch device a skill name is tapped once
- **THEN** the URL does not change and a popover with the skill content and a link to its page is shown; tapping the link opens the skill page.

### Requirement: Stat Row Adjust Popover
Activating a stat row on a player page (click, Enter, Space, tap) SHALL open a popover titled with its training category (for example "Dexterity") containing that category's −/+ stepper and spinbutton (the same actions as the Progression panel), the next cost and the points left, and the stat's breakdown (base, training, cut at 99, proficiency, boosters, manager); Jumping SHALL show two steppers (Aerial Strength and Goalkeeper 1); for a card with a level cap of 1 the popover SHALL show the breakdown only, titled with the stat; while it is open the stats of that category stay highlighted. Below 640 px the popover MAY be shown as a bottom sheet when taller than half the viewport.

#### Scenario: Adjust from a row
- **WHEN** the Offensive Awareness row of a card with a level cap above 1 is clicked and "+" is pressed in the popover
- **THEN** a popover named "Dexterity" is open, the panel's Dexterity value rises by 1, the remaining points fall accordingly, and Escape returns focus to the row.

#### Scenario: Jumping
- **WHEN** the Jumping row is activated
- **THEN** the popover holds two steppers, one for Aerial Strength and one for Goalkeeper 1.

### Requirement: Inline Playstyle And Skill Triggers
The hero line and the Overview paragraph SHALL present the card's playing styles as triggers that show their description (hover/focus tooltip; click, Enter, Space or tap toggles a popover with the same text), and the Overview paragraph SHALL link at most two skills (Showtime first) as skill links and end with "and other N player skills" ("skill" when N is 1) when more exist.

#### Scenario: Overview links
- **WHEN** a card with ten skills is opened
- **THEN** the Overview paragraph contains one or two skill links and ends with "and other 8 player skills" or "and other 9 player skills" accordingly.

### Requirement: No Information Only In Title
Stat rows, pitch tiles, the category strip, the Progression panel's category labels and booster buttons SHALL NOT carry information only in a `title` attribute: stat breakdowns live in the Adjust popover, pitch tiles carry screen-reader text of the proficiency ("fully proficient", "half proficient" or "not proficient") and value, a category label's stats are its screen-reader description and are listed visibly under "About this build", and booster buttons show readable stat names (for example "+5 · Dribbling, Tight Possession, Speed, Balance") with their on/off state shown by an icon as well as colour.

#### Scenario: No title data
- **WHEN** a detail page is inspected
- **THEN** no stat row, pitch tile, Progression category label or booster button has a `title` attribute, and no booster label contains a raw abbreviation such as "TightPoss".

### Requirement: Card Face Position
When the selected position differs from the registered one, the detail card face SHALL show the overall at the selected position together with that position's label, and its accessible name SHALL name the same position.

#### Scenario: Selected position on the face
- **WHEN** the position selector is set to CF on a card registered at RWF
- **THEN** the face reads the CF overall with the label "CF".

### Requirement: Players Paging, Search And Filters
`/players` SHALL show 72 cards per page with numbered pages; a text search SHALL run only from 2 characters (one shared minimum with the palette and home search), with a hint below the field at 1 character while the previous results stay; a page number beyond the last page SHALL be replaced by the last page with a polite message; the count line SHALL use "card" for one result; range fields SHALL keep a value being typed in one field when the other commits, and a minimum above the maximum SHALL NOT be applied but shown as an inline "Min is above Max" message with `aria-invalid` on both fields; the Nation dialog SHALL list the ten nations with the most cards under "Popular" before all nations A–Z; choosing Name sort SHALL default to ascending order on the accent-free normalised name, and numeric fields SHALL default to descending. A name-type sort (`sort=name`, `namePrint`, `japName` or `chineseName`) in a URL without `order` SHALL mean ascending (A→Z) — an intentional change of that URL's meaning, which was Z→A before this change; `order=desc` gives Z→A.

#### Scenario: Range typing
- **WHEN** the Age minimum is set to 20, Tab is pressed and 25 is typed at once into the maximum
- **THEN** the maximum keeps "25" and the URL becomes `age=20-25`.

#### Scenario: Inverted range
- **WHEN** Base overall minimum 90 and maximum 80 are entered
- **THEN** the URL does not change, both fields are marked invalid and "Min is above Max" is shown.

#### Scenario: Out-of-range page
- **WHEN** `/players?page=99999` is opened
- **THEN** the URL is replaced by the last page and a polite message names it.

#### Scenario: Name sort
- **WHEN** Name sort is chosen
- **THEN** the first card's normalised name sorts before the second's (A to Z).

### Requirement: Player Search Ranking
The player search used by the palette, the home search and the compare picker SHALL rank its results in these tiers, in this order: names in which the query is a whole word, names in which the query starts a word without ending it, names that contain the query anywhere else, Japanese or Chinese names that contain it (non-ASCII queries), and fuzzy (trigram-similar) names. Within each of the first four tiers higher max overall SHALL come first; within the fuzzy tier the closer spelling (higher similarity) SHALL come first and max overall only after it — deliberately, because a near-miss spelling is only useful when it is close. Matching SHALL be accent- and case-insensitive, the query SHALL be matched literally (special characters escaped), and the search SHALL stay backed by the name trigram index.

#### Scenario: Ronaldo
- **WHEN** "ronaldo" is searched
- **THEN** "Cristiano Ronaldo" appears within the first three results.

#### Scenario: Whole word before word start
- **WHEN** "ronald" is searched
- **THEN** every result in which "ronald" is a whole word (for example "Ronald Koeman") is listed before every result in which it only starts a word (for example "Ronaldinho Gaúcho" or "Cristiano Ronaldo"), whatever their max overall.

### Requirement: Home Search Combobox
The home search SHALL follow the combobox pattern: Down and Up move the active option (`aria-activedescendant`) through the results, Enter on an active option opens that card and Enter without one opens the full search list, the first Escape closes the list and keeps the text, and a second Escape clears it.

#### Scenario: Arrow keys
- **WHEN** "messi" is typed, Down is pressed and then Enter
- **THEN** the first result is active (`aria-activedescendant` set) and Enter opens that card's page.

### Requirement: Focus Is Never Lost
After expanding Other Versions with "+N", focus SHALL move to the first newly shown version with a polite announcement; after removing a compare slot, focus SHALL move to the "Add Player" button of the slot that became empty (the remaining cards close up, so removing slot 1 of two empties slot 2).

#### Scenario: Expand versions
- **WHEN** "+N" is activated by keyboard
- **THEN** focus is on the first newly shown version link.

#### Scenario: Remove slot
- **WHEN** "Remove" is activated on a compare slot
- **THEN** focus is on the empty slot's "Add Player" button.

### Requirement: Compare Guards
The compare picker SHALL NOT let the card already in the other slot be picked (its row is disabled with the text "In slot N"); ids in `?ids` that are malformed or not found SHALL be dropped, the URL replaced without them and a polite message shown; below 768 px the slots SHALL use the plain card face without detail overlays.

#### Scenario: Duplicate pick
- **WHEN** slot 1 holds a card and the picker for slot 2 searches for it
- **THEN** its row is disabled and reads "In slot 1".

#### Scenario: Bad id
- **WHEN** `/compare?ids=1,<valid id>` is opened
- **THEN** the URL becomes `/compare?ids=<valid id>` and a message says a card was not found.

### Requirement: Skills Search And URL State
The skills search SHALL ignore hyphens, dashes, slashes and underscores in both the query and the names; the group filter and the search text SHALL live in the URL (`group`, `q`, replaced not pushed) and be restored on reload; the skill page's top-cards page SHALL live in the URL (`page`) and be clamped to the last page.

#### Scenario: Hyphen
- **WHEN** "one touch" is searched on `/skills`
- **THEN** "One-touch Pass" is listed.

#### Scenario: Group on reload
- **WHEN** the Classic group is chosen and the page is reloaded
- **THEN** the Classic group is still selected.

### Requirement: Behaviour Regression Guards
After this change `pnpm typecheck`, `pnpm test` (including new smoke checks for search ranking and name order) and `pnpm --filter @eflab/shared test` SHALL pass, the web build SHALL succeed, no public page SHALL scroll horizontally from 320 to 1440 px or log a console error, every `data-testid` of the base commit SHALL still exist, and the `/players` URL contract SHALL be unchanged except the documented name-sort default (an order-less name-type sort now means A→Z, see "Players Paging, Search And Filters").

#### Scenario: Gates
- **WHEN** the checks above are run on the final build
- **THEN** all of them pass.

