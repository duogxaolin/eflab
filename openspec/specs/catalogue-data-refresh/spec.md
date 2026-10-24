# catalogue-data-refresh Specification

## Purpose
Defines how the eFootLab catalogue is refreshed from the source dump — a gated, backup-first procedure (check request, `pg_dump`, static snapshot survey, staged full dump, validation, migration, seed and cross-fill, verification, image upload, image version bump) that stops on any challenge — and the data it adds: the stored dump date, each card's own league for the League filter, the Community Rating filter shown with "Ratings as of <date>", the Top rated sort offered only once its rule is measured, and the manager picker order (rating descending, then the reference's order).
## Requirements
### Requirement: Data Refresh Procedure
A catalogue refresh SHALL run in this order and SHALL stop, leaving the database as it was, at the first failure before the seed: (1) one check request to the source API with the dump script's request identity; an HTTP 403 or 429, an HTML or challenge body, or a redirect to another host SHALL stop the refresh with no further request to the source for at least 6 hours and SHALL never be worked around; (2) a `pg_dump -Fc` of the live database to a file outside the repository whose readability is confirmed with `pg_restore --list`; (3) the static snapshot refresh of "Static Snapshot Survey"; (4) a full dump into a new staging directory, with card images downloaded only when the image bucket lacks them or holds a different body; (5) the dump script's `--validate-only` pass and the worker's source-data checks on the staging data, which SHALL refuse nothing; (6) the database migration; (7) `pnpm db:refresh` (seed then cross-fill) reading the staging dump; (8) `scripts/verify-seed.py --after-crossfill` exiting 0; (9) the upload of the staged new and changed images to the bucket, card images replacing changed objects and manager images never replacing existing ones, followed by an HTTP HEAD of a sample of uploaded keys answering 200; (10) a raise of the card image version when any card image was overwritten; (11) promotion of the staging directory to the dump location. A failure after the seed committed SHALL be repaired by restoring the backup or by fixing forward and rerunning steps 7–9; it SHALL be reported. The source key and the bucket credentials SHALL be read from files outside the repository and SHALL never be printed, logged unmasked or committed.

#### Scenario: Challenge on the check
- **WHEN** the check request answers 403 or a challenge page
- **THEN** no other request is sent to the source, no backup, migration, seed or upload is run, and the report states the time after which a retry is allowed.

#### Scenario: Integrity after the refresh
- **WHEN** the refresh has finished
- **THEN** `scripts/verify-seed.py --after-crossfill` exits 0 against the staging dump, the backup file exists outside the repository and lists its tables with `pg_restore --list`, and every sampled uploaded image key answers 200.

#### Scenario: Nothing third-party in the repository
- **WHEN** the repository diff of the change is inspected
- **THEN** it contains no key, credential, dump file, backup, reference image or reference text, and no absolute local path.

### Requirement: Static Snapshot Survey
The static manager snapshot SHALL be refreshed by reading the reference's manager drawer in a real, headed browser with a fresh profile — the manager id from each row's image address, the name, the rating, the one or two "+1" stat pills and the row order — and the skills index SHALL be read to detect skills added or removed since the last snapshot. The survey SHALL use at most two page loads at least 97 seconds apart, SHALL read only what the pages render (no script bundle, no direct API request), SHALL stop at the first challenge, and SHALL record what it read outside the repository. New managers SHALL be added to the fact-only fixture (id, name, rating, pills); their art SHALL be uploaded to the bucket without replacing existing objects; a skill change SHALL be reported and handled by the seed's existing snapshot rules.

#### Scenario: New manager
- **WHEN** the drawer lists Niko Kovač at rating 90 with Ball Control and Defensive Engagement
- **THEN** the fixture and the snapshot hold that manager with the id read from its image, the picker list returns it among the rating-90 managers, and its art answers 200 from the bucket.

#### Scenario: Picker order recorded
- **WHEN** the snapshot is written
- **THEN** its managers are in the drawer's order, and the seed stores each one's position as its picker order.

### Requirement: Stored Dump Date
The seed SHALL store the time the seeded dump was taken (the dump manifest's `dumpedAt`) in a single catalogue metadata row; a seed without that value SHALL keep the stored one and say so. The public API SHALL expose that date, and the Community Rating control SHALL show it as "Ratings as of <date>" in UTC; the Top rated sort option appears in the same filter surface and relies on the same date.

#### Scenario: Date shown
- **WHEN** the catalogue was seeded from a dump taken on 2026-10-24 and `/players` is opened
- **THEN** the Community Rating control shows "Ratings as of Oct 24, 2026".

### Requirement: Card League
Every player row SHALL store the card's own league id from the dump's `league` field, written by the same mapping in the seed and the incremental sync, and the League filter SHALL match that stored card league. A card whose league is not in the League table SHALL store no league and SHALL NOT match any League selection.

#### Scenario: Teams with cards in two leagues
- **WHEN** leagues 4 and 26 and the teams Arsenal FC and Vissel Kobe are selected
- **THEN** the list equals an independent read-only count of cards whose own league is 4 or 26 and whose team is one of the two (on the 2026-10-18 data 503, the reference's number), and Vissel Kobe cards whose own league is 30 are not listed.

#### Scenario: Same mapping on both write paths
- **WHEN** one dump row is mapped by the seed and by an incremental sync
- **THEN** both store the same league id.

### Requirement: Community Rating Filter
The `/players` rail SHALL offer a "Community Rating" control — a single slider from 1 to 10 whose value 1 reads "All" — that keeps only cards whose stored average community rating is at least the chosen value, with no minimum number of votes; a card without ratings SHALL NOT match a value of 2 or more. The value SHALL be written as `rating=N` (2–10; 1 is the default and is omitted), restored from links, cleared by Reset, shown as a removable chip and counted in the filter badges. The control SHALL show the "Ratings as of" date.

#### Scenario: Perfect average
- **WHEN** Icons and Community Rating 10 are selected
- **THEN** every listed card has an average of exactly 10, the count equals an independent read-only count of Icons with an average of 10, and the URL carries `card=1` and `rating=10`.

#### Scenario: Default omitted
- **WHEN** the slider is moved back to 1
- **THEN** the URL loses `rating` and the list equals the list without the filter.

### Requirement: Top Rated Sort
Top rated SHALL be offered in the sort control only when the survey of this change determined, on at least two independent checks against data dumped within the same day, the minimum number of votes K, the order and its tiebreak; the measured values and their evidence SHALL be recorded in the design. When offered, Top rated SHALL list only cards with at least K votes, ordered by the measured rule, and SHALL be written as `sort=top`. When the survey does not determine them, Top rated SHALL stay hidden, `sort=top` SHALL keep reading as High to low, and the item SHALL stay in the pending register with the measurements taken.

#### Scenario: Determined
- **WHEN** the survey determined K and the order and Icons with Top rated is opened
- **THEN** the listed set equals the cards with at least K votes among the Icons, in the measured order, and it matches the reference's list read the same day on the cards whose ratings did not move.

#### Scenario: Not determined
- **WHEN** the survey could not determine K or the order
- **THEN** the sort control shows no Top rated option, `/players?sort=top` lists High to low, and `openspec/ui-dna.md` lists Top rated as pending with the readings.

### Requirement: Manager Picker Order
The manager picker list SHALL be ordered by rating descending, then by the stored picker order (the reference's order inside a rating), then by id ascending for a manager without a picker order.

#### Scenario: Rating 90 managers
- **WHEN** the picker list is requested after the refresh
- **THEN** the rating-90 managers come in the order of the drawer read by the survey (on 2026-10-23: Roberto Martínez, Thomas Tuchel, Antonio Conte, José Mourinho, Cristian Chivu, Jürgen Klopp, Niko Kovač).

