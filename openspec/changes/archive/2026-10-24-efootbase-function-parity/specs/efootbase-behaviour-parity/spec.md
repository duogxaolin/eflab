## MODIFIED Requirements

### Requirement: Tooltip Primitive
The interface SHALL provide one tooltip behaviour for hover previews: it opens after the mouse rests on its trigger for 500 ms, opens in under 100 ms when the pointer enters another trigger less than 500 ms after a tooltip closed (warm-up), closes 100 ms after the pointer has left both the trigger and the tooltip, stays open while the pointer is over the tooltip, opens immediately on keyboard focus of the trigger and closes on blur, closes on Escape without moving focus, is exposed as `role="tooltip"` referenced by the trigger's `aria-describedby`, contains no interactive element, stays at least 8 px inside the viewport, and does not open from touch input. Delay values SHALL be defined once. These values follow the reference's measured timing (open 514–547 ms, close 104–113 ms, next trigger 25 ms, keyboard focus about 27 ms).

#### Scenario: Hover delay
- **WHEN** the mouse rests on a skill name for 400 ms and then for 600 ms
- **THEN** no preview is visible at 400 ms and the preview is visible at 600 ms.

#### Scenario: Warm-up
- **WHEN** a preview has just closed and the mouse enters another skill name within 500 ms
- **THEN** that preview opens in under 100 ms.

#### Scenario: Hoverable and dismissable
- **WHEN** the pointer moves from a skill name onto its open preview within 100 ms and then Escape is pressed
- **THEN** the preview stays open while the pointer is over it and closes on Escape while focus stays where it was.

#### Scenario: Quick close
- **WHEN** the pointer leaves a skill name with an open preview and does not enter the preview
- **THEN** the preview is no longer shown 250 ms later.

### Requirement: Stat Row Adjust Popover
Activating a stat row on a player page whose build can spend training points (click, Enter, Space, tap) SHALL open a popover titled with its training category (for example "Dexterity") containing only that category's − button, value, + button and a slider from 0 to 25, acting exactly like the Progression panel (the slider never sets a value above 25 or above what the remaining budget buys); the popover SHALL NOT show a breakdown, a next cost or the points left — the breakdown is in the "Stat breakdown" list of "About this build". Jumping SHALL show two such controls, Aerial Strength and then Goalkeeper 1, because both raise it (the reference offers only Goalkeeper 1 — recorded as an oddity not copied). When the build cannot spend points (a Highlight card with a level cap of 1 at Max Level 1, a Trending card, any other card with a level cap of 1) the stat rows SHALL be plain rows without a button role or popover. While the popover is open the stats of its category stay highlighted. Below 640 px the popover MAY be shown as a bottom sheet when taller than half the viewport.

#### Scenario: Adjust from a row
- **WHEN** the Offensive Awareness row of a card with a level cap above 1 is clicked and "+" is pressed in the popover
- **THEN** a popover named "Dexterity" is open with −, the value, + and a slider and no breakdown or cost text, the panel's Dexterity value rises by 1, the remaining points fall accordingly, and Escape returns focus to the row.

#### Scenario: Jumping
- **WHEN** the Jumping row is activated
- **THEN** the popover holds two controls, one for Aerial Strength and one for Goalkeeper 1.

#### Scenario: Plain rows at level 1
- **WHEN** a Highlight card with a level cap of 1 is shown at Max Level 1, or a Trending card is shown
- **THEN** no stat row has a button role and clicking a row opens nothing.

### Requirement: Category Hover Preview
On a player page, hovering a category item of the category strip or a category label of the Progression panel with a mouse on a hover-capable device, or giving it keyboard focus, SHALL highlight that category's stat rows in the stat grid (its rows lit, the others dimmed — the same look as the pinned highlight) for as long as the pointer or focus stays on it; leaving or blurring SHALL return the grid to the highlight of an open Adjust popover, else the pinned highlight, else none. A category strip item SHALL be a popover trigger (`aria-haspopup="dialog"`, `aria-expanded`): click, Enter, Space or tap SHALL open that category's Adjust popover (240 px wide: the category name, −, value, + and the 0–25 slider) with its stats highlighted; while it is open, hovering other strip items SHALL NOT change the highlight; activating the same item again SHALL close it; Escape SHALL close it and return focus to the item; a click outside SHALL close it and clear its highlight. A Progression panel category label SHALL keep the pin: click, Enter or Space toggles the pinned highlight and `aria-pressed` reflects the pinned state only; a touch tap on a label toggles the pin without a preview. Under reduced motion the highlight SHALL change without a transition.

#### Scenario: Hover previews, click pins
- **WHEN** the mouse rests on the Dribbling item of the category strip and then leaves it, and then the Dexterity label of the Progression panel is clicked and the pointer leaves it
- **THEN** the Dribbling, Ball Control and Tight Possession rows are lit within one frame with every other row dimmed while the pointer is on the item, no row is lit after it leaves, and the Dexterity label is `aria-pressed="true"` with its rows still lit after the pointer leaves.

#### Scenario: Preview over a pinned category
- **WHEN** Dribbling is pinned by a click on its panel label and the mouse then rests on the Passing strip item and leaves it
- **THEN** the Passing rows are lit while the pointer is on Passing, Dribbling stays the only pressed label, and after the pointer leaves the Dribbling rows are lit again.

#### Scenario: Keyboard focus previews
- **WHEN** keyboard focus moves onto a category item or a Progression category label
- **THEN** that category's rows are lit until focus moves on; Enter on a strip item opens its Adjust popover, and Enter or Space on a label pins or unpins it.

#### Scenario: Strip item opens the Adjust popover
- **WHEN** the Dribbling strip item is clicked, the mouse then rests on the Passing item, the Dribbling item is clicked again, it is reopened and a click lands outside it
- **THEN** a popover named "Dribbling" with −, the value, + and a slider opens with the Dribbling rows lit, the Dribbling rows stay lit while Passing is hovered, the second click closes it, and the outside click closes it and leaves no row lit.

### Requirement: No Information Only In Title
Stat rows, pitch tiles, the category strip, the Progression panel's category labels and booster buttons SHALL NOT carry information only in a `title` attribute: stat breakdowns live in the "Stat breakdown" list of the "About this build" disclosure (one row per stat with base, training, the part cut at 99, proficiency, boosters, manager and the shown value, reachable by mouse, keyboard and touch), pitch tiles carry an accessible name with the position, value and proficiency ("fully proficient", "half proficient" or "not proficient" — for example "LWF, 104 OVR, half proficient"), a category label's stats are its screen-reader description and are listed visibly under "About this build", and booster buttons show readable stat names (for example "+5 · Dribbling, Tight Possession, Speed, Balance") with their on/off state, and a Trending booster's level, shown by an icon or level bars as well as colour.

#### Scenario: No title data
- **WHEN** a detail page is inspected
- **THEN** no stat row, pitch tile, Progression category label or booster button has a `title` attribute, no booster label contains a raw abbreviation such as "TightPoss", and the "Stat breakdown" list in "About this build" shows a row for each of the 26 stats.

### Requirement: Players Paging, Search And Filters
`/players` SHALL show 72 cards per page with numbered pages; a text search SHALL run only from 3 characters (one shared minimum with the palette and home search), 500 ms after the last keystroke, matching the card name or its pack / campaign name, with a hint below the field at 1 or 2 characters while the previous results stay; a 1- or 2-character `search` value in a link SHALL fill the field without filtering; a page number beyond the last page SHALL be replaced by the last page with a polite message; the count line SHALL use "card" for one result; range fields SHALL keep a value being typed in one field when the other commits, and a minimum above the maximum SHALL NOT be applied but shown as an inline "Min is above Max" message with `aria-invalid` on both fields; the Nation dialog SHALL list, without group headings, England, France, Spain, Brazil, Argentina, Germany, Italy, Netherlands, Portugal and Belgium first in that order (matched by stored name — the reference's fixed list) and then every other nation once, A–Z; choosing Name sort SHALL default to ascending order on the accent-free normalised name, and numeric fields SHALL default to descending. A name-type sort (`sort=name`, `namePrint`, `japName` or `chineseName`) in a URL without `order` SHALL mean ascending (A→Z) — an intentional change of that URL's meaning, which was Z→A before change `efootbase-behaviour-parity`; `order=desc` gives Z→A.

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

#### Scenario: Three characters
- **WHEN** "me" is typed and then "mes"
- **THEN** after "me" the list is unchanged and a hint asks for at least 3 characters, and about 500 ms after "mes" the list shows the cards whose name or pack name contains "mes".

#### Scenario: Nation order
- **WHEN** the Nation dialog is opened
- **THEN** its first ten options are England, France, Spain, Brazil, Argentina, Germany, Italy, Netherlands, Portugal and Belgium, followed by the other nations A–Z, and no nation appears twice.

### Requirement: Player Search Ranking
The player search used by the palette, the home search and the compare picker SHALL match the normalised query (accents and case folded, special characters matched literally) as a contiguous substring of the card's normalised name or of its pack / campaign name (the stored pack the card belongs to), and of the Japanese or Chinese name for a query with non-ASCII characters; it SHALL require at least 3 characters, SHALL have no fuzzy (trigram-similarity) tier and no word-order matching, and SHALL order the results by max overall descending, then card id descending, in pages of 12 with an indication whether more exist. The word-start lift inside each page is done by the result lists (see efootbase-function-parity "Search Result Lists"). The name part SHALL stay backed by the name trigram index and the pack part by the pack-card key, so a typical query runs in under 50 ms server-side.

#### Scenario: Ronaldo
- **WHEN** "ronaldo" is searched
- **THEN** "Cristiano Ronaldo" appears within the first three results.

#### Scenario: Whole word before word start
- **WHEN** "ronald" is searched
- **THEN** the results follow max overall then card id, whether "ronald" is a whole word or starts a word: Cristiano Ronaldo (103), Ronaldinho Gaúcho (102) and Ronald Koeman (102) come first, and whole-word matches are no longer listed before word-start matches.

#### Scenario: Pack name
- **WHEN** "cote" is searched
- **THEN** 7 cards are found, among them Didier Drogba 88040387251713 from the pack "Côte d'Ivoire 2006", whose name does not contain "cote".

#### Scenario: Reversed words
- **WHEN** "messi lionel" is searched
- **THEN** no result is returned.

### Requirement: Focus Is Never Lost
After expanding Other Versions with "+N", focus SHALL move to the first newly shown version with a polite announcement; after removing a compare slot, focus SHALL move to the "Add Player" button of the slot that was removed (the other card stays in its slot).

#### Scenario: Expand versions
- **WHEN** "+N" is activated by keyboard
- **THEN** focus is on the first newly shown version link.

#### Scenario: Remove slot
- **WHEN** "Remove" is activated on a compare slot
- **THEN** focus is on that slot's "Add Player" button and the other slot still shows its card.

### Requirement: Compare Guards
The compare picker SHALL list every card, including the card already in the other slot, and picking that card SHALL fill the slot, so one card can be compared with itself under two builds; `left` or `right` ids that are malformed or not found SHALL be dropped, the URL replaced without them and a polite message shown; a legacy `?ids=a,b` link SHALL be read as `left=a&right=b` and rewritten; below 768 px the slots SHALL use the plain card face without detail overlays.

#### Scenario: Duplicate pick
- **WHEN** slot 1 holds a card and the picker for slot 2 searches for it
- **THEN** its row is enabled without any "In slot" text, and picking it gives `?left=<id>&right=<id>` with two independent builds.

#### Scenario: Bad id
- **WHEN** `/compare?left=1&right=<valid id>` is opened
- **THEN** the URL becomes `/compare?right=<valid id>` and a message says a card was not found.

### Requirement: Skills Search And URL State
The skills search on `/wiki/skills` SHALL ignore hyphens, dashes, slashes and underscores in both the query and the names; the group filter (Showtime or Classic) and the search text SHALL live in the URL (`group`, `q`, replaced not pushed) and be restored on reload, an old `group=other` being dropped; the skill page SHALL NOT page its top cards, and an old `page` parameter on it SHALL be removed from the URL.

#### Scenario: Hyphen
- **WHEN** "one touch" is searched on `/wiki/skills`
- **THEN** "One-touch Pass" is listed.

#### Scenario: Group on reload
- **WHEN** the Classic group is chosen on `/wiki/skills` and the page is reloaded
- **THEN** the Classic group is still selected.

### Requirement: Behaviour Regression Guards
After this change `pnpm typecheck`, `pnpm test` (including smoke checks for the search rule, the max-overall sorts, the registered-position filter, the compare data and the skill top cards) and `pnpm --filter @eflab/shared test` SHALL pass, the web build SHALL succeed, no public page SHALL scroll horizontally from 320 to 1440 px or log a console error, every `data-testid` of the base commit SHALL still exist except those of controls this change removes (listed in its design), and the `/players` URL contract SHALL be the one of catalog-browsing-parity "Page State Lives in the URL", which still reads every older eFootLab link.

#### Scenario: Gates
- **WHEN** the checks above are run on the final build
- **THEN** all of them pass.
