## Context

See proposal.md. State before this change (main `ca21b89`):

- Catalogue = the 2026-10-18 dump (`dump/efootbase/`, manifest `dumpedAt` 2026-10-18T16:00:00Z): 50,691 cards, 2,065 packs, 24 featured bundles, 69 picker managers from the 2026-10-18 static snapshot (`dump/efootbase/static/managers.json`, 69 objects, read through the fixture `packages/db/fixtures/managers.json`).
- Dump rows already carry `league` (the card's own league), `avgRating`, `ratingCount`, `views`, `syncedAt`, `viewsUpdatedAt`. The seed stores `avgRating` / `ratingCount` / `views` (5,793 cards with ratings on 2026-10-18) but not `league`; 14 teams have cards in two leagues (for example Vissel Kobe 121 cards in league 26 and 44 in league 30).
- `player.list` filters leagues through `Player.team.leagueId`; `manager.picker` orders by rating DESC, id ASC.
- `scripts/efootbase_dump.py` supports `--out <dir>`, `--etag-vs-bucket <public base>` (download a card image only when the bucket lacks it or holds another body), `--skip-from <old dump>` (known hash-named emblems), `--dumped-at`, `--validate-only`, `--key-from-env`; the seed reads its dump / meta / packs / static locations from configuration (staging supported). `scripts/r2_upload.py` needs `boto3`, which the system `python3` lacks.
- The source key sits in a 0600 env file in the session scratchpad (never printed); R2 credentials in the root `.env`.
- The survey harness (real headed Chrome through Playwright, fresh profile per load, navigation guard, passive capture of the page's own responses) is in the outside-repo survey folder; the 2026-10-23 S4 load met a Cloudflare managed challenge on the page's own API calls and was stopped.

## Goals / Non-Goals

**Goals:** a refreshed, verified catalogue; the card's league stored and used by the League filter; the Community Rating filter; Top rated only if measured; the picker in the reference's order; nothing third-party in the repository; the procedure stops at any challenge.

**Non-Goals:** the S4 features; Next 16; the eFHUB source refresh; any change to the training/overall engine.

## Decisions

### D1. Code before data
All code (migration, mapping, API, web, verify-seed mirror, tests on scratch databases) lands and passes its gates **before** any request to the source, so the refresh writes the new columns in one seed and the live database is migrated only once, right after the backup. Top rated is the exception: its rule is measured after the dump (D7).

### D2. Schema (one additive migration)
- `Player.leagueId Int?` with an index `(leagueId)`; no foreign key (the seed replaces League rows inside its transaction and a card league missing from the table stores NULL — design choice to keep the replace-all semantics of catalogue tables).
- `Manager.pickerOrder Int?` (0-based position in the snapshot; NULL for non-picker managers).
- `CatalogueMeta` single row (`id = 1` CHECK, `playersDumpedAt timestamp(3)`, `seededAt timestamp(3)`), inserted by the migration with NULLs. Written by the seed only (time-safe typed queries, never a raw `Date` parameter — the worker lesson in CLAUDE.md).
- No change to existing columns; rollback = drop the three objects (SQL in the docs).

### D3. Mapping
`efootbase-map.ts` (shared by the seed and the worker) maps `league` → `leagueId` when it is a known League id (the seed knows the League ids it writes in the same transaction; the incremental run loads them), else NULL, and keeps `avgRating` / `ratingCount` / `views` as today. The seed reads the manifest's `dumpedAt` (the dump script writes it; the worker passes `--dumped-at`) and upserts `CatalogueMeta`; a dump without it keeps the stored value and prints a notice. The seed writes `pickerOrder` with the existing dedicated UPDATE that sets `inPicker` (index in the snapshot array). `scripts/verify-seed.py` gains the league and picker-order checks and the `CatalogueMeta` date check.

### D4. API and web
- `player.list`: `leagueIds` → `leagueId IN (…)` on Player (index-backed); `ratingMin` (int 2–10) → `avgRating >= ratingMin` (rows with NULL never match); `sort: "top"` only when `TOP_RATED` is enabled in shared constants (D7) — otherwise the existing legacy mapping `top → highest` stays.
- `manager.picker`: `orderBy: [{ rating: "desc" }, { pickerOrder: { sort: "asc", nulls: "last" } }, { id: "asc" }]`.
- The dump date: a public `catalogue.meta` query (or a field on an existing public query — implementer's choice, documented) returning `playersDumpedAt`.
- Web: the rail control "Community Rating" (single slider 1–10, "All" at 1, 34/36 px rail styles of the existing controls), the "Ratings as of <Mon D, YYYY>" note in UTC, chip "Rating ≥ N", badge counting; URL key `rating` after `age` (the reference's position of `rating` in its canonical URL was not observed — eFootLab's choice); Top rated in the sort segment only when enabled.

### D5. Backup and staging
- Backup: `pg_dump -Fc` via the Postgres container (`docker exec … pg_dump`, credentials never echoed) to a dated file in the session scratchpad (outside the repo), then `pg_restore --list` on it. The path is reported, never committed.
- Staging: `dump/efootbase-2026-10-24/` (inside the git-ignored `dump/`). As on 2026-10-18, in two passes to keep the load on the source's CDN small: (a) data only (`--no-images`, `--dumped-at <UTC now, strict ISO>` — without it the manifest says `manual` and the seed keeps the old date), (b) after a row diff against the previous `players.jsonl` (new ids + rows whose content changed), images only for those cards (`--no-data --only-ids <list> --etag-vs dump/efootbase --skip-from dump/efootbase`: unchanged files skipped by CDN ETag = local MD5, known hash-named emblems skipped). The local `dump/efootbase/images/` mirror is what R2 holds (every image was uploaded from it), so this avoids one bucket HEAD per image on the rate-limited `r2.dev` URL. The key comes from the scratchpad env file through `--key-from-env`. Old `dump/efootbase/` is kept unchanged until promotion; after promotion the previous players/meta/packs/teams/manifest files are kept under `dump/efootbase-2026-10-18/` for diffing.
- `boto3` is installed into a venv in the session scratchpad and used through `SYNC_PYTHON`-style explicit interpreter paths; nothing is installed system-wide.

### D6. Static snapshot survey (before the dump)
One fresh-profile headed load of a player page (opening "Select Manager", reading each row: `img` address → id, name, rating, pills in DOM order) and one load of the skills index ≥ 97 s later. Read only rendered DOM; no bundle or API reading; stop at a challenge. Output: a new `dump/efootbase/static/managers.json` in the existing key shape (`id`, `name`, `rating`, `booster_1`, `booster_2`, `image`) in drawer order, the fixture updated fact-only for new managers, the new managers' art fetched from the reference's public manager image address once each and uploaded to `managers/{id}.webp` in resume mode (never replacing). If the skills index lists a skill not in `skills.json`, the change stops and reports it (a new skill needs its own snapshot work).

### D7. Top rated measurement (after the dump, same day)
Up to two loads of the reference's `/players?sort=top` (global and with `card=1`), reading the page's own list responses passively (as in S2): ids, average, votes. Compared with the freshly dumped ratings: K = the smallest vote count that reproduces both sets exactly (both checks must agree on one K; 10 and 11 were both possible on 2026-10-23), order = average DESC, tiebreak chosen among votes DESC / id DESC / max overall DESC only if it is the unique rule with zero inversions on cards whose ratings did not move. If K or the order is not unique → Top rated stays hidden (spec "Not determined"). The measured values are written here as "D7 result" and `TOP_RATED` is enabled with them.

### D7 result (2026-10-24) — determined: K = 10, average DESC, then card id DESC
**Loads** (real headed Chrome, fresh process and profile each, navigation guard, "Reject optional", in-page changes only through the page's own sort radios, Card Type toggles, scrolling and "Load more", ≥ 1.7 s apart): L1 15:24:52Z `/players?sort=top&card=4`, L2 15:27:18Z `/players?sort=top&card=0` (146 s later). Both documents 200, no challenge; all 20 of the page's own list responses 200 JSON; no 403 / 429 / 503; the guard blocked only RSC prefetches (175 / 170). **16 in-page changes** (7 + 9). The dump the readings are compared with was taken at 11:09:12Z the same day (4 h 16 min earlier).

**Response shape**: `{ players, page, hasMore }`, 24 rows a page; a row carries `id`, `base_id`, names, `featured`, `overall_rating`, `overall_at_max_level`, playing styles, `pos`, `condition`, `card_type`, boosters, `league`, `card_bg`, `team_name`, `nationality`, `max_level`, image addresses — **no average and no vote count**, so every comparison uses the dump's `avgRating` / `ratingCount` joined by id (every listed id is in the dump). The rendered tile order equals the API order on all 18 readings.

**Lists read**: Selection 6 (L1, L2), Standard 20 (L1, L2), Standard + Selection 26 (L2), Icons 18 (L1) — complete (`hasMore: false`); the global list 120 (L1, pages 1–5) and 48 (L2), Highlight 72 (L2), Trending 72 (L2) — prefixes. Icons was kept as a control only: it has no card with exactly 10 votes in the dump, so it cannot separate K = 10 from 11 (the reason the plan's "global + Icons" was replaced by Standard, Selection, their union, Highlight and Trending).

**K** (complete lists: listed set = dump cards of the filter with ≥ K votes; prefixes: no listed card below K and no absent card above the last listed average):

| List | n | K = 5 | 9 | **10** | 11 | 12 | 20 |
|---|---|---|---|---|---|---|---|
| Selection (L1, L2) | 6 | 10 ≠ | 6 = | **6 =** | 5 ≠ | 5 ≠ | 4 ≠ |
| Standard (L1, L2) | 20 | 41 ≠ | 24 ≠ | **20 =** | 17 ≠ | 17 ≠ | 11 ≠ |
| Standard + Selection (L2) | 26 | 51 ≠ | 30 ≠ | **26 =** | 22 ≠ | 22 ≠ | 15 ≠ |
| Icons (L1) | 18 | 41 ≠ | 21 ≠ | **18 =** | 18 = | 16 ≠ | 7 ≠ |
| Global prefix (L1 120 / L2 48) | — | 78 / 58 absent | 11 / 7 absent | **consistent** | 1 / 0 listed below | 3 / 0 | 10 / 1 |
| Highlight prefix (L2) | 72 | 56 absent | 11 absent | **1 absent** (drift, below) | 2 listed below | 4 | 21 |
| Trending prefix (L2) | 72 | 63 absent | 6 absent | **consistent** | 3 listed below | 6 | 21 |

Only K = 10 reproduces every complete set (four independent lists, two loads). The listed 10-vote cards (9 in all) are not a drift effect: 8 of them already had 10 votes on 2026-10-18 and gained none in six days (the ninth went 9 → 10), and of the seven absent 9-vote cards of Standard / Icons, three (33185, 133543, 17592454614538) had 9 votes already on 2026-10-18 and gained none (the other four rose from 7 or 8 to 9).

**Order**: candidates compared on every list — average (exact, rounded to 2 or 1 decimals, two Bayesian averages) with the tiebreaks id DESC / id ASC / votes DESC / votes ASC / max overall DESC / `time_added` DESC. Cards displaced by drift are those whose position contradicts the average order (minimal set, ties free — independent of the tiebreak hypothesis): 14 cards over all lists (L1 global 9, Icons 1, union 1, L2 global 2, Highlight 3; the same two cards in both global readings), mostly cards with hundreds of votes. Displaced cards per full rule (all lists summed): **average DESC, id DESC 18**; average, `time_added` DESC 26; average, votes DESC 37; average, id ASC 50; average to 2 decimals 85; average to 1 decimal 203; Bayesian (C = 5 / 10) 200 / 221; votes DESC alone ≥ 1,000 inversions. Tiebreak on the **98 distinct tied pairs** (equal stored average, both cards kept): id DESC 1 violation; votes DESC 55; votes ASC 33; max overall DESC 50; `time_added` DESC 30; id ASC 97; also checked: `_id` ASC / DESC 28 / 70, views DESC / ASC 14 / 14 (70 undecided), base id 61. Per list, id DESC has **0 violations** on Standard (L1, L2: the 8.5 tie of three cards, 10 / 16 / 10 votes), the union (4 pairs), Highlight (17 pairs, incl. the 9.0 group of four and the 8.6 pair where id and `time_added` disagree) and Trending (4 pairs); the global reading has the 13-card 9.0 group in strict id-descending order (its cards gained 0–3 votes in six days; `time_added`, votes and max overall all fail on it).

**The one unexplained pair**: global position 29 / 30 (both loads) — Trending 52785416510807 (9.125, 32 votes) before Epic 88038776505140 (9.125, 200 votes); id DESC orders them the other way. It is consistent with one later vote on 88038776505140 (a 9 makes 9.1244, exactly the observed place between 9.125 and 9.1236), but this cannot be verified: the list rows carry no rating. Recorded as unexplained, not as drift.

**Drift observed**: ratings move without the vote count changing (Epic 88041460993477, Icons 299067699666336 and 17592186179050, Highlight 106776376765788 gained no vote in six days yet sit out of the dump's average order), so the K evidence (counts) is robust and the order evidence rests on the displacement above. Highlight's prefix lacks 106766444574903 (8.692, 13 votes, released 2025-12-04 — unchanged count since 2026-10-18), whose dump average is above the prefix's last (8.6) — a moved average (a vote of 7 or less, or an edited vote); it does not block, as the complete sets were exact (no sign of a hidden filter).

**Residual**: "card type DESC, then id DESC" orders every observed tied pair exactly as id DESC (no observed pair separates them; it fails on the same 9.125 pair); in the current data no tie of cards with ≥ 10 votes would be ordered differently by the two (0 pairs), so the difference is not visible today.

**Verdict**: one K (10) and one order (stored average DESC, then the higher card id) hold on ≥ 2 independent checks with zero violations (Standard ×2 loads, the union, Highlight, Trending; Selection and Icons for the set), every rival tiebreak fails on at least one of them or on the 9.0 group. `TOP_RATED = { minVotes: 10, tiebreak: "id" }` (task 6.3): `player.list sort=top` = `ratingCount >= 10 AND avgRating IS NOT NULL ORDER BY avgRating DESC, id DESC` (`topRatedQuery` in `@eflab/shared`), checked against the readings: our Standard (20) and Selection (6) lists equal the reference's in both loads id for id, Icons the same 18 cards with the one moved pair swapped. Survey record (outside the repository): the survey folder's `top-rated/` (loads, actions, list bodies, harness, analysis scripts).

### D8. Data-independent acceptance
Smoke assertions that pinned 2026-10-18 numbers (`wonderkids` 8, `cote` 7, Icons+CB 23 / +LB 32, the reference link's two Messi cards, `messi` 113, Fortress rows, rarity ranks) are rewritten to compare the API with an independent read-only SQL computation of the same rule on the current data (the rule is what the specs fix; the 2026-10-18 numbers stay in the specs as dated examples). Engine oracle tests (fixtures) are data-independent and unchanged.

### D9. After the refresh
Rebuild the web against the refreshed API and restart :4000 then :3000 by port, check every page and `/_next/static` asset (the procedure used on 2026-10-24); raise `DEFAULT_IMAGE_VERSION` when the upload replaced card objects; update CLAUDE.md counts and data section, README and ui-dna.

## Risks / Trade-offs

- [Challenge during the dump or the survey] → stop, no retry for 6 h; the database is untouched until the seed (steps 1–5 write nothing to it); a partial staging directory is discarded.
- [Seed fails after the migration] → the seed is one transaction (catalogue unchanged); the backup restores the pre-migration state if needed.
- [Ratings drift between dump and survey] → measure the same day; compare only cards whose ratings did not move; otherwise Top rated stays hidden.
- [League ids missing from the League table] → NULL league, documented; verify-seed reports the count.
- [Smoke assertions weakened by making them data-relative] → each compares with an independent SQL computation of the rule, not with the API itself.
- [Manager art from the reference] → fact-only fixture in the repo; images only in R2 (as for the earlier snapshot).

## As built (group 1, code before data)

### Migration `20261024000000_catalogue_data_refresh`
Additive and idempotent (like `20261019230000_admin_sync_worker`): `Player.leagueId INTEGER` (nullable, no default — existing rows are not rewritten) + index `Player_leagueId_idx`, `Manager.pickerOrder INTEGER` (nullable), table `CatalogueMeta` (`id INTEGER DEFAULT 1` primary key, `playersDumpedAt` / `seededAt` `TIMESTAMP(3)`, CHECK `CatalogueMeta_single_row` = `id = 1` — raw SQL Prisma does not model) and its single row `(1, NULL, NULL)` (`ON CONFLICT DO NOTHING`). Checked on a fresh scratch database: all six migrations apply, a second row is refused by the CHECK, a replay of the file changes nothing, `prisma migrate diff` from that database to `schema.prisma` is empty.

Rollback (stop the API and the worker first; the backup of 2.2 is the other way back):

```sql
DROP TABLE IF EXISTS "CatalogueMeta";
DROP INDEX IF EXISTS "Player_leagueId_idx";
ALTER TABLE "Player" DROP COLUMN IF EXISTS "leagueId";
ALTER TABLE "Manager" DROP COLUMN IF EXISTS "pickerOrder";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261024000000_catalogue_data_refresh';
```

Checked on a scratch copy of the live database: after this SQL the three objects are gone and `prisma migrate deploy` applies the migration again.

### Mapping, seed, worker (D3)
- `cardLeagueId` in `efootbase-map.ts`; `buildPlayerRow` takes the known League ids as a required parameter: the seed passes the fixture leagues it writes, the incremental run the stored ids plus the leagues it inserts (it still inserts a fixture league only for a new team, as before — a card whose own league is in neither stores NULL and the run is not refused), the full run's comparison the fixture leagues (= what its seed child writes). `leagueId` is compared by value in the worker's change digest. **Consequence for group 4:** between `pnpm db:migrate` and the seed every stored `leagueId` is NULL, so a worker full run in that window would count every card as changed and compare every image — keep the worker stopped and seed right after migrating.
- The seed reads the manifest next to `players.jsonl` (no new variable; the worker's full-run staging already has it, written with `--dumped-at`). `parseDumpedAt` accepts strict ISO-8601 UTC only (`Z`, at most milliseconds, a real calendar time); anything else (absent, `"manual"`, an offset, an impossible date) keeps the stored value with a notice. Written with a typed `catalogueMeta.upsert` (proven exact under an `Asia/Ho_Chi_Minh` session in the full-run suite), together with `seededAt`.
- `pickerOrder` = index in the snapshot array (`loadStaticManagers` no longer sorts the ids), written by the one UPDATE that sets `inPicker` (`array_position − 1`), then checked: n flagged, distinct orders 0…n−1, none outside the picker. `pickerOrder` joined `MANAGER_STATIC_COLUMNS`, so the fixture upsert never writes it.
- `scripts/verify-seed.py` also checks `avgRating` / `ratingCount` / `views` against the dump (the data behind the Community Rating filter), and that the League rows equal `fixtures/leagues.json`.

### API and web (D4)
- The dump date is a new public query `catalogue.meta` → `{ playersDumpedAt: ISO | null }` (router `catalogue`), not a field on an existing query.
- `TOP_RATED` is a `TopRatedRule | null` (`minVotes`, `tiebreak`: `votes` / `id` / `maxOvr` — the D7 candidates), **null**: `top` stays a legacy alias of High to low, the sort segment shows three presets. With a rule, `top` becomes a preset (vote minimum as a filter, `avgRating` DESC, the tiebreak, id DESC) — task 6.3 only sets the measured values (and adds its checks). **Set by 6.3 (2026-10-24, D7 result): `{ minVotes: 10, tiebreak: "id" }`**; the `where` / `orderBy` pair now comes from `topRatedQuery(rule)` in `@eflab/shared` (unit-tested on synthetic rows, sent unchanged by `player.list`), so `sort=top` is Top rated and no longer High to low (the spec's intentional meaning change for old eFootLab links).
- `ratingMin` accepts a number or a digit string 2–10 (the `int4` pattern), never `z.coerce` (`null` / `true` / `""` / a fraction → 400).
- **Date line while no date is stored** (the live database until group 4, or `catalogue.meta` failing): the "Ratings as of" line is left out (never a guessed date) and the control keeps working on the stored ratings; once a seed stored the date it reads "Ratings as of Oct 18, 2026" (UTC, `formatUtcDate`).
- The slider is the Progression panel's `.efb-range` (16 px track, 44 px box on coarse pointers) at the end of the rail, after Age; every step applies at once (keyboard included); chip "Rating ≥ N"; the phone Filters badge counts it once; it is not a dialog row.

### Smoke (D8)
`scripts/smoke-test.sh` computes every data-dependent expectation with independent read-only SQL (psql, `default_transaction_read_only`) on the API's database — the first check compares the catalogue sizes. The name-or-pack rule folds pack names in Python exactly like `normalizeSearchQuery` (never SQL `unaccent`). Checks of procedures that read the new columns (`player.byId` / `player.compare` — full rows —, `manager.picker`, the League filter, `catalogue.meta`) are SKIPPED, counted apart, while the database lacks the migration; the checks of stored card leagues / picker order are SKIPPED until a seed wrote them.

### Findings on the 2026-10-18 data (scratch copy, seeded from `dump/efootbase`)
- League rule: leagues 4 ∨ 26 × Arsenal FC ∨ Vissel Kobe = **503** (the team-league rule gave 547; 44 Vissel Kobe cards are in league 30). 17,610 cards of 14 teams have an own league other than their team's: team "FREE" 17,166 (card league 48 "Free Agent", team league 0 "Other") — so League "Other" no longer lists those free-agent cards and "Free Agent" does —, and 13 Asian clubs (AFC competitions 30 / 31 vs their domestic league), 444 cards.
- The card page's league name still comes from the team's league (`player.byId`, unchanged): for those cards it can differ from the league the filter matched. Not in this change's spec — reported.
- Community Rating: Icons with an average of 10 = **24** (API = SQL); 5,648 cards rated ≥ 2; 44,901 unrated cards never match.
- Picker order of the 2026-10-18 snapshot inside rating 90: Roberto Martínez, Thomas Tuchel, Antonio Conte, José Mourinho, Cristian Chivu, Jürgen Klopp — the 2026-10-23 drawer order without Niko Kovač (added by group 3).

## Migration Plan

1. Code + migration on the branch, gates on scratch databases. 2. Check request. 3. Backup. 4. Snapshot survey. 5. Staging dump + validation. 6. `pnpm db:migrate` on the live database. 7. `pnpm db:refresh` from staging, `verify-seed.py --after-crossfill`. 8. Images to R2 + version bump. 9. Promote staging. 10. Top rated survey → enable or keep hidden. 11. Acceptance, docs, rebuild/restart. Rollback: `pg_restore` of the backup into the live database (drops the new columns with it) and revert the branch.

### Survey result 2026-10-24 (group 3)
Drawer: 70 managers (69 + Niko Kovač 90, id 17610439655559, Ball Control / Defensive Engagement); both Xabi Alonso 88 cards (17593796759765, 17598897033429) are listed; no removal or change; order inside each rating = the previous snapshot's order with Kovač last among the 90s. Skills index: 67 tiles, identical to `skills.json`. Kovač's art came from the image the page itself loaded (no extra request) and is on R2 (`managers/17610439655559.webp`, HEAD 200). Cross-fill note: the name merge will give the new Kovač 90 the tactics of eFHUB coach 135 (not a Manager row, so the existing skip rule does not apply); manager tactics are not displayed anywhere — recorded as a known limitation, the cross-fill rule is not changed in this change.
