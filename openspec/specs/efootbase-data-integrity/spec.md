# efootbase-data-integrity Specification

## Purpose
Guarantees that the player, booster, skill and card-type data stored in eflab is a faithful copy of the efootbase dump (plus the eFHUB cross-fill) and that re-seeding or bootstrapping a database cannot silently corrupt or lose data.
## Requirements
### Requirement: Faithful Player Field Mapping
The seeder SHALL map every efootbase player field it stores from the field that actually exists in the dump, and SHALL NOT substitute constants for fields the dump provides.

- Base Jump comes from `jumping` and base Set Piece Taking from `set_piece_taking`.
- `registeredPosition` comes from the dump's `pos` field using the same index order as the shared position list.
- `condition` comes from the dump's `condition` index (0=E, 1=D, 2=C, 3=B, 4=A).
- `injuryResistance` comes from `injury_resistance`, and `marketValue` from `player_value`.
- `dribbleHeight` comes from `leg_length_height`.
- The normalised ASCII name comes from `name_normalized`.

#### Scenario: Base stats are not constants
- **WHEN** the seed completes
- **THEN** the number of players with base Jump = 40 AND base Set Piece Taking = 40 equals the number of dump rows whose `jumping` and `set_piece_taking` are both 40, and is not 50,691.

#### Scenario: Registered position equals the dump
- **WHEN** the seed completes
- **THEN** for every player, the stored registered position index equals the dump's `pos` value, and the player's aptitude for that position is "registered".

#### Scenario: Condition follows the dump
- **WHEN** a dump row has `condition` = 2
- **THEN** the stored condition letter is "C", and the distribution of stored letters equals the dump distribution (E:535, D:2,460, C:38,358, B:6,613, A:2,725 for the 2026-10-18 dump).

### Requirement: Card Type Labels Match efootbase
The seeder SHALL derive each player's card type from the dump's card-type code using the labels declared in the dump's `players_meta.json`, and the web UI SHALL display the same label names that efootbase displays for that code.

#### Scenario: Strike Arena and Big Time cards are classified correctly
- **WHEN** the seed completes
- **THEN** cards from "Big Time" packs are stored under the `EPIC` type (code 5, labelled "Epic" in `players_meta.json` — Big Time is a pack campaign, not a card-type code), cards from "Show Time" packs under `HIGHLIGHT` (code 6), cards from "Strike Arena" packs under `STRIKE_ARENA` (code 7), and no card type that exists in the enum (`STANDARD`, `LEGENDARY`, `TRENDING`, `SELECTION`, `EPIC`, `HIGHLIGHT`, `STRIKE_ARENA`) is permanently empty because of a shifted mapping.

#### Scenario: Labels shown to the user
- **WHEN** a player card of any type is displayed in a search result, filter chip or compare picker
- **THEN** the label shown is the efootbase label for that card type from `CARD_TYPE_LABELS` (Standard, Legendary, Trending, Selection, Epic, Highlight, Strike Arena), never a raw enum identifier such as `STRIKE_ARENA`.

### Requirement: Complete Skill Import
The seeder SHALL import every skill flag (`s_*`) present in a player row into the player's skill list, and the skill catalogue SHALL contain a slug for every `s_*` key in the dump. When the static skill snapshot is available, the seeder SHALL attach each skill's description, group, effects, activation text and icon key, SHALL map every effect attribute to an eFootLab stat through one explicit table, and SHALL abort on an attribute that is not in the table; when the snapshot is missing it SHALL log a clear warning and continue.

#### Scenario: No skill flag is dropped
- **WHEN** the seed completes
- **THEN** the total number of player-skill rows equals the number of true `s_*` flags in the dump, and the seeder logs zero unmatched skill keys.

#### Scenario: Static data attached
- **WHEN** the seed completes with the snapshot present
- **THEN** every released efootbase skill (67) has a non-empty description and an icon key, 23 of them are Showtime and 44 are Classic, the 17 non-skill entries keep their fixture text with no group, and unreleased skills are stored but hidden.

#### Scenario: Unknown effect attribute
- **WHEN** a skill effect names a stat that is not in the mapping table
- **THEN** the seed aborts and the database is unchanged.

### Requirement: Booster Stats Are Complete
The seeder SHALL store every stat magnitude of every dump booster, including Jump and Set Piece Taking, and SHALL generate booster names from human-readable stat labels.

#### Scenario: Jump and Set Piece boosters
- **WHEN** a dump booster contains `jumping` or `set_piece_taking`
- **THEN** the stored booster has the matching magnitude and its generated name contains "Jump" or "SetPiece" rather than the raw snake_case key.

### Requirement: Real Position Ratings
The eFHUB cross-fill (`overallGK` … `overallCF`) SHALL keep storing per-position ratings as reference columns, storing no value where eFHUB has none, but those columns SHALL NOT be displayed. The Pitch Map, the Best Fit indicator, the "At position" figure and the position dots of the compare page SHALL show values computed from the exact overall formula (see `player-progression-simulator`, "Position Tiles From The Formula") for every card, whether or not eFHUB knows the card, and SHALL NOT display "n/a" for a position.

#### Scenario: Cross-filled ratings
- **WHEN** the cross-fill completes for a player present in eFHUB
- **THEN** the player has a stored rating for every position equal to the eFHUB value, and the Pitch Map shows the values computed from the formula, not the stored ones.

#### Scenario: Player absent from eFHUB
- **WHEN** a player is not present in the eFHUB data
- **THEN** all 13 positions on the Pitch Map show a computed value, no position shows "n/a", and the Best Fit indicator shows the position with the highest computed value.

### Requirement: Non-Destructive, Atomic Seeding
`db:seed` SHALL NOT delete user-generated data (accounts, sessions, builds, reviews, votes, posts, tier lists) unless the operator passes an explicit reset flag, and SHALL replace catalogue data atomically so a failure leaves the previous catalogue intact.

#### Scenario: Seed failure
- **WHEN** the seed fails after loading some tables
- **THEN** the catalogue tables contain exactly the rows they contained before the seed started.

#### Scenario: Default seed keeps users
- **WHEN** the seed is run without the reset flag on a database containing users and sessions
- **THEN** all user, account and session rows are unchanged afterwards.

### Requirement: Single Refresh Command Preserves Cross-Fill
The repository SHALL provide one command that seeds and then cross-fills, and the documentation SHALL state that a standalone seed removes cross-fill data.

#### Scenario: Refresh result
- **WHEN** the refresh command completes on the standard dump and eFHUB SQLite
- **THEN** the database holds 50,694 players (50,691 plus the 3 eFHUB-only players), at least 1,475 managers with non-zero tactic ratings, and tier badges on 10,745 players.

### Requirement: Cross-Fill Correctness and Safety
The cross-fill SHALL write `maxGkClearing` whenever it writes `gkClearing`, SHALL merge managers by exact id before name matching so no manager receives another version's ratings, SHALL leave a manager without tactic ratings when its id is not in the eFHUB file and the eFHUB entry of its name is another manager card in the database, and SHALL pass values from the eFHUB file to the database only as bound parameters or after strict validation.

#### Scenario: New card of a known coach
- **WHEN** a picker manager card whose id is not in the eFHUB file shares its name with another manager card that the eFHUB file contains
- **THEN** the cross-fill leaves the new card's tactic ratings at zero, logs a warning naming both cards, and does not copy the other card's ratings.

#### Scenario: Hostile input
- **WHEN** an eFHUB row contains a player id with SQL metacharacters
- **THEN** the cross-fill rejects or ignores that row and executes no injected statement.

### Requirement: Fresh Database Bootstrap
Creating a new database from the repository SHALL produce a schema that includes the `pg_trgm` and `unaccent` extensions and the trigram indexes needed by search, using the documented commands only.

#### Scenario: New database
- **WHEN** a developer runs the documented setup on an empty Postgres
- **THEN** the search endpoint returns results without error, and `\di` shows the trigram index on the player name column.

### Requirement: Manager Picker Roster
The database SHALL mark exactly the managers that efootbase offers in its picker (69 at the time of the snapshot) as picker managers, SHALL contain every one of them by id, and the seed SHALL leave cross-fill owned manager columns untouched.

#### Scenario: Picker managers
- **WHEN** the seed completes with the manager snapshot present
- **THEN** 69 managers are marked as picker managers, each with a name, a rating from 83 to 90 and the stat pills efootbase lists (one or two — 45 of the 69 have a second pill), stored as eFootLab stat names, and the cross-filled tactic data of the other managers is unchanged.

