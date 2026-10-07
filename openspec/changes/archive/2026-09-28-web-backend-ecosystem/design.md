## Context

See `proposal.md` for motivation. This design articulates the architectural blueprint for building the eFootball web application and backend API services within a unified Turborepo monorepo. The user has specifically requested prioritizing Web and Backend first, while deferring the Mobile application (`apps/mobile`) to a subsequent implementation phase. Initial development will run on mock/sample seed data before scaling to full dataset ingestion.

## Goals / Non-Goals

**Goals:**
- Establish a clean, production-ready Turborepo monorepo containing `apps/web` (Next.js 15 App Router, Tailwind CSS), `apps/api` (Fastify, tRPC v11), `packages/db` (Prisma ORM, PostgreSQL), and `packages/shared` (Zod schemas, shared contracts).
- Model eFootball player cards, base stats (26), physical measurements (11), derived physics (5), skills (60+), booster slot configurations, and 1,800+ manager tactical profiles in PostgreSQL.
- Deliver an aesthetically rich, card-centric user interface inspired by efootbase's visual clarity but with a bespoke "Cyber-Sport Dark" aesthetic and CSS 3D hardware-accelerated tilt interactions (eliminating efootbase's unstable WebGL dependency).
- Provide an interactive progression build simulator with real-time stat calculations, booster toggles, and manager team playstyle boost multipliers.
- Implement robust tRPC query routers supporting 11-dimension player filtering and 60+ field statistical sorting.
- Provide a dual-mode seeding pipeline (`seed:mock` for instant 30-player/5-manager local testing, and `seed:full` for bulk SQLite ingestion).

**Non-Goals:**
- Native mobile app implementation (`apps/mobile` with Expo) in this phase.
- Live in-app payment processing (RevenueCat / Stripe) for Pro tiers (only data schema fields `isPro` and `proUntil` are scaffolded).
- Direct eFootball game binary hooking or reverse-engineering during runtime (all data ingestion is passive offline processing).

## Decisions

### 1. Monorepo Architecture & Workspace Boundaries
- **Decision**: Use Turborepo with `pnpm` workspaces.
- **Structure**:
  ```
  apps/
    web/          # Next.js 15 App Router (SSR/ISR, Tailwind CSS)
    api/          # Fastify server with @trpc/server
  packages/
    db/           # Prisma client, migrations, seed scripts
    shared/       # Zod schemas, tRPC router type definitions, common enums
  ```
- **Rationale**: Enables end-to-end type safety across client and server. Modifying a Zod schema or tRPC procedure immediately flags type errors in frontend components during development.

### 2. Backend API Protocol: tRPC over Fastify
- **Decision**: Expose tRPC procedures hosted inside a standalone Fastify server.
- **Alternatives Considered**: REST with OpenAPI, GraphQL.
- **Rationale**: For a TypeScript-first monorepo, tRPC eliminates schema generation boilerplate and guarantees type synchronization. Fastify provides significantly higher HTTP throughput and lower latency than default Next.js API routes, keeping backend logic modular.

### 3. Database Modeling & BigInt Identifier Strategy
- **Decision**: PostgreSQL 16 via Prisma ORM. Player cards use 64-bit integer (`BigInt`) primary keys corresponding to Konami's 15-digit External PID.
- **Key Schema Highlights**:
  - `Player`: Stores base card attributes, 26 standard stats, max stats, physical attributes, tactic affinities, and booster references.
  - `Manager`: 1,844 manager records with 6 tactic ratings (Possession, Quick Counter, etc.).
  - `Skill`: 67 distinct skills connected through `PlayerSkill` join records.
  - `Build`: Progression point allocations stored as structured JSON.
  - `TierList` & `TierVote`: Community consensus ratings.
- **BigInt Serialization Decision**: Because native `JSON.stringify` does not support `BigInt`, all tRPC endpoints utilize `superjson` as the data transformer to transparently serialize/deserialize `BigInt` values between server and web client.

### 4. Frontend Rendering Strategy & CSS 3D Card Engine
- **Decision**: Next.js 15 App Router with hybrid SSR and client-side micro-interactions.
- **Card Rendering**: Implement interactive 3D perspective cards using standard CSS transforms (`perspective`, `rotateX`, `rotateY`, `transform-style: preserve-3d`) driven by pointer coordinates.
- **Rationale**: efootbase uses Three.js/WebGL which regularly fails on headless scrapers and lower-spec devices. CSS 3D is 10x lighter, never loses WebGL contexts, achieves 60fps on modern mobile and desktop browsers, and allows clean SSR markup for SEO indexing.

### 5. Seeding Strategy
- **Decision**: Provide two CLI scripts in `packages/db`:
  1. `pnpm db:seed:mock`: Seeds 30 iconic cards (Lewandowski, Messi, Bonucci, Chiellini, etc.), 5 managers, and 67 skills from local JSON fixtures in < 2 seconds.
  2. `pnpm db:seed:full`: Connects to `docs/efhub_db_202609240.sqlite` (37MB SQLite dump) and performs batch upserts for all 44,028 player cards and 1,844 managers.

## Risks / Trade-offs

- **High-Dimension Sorting Latency**: Sorting 44k records across 60+ individual columns in PostgreSQL can degrade performance without indexes.
  - *Mitigation*: Create composite indexes for high-frequency sort fields (`ovr`, `maxOvr`, `position`, `name`) and implement Redis caching for default paginated listings.
- **Progression Math Verification**: eFootball training progression formulas involve specific category weightings.
  - *Mitigation*: The build simulator encapsulates points-to-stat ratios in a shared utility library (`packages/shared/src/progression.ts`) tested with regression tests against known in-game max card ratings.
- **External Naming Alignment**: Different data providers use divergent names for the same attribute (e.g., `GKClearing` vs `gk_parrying`, `BallWinning` vs `tackling`).
  - *Mitigation*: Strict normalization in `packages/shared` maps all aliases to standardized internal names.
