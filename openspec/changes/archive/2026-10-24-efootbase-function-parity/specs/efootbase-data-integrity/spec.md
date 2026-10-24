## MODIFIED Requirements

### Requirement: Card Type Labels Match efootbase
The seeder SHALL derive each player's card type from the dump's card-type code using the labels declared in the dump's `players_meta.json`, checked against one table of those dump labels (`CARD_TYPE_DUMP_LABELS`: Standard, Legendary, Trending, Selection, Epic, Highlight, Strike Arena), and the web UI SHALL display the label names that efootbase displays for that code, taken from one display table (`CARD_TYPE_LABELS`): Standard, Icons, Trending, Selection, Epic - Big Time, Highlight and Strike Arena (efootbase shows no Strike Arena label; eFootLab keeps its own). The two tables SHALL be separate so that a display rename never changes what the seed accepts. Where the card types are offered as filter toggles they SHALL appear in efootbase's order — Standard, Selection, Icons, Trending, Highlight, Epic - Big Time — followed by Strike Arena.

#### Scenario: Strike Arena and Big Time cards are classified correctly
- **WHEN** the seed completes
- **THEN** cards from "Big Time" packs are stored under the `EPIC` type (code 5, labelled "Epic" in `players_meta.json` — Big Time is a pack campaign, not a card-type code), cards from "Show Time" packs under `HIGHLIGHT` (code 6), cards from "Strike Arena" packs under `STRIKE_ARENA` (code 7), and no card type that exists in the enum (`STANDARD`, `LEGENDARY`, `TRENDING`, `SELECTION`, `EPIC`, `HIGHLIGHT`, `STRIKE_ARENA`) is permanently empty because of a shifted mapping.

#### Scenario: Labels shown to the user
- **WHEN** a player card of any type is displayed in a search result, filter chip, filter toggle, Card Info, page title or compare slot
- **THEN** the label shown is the display label for that card type from `CARD_TYPE_LABELS` (Standard, Icons, Trending, Selection, Epic - Big Time, Highlight, Strike Arena), never a raw enum identifier such as `STRIKE_ARENA`.

#### Scenario: Seed check unchanged
- **WHEN** the seed or the sync worker reads a `players_meta.json` whose code 1 is labelled "Legendary" and code 5 "Epic"
- **THEN** the check passes against `CARD_TYPE_DUMP_LABELS`, and a meta file with any other label for a code still aborts as before.

#### Scenario: Toggle order
- **WHEN** the Card Type filter is shown on `/players`
- **THEN** its toggles read Standard, Selection, Icons, Trending, Highlight, Epic - Big Time, Strike Arena in that order.
