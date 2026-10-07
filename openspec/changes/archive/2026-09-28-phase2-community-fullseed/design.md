## Context

See `proposal.md` for motivation. Phase 1 (`web-backend-ecosystem`) shipped the foundation: Turborepo monorepo, Prisma schema (BigInt IDs, 259-column player model), Fastify+tRPC API (player/manager/pack/skill/community routers), Next.js 15 web (CSS 3D card, build simulator, compare radar, 11-filter directory, skills/packs/managers pages). The `communityRouter` is a skeleton using a hardcoded `seed-user-0001` fake identity.

Phase 2 builds the real community stack on top: authentication, profiles, tier lists, feed, articles, new-players, full-data ingestion (44k cards), Pro scaffold, tournaments. Mobile (Expo) remains deferred.

## Goals / Non-Goals

**Goals:**
- Replace fake seed-user with real `better-auth` (email/password + Google OAuth, Postgres sessions).
- Wire `protectedProcedure` middleware for all community mutations.
- Add 7 new web pages: `/u/[username]`, `/tier-list`, `/community`, `/articles`, `/articles/[slug]`, `/new-players`, `/tournaments`, `/pro`.
- Ingest full 44,028-player efhub SQLite into Postgres; add `pg_trgm` + `unaccent` extensions for fuzzy search.
- Validate query latency < 100ms at full scale.
- Scaffold Pro build gating (schema only, no payment).

**Non-Goals:**
- Live payment processing (RevenueCat/Stripe) — Pro fields exist but no transaction pipeline.
- Mobile app (Expo) — deferred to Phase 3.
- Real tournament live integration — leaderboard is read-only seeded data.
- Real-time WebSocket push for feed — use polling/Postgres LISTEN as simple first pass.

## Decisions

### 1. Auth Library: better-auth
- **Decision**: Use `better-auth` (Postgres-backed, Next.js + tRPC compatible, email/password + Google OAuth, session cookies).
- **Rationale**: Owns the session table, works with Prisma, Type-safe, no vendor lock-in (unlike Firebase Auth). Efhub uses Firebase; we choose Postgres-native to keep one DB.
- **Schema**: Add `sessions` + `accounts` (OAuth link) tables to Prisma. `User` already has `username`/`email`/`role`.

### 2. Protected Procedures
- **Decision**: Add `protectedProcedure = t.procedure.use(requireAuthMiddleware)` to `apps/api/src/trpc.ts`. Middleware reads session cookie → loads User → injects into ctx. Returns `UNAUTHORIZED` if no session.
- **Migration**: Convert `communityRouter`'s `publicProcedure` mutations to `protectedProcedure`.

### 3. Follow Graph + Feed Tables
- **Decision**: Add new Prisma models:
  - `Follow { followerId, followingId, createdAt, @@id([followerId, followingId]) }` with counter cache fields on `User` (`followersCount`, `followingCount` as `Int @default(0)`).
  - `Post { id, authorId, content, mediaUrls String[], playerId BigInt?, createdAt }`, `PostLike { postId, userId, @@id([postId, userId]) }`, `Comment { id, postId, authorId, content, createdAt }`, `TierList { id, authorId, name, tiers Json, isPublic Boolean, submissions Int @default(0) }`.
- **Rationale**: Existing `Build`, `Review`, `TierVote` tables already in schema (Phase 1). Tier *list* (group of cards in tiers) is distinct from individual `TierVote` (per-card community vote).

### 4. Full Seed Optimization
- **Decision**: Run `pnpm db:seed:full` in batches of 1000 with `prisma.$transaction`. Create PG extensions in a raw migration SQL:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE INDEX player_name_trgm ON "Player" USING GIN (name gin_trgm_ops);
  ```
- Add composite indexes for top filter+sort: `(cardType, ovr DESC)`, `(registeredPosition, ovr DESC)`, `(nationalityId, ovr DESC)`.

### 5. Articles via MDX
- **Decision**: Store articles as MDX files in `apps/web/content/articles/*.mdx` with front-matter, loaded via `gray-matter` + `next-mdx-remote`. No CMS this phase.

## Risks / Trade-offs

- **Auth migration**: Converting `publicProcedure` → `protectedProcedure` for community mutations breaks any existing unauthenticated callers (none in production — skeleton only).
- **Full seed runtime**: 44k batch inserts may take 5–10 min. Acceptable for one-time + weekly Konami-update cadence.
- **`better-auth` maturity**: Newer library but Postgres-native and actively maintained. Fallback: lucia-auth or hand-rolled session table.
