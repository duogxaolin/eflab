## MODIFIED Requirements

### Requirement: Page State Lives in the URL
The players page SHALL reflect its query, card types, filters, sort and page in the URL using efootbase's parameter names and encodings where they were verified — `search`, `sort` (`highest`, `lowest`, `top` while Top rated is offered, or a field sort; New cards, the default, is written as no `sort`), `pos` (repeated position index: GK 0, CB 1, LB 2, RB 3, DMF 4, CMF 5, LMF 6, RMF 7, AMF 8, LWF 9, RWF 10, SS 11, CF 12), `card` (repeated card-type code), `base` and `ovr` (Base / Max Overall Rating ranges as `min-max`), `foot`, `condition` (repeated 0–4 for E, D, C, B, A), `form` (repeated 0–2 for 1★–3★), `wfa` and `wfu` (repeated 0–3 for 1★–4★), `height`, `weight`, `age`, `rating` (Community Rating minimum 2–10; 1 is the default and is omitted), `playingStyle` (repeated style id or `p_*` AI key), `skill` (repeated `s_*` skill key), `league` (repeated id), `team` (repeated team name) — and eFootLab's own `nat` (repeated internal nation id, because no nation code is stored), `stat` (+ `smax`), `body`, `order` and `page`; it SHALL write the keys in the order `search, sort, pos, card, base, ovr, foot, condition, form, wfa, wfu, height, weight, age, rating, playingStyle, skill, nat, league, team, stat, smax, body, order, page`, repeated values in a stable order without duplicates, SHALL omit defaults, SHALL still read the older `q`, `type`, `style`, `dstyle`, `ai`, `ovrMin`/`ovrMax` and `maxOvrMin`/`maxOvrMax` parameters, position names in `pos`, condition letters, comma lists of `form`, `wfa`, `wfu` (read as the old 1-based stars), comma lists of skill ids, all-digit `team` values (read as team ids; no stored team name is all digits), `sort=trending` (read as the default) and `sort=top` (read as Top rated while it is offered — the reference's meaning, an intentional change for old eFootLab links, which meant High to low — and as High to low otherwise) and single-value `pos`, `nat`, `league` and `team` links, without writing them in the old form; a single `form`, `wfa` or `wfu` value SHALL be read with the 0-based meaning — an intentional change for such old single-value links, which now select one star more; it SHALL drop out-of-range or inverted values instead of sending them, SHALL read the state from the URL on load and on navigation, and SHALL reset to page 1 whenever the query or a filter changes.

#### Scenario: Reload and share
- **WHEN** a user applies filters and sort on page 3 and reloads, or opens the same URL in a new tab
- **THEN** the same filters, sort and page are active.

#### Scenario: New search from another page
- **WHEN** the user is on page 7 and runs a header search that yields 2 pages
- **THEN** the page shows results from page 1 of the new search, never an empty "Page 7 of 2" state.

#### Scenario: Old link
- **WHEN** a user opens `/players?q=messi&type=EPIC`
- **THEN** the page shows the Epic cards matching "messi" and rewrites the URL as `search=messi&card=5` on the next change.

#### Scenario: Repeated parameters
- **WHEN** a user opens `/players?pos=12&pos=11&nat=14&nat=3`
- **THEN** the position filter shows CF and SS selected, the nation filter shows two nations selected, and re-saving the state produces the canonical URL for that state (`pos=11&pos=12&nat=3&nat=14`: position indexes ascending, ids ascending); re-saving a canonical URL leaves it unchanged.

#### Scenario: Reference link
- **WHEN** `/players?card=5&search=messi&pos=10&foot=1&wfa=2&base=87-&sort=highest` is opened
- **THEN** exactly two cards are listed (Lionel Messi 89136409091415 and 89133456301399: Epic, registered RWF, left foot, weak-foot accuracy 3★, base overall at least 87), High to low is selected, and after a change and its revert the URL reads `/players?search=messi&sort=highest&pos=10&card=5&base=87-&foot=1&wfa=2`.

#### Scenario: Old eFootLab encodings
- **WHEN** `/players?condition=A,B&form=1,3&team=12` and `/players?form=2` are opened
- **THEN** the first selects conditions A and B, 1★ and 3★ form and the team with id 12 (Portugal), and is rewritten as `condition=3&condition=4&form=0&form=2&team=Portugal` on the next change; the second selects 3★ form.

#### Scenario: Rating parameter
- **WHEN** `/players?card=1&rating=10` is opened, the slider is moved to 9 and then back to 1
- **THEN** the Community Rating control first reads 10 with the matching cards listed, the URL then carries `rating=9`, and finally carries no `rating`; the key sits after `age` in the canonical order.

### Requirement: Sort Presets
The players page SHALL expose a sort control named "Sort" that shows the current choice and offers New cards (the default: release date descending, then card id descending), High to low (max overall descending, then card id descending) and Low to high (max overall ascending, then card id ascending), in addition to the existing field sorts, and Top rated only under catalogue-data-refresh "Top Rated Sort"; Trending SHALL NOT be offered, because eFootLab holds no live popularity ranking.

#### Scenario: Sort control
- **WHEN** a user opens the sort control and chooses "New cards"
- **THEN** the list is ordered by release date descending with a stable tiebreaker and the URL records the choice (New cards being the default, the URL carries no `sort`).

#### Scenario: High to low
- **WHEN** High to low is chosen on the Legendary cards
- **THEN** the cards are ordered by max overall descending, then card id descending, and the URL carries `sort=highest`.

### Requirement: Additional Player Filters
The players page SHALL offer filters for base and max overall ranges, condition, form, weak-foot accuracy and usage, height, weight and age ranges, community rating, skills, league, team, stat ranges and body-model ranges, in that priority order, and the Position, Playing Style, Nation, League and Team filters SHALL accept several selected values at once (values within one filter combine with OR — except AI styles, see "Filters Use the Correct Identifiers" — and different filters combine with AND). The Position filter SHALL match the card's registered position only. The League filter SHALL match the card's own league (catalogue-data-refresh "Card League"), not the league of the card's team. The Community Rating filter follows catalogue-data-refresh "Community Rating Filter". The Team picker SHALL list every team, grouped under league headings (leagues A–Z, teams A–Z, teams without a league last), whatever leagues are selected; a Team selection SHALL combine with a League selection by AND. The Nation, League and Team pickers SHALL enforce the list bound (50 values) in the interface: at the bound the unselected options are disabled and a visible, announced message says so, selected values stay removable, and no selection is ever dropped silently. A picker SHALL show its "nothing matches" message when a search term leaves no option, and only once its list has loaded. Each filter that ships SHALL be applied by the API, SHALL be recorded in the URL, and SHALL reset the page to 1 when changed. A filter that cannot be delivered correctly SHALL NOT ship.

#### Scenario: Overall range
- **WHEN** a user sets Base Overall Rating minimum to 90
- **THEN** every returned card has base overall at least 90 and the URL contains the minimum.

#### Scenario: Skill filter
- **WHEN** a user selects the skill One-touch Pass (stored as "One-Time Pass")
- **THEN** every returned card has that skill.

#### Scenario: Several positions
- **WHEN** a user selects the card type Icons (stored as `LEGENDARY`) and the position CB, then adds LB
- **THEN** every returned card is registered at CB (then at CB or LB), and the counts are 23 and 32 in the 2026-10-18 data, equal to an independent database count of registered positions.

#### Scenario: Several nations and leagues combined
- **WHEN** a user selects two nations and two leagues
- **THEN** every returned card belongs to one of the two nations and its own league is one of the two leagues.

#### Scenario: Invalid list
- **WHEN** a client sends more than 13 positions, more than 50 values for another list, a value outside the valid range, or a member that is not an integer (such as `null`)
- **THEN** the API responds with a client error (400), not a server error.

#### Scenario: Selection limit
- **WHEN** 50 nations are selected and the user searches for another nation in the Nation dialog
- **THEN** the dialog shows "At most 50 selections", the unselected options are disabled, the URL still carries the 50 selected nations, and removing one selection enables the options again; the League and Team dialogs behave the same.

#### Scenario: Search with no match
- **WHEN** the user types a term that matches no option in the Nation dialog or in the Team dialog
- **THEN** the dialog shows "Nothing matches.", and the message is not shown while the list is still loading.

#### Scenario: Team not narrowed by league
- **WHEN** League J1 is selected and the Team dialog is opened, and "Arsenal FC" is chosen
- **THEN** the dialog still lists every team under its league heading, and the list is empty with the empty-state text because no Arsenal FC card plays in J1.

### Requirement: Search Scope Is Visible and Changeable
The players page SHALL default to all card types (no card type pre-selected, matching efootbase), SHALL show which card types are included, SHALL let the user select several card types, SHALL match a text search against the card name or the card's pack / campaign name with the same rule as the search dropdown, and SHALL NOT silently exclude card types from a text search that the search dropdown showed.

#### Scenario: Default scope
- **WHEN** a user opens `/players` without parameters
- **THEN** no card type is pre-selected, the result count equals the number of cards in the catalogue (an independent read-only count; 50,694 in the 2026-10-18 data), and Trending cards are included.

#### Scenario: Dropdown and results agree
- **WHEN** the home search dropdown lists cards for "cruyff" (9 cards in the 2026-10 data: 7 Epic, 2 Legendary) and the user presses Enter
- **THEN** `/players?search=cruyff` returns every card the dropdown listed (9 of 9) and no card type is pre-selected.

#### Scenario: Pack name on the list
- **WHEN** `/players?search=messi` is opened
- **THEN** the count is 113 in the 2026-10-18 data: the 63 cards named Messi and the other cards of packs whose name contains "Messi".
