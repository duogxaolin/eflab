# card-image-version Specification

## Purpose
Keeps visitors' browsers and edge caches from showing outdated card images after the sync worker replaces images on R2, by storing the card-image cache version in the database, raising it automatically and serving it to the web app and the admin.
## Requirements
### Requirement: Stored Card Image Version
The catalogue metadata row SHALL hold an optional card-image version: NULL, or a string of 8 to 14 digits enforced by a database constraint. A database holding NULL SHALL behave as before the change (every consumer uses its fallback). The migration that adds the column SHALL be additive and idempotent and SHALL NOT store a value. The seed, including the full run's seed child, SHALL NOT change or clear the stored version.

#### Scenario: Migration is additive and stores nothing
- **WHEN** the migration is applied twice to a database whose catalogue metadata row exists
- **THEN** the second application changes nothing, the column exists, and the stored version is NULL.

#### Scenario: Bad value refused
- **WHEN** a write sets the version to `2026-10-28` or to a 7-digit string
- **THEN** the database refuses it, and `20261028120000` is accepted.

#### Scenario: Seed leaves the version alone
- **WHEN** the version is `202610281300` and a seed run completes
- **THEN** the version is still `202610281300` and the dump date and seed time were updated as before.

### Requirement: Next Version Helper
`nextImageVersion(now, current)` in `@eflab/shared` SHALL return a UTC `yyyymmddHHmm` string for `now` that is strictly greater, as a number, than a valid `current`. When the clock value is less than or equal to a valid `current` it SHALL return `current` plus one with the same width. A null, empty or malformed `current` SHALL be treated as absent. The result SHALL always match the stored-version format.

#### Scenario: Clock ahead
- **WHEN** now is 2026-10-28 13:07:31 UTC and current is `20261024`
- **THEN** the result is `202610281307`.

#### Scenario: Same minute
- **WHEN** now is 2026-10-28 13:07:59 UTC and current is `202610281307`
- **THEN** the result is `202610281308`.

#### Scenario: Current ahead of the clock
- **WHEN** now is 2026-10-28 13:07 UTC and current is `202611010000`
- **THEN** the result is `202611010001`.

#### Scenario: Day rollover with current ahead
- **WHEN** current is `202612312359` and now is 2026-12-31 23:59 UTC
- **THEN** the result is `202612312360`, which still matches the stored-version format (8 to 14 digits), and a later call with now 2027-01-01 00:00 UTC returns `202701010000`.

#### Scenario: Malformed current
- **WHEN** current is `abc` or null
- **THEN** the result is the clock value for now.

### Requirement: Worker Raises The Version After Replacing Images
When a run starts the upload step with at least one card image counted as overwritten, the worker SHALL raise the stored version with `nextImageVersion` in the same transaction that records the run's final state (or, for a run that never finished, in the transaction that recovers it), after the upload child has ended. The current value SHALL be read under a row lock. A run that replaced nothing — no overwritten image, or it ended before the upload step started — SHALL leave the version unchanged. A run that fails or is cancelled after its upload step started SHALL still raise it. When the guarded final update matches no row, no raise SHALL happen. A worker that died during the upload phase SHALL cause the recovery of that run to raise the version when the run's last stored progress had a positive overwritten count in the "Uploading images" or "Writing the catalogue" phase.

#### Scenario: Overwrites raise it
- **WHEN** an incremental run downloads 19 images that replace bucket objects, uploads them and ends OK while the stored version is NULL
- **THEN** the stored version is the helper's value for the run's end time, written in the same transaction as the run's OK status.

#### Scenario: Nothing replaced
- **WHEN** a run downloads 41 images that are all new to the bucket (0 overwritten) and ends OK
- **THEN** the stored version is unchanged.

#### Scenario: Run with nothing new
- **WHEN** a run finds no new or changed card
- **THEN** the stored version is unchanged.

#### Scenario: Failure after the upload started
- **WHEN** a run with 5 overwritten images starts uploading and the upload child fails
- **THEN** the run ends FAILED and the stored version was raised.

#### Scenario: Failure before the upload
- **WHEN** a run with 5 overwritten images fails in the image step, before any upload
- **THEN** the stored version is unchanged.

#### Scenario: Cancel after the upload started
- **WHEN** an admin cancels a run during its upload step and the run had 3 overwritten images
- **THEN** the run ends CANCELLED and the stored version was raised.

#### Scenario: Two runs in one minute
- **WHEN** two runs that replaced images end within the same UTC minute
- **THEN** the second run's value is strictly greater than the first's.

#### Scenario: Worker killed during the upload
- **WHEN** the worker is killed while a run in the "Uploading images" phase with 7 overwritten images in its last progress write, and the next worker recovers the run
- **THEN** the run is FAILED "worker restarted" and the stored version was raised in the recovery transaction.

#### Scenario: Seed never raises it
- **WHEN** a full run's seed child commits
- **THEN** the seed itself does not change the version (only the run's upload step can cause a raise).

### Requirement: Run Records The Raised Version
A run that raised the version SHALL record it in its statistics as the optional field `imageVersionRaisedTo` and in its log as "image version raised to <value>". Rows without the field SHALL still be valid, and a value that fails the format check SHALL be dropped without discarding the rest of the statistics.

#### Scenario: Run detail shows the value
- **WHEN** the detail of a run that raised the version to `202610281307` is opened
- **THEN** it shows "Card images replaced on R2 — image version raised automatically to 202610281307".

#### Scenario: Old run
- **WHEN** a run from before the change is opened
- **THEN** its statistics are shown as before and no raise line appears.

### Requirement: Public Catalogue Meta Exposes The Version
`catalogue.meta` SHALL return `imageVersion` next to `playersDumpedAt`: the stored value, or null when none is stored or the stored value is malformed. The procedure SHALL stay public and SHALL not fail because of the new field.

#### Scenario: Stored value returned
- **WHEN** the stored version is `202610281307`
- **THEN** `catalogue.meta` answers it as `imageVersion`.

#### Scenario: Nothing stored
- **WHEN** the stored version is NULL
- **THEN** `imageVersion` is null and `playersDumpedAt` is unchanged.

### Requirement: Web Resolves The Version At Request Time
Every card image URL the web app builds SHALL carry `?v=<version>` where the version is, in this order, the stored version from `catalogue.meta`, then the build-time `NEXT_PUBLIC_IMAGE_VERSION` when non-empty, then the committed `DEFAULT_IMAGE_VERSION`. The root layout SHALL read the stored version with a request revalidated at most every 60 seconds and SHALL provide it to the components through a client context; the URL helpers SHALL take the version as an argument and keep no module-level state. A failure, timeout or invalid answer of that read SHALL fall back without throwing and without delaying a page by more than the request's timeout. No card `<img>` SHALL be built without the helpers. No public page SHALL change visually or change between static and dynamic rendering.

#### Scenario: Stored value reaches the image
- **WHEN** the API answers `imageVersion` `202610281307` and a page showing card faces is loaded
- **THEN** each card face's `src` ends with `?v=202610281307`, on the first render.

#### Scenario: Value changes without a build
- **WHEN** the stored version changes and 2 minutes pass with no build and no restart
- **THEN** a newly loaded page uses the new version in its card face URLs.

#### Scenario: API down
- **WHEN** the layout's read fails
- **THEN** pages render and card face URLs end with the env or committed fallback.

#### Scenario: Env fallback
- **WHEN** nothing is stored and `NEXT_PUBLIC_IMAGE_VERSION` is `20261101`
- **THEN** card face URLs end with `?v=20261101`; and with it unset they end with the committed default.

#### Scenario: Stored beats env
- **WHEN** a version is stored and `NEXT_PUBLIC_IMAGE_VERSION` is set
- **THEN** card face URLs carry the stored version.

#### Scenario: All four callers use it
- **WHEN** the home search rows, a card tile, a skills index leader chip and a skill page's top-card row are rendered
- **THEN** every card face `src` carries the same resolved version.

### Requirement: Admin Shows The Version Without Asking For Action
The admin SHALL NOT tell anyone to raise the image version or rebuild the web app. The dashboard SHALL show the current card-image version read-only (the stored value, or the fact that the default is in use) and SHALL present the last run that replaced images as information, not a warning. Counters of overwritten images SHALL keep showing their numbers.

#### Scenario: Dashboard after a raise
- **WHEN** the stored version is `202610281307` and the last run that replaced images raised it
- **THEN** the dashboard shows that version and one information line naming that run and its count, with no instruction to edit code or rebuild.

#### Scenario: Nothing stored
- **WHEN** the stored version is NULL
- **THEN** the dashboard says the default is in use and shows no warning.

#### Scenario: No manual wording anywhere
- **WHEN** the admin pages' source and rendered text are searched for `DEFAULT_IMAGE_VERSION` and "rebuild"
- **THEN** neither appears in any instruction to the admin.

