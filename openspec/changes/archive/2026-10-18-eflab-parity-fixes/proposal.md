## Why

A verified codebase audit (2026-10-17) found that eflab renders wrong or fabricated data and behaves differently from efootbase on its main paths. The causes are seeder mapping bugs (base Jump/Set Piece 40 on every card, 35% wrong registered position, hard-coded condition, shifted card-type labels, 17% of skills dropped), a destructive non-atomic seed that silently erases the eFHUB cross-fill, and web/API contract bugs (broken pack links, wrong Playing Style ids, unstable pagination, reversed compare matrix, accent-sensitive search, invented Skills numbers). The repo is public, so the site also must stop presenting third-party branding and docs must stop leaking keys.

## What Changes

- **Seed and data pipeline**
  - Fix field mapping: `jumping`/`set_piece_taking`, `pos`, `condition`/`injury_resistance`/`player_value`, `leg_length_height`, the card-type map from `players_meta.json`, the missing skill slugs, and booster stat keys.
  - Store `name_normalized` for accent-insensitive search.
  - Make the seed non-destructive for user data, transactional, and followed by the cross-fill through a single `db:refresh` command.
  - Fix cross-fill correctness (`maxGkClearing`, manager dedupe, parameterised SQL) and fetch real per-position ratings from eFHUB instead of fabricating 40.
  - Make a fresh database bootstrap correct (extensions, trigram indexes, working baseline migration).
- **API**
  - Deterministic pagination (unique tiebreaker).
  - `compare` returns rows in input order.
  - Accent- and case-insensitive `player.list` search; escape LIKE wildcards.
  - Input bounds return 400, not 500.
  - Remove or implement the filters/sorts that are accepted but ignored.
  - Operational hardening: CORS and `NODE_ENV` from env, tRPC batch limit, typed errors, cookie-parse guard, `/health`, OAuth email-verification check.
  - Cheaper trending/list payloads.
- **Web**
  - Correct links and filters: pack links by slug, Playing Style ids, home quick filters, URL-synchronised `/players` state, visible card-type scope.
  - Real data on Skills pages; remove fabricated home sidebar content; make Progression either functional or removed.
  - Correct height conversion and detail-page display bugs.
  - Responsive layout without horizontal overflow; keyboard/screen-reader accessibility for cards, popovers, dialogs and carousels.
  - Lazy-loaded card images; debounced search; error states; proper 404s and per-route metadata.
  - eflab branding (no efootbase name, icon or build stamp); `@layer`-correct CSS; single tier-colour source.
  - Safer `next.config` (restricted image hosts, absolute tracing root, security headers); documented env loading.
- **Docs and tooling**
  - Align CLAUDE.md, README, `ui-dna.md`, `.env.example`, docs index and openspec specs with reality.
  - Redact two third-party keys in tracked docs (working tree only).
  - Add a `pnpm test` task covering the progression test and the smoke test.
- **BREAKING (dev workflow)**: `pnpm db:seed` no longer drops user-generated tables by default (opt-in `--reset-users`), and the documented refresh command becomes `pnpm db:refresh`. The sort/filter inputs that never worked (`clubId`, `leagueId`, 8 sort fields) are removed from the API schema unless implemented.

Out of scope (reported only): rewriting git history to remove already-pushed keys; deleting the 34 dead procedures, tables and components; the licence decision for the Konami fonts; CI setup.

## Capabilities

### New Capabilities
- `efootbase-data-integrity`: seeded player/booster/skill/card-type data matches the efootbase dump and eFHUB cross-fill. The seed is safe to re-run, and a fresh database bootstraps with extensions and indexes.
- `catalog-browsing-parity`: `/players`, home, `/packs` and `/skills` filters, search, sorting, pagination, URLs and displayed numbers behave like efootbase and are derived from real data.
- `site-quality-baseline`: accessibility, responsive layout, image loading, error/404 handling, branding, API operational hardening, env configuration and test tooling.

### Modified Capabilities
- `comparison-tool`: the stat matrix, proficiency and booster panels follow the user's selection order, and Swap reorders them.
- `full-data-seed`: seeding becomes non-destructive for user data, atomic, and cross-fill-aware; search becomes accent-insensitive on every entry point and is index-backed.

## Impact

- `packages/db`: `src/seed-efootbase-full.ts`, `src/seed-efhub-crossfill.ts`, `prisma/schema.prisma` (+ migration), `fixtures/skills.json`, `package.json`.
- `packages/shared`: `constants.ts`, `schemas.ts`, `types.ts`.
- `apps/api`: `server.ts`, `health.ts`, the player/skill/featured/pack/auth routers, `auth/session.ts`, `auth/google.ts`.
- `apps/web`: every page, `PlayerCard`, `PitchMap`, `PackCarousel`, header/footer, `globals.css`, `lib/*`, `next.config.ts`.
- Docs/config: `CLAUDE.md`, `README.md`, `openspec/ui-dna.md`, `.env.example`, `docs/*`, `scripts/smoke-test.sh`, `turbo.json`, `docker-compose.yml`.
- Live dev database: one reseed + cross-fill after a `pg_dump` backup kept outside the repo.
- No new runtime dependencies are expected.
