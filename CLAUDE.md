# CLAUDE.md — eflab monorepo

> Instructions for Claude Code (and any agent) working in this repo. Read first.
> Last full pass: 2026-10-17 (openspec change `eflab-parity-fixes`); dead surface removed 2026-10-18 (change `remove-dead-surface`).

## What this is

**eflab** = "eFootLab" — a fan-made eFootball player database: every card with real stats, side-by-side compare, the latest packs and the full skill list. Turborepo + pnpm monorepo. Not affiliated with Konami; all player data comes from public third-party dumps (efootbase API dump as primary, eFHUB CDN SQLite as secondary cross-fill).

**The GitHub repo `duogxaolin/eflab` is PUBLIC** (`main` is pushed). Never commit secrets, `dump/`, database backups, Konami assets or audit reports. Two third-party keys were committed in `docs/` before 2026-10-17; they are redacted in the working tree but **still exist in git history** — rewriting history and rotating them is the owner's decision (see "Known limitations").

This repo is **distinct from the `bno` bot** (a separate eFootball scraper the user also runs). Data-source decisions for bno live in memory under `bno-bot-data-decision`. **Don't conflate the two** — bno uses pesdb images and efhub data; eflab uses efootbase card renders mirrored to R2.

## Stack

| Surface | Path | Stack |
|---|---|---|
| Web | `apps/web` | Next.js 15 App Router · Tailwind CSS 4 · `@trpc/react-query` · Lucide |
| API | `apps/api` | Fastify 5 · `@trpc/server` v11 · SuperJSON (BigInt-safe) |
| DB | `packages/db` | Prisma 6 · PostgreSQL 16 · JSONL seeder + SQLite cross-fill |
| Shared | `packages/shared` | Zod schemas · domain constants · pure helpers · progression math |
| Config | `packages/config` | shared tsconfig presets |

- Node >= 22, pnpm >= 10 (`packageManager: pnpm@11`). TypeScript 5.9 strict.
- Dev: `pnpm dev` (all via turbo) or `pnpm web:dev` / `pnpm api:dev`. Ports: web :3000, api :4000.
- DB bootstrap: `docker compose up -d` → `pnpm db:generate` → `pnpm db:migrate` → `pnpm db:refresh`. See "Running".
- Tests: `pnpm test` = `pnpm test:unit` (turbo `test`, currently only `@eflab/shared`) then `pnpm test:smoke` (`scripts/smoke-test.sh`, boots the API on :4300). **No CI exists** — run it locally before claiming done.

## Layout

```
apps/web/app/         Routes: / (home), /players, /players/[baseId]/[cardId], /compare, /packs, /packs/[slug], /skills, /skills/[slug],
                      plus not-found.tsx, error.tsx, api/auth/google/route.ts. Detail routes = thin server page.tsx (fetch via lib/api-server.ts,
                      notFound(), generateMetadata) + *Client.tsx. The old /packs/[id] (Pack table) page is gone. Routes managers/tier-list/
                      community/articles/tournaments/new-players/pro/login/register/u were removed 2026-10-07; their API routers were
                      removed 2026-10-18 (change remove-dead-surface, see "API surface").
apps/web/lib/         r2-images.ts (R2 URL helpers: r2Url, playerCardUrl, playerCardDynamicUrl, conditionUrl), api-server.ts (server-side
                      API fetch), card-display.ts (labels/tier colours), trpc.tsx, auth.tsx, query-state.tsx, format-date.ts, use-debounced-value.ts
apps/web/components/  cards/PlayerCard.tsx (+useNearViewport, usePrefersReducedMotion), players/ (PitchMap, Pagination),
                      packs/PackCarousel.tsx, layout/ (SiteHeader, SiteFooter, EflabWordmark, MobileBottomNav),
                      build-simulator/ProgressionPanel.tsx (detail-page Progression sheet, client-side engine)
apps/api/src/         server.ts, env.ts (NODE_ENV/WEB_ORIGIN/API_PORT/API_HOST/R2_PUBLIC_BASE), health.ts, auth/ (session, google),
                      router/ (root.ts, trpc.ts, context.ts, routers/ player · featured · skill · auth — nothing else is mounted)
packages/db/prisma/   schema.prisma, migrations/ (20261017000000_baseline, 20261017000100_parity_fixes, 20261018000000_remove_dead_surface,
                      migration_lock.toml)
packages/db/src/      client.ts, seed-efootbase-full.ts (efootbase dump → Postgres), seed-efhub-crossfill.ts (eFHUB SQLite cross-fill)
packages/db/fixtures/ skills.json (84), leagues.json (34), managers.json (65 with R2 art), boosters.json (fixture boosters; dump boosters win on id overlap)
packages/shared/src/  constants.ts (CARD_TYPES, CARD_TYPE_LABELS, CARD_TYPE_BY_EFOOTBASE_CODE, SORT_FIELDS, POSITIONS, PLAYING_STYLES…),
                      schemas.ts (Zod inputs), types.ts (DTOs), helpers.ts (+helpers.test.ts), progression.ts (engine, +progression.test.ts),
                      ovrWeights.ts (generated per-position OVR weights), __fixtures__/progression-oracle.json (260 hub-sampled cards)
scripts/              efootbase_dump.py (efootbase API → dump/), r2_upload.py (dump → R2), fetch_card_assets.py (card bg/frame/condition assets),
                      verify-seed.py (dump ↔ DB integrity, read-only psql), smoke-test.sh (API smoke, self-booting)
docs/                 reference analyses (index: docs/README.md)
openspec/             changes/, specs/, ui-dna.md, config.yaml
docker-compose.yml    postgres:16 on 127.0.0.1:5433 (loopback only; the unused redis service was removed 2026-10-18)
```

## API surface (tRPC, `apps/api/src/router/root.ts`)

| Router | Procedures | Caller |
|---|---|---|
| `player` | `list`, `byId`, `search`, `compare`, `trending`, `countries` | web (`/`, `/players`, detail, `/compare`), smoke test |
| `featured` | `list`, `bySlug` | web (`/`, `/packs`, `/packs/[slug]`), smoke test |
| `skill` | `list`, `byId`, `players` | web (`/skills`, `/skills/[slug]`), smoke test |
| `auth` | `signUp`, `signIn`, `signOut`, `getSession` | `apps/web/lib/auth.tsx` (`getSession`/`signOut`; no sign-in UI is routed), Google OAuth routes |

Plus `GET /health` and the Google OAuth routes (`apps/api/src/auth/google.ts`). The `community`, `feed`, `tierList`, `user`, `pages`, `pack` and `manager` routers, their Zod inputs / DTOs / constants in `@eflab/shared`, and the Build / Review / TierVote / TierList / Follow / Post / PostLike / Comment tables were deleted in change `remove-dead-surface` (2026-10-18) — see "Known limitations" for what is kept on purpose.

## Player data pipeline

Player data is **not** self-datamined from the game (see `docs/efootball-apk-datamine-analysis.md`). Source of truth is the **efootbase dump**, with **eFHUB** as a secondary cross-fill.

1. **Dump** — `scripts/efootbase_dump.py` (needs `EFBASE_API_KEY`; the script reads it from the `.env` passed with `--env`, default an APK-extract path) → `dump/efootbase/players.jsonl` (48,407 cards × 176 cols), `players_meta.json` (field labels, card-type labels), `packs.json` (featured bundles), `teams.json`, `images/` (~93k card/emblem files, ~6.5 GB). `dump/` is gitignored. See memory `efootbase-datapath`.
2. **Seed** — `pnpm db:seed` (`packages/db/src/seed-efootbase-full.ts`). **Non-destructive upsert in ONE interactive transaction** (60-min timeout): Player and Manager are `INSERT … ON CONFLICT DO UPDATE` over a column list generated from the Prisma model minus `PLAYER_CROSSFILL_COLUMNS` / `MANAGER_CROSSFILL_COLUMNS`, so cross-fill-owned columns are **never written by the seed**. Country/League/Team/Pack/PackCard/Skill/PlayerSkill/FeaturedBundle(+Card) are replaced inside the same transaction (no FK reaches a user table). Booster is upserted by id (dump wins over fixtures). User tables (User/Account/Session) are untouched unless `--reset-users`; players missing from the dump are kept and logged unless `--prune`. The JSONL is streamed twice (lookups, then writes). Field mapping uses the dump's real keys: `jumping→jump`, `set_piece_taking→placeKicking`, `tackling→ballWinning`, `pos→registeredPosition`, `condition` via `[E,D,C,B,A]`, `injury_resistance`, `player_value→marketValue`, `leg_length_height→dribbleHeight`, `name_normalized→nameNormalized`. Unmatched `s_*` skill keys, card-type codes that disagree with `players_meta.json`/pack names, and unknown booster stat keys abort the seed. Position ratings (`ratingGK…ratingCF`) are nullable and left null by the seed.
3. **Cross-fill** — `pnpm db:crossfill` (`packages/db/src/seed-efhub-crossfill.ts`) reads `dump/efhub/efhub_db.sqlite` through the `sqlite3` CLI (`SQLITE3_BIN`, ServBay: `/Applications/ServBay/bin/sqlite3`; `EFHUB_DB_PATH` overrides the file). Writes only what efootbase cannot expose: Manager tactic ratings (exact-id merge, then name merge with `ALIASES`, then create — 1,475 managers, all with tactics, 65 with R2 art), `Player.stars/reputation/overallPotential/gkClearing/maxGkClearing`, the 13 `ratingGK…ratingCF` from eFHUB `overallGK…overallCF`, `communityTier` (10,745 tier badges), and 3 eFHUB-only players (ovr/maxOvr 40 placeholders). `registeredPosition` is seed-owned (dump `pos`); the cross-fill only reports mismatches. All SQL uses bound parameters. Idempotent.
4. **`pnpm db:refresh` = `db:seed` then `db:crossfill`** — the documented refresh. A standalone `db:seed` keeps earlier cross-fill values but cannot add them; it prints that notice.
5. **Verify** — `python3 -I scripts/verify-seed.py` streams the dump and compares it with the DB over read-only psql (`PGOPTIONS=-c default_transaction_read_only=on`); exit 1 on any mismatch.

**Counts after `db:refresh` (2026-10-17):** Player 48,410 (48,407 dump + 3 eFHUB) · Manager 1,475 (all with tactics) · Booster 375 · Pack 2,046 / PackCard 13,683 · FeaturedBundle 24 / FeaturedBundleCard 189 · Skill 84 (the dump's 67 `s_*` keys cover 67 of them; the other 17 fixture entries have 0 holders) · PlayerSkill 191,444 · Country 185 · Team 707 · League 34 · tier badges 10,745. Card types: STANDARD 34,678 · HIGHLIGHT 8,446 · TRENDING 3,586 · EPIC 1,083 · SELECTION 314 · LEGENDARY 261 · STRIKE_ARENA 42.

**Card types** — Prisma/`CARD_TYPES` enum = `STANDARD, LEGENDARY, TRENDING, SELECTION, EPIC, HIGHLIGHT, STRIKE_ARENA`, mapped from efootbase `card_type` codes 0/1/3/4/5/6/7 (`CARD_TYPE_BY_EFOOTBASE_CODE`). Labels come from `CARD_TYPE_LABELS` in `@eflab/shared` (never show raw enum names). "Big Time" and "Show Time" are pack campaigns, not codes: Big Time cards are `EPIC`, Show Time cards are `HIGHLIGHT` (efootbase's own labels). The home quick filter "Epic & Big Time" therefore sends `cardTypeIn: ["EPIC"]`; the `/players` default scope is `EPIC + HIGHLIGHT` with a visible "All" option.

**Homepage "Latest Packs" + `/packs` + `/packs/[slug]` = `FeaturedBundle` table** (24 = 17 `specialPlayerList` + 7 `packs` spotlights from `packs.json`; `FeaturedBundleCard.ordinal` keeps efootbase's display order). Slugs are stable name+date slugs (e.g. `national-all-stars-2026-09-17`); `featured.list` returns them and `featured.bySlug` backs the bundle page. `Pack`/`PackCard` (per-card `featured` field) is a separate historical model that the web no longer routes.

**Search** — `Player.nameNormalized` (dump `name_normalized`, lower-case ASCII) has a trigram GIN index (`gin_trgm_ops`, migration `parity_fixes`). Queries are normalised in TS (`normalizeSearchQuery`: NFD, strip marks, lower-case) and LIKE-escaped (`escapeLike`). `player.list q` = `nameNormalized LIKE '%q%'` (plus `japName`/`chineseName ILIKE` only when the query has non-ASCII — the CJK path is not index-backed); `player.search` tiers exact-substring above trigram similarity (`tier ASC, similarity DESC, ovr DESC`). Minimum 2 characters.

## Image pipeline (eflab web)

Cards render **one pre-composited image** from Cloudflare R2: `PlayerCard.tsx` loads `cards/{id}_dynamic.webp` (bg + art + frame baked in) and adds HTML overlays — `.pcb__ovr-block` (OVR + position), `.pcb__condition` (`conditions/condition_{a-e}.svg`) and, with `showDetails`, the nationality flag circle plus MAX LEVEL / MAX OVR badges. The home search dropdown thumbnails use `cards/{id}_transparent.webp`. The 4-layer composite helpers (`cardBgUrl`/`cardFrameUrl`), the manager/emblem key helpers and `lib/efhub-images.ts` (efimg.com fallback) were deleted in change `remove-dead-surface` (the `card-backgrounds/`, `frames/`, `managers/` objects remain in the bucket, unused). CSS 3D tilt + glare stay (disabled under `prefers-reduced-motion`); Three.js/WebGL is rejected.

- **Helper**: `apps/web/lib/r2-images.ts` — `r2Url(key)`, `playerCardDynamicUrl(id)` (used by PlayerCard), `playerCardUrl(id)` (`_transparent`, home thumbnails), `conditionUrl(letter)`. Base URL = `NEXT_PUBLIC_R2_PUBLIC_BASE`, falling back to the dev bucket URL in code.
- **R2 bucket**: `efootlab`, public dev URL `https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev`. Credentials (`R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET`) live in the gitignored root `.env`; only `scripts/r2_upload.py` uses them.
- **Domain swap = two env vars, no DB rewrite**: flags/emblems/manager art are stored as absolute URLs in `Country.flagUrl`, `Team.emblemUrl`, `League.emblemUrl`, `Manager.imageUrl` (SHA256-named objects, not derivable from ids). The API rebases those stored URLs onto `R2_PUBLIC_BASE` on the way out (`rebaseR2Url` in `apps/api/src/env.ts`) and the web builds card/condition URLs from `NEXT_PUBLIC_R2_PUBLIC_BASE` — set both when moving the bucket. `NEXT_PUBLIC_R2_PUBLIC_BASE` also restricts `images.remotePatterns` in `next.config.ts`.
- **Env loading (web)**: Next reads only `apps/web/.env*`; `apps/web/next.config.ts` additionally loads the **repo-root `.env`** through `@next/env` (`loadEnvConfig`, precedence shell > `apps/web/.env*` > root `.env*`). `NEXT_PUBLIC_*` values are inlined at build time; `apps/web/.env.example` documents them (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_R2_PUBLIC_BASE`, `API_INTERNAL_URL`, `NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_BUILD_UTC`).
- **Upload pipeline**: `scripts/efootbase_dump.py` → `scripts/r2_upload.py --prefix dump/efootbase/images` (boto3, 32 workers, resume, `--key-prefix` for leaf dirs). Card assets: `scripts/fetch_card_assets.py` → `r2_upload.py --prefix dump/efootbase/card-assets` (only `conditions/` is rendered today). Manager art: `r2_upload.py --prefix dump/efootbase/images/managers --key-prefix managers/`.
- `PlayerCard` is `"use client"`, a single `<Link>` tile with an accessible name, raw `<img>` with `loading="lazy"`/`decoding="async"`/explicit size (`priority` for the first row), `onError` placeholder. SSR HTML does not contain R2 URLs — verify with a headless browser, not `curl | grep`.

See `docs/eflab-image-pipeline.md` for the (older, dated 2026-10-06) pipeline write-up; this section is current.

## Conventions

- Match the surrounding code: comment density, naming, idiom. Vietnamese comments are common in this repo (user is Vietnamese) — okay to use Vietnamese for user-facing docs/comments when the surrounding code does.
- Prisma BigInt IDs are serialized via SuperJSON — tRPC procedures receive/send BigInt as strings in JSON but `bigint` at runtime. Ids are validated with `bigIntString` (≤ 19 digits, ≤ int8 max → 400, never 500); integer filters are int4-bounded.
- Card types: `CARD_TYPES` / `CARD_TYPE_LABELS` from `@eflab/shared` (see "Card types" above). Sort fields: `SORT_FIELDS` (every entry has a real column; `[sort, id]` tiebreaker everywhere).
- **Theme = efootbase zinc + lime** (since 2026-10-07 session 3; the earlier "Slate-Emerald" and "Cyber-Sport Dark" palettes are gone). Tokens in the `@theme` block of `apps/web/app/globals.css`: canvas `#060607`, panel `#18181b`, elevated `#232325`, line `#28282c` (active `#3f3f45`, separator `#212124`), accent lime `#acf41a` (foreground `#080d02`), secondary cyan `#06b6d4`, warn amber `#f59e0b`, danger `#ef4444`, text `#fcfcfc` / `#9f9fa9` / `#6b6b73`. Tier colours (single source `--color-tier-*`): 90+ `#00ffb4`, 80–89 `#96ff00`, 70–79 `#ffbe00`, <70 `#ff3200`. Card-type accents `--color-card-*`. Inter via `next/font/google`. Component classes live in `@layer components` so utilities win. See `openspec/ui-dna.md`.
- Branding is **eFootLab** (own SVG wordmark `EflabWordmark.tsx`, footer build stamp from `NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_BUILD_UTC` filled by `next.config.ts` from git). No "eFootBase" string or efootbase build id anywhere in `apps/web`.
- API env (`apps/api/src/env.ts`): `NODE_ENV` is set by the package scripts (`dev` = development, `start` = production; unset = treated as production → no stack traces, Secure cookies), `WEB_ORIGIN` (comma-separated CORS allow-list, first entry = OAuth redirect target), `API_PORT` (4000), `API_HOST` (0.0.0.0), `API_ORIGIN`, `R2_PUBLIC_BASE`, `GOOGLE_CLIENT_ID/SECRET`, `OAUTH_STATE_SECRET`. tRPC `maxBatchSize` 10 (web `httpBatchLink maxItems: 10`); expected failures are `TRPCError`s; undecodable cookies are ignored.
- UI/UX work must read `openspec/ui-dna.md` before any visual change. Dated DNA snapshots in `docs/*-ui-dna.md` are historical references, not the current spec.
- Do not delete code, tables or dependencies without the owner's decision — report it instead. (The 2026-10-18 removal in change `remove-dead-surface` was owner-approved and grep-proven; what remains is listed under "Known limitations".)

## Running (verify before claiming "done")

```bash
docker compose up -d --remove-orphans  # postgres 127.0.0.1:5433 (--remove-orphans once, to retire the old eflab-redis container)
cp .env.example .env                 # fill DATABASE_URL etc. (root .env is read by api, db scripts and next.config.ts)
pnpm install
pnpm db:generate                     # prisma generate
pnpm db:migrate                      # prisma migrate deploy — baseline + parity_fixes (extensions pg_trgm/unaccent, GIN index) + remove_dead_surface (drops 8 user-content tables)
pnpm db:refresh                      # db:seed (upsert, ~1 min) then db:crossfill (needs dump/efhub/efhub_db.sqlite + SQLITE3_BIN)
python3 -I scripts/verify-seed.py    # dump ↔ DB integrity (read-only psql)
pnpm api:dev & pnpm web:dev          # :4000 + :3000
pnpm typecheck                       # tsc --noEmit in every package
pnpm test                            # unit tests (@eflab/shared) + scripts/smoke-test.sh (boots the API on :4300; API_URL=… reuses a running one)
# tRPC by hand (superjson-wrapped input):
curl -sS "http://localhost:4000/trpc/player.list?input=%7B%22json%22%3A%7B%22page%22%3A1%2C%22limit%22%3A24%2C%22sort%22%3A%22ovr%22%2C%22order%22%3A%22desc%22%7D%7D"
curl -sS http://localhost:4000/health
```

`pnpm db:push` exists for schema experiments only (no `--accept-data-loss`); the live DB is migration-managed (`_prisma_migrations`). Never run `db:seed`/`db:refresh` casually against a database with data you care about without a `pg_dump` first — it is safe by design, but it is still a maintenance operation that holds locks for minutes.

## Progression simulator (player-progression-simulator, 2026-10-18)

The detail page's Progression panel (`components/build-simulator/ProgressionPanel.tsx`, state owned by `PlayerDetailClient.tsx`) runs the pure engine in `packages/shared/src/progression.ts` on the client (the server-side `community.simulate` twin was removed in change `remove-dead-surface`). Rules recovered from the eFHUB `player export` table (44,103 cards joined to the efootbase dump by Konami id, read-only analysis outside the repo):

- **Budget** = `levelCap − 1` training points (Max Level input 1..levelCap). Σ cost = levelCap − 1 on all 32,601 hub cards with cap ≥ 2.
- **Ten categories** (`TRAINING_CATEGORIES` / `TRAINING_STATS`): Shooting {finishing, placeKicking, curl}, Passing {lowPass, loftedPass}, Dribbling {dribbling, ballControl, tightPossession}, Dexterity {offensiveAwareness, acceleration, balance}, Lower Body {kickingPower, speed, stamina}, Aerial {heading, physicalContact, jump}, Defending {defensiveAwareness, defensiveEngagement, ballWinning, aggression}, GK1 {gkAwareness}, GK2 {gkParrying (hub "GKClearing"), gkReach}, GK3 {gkCatching, gkReflexes}. Each stat point raises every stat of the category by 1; no cap at 99. Hub `MAX<stat> − <stat>` equals the category value for every stat on every card except goalkeeper Jump (card-specific offset) and one outfield card (hub PlayerID 179425, DMF, cap 65: Jump 67 → 76 with Aerial 8, i.e. +1 extra) — the engine ignores that single exception.
- **Cost curve**: the nth stat point of a category costs `0.5 × ⌈n/4⌉` points (integers in half-points in code): c(2)=1, c(4)=2, c(8)=6, c(12)=12, c(16)=20, c(20)=30, c(22)=36.
- **Boosters**: resolved `booster1`/`booster2` DTO vectors; Booster 1 on by default, Booster 2 only when toggled; unknown ids show "unknown booster", never a guess. A booster with an empty stat vector (Booster 136 "Booster +1" — Booster 2 of 48,338 cards — and id 0) shows "(no stat data)" with no toggle and never counts as a custom build.
- **Max Level input**: a draft string while typing; committed and clamped to 1..levelCap on blur / Enter (spinner and arrow keys commit at once); an invalid or empty draft reverts; the allocation is reset only when the committed level can no longer afford the points spent, and the live region announces it.
- **Estimated overall** (`~`): per-position linear weights in `ovrWeights.ts` fitted on the hub's `overall<pos>` of cards with **full proficiency** at that position (held-out R² 0.992–0.999; within ±1 for ≥ 99.9% of cards at 11 outfield positions, 98.6% CB, 93.3% GK). Cross-check: formula(hub max stats + Booster 1) is within ±1 of efootbase `overall_at_max_level` for 94.7% of the 10,073 cards with progression. The hub's own `MAXOverall<pos>` sits about +3.6 above the formula (+4 on 47% of cards, +3 on 44% — hub quirk, not applied).
- **Proficiency penalty** (`OVR_PROFICIENCY_ADJUST`, 2026-10-18): the ±1 claim only holds at full-proficiency positions — unpenalised, the formula is within ±1 of the hub on 0% of half-proficiency and 5.6% of non-proficient observations (mean +6.3 / +13.8 too high). The hub overall at a half / non-proficient position is `max(40, k·estimate + c)` with per-position `k, c` (half ≈ 0.93·est − 1.6, none ≈ 0.82·est − 5.9; GK at none = flat 40). Held-out within ±1: half 99.9% (21,387 obs; CB 98.5%, CF 98.9%), none 99.7% at outfield positions (111,819 obs; CB 97.3%, CF 99.7%), GK-none 100%. `simulateBuild` takes the card's `positionAptitudes` (0 full / 1 half / 2 none) and reports `BuildResult.proficiency`; the panel labels every position option with its proficiency and swaps the accuracy note.
- **Max OVR** = exact DP over the categories (budget in half-points, linear objective); Reset zeroes the categories.
- **Hidden** for `levelCap ≤ 1` cards (38,337 of 48,407) — a note replaces the panel. The "stats at max level" toggle (dump `max_attributes`, a different lift) stays and is disabled while a custom build is active.
- **Not modelled**: manager effects (no dataset), goalkeeper Jump (card-specific offset — shown as "n/a (card-specific)"), exact overall values.
- **Regeneration**: weights + proficiency table + fixture come from scratch scripts outside the repo (hub SQLite joined to `players.jsonl`); replace `ovrWeights.ts` (both tables) and `__fixtures__/progression-oracle.json` (cards carry `alt` = hub overall at every non-full position) together when the game version changes. `pnpm --filter @eflab/shared test` re-checks the stat map, cost curve, budget invariant, ±1 accuracy (aggregate + per-position floors CB ≥ 85%, CF ≥ 95%, GK ≥ 90%; half/none ≥ 99%, GK-none = 40) and DP optimality on the fixture.

## Known limitations (reported, not hidden)

- **Progression is an estimate** — the overall formula is fitted (±1 at full-proficiency positions, lower confidence for GK/CB; half / non-proficient positions use a fitted penalty, within ±1 on 99.9% / 99.7% of held-out hub observations), goalkeeper Jump is not projected, no manager control, weights track the hub's game version; builds are not persisted anywhere (the Build table and `community.saveBuild` were removed).
- **38,337 cards have `levelCap` 1** — that is what the dump carries (35,341 of them also have `maxOvr == ovr`), not a seeder bug.
- **CJK search** (`japName`/`chineseName ILIKE`) runs only for non-ASCII queries and is not index-backed.
- **Kept on purpose after `remove-dead-surface` (2026-10-18)** — not dead by accident, each has an owner decision behind it: the `auth` router + Google OAuth + User/Session/Account (no sign-in UI is routed; `auth.tsx` still calls `getSession`/`signOut`); `protectedProcedure` in `router/trpc.ts` (no mounted procedure uses it since the community routers went); the Pack/PackCard (2,046 / 13,683) and Manager (1,475) tables with their seeding and cross-fill (data assets, no API reads them except `player.byId` → Pack name); `better-auth` (only `better-auth/crypto` is imported); `zod` and `superjson` as direct `apps/api` dependencies (the API imports both through `@eflab/shared`). The R2 bucket still holds the `card-backgrounds/`, `frames/`, `managers/` objects nobody renders.
- **Konami fonts** (`apps/web/public/fonts/eFootballSans-*.ttf`, `eFootballStencil-Regular.ttf`, loaded by `globals.css`) have an unknown licence.
- **Git history still contains the two previously committed third-party keys** (`docs/apk-db-expansion.md`, `docs/efootbase-ui-dna.md`); redaction covers the working tree only.
- **No CI** — `pnpm typecheck` and `pnpm test` are run by hand.

## docs index

`docs/README.md` is the index. Files that exist: `apk-db-expansion.md`, `ecosystem-proposal.md`, `efhub-sqlite-gap-analysis.md`, `efhub-ui-dna.md`, `eflab-image-pipeline.md`, `efootball-apk-datamine-analysis.md`, `efootbase-efhub-features.md`, `efootbase-ui-dna.md`, `pesdb-ui-dna.md`. The dated DNA/analysis docs are snapshots (e.g. `efootbase-ui-dna.md` §8 "API unusable" was superseded on 2026-10-06 when the dump was taken).

## Memory index (loaded each session)

- `efootbase-datapath` — eflab's data source: efootbase API dump → players.jsonl 48k + images on R2; seed/refresh behaviour (upsert, cross-fill-safe since 2026-10-17)
- `bno-bot-data-decision` — bno's data paths (Path E efhub primary, Path A pesdb fallback, B/C rejected) — bno is separate from eflab
- `eflab-web-image-pipeline` — single `cards/{id}_dynamic.webp` + overlays from R2; domain swap = `R2_PUBLIC_BASE` (API rebase) + `NEXT_PUBLIC_R2_PUBLIC_BASE` (web); root `.env` loaded by next.config.ts
- `eflab-ui-clone-efootbase` — efootbase-pattern UI, zinc+lime tokens, eFootLab branding, 4-page scope
- `eflab-efhub-crossfill` — `pnpm db:refresh` = seed + cross-fill; cross-fill columns survive re-seeds; counts
- `eflab-featured-bundle` — home/`/packs`/`/packs/[slug]` use FeaturedBundle by slug
- `eflab-search-rank-tier` — search ranking tiers; `nameNormalized` + GIN index; `player.list q` accent-insensitive
- `eflab-booster-from-dump` — Booster = fixtures + dump upsert (dump wins), jump/set-piece magnitudes mapped
- `eflab-card-detail-overlays`, `efhub-sqlite-dump`, `efhub-efootbase-apk-functions`, `efootbase-dump-done`, `eflab-repo-public` — see `MEMORY.md`

## Out of scope for eflab (unless user reopens)

- Self-datamining Steam `dt870_console_win.cpk`.
- Using Three.js/WebGL for cards.
- efhub as a **primary** player-data source (replaced by efootbase 2026-10-07). efhub is used only as the secondary cross-fill described above.
- Re-adding the removed community/auth/manager/tier-list pages to the web UI.
