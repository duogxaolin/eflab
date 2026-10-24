## ADDED Requirements

### Requirement: Build State In The Card URL
The player page SHALL keep the current build in its query string and restore it from a link. The parameters are `sho`, `pas`, `dri`, `dex`, `lbs`, `aer`, `def`, `gk1`, `gk2`, `gk3` (stat points bought in Shooting, Passing, Dribbling, Dexterity, Lower Body Strength, Aerial Strength, Defending and Goalkeeper 1–3), `pts=0` (a build without any category point), `ml` (Max Level), `mp` (Manager Proficiency, only when no manager is selected and the value is not 90), `mgr` (selected manager id), `b1` (`0` = Booster 1 off; `1` or `2` = the level of a Trending card's Booster 1), `b2` (slug of a chosen second booster) and `b2l=0` (the card's own Booster 2 off). `ml` SHALL be written for a Highlight card with a level cap of 1 when it is above 1, and for a card with a level cap above 1 when it is below the cap. The opening state SHALL write no query. Any other state SHALL be written with `history.replaceState` (no new history entry, no navigation, no server request) in the fixed order `sho pas dri dex lbs aer def gk1 gk2 gk3 pts ml mp mgr b1 b2 b2l`, listing every category that holds at least one point and writing `pts=0` whenever no category holds a point. When the page loads with a query: if neither a category parameter nor `pts=0` is present, the categories SHALL be the card's opening allocation for the link's Max Level (the Max-OVR allocation for a card with a level cap above 1; no point for a Highlight card with a level cap of 1, whose panel opens empty); otherwise every category without a parameter SHALL be 0. Values SHALL be corrected, never trusted: a category value is an integer 0–25 (a larger integer becomes 25, a negative, fractional or non-numeric value becomes 0); when the categories cost more than the budget they SHALL be cut in category order, each to what the remaining budget buys; `ml` SHALL be limited to its range, `mp` to 70–90; an unknown `mgr`, a `b1` level the card does not have, an unknown `b2` slug or a `b2` on a card with its own Booster 2, and a `b2l` other than 0 SHALL be dropped. When anything was corrected, the URL SHALL be replaced with the corrected build at once and a polite live message SHALL say that the link's build was adjusted to fit the card. The selected position SHALL NOT be written to the URL.

#### Scenario: Reload keeps a custom build
- **WHEN** on `/players/4526/88045487395246` (Ricardo Quaresma, level cap 31) the user presses Reset and then "+" on Dribbling three times, and reloads the page
- **THEN** after the last "+" the URL query is `?dri=3`, and after the reload the panel reads "3/60 pts" with Dribbling 3 and every other category 0.

#### Scenario: Proficiency on the opening allocation
- **WHEN** on the same card without a remembered manager the Manager Proficiency control is moved from 90 to 85
- **THEN** the URL query becomes `?sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&mp=85`.

#### Scenario: Reset
- **WHEN** Reset is pressed on the same card at proficiency 90 with no manager
- **THEN** the URL query becomes `?pts=0` and the panel reads "0/60 pts".

#### Scenario: Deep link restores every part
- **WHEN** `/players/35496/88045755861672?sho=2&pas=3&dri=4&dex=5&lbs=6&aer=1&def=2&gk1=1&gk3=1&mp=80&b1=0&b2l=0` is opened in a fresh browser profile
- **THEN** the categories read 2, 3, 4, 5, 6, 1, 2, 1, 0, 1, the proficiency reads 80, Booster 1 and the card's own Booster 2 are off, the URL is unchanged, and the card face equals the engine's overall for that build.

#### Scenario: Over-budget link is corrected and announced
- **WHEN** `/players/152205/105588818334349?sho=25&dri=27&dex=25&mgr=17593528325190` (level cap 73, 144 pts) is opened
- **THEN** the build becomes Shooting 25, Dribbling 18, Dexterity 3 ("144/144 pts") with that manager, the URL is replaced with `?sho=25&dri=18&dex=3&mgr=17593528325190`, and a polite message says the link's build was adjusted.

#### Scenario: Link without categories
- **WHEN** `/players/4526/88045487395246?mp=85` is opened
- **THEN** the categories are the opening Max-OVR allocation (4/4/12/9/8/1) at proficiency 85 — eFootLab's rule; the reference loads a zero build for such a link (recorded as a reference oddity not copied).

### Requirement: Remembered Manager
Choosing a manager on a player page SHALL store its id in the browser under `eflab:selected-manager`; deselecting it (choosing it again or "Clear") and moving the Manager Proficiency control SHALL remove the stored id. When a player page opens without any build parameter, the page SHALL, after it has mounted, select the stored manager if its id is one of the picker managers (proficiency set to its rating, its "+1" pills applied), without writing the URL; a stored id that is not a picker manager SHALL be removed. When the page opens with build parameters, the URL alone SHALL decide: `mgr` selects that manager without storing it, and a link without `mgr` has no manager. When storage holds an id the picker list SHALL be requested on page load; otherwise on the first opening of the picker. Storage that is unavailable or throws SHALL leave the page working without a remembered manager. The compare page SHALL neither read nor write the stored manager.

#### Scenario: Manager follows to another card
- **WHEN** Roberto Martínez (17606144688129) is chosen on `/players/4526/88045487395246` and then `/players/7511/89136409091415` (Lionel Messi) is opened
- **THEN** Messi opens with Roberto Martínez selected, Manager Proficiency 90, Finishing and Offensive Awareness +1, the card face reads 109, and the URL has no query.

#### Scenario: Deselect forgets
- **WHEN** the remembered manager is chosen again in the picker and another card is then opened
- **THEN** the proficiency returns to 90 at once, the stored id is gone and the other card opens with no manager.

#### Scenario: Manager from a link is not stored
- **WHEN** a fresh profile opens `/players/152205/105588818334349?mgr=17593528325190`
- **THEN** that manager is selected at its rating 83 and `eflab:selected-manager` is not written.

#### Scenario: Storage blocked
- **WHEN** reading browser storage throws
- **THEN** the page renders, the picker works and no error is logged.

### Requirement: Second Booster Choice
On a card with a level cap above 1 whose Booster 2 is absent or has no stat data, the booster row SHALL show a muted "Select Booster" slot instead of a "(no stat data)" label; on a card with a level cap of 1 such a Booster 2 SHALL show no slot (the reference showed no second slot on the four level-cap-1 cards surveyed — two Highlight, two Trending — so whether a second booster can be chosen there is not measured). Activating it SHALL open a bottom drawer titled "Select second booster" with a short subtitle, a search field (focused on open; filters by booster name or stat name, ignoring case and accents) pinned above a list of the 29 basic "+1" boosters in alphabetical order, each with its four stat names; the list SHALL come from the committed booster fixture's basic boosters (ids 1–29) through the API, not from a list typed in the web code. Choosing a booster SHALL close the drawer, return focus to the slot, add +1 to each of its four stats after the cut at 99 (like Booster 1), show the chips like other booster chips, count as a custom build and write `b2=<slug>`; the slug is the name without its trailing " +1", in lower case, with apostrophes removed and every other run of characters that are not letters or digits replaced by "-", followed by "1" (`Striker's Instinct +1` → `strikers-instinct1`, the reference's slug). Reopening SHALL show the chosen booster first, highlighted, with a "Clear" button; "Clear" or choosing it again SHALL remove it. Reset and Max OVR SHALL keep it. The choice SHALL NOT be remembered for other cards or after a reload except through the URL. The drawer SHALL follow the dialog rules (accessible name, focus trap, one Escape closes it even with text in the search field, focus return).

#### Scenario: Choose Striker's Instinct
- **WHEN** on `/players/4526/88045487395246` "Select Booster" is activated and "Striker's Instinct +1" is chosen
- **THEN** Offensive Awareness, Ball Control, Finishing and Acceleration each gain 1, the card face reads 105 (was 104), the tiles read LWF 105, RWF 105, CF 79, SS 83, AMF 82, DMF 65 and LMF, RMF 104, LB, RB 73, CMF 76, CB 57, GK 40, the header pill still reads 100 OVR, and the URL query is `?sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&b2=strikers-instinct1`.

#### Scenario: With Booster 1 off
- **WHEN** Booster 1 is then turned off
- **THEN** the face reads 103 and the URL query is `?sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&b1=0&b2=strikers-instinct1`.

#### Scenario: Not carried to another card
- **WHEN** `/players/7511/89136409091415` is opened next in the same browser
- **THEN** its second slot reads "Select Booster" and its face reads 108.

#### Scenario: Fixture match
- **WHEN** the second-booster list is requested
- **THEN** it returns 29 boosters in alphabetical order whose names and four stats each equal the fixture's basic boosters 1–29, and every slug follows the rule above.

### Requirement: Own Booster 2 And Booster Levels
A card's own usable Booster 2 SHALL be shown as a fixed pill with an orange accent that cannot be replaced; activating it SHALL turn it off (`b2l=0`) and on again (parameter removed). Booster 1 of a card that is not Trending SHALL toggle off (`b1=0`) and on. Booster 1 of a Trending card (+3 on every Trending card with a usable Booster 1) SHALL cycle on each activation +3 → off (`b1=0`) → +1 (`b1=1`) → +2 (`b1=2`) → +3 (no parameter), where level n adds n to every stat of that booster; its pill SHALL show the current level as text and as three level bars, and its accessible name SHALL include the level. Each state SHALL be restored from the URL.

#### Scenario: Trending cycle
- **WHEN** Booster 1 of `/players/162114/56163140008258` (Lamine Yamal, Trending) is activated four times without a manager
- **THEN** the card face reads 103, 101, 101, 102 and 103 for +3, off, +1, +2 and +3, and the URL carries `b1=0`, `b1=1`, `b1=2` and then no `b1`.

#### Scenario: Own Booster 2 toggles
- **WHEN** the Booster 2 pill of `/players/35496/88045755861672` (Gareth Bale, own Booster 2 "+6 Kicking Power") is activated twice
- **THEN** it is first off with `b2l=0` in the URL and Kicking Power 6 lower, then on again with no `b2l`, and no booster drawer opens.

### Requirement: Level-Cap-1 Highlight Max Level
A Highlight card with a level cap of 1 SHALL show a Progression panel with "Max Level 1", a short note that the card's official max level is not listed and a level can be picked to try a build, and a Max Level slider from 1 to 80 with − and + buttons. The budget SHALL be 2 × (Max Level − 1) displayed points. The panel SHALL open at Max Level 1 with no point spent; the categories, the strip, Max OVR and Reset SHALL be offered from Max Level 2. Lowering the Max Level SHALL remove stat points one at a time from the last category that holds points (Goalkeeper 3 back to Shooting) until the build fits, and the live region SHALL announce the removal; Reset SHALL keep the Max Level. The card face, the stats and the tiles SHALL include the proficiency bonus at every Max Level, Max Level 1 included. At Max Level 1 the stat rows SHALL be plain; above it they open the Adjust popover.

#### Scenario: Messi "Gracias, Leo!"
- **WHEN** `/players/7511/105899666447703` is opened, the Max Level is set to 10 and Max OVR is pressed
- **THEN** the build is Shooting 4, Dribbling 5, Dexterity 4, Lower Body Strength 4 ("18/18 pts"), and the URL carries `ml=10`.

#### Scenario: Lowering trims the last categories
- **WHEN** from that build the Max Level is lowered to 9, 8, 5 and 1
- **THEN** the build reads Lower Body Strength 2 at 9, Lower Body Strength 0 at 8, Shooting 4 and Dribbling 4 only at 5, and no point at 1, each change being announced.

#### Scenario: Bonus at level 1
- **WHEN** the same card and `/players/135067/105866112143259` (Vitinha) are opened without a query and without a remembered manager
- **THEN** their faces read 104 and 100 while their header pills read 100 and 96.

#### Scenario: Vitinha at level 20
- **WHEN** Vitinha's Max Level is set to 20 and Max OVR is pressed
- **THEN** the build is Passing 8, Dribbling 5, Dexterity 4, Lower Body Strength 8, Defending 4.

### Requirement: Trending Build Panel
A Trending card SHALL show a panel titled "Build" holding Select Manager and the Manager Proficiency control, without Max Level, categories, the category strip, Max OVR or Reset; its stat rows SHALL be plain; its face, stats and tiles SHALL include the proficiency bonus and the selected manager's "+1"; and its URL SHALL use only `mp`, `mgr` and `b1`.

#### Scenario: Courtois
- **WHEN** `/players/44383/56163139890527` (Thibaut Courtois, Trending GK) is opened without a remembered manager
- **THEN** the "Build" panel shows Select Manager and proficiency 90, no category control exists, the face reads 102 and the header pill reads 98; moving the proficiency to 77 and to 76 gives 100 and 98.

### Requirement: Search Result Lists
The palette, the home search and the compare picker SHALL query the player search only when the trimmed text has at least 3 characters, 200 ms after the last keystroke, and SHALL show, below 3 characters, their empty state (the palette and the picker: "Latest Players", the 12 newest distinct players) or, on the home search, a hint to type at least 3 characters. Results SHALL come in pages of 12; the palette and the picker SHALL fetch the first page and fetch the next page when the list is scrolled to its end, showing a "Loading more…" row while more exist; the home list SHALL fetch the first two pages at once and the next ones on scroll, and SHALL show a "Players" header with a "Show all" link to `/players?search=<text>`. Inside each page, rows whose name has a word starting with the query (accent- and case-insensitive) SHALL come first and the other rows SHALL keep the server order. Each row SHALL show the card face, the name, "position · attack style · defence style", the card's pack / campaign name as a chip when it has one, and the max overall as the badge. In the palette and the picker the first row SHALL become active as soon as results appear and Enter SHALL open (or pick) the active row; Enter with no result SHALL do nothing. Superseded requests SHALL be cancelled.

#### Scenario: Pack-name term
- **WHEN** "wonderkids" is typed in the palette
- **THEN** exactly the 8 cards of the pack "Wonderkids 8 Oct '26" are listed, Pau Cubarsí first, each with that pack chip.

#### Scenario: Lift inside a page
- **WHEN** "mes" is typed in the palette
- **THEN** the first page lists the eleven Lionel Messi rows before James Rodríguez, who comes twelfth (eighth in the server order).

#### Scenario: Enter opens the first row
- **WHEN** "cubarsi" is typed in the palette and Enter is pressed without an arrow key
- **THEN** the first row's card page opens.

#### Scenario: Two characters
- **WHEN** "me" is typed in the palette
- **THEN** no search request is sent and the "Latest Players" list stays — eFootLab's rule; the reference shows an unrelated top list at two characters (recorded as an oddity not copied).

### Requirement: Players Filter Chips, Badges And Reset
`/players` SHALL show, under the search field at every width, a row of removable chips, one per active filter value (for example "Icons ×", "Max OVR ≥ 99 ×", "Age 18–21 ×", a nation, league or team name, "Form 3★ ×"); removing a chip SHALL remove only that value, update the URL and the list, and return focus to the next chip or to the search field. Below 1024 px the chip row SHALL end with a "Reset" chip. Each dialog row of the filter rail (Stats, Body Model, Playing Style, Skills, Nation, League, Team) SHALL show the number of selected values as a badge (Stats counts each stat range and the max-level switch). Reset (rail, sheet and chip) SHALL clear every filter and keep the search text and the sort. When no card matches, the grid SHALL be replaced by "No results found." and "Try resetting or changing your filter options!", with the rail and the chips kept.

#### Scenario: Chip removal
- **WHEN** `/players?league=4&league=26&team=Arsenal+FC&team=Vissel+Kobe` is opened at 390 px and the "Vissel Kobe" chip is removed
- **THEN** the URL loses `team=Vissel+Kobe`, the list updates, and the League row still shows the badge 2.

#### Scenario: Reset keeps search and sort
- **WHEN** `/players?search=messi&sort=highest&card=5` is reset
- **THEN** the URL becomes `/players?search=messi&sort=highest`.

#### Scenario: Empty state
- **WHEN** League J1 (26) and Team "Arsenal FC" are combined
- **THEN** the page shows "No results found." and "Try resetting or changing your filter options!" with both chips still present.

### Requirement: Packs Order And Last Updated
`/packs` SHALL list the featured bundles in their stored order (`FeaturedBundle.position` ascending: the current packs newest first, then the manager and player spotlights newest first), SHALL keep eFootLab's counts (packs, distinct players, cards) and add a chip "Last updated <age>", where the age is the number of whole UTC days between today and the newest card release date in the database, written "today", "yesterday" or "N days ago", computed so that server and client render the same text. The home "Latest Packs" block SHALL show the first three bundles of that order.

#### Scenario: Group order
- **WHEN** `/packs` is shown on the 2026-10-19 data
- **THEN** "Worldwide Sep '26" (Sep 10) is listed before "Jürgen Klopp" (Oct 15), and the home page shows "Spanish League Midfielders", "Trusted Shields" and "Ricardo Quaresma".

#### Scenario: Last updated
- **WHEN** the newest card release date is 2026-10-15 and the page is rendered on 2026-10-20 UTC
- **THEN** the chip reads "Last updated 5 days ago".

### Requirement: Two-Build Compare
`/compare` SHALL hold two slots, `left` and `right`, each a card with its own build. The URL SHALL carry `left=<card id>` and `right=<card id>` and, for a side whose build differs from its default, every category of that side holding a point as `l_<category>` / `r_<category>` (the card-page category keys), the manager as `l_mgr` / `r_mgr`, and `lb=1` / `rb=1` for a side without any category point; it SHALL be written with `history.replaceState`. On load a side without category keys and without `lb`/`rb` SHALL use its default build, and values SHALL be corrected and announced as on the card page. Each filled slot SHALL show the card face with the build's overall at the registered position, a Remove button, the name linking to the card page, the playing styles, the points ("used/total pts"), Max OVR, Reset, Select Manager (the card page's drawer, without the remembered manager), the booster pills of the card's usable boosters (both on, not changeable here), the category values as text, and the 13 position tiles from the build. A side's default build SHALL be the card's Max-OVR allocation with its usable boosters on and **no proficiency bonus**; choosing a manager SHALL apply the manager's rating as the proficiency and its "+1" pills and show "Manager Proficiency <rating>"; choosing it again or "Clear" SHALL return the side to no bonus. A card with a level cap of 1 SHALL have no categories, Max OVR or Reset in compare. The table SHALL show one row per stat with the two sides' values as tier-coloured pills and, when they differ, the absolute difference next to both pills, marked positive on the higher side and negative on the lower; equal rows show no difference; then Overview (height, weight, strong foot, weak-foot usage and accuracy, age), Skills (links to the skill pages) and Body Model (the 11 body values). The picker SHALL be the search palette and SHALL list the card already in the other slot like any other card. Remove SHALL empty only its slot and keep the other card and its build in place; the next pick SHALL fill the empty slot. Swap SHALL exchange the cards and their builds. Copy link SHALL copy the absolute current URL and announce "Link copied". At 320–1440 px the page SHALL NOT scroll horizontally, and below 768 px the two slots SHALL sit side by side.

#### Scenario: Default build without bonus
- **WHEN** `/compare?left=89136409091415` is opened
- **THEN** the left slot shows Lionel Messi with "66/66 pts", categories 4/4/12/11/8/1, the face reads 105 RWF and the tiles read LWF 100, RWF 105, SS 104, CF 98 and GK 40.

#### Scenario: Reset one side
- **WHEN** Reset is pressed on that slot
- **THEN** the URL becomes `?left=89136409091415&lb=1`, the slot reads "0/66 pts" and the face 91 RWF.

#### Scenario: Manager on one side
- **WHEN** `right=89136409091415` is added and Roberto Martínez (17606144688129) is chosen for the right slot
- **THEN** the right slot shows "Manager Proficiency 90", its face reads 109 RWF, and the URL carries `r_sho=4&r_pas=4&r_dri=12&r_dex=11&r_lbs=8&r_aer=1&r_mgr=17606144688129`.

#### Scenario: Restore from a copied link
- **WHEN** the URL of the previous state is opened in a fresh profile
- **THEN** both slots show the same 26 stats, overalls and manager as before the copy.

#### Scenario: Two different cards
- **WHEN** `/compare?left=89136409091415&right=88045487395246` is opened
- **THEN** the right slot (Ricardo Quaresma) reads "60/60 pts" with 4/4/12/9/8/1 and face 100 RWF, and the Offensive Awareness row reads 90 and 81 with the difference 9 next to both pills, the left one marked positive.

#### Scenario: Same card twice and Remove
- **WHEN** Messi is picked for both slots and the left slot is removed
- **THEN** both picks were allowed, and after Remove the URL is `?right=89136409091415` (with any right-side build parameters) and the right card stays in the right slot.

#### Scenario: Swap
- **WHEN** the left side has a Reset build and the right side a build with a manager, and Swap is pressed
- **THEN** the cards and builds exchange sides, and the URL's `l_*` and `r_*` parameters and `lb`/`rb` exchange accordingly.

### Requirement: Skills Wiki Routes And Slugs
The skills index SHALL live at `/wiki/skills` and each skill page at `/wiki/skills/<slug>`, where the public slug of a skill with a stored skill key is that key without its leading `s_`, with underscores replaced by hyphens (equal to the reference's slug for all 67 public skills), and the stored slug otherwise; the stored `Skill.slug` SHALL stay the join key and SHALL NOT be changed. `/skills` SHALL answer a permanent redirect (308) to `/wiki/skills` keeping the query; `/skills/<slug>` and `/wiki/skills/<stored slug>` SHALL answer 308 to the public slug's page; an unknown or unreleased slug SHALL answer 404. Every link to a skill page (player pages, compare, header, skill tiles) SHALL use the public route. From 1024 px the index SHALL show a left rail with the current "Skills" entry and in-page links "Showtime Skills" (`#showtime`) and "Classic Skills" (`#classic`).

#### Scenario: Redirect
- **WHEN** `/skills` and `/skills/phenomenal-passing` are requested
- **THEN** they answer 308 to `/wiki/skills` and `/wiki/skills/phenomenal-pass`.

#### Scenario: Slugs
- **WHEN** the index is shown
- **THEN** its 67 tiles link to exactly the 67 reference slugs (`phenomenal-pass`, `heading`, `rising-shot` and `acrobatic-clearance` among them).

### Requirement: Skill Leader, Rarity Rank And Top Cards
Each skill tile SHALL show a leader chip — the card face thumbnail and the player name of the skill's holder with the highest max overall, ties broken by the higher card id — and the number of cards that carry the skill. The skill page SHALL show the leader's card face in its header, "Cards with this skill N", and "Rarity rank #R of T skills", where T is the number of listed skills and R is 1 plus the number of listed skills with fewer holders (skills with the same number share a rank — eFootLab's rule, since the reference showed no tie). Its "Top cards" list SHALL show up to 12 rows — the best card of each other base player (max overall descending, then card id descending), one card per base player, the leader's base player excluded — each with the name, the two playing styles, the max overall and the card face, linking to the card page, without pagination, followed by "Show all" linking to `/players?skill=s_<key>`. The leader and the top cards SHALL be computed by bounded queries.

#### Scenario: Fortress
- **WHEN** `/wiki/skills/fortress` is opened on the 2026-10-18 data
- **THEN** the leader is Frank Rijkaard (88045755960808), the rank reads "#19 of 67", and the 12 rows end with Fabio Cannavaro (88036360723173) after Marcel Desailly, without the second Lilian Thuram card (88039581948640).

#### Scenario: Long Reach Tackle
- **WHEN** `/wiki/skills/long-reach-tackle` is opened
- **THEN** the leader is Frank Rijkaard, the rank reads "#18 of 67", and the rows start with Paolo Maldini, Jaap Stam and Alessandro Nesta.

#### Scenario: Tie
- **WHEN** two listed skills have the same number of holders (One-touch Pass and Fighting Spirit, 9,125 each)
- **THEN** both pages show the same rank.

### Requirement: Unmeasured Functions Are Not Shown
Functions of the reference that the survey did not verify on at least two checks, or that need data eFootLab does not hold, SHALL NOT be presented as working controls or invented values: Form A–E, Position Training, the weak-foot and remaining-stamina chips, In-Match Roles, Trending and Top rated sorting, the Community Rating filter, the tile context menu, skill type chips, rarity tier words, "Works well with", the build-dependent body metrics and the compare radar's build axes. Each SHALL be listed with its evidence and what would settle it in `openspec/ui-dna.md` and `CLAUDE.md`, together with the data-dependent items and the reference oddities not copied.

#### Scenario: Register
- **WHEN** `openspec/ui-dna.md` is read after this change
- **THEN** it lists every item above under "pending measurement", "waiting for the data update" or "reference oddity not copied", and no page shows a control for any of them.
