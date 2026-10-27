# web-platform-upgrade Specification

## Purpose
Defines the web framework contract of `apps/web` after the move to Next.js 16: the exact pinned version (16.4.3) and its default bundler (Turbopack, for both `next dev` and `next build`) with no experimental key except `strictRouteTypes`, which only affects types — it makes Next write the route-types import for the active distDir so that every `<Link href>` and router target is checked at type-check and build time (requirement "Typed Links Are Enforced") — the public behaviour and build output that must survive a framework upgrade (redirects, headers, environment precedence, route types, tracked files, assets, `/players` URL state), the proof required before the hydration work-around `PageSlot` may be removed, and the like-for-like browser metric used to measure bundle size now that Next no longer prints "First Load JS".
## Requirements
### Requirement: Framework Version And Bundler
The web app SHALL run the exact Next.js version recorded in `apps/web/package.json` (16.4.3), with the bundler Next 16 uses by default for `next dev` and `next build` (Turbopack) and without experimental flags (`cacheComponents`, `reactCompiler`, `experimental.*`) except `experimental.strictRouteTypes`, which only changes type generation and the type check (requirement "Typed Links Are Enforced") and SHALL have no runtime effect. The `dev` script SHALL NOT pass `--turbopack`. A first, separately committed step SHALL have run the app on Next 15.5.28 with all checks passing, so a patched rollback target exists.

#### Scenario: Version and flags
- **WHEN** `apps/web/package.json` and `apps/web/next.config.ts` are read
- **THEN** `next` is `16.4.3` exactly, `dev` is `next dev -p 3000`, and `next.config.ts` contains no experimental key other than `strictRouteTypes` and sets `agentRules: false`.

#### Scenario: Clean build
- **WHEN** `NEXT_DIST_DIR=.next-check pnpm --filter @eflab/web build` is run
- **THEN** it exits 0 with the default bundler, TypeScript passes, and a check build does not touch the served `.next` folder.

### Requirement: Behaviour Preserved Across The Upgrade
Upgrading SHALL change no public behaviour: every route of the app answers as before, `/skills` and each old `/skills/<slug>` still answer one permanent redirect to the wiki, the security headers and the admin `Cache-Control: no-store` / `X-Robots-Tag` headers are unchanged, environment values keep the precedence shell > `apps/web/.env*` > root `.env`, `NEXT_PUBLIC_API_URL` and the build stamp reach the client bundle, card images and both font families load, the generated Tailwind output covers every class in use, and the `/players` URL state logic (own-write echo adoption, Back / Forward, header search) behaves as before.

#### Scenario: Redirects and headers
- **WHEN** `/skills?x=1`, `/skills/phenomenal-passing`, `/wiki/skills/phenomenal-passing`, `/wiki/skills/nope`, `/` and `/admin/login` are requested without following redirects
- **THEN** they answer 308 to `/wiki/skills?x=1`, one 308 to `/wiki/skills/phenomenal-pass`, one 308 to `/wiki/skills/phenomenal-pass`, 404, 200 with the five security headers, and 200 with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.

#### Scenario: Env precedence
- **WHEN** `NEXT_PUBLIC_API_URL` is set to three different values in the root `.env`, in `apps/web/.env.local` and in the shell, and the app is built
- **THEN** the value in the built client is the shell's, then `apps/web/.env.local`'s, then the root `.env`'s as each higher source is removed.

#### Scenario: URL state and navigation
- **WHEN** the QA scripts of change `browser QA 2026-10-25` are re-run (rapid filter toggles on `/players`, Back / Forward through navigations, the header ⌘K search and "Players" link while on `/players`, `?page=0` cleanup, card-page build edits and reload, compare restore, `/wiki/skills` `group` / `q`)
- **THEN** every URL and list state equals what the same script gives on Next 15.5.26.

#### Scenario: Visual and asset parity
- **WHEN** home, `/players`, a player page, `/compare`, `/packs`, `/wiki/skills` and a skill page are loaded at 1440 and 390 px on both versions
- **THEN** no `/_next/static` or font request fails, there is no console error or horizontal scroll, and full-page screenshots differ by 0 pixels outside animated areas (or every difference is explained).

### Requirement: Hydration Fix Proven Before PageSlot Is Removed
`PageSlot` SHALL be removed only after the hydration fix has been shown on the new build: a production Turbopack build without `PageSlot`, run in one long-lived browser context over at least 250 loads of `/`, `/compare`, `/wiki/skills`, `/packs`, `/players`, a player page and a skill page at 320, 390 and 1440 px with the `app/error` chunk held back about 20 ms, SHALL show 0 hydration errors and 0 console #418, **and** an instrumented copy of the client React chunk SHALL record a non-zero number of replays of a suspended host fiber under `<main>` (a clean run with no replays proves nothing). The same harness on Next 15.5.26 without `PageSlot` SHALL reproduce #418 (positive control). When the proof fails or is inconclusive, `PageSlot` stays and the change reports it.

#### Scenario: Proof
- **WHEN** the harness runs on 16.4.3 without `PageSlot`
- **THEN** it reports at least one replayed host fiber under `<main>`, 0 mismatches and 0 #418, and the 15.5.26 control reports at least one #418.

#### Scenario: Removal
- **WHEN** the proof passed
- **THEN** `components/layout/PageSlot.tsx` no longer exists, `app/layout.tsx` renders `{children}` directly under `<main>`, and CLAUDE.md's known-limitation entry is replaced by a short history note.

### Requirement: Bundle Size Is Measured Like For Like
Because Next 16 no longer prints "First Load JS", the documented bundle figures SHALL be re-measured with one metric defined in the docs — the gzip bytes of every JS response a route loads in a fresh browser context, per route at 1440 px — taken on Next 15.5.26 and on 16.4.3 on the same machine; the Turbopack `diagnostics/route-bundle-stats.json` SHALL be recorded beside it, and a route that grows by more than 10 % SHALL be reported and explained.

#### Scenario: Re-baseline
- **WHEN** CLAUDE.md's size figures are read after the change
- **THEN** each route has a before and an after value under the stated metric, and the old webpack "First Load JS" values are marked as historical.

### Requirement: Tracked Files And Dev Output
After the upgrade `apps/web/tsconfig.json` SHALL carry `jsx: react-jsx`, `apps/web/next-env.d.ts` SHALL stay tracked and be restored after check builds as before, `next dev` SHALL write only below `<distDir>/dev` and create no `AGENTS.md`, and `pnpm typecheck` SHALL pass from a clean clone state (no `.next`) after `next build` or `next typegen` has run once.

#### Scenario: Dev run
- **WHEN** `next dev` is started and stopped on a scratch port
- **THEN** no `AGENTS.md` exists under the repository, only `.next*/dev` was written, and `git status` shows at most `tsconfig.json` and `next-env.d.ts` as modified.

### Requirement: Typed Links Are Enforced
The route types Next generates SHALL be part of the program the type check reads, and they SHALL be regenerated before every type check and build so they are never stale, so that a `<Link href>` or router target that is not a route of the app fails `pnpm typecheck` and `next build`. Every link and router call the app contains SHALL satisfy the check without blanket `any` / `as never` casts; a dynamic or computed target SHALL be typed through the generated route type with a documented cast at one helper at most. The enforcement SHALL change no file outside `<distDir>/types` and nothing the running server reads (a `pnpm typecheck` rewrites the type files under `.next/types` of a served build, which the server never reads), and SHALL work from a clean clone.

#### Scenario: Unknown route fails
- **WHEN** a probe changes a link in a component to `href="/typo-route"` and `pnpm typecheck` is run
- **THEN** it exits non-zero with an error naming that link, and restoring the link makes it pass

#### Scenario: Every existing link passes
- **WHEN** `pnpm typecheck` and a check build (`NEXT_DIST_DIR=.next-check`) run on the tree
- **THEN** both exit 0 and the diff contains no new `any` cast on a link

#### Scenario: Fresh types after a route change
- **WHEN** a new page is added and a link to it is added, with no `.next` folder regenerated by hand
- **THEN** `pnpm typecheck` and `next build` accept the link, and removing the page makes them reject it

#### Scenario: Clean clone
- **WHEN** the tree has no `.next` or `.next-check` folder
- **THEN** `pnpm typecheck` exits 0, and the owner's `next build` called directly in `apps/web` also exits 0

