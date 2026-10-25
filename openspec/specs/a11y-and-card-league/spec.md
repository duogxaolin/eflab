# a11y-and-card-league Specification

## Purpose
Defines how a card's own league reaches the card DTO and the pages that display it (card page, Card Info, compare Overview), so the page never names a league the League filter would not match. It also fixes three accessibility rules that the site-wide baseline relies on: the booster-off accessible name (Label in Name), one empty-result announcement per list, and floating elements (popovers, tooltips, sheets) that keep clear of every fixed bottom chrome such as the phone tab bar and the Progression dock.
## Requirements
### Requirement: Card League In The Card DTO
`player.byId` and `player.compare` SHALL return `cardLeague` — `{ id, name, emblemUrl }` of the League row whose id is the card's stored `Player.leagueId`, or `null` when the card stores none — next to the existing team-derived `leagueName` and `leagueEmblemUrl`, which SHALL stay unchanged. The detail page's league badge, a "League" row of Card Info and the compare Overview SHALL show `cardLeague` and SHALL fall back to the team's league only when `cardLeague` is `null`. The row SHALL show the league name (for example "Free Agent") and the page SHALL NOT claim a league the League filter would not match for that card (the team's league is shown only for a card that has none stored, which today has no team either).

#### Scenario: Free agents
- **WHEN** a card of the team "FREE" (own league 48) is opened
- **THEN** Card Info shows "League: Free Agent" and the header badge names "Free Agent", not "Other".

#### Scenario: Card league differs from the team's
- **WHEN** a Vissel Kobe card whose own league is 30 is opened
- **THEN** its League row names league 30, and `/players?league=30` lists that card.

#### Scenario: Filter and card page agree
- **WHEN** 200 random cards are read with `player.byId` and each is searched with `leagueIds=[cardLeague.id]`
- **THEN** every card is in its own result list, and the number of cards whose `cardLeague.id` differs from the team league's id equals an independent read-only count (17,608 on the 2026-10-24 data).

#### Scenario: No stored league
- **WHEN** a card without a stored league (an eFHUB-only card) is opened
- **THEN** `cardLeague` is `null` and the page shows the team's league if there is one, otherwise no League row.

### Requirement: Booster Off Accessible Name
The accessible name of a switched-off on/off booster toggle (Booster 1 of a non-Trending card, an own Booster 2) SHALL read its label followed by ", Off" with no space before the comma (for example "+4 · Dribbling, Tight Possession, Speed, Balance, Off"), and a switched-on toggle SHALL carry no "Off".

#### Scenario: Booster 1 off
- **WHEN** Booster 1 of Quaresma is turned off
- **THEN** the button's accessible name in the browser's accessibility tree ends with "Balance, Off", and with the booster on it does not contain "Off".

### Requirement: Single Empty-Result Announcement
An empty `/players` result SHALL announce "No results found." once: the visible empty state is the only text with that sentence, and the result count stays available to assistive technology without repeating it.

#### Scenario: Empty list
- **WHEN** League J1 and the team "Arsenal FC" are combined
- **THEN** the page text contains "No results found." exactly once and "Try resetting or changing your filter options!" once.

### Requirement: Floating Elements Avoid Every Bottom Chrome
A popover, tooltip or sheet-form popover SHALL never cover the floating category strip, the progression dock or the tab bar, wherever that chrome sits on the screen: the avoidance SHALL apply to every fixed bottom chrome that is present, not only to the part in the lower half of the viewport; when the chrome leaves fewer than 96 px above it (a viewport under about 250 px tall) the avoidance is dropped and the element may cover the chrome rather than be squeezed unreadable.

#### Scenario: Landscape phone
- **WHEN** the Jumping Adjust popover of Quaresma is opened on a 568×320 viewport
- **THEN** its rectangle does not intersect the strip, the dock or the tab bar, and the same holds at 844×390, 740×360, 390×844 and 320×568.

