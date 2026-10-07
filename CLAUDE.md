# CLAUDE.md — eflab monorepo

> Instructions for Claude Code (and any agent) working in this repo. Read first.

## What this is

**eflab** = "eFootball Lab" — a bespoke eFootball player/manager database, build simulator, and community hub. Turborepo + pnpm 11 monorepo. Not affiliated with Konami; all player data is datamined from public sources (efhub CDN, pesdb).

This repo is **distinct from the `bno` bot** (a separate eFootball scraper the user also runs). Data-source decisions for bno live in memory under `bno-bot-data-decision`; eflab's image choices live in `eflab-web-image-pipeline`. **Don't conflate the two** — bno uses pesdb images (no logo), eflab web uses efhub Konami card renders (logo acceptable, see [[eflab-web-image-pipeline]]).

## Stack

| Surface | Path | Stack |
|---|---|---|
| Web | `apps/web` | Next.js 15 App Router · Tailwind CSS 4 · `@trpc/react-query` · Lucide |
| API | `apps/api` | Fastify 5 · `@trpc/server` v11 · SuperJSON (BigInt-safe) |
| DB | `packages/db` | Prisma 6 · PostgreSQL 16 · SQLite ingester |
| Shared | `packages/shared` | Zod schemas · progression math · domain constants |

- Node >= 22, pnpm >= 10. TypeScript 5.9 strict.
- Dev: `pnpm dev` (runs all via turbo), or `pnpm web:dev` / `pnpm api:dev`.
- DB: `pnpm db:generate` → `pnpm db:push` → `pnpm db:seed` (48.407 players + 2.046 packs from efootbase dump).
- ports: web :3000, api :4000.

## Layout

```
apps/web/app/         Next.js routes (players/, compare/, packs/, skills/, home) — eflab follows efootbase scope (4 public pages + home + detail). Routes managers/tier-list/community/articles/tournaments/new-players/pro/login/register/u were removed 2026-10-07.
apps/web/lib/         r2-images.ts (R2 URL helpers), card-display.ts, trpc.tsx, auth.tsx
apps/web/components/  cards/PlayerCard.tsx (3D CSS card), players/, compare/, build-simulator/, layout/, common/
apps/api/src/         server.ts, router/ (tRPC procedures), auth/, health.ts
packages/db/prisma/   schema.prisma
packages/db/src/      client.ts, seed-efootbase-full.ts (canonical seed from efootbase dump)
packages/db/fixtures/ skills.json (67 skill definitions — self-authored, not from efhub)
packages/shared/src/  constants.ts (CARD_TYPES, SORT_FIELDS), schemas.ts, types.ts, progression.ts
scripts/              efootbase_dump.py (efootbase API → dump/), r2_upload.py (R2 mirror), smoke-test.sh
docs/                 analysis + design docs (see index below)
openspec/             OpenSpec change tracking (changes/, specs/, config.yaml)
```

## Player data pipeline

Player data is **not** self-datamined from the game. eFootball mobile stores stats server-side (encrypted); APK contains only engine assets. See `docs/efootball-apk-datamine-analysis.md` for why self-datamining is infeasible.

**eflab sources all player data from efootbase** (since 2026-10-07; efhub path removed):
1. **Source**: efootbase public API dumped via `scripts/efootbase_dump.py` → `dump/efootbase/players.jsonl` (48.407 players × 176 cols, efootbase schema) + `dump/efootbase/images/` (93.501 card/emblem files, ~6.5GB). See memory `efootbase-datapath`.
2. **Seed**: `pnpm db:seed` (`packages/db/src/seed-efootbase-full.ts`) streams `players.jsonl` → Postgres. Populates Player (48.407) + Country (185, with R2 flagUrl) + Team (707, with R2 emblemUrl) + Pack (2.046 from `featured` field) + PackCard + PlayerSkill. Idempotent (re-runnable). ~60s.
3. **Images**: R2 bucket `efootlab` mirrors `efootbase/images/` via `scripts/r2_upload.py`. Card URLs constructed by `playerCardUrl(id)` helper (no DB column). Card composite assets (backgrounds/frames/conditions) dumped by `scripts/fetch_card_assets.py` → `dump/efootbase/card-assets/` → R2 keys `card-backgrounds/`/`frames/`/`conditions/` (see image pipeline below). Flag/emblem R2 URLs stored in `Country.flagUrl`/`Team.emblemUrl` (SHA256 hash filenames — not ID-derivable).

The **bno bot** (separate from eflab) still uses efhub/pesdb — that lives in memory `bno-bot-data-decision`. eflab no longer touches efhub.

## Image pipeline (eflab web)

Player cards render the **efootbase transparent card art** mirrored to **Cloudflare R2** as a **4-layer composite** (efootbase DNA §10): background + face + frame + condition badge. Switched 2026-10-06 (transparent art); layered composite added 2026-10-07 (user override of the prior "1 baked image + CSS 3D" decision). efimg.com still used as fallback for flags/emblems not yet populated in DB.

- **Helper**: `apps/web/lib/r2-images.ts` — `r2Url(key)`, `playerCardUrl(playerId)`, `playerCardDynamicUrl(playerId)`, `cardBgUrl(cardType)` (layer 1), `cardFrameUrl(cardType)` (layer 3), `conditionUrl(letter)` (layer 4). Base URL from `NEXT_PUBLIC_R2_PUBLIC_BASE` env var → **đổi R2 domain chỉ cần sửa 1 env var, không sửa code/DB**.
- **R2 bucket**: `efootlab` (account `e4979a2b…`), public dev URL `https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev`. Credentials in `.env` (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET/R2_PUBLIC_BASE), gitignored.
- **URL pattern**: `${R2_PUBLIC_BASE}/cards/{PlayerID}_transparent.webp` (240×339, no text/watermark — efootbase render). Variant: `_dynamic.webp` (animated bg, larger). Composite layers: `${R2_PUBLIC_BASE}/card-backgrounds/{Type}.webp` (14 files: Big_Time/Epic/Show_Time/POTD variants — Standard/Trending/Highlight/Strike_Arena/Legendary fall back to a CSS gradient), `…/frames/{Name}_Frame.webp` (Big_Time_WC_26_Frame / Epic_Frame_Single_Booster / Show_Time_WC_26_Frame / POTD_WC_26_Frame), `…/conditions/condition_{a-e}.svg`.
- **Image source pipeline**: `scripts/efootbase_dump.py` (efootbase API → `dump/efootbase/images/`) → `scripts/r2_upload.py` (boto3 S3 upload to R2, 32 workers, resume). 93.500 files, ~6.5GB. Composite assets: `scripts/fetch_card_assets.py` (efootbase card-backgrounds/frames/conditions → `dump/efootbase/card-assets/`) → `scripts/r2_upload.py --prefix dump/efootbase/card-assets`.
- **Flag/emblem URLs**: efootbase uses **SHA256 hash filenames** (e.g. `emblems/nationality/b5bd0a6d…png`) — NOT ID-derivable. So `flagUrl(countryId)`/`emblemUrl(teamId)` cannot be constructed in code. Instead:
  - `pnpm db:seed` (`packages/db/src/seed-efootbase-full.ts`) reads `dump/efootbase/players.jsonl` + populates `Country.flagUrl`, `Team.emblemUrl` with full R2 URLs from `emblem_images` hash fields. 185/185 countries + 707/707 teams populated (100%).
  - tRPC `player.router` (`apps/api/src/router/routers/player.ts`) batch-attaches `Country.flagUrl` via `attachFlagUrls()` helper; `PlayerCardDTO.flagUrl` (added to `packages/shared/src/types.ts`) carries it to client.
  - `apps/web/components/cards/PlayerCard.tsx` prefers `player.flagUrl` (R2) and falls back to `flagUrlEfimg(nationalityId)` when DB column not yet populated.
- **Legacy**: `apps/web/lib/efhub-images.ts` keeps `flagUrl(countryId)` + `emblemUrl(teamId)` (efimg.com, deterministic) for fallback only. `playerCardUrl` re-exported from `r2-images` so old consumers automatically use R2. (Despite the filename, efimg fallback is still useful; the file is eflab's, not efhub-data-dependent.)
- Component: `PlayerCard.tsx` — `"use client"`, raw `<img>` (not next/image, to avoid optimization delay on external images), `onError` fallback to gradient + initial.
- 3D tilt + glare preserved as the signature eflab touch on the layered composite. Card content (OVR, position, booster badges) comes from the transparent art + frame; flag is NOT rendered in the card list (efootbase pattern — flags appear only on the player detail page).
- Next.js `remotePatterns: [{ protocol: "https", hostname: "**" }]` allows all hosts (no config change needed for R2 or efimg fallback).

See `docs/eflab-image-pipeline.md` for full details.

## Conventions

- Match the surrounding code: comment density, naming, idiom. Vietnamese comments are common in this repo (user is Vietnamese) — okay to use Vietnamese for user-facing docs/comments when the surrounding code does.
- Prisma BigInt IDs are serialized via SuperJSON — tRPC procedures receive/send BigInt as strings in JSON but `bigint` at runtime.
- Card types: `CARD_TYPES` from `@eflab/shared` (STANDARD, TRENDING, EPIC, BIG_TIME, HIGHLIGHT, SHOW_TIME, STRIKE_ARENA, LEGENDARY).
- Color theme: "Slate-Emerald" (efootbase-aligned, since 2026-10-07 — replaced the prior Cyber-Sport Dark) — Canvas `#080c14`, Panel `#0f1523`, Elevated `#161f33`, Line `#1e293b`, Accent Emerald `#10b981`, Secondary Cyan `#06b6d4`, Warn Amber `#f59e0b`, Danger `#ef4444`. Tier colors: 90+ `#00ffb4`, 80-89 `#96ff00`, 70-79 `#ffbe00`, <70 `#ff3200`. Tokens in `@theme` block of `apps/web/app/globals.css`; Inter via `next/font/google`. See `openspec/ui-dna.md`.
- Card render is a 4-layer efootbase composite (bg + face + frame + condition) in CSS — Three.js/WebGL is still rejected (the prior "CSS 3D only" constraint is kept in spirit; layered CSS composition replaces the single baked image). CSS 3D transforms provide the tilt/glare.
- UI/UX work must read `openspec/ui-dna.md` (or the existing DNA doc) before any visual change.

## Running (verify before claiming "done")

```bash
pnpm db:seed                 # seed 48.407 players + 2.046 packs from efootbase dump (also populates Country.flagUrl/Team.emblemUrl)
pnpm web:dev & pnpm api:dev  # :3000 + :4000
# Verify R2 image loads (efootbase transparent card art):
curl -sSI "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev/cards/89138556575063_transparent.webp" | head -3
# Verify tRPC (batch GET, superjson-wrapped input):
curl -sS "http://localhost:4000/trpc/player.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22page%22%3A1%2C%22limit%22%3A24%2C%22sort%22%3A%22ovr%22%2C%22order%22%3A%22desc%22%7D%7D%7D"
```

PlayerCard is a client component — SSR HTML won't contain R2 (or efimg fallback) URLs; they're injected by React on mount. Verify with a headless browser (Playwright), not `curl | grep`.

## docs index

- `docs/README.md` — docs index (if present)
- `docs/ecosystem-proposal.md` — full system proposal (web + mobile)
- `docs/efootball-apk-datamine-analysis.md` — why APK self-datamine doesn't work
- `docs/efootbase-efhub-features.md` — feature inventory of the two reference sites
- `docs/eflab-image-pipeline.md` — eflab web image pipeline (efootbase transparent cards from R2, efimg.com fallback)
- (bno-related) `docs/efhub-apk-extraction.md`, `docs/datamining-playbook.md`, `docs/efootbase-apk-analysis.md` may exist in some sessions — check `docs/` listing.

## Memory index (loaded each session)

- `efootbase-datapath` — eflab's data source: efootbase API dump → players.jsonl 48k + images 93k on R2 (replaced efhub 2026-10-07)
- `bno-bot-data-decision` — bno's data paths (Path E efhub primary, Path A pesdb fallback, B/C rejected) — bno is separate from eflab
- `eflab-web-image-pipeline` — eflab web uses Cloudflare R2 (efootbase transparent cards + layered bg/frame/condition since 2026-10-07); helper r2Url/key + R2_PUBLIC_BASE env for easy domain swap
- `eflab-ui-clone-efootbase` — eflab 100% efootbase UI rewrite 2026-10-07: layered card composite + Slate-Emerald theme + 4-trang scope (17 routes xoá); Cyber-Dark repealed

## Out of scope for eflab (unless user reopens)

- Self-datamining Steam `dt870_console_win.cpk`.
- Using Three.js/WebGL for cards.
- Re-introducing efhub as a data source (removed 2026-10-07 in favor of efootbase).
