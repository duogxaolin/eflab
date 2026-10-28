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

import { mkdtempSync, chmodSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { buildSyncRunItems, isReasonClass, type SyncItemFailure, type SyncItemsInput } from "@eflab/shared/sync-records";
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
/** `PROGRESS <done>/<total>` of `--progress-every` (numbers only); any other line is an ordinary log line. */
export const PROGRESS_LINE = /^PROGRESS (\d{1,10})\/(\d{1,10})$/;
/** Images between two progress lines of the dump's image step / the upload (design D3). */
export const DUMP_PROGRESS_EVERY = 20;
export const UPLOAD_PROGRESS_EVERY = 50;

/** done / total of a progress line (already redacted, like every child line), or null. */
export function parseProgressLine(line: string): { done: number; total: number } | null {
  const m = PROGRESS_LINE.exec(line.trim());
  if (!m) return null;
  const done = Number(m[1]);
  const total = Number(m[2]);
  return Number.isSafeInteger(done) && Number.isSafeInteger(total) && done <= total ? { done, total } : null;
}

export interface ImageStepOptions {
  /** Absolute path for `--results-file` (inside the run directory). */
  resultsFile?: string;
  /** Called for every `PROGRESS` line (with `--progress-every DUMP_PROGRESS_EVERY`). */
  onProgress?: (done: number, total: number) => void;
}

export async function runDumpScript(ctx: RunContext, args: readonly string[], label: string, image?: ImageStepOptions): Promise<void> {
  const key = ctx.env.efbaseApiKey;
  if (!key) throw fail("EFBASE_API_KEY is not set in the worker's environment — no request was made");
  const last = new LastLines();
  let blockedLine: string | null = null;
  // Test mode: the fake source serves its CDN on its own (loopback) origin; the script accepts image URLs
  // there only with --allow-host AND SYNC_TEST_MODE=1 in its environment. A real run passes neither.
  const testArgs = ctx.env.testMode
    ? ["--allow-host", testAllowHost(ctx.env.apiBase), ...(ctx.env.testThirdPartyBase ? ["--allow-third-party-host", testAllowHost(ctx.env.testThirdPartyBase)] : [])]
    : [];
  // Image step only (admin-sync-live-progress): progress lines and the per-image results file.
  const imageArgs = image
    ? [...(image.onProgress ? ["--progress-every", String(DUMP_PROGRESS_EVERY)] : []), ...(image.resultsFile ? ["--results-file", image.resultsFile] : [])]
    : [];
  const res = await ctx.runChild(ctx.env.python, [DUMP_SCRIPT, "--key-from-env", "--api-base", ctx.env.apiBase, ...testArgs, ...imageArgs, ...args], {
    env: childEnv(ctx.env, { EFBASE_API_KEY: key, ...(ctx.env.testMode ? { SYNC_TEST_MODE: "1" } : {}) }),
    cwd: REPO_ROOT,
    label,
    onLine: (stream, line) => {
      if (stream === "stdout" && image?.onProgress) {
        const p = parseProgressLine(line);
        if (p) {
          image.onProgress(p.done, p.total);
          return; // logged by runChild already; not one of the "last lines" of an error
        }
      }
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
export function imageStepOutcome(dir: string): {
  failedRels: string[];
  failedIds: number[];
  downloadedIds: number[];
  overwritten: number;
  unverified: number;
  /** The file lists themselves (admin-sync-live-progress: the items record), read before the run directory goes. */
  downloadedRels: string[];
  overwrittenRels: string[];
  unverifiedRels: string[];
} {
  const failedRels = readLines(join(dir, "images_failed.txt"));
  const downloadedRels = readLines(join(dir, "images_new.txt"));
  const overwrittenRels = readLines(join(dir, "images_overwritten.txt"));
  const unverifiedRels = readLines(join(dir, "images_unverified.txt"));
  return {
    failedRels,
    failedIds: cardIdsOfImagePaths(failedRels),
    downloadedIds: cardIdsOfImagePaths(downloadedRels),
    overwritten: overwrittenRels.length,
    unverified: unverifiedRels.length,
    downloadedRels,
    overwrittenRels,
    unverifiedRels,
  };
}

// ---- results files (admin-sync-live-progress, design D4) ----

/** Outcomes of a results file that are not failures. */
const NOT_FAILED = new Set(["ok", "not_modified", "skipped_exists"]);

/** Longest key of a results file kept as a record (it is counted; whether it is LISTED is `isSyncItemPath`'s decision). */
const RESULT_KEY_MAX = 4_096;

/**
 * One results file (`--results-file` of the dump's image step: `{path, outcome}`
 * lines; of the upload: `{key, outcome}`), read leniently: a line that is not a
 * JSON object with a string key (≤ 4,096 characters) and an outcome that is
 * either a success word or a reason class (`isReasonClass`) is skipped and
 * counted in `skipped` (the caller logs it). Whether a key is LISTED in the
 * record is decided by `buildSyncRunItems` with `isSyncItemPath` — the same test
 * as the schema — so a key that is not a record path is counted in its group's
 * total but never stored. Missing file → `present: false`.
 */
export function readResultsFile(path: string, keyField: "path" | "key"): { present: boolean; records: Array<{ path: string; outcome: string }>; skipped: number } {
  if (!existsSync(path)) return { present: false, records: [], skipped: 0 };
  const records: Array<{ path: string; outcome: string }> = [];
  let skipped = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    const p = (rec as Record<string, unknown> | null)?.[keyField];
    const o = (rec as Record<string, unknown> | null)?.outcome;
    if (typeof p === "string" && p.length <= RESULT_KEY_MAX && typeof o === "string" && (NOT_FAILED.has(o) || isReasonClass(o))) records.push({ path: p, outcome: o });
    else skipped++;
  }
  return { present: true, records, skipped };
}

/** What an upload's results file says: the keys stored (`ok`) and the failures with their class. */
export function readUploadResults(path: string): { present: boolean; uploaded: string[]; uploadFailed: SyncItemFailure[]; skipped: number } {
  const r = readResultsFile(path, "key");
  return { present: r.present, uploaded: r.records.filter((x) => x.outcome === "ok").map((x) => x.path), uploadFailed: failuresOf(r.records), skipped: r.skipped };
}

/** Failures (reason class ≠ a success word) of a results file's records. */
export function failuresOf(records: ReadonlyArray<{ path: string; outcome: string }>): SyncItemFailure[] {
  return records.filter((r) => !NOT_FAILED.has(r.outcome)).map((r) => ({ path: r.path, reason: r.outcome }));
}

/**
 * Orders card ids / image paths newest first: `rank` maps a card id to its
 * position in the run's newest-first card order; image paths follow their card
 * (dynamic before transparent), unknown cards after, emblems and anything else
 * last (by name). Nothing is dropped here: `buildSyncRunItems` lists only record
 * paths (`isSyncItemPath`) and counts the rest.
 */
export function newestFirstPaths(paths: Iterable<string>, rank: ReadonlyMap<number, number>): string[] {
  const key = (p: string): [number, number, string] => {
    const m = /^cards\/(\d+)_(dynamic|transparent)\.webp$/.exec(p);
    if (m) return [rank.get(Number(m[1])) ?? Number.MAX_SAFE_INTEGER - 1, m[2] === "dynamic" ? 0 : 1, p];
    return [Number.MAX_SAFE_INTEGER, 0, p];
  };
  return [...new Set(paths)]
    .map((p) => [key(p), p] as const)
    .sort(([a], [b]) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))
    .map(([, p]) => p);
}

/** Failure entries in the order of `newestFirstPaths`. */
export function newestFirstFailures(entries: ReadonlyArray<SyncItemFailure>, rank: ReadonlyMap<number, number>): SyncItemFailure[] {
  const byPath = new Map<string, SyncItemFailure>();
  for (const e of entries) if (!byPath.has(e.path)) byPath.set(e.path, e);
  return newestFirstPaths(byPath.keys(), rank).map((p) => byPath.get(p)!);
}

/**
 * The image part of the items record from an image step's directory and results
 * file (read BEFORE the run directory is removed): downloaded / overwritten /
 * unverified from the script's own lists, failed = every image of the results
 * file with a failure class (an image the source does not have reads `http_404`
 * — listed, but neither counted in "Images failed" nor owed: the next run would
 * meet the same 404), plus any `images_failed.txt` entry the results file does
 * not cover (reason `other`).
 *
 * A step that was STOPPED (cancel, time limit, worker stop: the child got
 * SIGTERM) wrote no list: `downloaded` is then the image files actually stored
 * under `<dir>/images/` (written whole through a `.part` rename, so a present
 * file is a complete download); overwritten / unverified are not known then.
 */
export function imageItems(dir: string, resultsFile: string | null, rank: ReadonlyMap<number, number>): Pick<SyncItemsInput, "downloaded" | "overwritten" | "unverified" | "failed"> {
  const step = imageStepOutcome(dir);
  const results = resultsFile ? readResultsFile(resultsFile, "path") : { present: false, records: [], skipped: 0 };
  const failed = failuresOf(results.records);
  const covered = new Set(failed.map((f) => f.path));
  for (const rel of step.failedRels) if (!covered.has(rel)) failed.push({ path: rel, reason: "other" });
  const listed = existsSync(join(dir, "images_new.txt"));
  return {
    downloaded: newestFirstPaths(listed ? step.downloadedRels : storedImageFiles(join(dir, "images")), rank),
    overwritten: newestFirstPaths(step.overwrittenRels, rank),
    unverified: newestFirstPaths(step.unverifiedRels, rank),
    failed: newestFirstFailures(failed, rank),
  };
}

/** Relative paths of the complete image files under `imagesDir` (no `.part`, no link followed); [] when absent. */
export function storedImageFiles(imagesDir: string): string[] {
  if (!existsSync(imagesDir)) return [];
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) walk(join(d, ent.name), `${rel}${ent.name}/`);
      else if (ent.isFile() && !ent.name.endsWith(".part")) out.push(`${rel}${ent.name}`);
    }
  };
  walk(imagesDir, "");
  return out;
}

/**
 * When the image step or the upload ENDED EARLY (blocked, failed, cancelled, time
 * limit, worker stop): records what it had fetched — the image lists / the files
 * on disk and the results files as far as they were written — so the run's final
 * record shows them (verify W2). Call it before the run directory is removed and
 * re-throw the original error afterwards: it never throws itself and only sets
 * the in-memory record (the runner writes it in its final update, guarded by
 * `status = 'RUNNING'`; nothing about cancel-versus-commit changes).
 */
export function recordStoppedStep(
  ctx: RunContext,
  found: SyncItemsInput,
  rank: ReadonlyMap<number, number>,
  step: { imageDir?: string; imageResults?: string; uploadResults?: string },
  what: string,
): void {
  try {
    if (step.imageDir) Object.assign(found, imageItems(step.imageDir, step.imageResults ?? null, rank));
    if (step.uploadResults) {
      const up = readUploadResults(step.uploadResults);
      if (up.present) {
        found.uploaded = newestFirstPaths(up.uploaded, rank);
        found.uploadFailed = newestFirstFailures(up.uploadFailed, rank);
      }
    }
    ctx.recordItems(buildSyncRunItems(found));
    ctx.log(
      `${what} ended early — the record keeps what it had done: ${found.downloaded?.length ?? 0} images downloaded, ${found.failed?.length ?? 0} not stored` +
        (step.uploadResults ? `, ${found.uploaded?.length ?? 0} uploaded, ${found.uploadFailed?.length ?? 0} uploads failed` : ""),
    );
  } catch (e) {
    ctx.log(`${what} ended early — its file lists could not be read (${(e as Error).message}); the record keeps what was known before it`);
  }
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
export function uploadArgv(
  env: Pick<WorkerEnv, "uploadCommand">,
  imagesDir: string,
  opts: { resultsFile?: string; progressEvery?: number } = {},
): { cmd: string; args: string[] } {
  const [cmd, ...pre] = env.uploadCommand;
  const real = env.uploadCommand[1] === UPLOAD_SCRIPT;
  // admin-sync-live-progress: the opt-in flags go before --prefix, so the call's last arguments stay as they were
  const live = [...(opts.progressEvery ? ["--progress-every", String(opts.progressEvery)] : []), ...(opts.resultsFile ? ["--results-file", opts.resultsFile] : [])];
  return { cmd: cmd!, args: [...pre, ...(real ? ["--env", devNull] : []), ...live, "--prefix", imagesDir, "--no-resume"] };
}

export interface UploadOutcome extends UploadSummary {
  /** Keys the results file reports uploaded / failed (empty when the command wrote no results file). */
  uploaded: string[];
  uploadFailed: SyncItemFailure[];
}

/**
 * Uploads every file under `imagesDir` with `--no-resume` (the directory holds only new / changed files),
 * with `--progress-every` (→ `onProgress`) and a results file in `runDir` (read here, before the run
 * directory is removed — admin-sync-live-progress).
 */
export async function runUpload(ctx: RunContext, imagesDir: string, runDir?: string, onProgress?: (done: number, total: number) => void): Promise<UploadOutcome> {
  const resultsFile = runDir ? uploadResultsFile(runDir) : undefined;
  const { cmd, args } = uploadArgv(ctx.env, imagesDir, { resultsFile, progressEvery: onProgress ? UPLOAD_PROGRESS_EVERY : undefined });
  const last = new LastLines();
  let summary: UploadSummary | null = null;
  const res = await ctx.runChild(cmd, args, {
    env: childEnv(ctx.env, ctx.env.r2Env),
    cwd: REPO_ROOT,
    label: "upload",
    onLine: (stream, line) => {
      if (stream === "stdout" && onProgress) {
        const p = parseProgressLine(line);
        if (p) {
          onProgress(p.done, p.total);
          return;
        }
      }
      last.push(line);
      const m = /^\s*ok=(\d+) skip_exists=(\d+) error=(\d+)\s*$/.exec(line);
      if (m) summary = { ok: Number(m[1]), skipped: Number(m[2]), errors: Number(m[3]) };
    },
  });
  afterChild(ctx, res, "the upload step");
  if (res.code !== 0) throw fail(`the upload step failed (exit ${res.code ?? res.signal}): ${last.toString() || "no output"}`);
  if (summary === null) throw fail(`the upload step printed no summary line: ${last.toString() || "no output"}`);
  const results = resultsFile ? readUploadResults(resultsFile) : { present: false, uploaded: [], uploadFailed: [], skipped: 0 };
  if (results.skipped > 0) ctx.log(`upload results: ${results.skipped} line(s) that are not {key, outcome} with an outcome class were left out`);
  return { ...(summary as UploadSummary), uploaded: results.uploaded, uploadFailed: results.uploadFailed };
}

/** The upload's results file in a run directory (`runUpload` writes it there; read again by `recordStoppedStep`). */
export const uploadResultsFile = (runDir: string): string => join(runDir, "upload_results.jsonl");

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
