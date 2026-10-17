## Context

See proposal.md for motivation and the capability list. Current constraints that shape the approach:

- **Data flow**: efootbase dump (`players.jsonl`, `players_meta.json`, `packs.json`) → `db:seed` → Postgres 16 (docker, host port 5433) → `db:crossfill` (eFHUB SQLite) → Fastify/tRPC API → Next.js client-rendered pages.
- **Live database**: created with `prisma db push`, so it has no `_prisma_migrations` table. The extensions `pg_trgm` and `unaccent` exist only because they were created by hand, and there is no trigram index.
- **Seeder**: its phase 1b deletes 14 tables, including Player, Manager and the user-generated tables, and then reloads without a transaction.
- **Cross-fill data**: `db:crossfill` is the only writer of `reputation`, `overallPotential`, `gkClearing`, `stars`, `communityTier`, the manager tactics and the 3 extra players.
- **Web**:
  - Every page is a client component, so there is no server-side 404 or per-page metadata.
  - Next.js loads `.env*` only from `apps/web/`.
  - The `@eflab/api` import is type-only.
- **Repository**: public on GitHub; `main` is pushed.
- **Verification tooling**: no Playwright or browser test runner is installed. Headless Chrome may exist on the machine.

## Goals / Non-Goals

**Goals:**
- Fix each defect at its root: the seeder, the query layer and the component contracts.
- Make re-seeding safe, so that "seed, then cross-fill" is one command and a seed alone never destroys user data or cross-fill columns.
- Keep every change verifiable by a command (SQL against the live DB, HTTP calls to the API, build output, a headless-browser check).

**Non-Goals:**
- Deleting dead procedures, tables or components. Fix what is live; report the rest.
- Rewriting git history or deciding the licence of the Konami fonts.
- A new CI service.
- A faithful game-rule build simulator. The dump has no training rules; see Decision 12.

## Decisions

### 1. Seed becomes an upsert-in-one-transaction; cross-fill columns are never written by the seed
All catalogue writes happen inside one interactive Prisma transaction with a long timeout.
- **Player and Manager**: written with `INSERT … ON CONFLICT (id) DO UPDATE SET <dump-derived columns>`. The column list is generated from the Prisma model minus a `CROSSFILL_COLUMNS` constant, so cross-fill-owned columns survive a re-seed. Rows absent from the dump are not deleted (log the count; an opt-in `--prune` removes them).
- **Country, Team, League, Pack, PackCard, FeaturedBundle(+Card), Skill, PlayerSkill**: deleted and recreated inside the same transaction. A failure rolls everything back.
- **Booster**: upsert by id, dump wins.
- **User tables** (User, Account, Session, Build, Review, TierVote, TierList, Post, Comment, Follow, PostLike): untouched unless `--reset-users` is passed.
- **Foreign keys**: the implementer must confirm that no recreate step cascades into user tables.
- **Memory**: the seeder streams the JSONL twice (collect lookups, then write) instead of holding about 750 MB of rows.

*Alternatives rejected:*
- Keep delete-and-reload but run the cross-fill automatically. It still loses user data and is non-atomic.
- A staging schema swap. It needs duplicate DDL and is heavy for a dev database.

### 2. `pnpm db:refresh` = seed then cross-fill
Because the cross-fill still writes registered positions and the 3 extra players, the documented command is `db:refresh`. A standalone `db:seed` prints a notice that it does not refresh cross-fill data. Per-position ratings stay cross-fill-owned.

### 3. Field mapping fixes live in one place and are tested against the dump
- **Mapping corrections**: STAT_MAP and the booster mapping use the dump's real keys, and `registeredPosition` is read from `pos`. `condition` indexes `[E,D,C,B,A]`, and `injury_resistance`, `player_value`, `leg_length_height` and `name_normalized` are mapped.
- **Verification script**: a new `scripts/verify-seed.py` (run with `python3 -I`) streams `players.jsonl` once and compares aggregate counts and spot rows with the DB through read-only `psql`, so mapping regressions are caught by a command rather than by eye.
- **Skills**: the 17 missing slugs are added to `fixtures/skills.json`; the 3 renamed keys get an explicit alias table. The seeder fails loudly (non-zero exit) on any unmatched `s_*` key instead of logging it.

### 4. Card types come from the dump's own labels
The apply agent reads `players_meta.json` and builds the code→label map from it.
- **Validation**: it is checked against pack names (Big Time packs, Strike Arena, POTW/POTD/POTS, Selection, Highlight).
- **Enum**: if the Prisma `CardType` enum lacks a name for a meta label, add it with a migration; rename values with `ALTER TYPE … RENAME VALUE` so existing rows keep their meaning.
- **Labels in the UI**: a single `CARD_TYPE_LABELS` table in `@eflab/shared` feeds the seeder checks, `card-display.ts`, filters and quick filters. Raw enum names are never shown.
- **Default scope**: the `/players` default scope is redefined from efootbase's own behaviour and shown in the UI (Decision 8).

### 5. Position ratings: nullable, cross-fill-owned
- **Schema**: the 13 `rating*` columns become nullable with no default, so the seed no longer writes 40s.
- **Cross-fill**: it writes `overallGK … overallCF` from eFHUB.
- **DTO and Pitch Map**: the DTO sends `null` for missing values and the Pitch Map renders "n/a".
- **Best Fit**: it uses only non-null ratings and falls back to the registered position.

### 6. Search: normalised column + trigram GIN index, normalisation done in application code
- **Column and index**: add `Player.nameNormalized` (the dump's `name_normalized`, lower-case ASCII) with `CREATE INDEX … USING gin ("nameNormalized" gin_trgm_ops)`. Because the index is on a plain column, no IMMUTABLE `unaccent` wrapper is needed.
- **Query normalisation**: the query string is normalised in TypeScript (`NFD`, strip combining marks, lower-case) by a shared `normalizeSearchQuery`. This also avoids the C-locale `lower()` limitation of the docker database.
- **SQL**: `player.search` and `player.list` use `nameNormalized LIKE '%' || $q || '%'` with `%`, `_` and `\` escaped. The fuzzy tier uses `nameNormalized % $q`.
- **Ranking**: the existing tiers stay (substring before fuzzy; `similarity DESC, ovr DESC` inside a tier).
- **CJK**: Japanese and Chinese names are matched with `ILIKE` on their own columns, only when the query contains non-ASCII characters.
- **Minimum length**: 2 characters.

*Alternative rejected:* an expression index on `unaccent(lower(name))`. It needs an IMMUTABLE wrapper and does not fix the C ctype issue.

### 7. Deterministic pagination with composite indexes
- **Order**: every `orderBy` becomes `[{ <sort>: dir }, { id: dir }]`. `skill.players` gets the same tiebreaker.
- **Indexes**: add `(maxOvr, id)`, `(ovr, id)` and `(releaseDate, id)`, and drop the redundant single-column `cardType` and `ovr` indexes.
- **Budget**: the implementer measures `EXPLAIN ANALYZE` for the default view (page 1 and page 500) and for Speed, and keeps the default list under 100 ms. Wider composites are added only if the plan needs them.

### 8. `/players` URL as the single source of state
- **Parameters**: `q`, `type` (the visible card-type scope), `pos`, `style`, `dstyle`, `nat`, `foot`, `ovrMin`, `maxOvrMin`, `sort`, `order`, `page` are read with `useSearchParams` and written with `router.replace`.
- **Reset rule**: changing any filter or `q` sets `page=1`.
- **Scope**: a visible "Card types" control shows the active scope and has an "All" option. Text search uses the scope in the URL (default "All" when `q` is present).

### 9. Pack pages become bundle pages by slug
- **API**: `featured.bySlug` returns a bundle with its ordered cards.
- **Route**: `/packs/[slug]` uses it, and the carousel and `/packs` link by slug.
- **Slug source**: FeaturedBundle slugs are derived from name and release date, never from the autoincrement id.
- **Pack model**: it stays in the API and DB, and the Pack-based page is no longer routed.

### 10. Server wrappers for 404, metadata and branding
- **Detail routes**: `players/[baseId]/[cardId]`, `packs/[slug]` and `skills/[slug]` get a thin server `page.tsx` that fetches over HTTP from the API (`API_INTERNAL_URL`, defaulting to `NEXT_PUBLIC_API_URL`), calls `notFound()` on a miss or when `baseId` does not match the card, and exports `generateMetadata`. The existing client component becomes `*Client.tsx` and receives `initialData`.
- **List routes**: `/players`, `/compare`, `/skills` and `/packs` get static `metadata` through the same wrapper pattern.
- **Config**: these server fetches use `dynamic = 'force-dynamic'` and a short `revalidate` so `next build` does not need the API.
- **Branding**: the app name is "eFootLab". The logo is a self-made SVG wordmark. The build stamp is read from `NEXT_PUBLIC_GIT_SHA` / `NEXT_PUBLIC_BUILD_UTC`, which `next.config.ts` fills from `git` when available, and is hidden otherwise.

### 11. Environment and configuration
- **Web env**: `next.config.ts` calls `loadEnvConfig` from `@next/env` on the repository root so `NEXT_PUBLIC_*` in the root `.env` take effect in dev and build. The code fallbacks stay as a last resort.
- **R2 domain**: the API rebases stored R2 URLs (flags, emblems, manager art) onto `R2_PUBLIC_BASE` when it is set, which makes "change the R2 domain with the env vars" true without rewriting the DB.
- **API**:
  - `WEB_ORIGIN` (a comma-separated allow-list) drives CORS.
  - `NODE_ENV` is set explicitly by the scripts (`dev` = development, `start` = production).
  - tRPC `isDev` and cookie `Secure` depend on it.
  - `maxBatchSize` is 10, and the web client's `httpBatchLink` uses `maxItems: 10`.
  - `maxParamLength` is lowered and moved to the non-deprecated Fastify option.
- **Errors**: expected failures use `TRPCError`. A `try/catch` around cookie decoding ignores undecodable cookies.
- **Image hosts**: `images.remotePatterns` is limited to the R2 host (from env) and the efimg host if still used.
- **Next config**: security headers are added, and `outputFileTracingRoot` becomes an absolute path.

### 12. Progression panel: remove inert controls (conscious trade-off)
- **Why not wire it**: the dump has no training rules, and the shared engine's budget, OVR formula and caps are unverified against `max_attributes`.
- **What we do**: hide the Progression sliders, the Max OVR preset and the Manager Proficiency control on the detail page. The real max-level stat view from the dump stays.
- **What is not done**: a functional build simulator. This is reported as a limitation (it needs rules the dump lacks), not hidden.
- **Related fixes**: the shared engine defects stay documented only. They are reachable solely through an unused API procedure.

### 13. Skills and home content from real data
- `skill.list` returns `playerCount` from a grouped count of `PlayerSkill`, plus the category. `skill.players` returns `total` and the top cards.
- Share is `count / total players`. Rarity, rank, stat-boost and Showtime badges are removed because the data does not provide them.
- Fabricated home sidebar sections (comments, creator spotlight and third-party hotlinks) are removed.

### 14. Cheaper endpoints
- **Trending**: it reads the newest cards through the `(releaseDate, id)` index with a window (200 rows, widened ×4 until 18 distinct bases are found) and de-duplicates by `baseId` in application code. No full scan, and no cache layer to invalidate.
- **List**: `player.list` returns the slim `CardPreview` shape that the grid uses. The detail and compare views keep the full DTO.
- **Detail**: `byId` no longer returns fields nothing renders.

### 15. Detail pages and shared helpers
- `heightToFeetInches` (floor feet, round inches with carry), `normalizeSearchQuery` and `CARD_TYPE_LABELS` live in `@eflab/shared`.
- Their tests use the same `tsx` assert-style runner as `progression.test.ts`.
- The DTO gains `levelCap`, so the MAX LEVEL badge is real.

### 16. Front-end quality changes
- **Lazy images**: `PlayerCard` images use `loading="lazy"`, `decoding="async"` and explicit width/height. Cards in the first viewport (the first row of a grid) may opt into `priority` eager loading.
- **CSS**: component classes in `globals.css` move into `@layer components` so utilities win.
- **Responsive**: the Pitch Map and other fixed widths use container-relative sizing.
- **Reduced motion**: tilt and carousel check `prefers-reduced-motion`.
- **Dialogs**: the ⌘K palette and the compare picker use the native `<dialog>` element (or an equivalent focus-trap).
- **Cards**: a card tile is a real `<Link>`; a nested clickable `<div>` is removed.
- **Data fetching**: the `QueryClient` default `retry` is a function that does not retry 4xx. Pages render an error state with a Retry button from `isError`. Search inputs use a shared `useDebouncedValue(250)` hook. `AuthProvider` no longer calls `getSession` unless a consumer mounts.
- **Dates**: bundle dates are formatted with `timeZone: "UTC"`.

### 17. Database bootstrap and migrations
- **Baseline**: generate a baseline migration from the committed schema (before this change's schema edits) with `prisma migrate diff --from-empty`, prefixed by `CREATE EXTENSION IF NOT EXISTS pg_trgm; … unaccent;`. The broken `20260928_phase2_ext` migration is removed.
- **Second migration**: it carries this change (nullable ratings, `nameNormalized`, indexes, any enum rename), written with idempotent DDL.
- **Live DB**: it is baselined with `prisma migrate resolve --applied`, then `migrate deploy` applies the second migration.
- **Scripts**: `db:push` loses `--accept-data-loss`. The documented setup becomes `db:generate → db:migrate → db:refresh`.

### 18. Verification tooling without new runtime dependencies
- **Smoke test**: `scripts/smoke-test.sh` starts the API itself on a spare port, waits for `/health`, runs its checks (corrected to current data) and cleans up. The root `pnpm test` runs the unit tests and then the smoke test.
- **Data checks**: `scripts/verify-seed.py` (Decision 3) plus SQL assertions.
- **API checks**: duplicate/skip detection across pages, compare order and accent search run as extra smoke-test checks.
- **Browser checks** (overflow at 320/375/480 px, lazy-image request count, keyboard focus, reduced motion): run with Playwright installed in the session scratchpad, not added to the repository. If a browser download is impossible, fall back to headless Chrome with `--dump-dom` plus an injected measurement script.

### 19. Safety procedure for the live dev database
1. Before any DB change: `docker exec eflab-postgres pg_dump -U eflab -Fc eflab > ~/eflab-backups/<timestamp>.dump` (outside the repository), then `pg_restore --list` on the file to prove it is readable. Abort the task if either step fails.
2. Apply the migrations, then run `pnpm db:refresh` once, after all seeder edits are final.
3. Re-run the data checks.
4. Never run `db:push --accept-data-loss`, and never run a reseed more than once per verification cycle.
5. Never commit the backup, dumps, keys or the audit report.

## Risks / Trade-offs

- **[Risk]** The single reseed transaction runs for minutes and holds locks → Mitigation: run when no other process uses the DB; set a generous transaction timeout; the seed is documented as a maintenance operation.
- **[Risk]** Renaming card types shifts existing filters and links → Mitigation: one shared label table, a repository-wide grep for the old enum names, and a smoke check that every enum value has at least one row or an explicit "unused" note.
- **[Risk]** The nullable ratings change breaks code that assumes numbers → Mitigation: TypeScript strict typecheck on API, web and shared, and a Pitch Map test with null values.
- **[Risk]** Server-side fetch in detail routes couples the web server to API availability → Mitigation: a short timeout, a graceful error page, and `API_INTERNAL_URL` for container setups.
- **[Risk]** The `@next/env` root loading could expose root secrets to the client → Mitigation: Next only inlines variables prefixed `NEXT_PUBLIC_`; the R2 secret keys have no such prefix (assert this in a build check).
- **[Trade-off]** The Progression panel loses its sliders until real rules exist (Decision 12).
- **[Trade-off]** Leaving the Pack model and 34 dead procedures in place keeps attack surface; this is reported, not removed, because deleting code is the owner's decision.
- **[Risk]** Local `main` is already pushed → Mitigation: no commits or pushes by the pipeline; the owner reviews the diff.
