## Why

The web app runs Next.js 15.5.26. Three reasons to move to 16.4.3 now: (1) the 2026-10-14 Next.js security advisories (critical RCE in `use cache` functions and in the Image Optimization API, high-severity DoS via Server Actions) are fixed only in 15.5.28 and 16.4.1+ — the app uses none of those features, but it still ships the `/_next/image` endpoint; (2) the React vendored by Next 15.5 has a hydration replay bug (#418 on a few % of warm loads, root-caused 2026-10-24) that `PageSlot` only works around, and the owner decided to remove the cause by upgrading; (3) staying on 15.x leaves the app on a maintenance line. A research pass (read of the 16.4.3 package and the official guide, 2026-10-27) found the code base already clean for 16: no middleware, every `params`/`searchParams` already a Promise, no `next/image`, no custom webpack, no `next lint`.

## What Changes

- **Next.js 16.4.3 pinned exactly** (`apps/web/package.json`), after a separate first step that bumps 15.5.26 → 15.5.28 (security patch, same React) so a tested rollback target exists. Production and dev builds use Turbopack, the 16 default (`--turbopack` dropped from the `dev` script); no `cacheComponents`, `reactCompiler` or other experimental flag.
- **`PageSlot` removed** from the root layout once the hydration fix is proven on the new build with the instrumented long-lived-context method of change `efootbase-function-parity` (design D13), including a positive control on 15.5.26 and a non-zero count of replayed host fibers; otherwise it stays and the finding is reported.
- **tsconfig / next-env.d.ts**: `jsx: react-jsx` (what Next 16 writes), `next-env.d.ts` stays tracked (churn between dev / build / check is accepted and documented), `agentRules: false` so `next dev` never writes an `AGENTS.md`.
- **Image optimiser off**: `images.unoptimized: true` (nothing uses `next/image`) if the check shows `/_next/image` then answers 4xx for every URL; the R2 `remotePatterns` entry goes with it.
- **Measured numbers re-baselined**: Next 16 no longer prints "First Load JS"; the documented per-route figures are replaced by one like-for-like metric (gzip bytes of the JS a route loads, measured in a real browser on both 15.5.26 and 16.4.3, with the 16 `route-bundle-stats.json` recorded next to it).
- **Docs** (CLAUDE.md, README.md, `openspec/ui-dna.md`): Next version, Turbopack, the new metric, `.next/dev`, the retired `PageSlot` note.
- Not in this change: React Compiler, Cache Components, Server Actions, any behaviour or data change, a changed API or database.

## Capabilities

### New Capabilities
- `web-platform-upgrade`: the framework version, bundler and build-output contracts the web app keeps (redirects, headers, env precedence, route types, assets), the hydration requirement and the measurement rule for bundle size.

### Modified Capabilities
- `site-quality-baseline`: Restricted Image Hosts and Security Headers (the optimiser is disabled; baseline headers and tracing root stay).

## Impact

- **Web only:** `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/next-env.d.ts`, `apps/web/app/layout.tsx`, `apps/web/components/layout/PageSlot.tsx` (deleted), docs. No API, database, shared-package or data change.
- **Operations:** the owner's :3000 web is rebuilt and restarted by port at the end; the build bundler and output layout change (`.next/dev`, `diagnostics/route-bundle-stats.json`).
- **Rollback:** `git revert` + `next@15.5.28` with `PageSlot` kept (15.5.28 vendors the same React as 15.5.26).
