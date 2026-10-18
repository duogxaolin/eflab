## 0. Safety and baseline

- [x] 0.1 Create `~/eflab-backups/` (outside the repo) and take a custom-format dump with `docker exec eflab-postgres pg_dump -U eflab -Fc eflab`; prove it is readable with `pg_restore --list`. Abort the whole run if this fails. ← (verify: backup file exists outside the repo, `pg_restore --list` lists tables, `git status` shows no backup file)
- [x] 0.2 Record baseline numbers in the session scratchpad (not the repo): row counts, `count(*) filter (where jump=40)`, condition distribution, duplicate-id count across 10 pages sorted by Speed, results of "Mbappe" via `player.list`, search `EXPLAIN ANALYZE` time.
- [x] 0.3 Confirm `pnpm -r typecheck` passes before any edit, and note the starting `git status`.

## 1. Schema, migrations and bootstrap (packages/db) — design decisions 5, 6, 7, 17

- [x] 1.1 Generate a baseline migration from the committed schema with `prisma migrate diff --from-empty`, prefix it with `CREATE EXTENSION IF NOT EXISTS pg_trgm` and `unaccent`, add `migration_lock.toml`, and remove the broken `20260928_phase2_ext` migration.
- [x] 1.2 Edit `schema.prisma`: add `Player.nameNormalized`, make the 13 position `rating*` columns nullable without default, add `@@index([maxOvr, id])`, `@@index([ovr, id])`, `@@index([releaseDate, id])`, and remove the redundant single-column `cardType` and `ovr` indexes. Extend or rename the `CardType` enum only as Task 2.4 requires.
- [x] 1.3 Write the second migration with idempotent DDL: new column, `CREATE INDEX IF NOT EXISTS … USING gin ("nameNormalized" gin_trgm_ops)`, nullable ratings (`ALTER COLUMN … DROP DEFAULT/NOT NULL`), the new composite indexes and any `ALTER TYPE … RENAME VALUE`.
- [x] 1.4 Baseline the live DB: `prisma migrate resolve --applied <baseline>`, then `prisma migrate deploy` for the second migration. Remove `--accept-data-loss` from the `db:push` script. ← (verify: a scratch database created from migrations only has both extensions, the GIN index and the same columns as the live DB; `\d "Player"` matches schema.prisma; `_prisma_migrations` exists on the live DB)

## 2. Seeder and cross-fill correctness (packages/db) — design decisions 1–5

- [x] 2.1 Fix STAT_MAP and booster key mapping: `jumping→jump`, `set_piece_taking→placeKicking` (base) and the booster Phase 1c map plus its readable stat labels.
- [x] 2.2 Map `pos`→`registeredPosition` (verify the dump `pos` order equals `POSITIONS`), `condition` via `[E,D,C,B,A]`, `injury_resistance`, `player_value`→`marketValue`, `leg_length_height`→`dribbleHeight`, `name_normalized`→`nameNormalized`. Stop writing position ratings (leave null).
- [x] 2.3 Skills: add the 17 missing slugs to `fixtures/skills.json` and an alias table for the 3 renamed keys; make an unmatched `s_*` key a hard error.
- [x] 2.4 Card types: derive the code→label map from `players_meta.json`, cross-check it against pack names (Big Time, Strike Arena, POTW/POTD/POTS, Selection, Highlight), apply any enum rename or addition via the Task 1.3 migration, and publish `CARD_TYPE_LABELS` in `@eflab/shared`. ← (verify: every dump card-type code maps to the label in `players_meta.json`; no pack-name cross-check disagrees; STRIKE_ARENA or its renamed equivalent is non-empty if the dump has such cards)
- [x] 2.5 Restructure the seed: one interactive transaction with a long timeout; Player/Manager via `INSERT … ON CONFLICT DO UPDATE` over a generated dump-derived column list that excludes `CROSSFILL_COLUMNS`; Booster upsert (dump wins); other catalogue tables recreated inside the transaction; user tables untouched unless `--reset-users`; two-pass JSONL streaming instead of holding all rows. Confirm in schema that no recreate step cascades into user tables.
- [x] 2.6 Fix the cross-fill: write `maxGkClearing` with `gkClearing`; exact-id manager merge before name merge, no cross-version tactic leakage, alias map completed (Montella, Martinez); replace string-spliced `$executeRawUnsafe` with bound parameters or strict validation; fill `ratingGK…ratingCF` from eFHUB `overallGK…overallCF`; keep Phase 2b position overwrite consistent with `pos`.
- [x] 2.7 Add `pnpm db:refresh` (seed then cross-fill) at root and in `packages/db`; make `db:seed` print the cross-fill notice.
- [x] 2.8 Write `scripts/verify-seed.py` (`python3 -I`, streams `players.jsonl`, read-only `psql`) asserting the Requirements of `efootbase-data-integrity` (jump/set-piece distribution, `pos` equality, condition distribution, skill row count, card-type distribution, booster magnitudes, player and manager counts). ← (verify: script exits non-zero when run against the pre-fix baseline numbers and zero after refresh)
- [x] 2.9 Run the live refresh exactly once, after 2.1–2.8 are final and Task 0.1 succeeded: `pnpm db:refresh`; run `scripts/verify-seed.py`. Expected: 48,410 players, ≥1,475 managers with tactics, 10,745 tier badges, user/session rows unchanged (8/12 at baseline). ← (verify: counts, user tables unchanged, jump/placeKicking no longer 48,407×40, registered position equals dump `pos` on 100% of dump rows)

## 3. Shared package (packages/shared) — decisions 4, 6, 15

- [x] 3.1 Add `normalizeSearchQuery`, `escapeLike`, `heightToFeetInches` and `CARD_TYPE_LABELS`; add `levelCap` and nullable ratings to the DTO types; slim `CardPreview` for lists.
- [x] 3.2 Schemas: `bigIntString` ≤ int8 max; integer filters bounded to int4; `ovrMin/ovrMax` up to 100; implement `clubId` (→ team) and `leagueId` (→ team league) filters in the API or drop them; remove from `SORT_FIELDS` and the `SortField` type every sort that has no real column (`squadNumber`, `nationalShirtNumber`, `sumOfAbilities`, `averageAbility`, `legCoverage`, `armCoverage`, `peakJumpHeight`, `torsoCollisionWidth`, `club`) and keep `playerValue` only because it now has data; add `defensiveStyle` and card-type-scope inputs used by the UI.
- [x] 3.3 Add a `test` script to the package that runs `progression.test.ts` and a new `helpers.test.ts` (feet/inch, normalisation, escaping) with `tsx`; assertions must set a failing exit code. ← (verify: `pnpm --filter @eflab/shared test` fails when an assertion is deliberately broken, then passes)

## 4. API (apps/api) — decisions 6, 7, 9, 11, 14

- [x] 4.1 Deterministic order: `[{sort}, {id}]` for `player.list` and `skill.players`; check `EXPLAIN` for the default view and the Speed sort and tune indexes per design decision 7.
- [x] 4.2 `player.compare` returns rows in `cardIds` order (dedupe, ignore missing).
- [x] 4.3 Search: `player.list q` and `player.search` use `nameNormalized` + escaped LIKE + trigram tier, with CJK `ILIKE` only for non-ASCII queries; `player.byId` returns null when `baseId` does not match the card.
- [x] 4.4 `featured.list` returns each bundle's `slug`; add `featured.bySlug`; stabilise slugs (name + date, not autoincrement id).
- [x] 4.5 `skill.list` includes `playerCount`; `skill.players` includes `total` and supports a top-N call; `player.trending` uses the `(releaseDate,id)` window query (decision 14); `player.list` returns the slim `CardPreview` shape.
- [x] 4.6 Robustness: guard `decodeURIComponent`; `WEB_ORIGIN`-driven CORS; explicit `NODE_ENV` in the `dev`/`start` scripts; `isDev` and cookie `Secure` derived from it; tRPC `maxBatchSize` 10; non-deprecated `maxParamLength`; `TRPCError` for expected failures (`signIn` UNAUTHORIZED, unknown player NOT_FOUND, conflicts CONFLICT); out-of-range ids → BAD_REQUEST; stop leaking Prisma errors outside development.
- [x] 4.7 Register `/health` returning `status` and DB connectivity; rebase stored R2 URLs onto `R2_PUBLIC_BASE` when set.
- [x] 4.8 Google OAuth: require `email_verified` and a verified local email before linking; redirect error cases to an existing page; fix the listen guard so a path with spaces or a symlink still starts the server (`pathToFileURL(process.argv[1])` comparison). ← (verify: every spec scenario of `site-quality-baseline` "API Robustness" and "Safe Account Linking" is exercised by curl or a script; stack traces absent with `NODE_ENV=production`)

## 5. Web — data and behaviour (apps/web) — decisions 8–10, 12, 13, 15

- [x] 5.1 `/players`: URL-driven state (`q`, type scope, filters, sort, order, page), reset to page 1 on any change, visible card-type scope with an "All" option, windowed pagination with first/last/prev/next, scroll to top on page change.
- [x] 5.2 Playing Style popover built from `PLAYING_STYLES` and the real attack/defence ids; defence selection sends `defensiveStyle`; nationality fallback list built from real country ids (or removed in favour of a skeleton).
- [x] 5.3 Home: quick filters as specified (`Epic & Big Time` sends `cardTypeIn: ["EPIC"]` — Big Time cards are stored under EPIC, Show Time under HIGHLIGHT, per efootbase's own labels; `90+ OVR` sends `ovrMin` which `/players` reads); remove fabricated comments, creator spotlight and third-party hotlinks; "Latest Packs" links by slug.
- [x] 5.4 `/packs/[slug]` page backed by `featured.bySlug`; `/packs` links by slug; bundle dates formatted in UTC.
- [x] 5.5 Skills pages use `playerCount`, `total` and real top cards; remove synthesised rarity/rank/boost/Showtime values; empty state for zero-holder skills.
- [x] 5.6 Detail page: floor feet/inch conversion, defence card from defensive data, weak-foot stars equal to the level, "…" only when more skills exist, real MAX LEVEL badge from `levelCap`, null-safe Pitch Map showing "n/a" and a Best Fit based on non-null ratings; hide the inert Progression sliders, Max OVR preset and Manager Proficiency control (decision 12).
- [x] 5.7 Compare: all panels in selection order using `.find` by id; Swap swaps every panel; `?ids` stays in sync after removals; picker shows labels from `CARD_TYPE_LABELS`.
- [x] 5.8 Server wrappers: `page.tsx` server components for the three detail routes (fetch, `notFound()`, `generateMetadata`) and static `metadata` for list routes; existing client code moved to `*Client.tsx`; add `not-found.tsx` and `error.tsx`. ← (verify: bogus player/pack/skill URLs and a mismatched `baseId` return HTTP 404 from `next start`; titles contain the entity name)
- [x] 5.9 Data-fetching quality: `QueryClient` without 4xx retries and with sensible `staleTime`/focus settings, `isError` + Retry on every data page, `useDebouncedValue(250)` on all three search inputs, `AuthProvider` without an idle `getSession`, `httpBatchLink` `maxItems: 10`.

## 6. Web — presentation, accessibility, performance, config (apps/web) — decisions 10, 11, 16

- [x] 6.1 Branding: app name and metadata, own SVG wordmark in the header (remove `efbase_icon.webp` usage), footer text, optional build stamp from env/git; no "eFootBase" or `8d9068b` string anywhere in `apps/web`.
- [x] 6.2 `PlayerCard`: lazy/async images with dimensions, first-row eager option, link-based navigation, accessible name, visible focus style, valid face-error placeholder, tilt disabled under reduced motion.
- [x] 6.3 CSS: move component classes into `@layer components`; single tier-colour token source; fix `statLabel` camelCase splitting; fix horizontal overflow (Pitch Map, pagination, compare bars, popovers) at 320–480 px.
- [x] 6.4 Accessibility: popover `aria-expanded` + Escape + focus return; ⌘K palette and compare picker as named modal dialogs with focus trap and restoration; carousel pauses on focus, hidden tab and reduced motion and has a pause control; Language/Cookie placeholder buttons removed or made functional.
- [x] 6.5 `next.config.ts`: `loadEnvConfig` for the repo root, absolute `outputFileTracingRoot`, restricted `images.remotePatterns`, baseline security headers, build-time git stamp; add `apps/web/.env.example` or document the root-env mechanism; assert that no non-`NEXT_PUBLIC_` secret appears in `.next/static`.
- [x] 6.6 Browser checks in the session scratchpad (Playwright installed outside the repo, or headless Chrome fallback): no horizontal overflow at 320/375/480 px on `/`, `/players`, a detail page and `/compare`; `/packs` first-load image request count <40 and <6 MB; keyboard Tab/Enter reaches and opens cards; reduced-motion disables auto-advance. ← (verify: measurements recorded with numbers for each of the spec scenarios; screenshots kept out of the repo)

## 7. Docs, config and tooling — decisions 11, 18

- [x] 7.1 Replace the committed third-party keys in `docs/apk-db-expansion.md` and `docs/efootbase-ui-dna.md` with `<redacted>` in the working tree; do not rewrite history and do not print the keys in logs or reports.
- [x] 7.2 Update `CLAUDE.md`, `README.md`, `openspec/ui-dna.md`, `docs/README.md` and `.env.example` to match the implementation: seed/refresh behaviour, single-image card, zinc+lime theme tokens, bucket `efootlab`, script list, setup commands (`db:generate → db:migrate → db:refresh`), env loading, public-repo warning; mark specs of removed features (articles, community-feed, community-hub, tier-list-creator, user-authentication, user-profiles, tournaments-leaderboard, pro-paywall-scaffold, new-players, manager-database, build-simulator) as removed or archived with a short note.
- [x] 7.3 Rewrite `scripts/smoke-test.sh`: start the API on a spare port, wait for `/health`, run checks matching current data (featured bundle "National All-Stars", Conte quickCounter ≥ 88 after refresh, skill count 84, the card-type enum names STANDARD/LEGENDARY/TRENDING/SELECTION/EPIC/HIGHLIGHT/STRIKE_ARENA each present with STRIKE_ARENA non-empty, pagination duplicates, compare order, accent search), clean up processes, exit non-zero on any failure.
- [x] 7.4 Add the `test` task: `turbo.json` task, package `test` scripts, root `pnpm test` = unit tests then smoke test; bind docker Postgres/Redis to `127.0.0.1` in `docker-compose.yml`; write down that no CI exists. ← (verify: `pnpm test` passes on the refreshed DB and exits non-zero when an assertion is broken; `docker-compose.yml` ports show `127.0.0.1:`)

## 8. Final verification and report

- [x] 8.1 `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @eflab/web build` all pass with no new warnings that this change introduced.
- [x] 8.2 Re-run every baseline measurement from Task 0.2 and record before/after numbers for C03–C08, C23, C24, C27, C29, C45, C52 and C63 (jump=40 count, `/packs/<slug>` 200 and card count, page overlap count, "Mbappe" result count, compare order for `[A,B]` and `[B,A]`, Target Man correctness, One-Time Pass count, `/packs` image count). ← (verify: each number matches the spec scenario threshold)
  - Recorded by the verify run (after fixes W1/W2/W4/W5, S2/S4): jump=40 count 48,407 → 8 (== dump); `/packs/<slug>` 200 with cards; page overlap 0 across 10 sorts; "Mbappe" 0 → 48 results; compare `[A,B]`/`[B,A]` ordered; Target Man 24/24; One-Time Pass 8,909; `/packs` 19 image requests / 1.76 MB.
- [x] 8.3 Confirm `git status` shows only in-scope files, no keys, dumps, backups or the audit report; do not commit or push; list for the owner the out-of-scope items (history rewrite for pushed keys, dead procedures/tables/components, Konami font licence, build-simulator rules, CI).
- [x] 8.4 Stop every process started for verification (API and `next start` ports) and confirm the ports are free.
