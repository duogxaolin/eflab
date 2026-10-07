## Why

Phase 1 (`web-backend-ecosystem`) shipped a working MVP: Turborepo monorepo, Prisma schema (259-column player model), Fastify+tRPC API, Next.js 15 web with CSS 3D card, build simulator, compare radar, 11-filter player directory. However three gaps remain against the full efhub-feature parity target:

1. **Community layer is a skeleton** — `communityRouter` uses a hardcoded `seed-user-0001` fake identity for all mutations (voteTier, review, saveBuild). No real authentication, no user profile pages, no follow graph, no tier-list creation UI, no community feed.
2. **Data volume is mock-scale** — only 30 players + 5 managers seeded. The full `seed:full` script exists but has never been run against production Postgres. The 44,028-card efhub SQLite dump at `docs/efhub_db_202609240.sqlite` needs to be ingested, indexed, and query-performance-validated to reach efhub/pesdb parity.
3. **Phase 2 web features missing** — efhub has `/new-players`, `/tier-list` create + community list, `/community` feed, `/articles`, `/tournaments`, `/u/[username]` profiles, `/pro` paywall scaffold. None of these pages exist yet.

## What Changes

- **Real authentication**: Replace fake seed-user with email/password + Google OAuth via `better-auth` (Postgres-backed sessions, `users` + `sessions` tables). Wire tRPC `protectedProcedure` middleware. All community mutations (voteTier, review, saveBuild) require authenticated session.
- **User profiles**: `/u/[username]` page showing avatar, region, saved builds, posted reviews, tier votes, follow/follower counts. Follow/unfollow mutations.
- **Tier list creator**: `/tier-list` page — drag-and-drop builder (S/A/B/C/D tiers), save as community tier list, browse community tier lists, aggregate consensus badge on player cards.
- **Community feed**: `/community` page — post text/image/player-card-share, like, comment, realtime via Postgres LISTEN/NOTIFY or polling. Region/country filter.
- **Articles**: `/articles` + `/articles/[slug]` — MDX-based editorial + datamine leak posts (Phase 1 only had home-page article cards; no article pages exist).
- **New players page**: `/new-players` — latest cards grouped by pack release date.
- **Full data seed**: Run `pnpm db:seed:full` against `docs/efhub_db_202609240.sqlite` → 44,028 players + 1,525 managers + 981 teams + 67 skills + boosters + packs into Postgres. Add `pg_trgm` + `unaccent` extensions for fuzzy multilingual search. Add composite indexes for the 5 most common filter+sort combos. Validate query latency < 100ms for default listings.
- **Pro paywall scaffold**: `/pro` page + `isPro`/`proUntil` gating on builds (Pro Builds tab). No payment processing yet (schema only).
- **Tournaments**: `/tournaments` page — leaderboard table + Discord register link (read-only ranking from seeded data; no live integration this phase).

## Capabilities

### New Capabilities
- `user-authentication`: Email/password + Google OAuth via better-auth, protected tRPC procedures, session management.
- `user-profiles`: Public profile pages, follow/follow graph, user-scoped build/review/tier-vote listings.
- `tier-list-creator`: Drag-and-drop tier list builder, community list browser, consensus aggregation.
- `community-feed`: Text/image/card-share posts, likes, comments, region filter.
- `articles`: MDX editorial pages with category filter.
- `new-players`: Latest cards grouped by pack release.
- `full-data-seed`: Production ingestion of 44,028-player efhub SQLite with Postgres extensions + index tuning.
- `pro-paywall-scaffold`: Pro subscription page + build gating (schema only, no payment).
- `tournaments-leaderboard`: Read-only tournament ranking page.

### Modified Capabilities
- `community-hub`: Upgraded from skeleton seed-user to real authenticated mutations, follow graph, and feed integration.
- `player-database`: Add `pg_trgm` + `unaccent` fuzzy search, composite indexes for full-scale query performance.
