// Worker configuration (openspec change admin-sync-worker, design decisions 3 and 5).
//
// The worker is the ONLY process that reads the efootbase key and the image
// bucket credentials. They come from the repo-root .env (loaded by
// `tsx --env-file-if-exists=../../.env`, like the API) or the service's
// environment. Child processes never inherit this process's environment: they
// get `childEnv(...)` — an explicit allow-list plus the one secret they need.
//
// Variables (names only; values never appear in the repo or in logs):
//   DATABASE_URL          Postgres (Prisma, via @eflab/db)
//   EFBASE_API_KEY        efootbase API key (check run; dump child via --key-from-env)
//   EFBASE_API_BASE       optional API base (tests: the local fake source, loopback only)
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE
//                         image bucket (upload child only)
//   SYNC_PYTHON           python interpreter for the scripts (default python3)
//   SYNC_R2_UPLOAD_CMD    optional JSON array argv replacing [python, scripts/r2_upload.py]
//                         (tests: a stand-in upload command; REQUIRED in test mode)
//   EFOOTBASE_STATIC_DIR  static efootbase snapshot the full run's seed reads
//                         (default dump/efootbase/static; REQUIRED in test mode)
//   NODE_ENV=test / SYNC_TEST_MODE=1   test mode: loopback source, scratch database,
//                         stand-in upload only

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REDACTION_MIN_SECRET_LENGTH, makeRedactor } from "@eflab/shared";
import { assertLoopbackUrl, isLoopbackHost, isTestMode, resolveSourceBase } from "./efootbase.js";

/** Repo root (apps/worker/src → ../../..). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const DUMP_SCRIPT = resolve(REPO_ROOT, "scripts/efootbase_dump.py");
export const UPLOAD_SCRIPT = resolve(REPO_ROOT, "scripts/r2_upload.py");
/** packages/db — cwd of the seed child (the full run). */
export const DB_PACKAGE_DIR = resolve(REPO_ROOT, "packages/db");
/** The seed the full run executes as a child (relative to DB_PACKAGE_DIR). */
export const SEED_ENTRY = "src/seed-efootbase-full.ts";
/** Default static snapshot directory (= the seed's own default). */
export const DEFAULT_STATIC_DIR = resolve(REPO_ROOT, "dump/efootbase/static");

/** Scratch database names a test-mode worker accepts (never the live database). */
export const TEST_DATABASE_NAME_RE = /^eflab_synctest(_[a-z0-9_]+)?$/;

/** The only variables a child process inherits from the worker's environment. */
export const CHILD_ENV_ALLOWLIST = ["PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ"] as const;

export interface WorkerEnv {
  testMode: boolean;
  /** Resolved API base, no trailing slash (loopback-checked in test mode). */
  apiBase: string;
  efbaseApiKey: string | null;
  /** R2_* variables, handed only to the upload child. */
  r2Env: Record<string, string>;
  python: string;
  /** argv of the upload command; the worker appends r2_upload.py's arguments. */
  uploadCommand: string[];
  /** Every configured secret value (redacted from logs, errors and statistics). */
  secrets: string[];
  redact: (text: string) => string;
  /** The allow-listed part of the worker's environment (base of every child env). */
  baseChildEnv: Record<string, string>;
  /** DATABASE_URL of this worker — handed ONLY to the seed child (`seedChildEnv`), never logged. */
  databaseUrl: string | null;
  /** R2_PUBLIC_BASE without trailing slash (loopback-checked in test mode), or null when unset. */
  r2PublicBase: string | null;
  /** Static efootbase snapshot directory (EFOOTBASE_STATIC_DIR, else dump/efootbase/static; required in test mode). */
  staticDir: string | null;
  /**
   * Test mode only (EFBASE_TEST_THIRD_PARTY_BASE, loopback): a stand-in for the
   * third-party image host pesdb.net — accepted for `transparent` renders, and
   * its refusals skip only its own images (third verify W1). null otherwise.
   */
  testThirdPartyBase: string | null;
}

/**
 * Values to mask: the efootbase key, every R2_* value, the database URL and its
 * password (raw as in the URL, decoded and re-encoded). `makeRedactor` also
 * masks the URL-encoded and base64 forms of each and ignores values shorter
 * than REDACTION_MIN_SECRET_LENGTH.
 */
export function collectSecrets(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  const key = env.EFBASE_API_KEY?.trim();
  if (key) out.push(key);
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith("R2_") && typeof v === "string" && v.trim() !== "") out.push(v.trim());
  }
  const dbUrl = env.DATABASE_URL?.trim();
  if (dbUrl) {
    out.push(dbUrl);
    try {
      const u = new URL(dbUrl);
      if (u.password) {
        out.push(u.password);
        try {
          const decoded = decodeURIComponent(u.password);
          out.push(decoded, encodeURIComponent(decoded));
        } catch {
          /* malformed escape: the raw form is masked */
        }
      }
      // libpq also takes the password as a query parameter (`?password=…`)
      const raw = /[?&]password=([^&#]*)/.exec(dbUrl)?.[1];
      if (raw) {
        out.push(raw);
        const decoded = u.searchParams.get("password"); // form decoding ("+" = space)
        if (decoded) out.push(decoded, encodeURIComponent(decoded));
        try {
          out.push(decodeURIComponent(raw)); // libpq's decoding ("+" kept)
        } catch {
          /* malformed escape: the raw form is masked */
        }
      }
    } catch {
      /* not a URL: masked whole above */
    }
  }
  return out;
}

/** Name of the database in a Postgres URL (no other part of the URL is returned). */
export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/**
 * Test mode only: the database must be a scratch database on a loopback host
 * (`eflab_synctest…`), so no test can write to the live database.
 */
export function assertTestDatabase(env: NodeJS.ProcessEnv): void {
  if (!isTestMode(env)) return;
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL: required");
  let name: string;
  let host: string;
  try {
    const u = new URL(url);
    name = databaseName(url);
    host = u.hostname;
  } catch {
    throw new Error("DATABASE_URL: not a valid URL");
  }
  if (!TEST_DATABASE_NAME_RE.test(name)) throw new Error(`DATABASE_URL: test mode runs only against a scratch database eflab_synctest* (got "${name}")`);
  if (!isLoopbackHost(host)) throw new Error(`DATABASE_URL: test mode runs only against a loopback database host (got ${host})`);
}

function parseUploadCommand(env: NodeJS.ProcessEnv, python: string, testMode: boolean): string[] {
  const raw = env.SYNC_R2_UPLOAD_CMD?.trim();
  if (!raw) {
    if (testMode) throw new Error("SYNC_R2_UPLOAD_CMD: required in test mode (a stand-in upload command); the real bucket is never used by tests");
    return [python, UPLOAD_SCRIPT];
  }
  let argv: unknown;
  try {
    argv = JSON.parse(raw);
  } catch {
    throw new Error("SYNC_R2_UPLOAD_CMD: must be a JSON array of strings (argv, no shell)");
  }
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((a) => typeof a === "string" && a !== "")) {
    throw new Error("SYNC_R2_UPLOAD_CMD: must be a non-empty JSON array of non-empty strings");
  }
  return argv as string[];
}

export function loadWorkerEnv(env: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const testMode = isTestMode(env);
  assertTestDatabase(env);
  const key = env.EFBASE_API_KEY?.trim() || null;
  // A key the redactor would ignore (REDACTION_MIN_SECRET_LENGTH) could reach a
  // stored log in clear: a real worker does not start with one. Test mode uses
  // synthetic keys only.
  if (!testMode && key !== null && key.length < REDACTION_MIN_SECRET_LENGTH) {
    throw new Error(`EFBASE_API_KEY: shorter than ${REDACTION_MIN_SECRET_LENGTH} characters — the worker refuses to start (such a value cannot be redacted from logs safely)`);
  }
  const apiBase = resolveSourceBase(env);
  const python = env.SYNC_PYTHON?.trim() || "python3";
  const r2Env: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (k.startsWith("R2_") && typeof v === "string") r2Env[k] = v;
  if (testMode && r2Env.R2_PUBLIC_BASE) assertLoopbackUrl(r2Env.R2_PUBLIC_BASE, "R2_PUBLIC_BASE");
  const baseChildEnv: Record<string, string> = {};
  for (const k of CHILD_ENV_ALLOWLIST) {
    const v = env[k];
    if (typeof v === "string") baseChildEnv[k] = v;
  }
  const secrets = collectSecrets(env);
  const r2PublicBase = r2Env.R2_PUBLIC_BASE?.trim().replace(/\/+$/, "") || null;
  // Test mode never falls back to the real snapshot directory.
  const staticDir = env.EFOOTBASE_STATIC_DIR?.trim() || (testMode ? null : DEFAULT_STATIC_DIR);
  const thirdParty = env.EFBASE_TEST_THIRD_PARTY_BASE?.trim() || null;
  if (thirdParty !== null) {
    if (!testMode) throw new Error("EFBASE_TEST_THIRD_PARTY_BASE: tests only (needs NODE_ENV=test or SYNC_TEST_MODE=1)");
    assertLoopbackUrl(thirdParty, "EFBASE_TEST_THIRD_PARTY_BASE");
  }
  return {
    testMode,
    apiBase,
    efbaseApiKey: key,
    r2Env,
    python,
    uploadCommand: parseUploadCommand(env, python, testMode),
    secrets,
    redact: makeRedactor(secrets),
    baseChildEnv,
    databaseUrl: env.DATABASE_URL?.trim() || null,
    r2PublicBase,
    staticDir: staticDir ? resolve(staticDir) : null,
    testThirdPartyBase: thirdParty ? thirdParty.replace(/\/+$/, "") : null,
  };
}

/**
 * Environment of one child process: the allow-list, unbuffered UTF-8 Python
 * output (line-buffered capture), and exactly the extra variables given
 * (e.g. `{ EFBASE_API_KEY }` for the dump script, `r2Env` for the upload).
 * DATABASE_URL is never passed to a child.
 */
export function childEnv(w: WorkerEnv, extra: Record<string, string> = {}): Record<string, string> {
  if ("DATABASE_URL" in extra) throw new Error("childEnv: DATABASE_URL is never passed to a child process");
  return { ...w.baseChildEnv, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", ...extra };
}

/**
 * Environment of the seed child of a full run — the ONE child that gets the
 * database URL (the seed writes the catalogue). Run without `--env-file`, so
 * nothing from the repo-root .env reaches it: only the allow-list, the worker's
 * own DATABASE_URL (in test mode re-checked to be a loopback scratch database),
 * R2_PUBLIC_BASE when set (stored emblem / manager URLs) and the given location
 * variables. No efootbase key, no bucket credentials.
 */
export function seedChildEnv(w: WorkerEnv, locations: Record<string, string>): Record<string, string> {
  if (!w.databaseUrl) throw new Error("DATABASE_URL: not set in the worker's environment");
  if (w.testMode) assertTestDatabase({ NODE_ENV: "test", DATABASE_URL: w.databaseUrl });
  for (const k of Object.keys(locations)) {
    if (!k.startsWith("EFOOTBASE_")) throw new Error(`seedChildEnv: only EFOOTBASE_* location variables may be added (got ${k})`);
  }
  return {
    ...w.baseChildEnv,
    NODE_ENV: "production",
    DATABASE_URL: w.databaseUrl,
    ...(w.r2PublicBase ? { R2_PUBLIC_BASE: w.r2PublicBase } : {}),
    ...locations,
  };
}
