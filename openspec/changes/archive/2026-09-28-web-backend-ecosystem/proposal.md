## Why

Current eFootball database tools either suffer from degraded performance and fragile client-side rendering (such as efootbase's WebGL dependency crashing low-end/headless clients) or lack a modern, unified design and developer-friendly APIs. Furthermore, enthusiasts need a clean, responsive web application and backend API service providing comprehensive player/manager database capabilities, progression build simulations, and community features (tier lists, custom builds, reviews) inspired by efootbase's visual card presentation without copying its assets or branding.

Prioritizing web and backend development first allows the team to establish the core data model, query engines, and UI design system before expanding to mobile applications.

## What Changes

- Initialize a Turborepo monorepo with `apps/web` (Next.js 15 App Router, Tailwind CSS), `apps/api` (Node.js, Fastify, tRPC), `packages/db` (Prisma ORM, PostgreSQL), and `packages/shared` (Zod schemas, shared TypeScript types).
- Define a comprehensive PostgreSQL relational schema modeling players, card variations, 26 base attributes, physical metrics, skills, tactics, boosters, managers, packs, and community entities.
- Implement high-performance tRPC query routers for player search, multi-dimensional filtering, 60+ sort criteria, and player comparison.
- Build a responsive, CSS 3D hardware-accelerated player card component with booster indicators (`+4 Defending`, `Lofted Pass +6`) and 12-position familiarity maps without WebGL overhead.
- Build interactive progression build simulator with level sliding and tactical manager multipliers.
- Establish sample fixture seeding scripts (20–50 players, 5 managers) for local development while supporting full SQLite data ingestion pipeline.
- Scaffold community primitives: user authentication, build saving, tier list voting, and card reviews.
- Defer mobile application (`apps/mobile` with Expo) to subsequent milestone after web and backend stability.

## Capabilities

### New Capabilities
- `player-database`: Core data modeling, indexing, multi-dimensional filtering (11 categories), 60+ sort fields, and detail views for eFootball cards.
- `card-showcase-ui`: CSS 3D hardware-accelerated card visualization, dynamic booster badges, and position proficiency heatmaps.
- `build-simulator`: Progression point allocation engine, booster slot adjustments, and manager tactic boost calculations.
- `comparison-tool`: Comparative stat matrices and 6-axis radar charts (SHT, PAS, PHY, DEF, DRI, SPD).
- `manager-database`: Manager registry, tactical mastery scores (Possession, Quick Counter, etc.), and squad compatibility calculators.
- `community-hub`: User profiles, public build bookmarks, community tier list creation/voting, and review feeds.
- `data-seeding-pipeline`: Mock fixture generators and full-scale database synchronizer from external formats.

### Modified Capabilities
None. (Fresh greenfield project).

## Impact

- **Codebase**: Creates `/apps/web`, `/apps/api`, `/packages/db`, and `/packages/shared`.
- **Dependencies**: Next.js 15, React 19, Fastify, tRPC v11, Prisma 6, PostgreSQL 16, Tailwind CSS 4, Lucide Icons.
- **Operations**: Local Docker Compose environment for PostgreSQL and Redis.
