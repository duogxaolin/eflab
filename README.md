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
│   ├── api/        # Fastify + tRPC (player, featured, skill, pack, manager, community, auth, user, tierList, feed, pages)
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
├── docker-compose.yml  # postgres:16-alpine on 127.0.0.1:5433 · redis:7-alpine on 127.0.0.1:6380
└── .env.example        # every variable the API, seeders, scripts and web read
```

## Local setup

### Prerequisites

- Node.js ≥ 22, pnpm ≥ 10 (`corepack enable`; the repo pins `pnpm@11`)
- Docker (Postgres + Redis)
- The data dumps, which are **not in the repo** (`dump/` is gitignored):
  - `dump/efootbase/players.jsonl`, `players_meta.json`, `packs.json` — produced by `scripts/efootbase_dump.py`
  - `dump/efhub/efhub_db.sqlite` — eFHUB CDN SQLite (see `docs/efhub-sqlite-gap-analysis.md`) + a `sqlite3` CLI (`SQLITE3_BIN`)
- `python3` (stdlib only) for `scripts/verify-seed.py` and the JSON parsing in `scripts/smoke-test.sh`

### 1. Start Postgres + Redis

```bash
docker compose up -d
# postgres 127.0.0.1:5433 · redis 127.0.0.1:6380 (bound to loopback; 5433 avoids a local Postgres on 5432)
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
pnpm db:migrate    # prisma migrate deploy: 20261017000000_baseline (+ pg_trgm/unaccent) and 20261017000100_parity_fixes
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

`scripts/smoke-test.sh` starts the API itself on port **4300** (`SMOKE_API_PORT` to change), waits for `/health`, runs ~19 checks against the refreshed database (featured bundle by slug, manager tactics, 84 skills, every card type non-empty, duplicate-free pagination, compare order, accent-insensitive search, 400 on out-of-range ids, malformed-cookie tolerance) and stops the API on exit. Set `API_URL=http://localhost:4000` to run the checks against an API that is already running.

**There is no CI.** Run `pnpm typecheck` and `pnpm test` locally before pushing.

## Endpoints

```bash
curl http://localhost:4000/health
# {"status":"ok","db":"connected","time":"…"}   (503 "degraded" when Postgres is unreachable)
```

tRPC lives under `/trpc/*` (GET with a superjson-wrapped `input`, batches of at most 10). Procedures the web app uses:

| Procedure | Purpose |
|---|---|
| `player.list` | filters (card-type scope, position, playing/defensive style, nationality, foot, OVR ranges, club/league, skill) + `q` accent-insensitive name search + deterministic `[sort, id]` pagination |
| `player.byId` | full card DTO for `baseId`/`cardId` (null when the base does not match) |
| `player.search` | ranked name search (exact substring above trigram similarity) for the ⌘K palette and the compare picker |
| `player.compare` | 1–4 cards, returned in the requested order |
| `player.trending`, `player.countries` | home trending window, nationality list |
| `featured.list` / `featured.bySlug` | the 24 featured bundles (home carousel, `/packs`, `/packs/[slug]`) |
| `skill.list` / `skill.byId` / `skill.players` | 84 skills with holder counts, holders per skill |
| `auth.getSession` / `auth.signOut` | session plumbing (no sign-in UI is routed) |

`manager.*`, `pack.*`, `community.*`, `user.*`, `tierList.*`, `feed.*` and `pages.*` are still registered but have no web caller (`community.simulate` runs the same progression engine the detail page runs client-side).

## Progression panel

The player detail page carries a Progression sheet for every card with a level cap above 1: Max Level (1..level cap), position (13), ten training categories with the cost of the next stat point, points used / left, Booster 1 / 2 toggles, **Max OVR** and **Reset**. The rules were recovered from the public eFHUB data (not invented):

- training points = level cap − 1; the nth stat point of a category costs 0.5 × ⌈n / 4⌉ points (c(4) = 2, c(8) = 6, c(12) = 12 …);
- each category raises every stat it contains by one per stat point (Shooting → Finishing, Set Piece Taking, Curl; Passing → Low Pass, Lofted Pass; Dribbling → Dribbling, Ball Control, Tight Possession; Dexterity → Offensive Awareness, Acceleration, Balance; Lower Body → Kicking Power, Speed, Stamina; Aerial → Heading, Physical Contact, Jump; Defending → Defensive Awareness, Defensive Engagement, Tackling, Aggression; GK 1–3 → the five GK stats), with no cap at 99;
- boosters add their real stat vectors (Booster 1 on by default; a booster without stat data, such as the common "Booster +1", is shown as a note and cannot be toggled);
- the overall is a **fitted estimate** (`~`), accurate to about ±1 at the card's **full-proficiency** positions and less for goalkeepers and centre-backs; every position in the selector is labelled full / half / none, and half or non-proficient positions apply a fitted proficiency penalty (`max(40, k·estimate + c)`, within ±1 on 99.9 % / 99.7 % of held-out hub observations; an outfield card at GK is a flat 40). Max OVR is the exact optimum of that estimate within the budget;
- Max Level is applied when you leave the field or press Enter (the spinner applies at once); an allocation the new level cannot afford is reset and announced.

The shared engine lives in `packages/shared/src/progression.ts` with the fitted weights in `ovrWeights.ts`; `pnpm --filter @eflab/shared test` checks every rule against 260 cards sampled from the hub (`__fixtures__/progression-oracle.json`).

## Environment variables

See `.env.example` (root) and `apps/web/.env.example`. Summary:

- API: `DATABASE_URL`, `API_PORT`, `API_HOST`, `API_ORIGIN`, `WEB_ORIGIN` (comma-separated CORS allow-list), `NODE_ENV` (set by the scripts), `R2_PUBLIC_BASE` (rebases stored R2 URLs), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`.
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_R2_PUBLIC_BASE`, `API_INTERNAL_URL`, `NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_BUILD_UTC` (filled from git by `next.config.ts`).
- Seeders: `EFOOTBASE_DUMP_PATH`, `EFOOTBASE_META_PATH`, `EFOOTBASE_PACKS_PATH`, `EFHUB_DB_PATH`, `SQLITE3_BIN`.
- Scripts: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=efootlab`, `EFBASE_API_KEY` (dump script, via `--env`), `PSQL` (verify-seed).

Changing the R2 domain = set `R2_PUBLIC_BASE` (API) and `NEXT_PUBLIC_R2_PUBLIC_BASE` (web) and rebuild the web app; the database is not rewritten.

## Known limitations

- The Progression panel's overall is an estimate (fitted formula, ±1 at full-proficiency positions, lower confidence for GK and CB; half / non-proficient positions use a fitted penalty verified on held-out hub cards); goalkeeper Jump is shown as "n/a (card-specific)"; there is no manager control (no verifiable data); the weights follow the game version the eFHUB data reflects and must be regenerated with it; `community.saveBuild` does not persist the selected position (the `Build` table has no column for it).
- 38,337 cards carry `levelCap` 1 in the dump; their max-level view equals the base view and they show no Progression panel.
- Japanese/Chinese name search runs only for non-ASCII queries and is not index-backed.
- Dead API procedures, tables and components are kept until the owner decides to remove them.
- The eFootball fonts in `apps/web/public/fonts/` have an unknown licence.
- Git history still contains two third-party keys that were redacted from `docs/` on 2026-10-17.

## License

Internal — experimental.
