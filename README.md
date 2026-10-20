# eFootLab (eflab)

A fan-made eFootball player database: every card with real stats, side-by-side compare, the latest packs and the full skill list. Turborepo + pnpm monorepo — **Next.js 15 (App Router, Tailwind CSS 4)** web app, **Fastify 5 + tRPC v11** API with SuperJSON BigInt serialization, **Prisma 6 + PostgreSQL 16** storage.

Not affiliated with Konami. Player data comes from public third-party dumps (efootbase as primary, eFHUB as secondary cross-fill); nothing is scraped at runtime.

> This repository is public. Never commit `.env`, `dump/`, database backups or third-party keys.

## Stack

| Surface | Path | Stack |
|---|---|---|
| Web | `apps/web` | Next.js 15 App Router · Tailwind CSS 4 · `@trpc/react-query` · Lucide |
| API | `apps/api` | Fastify 5 · `@trpc/server` v11 · SuperJSON |
| DB | `packages/db` | Prisma 6 · PostgreSQL 16 · JSONL seeder + SQLite cross-fill |
| Shared | `packages/shared` | Zod schemas · domain constants · pure helpers · progression math |
| Worker | `apps/worker` | Node + `tsx` sync worker (API check, incremental and full sync; drives the Python scripts and the seed) |
| Config | `packages/config` | shared tsconfig presets |

Theme: efootbase-style **zinc + lime** dark UI (canvas `#060607`, panel `#18181b`, accent `#acf41a`; tokens in `apps/web/app/globals.css`, spec in `openspec/ui-dna.md`). Cards are a single pre-composited R2 image with HTML overlays and a CSS 3D tilt — no Three.js/WebGL.

## Layout

```
eflab/
├── apps/
│   ├── api/        # Fastify + tRPC (player, featured, skill, manager, auth, admin) + /health + Google OAuth
│   ├── web/        # Next.js routes: / /players /players/[baseId]/[cardId] /compare /packs /packs/[slug] /skills /skills/[slug]
│   │               #   + private /admin, /admin/login, /admin/runs, /admin/runs/[id] (noindex, not linked)
│   └── worker/     # sync worker: schedule + run queue in Postgres, check / incremental / full runs (+tests on scratch databases)
├── packages/
│   ├── db/         # Prisma schema + migrations, seed-efootbase-full.ts, seed-efhub-crossfill.ts, efootbase-map.ts (shared row mapping),
│   │               #   admin-auth.ts + admin-cli.ts (admin accounts), fixtures/
│   ├── shared/     # Zod schemas, constants (CARD_TYPE_LABELS, SORT_FIELDS…), helpers (+tests), progression (+tests), sync (+tests)
│   └── config/     # tsconfig presets
├── scripts/
│   ├── efootbase_dump.py     # efootbase API → dump/efootbase/ (needs EFBASE_API_KEY)
│   ├── r2_upload.py          # dump/efootbase/images → Cloudflare R2 bucket `efootlab`
│   ├── fetch_card_assets.py  # card background/frame/condition assets → dump/efootbase/card-assets/
│   ├── verify-seed.py        # dump ↔ database integrity check (read-only psql)
│   └── smoke-test.sh         # API smoke test (boots the API on :4300)
├── docs/               # reference analyses (index: docs/README.md)
├── openspec/           # specs, changes, ui-dna.md
├── docker-compose.yml  # postgres:16-alpine on 127.0.0.1:5433
└── .env.example        # every variable the API, seeders, scripts and web read
```

## Local setup

### Prerequisites

- Node.js ≥ 22, pnpm ≥ 10 (`corepack enable`; the repo pins `pnpm@11`)
- Docker (Postgres)
- The data dumps, which are **not in the repo** (`dump/` is gitignored):
  - `dump/efootbase/players.jsonl`, `players_meta.json`, `packs.json` — produced by `scripts/efootbase_dump.py`
  - `dump/efhub/efhub_db.sqlite` — eFHUB CDN SQLite (see `docs/efhub-sqlite-gap-analysis.md`) + a `sqlite3` CLI (`SQLITE3_BIN`)
- `python3` (stdlib only) for `scripts/verify-seed.py` and the JSON parsing in `scripts/smoke-test.sh`

### 1. Start Postgres

```bash
docker compose up -d --remove-orphans
# postgres 127.0.0.1:5433 (bound to loopback; 5433 avoids a local Postgres on 5432).
# --remove-orphans retires the eflab-redis container of older checkouts (the redis service was removed 2026-10-18).
```

### 2. Install and configure

```bash
pnpm install
cp .env.example .env     # DATABASE_URL already points at the compose database
```

The single root `.env` is read by the API and the db scripts (`tsx --env-file-if-exists`), by the Python scripts, and by the web app: `apps/web/next.config.ts` loads the repo root with `@next/env`, so `NEXT_PUBLIC_*` values do not need a second file (see `apps/web/.env.example` for precedence).

### 3. Initialize the database

```bash
pnpm db:generate   # prisma generate
pnpm db:migrate    # prisma migrate deploy: 20261017000000_baseline (+ pg_trgm/unaccent), 20261017000100_parity_fixes, 20261018000000_remove_dead_surface, 20261019000000_efootbase_static_data, 20261019230000_admin_sync_worker
pnpm db:refresh    # db:seed (efootbase dump → Postgres, upsert in one transaction) then db:crossfill (eFHUB SQLite)
python3 -I scripts/verify-seed.py --after-crossfill   # optional: assert the DB matches the dump (flag: right after db:refresh)
```

What `db:refresh` leaves behind (2026-10-18 re-dump; then `db:seed` with the static snapshot on 2026-10-19): 50,694 players (50,691 dump + 3 eFHUB-only; newest release 2026-10-15) · 1,479 managers (1,475 with tactic ratings, 69 marked as efootbase picker managers) · 379 boosters · 2,065 packs · 24 featured bundles (166 cards) · 84 public skills (23 Showtime + 44 Classic with efootbase description, artwork and — for 28 — stat boosts, 17 "Other" entries) + 5 hidden unreleased skills / 195,607 player-skill rows · 185 countries · 736 teams · 34 leagues · 10,745 community tier badges.

**Static efootbase snapshot (optional).** Skill descriptions, groups, stat boosts, activation text and artwork, and the list of efootbase's picker managers come from a hand-taken browser snapshot placed in the git-ignored `dump/efootbase/static/` (`skills.json`, `managers.json`, `skill-icons/`, `manager-images/`). The images live on R2 (`skills/Skill_<Name>.webp`, `managers/{id}.webp`). None of this third-party content is in the repository: without the snapshot the seed prints a warning and the skills keep their fixture names with no group, artwork or boosts. Note that a seed run without `skills.json` therefore **erases** skill metadata loaded by an earlier run (the Skill table is rebuilt inside the seed transaction), while a seed run without `managers.json` leaves the picker flag (`Manager.inPicker`) untouched. How it was made, its file shapes and how to regenerate and upload it: [`docs/efootbase-static-snapshot.md`](docs/efootbase-static-snapshot.md). Stat boosts exist only for the skills efootbase showed on the cards the survey loaded (28).

The 2026-10-18/19 re-dump (rewritten `scripts/efootbase_dump.py`) added 2,284 new cards and changed 5,380, and uploaded 9,891 images to R2. efootbase's API lists newest cards first with `sort=time_added&order=desc`, accepts `limit` up to 100, and reports `total_count` / `total_pages` as lookahead values (the end of data is the first short page). Limits: the 2,284 new cards have no eFHUB cross-fill data (stars, reputation, position ratings, tier badge); R2 objects carry a 1-year immutable cache, so the 5,312 overwritten card images may stay stale in caches until purged or versioned; `time_added` does not change on stat edits, so only a full dump finds changed cards.

Seed behaviour:

- `pnpm db:seed` upserts Player/Manager (`INSERT … ON CONFLICT DO UPDATE`) and replaces the catalogue tables inside **one transaction**; it never writes the cross-fill-owned columns and never touches user tables (`--reset-users` opts in; `--prune` deletes players missing from the dump).
- `pnpm db:crossfill` fills what efootbase cannot expose: manager tactics, stars/reputation/overallPotential/gkClearing, per-position ratings, community tiers and 3 extra players. A manager card that is not in the eFHUB file gets the tactics of the best eFHUB version of the same coach's name only when that version is not another manager card in the database; otherwise it stays without tactics and the cross-fill warns. That is the case for the new Jürgen Klopp and Cristian Chivu picker cards (eFHUB's Klopp / Chivu entries are the older Klopp / Chivu cards): they keep no tactics.
- `pnpm db:refresh` = both, in order. Re-runnable.
- `pnpm db:push` is for schema experiments only (no `--accept-data-loss`); the database is migration-managed.

Field mapping notes (efootbase → Prisma): `id`/`base_id` → `BigInt`; `overall_rating` → `ovr`, `overall_at_max_level` → `maxOvr`, `max_level` → `levelCap`; 26 base + 26 max stats (`jumping` → `jump`, `set_piece_taking` → `placeKicking`, `tackling` → `ballWinning`); `pos` → `registeredPosition`; `condition` → `[E,D,C,B,A]`; `card_type` code → `CardType` (`0 STANDARD, 1 LEGENDARY, 3 TRENDING, 4 SELECTION, 5 EPIC, 6 HIGHLIGHT, 7 STRIKE_ARENA` — labels in `CARD_TYPE_LABELS`); `s_*` flags → `PlayerSkill`; `featured` → `Pack`; `packs.json` → `FeaturedBundle`.

### 4. Run the API and the web app

```bash
pnpm api:dev    # http://localhost:4000  (NODE_ENV=development, reads ../../.env)
pnpm web:dev    # http://localhost:3000
# or both through turbo:
pnpm dev
```

Open http://localhost:3000.

### 5. Typecheck, test, build

```bash
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # unit tests (@eflab/shared: progression oracle, helpers, sync; @eflab/db: admin passwords, row mapping;
                 #   @eflab/worker: fake efootbase + scratch databases eflab_synctest_*) then scripts/smoke-test.sh
pnpm build       # next build (web) + tsc --noEmit (api / db / shared)
```

`scripts/smoke-test.sh` starts the API itself on port **4300** (`SMOKE_API_PORT` to change), waits for `/health`, runs 42 checks against the refreshed database (featured bundle by slug, removed routers answer 404, `manager.picker` — 69 managers in order, 1–2 valid pills, images on the R2 host — 84 skills with the static efootbase data — Showtime 23 / Classic 44 / Other 17, descriptions, R2 artwork, Momentum Dribbling's +6 boosts, unreleased skills hidden — every card type non-empty, sort presets without duplicates, filters narrow, multi-valued position / league / team lists (OR inside, AND between, 400 for over-long or out-of-range lists), duplicate-free pagination, compare order, accent-insensitive search, 400 on out-of-range ids, malformed-cookie tolerance) and stops the API on exit. Its admin section starts a second API on port 4301 (`SMOKE_ADMIN_PORT`) against a scratch database it creates, migrates and drops (`eflab_smoke_admin_<pid>`, one throwaway admin) and checks the admin API's negative paths (401, 403, identical sign-in failures, lock-out, no secret fields, `no-store`); the manager tactic cross-fill is asserted by `scripts/verify-seed.py`. Set `API_URL=http://localhost:4000` to run the checks against an API that is already running.

**There is no CI.** Run `pnpm typecheck` and `pnpm test` locally before pushing.

## Endpoints

```bash
curl http://localhost:4000/health
# {"status":"ok","db":"connected","time":"…"}   (503 "degraded" when Postgres is unreachable)
```

tRPC lives under `/trpc/*` (GET with a superjson-wrapped `input`, batches of at most 10). Every mounted procedure:

| Procedure | Purpose |
|---|---|
| `player.list` | filters (card types, positions (`positions[]`, up to 13, any of them), playing style in either slot / defence slot, AI styles, nations / leagues / teams (`nationalityIds[]`, `leagueIds[]`, `clubIds[]`, up to 50 each, any of them; the single-value `position` / `nationalityId` / `leagueId` / `clubId` still work and are merged in), foot, base/max overall ranges, condition, form, weak-foot accuracy/usage, height/weight/age, skills (all must be present), stat ranges at base or max, body-model ranges — values inside one list are OR-ed, filters are AND-ed) + `q` accent-insensitive name search + sort presets (`trending`, `new`, `top`, `highest`, `lowest`) or any `SORT_FIELDS` column, deterministic `[sort, id]` pagination; over-long lists and out-of-range ids are a 400 |
| `player.byId` | full card DTO for `baseId`/`cardId` (null when the base does not match) |
| `player.search` | ranked name search (exact substring above trigram similarity) for the ⌘K palette and the compare picker |
| `player.compare` | 1–4 cards, returned in the requested order |
| `player.trending`, `player.countries` | home trending window, nationality list |
| `featured.list` / `featured.bySlug` | the 24 featured bundles (home carousel, `/packs`, `/packs/[slug]`) |
| `skill.list` / `skill.byId` / `skill.players` | 84 public skills with holder counts, group, wiki order, artwork URL, stat boosts (eFootLab stat names) and activation; holders per skill (the 5 unreleased skills are never returned) |
| `manager.picker` | the 69 managers of efootbase's picker (rating desc, then id): name, rating, image URL, one or two stat pills — the Progression panel's "Select Manager" |
| `auth.getSession` / `auth.signOut` | session plumbing used by `lib/auth.tsx` (no sign-in UI is routed) |
| `auth.signUp` / `auth.signIn` | email/password registration and login (kept with the auth system; no web caller) |
| `admin.*` | private admin area: `signIn` / `signOut` / `me`, `config.get` / `config.update` (schedule), `runs.queue` / `runs.cancel` / `runs.list` / `runs.get`, `dashboard` — own accounts and `eflab_admin` cookie, 401 without an admin session, CSRF header on mutations, `Cache-Control: no-store` |

The old `manager` router and the `pack`, `community`, `user`, `tierList`, `feed` and `pages` routers were removed on 2026-10-18 (change `remove-dead-surface`) together with the Build / Review / TierVote / TierList / Follow / Post / PostLike / Comment tables; the Pack and Manager tables stay as seeded data (the new `manager.picker` reads the picker rows).

## Admin area and sync worker

The catalogue can stay current without manual dumps:

- **The worker** (`pnpm worker:start`, `apps/worker`) checks efootbase on a schedule and runs one job at a time from a queue kept in Postgres:
  - an API check (one request);
  - an incremental sync (cards newer than the newest one stored, minus 7 days, with their images);
  - a weekly full sync (the whole dump, the existing seed, changed images).
- **The private admin pages** (`/admin`) show the worker's state, the schedule form, buttons to queue a check / incremental / full sync or cancel one, and the run history with statistics and log tail.
- **Admin accounts** are separate from visitor accounts and are created only from the command line:

  ```bash
  pnpm admin:create <username>        # hidden password prompt (≥ 12 characters); also admin:set-password, admin:disable
  pnpm worker:dev                     # or worker:start / a service — read docs/admin-sync.md first
  ```

The worker is the only process that uses the efootbase key and the R2 credentials. It needs `python3` with `boto3`, and, for full runs, the static snapshot and 2 GB of free temporary space. With the schedule enabled (the default), its first tick queues an incremental run.

[`docs/admin-sync.md`](docs/admin-sync.md) covers the rest: service examples, the first-run checklist, the same-site cookie requirement, the limits, recovery and the rollback SQL.

## Progression panel

The player detail page carries a Progression sheet for every card with a level cap above 1, laid out like efootbase's (change `efootbase-parity-round2`, 2026-10-18): "used/total pts", Max Level (1..level cap), position (13), Manager Proficiency (70–90, change `manager-proficiency-slider`), "Select Manager" (change `efootbase-exact-model-managers`, 2026-10-19), ten category rows (label, − n +, slider) with the cost of the next stat point, Booster 1 / 2 toggles, **Max OVR** and **Reset**. The training rules were recovered from the public eFHUB data; the proficiency bands, the manager effect and the overall formula are efootbase's own constants, recovered from its public web client (the owner accepted that terms risk; see [`docs/efootbase-exact-model.md`](docs/efootbase-exact-model.md)):

- **the panel opens on the Max-OVR build** for the card's registered position with every usable booster on, Manager Proficiency 90 and no manager — the same opening state as efootbase's sheet; "custom build" means any deviation from that state, Reset zeroes every category (the proficiency and the manager stay) and Max OVR restores the optimum (the manager stays);
- **points are shown in efootbase's whole-point unit** (`toDisplayPoints`, twice the engine's training points): a level-32 card reads "62/62 pts", the first four stat points of a category cost 1 each, the next four 2 each (engine: budget = level cap − 1, the nth stat point costs 0.5 × ⌈n / 4⌉);
- each category raises every stat it contains by one per stat point (Shooting → Finishing, Place Kicking, Curl; Passing → Low Pass, Lofted Pass; Dribbling → Dribbling, Ball Control, Tight Possession; Dexterity → Offensive Awareness, Acceleration, Balance; **Lower Body Strength** → Kicking Power, Speed, Stamina; **Aerial Strength** → Heading, Physical Contact, Jumping; Defending → Defensive Awareness, Defensive Engagement, Tackling, Aggression; **Goalkeeper 1** → GK Awareness **and Jumping**; Goalkeeper 2 → GK Parrying, GK Reach; Goalkeeper 3 → GK Catching, GK Reflexes), with no cap at 99 on the points bought (base + training is cut to 99 only after the proficiency bonus, see below) — the labels are efootbase's (`PROGRESSION_CATEGORY_LABELS`). Jumping is the one stat in two categories: it rises with Aerial Strength and with Goalkeeper 1 together, which is what every one of the 44,103 eFHUB cards shows (change `jump-from-gk1`, 2026-10-18 — before it, goalkeeper Jump was shown as "n/a (card-specific)");
- boosters add their real stat vectors; a booster without stat data (the common "Booster +1") is shown as a note, cannot be toggled and never counts as a custom build;
- **Manager Proficiency** (slider 70–90, default 90 — efootbase applies it even with no manager selected): a trained stat `s` (base + training) gains 1–3 by efootbase's band table for the level (level 90: 40–55 → 1, 56–82 → 2, 83–98 → 3; nothing at 70–76, below the first band or at 99+), never past 99; boosters come after it and may pass 99. A stat trained above 99 is cut to 99 before the boosters, as on efootbase's sheet (98 + 4 → 99; owner decision 2026-10-19 — the points bought above 99 are not counted, and the stat's tooltip shows the part cut; the game's own max-level overall leans the other way, 94 vs 65 of the 99 cards where it matters, see `docs/efootbase-exact-model.md`);
- **managers**: "Select Manager" opens a dialog with efootbase's 69 picker managers (rating badge, one or two "+1" stat pills, search by name or stat; sorted by rating, then id). Choosing one sets the proficiency to its rating (83–90) and adds +1 to its pill stats after the boosters — a rating below 90 can lower other stats; choosing it again or moving the slider deselects it; Reset and Max OVR keep it;
- the **overall** is efootbase's own integer formula (13 positions × 28 weights, stats scaled by 1 / 0.97 / 0.85 at full / half / no proficiency, height and weak-foot terms, `floor((sum + 499) / 1000)` limited to 40..127) — no "~", no anchor, no fitted penalty. It reproduced every overall (793/793), stat (20,618/20,618) and position tile (10,309/10,309) read on efootbase for five cards, and 263/263 builds of an earlier capture; Messi at SS reads Max 106/109/109/110 and Reset 94/97/97/97 at 70/80/85/90, as on efootbase. Other cards are checked in bulk only: the formula equals the dump's overall on 99.9 % of 40,516 level-cap-1 cards and, fed the eFHUB max-level stats, efootbase's max-level overall on 95.1 % of 9,843 cards (98.4 % within 1);
- the **Pitch Map, Best Fit and "At POS"** are computed with the same formula for every card (the 2,284 newest cards without eFHUB data included), from the current build or, without a panel, from the stats on display; the stored eFHUB position ratings are no longer shown;
- **Max OVR** is the exact optimum of the formula's linear part (without the proficiency bonus) within the budget, so it is the same build at every proficiency and for every manager — as efootbase's own Max OVR build is. It reproduces efootbase's own Max readings on every recorded reading; with the bonus a hand-made build can read up to 1 point higher (8 of 105 card × level pairs on the fixture, never at 70–76);
- Max Level is applied when you leave the field or press Enter (the spinner applies at once); an allocation the new level cannot afford is reset and announced.

The stat grid shows the build's projection by default ("Build (N)"), with the dump's own max-level values ("Max") and the level-1 base ("Base") one click away; any change in the panel returns to the build view. Booster bumps are cyan "+N" chips, the manager's lime "+1" chips, and a stat's tooltip splits it into base, training, proficiency, booster and manager parts. The card face prints the build's overall (marked "BUILD"); the single pill next to the name is the card's max overall from the dump, as on efootbase, with a visible "dump max · no proficiency bonus" label beside it (it carries Booster 1 only, so it sits below the opening build at proficiency 90).

The shared engine lives in `packages/shared/src/progression.ts` with efootbase's constants in `ovrModel.ts` (integers and stat names only); `pnpm --filter @eflab/shared test` checks the training rules and the Max OVR dynamic programme against 261 cards sampled from the hub (`__fixtures__/progression-oracle.json`) and the exact model against `__fixtures__/exact-model-oracle.json` (five anonymous cards, 262 efootbase readings, numbers only): band table, every stat, overall and position tile, the manager rule, the reference card, efootbase's Max readings, the bound against an exact bonus-aware optimum, and 20 tamper cases (a changed weight, band bound, rounding, scale factor, clamp or pipeline order) that must each fail. Not modelled: Position Training, In-Match Roles (no data) and manager tactics (efootbase has none).

## Environment variables

See `.env.example` (root) and `apps/web/.env.example`. Summary:

- API: `DATABASE_URL`, `API_PORT`, `API_HOST`, `API_ORIGIN`, `WEB_ORIGIN` (comma-separated CORS allow-list), `NODE_ENV` (set by the scripts), `R2_PUBLIC_BASE` (rebases stored R2 URLs), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`.
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_R2_PUBLIC_BASE`, `NEXT_PUBLIC_IMAGE_VERSION` (card image cache version, see below), `API_INTERNAL_URL`, `NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_BUILD_UTC` (filled from git by `next.config.ts`).
- Seeders: `EFOOTBASE_DUMP_PATH`, `EFOOTBASE_META_PATH`, `EFOOTBASE_PACKS_PATH`, `EFHUB_DB_PATH`, `SQLITE3_BIN`.
- Scripts: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=efootlab`, `EFBASE_API_KEY` (dump script, via `--env`), `PSQL` (verify-seed).
- Sync worker: `DATABASE_URL`, `EFBASE_API_KEY`, the `R2_*` variables above, `R2_PUBLIC_BASE` (required by incremental and full runs), optional `EFBASE_API_BASE`, `SYNC_PYTHON`, `SYNC_R2_UPLOAD_CMD`, `EFOOTBASE_STATIC_DIR`; `NODE_ENV=test` / `SYNC_TEST_MODE=1` = test mode (loopback source, scratch database, stand-in upload). Admin commands: `ADMIN_PASSWORD` instead of the prompt (never store it in `.env`). Meanings and where to keep the secrets: `docs/admin-sync.md`.

Changing the R2 domain = set `R2_PUBLIC_BASE` (API) and `NEXT_PUBLIC_R2_PUBLIC_BASE` (web) and rebuild the web app; the database is not rewritten.

Card image URLs carry a cache version (`cards/{id}_dynamic.webp?v=20261019`) because R2 serves them `immutable` for a year and a re-dump overwrites changed card images under the same key. After card images are overwritten in place on R2, bump `DEFAULT_IMAGE_VERSION` in `apps/web/lib/r2-images.ts` (or set `NEXT_PUBLIC_IMAGE_VERSION`) and rebuild the web app.

## Known limitations

- The Progression panel uses efootbase's constants (recovered from its public client; owner-accepted terms risk): exact on every reading of five measured cards, checked in bulk elsewhere (see above), and they must be re-derived when efootbase changes them (`docs/efootbase-exact-model.md`); a stat trained above 99 is cut to 99 before the boosters, like efootbase's sheet (the game's own max-level overall agrees better with keeping it); Max OVR ignores the bonus and the cut (up to 1 displayed point below the best build, up to 2 when the preset trains a stat past 99); the picker's order inside a rating is by id; Position Training, In-Match Roles and manager tactics are not modelled; builds are not saved anywhere.
- 40,516 of the 50,691 dump cards carry `levelCap` 1; their max-level view equals the base view and they show a note ("No Progression panel for this card: its max level is 1, so it has no training points to spend") instead of the panel.
- **Dump freshness**: re-dumped 2026-10-18; the newest `releaseDate` in the database is 2026-10-15 (Ricardo Quaresma, missing from the 2026-10-06 dump, is now present). The cards added by the re-dump have no eFHUB cross-fill data and overwritten card images may be served stale from caches (see above). Refreshing again needs `scripts/efootbase_dump.py` with an API key.
- **efootbase's filter / sort / search results could not be compared**: its API answers automation with a Cloudflare bot check, so the catalogue filters were verified against our own data only (labels and controls follow the capture).
- Not modelled because the dump has no such data: efootbase's **Position Training** toggle and **In-Match Roles** (set-piece takers, captain). Body Model (11 physique values + 5 derived metrics), Form and Injury Resistance are stored for every card, returned by `player.byId` / `player.compare` and shown in their detail-page sections.
- Skill names, descriptions, Showtime / Classic groups, stat boosts, activation text and artwork come from a hand-taken efootbase snapshot (2026-10-18) that will go stale; boosts exist only for the 28 skills efootbase showed on the surveyed cards (others show none, never a guess); the snapshot itself stays outside the repository (see `docs/efootbase-static-snapshot.md`).
- **Newer than the dump**: efootbase's Skills filter lists 28 Showtime skills, 5 of which (Beast Drive, Decisive Pass, GK Aerial Claim, GK Rush Out, Sharp Cut) are not in the dump — they are stored as hidden `Skill` rows (`released: false`, never returned by the API) that carry efootbase's description, the Showtime group and wiki order but no icon, no stat effects, no activation and no holders, so our Showtime group has 23. The AI style "Long Ranger" is likewise unavailable (no column). The four playing styles that post-dated the first dump (Press Back, Tough Marker, Deep Defender, Build-up GK — ids 23, 31, 32, 34) are carried by cards of the 2026-10 re-dump and are offered in the Playing Style filter; their names come from efootbase's English UI strings because the dump's field labels still lack them.
- Japanese/Chinese name search runs only for non-ASCII queries and is not index-backed.
- The `/players` Nation filter is shared by internal country id (`nat=14`, repeated for several nations) because the data has no ISO code column; such a link stays valid only while the country ids are unchanged (a re-seed that renumbers them changes its meaning). Position, League and Team links repeat `pos` / `league` / `team` the same way (`/players?pos=SS&pos=CF&league=4&league=12`); old single-value links keep working. Each id list holds at most 50 values: the pickers say so ("At most 50 selections") and disable further options, and a hand-written link with more keeps the 50 smallest ids.
- Kept on purpose: the `auth` router with Google OAuth (no visitor sign-in UI), the Pack/PackCard and Manager tables (seeded data, no API reads them except the pack name on a card), and `better-auth` (only its crypto helpers are used).
- **Sync worker** (`docs/admin-sync.md`):
  - an incremental run sees only new cards — stat edits arrive with the weekly full run;
  - no run does the eFHUB cross-fill;
  - overwritten card images need an image-version bump and a web rebuild by hand;
  - changed-image detection assumes R2's ETag is the content MD5, which is not yet verified;
  - a block from efootbase pauses everything for 6 hours;
  - web and API must be the same site for the admin cookie;
  - behind a reverse proxy the per-address sign-in limit is shared by all clients until Fastify's `trustProxy` is configured in code.
- The eFootball fonts in `apps/web/public/fonts/` have an unknown licence.
- Git history still contains two third-party keys that were redacted from `docs/` on 2026-10-17.

## License

Internal — experimental.
