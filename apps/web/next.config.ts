import type { NextConfig } from "next";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Next transpiles next.config.ts to CommonJS before loading it, so `__dirname`
// and `require` are the Node ones here (the package is "type": "module" only
// for the app source).
const REPO_ROOT = path.join(__dirname, "../..");

// ---------------------------------------------------------------------------
// Environment: load the repository-root .env* files.
//
// Next itself only reads apps/web/.env*; this monorepo keeps one root `.env`
// (see apps/web/.env.example). `@next/env` is resolved from Next's own install
// so the version always matches the running Next. Next has already loaded
// apps/web/.env* (cached) by the time this file runs, so the root load is a
// forced reload; the snapshot taken before it is re-applied afterwards to keep
// the precedence  shell env  >  apps/web/.env*  >  <repo root>/.env*.
// Only NEXT_PUBLIC_* values are ever inlined into the client bundle.
// ---------------------------------------------------------------------------
type LoadEnvConfig = (
  dir: string,
  dev?: boolean,
  log?: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void },
  forceReload?: boolean,
) => unknown;

function loadRootEnv(): void {
  const nextDir = path.dirname(require.resolve("next/package.json"));
  const envModulePath = require.resolve("@next/env", { paths: [nextDir] });
  const { loadEnvConfig } = require(envModulePath) as { loadEnvConfig: LoadEnvConfig };
  const higherPrecedence: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) higherPrecedence[key] = value;
  }
  loadEnvConfig(REPO_ROOT, process.env.NODE_ENV !== "production", console, true);
  for (const [key, value] of Object.entries(higherPrecedence)) {
    if (process.env[key] !== value) process.env[key] = value;
  }
}
loadRootEnv();

// ---------------------------------------------------------------------------
// Build stamp (footer): NEXT_PUBLIC_GIT_SHA / NEXT_PUBLIC_BUILD_UTC. Filled
// from git when the repository is available; left unset (stamp hidden)
// otherwise. Explicit env values win so CI can pass its own.
// ---------------------------------------------------------------------------
function gitShortSha(): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}
function buildUtcStamp(): string {
  // "YYYY-MM-DD HH:MM UTC"
  return `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA || gitShortSha();
const BUILD_UTC = process.env.NEXT_PUBLIC_BUILD_UTC || (GIT_SHA ? buildUtcStamp() : undefined);

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const ADMIN_HEADERS = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const config: NextConfig = {
  // Build output folder. NEXT_DIST_DIR lets a check build (`.next-check`,
  // git-ignored) run next to the served `.next` without touching it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: false,
  // Typed links (change small-fixes-1027, design D2): `typedRoutes` makes Next
  // generate `<distDir>/types/link.d.ts` (the `Link` / router / redirect href
  // types); `strictRouteTypes` makes Next import it, with the page validator,
  // from `next-env.d.ts`, which `next build`, `next typegen` and `next dev`
  // rewrite for the distDir they write to, just before their own type check.
  // So an unknown `<Link href>` fails `next build` (any distDir) and
  // `pnpm typecheck` (`next typegen` first), always against types of the
  // current routes — `tsconfig.json` keeps excluding `.next`. Types only: no
  // runtime effect.
  typedRoutes: true,
  experimental: { strictRouteTypes: true },
  // @eflab/api is imported type-only (AppRouter) and resolved through the
  // tsconfig path alias, so it does not need transpiling.
  transpilePackages: ["@eflab/shared"],
  // Image optimiser off (change next-16-upgrade): nothing uses next/image —
  // card faces, flags and emblems are plain <img> straight from the R2 host
  // (lib/r2-images.ts) — so /_next/image answers 404 for every URL instead of
  // proxying the image host.
  images: { unoptimized: true },
  // `next dev` would otherwise write an AGENTS.md into apps/web when it runs
  // under a coding agent.
  agentRules: false,
  outputFileTracingRoot: REPO_ROOT,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    ...(GIT_SHA ? { NEXT_PUBLIC_GIT_SHA: GIT_SHA } : {}),
    ...(BUILD_UTC ? { NEXT_PUBLIC_BUILD_UTC: BUILD_UTC } : {}),
  },
  // The skills wiki moved from /skills to /wiki/skills (change
  // efootbase-function-parity, design D12): a permanent redirect (308) for the
  // index; the query is kept (Next appends it). The old skill URLs
  // (/skills/<slug>) are NOT a rule here: app/skills/[slug]/page.tsx resolves
  // the slug through the API and answers one 308 straight to the public slug
  // (a stored slug such as phenomenal-passing → /wiki/skills/phenomenal-pass,
  // which a `/skills/:slug` → `/wiki/skills/:slug` rule could only reach in
  // two hops).
  async redirects() {
    return [{ source: "/skills", destination: "/wiki/skills", permanent: true }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Private admin area (openspec change admin-sync-worker): never cached,
      // never indexed. `/admin/:path*` also matches `/admin` itself. The pages
      // are rendered per request (app/admin/layout.tsx), so Next does not
      // replace this Cache-Control with a prerender cache header.
      { source: "/admin/:path*", headers: ADMIN_HEADERS },
    ];
  },
  typescript: { ignoreBuildErrors: false },
};

// Keep the resolved values visible to anything that reads process.env after
// the config loads (e.g. server components during `next build`).
if (GIT_SHA) process.env.NEXT_PUBLIC_GIT_SHA = GIT_SHA;
if (BUILD_UTC) process.env.NEXT_PUBLIC_BUILD_UTC = BUILD_UTC;

export default config;
