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

Theme: dark **neutral greys + lime** UI rebuilt in change `efootbase-ui-redesign` (2026-10-21) from values measured on a reference capture — canvas `#060606`, panel `#181818`, content cards `#202020`, accent `#acf41a`, a blurred aurora strip at the top of every page (text drawn on it uses a brighter secondary tone, `#d4d4d4`, so it keeps 4.5:1 there; the detail page adds a faint card-type tint); tokens in `apps/web/app/globals.css`, spec and the list of deliberate deviations in `openspec/ui-dna.md`. No third-party HTML, CSS, images, logos or fonts were copied. Shell: a 65 px header with Players / Compare / Packs / Skills and a ⌘K search palette from 1024 px; below it a floating bottom tab bar (no hamburger menu). Cards are a single pre-composited R2 image with HTML overlays; on hover / keyboard focus a tile scales to 1.05 (no tilt, no glare, no animation under reduced motion) — no Three.js/WebGL. The home page is a player search, the 12 latest cards and the latest packs.

Interaction (change `efootbase-behaviour-parity`, 2026-10-21; timings and functions matched to a reference survey of 2026-10-23 in change `efootbase-function-parity`, 2026-10-24; contract and the list of behaviours the reference did not show in `openspec/ui-dna.md` → "Behaviour"): one tooltip and one popover component (`apps/web/components/ui/`). Tooltips open after the mouse rests 500 ms (at once right after another one, at once on keyboard focus, never from touch), close 100 ms after the pointer leaves, stay open while hovered and close on Escape; popovers open on click / Enter / Space / tap, are non-modal dialogs and return focus on Escape. On the player page skill names are links with a preview (on touch the first tap shows the preview with a link), playing styles show their description, a stat row (when the build can spend points) or a category of the strip above the stats opens an Adjust popover with that category's − / value / + and a 0–25 slider (the per-stat breakdown is the "Stat breakdown" list in "About this build"), and the Progression card stays pinned while the two columns scroll, with Card Info and Other Versions below them; on phones the dock's proficiency chip opens a small manager / proficiency popover. Dialogs close on one Escape even with text in their search, which stays pinned; drawers and sheets slide in over 250 ms (instantly with reduced motion). `/players` shows 72 cards per page, searches card and pack names from 3 characters (the palette, the home search and the compare picker use the same rule), clamps an out-of-range page, refuses a minimum above the maximum and lists ten fixed nations first (England, France, Spain, Brazil, Argentina, Germany, Italy, Netherlands, Portugal, Belgium), then A–Z; the home search is a keyboard combobox; pack rows never scroll by themselves and have no arrow buttons; compare holds two builds side by side (the same card may fill both slots) and drops unknown ids with a message; the skills search ignores hyphens and keeps its filter in the URL. The skills wiki lives at `/wiki/skills` and `/wiki/skills/<slug>` since change `efootbase-function-parity` (each old `/skills` URL answers one permanent redirect to its new address).

## Layout

```
eflab/
├── apps/
│   ├── api/        # Fastify + tRPC (player, featured, skill, booster, manager, auth, admin) + /health + Google OAuth
│   ├── web/        # Next.js routes: / /players /players/[baseId]/[cardId] /compare /packs /packs/[slug] /wiki/skills /wiki/skills/[slug]
│   │               #   + /skills/[slug] (old skill URLs: one permanent redirect to the public slug)
│   │               #   + private /admin, /admin/login, /admin/runs, /admin/runs/[id] (noindex, not linked)
│   └── worker/     # sync worker: schedule + run queue in Postgres, check / incremental / full runs (+tests on scratch databases)
├── packages/
│   ├── db/         # Prisma schema + migrations, seed-efootbase-full.ts, seed-efhub-crossfill.ts, efootbase-map.ts (shared row mapping),
│   │               #   admin-auth.ts + admin-cli.ts (admin accounts), boosters.ts (the 29 basic second-booster choices), fixtures/
│   ├── shared/     # Zod schemas, constants (CARD_TYPE_LABELS, SORT_FIELDS…), helpers (+tests), progression (+tests),
│   │               #   build rules + URL codecs of the card page, compare and /players (+tests), sync (+tests)
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

What `db:refresh` leaves behind (2026-10-18 re-dump; then `db:seed` with the static snapshot on 2026-10-19): 50,694 players (50,691 dump + 3 eFHUB-only; newest release 2026-10-15) · 1,479 managers (1,475 with tactic ratings, 69 marked as efootbase picker managers) · 379 boosters · 2,065 packs · 24 featured bundles (166 cards) · 84 public skills (23 Showtime + 44 Classic with efootbase description, artwork and — for 28 — stat boosts, plus 17 ungrouped entries that the skills wiki does not list) + 5 hidden unreleased skills / 195,607 player-skill rows · 185 countries · 736 teams · 34 leagues · 10,745 community tier badges.

**Static efootbase snapshot (optional).** Skill descriptions, groups, stat boosts, activation text and artwork, and the list of efootbase's picker managers come from a hand-taken browser snapshot placed in the git-ignored `dump/efootbase/static/` (`skills.json`, `managers.json`, `skill-icons/`, `manager-images/`). The images live on R2 (`skills/Skill_<Name>.webp`, `managers/{id}.webp`). None of this third-party content is in the repository: without the snapshot the seed prints a warning and the skills keep their fixture names with no group, artwork or boosts. Note that a seed run without `skills.json` therefore **erases** skill metadata loaded by an earlier run (the Skill table is rebuilt inside the seed transaction), while a seed run without `managers.json` leaves the picker flag (`Manager.inPicker`) untouched. How it was made, its file shapes and how to regenerate and upload it: [`docs/efootbase-static-snapshot.md`](docs/efootbase-static-snapshot.md). Stat boosts exist only for the skills efootbase showed on the cards the survey loaded (28).

The 2026-10-18/19 re-dump (rewritten `scripts/efootbase_dump.py`) added 2,284 new cards and changed 5,380, and uploaded 9,891 images to R2. efootbase's API lists newest cards first with `sort=time_added&order=desc`, accepts `limit` up to 100, and reports `total_count` / `total_pages` as lookahead values (the end of data is the first short page). Limits: the 2,284 new cards have no eFHUB cross-fill data (stars, reputation, position ratings, tier badge); R2 objects carry a 1-year immutable cache, so the 5,312 overwritten card images may stay stale in caches until purged or versioned; `time_added` does not change on stat edits, so only a full dump finds changed cards.

Seed behaviour:

- `pnpm db:seed` upserts Player/Manager (`INSERT … ON CONFLICT DO UPDATE`) and replaces the catalogue tables inside **one transaction**; it never writes the cross-fill-owned columns and never touches user tables (`--reset-users` opts in; `--prune` deletes players missing from the dump).
- `pnpm db:crossfill` fills what efootbase cannot expose: manager tactics, stars/reputation/overallPotential/gkClearing, per-position ratings, community tiers and 3 extra players. A manager card that is not in the eFHUB file gets the tactics of the best eFHUB version of the same coach's name only when that version is not another manager card in the database; otherwise it stays without tactics and the cross-fill warns. That is the case for the new Jürgen Klopp and Cristian Chivu picker cards (eFHUB's Klopp / Chivu entries are the older Klopp / Chivu cards): they keep no tactics.
- `pnpm db:refresh` = both, in order. Re-runnable.
- `pnpm db:push` is for schema experiments only (no `--accept-data-loss`); the database is migration-managed.

Field mapping notes (efootbase → Prisma): `id`/`base_id` → `BigInt`; `overall_rating` → `ovr`, `overall_at_max_level` → `maxOvr`, `max_level` → `levelCap`; 26 base + 26 max stats (`jumping` → `jump`, `set_piece_taking` → `placeKicking`, `tackling` → `ballWinning`); `pos` → `registeredPosition`; `condition` → `[E,D,C,B,A]`; `card_type` code → `CardType` (`0 STANDARD, 1 LEGENDARY, 3 TRENDING, 4 SELECTION, 5 EPIC, 6 HIGHLIGHT, 7 STRIKE_ARENA` — the seed checks the dump's labels in `CARD_TYPE_DUMP_LABELS`; the web shows `CARD_TYPE_LABELS`, which names LEGENDARY "Icons" and EPIC "Epic - Big Time"); `s_*` flags → `PlayerSkill`; `featured` → `Pack`; `packs.json` → `FeaturedBundle`.

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
pnpm test        # unit tests (@eflab/shared: progression oracle, helpers, build rules + URL codecs, /players URL codec, sync;
                 #   @eflab/db: admin passwords, row mapping, basic boosters;
                 #   @eflab/worker: fake efootbase + scratch databases eflab_synctest_*) then scripts/smoke-test.sh
pnpm build       # next build (web) + tsc --noEmit (api / db / shared)
```

`scripts/smoke-test.sh` starts the API itself on port **4300** (`SMOKE_API_PORT` to change), waits for `/health`, runs 64 checks against the refreshed database (featured bundles by slug with `newestCardRelease` and their display positions, removed routers answer 404, `manager.picker` — 69 managers in order, 1–2 valid pills, images on the R2 host — 84 skills with the static efootbase data — Showtime 23 / Classic 44 plus 17 ungrouped entries the wiki does not list, descriptions, R2 artwork, Momentum Dribbling's +6 boosts, unreleased skills hidden — the 67 public slugs and leaders, `skill.byId` by public or stored slug, `skill.players` (Fortress, Long Reach Tackle), `booster.secondChoices` (29), every card type non-empty, sort presets without duplicates, `highest` / `lowest` by max overall and the legacy `top` / `trending`, filters narrow, registered-position, playing-style, team-name and skill-key lists (OR inside, AND between, 400 for over-long or out-of-range lists), duplicate-free pagination, compare order, the search rule — `wonderkids` 8 cards by pack name, `cote` 7, `messi lionel` none, `messi` 113 in pages of 12 —, 400 on out-of-range ids, malformed-cookie tolerance) and stops the API on exit. Its admin section starts a second API on port 4301 (`SMOKE_ADMIN_PORT`) against a scratch database it creates, migrates and drops (`eflab_smoke_admin_<pid>`, one throwaway admin) and runs 42 checks on the admin API, mostly its negative paths (401, 403, identical sign-in failures, lock-out, no secret fields, `no-store`); the manager tactic cross-fill is asserted by `scripts/verify-seed.py`. Set `API_URL=http://localhost:4000` to run the checks against an API that is already running.

**There is no CI.** Run `pnpm typecheck` and `pnpm test` locally before pushing.

## Endpoints

```bash
curl http://localhost:4000/health
# {"status":"ok","db":"connected","time":"…"}   (503 "degraded" when Postgres is unreachable)
```

tRPC lives under `/trpc/*` (GET with a superjson-wrapped `input`, batches of at most 10). Every mounted procedure:

| Procedure | Purpose |
|---|---|
| `player.list` | filters (card types, positions (`positions[]`, up to 13, the card's registered position, any of them), playing styles (`playingStyles[]`, either slot, any of them) / defence slot, AI styles (all of them), nations / leagues / teams (`nationalityIds[]`, `leagueIds[]`, `clubIds[]` or `teamNames[]` by name, up to 50 each, any of them; the single-value `position` / `playingStyle` / `nationalityId` / `leagueId` / `clubId` still work and are merged in), foot, base/max overall ranges, condition, form, weak-foot accuracy/usage, height/weight/age, skills (`skillIds[]` or `skillKeys[]` such as `s_fortress`, all must be present), stat ranges at base or max, body-model ranges — values inside one list are OR-ed, filters are AND-ed) + `q` accent-insensitive search on the card name or its pack name (from 3 characters, the `player.search` rule; a shorter `q` is ignored) + sort presets `new` (newest cards), `highest` / `lowest` (max overall, then id; the old `trending` reads as `new`, `top` as `highest`) or any `SORT_FIELDS` column, deterministic `[sort, id]` pagination; over-long lists and out-of-range ids are a 400 |
| `player.byId` | full card DTO for `baseId`/`cardId` (null when the base does not match) |
| `player.search` | search for the ⌘K palette, the home search and the compare picker (change `efootbase-function-parity`): the query as a substring of the card name or of its pack / campaign name (CJK names too for a non-ASCII query), best max overall first, then newest id, pages of 12 with `hasMore` and each row's pack name — no relevance tiers, no look-alike matching; at least 3 characters (the lists lift names where the query starts a word to the top of each page) |
| `player.compare` | 1–4 cards, returned in the requested order (duplicate ids collapsed, unknown ids skipped) |
| `player.trending` | the 18 newest distinct players (newest card of each), each with its pack name — the home "Latest Players" and the palette's list before a query |
| `player.countries`, `player.leagues`, `player.teams` | the Nation, League and Team filter lists (nations A–Z with their flag, no card count — the Nation dialog lists ten fixed nations first; teams with their league for the Team dialog's headings) |
| `featured.list` / `featured.bySlug` | `{ bundles, newestCardRelease }`: the 24 featured bundles with their stored display position (home "Latest Packs" = the first three, `/packs`) and the newest card release date (the "Last updated" chip); one bundle with its cards (`/packs/[slug]`) |
| `skill.list` / `skill.byId` / `skill.players` | 84 public skills with holder counts, public slug, skill key, leader card (the holder with the highest max overall), group, wiki order, artwork URL, stat boosts (eFootLab stat names) and activation; one skill by its public or stored slug; a skill's leader and its top 12 cards, one per other player (the 5 unreleased skills are never returned) |
| `booster.secondChoices` | the 29 basic "+1" boosters a card without a usable Booster 2 can take as its second booster (alphabetical, four stats each, the `b2=` slug) — from the committed fixture, no database access |
| `manager.picker` | the 69 managers of efootbase's picker (rating desc, then id): name, rating, image URL, one or two stat pills — the Progression panel's "Select Manager" |
| `auth.getSession` / `auth.signOut` | session plumbing used by `lib/auth.tsx` (no sign-in UI is routed) |
| `auth.signUp` / `auth.signIn` | email/password registration and login (kept with the auth system; no web caller) |
| `admin.*` | private admin area: `signIn` / `signOut` / `me`, `config.get` / `config.update` (schedule), `runs.queue` / `runs.cancel` / `runs.list` / `runs.get`, `dashboard` — own accounts and `eflab_admin` cookie, 401 without an admin session, CSRF header on mutations, `Cache-Control: no-store` |

The old `manager` router and the `pack`, `community`, `user`, `tierList`, `feed` and `pages` routers were removed on 2026-10-18 (change `remove-dead-surface`) together with the Build / Review / TierVote / TierList / Follow / Post / PostLike / Comment tables; the Pack and Manager tables stay as seeded data (the player search reads the pack names and their cards, `manager.picker` the picker rows).

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

The player detail page carries a Progression panel for every card with a level cap above 1: "used/total pts", **Max OVR** and **Reset**, "Select Manager" (change `efootbase-exact-model-managers`, 2026-10-19; a bottom-anchored drawer), Manager Proficiency (70–90, change `manager-proficiency-slider`), ten category rows (label, the next stat point's cost "next N", − n +, track), and, in a "Build settings" card at the end of the left column (below the pinned card's travel), Max Level (1..level cap), position (13) and the overall there, with the explanatory notes (what the overall is, the proficiency rule, the cost of the next stat point per category, the Max OVR and limits notes) and the 26-row "Stat breakdown" behind an "About this build" disclosure. Since change `efootbase-function-parity` (2026-10-24) a **Highlight** card with a level cap of 1 gets the same panel with a 1–80 Max Level slider (no point at Max Level 1), and a **Trending** card with a level cap of 1 a "Build" panel with Select Manager and the proficiency only; both include the proficiency bonus in the face, the stats and the position tiles. From 1024 px the Progression card stays pinned 64 px below the top while the two columns scroll; on smaller screens a floating category strip and a dock sit above the tab bar — a strip item opens its category's Adjust popover, the dock's points (remaining/total) and Progression button open the panel in a bottom sheet, and its proficiency chip and manager avatar open a small manager / proficiency popover (layout of change `efootbase-ui-redesign`, behaviour of changes `efootbase-behaviour-parity`, 2026-10-21, and `efootbase-function-parity`). A stat row (when the build can spend points) and a strip item open an Adjust popover with their category's − / value / + and a 0–25 slider (Aerial Strength then Goalkeeper 1 for Jumping). The booster controls are buttons in the page's Overview card. Desktop and phone share one state, and every change is written into the card's URL (below). The training rules were recovered from the public eFHUB data; the proficiency bands, the manager effect and the overall formula are efootbase's own constants, recovered from its public web client (the owner accepted that terms risk; see [`docs/efootbase-exact-model.md`](docs/efootbase-exact-model.md)):

- **the panel opens on the Max-OVR build** for the card's registered position with every usable booster on, Manager Proficiency 90 and no manager — the same opening state as efootbase's sheet — unless the link carries build parameters (they decide alone) or this browser remembers a manager (it is selected after the page loads); "custom build" means any deviation from that state, Reset zeroes every category (the proficiency, the manager, the booster states and the Max Level stay) and Max OVR restores the optimum (the manager stays);
- **the build lives in the card's URL** (change `efootbase-function-parity`): every change is written without a navigation in the order `sho pas dri dex lbs aer def gk1 gk2 gk3 pts ml mp mgr b1 b2 b2l` (the opening state writes no query), so a link reopens the same build; a link is corrected, never trusted (a category above 25 → 25, an over-budget allocation cut in category order, an unknown manager or booster dropped) and the URL is rewritten at once with a polite "adjusted" message;
- **points are shown in efootbase's whole-point unit** (`toDisplayPoints`, twice the engine's training points): a level-32 card reads "62/62 pts", the first four stat points of a category cost 1 each, the next four 2 each (engine: budget = level cap − 1, the nth stat point costs 0.5 × ⌈n / 4⌉);
- each category raises every stat it contains by one per stat point (Shooting → Finishing, Place Kicking, Curl; Passing → Low Pass, Lofted Pass; Dribbling → Dribbling, Ball Control, Tight Possession; Dexterity → Offensive Awareness, Acceleration, Balance; **Lower Body Strength** → Kicking Power, Speed, Stamina; **Aerial Strength** → Heading, Physical Contact, Jumping; Defending → Defensive Awareness, Defensive Engagement, Tackling, Aggression; **Goalkeeper 1** → GK Awareness **and Jumping**; Goalkeeper 2 → GK Parrying, GK Reach; Goalkeeper 3 → GK Catching, GK Reflexes), with no cap at 99 on the points bought (base + training is cut to 99 only after the proficiency bonus, see below) — the labels are efootbase's (`PROGRESSION_CATEGORY_LABELS`). Jumping is the one stat in two categories: it rises with Aerial Strength and with Goalkeeper 1 together, which is what every one of the 44,103 eFHUB cards shows (change `jump-from-gk1`, 2026-10-18 — before it, goalkeeper Jump was shown as "n/a (card-specific)");
- boosters add their real stat vectors. Booster 1 switches off and on (`b1=0`); a **Trending** card's Booster 1 cycles +3 → off → +1 → +2 → +3 (`b1=0/1/2`); a card's own usable Booster 2 is a fixed orange pill that switches off (`b2l=0`). A card with a level cap above 1 whose Booster 2 is absent or has no stat data gets a "Select Booster" slot: the "Select second booster" drawer lists the 29 basic "+1" boosters (`booster.secondChoices`, searchable by name or stat), the chosen one adds +1 to its four stats after the cut at 99 (`b2=<slug>`, e.g. `strikers-instinct1`) and is not carried to other cards. A Booster 1 without stat data (the common "Booster +1") is shown as a note, cannot be toggled and never counts as a custom build;
- **Manager Proficiency** (slider 70–90, default 90 — efootbase applies it even with no manager selected): a trained stat `s` (base + training) gains 1–3 by efootbase's band table for the level (level 90: 40–55 → 1, 56–82 → 2, 83–98 → 3; nothing at 70–76, below the first band or at 99+), never past 99; boosters come after it and may pass 99. A stat trained above 99 is cut to 99 before the boosters, as on efootbase's sheet (98 + 4 → 99; owner decision 2026-10-19 — the points bought above 99 are not counted, and the "Stat breakdown" list shows the part cut; the game's own max-level overall leans the other way, 94 vs 65 of the 99 cards where it matters, see `docs/efootbase-exact-model.md`);
- **managers**: "Select Manager" opens a drawer with efootbase's 69 picker managers (rating badge, one or two "+1" stat pills, search by name or stat; sorted by rating, then id). Choosing one sets the proficiency to its rating (83–90), adds +1 to its pill stats after the boosters — a rating below 90 can lower other stats —, closes the drawer and is remembered in this browser (`localStorage`) for the next cards opened without build parameters (a `mgr` link selects a manager without remembering it). While selected it is listed first with "Clear"; choosing it again or "Clear" deselects it, sets the proficiency back to 90 and forgets it; moving the slider deselects and forgets it; Reset and Max OVR keep it;
- the **overall** is efootbase's own integer formula (13 positions × 28 weights, stats scaled by 1 / 0.97 / 0.85 at full / half / no proficiency, height and weak-foot terms, `floor((sum + 499) / 1000)` limited to 40..127) — no "~", no anchor, no fitted penalty. It reproduced every overall (793/793), stat (20,618/20,618) and position tile (10,309/10,309) read on efootbase for five cards, and 263/263 builds of an earlier capture; Messi at SS reads Max 106/109/109/110 and Reset 94/97/97/97 at 70/80/85/90, as on efootbase. Other cards are checked in bulk only: the formula equals the dump's overall on 99.9 % of 40,516 level-cap-1 cards and, fed the eFHUB max-level stats, efootbase's max-level overall on 95.1 % of 9,843 cards (98.4 % within 1);
- the **Pitch Map, Best Fit and "At POS"** are computed with the same formula for every card (the 2,284 newest cards without eFHUB data included), from the current build or, without a panel, from the stats on display; the stored eFHUB position ratings are no longer shown;
- **Max OVR** is the exact optimum of the formula's linear part (without the proficiency bonus) within the budget, so it is the same build at every proficiency and for every manager — as efootbase's own Max OVR build is. It reproduces efootbase's own Max readings on every recorded reading; with the bonus a hand-made build can read up to 1 point higher (8 of 105 card × level pairs on the fixture, never at 70–76);
- Max Level is applied when you leave the field or press Enter (the spinner applies at once); when the new level cannot afford the points spent, stat points are removed one at a time from the last category holding points (Goalkeeper 3 back to Shooting) until the build fits, and the change is announced (the Highlight slider trims the same way).

The stat grid shows the build's projection by default ("Build (N)"), with the dump's own max-level values ("Max") and the level-1 base ("Base") one click away; any change in the panel returns to the build view. Booster bumps are cyan "+N" chips, the manager's lime "+1" chips, and the "Stat breakdown" list of "About this build" splits each value into base, training, the cut at 99, proficiency, booster and manager parts. The card face (180 px, condition letter only — no MAX LVL / MAX OVR badges; the card's real max level is a "Max Level" row in Card Info) prints the build's overall; the single pill next to the name is the card's max overall from the dump, as on efootbase, with a visible "dump max · no proficiency bonus" label beside it (it carries Booster 1 only, so it sits below the opening build at proficiency 90).

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

- The Progression panel uses efootbase's constants (recovered from its public client; owner-accepted terms risk): exact on every reading of five measured cards, checked in bulk elsewhere (see above), and they must be re-derived when efootbase changes them (`docs/efootbase-exact-model.md`); a stat trained above 99 is cut to 99 before the boosters, like efootbase's sheet (the game's own max-level overall agrees better with keeping it); Max OVR ignores the bonus and the cut (up to 1 displayed point below the best build, up to 2 when the preset trains a stat past 99); the picker's order inside a rating is by id; Position Training, In-Match Roles and manager tactics are not modelled; builds are not stored on the server — a build lives only in the card's URL (and compare's), the last chosen manager only in this browser.
- 40,516 of the 50,691 dump cards carry `levelCap` 1; their max-level view equals the base view. Highlight cards among them get the panel with a 1–80 Max Level slider and Trending cards the "Build" panel (manager and proficiency only); every other level-cap-1 card shows a note ("No Progression panel for this card: its max level is 1, so it has no training points to spend") instead of a panel.
- **Dump freshness**: re-dumped 2026-10-18; the newest `releaseDate` in the database is 2026-10-15 (Ricardo Quaresma, missing from the 2026-10-06 dump, is now present). The cards added by the re-dump have no eFHUB cross-fill data and overwritten card images may be served stale from caches (see above). Refreshing again needs `scripts/efootbase_dump.py` with an API key.
- **efootbase's results were compared only through a browser survey (2026-10-23)**: its API answers automation with a Cloudflare bot check, so the survey read the reference's own pages and change `efootbase-function-parity` reproduced the results it verified (searches, sorts, filter sets, builds, compare, skills) on our data; everything it could not verify twice is in the pending register of `openspec/ui-dna.md`.
- Not modelled because the dump has no such data: efootbase's **Position Training** toggle and **In-Match Roles** (set-piece takers, captain). Body Model (11 physique values + 5 derived metrics), Form and Injury Resistance are stored for every card, returned by `player.byId` / `player.compare` and shown in their detail-page sections.
- Skill names, descriptions, Showtime / Classic groups, stat boosts, activation text and artwork come from a hand-taken efootbase snapshot (2026-10-18) that will go stale; boosts exist only for the 28 skills efootbase showed on the surveyed cards (others show none, never a guess); the snapshot itself stays outside the repository (see `docs/efootbase-static-snapshot.md`).
- **Newer than the dump**: efootbase's Skills filter lists 28 Showtime skills, 5 of which (Beast Drive, Decisive Pass, GK Aerial Claim, GK Rush Out, Sharp Cut) are not in the dump — they are stored as hidden `Skill` rows (`released: false`, never returned by the API) that carry efootbase's description, the Showtime group and wiki order but no icon, no stat effects, no activation and no holders, so our Showtime group has 23. The AI style "Long Ranger" is likewise unavailable (no column). The four playing styles that post-dated the first dump (Press Back, Tough Marker, Deep Defender, Build-up GK — ids 23, 31, 32, 34) are carried by cards of the 2026-10 re-dump and are offered in the Playing Style filter; their names come from efootbase's English UI strings because the dump's field labels still lack them.
- Japanese/Chinese name search runs only for non-ASCII queries and is not index-backed. The Name sort has no index of its own (about 20–60 ms on the whole catalogue; adding one needs a migration).
- Some reference behaviours were not captured and are our own defaults (the tooltip's hover bridge, what the hero playing styles and the points pill open, the home combobox keyboard model); the 2026-10-23 survey settled the tooltip timing, the Adjust popover's contents, the strip item, pack rows and compare duplicates. Functions it did not verify on two checks, or that need data we do not hold (Form A–E, Position Training, In-Match Roles, Trending and Top rated sorting, the Community Rating filter, …), are not built; `openspec/ui-dna.md` lists them with their evidence ("Behaviour", "Function parity — pending register").
- The `/players` Nation filter is shared by internal country id (`nat=14`, repeated for several nations) because the data has no ISO code column; such a link stays valid only while the country ids are unchanged (a re-seed that renumbers them changes its meaning). Position, League and Team links repeat `pos` / `league` / `team` the same way — `pos` is the registered-position index (GK 0 … CF 12) and `team` the team name (`/players?pos=11&pos=12&league=4&league=26&team=Arsenal+FC`); old forms (`pos=SS`, team ids, single values, comma lists) keep working and are rewritten on the next change. Each list holds at most 50 values: the pickers say so ("At most 50 selections") and disable further options, and a hand-written link with more keeps the first 50 in the link's canonical order (the smallest ids; team names in sort order).
- Old skill URLs (`/skills/<slug>`) are resolved through the API before their redirect, so while the API is unreachable they answer the error page instead of the redirect.
- Kept on purpose: the `auth` router with Google OAuth (no visitor sign-in UI), the Pack/PackCard and Manager tables (seeded data; the APIs read the pack name on a card, the pack names and their cards for the player search, and the picker managers), and `better-auth` (only its crypto helpers are used).
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
