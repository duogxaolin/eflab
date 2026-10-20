// Child scripts of the sync runs (openspec change admin-sync-worker, design
// decisions 5–7): scripts/efootbase_dump.py (data and images, the only caller
// of the source besides the check), the image upload (scripts/r2_upload.py or
// the SYNC_R2_UPLOAD_CMD stand-in in tests) and the seed (full run only).
//
// Every helper either returns normally or throws a `RunStop` that carries the
// run's outcome (FAILED with a clear message, or BLOCKED when the source
// refused). A cancel / time limit / shutdown is left to the runner: the helpers
// throw a plain error once the run's signal fired and the runner decides the
// final status.

import { mkdtempSync, chmodSync, existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildResult } from "./child.js";
import { testAllowHost } from "./efootbase.js";
import { DB_PACKAGE_DIR, DUMP_SCRIPT, REPO_ROOT, SEED_ENTRY, UPLOAD_SCRIPT, childEnv, seedChildEnv, type WorkerEnv } from "./env.js";
import { SEED_CHILD_TIMEOUT_MS } from "./limits.js";
import type { RunContext, RunOutcome } from "./runner.js";

/** Ends a run early with this outcome (handlers catch it and return `outcome`). */
export class RunStop extends Error {
  constructor(readonly outcome: Exclude<RunOutcome, { status: "OK" }>) {
    super(outcome.status === "BLOCKED" ? outcome.reason : outcome.error);
  }
}
export const fail = (error: string): RunStop => new RunStop({ status: "FAILED", error });

/** Wraps a handler body: a RunStop becomes its outcome, anything else propagates to the runner. */
export async function stopToOutcome(body: () => Promise<RunOutcome>): Promise<RunOutcome> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof RunStop) return e.outcome;
    throw e;
  }
}

/** The last `n` non-empty lines a child printed (stack-trace frames dropped). */
export class LastLines {
  private lines: string[] = [];
  constructor(private readonly n = 12) {}
  push(line: string): void {
    if (line.trim() === "" || /^\s+at\s/.test(line)) return;
    this.lines.push(line.trim());
    if (this.lines.length > this.n) this.lines.shift();
  }
  toString(): string {
    return this.lines.join(" | ");
  }
}

function afterChild(ctx: RunContext, res: ChildResult, what: string): void {
  if (ctx.signal.aborted) throw new Error(`${what} stopped (run aborted)`); // the runner decides CANCELLED / time limit / shutdown
  if (res.ended === "spawn-error") throw fail(`${what}: could not start the child process (${res.error ?? "unknown error"})`);
}

/** Run working directory: os.tmpdir()/eflab-sync-<runId>-XXXXXX, mode 0700 (removed by the caller in `finally`). */
export function makeRunDir(ctx: RunContext): string {
  const dir = mkdtempSync(join(tmpdir(), `eflab-sync-${ctx.run.id}-`));
  chmodSync(dir, 0o700);
  return dir;
}

export function removeRunDir(ctx: RunContext, dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
    ctx.log(`removed the working directory ${dir}`);
  } catch (e) {
    ctx.log(`could not remove the working directory ${dir}: ${(e as Error).message}`);
  }
}

// ---- efootbase_dump.py ----

/** Lines of efootbase_dump.py that mean the source refused (it exits 2 after printing one of them). */
const BLOCKED_LINE = /^BLOCKED: |CDN returned 403\/429/;

/**
 * Runs scripts/efootbase_dump.py with the key in its environment
 * (`--key-from-env`, never an argument) and the worker's API base
 * (`--api-base`, the loopback fake source in tests). Exit 0 → returns; exit 2
 * with the script's block line → BLOCKED; anything else → FAILED with the last
 * lines. Exit 2 alone is not a block (argparse usage errors exit 2 too).
 */
export async function runDumpScript(ctx: RunContext, args: readonly string[], label: string): Promise<void> {
  const key = ctx.env.efbaseApiKey;
  if (!key) throw fail("EFBASE_API_KEY is not set in the worker's environment — no request was made");
  const last = new LastLines();
  let blockedLine: string | null = null;
  // Test mode: the fake source serves its CDN on its own (loopback) origin; the script accepts image URLs
  // there only with --allow-host AND SYNC_TEST_MODE=1 in its environment. A real run passes neither.
  const testArgs = ctx.env.testMode
    ? ["--allow-host", testAllowHost(ctx.env.apiBase), ...(ctx.env.testThirdPartyBase ? ["--allow-third-party-host", testAllowHost(ctx.env.testThirdPartyBase)] : [])]
    : [];
  const res = await ctx.runChild(ctx.env.python, [DUMP_SCRIPT, "--key-from-env", "--api-base", ctx.env.apiBase, ...testArgs, ...args], {
    env: childEnv(ctx.env, { EFBASE_API_KEY: key, ...(ctx.env.testMode ? { SYNC_TEST_MODE: "1" } : {}) }),
    cwd: REPO_ROOT,
    label,
    onLine: (stream, line) => {
      last.push(line);
      if (stream === "stderr" && BLOCKED_LINE.test(line)) blockedLine = line;
    },
  });
  afterChild(ctx, res, `the ${label} step`);
  if (res.code === 0) return;
  if (res.code === 2 && blockedLine !== null) {
    const what = (blockedLine as string).replace(/^BLOCKED: /, "").replace(/ — stopped.*$/, "");
    throw new RunStop({ status: "BLOCKED", reason: `the source refused a request during the ${label} step (${what})` });
  }
  throw fail(`the ${label} step failed (exit ${res.code ?? res.signal}): ${last.toString() || "no output"}`);
}

/** manifest.json the dump script writes into its --out directory. */
export function readManifest(dir: string): Record<string, unknown> {
  const p = join(dir, "manifest.json");
  if (!existsSync(p)) throw fail(`the dump script wrote no manifest.json in ${dir}`);
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
}

/** A non-negative integer field of a manifest object (0 when absent). */
export function count(obj: unknown, key: string): number {
  const v = (obj as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

/** Lines of a text file the dump script writes (images_new.txt, images_overwritten.txt); [] when absent. */
export function readLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter((l) => l !== "");
}

// ---- image step bookkeeping (third verify W1 / W2) ----

/** Bound of a stored pending-id list (= syncRunStatsSchema's `imagesPendingIds.max`). */
export const MAX_PENDING_IMAGE_IDS = 200_000;

/** Card ids of `cards/<id>_<kind>.webp` paths (emblem paths carry no card id and are left out). */
export function cardIdsOfImagePaths(rels: readonly string[]): number[] {
  const out = new Set<number>();
  for (const rel of rels) {
    const m = /^cards\/(\d+)_(?:transparent|dynamic)\.webp$/.exec(rel);
    if (m && Number.isSafeInteger(Number(m[1]))) out.add(Number(m[1]));
  }
  return [...out];
}

/** What the dump script's image step left in `dir`: card ids whose images failed or were skipped, real / unverified overwrites. */
export function imageStepOutcome(dir: string): { failedRels: string[]; failedIds: number[]; downloadedIds: number[]; overwritten: number; unverified: number } {
  const failedRels = readLines(join(dir, "images_failed.txt"));
  return {
    failedRels,
    failedIds: cardIdsOfImagePaths(failedRels),
    downloadedIds: cardIdsOfImagePaths(readLines(join(dir, "images_new.txt"))),
    overwritten: readLines(join(dir, "images_overwritten.txt")).length,
    unverified: readLines(join(dir, "images_unverified.txt")).length,
  };
}

/**
 * Records that this run's image step finished (`imagesChecked`) and what it
 * still owes: `owed` card ids (failed / skipped images, carried ids it could not
 * compare) become its `imagesPendingIds` for the next run — bounded, logged,
 * never silently dropped. A failed image no longer fails the run (W1).
 */
export function recordOwedImages(ctx: RunContext, owed: Iterable<number>): void {
  const ids = [...new Set(owed)];
  ctx.stats.imagesChecked = true;
  if (ids.length === 0) {
    delete ctx.stats.imagesPendingIds;
    return;
  }
  if (ids.length > MAX_PENDING_IMAGE_IDS) ctx.log(`${ids.length} cards owe images — only the first ${MAX_PENDING_IMAGE_IDS} are kept as pending (a full manual image dump covers the rest)`);
  ctx.stats.imagesPendingIds = ids.slice(0, MAX_PENDING_IMAGE_IDS);
  ctx.log(`${ids.length} cards still owe images (failed, skipped or not reached) — recorded as pending; the next run compares them again`);
}

// ---- upload ----

const usesRealUploadScript = (ctx: RunContext) => ctx.env.uploadCommand[1] === UPLOAD_SCRIPT;

/**
 * Before any request: the real upload needs the bucket credentials and boto3
 * (a missing piece found after the downloads would waste the run). The test
 * stand-in needs nothing.
 */
export async function uploadPreflight(ctx: RunContext): Promise<void> {
  if (!usesRealUploadScript(ctx)) return;
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((k) => !ctx.env.r2Env[k]?.trim());
  if (missing.length > 0) throw fail(`image upload not possible: ${missing.join(", ")} not set in the worker's environment — no request was made`);
  const res = await ctx.runChild(ctx.env.python, ["-c", "import boto3"], { env: childEnv(ctx.env), cwd: REPO_ROOT, label: "preflight" });
  afterChild(ctx, res, "the boto3 check");
  if (res.code !== 0) throw fail(`image upload not possible: ${ctx.env.python} cannot import boto3 (pip install boto3) — no request was made`);
}

export interface UploadSummary {
  ok: number;
  skipped: number;
  errors: number;
}

/**
 * argv of the upload child. The real r2_upload.py always loads a .env file
 * (default `<repo>/.env`, which may hold the database URL and the efootbase
 * key); `--env /dev/null` makes it read none, so it sees only the explicit
 * child environment (`childEnv` + the R2_* values). The test stand-in gets
 * r2_upload.py's other arguments only.
 */
export function uploadArgv(env: Pick<WorkerEnv, "uploadCommand">, imagesDir: string): { cmd: string; args: string[] } {
  const [cmd, ...pre] = env.uploadCommand;
  const real = env.uploadCommand[1] === UPLOAD_SCRIPT;
  return { cmd: cmd!, args: [...pre, ...(real ? ["--env", devNull] : []), "--prefix", imagesDir, "--no-resume"] };
}

/** Uploads every file under `imagesDir` with `--no-resume` (the directory holds only new / changed files). */
export async function runUpload(ctx: RunContext, imagesDir: string): Promise<UploadSummary> {
  const { cmd, args } = uploadArgv(ctx.env, imagesDir);
  const last = new LastLines();
  let summary: UploadSummary | null = null;
  const res = await ctx.runChild(cmd, args, {
    env: childEnv(ctx.env, ctx.env.r2Env),
    cwd: REPO_ROOT,
    label: "upload",
    onLine: (_s, line) => {
      last.push(line);
      const m = /^\s*ok=(\d+) skip_exists=(\d+) error=(\d+)\s*$/.exec(line);
      if (m) summary = { ok: Number(m[1]), skipped: Number(m[2]), errors: Number(m[3]) };
    },
  });
  afterChild(ctx, res, "the upload step");
  if (res.code !== 0) throw fail(`the upload step failed (exit ${res.code ?? res.signal}): ${last.toString() || "no output"}`);
  if (summary === null) throw fail(`the upload step printed no summary line: ${last.toString() || "no output"}`);
  return summary;
}

// ---- seed (full run) ----

/** tsx's CLI as packages/db resolves it (the seed runs with `node <tsx cli> src/seed-efootbase-full.ts`). */
export function tsxCli(): string {
  return createRequire(join(DB_PACKAGE_DIR, "package.json")).resolve("tsx/cli");
}

/**
 * Runs the existing seed (packages/db/src/seed-efootbase-full.ts) as a child
 * with the location variables pointing at the staging files and WITHOUT
 * --prune / --reset-users. No `--env-file`: the environment is `seedChildEnv`.
 * The seed is one transaction, so a failure leaves the catalogue as it was.
 */
/**
 * The seed's own line printed right after its one transaction resolved (= committed):
 * `seed-efootbase-full: done in <n>s` (packages/db/src/seed-efootbase-full.ts; a worker
 * test reads the seed source to keep them in step).
 */
export const SEED_COMMITTED_LINE = /^seed-efootbase-full: done in \d+s$/;

export async function runSeed(ctx: RunContext, locations: Record<string, string>): Promise<void> {
  const last = new LastLines(10);
  let doneLine = false;
  // Not abortable (verify finding W-d): a cancel / time limit / worker stop that arrives during the
  // seed no longer kills it half-way through its one transaction — the seed ends on its own (or after
  // SEED_CHILD_TIMEOUT_MS) and the run records what really happened. The full run wraps this call in
  // ctx.writeCatalogue, so the runner keeps the run RUNNING until the child has ended.
  const res = await ctx.runChild(process.execPath, [tsxCli(), SEED_ENTRY], {
    env: seedChildEnv(ctx.env, locations),
    cwd: DB_PACKAGE_DIR,
    label: "seed",
    abortable: false,
    timeoutMs: SEED_CHILD_TIMEOUT_MS,
    onLine: (stream, line) => {
      last.push(line);
      if (stream === "stdout" && SEED_COMMITTED_LINE.test(line.trim())) doneLine = true;
    },
  });
  // Exit 0, or the seed's own "done" line (printed after its transaction resolved — a seed killed after
  // that line has committed; third verify S5) = committed — also when the run was aborted meanwhile:
  // the runner then never records the run CANCELLED (W3 / W-d), and the caller's next step sees the abort.
  if ((res.ended === "exit" && res.code === 0) || doneLine) {
    ctx.markCommitted("the seed (full catalogue write)");
    if (res.code !== 0) ctx.log(`the seed printed its "done" line (committed) but then ended ${res.ended} (${res.code ?? res.signal}) — counted as committed`);
    return;
  }
  afterChild(ctx, res, "the seed");
  if (res.code !== 0) {
    throw fail(`the seed failed (exit ${res.code ?? res.signal}); the catalogue is unchanged (the seed is one transaction): ${last.toString() || "no output"}`);
  }
}
