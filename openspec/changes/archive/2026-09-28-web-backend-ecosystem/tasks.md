## 1. Monorepo Setup & Tooling

- [ ] 1.1 Initialize Turborepo with pnpm workspaces (`apps/web`, `apps/api`, `packages/db`, `packages/shared`, `packages/config`)
- [ ] 1.2 Configure root `package.json`, `turbo.json`, and TypeScript base configurations
- [ ] 1.3 Add Docker Compose configuration for local PostgreSQL 16 and Redis ← (verify: `pnpm install` and `docker compose up -d` launch cleanly without dependency or port errors)

## 2. Database Schema & Prisma Configuration (`packages/db`)

- [ ] 2.1 Define complete Prisma schema modeling eFootball players (with BigInt ID, 26 base attributes, 11 physique, 5 physics, tactics, skills, boosters), managers, packs, and community tables
- [ ] 2.2 Configure Prisma client generator, extensions, and initial database migration
- [ ] 2.3 Create mock seed fixtures (`fixtures/mock-players.json`, `fixtures/mock-managers.json`) containing 30 representative cards (Lewandowski, Messi, Bonucci, Chiellini, etc.) and 5 managers
- [ ] 2.4 Implement `pnpm db:seed:mock` script to populate PostgreSQL with test fixtures
- [ ] 2.5 Implement `pnpm db:seed:full` synchronization script connecting to `docs/efhub_db_202609240.sqlite` with alias normalization (`GKClearing` → `gkParrying`, BigInt string mapping) ← (verify: `pnpm db:seed:mock` seeds 30 players and 5 managers into Postgres in < 3s, and queries return accurate attribute records)

## 3. Shared Schemas & Types (`packages/shared`)

- [ ] 3.1 Define Zod schemas for player query parameters, filter options (11 categories), and sorting criteria (60+ metrics)
- [ ] 3.2 Define Zod schemas for manager queries, build simulator point allocations, and comparison requests
- [ ] 3.3 Implement progression calculation utility (`progression.ts`) modeling level cap distribution and manager tactic rating thresholds
- [ ] 3.4 Export shared TypeScript types and SuperJSON transformer configuration ← (verify: unit tests for `progression.ts` accurately calculate max OVR against known player records)

## 4. Backend Fastify & tRPC API Service (`apps/api`)

- [ ] 4.1 Initialize Fastify server with `@trpc/server/adapters/fastify` and SuperJSON transformer
- [ ] 4.2 Implement `playerRouter` with procedures: `list` (11 filters + 60+ sort options + pagination), `byId` (complete card details), `search` (fuzzy search), and `compare`
- [ ] 4.3 Implement `managerRouter` with procedures: `list` (filtering by 6 tactic masteries) and `byId` (including squad compatibility scoring)
- [ ] 4.4 Implement `packRouter` and `skillRouter` (listing all 67 skills and matching players)
- [ ] 4.5 Implement `communityRouter` skeleton for build saving, tier voting, and reviews
- [ ] 4.6 Add CORS, error handling middleware, and healthcheck endpoint (`/health`) ← (verify: curl to `/health` returns 200 OK and tRPC queries return serialized BigInt player cards properly)

## 5. Web Application Foundation (`apps/web`)

- [ ] 5.1 Initialize Next.js 15 App Router with Tailwind CSS 4 and Lucide icons
- [ ] 5.2 Configure tRPC React client with SuperJSON and React Query provider
- [ ] 5.3 Set up "Cyber-Sport Dark" design tokens (Midnight Slate backgrounds, Neon Lime/Cyan accents, 44px touch targets)
- [ ] 5.4 Implement global responsive navigation header and mobile bottom navigation bar matching efootbase layout ← (verify: Next.js dev server builds cleanly and loads theme tokens without hydration errors)

## 6. Player Card & Detail UI Components (`apps/web`)

- [ ] 6.1 Build CSS 3D hardware-accelerated `PlayerCard` component with pointer tilt, dynamic booster badges (`+4 Defending`), and card tier borders
- [ ] 6.2 Build `PositionHeatmap` component rendering the 12-position pitch with full/partial familiarity and position-specific OVR
- [ ] 6.3 Build `StatGroup` components displaying Attacking, Defending, and Strength blocks with visual stat bars and color-coded tier ranges (90+ purple/red, 80-89 orange, 70-79 blue)
- [ ] 6.4 Build `PhysiqueMetrics` and `SkillsList` components
- [ ] 6.5 Build `OtherVersions` horizontal scroll carousel linking cards with identical `baseId` ← (verify: PlayerCard renders smoothly at 60 FPS on desktop and touch devices without WebGL context errors)

## 7. Web Pages & Features (`apps/web`)

- [ ] 7.1 Implement Home page (`/`) featuring Trending Players, Latest Packs, and quick manager highlights
- [ ] 7.2 Implement Player Directory (`/players`) with multi-dimensional filter bar, 60+ sort selector, grid/table view toggle, and pagination
- [ ] 7.3 Implement Player Detail page (`/players/[baseId]/[cardId]`) integrating card showcase, stats, and action bar
- [ ] 7.4 Implement Interactive Progression Build Simulator on player detail with training point sliders, booster toggles, and live max OVR calculations
- [ ] 7.5 Implement Comparison page (`/compare`) featuring aligned stat matrix and 6-axis radar chart (SHT, PAS, PHY, DEF, DRI, SPD)
- [ ] 7.6 Implement Managers page (`/managers`) and Packs page (`/packs`)
- [ ] 7.7 Implement 67 Skills directory (`/skills`) and individual skill detail pages (`/skills/[slug]`) listing eligible players ← (verify: end-to-end user flow from home -> search -> card detail -> build simulator updates stats accurately)

## 8. End-to-End Verification & Documentation

- [ ] 8.1 Write smoke test script validating tRPC endpoints against mock database
- [ ] 8.2 Verify Next.js SSR metadata and dynamic OpenGraph card image generation
- [ ] 8.3 Document local setup, seeding commands, and architecture in `README.md` ← (verify: `pnpm build` across all packages in monorepo passes with zero TypeScript and lint errors)
