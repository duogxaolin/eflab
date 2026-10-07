# eFootball Lab — web + backend ecosystem

A bespoke eFootball player/manager database, build simulator, and community hub. Built as a Turborepo + pnpm monorepo with **Next.js 15 (App Router, Tailwind CSS 4)** web app, **Fastify + tRPC v11** API with SuperJSON BigInt serialization, and **Prisma 6 + PostgreSQL 16** for storage.

Player cards are rendered with **CSS 3D hardware-accelerated transforms** (`perspective` / `rotateX` / `rotateY`) — **no Three.js, no WebGL** — so they render on headless scrapers, low-end devices, and never lose a WebGL context.

## Stack summary

| Surface | Stack |
|---|---|
| Web (`apps/web`) | Next.js 15 App Router · Tailwind CSS 4 · `@trpc/react-query` · Lucide icons |
| API (`apps/api`) | Fastify 5 · `@trpc/server` v11 · SuperJSON transformer |
| DB (`packages/db`) | Prisma 6 ORM · PostgreSQL 16 · 44,028-row bulk SQLite ingester |
| Shared (`packages/shared`) | Zod schemas · progression math · domain constants · `superjson` config |

**Design theme — "Cyber-Sport Dark"** (bespoke, not copied from efootbase):
- Midnight Slate `#0a0e17` background
- Neon Lime `#a3e635` + Cyan `#06b6d4` accents
- 44px minimum touch targets on mobile
- Stat tier colors: 90+ red/pink, 80–89 orange, 70–79 cyan, <70 slate

## Project layout

```
eflab/
├── apps/
│   ├── api/        # Fastify + tRPC routers (player, manager, skill, pack, community)
│   └── web/        # Next.js 15 App Router pages + CSS 3D card components
├── packages/
│   ├── db/         # Prisma schema, migrations, mock + full seed scripts, 67 skill fixtures
│   ├── shared/     # Zod schemas, progression math engine, domain constants, superjson
│   └── config/     # Shared tsconfig presets
├── docs/           # Reference survey docs (efhub · efootbase · pesdb) — read-only
├── docker-compose.yml  # postgres:16-alpine (port 5433) + redis:7-alpine (port 6380)
└── scripts/
    ├── gen-mock-players.js   # Pulls the 30 iconic cards from the efhub SQLite dump
    └── smoke-test.sh          # End-to-end tRPC smoke (health / list / search / build)
```

## Local setup

### Prereqs

- Node.js ≥ 22 (`nvm install 22`)
- pnpm ≥ 11 (`corepack enable`)
- Docker / OrbStack (for Postgres + Redis)

### 1. Start Postgres + Redis

```bash
docker compose up -d
# ports: postgres :5433 · redis :6380 (avoids local ServBay Postgres conflict)
```

> If you don't have another Postgres on `:5432`, you can change the host port in `docker-compose.yml` to `5432:5432` and update `DATABASE_URL` in `.env` accordingly.

### 2. Install workspace deps

```bash
pnpm install
```

### 3. Initialize the database

```bash
pnpm db:push   # pushes the Prisma schema to Postgres (creates tables + indexes)
pnpm db:seed   # seeds 48.407 players + 2.046 packs + 67 skills + 185 countries + 707 teams
               # from dump/efootbase/players.jsonl (efootbase dump). Idempotent, ~60s.
```

eflab sources all player data from **efootbase** (since 2026-10-07). The dump is produced by `scripts/efootbase_dump.py` → `dump/efootbase/players.jsonl` + `dump/efootbase/images/` (93.501 files, ~6.5GB mirrored to Cloudflare R2). The seed script (`packages/db/src/seed-efootbase-full.ts`) also populates `Country.flagUrl` / `Team.emblemUrl` from the efootbase `emblem_images` SHA256 hash URLs.

Notes on field mapping (efootbase → Prisma):
- `id` / `base_id` (int) stored as `BigInt`
- `overall_rating` → `ovr`; `overall_at_max_level` → `maxOvr`
- 23 stats snake_case → camelCase (default 40 if missing)
- `card_type` int → `CardType` enum (0=STANDARD, 1=TRENDING, 3=EPIC, 4=BIG_TIME, 5=HIGHLIGHT, 6=SHOW_TIME, 7=LEGENDARY)
- position aptitude inverted (efootbase 2=full/0=none → prisma 0=registered/2=none)
- `s_*` 67 skill flags → `PlayerSkill` join
- `featured` (pack name) → `Pack` + `featuredPackId` + `PackCard`

### 4. Run the API + web

```bash
# Terminal A — API on :4000
DATABASE_URL='postgresql://eflab:eflab_dev@localhost:5433/eflab?schema=public' pnpm api:dev

# Terminal B — Web on :3000
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm web:dev
```

Open http://localhost:3000 — home page renders with the Cyber-Sport Dark theme, trending players, managers, and latest packs.

### 5. Build everything (CI parity)

```bash
pnpm install && pnpm build
```

This runs `next build` (web) and `tsc --noEmit` (api / db / shared). Generates a fully type-checked production bundle of the web app.

## Endpoints

### Healthcheck

```bash
curl http://localhost:4000/health
# {"status":"ok","db":"connected","time":"…"}
```

### tRPC (preview — all under `/trpc/*`)

| Procedure | Purpose |
|---|---|
| `player.list` | 11-dimension filter + 60+ sort + pagination |
| `player.byId` | full card detail (26 stats · 11 physique · 5 derived · position ratings · other versions) |
| `player.search` | fuzzy match across name / accentedName / japName / chineseName |
| `player.compare` | 2–4 cards aligned stat matrix |
| `manager.list` | filter by any of 6 tactic masteries (`quickCounter >= 88` etc.) |
| `manager.byId` | full tactical scorecard |
| `manager.compat` | squad-compatibility scoring for a (manager, player) pair |
| `skill.list` / `skill.byId` / `skill.players` | 67-skill directory + players per skill |
| `pack.list` / `pack.byId` | pack list + cards in a pack |
| `community.voteTier` / `community.review` / `community.simulate` | tier voting · reviews · build simulator |

## Build simulator progression rules

The progression engine lives in `packages/shared/src/progression.ts` and is exercised by both the web client and the API (`community.simulate`).

Per the spec scenario:
- Allocate **4 points to Shooting** → `Offensive Awareness +4`, `Finishing +4`, `Set Piece Taking +2`, `Heading +2` (0.5 weight)
- Select a manager with **Quick Counter ≥ 88** and a player with non-zero QC compat → affected stats receive **+2 team playstyle bonus**
- Toggling a booster (e.g. `Defending +2`) immediately applies its stat delta to the simulated profile

Tests run via `tsx packages/shared/src/progression.test.ts` — the regression suite validates the spec scenario, manager boosts, booster toggles, and the [40, 99] stat clamp.

Run tests:

```bash
bun packages/shared/src/progression.test.ts
```

## CSS 3D card engine

`apps/web/components/cards/PlayerCard.tsx` uses standard CSS 3D transforms — `perspective` on the wrapper, `transform: rotateX() rotateY()` on the surface — driven by pointer `clientX / clientY`. A glare overlay tracks a radial-gradient. **60 FPS on desktop and touch**. It works in headless scrapers where WebGL would otherwise fail.

## Data sources

All seed data originates from the efhub SQLite dump (`docs/efhub_db_202609240.sqlite`, 35.5 MB, 44,028 players × 259 cols), which efhub distributes publicly via their CDN. See `docs/efhub-apk-extraction.md` for the verified 4-command ingestion pipeline. No scraping or Konami API reverse-engineering required.

## What's in this repo

- 30 iconic player cards (Lewandowski, Messi, Bonucci, Chiellini, Haaland, Bellingham, Yamal, …) with real verified stats pulled from the efhub SQLite
- 5 managers (Guardiola, Conte, Mourinho, Klopp, Ancelotti) with real tactic ratings
- 67 skills with category + description
- 12 boosters with their stat-magnitude mappings
- 2 packs (National All-Stars, Worldwide Sep '26)

## Roadmap (deferred)

- Mobile app (`apps/mobile`) — deferred
- Real auth — community router currently uses a seeded user
- Tier list drag-and-drop — `community.voteTier` is wired, the UI builder is next
- Card image CDN — the card component renders a placeholder avatar; wire up `efimg.com` next

## License

Internal — experimental.
