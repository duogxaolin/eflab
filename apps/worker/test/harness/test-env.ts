// Test environment for the worker (openspec change admin-sync-worker, task 5.6;
// reusable by later batches): synthetic secrets, the fake source as
// EFBASE_API_BASE, the stand-in upload command, test mode on, and a global
// fetch guard that refuses (and counts) any request to a non-loopback host.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { assertLoopbackUrl, isLoopbackHost } from "../../src/efootbase.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FAKE_UPLOAD_SCRIPT = resolve(HERE, "fake-upload.mjs");

/** Synthetic secret values (never real ones). Long and distinctive so redaction is unambiguous. */
export const TEST_SECRETS = {
  EFBASE_API_KEY: "test-efbase-key-9f3c1a7e5b2d4f60",
  R2_ACCOUNT_ID: "test-r2-account-0c4e8a2b6d1f",
  R2_ACCESS_KEY_ID: "test-r2-access-7d2a9c4e1b3f",
  R2_SECRET_ACCESS_KEY: "test-r2-secret-5e8b1d3a7c9f2e4b",
  R2_BUCKET: "test-bucket-synctest",
} as const;

/**
 * The environment a test-mode worker is built from. Asserts the source base is
 * a loopback address BEFORE anything can use it.
 */
export function workerTestEnv(opts: { databaseUrl: string; apiBase: string; uploadDest: string; r2PublicBase?: string }): NodeJS.ProcessEnv {
  assertLoopbackUrl(opts.apiBase, "test EFBASE_API_BASE");
  if (opts.r2PublicBase) assertLoopbackUrl(opts.r2PublicBase, "test R2_PUBLIC_BASE");
  return {
    NODE_ENV: "test",
    SYNC_TEST_MODE: "1",
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    DATABASE_URL: opts.databaseUrl,
    EFBASE_API_BASE: opts.apiBase,
    ...TEST_SECRETS,
    ...(opts.r2PublicBase ? { R2_PUBLIC_BASE: opts.r2PublicBase } : {}),
    SYNC_R2_UPLOAD_CMD: JSON.stringify([process.execPath, FAKE_UPLOAD_SCRIPT, "--dest", opts.uploadDest]),
  };
}

export interface FetchGuard {
  /** Requests refused because their host was not loopback. */
  refused: string[];
  restore(): void;
}

/** Replaces globalThis.fetch: a non-loopback URL throws (and is recorded) instead of leaving the machine. */
export function guardFetch(): FetchGuard {
  const original = globalThis.fetch;
  const refused: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const host = new URL(url).hostname;
    if (!isLoopbackHost(host)) {
      refused.push(host);
      throw new Error(`test fetch guard: refused a request to ${host} (tests may only contact loopback addresses)`);
    }
    return original(input, init);
  }) as typeof fetch;
  return { refused, restore: () => (globalThis.fetch = original) };
}
