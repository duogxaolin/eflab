## 1. Auth: better-auth + Postgres Sessions

- [ ] 1.1 Add `better-auth` dependencies to `apps/api` and `apps/web`, configure Postgres adapter with Prisma `sessions` + `accounts` tables
- [ ] 1.2 Create Prisma migration adding `Session`, `Account`, and `Follow` models; add `followersCount` + `followingCount` int fields to `User`
- [ ] 1.3 Implement email/password signup + signin endpoints via better-auth
- [ ] 1.4 Implement Google OAuth provider (client ID + secret via env vars, callback route)
- [ ] 1.5 Add `protectedProcedure` middleware in `apps/api/src/trpc.ts` (read session cookie → load User → inject ctx; return UNAUTHORIZED if none)
- [ ] 1.6 Convert `communityRouter` mutations (voteTier, review, saveBuild) from `publicProcedure` to `protectedProcedure`; remove `SEED_AUTHOR_ID` fake user
- [ ] 1.7 Build auth UI: `/login`, `/register` pages, "Sign in with Google" button, session-aware navbar (avatar dropdown when logged in) ← (verify: new user can register, sign in, and call `community.voteTier` with real session; unauthenticated call returns 401)

## 2. User Profiles & Follow Graph

- [ ] 2.1 Implement `userRouter` in `apps/api` with procedures: `byUsername`, `follow`, `unfollow`, `followers`, `following`, `userBuilds`, `userReviews`, `userTierVotes`
- [ ] 2.2 Build `/u/[username]` page: avatar, region badge, follower/following counts, tabs (Builds, Reviews, Tier Votes)
- [ ] 2.3 Build Follow/Unfollow button component (authenticated only, optimistic toggle, atomic counter update) ← (verify: follow increments target followersCount; unfollow decrements; button toggles state)

## 3. Tier List Creator

- [ ] 3.1 Add `TierList` model to Prisma (`id, authorId, name, tiers Json, isPublic, submissions, createdAt`) + migration
- [ ] 3.2 Implement `tierListRouter`: `create`, `list`, `byId`, `voteCard` (upserts individual `TierVote` + recomputes `Player.communityTier` consensus)
- [ ] 3.3 Build `/tier-list` page: community list browser + "Create Tier List" CTA
- [ ] 3.4 Build `/tier-list/create` page: drag-and-drop builder (S/A/B/C/D drop zones), player search palette, save as public ← (verify: creating a tier list persists with tier JSON and appears in community browser; consensus badge on card updates after votes)

## 4. Community Feed

- [ ] 4.1 Add `Post`, `PostLike`, `Comment` models to Prisma + migration
- [ ] 4.2 Implement `feedRouter`: `list` (region/country filter + pagination), `create` (text + media + optional playerId), `like`, `unlike`, `comment`, `comments`
- [ ] 4.3 Build `/community` page: feed list with region/country filter dropdowns, post composer (text + player card share), like/comment inline
- [ ] 4.4 Wire "Post to Feed" button on player detail page → opens composer with card pre-attached ← (verify: posting a card to feed creates Post with playerId; feed shows card thumbnail; like toggles count; comment persists)

## 5. Articles (MDX)

- [ ] 5.1 Create `apps/web/content/articles/` directory with 3 sample MDX articles (front-matter: title, excerpt, author, date, category, cover)
- [ ] 5.2 Install `gray-matter` + `next-mdx-remote`; build article loader utility (`lib/articles.ts`)
- [ ] 5.3 Build `/articles` page: article list with category filter chips (Analysis, Game Mechanics, Player Review, Short Thoughts, News, Guide)
- [ ] 5.4 Build `/articles/[slug]` page: MDX render with syntax highlighting, cover image, author, date ← (verify: articles page lists 3 sample posts; clicking one renders full MDX content with front-matter metadata)

## 6. New Players + Tournaments + Pro Pages

- [ ] 6.1 Build `/new-players` page: query latest packs by `releaseDate DESC`, group player cards by pack, render thumbnails
- [ ] 6.2 Build `/tournaments` page: leaderboard table (Team, Points, Rank) from seeded data + Discord register link
- [ ] 6.3 Build `/pro` page: Pro benefits list, "Coming Soon" badge, no payment button
- [ ] 6.4 Implement Pro build gating: filter "Pro Builds" tab on player detail to `isPro = true` builds; show lock badge to non-Pro users ← (verify: /new-players groups cards by pack; /tournaments renders ranked table; /pro shows Coming Soon; Pro Builds tab shows lock for non-Pro users)

## 7. Full Data Seed + Postgres Extensions

- [ ] 7.1 Create Prisma migration adding `pg_trgm` + `unaccent` extensions and GIN trigram index on `Player.name`
- [ ] 7.2 Add composite indexes: `(cardType, ovr DESC)`, `(registeredPosition, ovr DESC)`, `(nationalityId, ovr DESC)` to Prisma schema + migration
- [ ] 7.3 Audit and fix `pnpm db:seed:full` script: batch size 1000, `$transaction`, alias normalization (GKClearing→gkParrying, BallWinning→tackling), BigInt string→BigInt conversion
- [ ] 7.4 Run `pnpm db:seed:full` against `docs/efhub_db_202609240.sqlite` → validate 44,028 players + 1,525 managers ingested
- [ ] 7.5 Validate query latency: `player.list` default (OVR DESC, page 1, limit 24) returns < 100ms server-side; fuzzy search "schar" returns "Fabian Schär" via trigram ← (verify: SELECT COUNT(*) FROM Player = 44028; default listing < 100ms; fuzzy search returns Schär accent-insensitive)

## 8. Integration Verification & Docs Update

- [ ] 8.1 End-to-end smoke: register → login → save build → vote tier → post to feed → follow user → view profile
- [ ] 8.2 SEO: add metadata for `/u/[username]`, `/articles/[slug]`, `/new-players`, `/tournaments` (dynamic OG where applicable)
- [ ] 8.3 Update `README.md` with Phase 2 setup steps (auth env vars, full seed command, article authoring guide) ← (verify: `pnpm build` passes zero TS/lint errors across all packages; full smoke flow works end-to-end)
