## MODIFIED Requirements

### Requirement: Faithful Player Field Mapping
The seeder SHALL map every efootbase player field it stores from the field that actually exists in the dump, and SHALL NOT substitute constants for fields the dump provides.

- Base Jump comes from `jumping` and base Set Piece Taking from `set_piece_taking`.
- `registeredPosition` comes from the dump's `pos` field using the same index order as the shared position list.
- `condition` comes from the dump's `condition` index (0=E, 1=D, 2=C, 3=B, 4=A).
- `injuryResistance` comes from `injury_resistance`, and `marketValue` from `player_value`.
- `dribbleHeight` comes from `leg_length_height`.
- The normalised ASCII name comes from `name_normalized`.
- The card's own league (`leagueId`) comes from `league`, stored only when that league exists in the League table.
- `avgRating`, `ratingCount` and `views` come from the dump fields of the same names, and the dump's date (`dumpedAt` of its manifest) is stored once in the catalogue metadata row.

#### Scenario: Base stats are not constants
- **WHEN** the seed completes
- **THEN** the number of players with base Jump = 40 AND base Set Piece Taking = 40 equals the number of dump rows whose `jumping` and `set_piece_taking` are both 40, and is not 50,691.

#### Scenario: Registered position equals the dump
- **WHEN** the seed completes
- **THEN** for every player, the stored registered position index equals the dump's `pos` value, and the player's aptitude for that position is "registered".

#### Scenario: Condition follows the dump
- **WHEN** a dump row has `condition` = 2
- **THEN** the stored condition letter is "C", and the distribution of stored letters equals the dump distribution (E:535, D:2,460, C:38,358, B:6,613, A:2,725 for the 2026-10-18 dump).

#### Scenario: League follows the dump
- **WHEN** the seed completes
- **THEN** for every player whose dump `league` exists in the League table the stored league id equals it, the others store none, and `scripts/verify-seed.py` checks both.

### Requirement: Manager Picker Roster
The database SHALL mark exactly the managers that efootbase offers in its picker (the managers of the current static snapshot — 69 on 2026-10-18) as picker managers, SHALL store each one's position in the snapshot as its picker order, SHALL contain every one of them by id, and the seed SHALL leave cross-fill owned manager columns untouched.

#### Scenario: Picker managers
- **WHEN** the seed completes with the manager snapshot present
- **THEN** exactly the snapshot's managers (69 on 2026-10-18, 45 of them with a second pill) are marked as picker managers, each with a name, a rating from 83 to 90, the stat pills efootbase lists (one or two), stored as eFootLab stat names, and its picker order, and the cross-filled tactic data of the other managers is unchanged.

### Requirement: Single Refresh Command Preserves Cross-Fill
The repository SHALL provide one command that seeds and then cross-fills, and the documentation SHALL state that a standalone seed removes cross-fill data.

#### Scenario: Refresh result
- **WHEN** the refresh command completes on the standard dump and eFHUB SQLite
- **THEN** the database holds every dump card plus the eFHUB-only players (50,691 + 3 = 50,694 on the 2026-10-18 dump), every manager the eFHUB file can fill carries non-zero tactic ratings (at least 1,475 on 2026-10-18), and the tier badges equal the eFHUB file's (10,745 on 2026-10-18); the counts of each refresh are recorded in `CLAUDE.md`.
