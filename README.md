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

`scripts/smoke-test.sh` starts the API itself on port **4300** (`SMOKE_API_PORT` to change), waits for `/health`, runs 34 checks against the refreshed database (featured bundle by slug, removed routers answer 404, 84 skills, every card type non-empty, sort presets without duplicates, filters narrow, multi-valued position / league / team lists (OR inside, AND between, 400 for over-long or out-of-range lists), duplicate-free pagination, compare order, accent-insensitive search, 400 on out-of-range ids, malformed-cookie tolerance) and stops the API on exit; the manager tactic cross-fill is asserted by `scripts/verify-seed.py`. Set `API_URL=http://localhost:4000` to run the checks against an API that is already running.

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
| `skill.list` / `skill.byId` / `skill.players` | 84 skills with holder counts, holders per skill |
| `auth.getSession` / `auth.signOut` | session plumbing used by `lib/auth.tsx` (no sign-in UI is routed) |
| `auth.signUp` / `auth.signIn` | email/password registration and login (kept with the auth system; no web caller) |

The `manager`, `pack`, `community`, `user`, `tierList`, `feed` and `pages` routers were removed on 2026-10-18 (change `remove-dead-surface`) together with the Build / Review / TierVote / TierList / Follow / Post / PostLike / Comment tables; the Pack and Manager tables stay as seeded data.

## Progression panel

The player detail page carries a Progression sheet for every card with a level cap above 1, laid out like efootbase's (change `efootbase-parity-round2`, 2026-10-18): "used/total pts", Max Level (1..level cap), position (13), Manager Proficiency (70–90, change `manager-proficiency-slider`), ten category rows (label, − n +, slider) with the cost of the next stat point, Booster 1 / 2 toggles, **Max OVR** and **Reset**. The rules were recovered from the public eFHUB data (not invented):

- **the panel opens on the Max-OVR build** for the card's registered position with every usable booster on and Manager Proficiency 90 — the same opening state as efootbase's sheet; "custom build" means any deviation from that state, Reset zeroes every category (the proficiency stays) and Max OVR restores the optimum;
- **points are shown in efootbase's whole-point unit** (`toDisplayPoints`, twice the engine's training points): a level-32 card reads "62/62 pts", the first four stat points of a category cost 1 each, the next four 2 each (engine: budget = level cap − 1, the nth stat point costs 0.5 × ⌈n / 4⌉);
- each category raises every stat it contains by one per stat point (Shooting → Finishing, Place Kicking, Curl; Passing → Low Pass, Lofted Pass; Dribbling → Dribbling, Ball Control, Tight Possession; Dexterity → Offensive Awareness, Acceleration, Balance; **Lower Body Strength** → Kicking Power, Speed, Stamina; **Aerial Strength** → Heading, Physical Contact, Jumping; Defending → Defensive Awareness, Defensive Engagement, Tackling, Aggression; **Goalkeeper 1** → GK Awareness **and Jumping**; Goalkeeper 2 → GK Parrying, GK Reach; Goalkeeper 3 → GK Catching, GK Reflexes), with no cap at 99 — the labels are efootbase's (`PROGRESSION_CATEGORY_LABELS`). Jumping is the one stat in two categories: it rises with Aerial Strength and with Goalkeeper 1 together, which is what every one of the 44,103 eFHUB cards shows (change `jump-from-gk1`, 2026-10-18 — before it, goalkeeper Jump was shown as "n/a (card-specific)");
- boosters add their real stat vectors; a booster without stat data (the common "Booster +1") is shown as a note, cannot be toggled and never counts as a custom build;
- the overall is a **fitted estimate** (`~`). At the card's **registered position** it is anchored to the card's own overall (card overall − formula on its base stats is added). The anchor was chosen after the measurements had shown the unanchored goalkeeper builds failing, so its independent support is a population check without the bonus (formula on the hub's max stats + Booster 1 vs efootbase's overall at max level, within ±1: 9,839 cards 97.0 % → 98.3 %, goalkeepers 83.6 % → 97.4 %; counting all 10,073 cards with a dump max level above 1, 234 of which have hub level cap 1, 94.7 % → 96.1 %, goalkeepers 82.0 % → 95.5 %). Every other position is unanchored and labelled full / half / none; half or non-proficient positions apply a fitted proficiency penalty (`max(40, k·estimate + c)`, within ±1 of the **eFHUB hub** overall on 99.9 % / 99.7 % of held-out hub observations; an outfield card at GK is a flat 40). Against efootbase's own position tiles (six measured cards) the full-proficiency positions agree (202/202 within ±1) but efootbase reads higher at half proficiency (+3.8 on average, 0/224 within ±1) and at none when our estimate is above the floor of 40 (+2.6, 122/2,483); at the floor (an outfield card at GK, a goalkeeper far from goal) the two agree within ±1 on 1,145/1,231 tiles; the panel warns with those numbers;
- **Max OVR** is the exact optimum of the linear estimate (without the Manager Proficiency bonus) within the budget, so it is the same build at every proficiency — as efootbase's own Max OVR build is (one allocation per card across all 21 levels on the 5 measured cards). With the bonus a hand-made build can read up to 1 point higher: on 261 hub cards × 21 levels an exact bonus-aware search beats it on 1,694 of 5,481 pairs, by at most 0.668 before rounding and 1 displayed point (202 pairs), never at 70–76 (tested);
- **Manager Proficiency** (slider 70–90, default 90 — efootbase applies it even with no manager selected): every stat gains `min(99 − s, ⌊s × r(level)⌋)` where `s` = base + training (nothing once `s` ≥ 99), and the boosters are added after it (they may pass 99). `r` is 0 from 70 to 76 and rises to 0.03625 at 90; **level 86 fits no single rate** and uses the fitted exception `⌊(s + 6) / 32⌋` (fitted on all six cards, not monotone: stats of 26–29 and 58 gain more at 86 than at 87), flagged as unconfirmed in the panel. Measured on efootbase's sheet (2026-10-18), with the evidence kept apart:
  - *in-sample* (the shipped rates were pooled over all six cards, and the committed fixture is that same data — a regression guard, not a validation): 6,838/6,838 stat values, anchored overall within ±1 on 263/263 builds;
  - *held-out* (rates read off Messi at 70/75/80/85/90 and Neuer at 70/90 only, then frozen; a centre-back, a goalkeeper, a defensive midfielder and a striker predicted at 70/75/80/85/90): 178 builds, 4,628/4,628 stat values exact, overall within ±1 on 142/178 unanchored and 178/178 anchored — but the anchor only changes the goalkeeper (14/50 → 50/50), the card whose failures led to it, so this does not test the anchor;
  - *prospective* (rates from four cards, the defensive midfielder and the striker predicted at all 21 levels): about 4,257/4,264 stat values, overall 164/164 within ±1;
  - the 15 levels between the held-out ones (71–74, 76–79, 81–84, 87–89) rest on four cards without a two-card held-out run; the shipped rates are points inside measured intervals 0.00022–0.00092 wide, and any other rate inside the same interval fits equally well;
  - Messi at SS: Max build 106/109/109/110 and Reset 94/97/97/97 at 70/80/85/90 measured, 106/108/109/109 and 93/96/97/97 here.
  
  At proficiency 70 every stat equals the engine without the control; the overall at the registered position differs from it by the anchor (1,336 of 4,698 builds round differently);
- Max Level is applied when you leave the field or press Enter (the spinner applies at once); an allocation the new level cannot afford is reset and announced.

The stat grid shows the build's projection by default ("Build (~N)"), with the dump's own max-level values ("Max") and the level-1 base ("Base") one click away; any change in the panel returns to the build view. The card face prints the build estimate (marked "EST"); the single pill next to the name is the card's max overall from the dump, as on efootbase, with a visible "dump max · no proficiency bonus" label beside it (it carries Booster 1 only, so it sits below the opening estimate at proficiency 90).

The shared engine lives in `packages/shared/src/progression.ts` with the fitted weights in `ovrWeights.ts`; `pnpm --filter @eflab/shared test` checks every rule (including the displayed unit and the labels) against 261 cards sampled from the hub (`__fixtures__/progression-oracle.json`: 20 per position plus the one outfield card with a Goalkeeper 1 value), and the Manager Proficiency rule and the anchor against `__fixtures__/proficiency-oracle.json` (six measured cards, 263 builds, numbers only): every displayed stat exact, the anchored overall within ±1 (goalkeepers asserted separately), each shipped rate inside the interval the fixture allows, and level 86 reproduced only by its exception — in-sample checks that catch tampering, not a validation. It also bounds the Max OVR preset against an exact bonus-aware optimum (less than 1 below it before rounding, at most 1 displayed, equal at 70–76).

## Environment variables

See `.env.example` (root) and `apps/web/.env.example`. Summary:

- API: `DATABASE_URL`, `API_PORT`, `API_HOST`, `API_ORIGIN`, `WEB_ORIGIN` (comma-separated CORS allow-list), `NODE_ENV` (set by the scripts), `R2_PUBLIC_BASE` (rebases stored R2 URLs), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`.
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_R2_PUBLIC_BASE`, `API_INTERNAL_URL`, `NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_BUILD_UTC` (filled from git by `next.config.ts`).
- Seeders: `EFOOTBASE_DUMP_PATH`, `EFOOTBASE_META_PATH`, `EFOOTBASE_PACKS_PATH`, `EFHUB_DB_PATH`, `SQLITE3_BIN`.
- Scripts: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=efootlab`, `EFBASE_API_KEY` (dump script, via `--env`), `PSQL` (verify-seed).

Changing the R2 domain = set `R2_PUBLIC_BASE` (API) and `NEXT_PUBLIC_R2_PUBLIC_BASE` (web) and rebuild the web app; the database is not rewritten.

## Known limitations

- The Progression panel's overall is an estimate (fitted formula, anchored at the registered position with an anchor chosen post hoc; other positions are unanchored, use the fitted penalty when half / non-proficient, where efootbase reads about 4 / 2–3 higher unless the estimate sits at the floor of 40, and carry a warning); the Manager Proficiency rates between 70/75/80/85/90 have no two-card held-out check and the bonus at level 86 is an unconfirmed exception; Max OVR ignores the bonus (up to 1 displayed point below the best build); there is no manager picker (no per-manager effects — no dataset); the weights follow the game version the eFHUB data reflects and must be regenerated with it; builds are not saved anywhere.
- 38,337 cards carry `levelCap` 1 in the dump; their max-level view equals the base view and they show a note ("Progression and manager data are not available for this card") instead of the panel.
- **The dump is stale** (taken 2026-10-06): the newest `releaseDate` in the database is 2026-10-01. Of the 37 distinct card ids linked from efootbase's home page on 2026-10-18 only 8 exist here (29 are newer cards); by base player 33 of 34 are present (only Ricardo Quaresma, base 4526, is missing entirely). Refreshing needs `scripts/efootbase_dump.py` with an API key.
- **efootbase's filter / sort / search results could not be compared**: its API answers automation with a Cloudflare bot check, so the catalogue filters were verified against our own data only (labels and controls follow the capture).
- Not modelled because the dump has no such data: efootbase's **Position Training** toggle and **In-Match Roles** (set-piece takers, captain). Body Model (11 physique values + 5 derived metrics), Form and Injury Resistance are stored for every card, returned by `player.byId` / `player.compare` and shown in their detail-page sections.
- Skill labels and the Showtime / Classic grouping are display-only (`apps/web/lib/skill-labels.ts`); the database keeps the fixture names.
- **Newer than the dump**: efootbase's Skills filter lists 28 Showtime skills, 5 of which (Beast Drive, Decisive Pass, GK Aerial Claim, GK Rush Out, Sharp Cut) are not in the dump or the `Skill` table — our Showtime group has 23. The AI style "Long Ranger" is likewise unavailable (no column). The four playing styles that post-dated the first dump (Press Back, Tough Marker, Deep Defender, Build-up GK — ids 23, 31, 32, 34) are carried by cards of the 2026-10 re-dump and are offered in the Playing Style filter; their names come from efootbase's English UI strings because the dump's field labels still lack them.
- Japanese/Chinese name search runs only for non-ASCII queries and is not index-backed.
- The `/players` Nation filter is shared by internal country id (`nat=14`, repeated for several nations) because the data has no ISO code column; such a link stays valid only while the country ids are unchanged (a re-seed that renumbers them changes its meaning). Position, League and Team links repeat `pos` / `league` / `team` the same way (`/players?pos=SS&pos=CF&league=4&league=12`); old single-value links keep working. Each id list holds at most 50 values: the pickers say so ("At most 50 selections") and disable further options, and a hand-written link with more keeps the 50 smallest ids.
- Kept on purpose: the `auth` router with Google OAuth (no sign-in UI), the Pack/PackCard and Manager tables (seeded data, no API reads them except the pack name on a card), and `better-auth` (only its crypto helpers are used).
- The eFootball fonts in `apps/web/public/fonts/` have an unknown licence.
- Git history still contains two third-party keys that were redacted from `docs/` on 2026-10-17.

## License

Internal — experimental.
