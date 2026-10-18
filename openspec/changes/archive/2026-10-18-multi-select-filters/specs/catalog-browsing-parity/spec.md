## MODIFIED Requirements

### Requirement: Additional Player Filters
The players page SHALL offer filters for base and max overall ranges, condition, form, weak-foot accuracy and usage, height, weight and age ranges, skills, league, team, stat ranges and body-model ranges, in that priority order, and the Position, Nation, League and Team filters SHALL accept several selected values at once (values within one filter combine with OR, different filters combine with AND). The Nation, League and Team pickers SHALL enforce the list bound (50 values) in the interface: at the bound the unselected options are disabled and a visible, announced message says so, selected values stay removable, and no selection is ever dropped silently. A picker SHALL show its "nothing matches" message when a search term (or the league narrowing of the Team list) leaves no option, and only once its list has loaded. Each filter that ships SHALL be applied by the API, SHALL be recorded in the URL, and SHALL reset the page to 1 when changed. A filter that cannot be delivered correctly SHALL NOT ship.

#### Scenario: Overall range
- **WHEN** a user sets Base Overall Rating minimum to 90
- **THEN** every returned card has base overall at least 90 and the URL contains the minimum.

#### Scenario: Skill filter
- **WHEN** a user selects the skill One-touch Pass (stored as "One-Time Pass")
- **THEN** every returned card has that skill.

#### Scenario: Several positions
- **WHEN** a user selects the positions CF and SS
- **THEN** every returned card has CF or SS as a position it plays, and the count equals an independent database count for the same rule.

#### Scenario: Several nations and leagues combined
- **WHEN** a user selects two nations and two leagues
- **THEN** every returned card belongs to one of the two nations and to a team in one of the two leagues.

#### Scenario: Invalid list
- **WHEN** a client sends more than 13 positions, more than 50 values for another list, a value outside the valid range, or a member that is not an integer (such as `null`)
- **THEN** the API responds with a client error (400), not a server error.

#### Scenario: Selection limit
- **WHEN** 50 nations are selected and the user searches for another nation in the Nation dialog
- **THEN** the dialog shows "At most 50 selections", the unselected options are disabled, the URL still carries the 50 selected nations, and removing one selection enables the options again; the League and Team dialogs behave the same.

#### Scenario: Search with no match
- **WHEN** the user types a term that matches no option in the Nation dialog, or a club name outside the selected leagues in the Team dialog
- **THEN** the dialog shows "Nothing matches." (Team: "No team of the selected leagues matches."), and the message is not shown while the list is still loading.

### Requirement: Page State Lives in the URL
The players page SHALL reflect its query, card types, filters, sort and page in the URL using efootbase's parameter names where observed — `search`, `card` (repeatable card-type code), `pos` (repeatable), `playingStyle`, `ai`, `nat` (repeatable, internal nation id), `league` (repeatable), `team` (repeatable), `foot`, `base` and `ovr` (Base / Max Overall Rating ranges as `min-max`), `condition`, `form`, `wfa`, `wfu`, `height`, `weight`, `age`, `skill`, `stat` (+ `smax`), `body`, `sort`, `order`, `page` — SHALL write repeated values in a stable order without duplicates, SHALL omit defaults, SHALL still read the older `q`, `type`, `style`, `dstyle`, `ovrMin`/`ovrMax` and `maxOvrMin`/`maxOvrMax` parameters and single-value `pos`, `nat`, `league` and `team` links without writing them in the old form, SHALL drop out-of-range or inverted values instead of sending them, SHALL read the state from the URL on load and on navigation, and SHALL reset to page 1 whenever the query or a filter changes.

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
- **THEN** the position filter shows CF and SS selected, the nation filter shows two nations selected, and re-saving the state produces the canonical URL for that state (`pos=SS&pos=CF&nat=3&nat=14`: positions in catalogue order, ids ascending); re-saving a canonical URL leaves it unchanged.
