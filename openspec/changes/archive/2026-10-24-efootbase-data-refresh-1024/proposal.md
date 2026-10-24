## Why

eFootLab's catalogue is the 2026-10-18 efootbase dump. The 2026-10-23 survey found it stale (cards released since, 9 new packs and 10 dropped, a new manager Niko Kovač 90 — the 2026-10-24 drawer reading shows 70 picker managers and keeps both Xabi Alonso 88 cards (the 2026-10-23 note "one Xabi Alonso" came from two rows with identical text being merged) —, the manager order inside a rating) and found two filters that need data eFootLab does not store yet: the League filter (efootbase uses each card's own league, eFootLab the card's team — leagues 4 ∨ 26 with Arsenal FC ∨ Vissel Kobe: 503 against 547) and the community ratings behind Top rated and Community Rating. On 2026-10-24 the owner decided to refresh the data now that change `efootbase-function-parity` is merged, to store the card's league, and to build the ratings features from freshly dumped ratings shown with their date.

## What Changes

- **Schema (additive migration):** `Player.leagueId` (the card's own league, dump `league`), `Manager.pickerOrder` (efootbase's picker order), and a single-row `CatalogueMeta` holding the date of the dump the catalogue was seeded from.
- **Mapping:** the shared row mapping writes `leagueId` (seed and incremental sync); the seed writes `pickerOrder` from the static manager snapshot's order and the dump date from the dump manifest; `scripts/verify-seed.py` checks both.
- **League filter** matches the card's own league (**BREAKING (result set)**: cards of the 14 teams that have cards in two leagues are filtered by their card league, as on the reference).
- **Community Rating filter** on `/players` (`rating=N`, average community rating ≥ N, a single 1–10 slider, "All" at 1), shown with "Ratings as of <date>".
- **Top rated sort** (`sort=top`), offered only if the survey of this change determines its vote minimum and order on at least two checks; until then it stays hidden. When offered, `sort=top` takes the reference's meaning (**BREAKING (URL meaning)**: old eFootLab `sort=top` links meant High to low).
- **Manager picker order:** rating descending, then efootbase's order.
- **Data refresh (operations, owner-approved order):** one check request to the source → `pg_dump` backup → static snapshot refresh by reading the manager drawer and the skills page in a real browser (no bundle or API reading) → full dump into a staging folder (images compared with the bucket) → validation → migration → `db:refresh` (seed + cross-fill) → `verify-seed.py --after-crossfill` → upload of new and changed images → image version bump when card images were overwritten. Any challenge stops the work.
- **Survey after the dump:** Top rated (vote minimum, order, tiebreak) and Community Rating checked against the fresh data.
- **Acceptance and docs:** smoke assertions that pinned 2026-10-18 numbers become data-independent (API result = independent read-only SQL for the same rule); CLAUDE.md counts, data section and limitations; ui-dna register; rebuild and restart of the local servers by port.
- Not in this change: the S4 features (Form, Position Training, weak-foot and stamina chips, In-Match Roles, radar, skill type chips), the Next 16 upgrade, a refresh of the eFHUB cross-fill source.

## Capabilities

### New Capabilities
- `catalogue-data-refresh`: the refresh procedure and its safety rules, the stored dump date, the card-league filter rule, the Community Rating filter, the conditional Top rated sort and the manager picker order.

### Modified Capabilities
- `catalog-browsing-parity`: Sort Presets (Top rated conditional), Page State Lives in the URL (`rating`, `sort=top`), Additional Player Filters (card league, Community Rating), Search Scope Is Visible and Changeable (catalogue count no longer pinned).
- `efootbase-function-parity`: Unmeasured Functions Are Not Shown (Community Rating built; Top rated conditional).
- `efootbase-data-integrity`: Faithful Player Field Mapping (league, ratings, dump date), Manager Picker Roster (count and order from the snapshot), Single Refresh Command Preserves Cross-Fill (counts relative to the dump).
- `full-data-seed`: Full Dataset Ingestion (counts relative to the dump).
- `site-quality-baseline`: Search Performance (catalogue size no longer pinned).
- `player-progression-simulator`: Manager Selection (picker order).

## Impact

- **DB:** one additive migration (two nullable columns, one table with a single row, one index); live database migrated only after the `pg_dump`.
- **Code:** `packages/db` (schema, mapping, seed, verify-seed mirror in `scripts/verify-seed.py`), `apps/worker` (incremental writes `leagueId` through the shared mapping), `apps/api` (`player.list` league / rating / top, `manager.picker` order, a `catalogue.meta` or equivalent field for the dump date), `packages/shared` (schemas, URL codec, constants), `apps/web` (rail control, sort option, date note), `scripts/smoke-test.sh`.
- **Data / external:** requests to efootbase's API and site (check, full dump, ≤ 5 survey page loads), R2 uploads, local `dump/` replaced after promotion; no secret, dump file, backup or reference asset enters the repository.
- **Docs:** CLAUDE.md, README.md, `openspec/ui-dna.md`, `docs/efootbase-static-snapshot.md`.
