## Why

After the web app shrank to the four efootbase pages (2026-10-07), about 34 of the 46 tRPC procedures, eight user-content tables, several components, helpers, dependencies and a Redis service have no caller. They are public attack surface (unauthenticated sign-up feeds writes into them), maintenance cost and a source of misleading documentation. The owner explicitly approved removing them (history rewrite is not part of this).

## What Changes

- Remove the tRPC routers `community`, `feed`, `tierList`, `user`, `pages`, `pack` and `manager` from the root router, with the schemas, DTO types, constants and files that only they use (including the unused `router/index.ts` barrel and `community.simulate`).
- Remove dead web code: `SkillsList`, `StatGroup`, `BuildSimulator`, `lib/efhub-images.ts`, the unused layered-composite and manager/emblem helpers in `lib/r2-images.ts`, the MDX article content and orphaned CSS.
- Remove unused dependencies (`gray-matter`, `next-mdx-remote`, `@better-auth/prisma-adapter`, and any direct web dependency that is never imported) and unreferenced exports in `@eflab/shared`.
- Remove the unused Redis service from `docker-compose.yml` and its mentions.
- Drop the Prisma models that only served removed features (Build, Review, TierVote, TierList, Follow, Post, PostLike, Comment) with one explicit migration, after a verified backup.
- Update the seed, verification script, smoke test and docs to match; mark the specs of removed features accordingly.
- **BREAKING (API)**: the removed procedures disappear from `/trpc`; the dropped tables lose their data (TierList holds 1 row, the others 0).
- Kept on purpose: the `auth` router with Google OAuth and the User/Session/Account tables, `player`, `skill`, `featured`, `/health`, Pack/PackCard and Manager (data assets, with seeding and cross-fill), the Progression engine and panel.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. No user-visible behaviour of the web app changes, so this change opts out of spec deltas (`skip_specs`). Status notes on the specs of removed features are documentation edits, not requirement changes.

## Impact

- `apps/api` (root router, routers, auth schemas), `packages/shared` (schemas, types, constants, exports), `packages/db` (schema, new migration, seed), `apps/web` (components, lib, content, CSS, package.json), `apps/api/package.json`, `docker-compose.yml`, `scripts/` (smoke test, verify-seed), docs and `.env.example`.
- Live dev database: one migration that drops 8 tables, after a `pg_dump` backup kept outside the repo.
