## 0. Safety

- [x] 0.1 Confirm the current branch is `eflab-parity-fixes` with a clean tree (baseline commit fab3f09); take a `pg_dump -Fc` backup outside the repo and prove it with `pg_restore --list`; record row counts of every table. ← (verify: backup exists outside the repo, counts recorded)

## 1. Evidence ledger

- [x] 1.1 For each candidate in proposal.md, grep (web, api, shared, db, scripts, docs, configs) and write a ledger in the scratchpad: symbol, callers found, decision. Anything with a caller stays and is reported.

## 2. API and shared

- [x] 2.1 Remove routers `community`, `feed`, `tierList`, `user`, `pages`, `pack`, `manager` from `root.ts` and delete their files and the `router/index.ts` barrel; keep `auth`, `player`, `skill`, `featured`, `/health`.
- [x] 2.2 Remove schemas, DTO types, constants and exports in `@eflab/shared` used only by the removed code (e.g. build/tier/feed/user/leaderboard inputs, radar maps, SKILL_IDS, STAT_ALIAS_MAP, statTierColor, PLAYER_FILTER_DIMENSIONS), only where grep proves no importer; keep the progression engine and everything the web imports.
- [x] 2.3 Remove `@better-auth/prisma-adapter` from `apps/api/package.json`; keep `better-auth`. ← (verify: `pnpm -r typecheck` passes and the remaining procedure list equals the ones the web, auth and health use)

## 3. Web

- [x] 3.1 Delete `SkillsList.tsx`, `StatGroup.tsx`, `BuildSimulator.tsx`, `lib/efhub-images.ts`, `content/articles/*.mdx`; keep `ProgressionPanel.tsx`.
- [x] 3.2 Remove unused helpers and constants in `lib/r2-images.ts` and orphaned CSS (`.pcb__background`, `.pcb__frame`, …) after grep confirms no use.
- [x] 3.3 Remove unused dependencies from `apps/web/package.json` (`gray-matter`, `next-mdx-remote`, and any direct dependency never imported) and update the lockfile. ← (verify: `pnpm --filter @eflab/web build` passes; bundle size not larger than before)

## 4. Database

- [x] 4.1 Remove the models Build, Review, TierVote, TierList, Follow, Post, PostLike, Comment (and relations/enums only they use) from `schema.prisma`; write one migration with explicit DROPs; update `--reset-users`, `verify-seed.py` and any raw SQL that names them.
- [x] 4.2 Apply with `prisma migrate deploy` (no db push, no reseed); confirm `migrate diff` is empty and a scratch DB built from migrations matches the schema; drop the scratch DB. ← (verify: dropped tables absent, all other row counts unchanged: Player 48410, Manager 1475, Booster 375, Pack 2046, Skill 84, PlayerSkill 191444, FeaturedBundle 24, User 8, Session 12, Account 8)

## 5. Infrastructure and docs

- [x] 5.1 Remove the Redis service and its mentions from `docker-compose.yml`, `.env.example`, README, CLAUDE.md and docs; do not recreate containers (owner step: `docker compose up -d --remove-orphans`).
- [x] 5.2 Update the smoke test (no manager/pack procedure calls), CLAUDE.md (layout, router list, dead-code section), README (endpoint table), ui-dna and docs; add "API removed in change remove-dead-surface" status notes to the specs of removed features without changing requirement text.

## 6. Verification

- [x] 6.1 `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @eflab/web build`, `openspec validate --specs` and `openspec validate remove-dead-surface --strict` pass; grep finds no reference to removed modules or procedures.
- [x] 6.2 Playwright smoke on API 5100 / web 3100: `/`, `/players`, a detail page with the Progression panel, `/compare`, `/packs`, `/packs/<slug>`, `/skills` without console errors or regressions. ← (verify: measured results, nothing committed or pushed, no secrets or dumps in the diff)
