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

// ---------------------------------------------------------------------------
// Image hosts: the optimiser may only fetch from the R2 public host. The
// default mirrors the code fallback in lib/r2-images.ts (kept in sync by hand;
// NEXT_PUBLIC_R2_PUBLIC_BASE overrides both). efimg.com is not listed because
// no component renders an efimg URL any more (lib/efhub-images.ts has no
// callers); add it here if that changes.
// ---------------------------------------------------------------------------
const DEFAULT_R2_PUBLIC_BASE = "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";
function r2Host(): { protocol: "https" | "http"; hostname: string } {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE || DEFAULT_R2_PUBLIC_BASE;
  const url = new URL(base);
  return { protocol: url.protocol === "http:" ? "http" : "https", hostname: url.hostname };
}

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  reactStrictMode: false,
  typedRoutes: true,
  // @eflab/api is imported type-only (AppRouter) and resolved through the
  // tsconfig path alias, so it does not need transpiling.
  transpilePackages: ["@eflab/shared"],
  images: {
    remotePatterns: [{ ...r2Host(), pathname: "/**" }],
  },
  outputFileTracingRoot: REPO_ROOT,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    ...(GIT_SHA ? { NEXT_PUBLIC_GIT_SHA: GIT_SHA } : {}),
    ...(BUILD_UTC ? { NEXT_PUBLIC_BUILD_UTC: BUILD_UTC } : {}),
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  typescript: { ignoreBuildErrors: false },
};

// Keep the resolved values visible to anything that reads process.env after
// the config loads (e.g. server components during `next build`).
if (GIT_SHA) process.env.NEXT_PUBLIC_GIT_SHA = GIT_SHA;
if (BUILD_UTC) process.env.NEXT_PUBLIC_BUILD_UTC = BUILD_UTC;

export default config;
