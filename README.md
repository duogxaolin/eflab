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
| Config | `packages/config` | shared tsconfig presets |

Theme: efootbase-style **zinc + lime** dark UI (canvas `#060607`, panel `#18181b`, accent `#acf41a`; tokens in `apps/web/app/globals.css`, spec in `openspec/ui-dna.md`). Cards are a single pre-composited R2 image with HTML overlays and a CSS 3D tilt — no Three.js/WebGL.

## Layout

```
eflab/
├── apps/
│   ├── api/        # Fastify + tRPC (player, featured, skill, auth) + /health + Google OAuth
│   └── web/        # Next.js routes: / /players /players/[baseId]/[cardId] /compare /packs /packs/[slug] /skills /skills/[slug]
├── packages/
│   ├── db/         # Prisma schema + migrations, seed-efootbase-full.ts, seed-efhub-crossfill.ts, fixtures/
│   ├── shared/     # Zod schemas, constants (CARD_TYPE_LABELS, SORT_FIELDS…), helpers (+tests), progression (+tests)
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
pnpm db:migrate    # prisma migrate deploy: 20261017000000_baseline (+ pg_trgm/unaccent), 20261017000100_parity_fixes, 20261018000000_remove_dead_surface
pnpm db:refresh    # db:seed (efootbase dump → Postgres, upsert in one transaction) then db:crossfill (eFHUB SQLite)
python3 -I scripts/verify-seed.py   # optional: assert the DB matches the dump
```

What `db:refresh` leaves behind (2026-10-17 dump): 48,410 players (48,407 dump + 3 eFHUB-only) · 1,475 managers with tactic ratings · 375 boosters · 2,046 packs · 24 featured bundles (189 cards) · 84 skills / 191,444 player-skill rows · 185 countries · 707 teams · 34 leagues · 10,745 community tier badges.

Seed behaviour:

- `pnpm db:seed` upserts Player/Manager (`INSERT … ON CONFLICT DO UPDATE`) and replaces the catalogue tables inside **one transaction**; it never writes the cross-fill-owned columns and never touches user tables (`--reset-users` opts in; `--prune` deletes players missing from the dump).
- `pnpm db:crossfill` fills what efootbase cannot expose: manager tactics, stars/reputation/overallPotential/gkClearing, per-position ratings, community tiers and 3 extra players.
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
pnpm test        # unit tests (@eflab/shared: progression oracle + helpers) then scripts/smoke-test.sh
pnpm build       # next build (web) + tsc --noEmit (api / db / shared)
```

`scripts/smoke-test.sh` starts the API itself on port **4300** (`SMOKE_API_PORT` to change), waits for `/health`, runs 19 checks against the refreshed database (featured bundle by slug, removed routers answer 404, 84 skills, every card type non-empty, duplicate-free pagination, compare order, accent-insensitive search, 400 on out-of-range ids, malformed-cookie tolerance) and stops the API on exit; the manager tactic cross-fill is asserted by `scripts/verify-seed.py`. Set `API_URL=http://localhost:4000` to run the checks against an API that is already running.

**There is no CI.** Run `pnpm typecheck` and `pnpm test` locally before pushing.

## Endpoints

```bash
curl http://localhost:4000/health
# {"status":"ok","db":"connected","time":"…"}   (503 "degraded" when Postgres is unreachable)
```

tRPC lives under `/trpc/*` (GET with a superjson-wrapped `input`, batches of at most 10). Every mounted procedure:

| Procedure | Purpose |
|---|---|
| `player.list` | filters (card types, position, playing style in either slot / defence slot, AI styles, nation, foot, base/max overall ranges, condition, form, weak-foot accuracy/usage, height/weight/age, skills (all must be present), league/team, stat ranges at base or max, body-model ranges) + `q` accent-insensitive name search + sort presets (`trending`, `new`, `top`, `highest`, `lowest`) or any `SORT_FIELDS` column, deterministic `[sort, id]` pagination |
| `player.byId` | full card DTO for `baseId`/`cardId` (null when the base does not match) |
| `player.search` | ranked name search (exact substring above trigram similarity) for the ⌘K palette and the compare picker |
| `player.compare` | 1–4 cards, returned in the requested order |
| `player.trending`, `player.countries` | home trending window, nationality list |
| `featured.list` / `featured.bySlug` | the 24 featured bundles (home carousel, `/packs`, `/packs/[slug]`) |
| `skill.list` / `skill.byId` / `skill.players` | 84 skills with holder counts, holders per skill |
| `auth.getSession` / `auth.signOut` | session plumbing used by `lib/auth.tsx` (no sign-in UI is routed) |
| `auth.signUp` / `auth.signIn` | email/password registration and login (kept with the auth system; no web caller) |

The `manager`, `pack`, `community`, `user`, `tierList`, `feed` and `pages` routers were removed on 2026-10-18 (change `remove-dead-surface`) together with the Build / Review / TierVote / TierList / Follow / Post / PostLike / Comment tables; the Pack and Manager tables stay as seeded data.

## Progression panel

The player detail page carries a Progression sheet for every card with a level cap above 1, laid out like efootbase's (change `efootbase-parity-round2`, 2026-10-18): "used/total pts", Max Level (1..level cap), position (13), ten category rows (label, − n +, slider) with the cost of the next stat point, Booster 1 / 2 toggles, **Max OVR** and **Reset**. The rules were recovered from the public eFHUB data (not invented):

- **the panel opens on the Max-OVR build** for the card's registered position with every usable booster on — the same opening state as efootbase's sheet; "custom build" means any deviation from that state, Reset zeroes every category and Max OVR restores the optimum;
- **points are shown in efootbase's whole-point unit** (`toDisplayPoints`, twice the engine's training points): a level-32 card reads "62/62 pts", the first four stat points of a category cost 1 each, the next four 2 each (engine: budget = level cap − 1, the nth stat point costs 0.5 × ⌈n / 4⌉);
- each category raises every stat it contains by one per stat point (Shooting → Finishing, Place Kicking, Curl; Passing → Low Pass, Lofted Pass; Dribbling → Dribbling, Ball Control, Tight Possession; Dexterity → Offensive Awareness, Acceleration, Balance; **Lower Body Strength** → Kicking Power, Speed, Stamina; **Aerial Strength** → Heading, Physical Contact, Jumping; Defending → Defensive Awareness, Defensive Engagement, Tackling, Aggression; **Goalkeeper 1–3** → the five GK stats), with no cap at 99 — the labels are efootbase's (`PROGRESSION_CATEGORY_LABELS`);
- boosters add their real stat vectors; a booster without stat data (the common "Booster +1") is shown as a note, cannot be toggled and never counts as a custom build;
- the overall is a **fitted estimate** (`~`), accurate to about ±1 at the card's **full-proficiency** positions and less for goalkeepers and centre-backs; every position in the selector is labelled full / half / none, and half or non-proficient positions apply a fitted proficiency penalty (`max(40, k·estimate + c)`, within ±1 on 99.9 % / 99.7 % of held-out hub observations; an outfield card at GK is a flat 40). Max OVR is the exact optimum of that estimate within the budget;
- **the estimate excludes efootbase's "Manager Proficiency"** (slider 70–90, default 90, applied even with no manager). Measured on 2026-10-18: at 70 the two agree (Messi SS: 6/6 builds within ±1, 155/156 stats identical; Cannavaro CB: 2/2); at efootbase's default 90 its overall is about 4 higher (Messi SS: 24 builds, mean −3.9, 0/24 within ±1; Neuer GK: 8 builds, about −5; Cannavaro CB: 8 builds, mean −4.25). The panel says so next to the value ("No Manager Proficiency — efootbase shows about 4 higher at its default 90"). The mechanism was recovered but not shipped: efootbase adds `min(99 − s, ⌊s × r(p)⌋)` to every stat value `s` (base + training, before boosters) with a rate `r` per proficiency `p` (0 up to 76, then rising to about 3.6 % at 90) and then evaluates the overall on the boosted stats — that rule reproduced 206/207 stat values and 24/24 overalls within ±1 on the one held-out card we could measure. A slider ships only after ≥ 95 % within ±1 on ≥ 30 held-out builds across ≥ 3 other cards including a goalkeeper; efootbase answered the second page load of that measurement with a Cloudflare challenge, so the attempt stopped at one card;
- Max Level is applied when you leave the field or press Enter (the spinner applies at once); an allocation the new level cannot afford is reset and announced.

The stat grid shows the build's projection by default ("Build (~N)"), with the dump's own max-level values ("Max") and the level-1 base ("Base") one click away; any change in the panel returns to the build view. The card face prints the build estimate (marked "EST"); the single pill next to the name is the card's max overall from the dump, as on efootbase.

The shared engine lives in `packages/shared/src/progression.ts` with the fitted weights in `ovrWeights.ts`; `pnpm --filter @eflab/shared test` checks every rule (including the displayed unit and the labels) against 260 cards sampled from the hub (`__fixtures__/progression-oracle.json`).

## Environment variables

See `.env.example` (root) and `apps/web/.env.example`. Summary:

- API: `DATABASE_URL`, `API_PORT`, `API_HOST`, `API_ORIGIN`, `WEB_ORIGIN` (comma-separated CORS allow-list), `NODE_ENV` (set by the scripts), `R2_PUBLIC_BASE` (rebases stored R2 URLs), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`.
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_R2_PUBLIC_BASE`, `API_INTERNAL_URL`, `NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_BUILD_UTC` (filled from git by `next.config.ts`).
- Seeders: `EFOOTBASE_DUMP_PATH`, `EFOOTBASE_META_PATH`, `EFOOTBASE_PACKS_PATH`, `EFHUB_DB_PATH`, `SQLITE3_BIN`.
- Scripts: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=efootlab`, `EFBASE_API_KEY` (dump script, via `--env`), `PSQL` (verify-seed).

Changing the R2 domain = set `R2_PUBLIC_BASE` (API) and `NEXT_PUBLIC_R2_PUBLIC_BASE` (web) and rebuild the web app; the database is not rewritten.

## Known limitations

- The Progression panel's overall is an estimate (fitted formula, ±1 at full-proficiency positions, lower confidence for GK and CB; half / non-proficient positions use a fitted penalty verified on held-out hub cards); goalkeeper Jump is shown as "n/a (card-specific)"; there is no manager picker and **no Manager Proficiency model** — efootbase's default display (proficiency 90) is about 4 overall higher than ours, which matches it at 70 (numbers above); the weights follow the game version the eFHUB data reflects and must be regenerated with it; builds are not saved anywhere.
- 38,337 cards carry `levelCap` 1 in the dump; their max-level view equals the base view and they show a note ("Progression and manager data are not available for this card") instead of the panel.
- **The dump is stale** (taken 2026-10-06): the newest `releaseDate` in the database is 2026-10-01. Of the 37 distinct card ids linked from efootbase's home page on 2026-10-18 only 8 exist here (29 are newer cards); by base player 33 of 34 are present (only Ricardo Quaresma, base 4526, is missing entirely). Refreshing needs `scripts/efootbase_dump.py` with an API key.
- **efootbase's filter / sort / search results could not be compared**: its API answers automation with a Cloudflare bot check, so the catalogue filters were verified against our own data only (labels and controls follow the capture).
- Not modelled because the dump has no such data: efootbase's **Position Training** toggle and **In-Match Roles** (set-piece takers, captain). Body Model (11 physique values + 5 derived metrics), Form and Injury Resistance are stored for every card, returned by `player.byId` / `player.compare` and shown in their detail-page sections.
- Skill labels and the Showtime / Classic grouping are display-only (`apps/web/lib/skill-labels.ts`); the database keeps the fixture names.
- **Newer than the dump**: efootbase's Skills filter lists 28 Showtime skills, 5 of which (Beast Drive, Decisive Pass, GK Aerial Claim, GK Rush Out, Sharp Cut) are not in the dump or the `Skill` table — our Showtime group has 23. Four playing styles (Build-up GK, Deep Defender, Press Back, Tough Marker) and the AI style "Long Ranger" are likewise unavailable (listed as such, never given invented ids).
- Japanese/Chinese name search runs only for non-ASCII queries and is not index-backed.
- Kept on purpose: the `auth` router with Google OAuth (no sign-in UI), the Pack/PackCard and Manager tables (seeded data, no API reads them except the pack name on a card), and `better-auth` (only its crypto helpers are used).
- The eFootball fonts in `apps/web/public/fonts/` have an unknown licence.
- Git history still contains two third-party keys that were redacted from `docs/` on 2026-10-17.

## License

Internal — experimental.
