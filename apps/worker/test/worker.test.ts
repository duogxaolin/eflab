// Worker tests (openspec change admin-sync-worker, tasks 5.1–5.3 and the test
// harness of 5.6; the incremental and full runs are tested in
// incremental.test.ts and full.test.ts, each on its own scratch database).
// Same assert-style runner as the other packages' tests.
//
// Safety: the source is the local fake server (test/harness/fake-efootbase.ts,
// 127.0.0.1, ephemeral port), asserted to be loopback before any request; a
// global fetch guard refuses every other host; uploads go to the stand-in
// command; the database is the scratch database `eflab_synctest_core` (created,
// migrated and dropped here — the live database is never connected to). The
// real key / bucket values never enter this process: only DATABASE_URL is read
// from the repo-root .env, to derive the scratch URL. Skips the database part
// with a message when the local Postgres is unreachable.
//
// Run: pnpm --filter @eflab/worker test   (part of `pnpm test:unit`)

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { REDACTION_MASK, SYNC_BLOCK_HOURS, SYNC_STALE_RUN_MS, makeRedactor, type SyncRunStats } from "@eflab/shared";
import { CHILD_KILL_GRACE_MS, runChild } from "../src/child.js";
import {
  CANCEL_POLL_MS,
  CATALOGUE_WRITE_TX_MAX_WAIT_MS,
  CATALOGUE_WRITE_TX_TIMEOUT_MS,
  CATALOGUE_WRITE_WAIT_MS,
  RUN_HEARTBEAT_MS,
  SYNC_TIME_LIMITS_MS,
  WORKER_TICK_MS,
} from "../src/limits.js";
import {
  EFOOTBASE_API_BASE,
  EFOOTBASE_CDN_BASE,
  EFOOTBASE_KEY_HEADER,
  EFOOTBASE_USER_AGENT,
  PESDB_IMAGE_BASE,
  isLoopbackHost,
  resolveSourceBase,
  sourceImageUrlAllowed,
  testAllowHost,
} from "../src/efootbase.js";
import { CHILD_ENV_ALLOWLIST, DB_PACKAGE_DIR, DUMP_SCRIPT, SEED_ENTRY, UPLOAD_SCRIPT, assertTestDatabase, childEnv, collectSecrets, loadWorkerEnv } from "../src/env.js";
import * as scriptsModule from "../src/scripts.js";
import { runSeed, uploadArgv } from "../src/scripts.js";
// via the namespace so this file also runs (and fails meaningfully) against code without the marker
const SEED_COMMITTED_LINE = (scriptsModule as { SEED_COMMITTED_LINE?: RegExp }).SEED_COMMITTED_LINE ?? /(?!)/;
import { checkRowId, checkSourceImages } from "../src/catalogue.js";
import { startFakeSource, generateRows, type FakeSource } from "./harness/fake-efootbase.js";
import { setupScratchDb } from "./harness/scratch-db.js";
import { TEST_SECRETS, guardFetch, workerTestEnv } from "./harness/test-env.js";

process.env.NODE_ENV = "test";
process.env.SYNC_TEST_MODE = "1";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const throws = (fn: () => unknown, re?: RegExp): boolean => {
  try {
    fn();
    return false;
  } catch (e) {
    return re ? re.test((e as Error).message) : true;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const fetchGuard = guardFetch();

// ======================================================================
// Part 1 — no database
// ======================================================================

// 1.1 The request identity is the dump script's (constants duplicated on purpose).
{
  const py = readFileSync(DUMP_SCRIPT, "utf8");
  const ua = /^UA = "(.*)"$/m.exec(py)?.[1];
  const base = /^API_BASE = "(.*)"$/m.exec(py)?.[1];
  const header = /req = urllib\.request\.Request\(url, headers=\{\s*"([^"]+)": key,/m.exec(py)?.[1];
  assert(ua !== undefined && ua === EFOOTBASE_USER_AGENT, "user agent = UA in scripts/efootbase_dump.py");
  assert(base !== undefined && base === EFOOTBASE_API_BASE, "default API base = API_BASE in scripts/efootbase_dump.py");
  assert(header !== undefined && header === EFOOTBASE_KEY_HEADER, "key header = the header http_get sends in scripts/efootbase_dump.py");
  const cdnBase = /^CDN_BASE = "(.*)"$/m.exec(py)?.[1];
  const pesdbBase = /^PESDB_IMAGE_BASE = "(.*)"$/m.exec(py)?.[1];
  assert(cdnBase === EFOOTBASE_CDN_BASE && pesdbBase === PESDB_IMAGE_BASE, "image host bases = CDN_BASE / PESDB_IMAGE_BASE in scripts/efootbase_dump.py (the script's own allow-list)");
  const real = { testMode: false, apiBase: EFOOTBASE_API_BASE };
  const test = { testMode: true, apiBase: "http://127.0.0.1:4555/api" };
  const ok = (u: string, k: "transparent" | "dynamic" | "emblems", e = real) => sourceImageUrlAllowed(u, k, e);
  assert(
    ok(`${EFOOTBASE_CDN_BASE}/cards/1_dynamic.webp`, "dynamic") && ok(`${EFOOTBASE_CDN_BASE}/cards/1_transparent.webp`, "transparent") &&
      ok(`${PESDB_IMAGE_BASE}/assets/img/card/t1.png`, "transparent") && ok(`${EFOOTBASE_CDN_BASE}/emblems/team/a.png`, "emblems") &&
      ok("https://CDN.ASSETS.EFOOTBASE.COM/x.webp", "dynamic") && ok("https://cdn.assets.efootbase.com:443/x.webp", "dynamic"),
    "source image allow-list: efootbase CDN (every kind), pesdb.net /assets/img/ (transparent only); case and an explicit :443 as Python accepts them",
  );
  const refusedCases = [
    [`${PESDB_IMAGE_BASE}/assets/img/card/t1.png`, "dynamic"], [`${PESDB_IMAGE_BASE}/other/t1.png`, "transparent"], [`${PESDB_IMAGE_BASE}/x.png`, "emblems"],
    ["http://cdn.assets.efootbase.com/x.webp", "dynamic"], ["https://cdn.assets.efootbase.com:8443/x.webp", "dynamic"],
    ["https://u@cdn.assets.efootbase.com/x.webp", "dynamic"], ["https://cdn.assets.efootbase.com.evil.example/x.webp", "dynamic"],
    ["file:///etc/hosts", "dynamic"], ["http://127.0.0.1:4555/cdn/x.webp", "dynamic"],
    ["https://cdn.assets.efootbase.com\\@evil.example/x.webp", "dynamic"], ["https://cdn.assets.efootbase。com/x.webp", "dynamic"],
    ["https://cdn%2Eassets.efootbase.com/x.webp", "dynamic"], ["https://cdn.assets.efootbase.com./x.webp", "dynamic"], ["https://cdn.assets.efootbase.com/a b.webp", "dynamic"],
    // third verify S3: percent signs and dot segments in the raw path
    [`${PESDB_IMAGE_BASE}/assets/img/../secret.png`, "transparent"], [`${PESDB_IMAGE_BASE}/assets/img/%2e%2e/x.png`, "transparent"],
    ["https://cdn.assets.efootbase.com/cards/./1.webp", "dynamic"], ["https://cdn.assets.efootbase.com/cards/a%2Fb.webp", "dynamic"], ["https://cdn.assets.efootbase.com/emblems/team/../x.png", "emblems"],
  ] as const;
  const wronglyAllowed = refusedCases.filter(([u, k]) => ok(u, k)).map(([u, k]) => `${k} ${u}`);
  assert(wronglyAllowed.length === 0, `source image allow-list refuses pesdb outside transparent /assets/img/, http, other ports, user-info, look-alikes, file://, backslash, full-width dot, %-encoded host, trailing dot, spaces (wrongly allowed: ${wronglyAllowed.join("; ") || "none"})`);
  assert(ok("http://127.0.0.1:4555/cdn/x.webp", "dynamic", test) && !ok("http://127.0.0.1:4556/cdn/x.webp", "dynamic", test) && !ok(`${EFOOTBASE_CDN_BASE}/x.webp`, "dynamic", test), "test mode: only the fake source's own origin");
  const testTp = { ...test, testThirdPartyBase: "http://127.0.0.1:4566" };
  assert(
    sourceImageUrlAllowed("http://127.0.0.1:4566/t/1.png", "transparent", testTp) && !sourceImageUrlAllowed("http://127.0.0.1:4566/t/1.png", "dynamic", testTp) && !sourceImageUrlAllowed("http://127.0.0.1:4566/t/1.png", "emblems", testTp),
    "test mode: the stand-in third-party host (like pesdb.net) only for transparent renders",
  );
  const shapeRefused = (row: Record<string, unknown>) => throws(() => checkSourceImages(row as never, real));
  assert(
    shapeRefused({ id: 1, card_images: "x" }) && shapeRefused({ id: 1, card_images: [] as unknown[] , emblem_images: "x" }) && shapeRefused({ id: 1, emblem_images: ["x"] }) && shapeRefused({ id: 1, card_images: { dynamic: { a: 1 } } }) &&
      !shapeRefused({ id: 1, card_images: { dynamic: false, transparent: 0 }, emblem_images: null }),
    "checkSourceImages: non-object card_images / emblem_images and non-string URLs refused; falsy values mean none (as in the dump script)",
  );
  assert(throws(() => checkRowId({ id: 0 } as never, 0)) && throws(() => checkRowId({ id: -1 } as never, 0)) && throws(() => checkRowId(["x"] as never, 0)) && !throws(() => checkRowId({ id: 7 } as never, 0)), "checkRowId: positive integer ids only, rows must be objects");
  assert(testAllowHost("http://127.0.0.1:4555/api") === "127.0.0.1:4555", "test mode --allow-host = the fake source's host:port");
}

// 1.1b Limits pinned (tamper guard): per-kind wall clock, kill grace, cancel → end ≤ 15 s, tick ≤ 30 s.
{
  assert(SYNC_TIME_LIMITS_MS.CHECK === 30_000 && SYNC_TIME_LIMITS_MS.INCREMENTAL === 1_800_000 && SYNC_TIME_LIMITS_MS.FULL === 21_600_000, "time limits: check 30 s, incremental 30 min, full 6 h");
  assert(CHILD_KILL_GRACE_MS === 10_000, "SIGTERM → SIGKILL grace: 10 s");
  assert(CANCEL_POLL_MS + CHILD_KILL_GRACE_MS <= 15_000, "cancel poll + kill grace ≤ 15 s (children end within ~15 s of a cancel)");
  assert(WORKER_TICK_MS === 30_000 && RUN_HEARTBEAT_MS < 30_000, "idle tick every 30 s; run heartbeat more often than every 30 s");
  assert(
    CATALOGUE_WRITE_TX_MAX_WAIT_MS + CATALOGUE_WRITE_TX_TIMEOUT_MS < CATALOGUE_WRITE_WAIT_MS && CATALOGUE_WRITE_TX_TIMEOUT_MS < SYNC_TIME_LIMITS_MS.INCREMENTAL,
    "W3: the write transaction's max wait + timeout < how long the runner holds an abandoned run for it; timeout < the incremental time limit",
  );
}

// 1.2 Source / database guards in test mode.
{
  const t = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
  assert(throws(() => resolveSourceBase(t), /required in test mode/), "test mode: a missing EFBASE_API_BASE (= the real source) is refused");
  assert(throws(() => resolveSourceBase({ ...t, EFBASE_API_BASE: EFOOTBASE_API_BASE }), /loopback/), "test mode: the real API base is refused");
  assert(throws(() => resolveSourceBase({ SYNC_TEST_MODE: "1", EFBASE_API_BASE: "http://10.0.0.5:9/api" }), /loopback/), "SYNC_TEST_MODE=1: a LAN address is refused");
  assert(resolveSourceBase({ ...t, EFBASE_API_BASE: "http://127.0.0.1:9/api/" }) === "http://127.0.0.1:9/api", "test mode: loopback base accepted, trailing slash dropped");
  assert(resolveSourceBase({ NODE_ENV: "production" }) === EFOOTBASE_API_BASE, "production without EFBASE_API_BASE: the real base");
  assert(isLoopbackHost("localhost") && isLoopbackHost("127.0.0.1") && isLoopbackHost("[::1]") && !isLoopbackHost("api2.efootbase.com"), "loopback host detection");
  assert(throws(() => assertTestDatabase({ ...t, DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/eflab" }), /scratch database/), "test mode: a non-scratch database name is refused");
  assert(throws(() => assertTestDatabase({ ...t, DATABASE_URL: "postgresql://u:p@db.example.com:5432/eflab_synctest" }), /loopback/), "test mode: a remote database host is refused");
  assert(!throws(() => assertTestDatabase({ ...t, DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/eflab_synctest" })), "test mode: the local scratch database is accepted");
  assert(
    throws(() => loadWorkerEnv({ ...t, DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/eflab_synctest", EFBASE_API_BASE: "http://127.0.0.1:9/api" }), /SYNC_R2_UPLOAD_CMD/),
    "test mode: the real upload script is refused (a stand-in is required)",
  );
}

// 1.3 Secrets and the child environment.
{
  const env = {
    DATABASE_URL: "postgresql://eflab:p%40ss%2Fw0rd-xyz@127.0.0.1:5433/eflab_synctest",
    EFBASE_API_KEY: "k-123456789",
    R2_SECRET_ACCESS_KEY: "r2-secret-abcdef",
    R2_ACCESS_KEY_ID: "r2-id-abcdef",
    OTHER: "not-a-secret",
  } as NodeJS.ProcessEnv;
  const s = collectSecrets(env);
  assert(s.includes("k-123456789") && s.includes("r2-secret-abcdef") && s.includes("r2-id-abcdef"), "secrets: the key and every R2_* value");
  assert(s.includes("p%40ss%2Fw0rd-xyz") && s.includes("p@ss/w0rd-xyz"), "secrets: the database password, raw and decoded");
  assert(!s.includes("not-a-secret"), "secrets: unrelated variables are not masked");
  const r = makeRedactor(s);
  assert(!r("connect p@ss/w0rd-xyz k-123456789").includes("p@ss/w0rd-xyz"), "redactor masks the decoded password");
  const w = loadWorkerEnv(workerTestEnv({ databaseUrl: "postgresql://u:pw-1234567@127.0.0.1:5433/eflab_synctest", apiBase: "http://127.0.0.1:9/api", uploadDest: "/nonexistent" }));
  const ce = childEnv(w, { EFBASE_API_KEY: "x" });
  const allowed = new Set<string>([...CHILD_ENV_ALLOWLIST, "PYTHONUNBUFFERED", "PYTHONIOENCODING", "EFBASE_API_KEY"]);
  assert(Object.keys(ce).every((k) => allowed.has(k)), "child env: only the allow-list, Python output settings and the given extra");
  assert(!("DATABASE_URL" in ce) && !("R2_SECRET_ACCESS_KEY" in ce), "child env: no database URL, no bucket secret unless given");
  assert(throws(() => childEnv(w, { DATABASE_URL: "x" }), /never passed/), "child env: DATABASE_URL can never be passed");
}

// 1.3a Encoded secret forms and the short-key refusal (verify finding W6).
{
  const pwRaw = "p%2Bss%2Fw0rd%3D%40x"; // URL form of the synthetic password "p+ss/w0rd=@x"
  const env = { DATABASE_URL: `postgresql://eflab:${pwRaw}@127.0.0.1:5433/eflab_synctest`, EFBASE_API_KEY: "k3y+with/slash=and space-Z9" } as NodeJS.ProcessEnv;
  const s = collectSecrets(env);
  assert(s.includes(pwRaw) && s.includes("p+ss/w0rd=@x") && s.includes(encodeURIComponent("p+ss/w0rd=@x")), "secrets: the database password raw, decoded and re-encoded");
  const r = makeRedactor(s);
  const probes = [
    "k3y%2Bwith%2Fslash%3Dand%20space-Z9",
    "k3y%2bwith%2fslash%3dand%20space-Z9",
    Buffer.from("k3y+with/slash=and space-Z9").toString("base64"),
    Buffer.from("k3y+with/slash=and space-Z9").toString("base64url"),
    Buffer.from("p+ss/w0rd=@x").toString("base64"),
    "p%2bss%2fw0rd%3d%40x",
  ];
  const leaked = probes.filter((p) => r(`line ${p} end`).includes(p));
  assert(leaked.length === 0, `redactor masks the URL-encoded / base64 forms of the key and the database password (leaked: ${leaked.join(", ") || "none"})`);
  // a password given only as a query parameter (second verify)
  const qs = collectSecrets({ DATABASE_URL: "postgresql://eflab@127.0.0.1:5433/eflab_synctest?password=qs%2Bpass-only-77&sslmode=disable" } as NodeJS.ProcessEnv);
  assert(qs.includes("qs%2Bpass-only-77") && qs.includes("qs+pass-only-77"), `secrets: a ?password= query parameter of DATABASE_URL, raw and decoded (${qs.length} values)`);
  const prod = { NODE_ENV: "production", PATH: process.env.PATH, HOME: process.env.HOME } as NodeJS.ProcessEnv;
  assert(throws(() => loadWorkerEnv({ ...prod, EFBASE_API_KEY: "short7x" }), /EFBASE_API_KEY.*shorter than 8/), "a real worker refuses to start with an EFBASE_API_KEY shorter than 8 characters (it could not be redacted)");
  assert(!throws(() => loadWorkerEnv({ ...prod, EFBASE_API_KEY: "long-enough-key" })), "an 8+ character key is accepted");
  assert(
    !throws(() => loadWorkerEnv({ ...workerTestEnv({ databaseUrl: "postgresql://u:p@127.0.0.1:5433/eflab_synctest", apiBase: "http://127.0.0.1:9/api", uploadDest: "/nonexistent" }), EFBASE_API_KEY: "short" })),
    "test mode: a short synthetic key is allowed",
  );
}

// 1.3b The real upload script reads no .env file (r2_upload.py would otherwise load <repo>/.env:
//      the database URL and, in a single-file setup, the efootbase key). Never contacts the bucket.
{
  const real = loadWorkerEnv({ NODE_ENV: "production", PATH: process.env.PATH, HOME: process.env.HOME });
  const a = uploadArgv(real, "/x/images");
  const i = a.args.indexOf("--env");
  assert(a.cmd === real.python && a.args[0] === UPLOAD_SCRIPT && i > 0 && a.args[i + 1] === devNull, `real upload: r2_upload.py --env ${devNull} (${a.args.join(" ")})`);
  assert(a.args.slice(-3).join(" ") === "--prefix /x/images --no-resume", "real upload: --prefix <dir> --no-resume");
  const stand = loadWorkerEnv(workerTestEnv({ databaseUrl: "postgresql://u:p@127.0.0.1:5433/eflab_synctest", apiBase: "http://127.0.0.1:9/api", uploadDest: "/nonexistent" }));
  assert(!uploadArgv(stand, "/x").args.includes("--env"), "stand-in upload: no --env argument");
  const probe = await new Promise<{ code: number | null; out: string }>((res) => {
    const empty = mkdtempSync(join(tmpdir(), "eflab-synctest-upload-"));
    // Dry run with no R2_* in the environment: with --env /dev/null it must stop at "missing env"
    // before any client is made (with the repo-root .env loaded it would find the owner's values).
    const c = spawn(real.python, [...uploadArgv(real, empty).args, "--dry-run"], { shell: false, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } });
    let out = "";
    c.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
    c.stderr.on("data", (b: Buffer) => (out += b.toString("utf8")));
    c.on("error", (e) => res({ code: null, out: e.message }));
    c.on("close", (code) => {
      rmSync(empty, { recursive: true, force: true });
      res({ code, out });
    });
  });
  if (/No module named ['"]?boto3/.test(probe.out)) console.log("SKIP: r2_upload.py --env probe (python3 has no boto3)");
  else assert(probe.code === 1 && /missing env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/.test(probe.out), `real upload with --env ${devNull}: the repo-root .env is not read (exit ${probe.code})`);
}

// 1.3c S5 (third verify): the seed's own "done" line proves its commit even when the child is then
//      killed (time limit) — the run must not report the seed as failed / the catalogue as unchanged.
{
  const marks: string[] = [];
  const stubEnv = loadWorkerEnv(workerTestEnv({ databaseUrl: "postgresql://u:pw-1234567@127.0.0.1:5433/eflab_synctest", apiBase: "http://127.0.0.1:9/api", uploadDest: "/nonexistent" }));
  const stub = {
    env: stubEnv,
    signal: new AbortController().signal,
    log: () => undefined,
    markCommitted: (w: string) => marks.push(w),
    runChild: async (_c: string, _a: readonly string[], o: { onLine?: (s: "stdout" | "stderr", l: string) => void }) => {
      o.onLine?.("stdout", "");
      o.onLine?.("stdout", "seed-efootbase-full: done in 41s");
      return { code: null, signal: "SIGTERM" as NodeJS.Signals, ended: "timeout" as const, killed: false, durationMs: 1 };
    },
  } as unknown as import("../src/runner.js").RunContext;
  let err: string | null = null;
  try {
    await runSeed(stub, {});
  } catch (e) {
    err = (e as Error).message;
  }
  assert(err === null && marks.length === 1, `S5: a seed killed after its "done" line counts as committed (error: ${err ?? "none"}, marks ${marks.length})`);
  const seedSrc = readFileSync(join(DB_PACKAGE_DIR, SEED_ENTRY), "utf8");
  assert(/console\.log\(`\\nseed-efootbase-full: done in \$\{/.test(seedSrc) && SEED_COMMITTED_LINE.test("seed-efootbase-full: done in 41s") && !SEED_COMMITTED_LINE.test("seed-efootbase-full: FAILED (nothing committed …)"),
    "S5: the marker matches the seed's own line, printed after its transaction resolved");
}

// 1.4 Child helper: argument arrays (no shell), redaction per line, SIGTERM, SIGKILL after the grace period, spawn errors.
{
  const lines: string[] = [];
  const ctl = new AbortController();
  const red = makeRedactor(["SECRET-VALUE-42"]);
  const r1 = await runChild({
    command: process.execPath,
    args: ["-e", "process.stdout.write('a SECRET-VALUE-42 b\\npartial'); setTimeout(()=>process.stdout.write(' line\\n'),50); console.error('err; $(echo injected)')"],
    env: { PATH: process.env.PATH ?? "" },
    signal: ctl.signal,
    redact: red,
    onLine: (stream, l) => lines.push(`${stream}:${l}`),
  });
  assert(r1.ended === "exit" && r1.code === 0, "child: normal exit");
  assert(lines.includes(`stdout:a ${REDACTION_MASK} b`), "child: the secret is masked before the line is delivered");
  assert(lines.includes("stdout:partial line"), "child: a line split across chunks is delivered whole");
  assert(lines.includes("stderr:err; $(echo injected)"), "child: no shell — $(…) is printed, not executed");

  const ctl2 = new AbortController();
  const t0 = Date.now();
  const p2 = runChild({
    command: process.execPath,
    args: ["-e", "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"],
    env: { PATH: process.env.PATH ?? "" },
    signal: ctl2.signal,
    killGraceMs: 500,
    redact: (x) => x,
    onLine: (_s, l) => l === "ready" && ctl2.abort(),
  });
  const r2 = await p2;
  assert(r2.ended === "aborted" && r2.killed && r2.signal === "SIGKILL", "child: SIGTERM ignored → SIGKILL after the grace period");
  assert(Date.now() - t0 < 5_000 && r2.pid !== undefined && !alive(r2.pid), "child: the process is gone");

  const r3 = await runChild({
    command: process.execPath,
    args: ["-e", "setInterval(()=>{},1000)"],
    env: { PATH: process.env.PATH ?? "" },
    signal: new AbortController().signal,
    timeoutMs: 300,
    redact: (x) => x,
    onLine: () => undefined,
  });
  assert(r3.ended === "timeout" && r3.signal === "SIGTERM" && !r3.killed, "child: its own time limit sends SIGTERM");

  const r4 = await runChild({ command: "/nonexistent/binary-xyz", args: [], env: {}, signal: new AbortController().signal, redact: (x) => x, onLine: () => undefined });
  assert(r4.ended === "spawn-error" && r4.code === null, "child: a missing binary is a spawn error, not a hang");
}

// ======================================================================
// Part 2 — scratch database + fake source
// ======================================================================

const SCRATCH = "eflab_synctest_core";
const scratch = await setupScratchDb(SCRATCH);
if ("skip" in scratch) {
  console.log(`\n${scratch.skip}`);
  console.log("(the database part of the worker tests was SKIPPED; the tests above ran)");
  fetchGuard.restore();
} else {
  // From here on @eflab/db must bind to the scratch database: set the URL first, import after.
  process.env.DATABASE_URL = scratch.url;
  const { prisma } = await import("@eflab/db");
  const runner = await import("../src/runner.js");
  const { defaultHandlers } = await import("./../src/handlers/index.js");
  type RunHandlers = import("../src/runner.js").RunHandlers;
  type WorkerDeps = import("../src/runner.js").WorkerDeps;

  const uploadDest = mkdtempSync(join(tmpdir(), "eflab-synctest-upload-"));
  const NEWEST_SOURCE = Math.floor(Date.UTC(2026, 9, 18, 12) / 1000);
  let fake: FakeSource | null = null;
  try {
    // Connected to the scratch database only.
    const db = (await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0]?.db;
    assert(db === SCRATCH, `connected to the scratch database (${db})`);

    fake = await startFakeSource({ key: TEST_SECRETS.EFBASE_API_KEY });
    fake.setRows(generateRows(5, { cdnBase: fake.cdnBase, newestTimeAdded: NEWEST_SOURCE }));
    assert(isLoopbackHost(new URL(fake.apiBase).hostname), `fake source is on loopback (${new URL(fake.apiBase).host})`);
    const workerEnv = loadWorkerEnv(workerTestEnv({ databaseUrl: scratch.url, apiBase: fake.apiBase, uploadDest }));
    assert(workerEnv.apiBase === fake.apiBase && workerEnv.testMode, "worker env: test mode, source = the fake server");

    const deps = (over: Partial<WorkerDeps> = {}): WorkerDeps => ({
      db: prisma,
      env: workerEnv,
      handlers: defaultHandlers,
      log: () => undefined,
      ...over,
    });
    const reset = async (cfg: { enabled?: boolean; blockedUntil?: Date | null } = {}) => {
      await prisma.syncRun.deleteMany({});
      await prisma.syncConfig.update({
        where: { id: 1 },
        data: { enabled: cfg.enabled ?? false, incrementalIntervalMin: 360, fullWeekday: 0, fullHourUtc: 3, blockedUntil: cfg.blockedUntil ?? null, blockedReason: null, workerHeartbeatAt: null },
      });
      fake!.setMode("ok");
    };
    const queue = (kind: "CHECK" | "INCREMENTAL" | "FULL", at = new Date()) => prisma.syncRun.create({ data: { kind, trigger: "MANUAL", queuedAt: at } });
    const catalogueCounts = async () => {
      const rows = await prisma.$queryRaw<Array<{ t: string; n: bigint }>>`
        SELECT 'Player' t, count(*) n FROM "Player" UNION ALL SELECT 'Country', count(*) FROM "Country"
        UNION ALL SELECT 'Team', count(*) FROM "Team" UNION ALL SELECT 'League', count(*) FROM "League"
        UNION ALL SELECT 'Booster', count(*) FROM "Booster" UNION ALL SELECT 'Skill', count(*) FROM "Skill"
        UNION ALL SELECT 'PlayerSkill', count(*) FROM "PlayerSkill" UNION ALL SELECT 'Pack', count(*) FROM "Pack"
        UNION ALL SELECT 'Manager', count(*) FROM "Manager" UNION ALL SELECT 'FeaturedBundle', count(*) FROM "FeaturedBundle"`;
      return JSON.stringify(rows.map((r) => [r.t, Number(r.n)]));
    };

    // One card in the database, older than the source's newest.
    const DB_NEWEST = new Date(Date.UTC(2026, 9, 15, 0));
    await prisma.country.create({ data: { id: 1, name: "Testland" } });
    await prisma.player.create({
      data: { id: 1n, baseId: 1n, name: "DB Test Player", nationalityId: 1, height: 180, weight: 75, age: 25, registeredPosition: 12, cardType: "STANDARD", ovr: 70, maxOvr: 70, releaseDate: DB_NEWEST },
    });

    // ---- 5.3 check ok ----
    {
      await reset();
      const before = await catalogueCounts();
      const n0 = fake.requests.length;
      const run = await queue("CHECK");
      const r = await runner.tick(deps());
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const stats = row.stats as SyncRunStats;
      const reqs = fake.requests.slice(n0);
      assert(r.executed?.id === run.id && row.status === "OK", `check ok: run ${run.id} OK`);
      assert(reqs.length === 1, `check: exactly one request (${reqs.length})`);
      const q = reqs[0]!;
      assert(q.path === "/api/players" && q.query.get("limit") === "1" && q.query.get("sort") === "time_added" && q.query.get("order") === "desc", "check: /players?limit=1&sort=time_added&order=desc");
      assert(q.headers["user-agent"] === EFOOTBASE_USER_AGENT && q.headers["x-api-key"] === TEST_SECRETS.EFBASE_API_KEY, "check: the script's user agent and key header");
      assert(stats.check?.answered === true && stats.check.httpStatus === 200 && stats.check.challenge === false, "check: answered, HTTP 200, no challenge");
      assert(typeof stats.check?.responseMs === "number" && stats.requests === 1 && typeof stats.durationMs === "number", "check: response time, requests and duration recorded");
      assert(stats.check?.newestReleaseAt === new Date(NEWEST_SOURCE * 1000).toISOString(), "check: newest release time at the source");
      assert(stats.check?.dbNewestReleaseAt === DB_NEWEST.toISOString() && stats.check.newerThanDb === true, "check: compared with the database's newest card (source newer)");
      assert(row.startedAt !== null && row.finishedAt !== null && row.error === null, "check: started / finished times, no error");
      assert((await catalogueCounts()) === before, "check: catalogue tables unchanged");
      assert(!row.logTail.includes(TEST_SECRETS.EFBASE_API_KEY) && row.logTail.includes("HTTP 200"), "check: log tail written, without the key");
      const cfg = await prisma.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
      assert(cfg.blockedUntil === null && cfg.workerHeartbeatAt !== null, "check: not blocked; worker heartbeat written by the tick");
    }

    // ---- 5.3 check: nothing newer ----
    {
      await reset();
      fake.setRows(generateRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: Math.floor(DB_NEWEST.getTime() / 1000) }));
      const run = await queue("CHECK");
      await runner.tick(deps());
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert(row.status === "OK" && (row.stats as SyncRunStats).check?.newerThanDb === false, "check: same newest time as the database → newerThanDb false");
      fake.setRows(generateRows(5, { cdnBase: fake.cdnBase, newestTimeAdded: NEWEST_SOURCE }));
    }

    // ---- 5.3 blocked: 403, 429, HTML challenge ----
    for (const mode of ["403", "429", "html-challenge"] as const) {
      await reset();
      fake.setMode(mode);
      const n0 = fake.requests.length;
      const t0 = Date.now();
      const run = await queue("CHECK");
      await runner.tick(deps());
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const cfg = await prisma.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
      const stats = row.stats as SyncRunStats;
      const until = cfg.blockedUntil?.getTime() ?? 0;
      const six = SYNC_BLOCK_HOURS * 3600_000;
      assert(row.status === "BLOCKED", `${mode}: run BLOCKED`);
      assert(fake.requests.length - n0 === 1, `${mode}: exactly one request, no retry`);
      assert(until >= t0 + six - 1000 && until <= Date.now() + six + 1000, `${mode}: blockedUntil = now + 6 h`);
      assert(stats.check?.challenge === true && stats.check.httpStatus === (mode === "html-challenge" ? 200 : Number(mode)), `${mode}: challenge recorded with the HTTP status`);
      assert(row.error !== null && row.error.includes("blocked") && row.error.includes(cfg.blockedUntil!.toISOString()), `${mode}: the error says the source blocked and names the time`);
      assert(cfg.blockedReason !== null, `${mode}: blockedReason stored`);

      // While blocked: nothing scheduled, a queued sync run ends BLOCKED without a request, the queue keeps going.
      await prisma.syncConfig.update({ where: { id: 1 }, data: { enabled: true } });
      const inc = await queue("INCREMENTAL");
      const n1 = fake.requests.length;
      const r2 = await runner.tick(deps());
      const incRow = await prisma.syncRun.findUniqueOrThrow({ where: { id: inc.id } });
      assert(r2.queued.length === 0, `${mode}: the schedule queues nothing while blocked`);
      assert(incRow.status === "BLOCKED" && incRow.startedAt === null && /not started/.test(incRow.error ?? ""), `${mode}: a queued incremental run ends BLOCKED without starting`);
      assert(fake.requests.length === n1, `${mode}: no further request while blocked`);
    }

    // ---- 5.3 slow source → the check's time limit (no second request) ----
    {
      await reset();
      fake.setMode("slow");
      const n0 = fake.requests.length;
      const run = await queue("CHECK");
      const t0 = Date.now();
      await runner.tick(deps({ limits: { CHECK: 800 } }));
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert(row.status === "FAILED" && /time limit/.test(row.error ?? ""), `slow source: FAILED on the time limit (${row.error})`);
      assert(Date.now() - t0 < 4_000 && fake.requests.length - n0 === 1, "slow source: stopped near the limit, one request");
    }

    // ---- 5.3 no key → FAILED before any request ----
    {
      await reset();
      const n0 = fake.requests.length;
      const run = await queue("CHECK");
      await runner.tick(deps({ env: { ...workerEnv, efbaseApiKey: null } }));
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert(row.status === "FAILED" && /EFBASE_API_KEY/.test(row.error ?? "") && fake.requests.length === n0, "no key: FAILED with no request");
    }

    // ---- 5.4 / 5.5 handler table (the runs themselves: incremental.test.ts, full.test.ts) ----
    {
      const { runIncremental } = await import("../src/handlers/incremental.js");
      const { runFull } = await import("../src/handlers/full.js");
      assert(defaultHandlers.INCREMENTAL === runIncremental && defaultHandlers.FULL === runFull, "default handlers: INCREMENTAL and FULL are the real sync runs");
      await reset();
      const n0 = fake.requests.length;
      const b = await queue("FULL");
      await runner.tick(deps());
      const rb = await prisma.syncRun.findUniqueOrThrow({ where: { id: b.id } });
      assert(rb.status === "FAILED" && /EFOOTBASE_STATIC_DIR/.test(rb.error ?? "") && fake.requests.length === n0, "full without a static snapshot directory (test mode): FAILED in the pre-flight, no request");
    }

    // ---- 5.1 stale-run recovery ----
    {
      await reset();
      const now = Date.now();
      const stale = await prisma.syncRun.create({ data: { kind: "FULL", trigger: "SCHEDULE", status: "RUNNING", queuedAt: new Date(now - 3600_000), startedAt: new Date(now - 3600_000), heartbeatAt: new Date(now - SYNC_STALE_RUN_MS - 60_000) } });
      const check = await queue("CHECK");
      const r = await runner.tick(deps());
      const s = await prisma.syncRun.findUniqueOrThrow({ where: { id: stale.id } });
      const c = await prisma.syncRun.findUniqueOrThrow({ where: { id: check.id } });
      assert(r.recovered.includes(stale.id) && s.status === "FAILED" && s.error === "worker restarted" && s.finishedAt !== null, "stale RUNNING run (heartbeat 11 min old) → FAILED 'worker restarted'");
      assert(c.status === "OK", "after the recovery the queue continues (the queued check ran)");

      await reset();
      const fresh = await prisma.syncRun.create({ data: { kind: "FULL", trigger: "SCHEDULE", status: "RUNNING", startedAt: new Date(now - 3600_000), heartbeatAt: new Date(now - 5 * 60_000) } });
      const check2 = await queue("CHECK");
      const r2 = await runner.tick(deps());
      const f = await prisma.syncRun.findUniqueOrThrow({ where: { id: fresh.id } });
      const c2 = await prisma.syncRun.findUniqueOrThrow({ where: { id: check2.id } });
      assert(f.status === "RUNNING" && r2.recovered.length === 0, "a RUNNING run with a 5-minute-old heartbeat is left alone");
      assert(r2.claim === "busy" && c2.status === "QUEUED", "…and the next queued run waits (claim = busy)");
    }

    // ---- 5.1 claim exclusion (database-enforced) ----
    {
      await reset();
      await prisma.syncRun.create({ data: { kind: "FULL", trigger: "MANUAL", status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date() } });
      let second: unknown = null;
      try {
        await prisma.syncRun.create({ data: { kind: "CHECK", trigger: "MANUAL", status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date() } });
      } catch (e) {
        second = e;
      }
      assert(second !== null && runner.isUniqueViolation(second), "a second RUNNING row is rejected by the database (SyncRun_one_running)");
      let viaUpdate: unknown = null;
      const q = await queue("CHECK");
      try {
        await prisma.$executeRaw`UPDATE "SyncRun" SET status = 'RUNNING' WHERE id = ${q.id}`;
      } catch (e) {
        viaUpdate = e;
      }
      assert(viaUpdate !== null && runner.isUniqueViolation(viaUpdate), "…also through an UPDATE (raw SQL error recognised as a unique violation)");
      const direct = await runner.tryClaim(deps(), q.id, new Date());
      assert(direct === "busy", "the claim's conditional UPDATE itself reads the index's refusal as busy (not an error)");
      const c = await runner.claimNextRun(deps());
      const qr = await prisma.syncRun.findUniqueOrThrow({ where: { id: q.id } });
      assert(c.claimed === null && c.reason === "busy" && qr.status === "QUEUED","claim while another run is RUNNING → busy, the run stays QUEUED");

      await reset();
      const a = await queue("CHECK", new Date(Date.now() - 2000));
      const b = await queue("INCREMENTAL", new Date(Date.now() - 1000));
      const [c1, c2] = await Promise.all([runner.claimNextRun(deps()), runner.claimNextRun(deps())]);
      const claimed = [c1, c2].filter((x) => x.claimed !== null);
      const running = await prisma.syncRun.count({ where: { status: "RUNNING" } });
      assert(claimed.length === 1 && running === 1, "two concurrent claims → exactly one RUNNING run");
      assert(claimed[0]!.claimed!.id === a.id, "the oldest queued run is claimed first");
      const aRow = await prisma.syncRun.findUniqueOrThrow({ where: { id: a.id } });
      const sent = claimed[0]!.claimed!.startedAt.getTime();
      assert(aRow.startedAt?.getTime() === sent && aRow.heartbeatAt?.getTime() === sent, "the claim's conditional UPDATE stores startedAt / heartbeatAt exactly (UTC session; other zones: the CR1 block)");
      const bRow = await prisma.syncRun.findUniqueOrThrow({ where: { id: b.id } });
      assert(bRow.status === "QUEUED", "the other run stays QUEUED");
    }

    // ---- 5.1 / 5.2 cancel stops the children within ~15 s ----
    {
      await reset();
      let childPid = 0;
      const handlers: RunHandlers = {
        ...defaultHandlers,
        INCREMENTAL: async (ctx) => {
          // A child that ignores SIGTERM: only the SIGKILL after 10 s ends it.
          const res = await ctx.runChild(process.execPath, ["-e", "process.on('SIGTERM',()=>console.log('got SIGTERM, ignoring')); console.log('pid ' + process.pid); setInterval(()=>{},1000)"], {
            env: childEnv(ctx.env),
            label: "stubborn",
          });
          childPid = res.pid ?? 0;
          return res.code === 0 ? { status: "OK" } : { status: "FAILED", error: `child ended ${res.ended}` };
        },
      };
      const run = await queue("INCREMENTAL");
      const tickP = runner.tick(deps({ handlers, runHeartbeatMs: 1_000 }));
      // Wait until it runs, then cancel like the API does (flag only).
      let row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      for (let i = 0; i < 100 && row.status !== "RUNNING"; i++) {
        await sleep(50);
        row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      }
      await sleep(2_500); // let a heartbeat land while running
      const mid = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert(mid.status === "RUNNING" && mid.heartbeatAt !== null && mid.heartbeatAt.getTime() > mid.startedAt!.getTime(), "while running: the run's heartbeat is refreshed");
      assert(mid.logTail.includes("stubborn") && mid.logTail.includes("pid "), "while running: the log tail is flushed with the child's output");
      const cfgMid = await prisma.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
      assert(cfgMid.workerHeartbeatAt !== null && Date.now() - cfgMid.workerHeartbeatAt.getTime() < 5_000, "while running: the worker heartbeat stays fresh");
      const tCancel = Date.now();
      await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
      const r = await tickP;
      const took = Date.now() - tCancel;
      const end = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert(r.executed?.status === "CANCELLED" && end.status === "CANCELLED" && end.finishedAt !== null, "cancel: the run ends CANCELLED");
      assert(took <= 15_000, `cancel: ended ${took} ms after the request (≤ 15 s; SIGTERM ignored → SIGKILL after 10 s)`);
      assert(childPid > 0 && !alive(childPid), "cancel: the child process is gone");
      assert((await prisma.syncRun.count({ where: { status: "RUNNING" } })) === 0, "cancel: no run remains RUNNING");
      assert(end.logTail.includes("got SIGTERM") && end.logTail.includes("cancel requested"), "cancel: the log shows SIGTERM and the cancel");

      // Cancel requested while still queued → CANCELLED without running.
      await reset();
      const q = await prisma.syncRun.create({ data: { kind: "CHECK", trigger: "MANUAL", cancelRequested: true } });
      const n0 = fake.requests.length;
      await runner.tick(deps());
      const qr = await prisma.syncRun.findUniqueOrThrow({ where: { id: q.id } });
      assert(qr.status === "CANCELLED" && qr.startedAt === null && fake.requests.length === n0, "cancel of a queued run: CANCELLED, never started, no request");
    }

    // ---- CR1: the database session's TimeZone must not move any stored time ----
    // ALTER DATABASE … SET timezone applies to new connections: disconnect, the next query reconnects.
    {
      const setTz = async (tz: string | null) => {
        await prisma.$executeRawUnsafe(tz ? `ALTER DATABASE "${SCRATCH}" SET timezone = '${tz}'` : `ALTER DATABASE "${SCRATCH}" RESET timezone`);
        await prisma.$disconnect();
      };
      const handlers: RunHandlers = { ...defaultHandlers, INCREMENTAL: async () => ({ status: "OK" }), FULL: async () => ({ status: "OK" }) };
      const now = new Date(Date.UTC(2026, 9, 21, 12, 0, 0)); // Wednesday 12:00 UTC
      try {
        for (const tz of ["America/New_York", "Asia/Ho_Chi_Minh"]) {
          await setTz(tz);
          const shown = (await prisma.$queryRaw<Array<{ TimeZone: string }>>`SHOW timezone`)[0]?.TimeZone;
          // scheduled incremental: queued, claimed and finished at exactly `now`; nothing due a minute later
          await reset({ enabled: true });
          await prisma.syncRun.create({ data: { kind: "INCREMENTAL", trigger: "SCHEDULE", status: "OK", queuedAt: new Date(now.getTime() - 7 * 3600_000), startedAt: new Date(now.getTime() - 7 * 3600_000), finishedAt: new Date(now.getTime() - 7 * 3600_000 + 1000) } });
          const r1 = await runner.tick(deps({ handlers, now: () => now }));
          const run = await prisma.syncRun.findFirstOrThrow({ where: { trigger: "SCHEDULE", status: "OK" }, orderBy: { id: "desc" } });
          const exact = run.queuedAt.getTime() === now.getTime() && run.startedAt?.getTime() === now.getTime() && run.heartbeatAt?.getTime() === now.getTime() && run.finishedAt?.getTime() === now.getTime();
          const r2 = await runner.tick(deps({ handlers, now: () => new Date(now.getTime() + 60_000) }));
          assert(shown === tz && r1.queued.join() === "INCREMENTAL" && exact && r2.queued.length === 0,
            `TimeZone ${shown}: a scheduled incremental is stored at exactly the claim time (queued/started/heartbeat/finished ${[run.queuedAt, run.startedAt, run.heartbeatAt, run.finishedAt].map((d) => d?.toISOString()).join(" / ")}) and nothing is due a minute later (queued ${r2.queued.join() || "nothing"})`);
          // weekly window: one FULL, not re-queued inside its own window
          await reset({ enabled: true });
          await prisma.syncConfig.update({ where: { id: 1 }, data: { fullWeekday: 3, fullHourUtc: 12 } });
          const w1 = await runner.tick(deps({ handlers, now: () => new Date(now.getTime() + 5 * 60_000) }));
          const w2 = await runner.tick(deps({ handlers, now: () => new Date(now.getTime() + 20 * 60_000) }));
          assert(w1.queued.join() === "FULL" && w2.queued.length === 0, `TimeZone ${shown}: the weekly FULL runs once in its window (then ${w2.queued.join() || "nothing"})`);
          // stale recovery: a 5-minute-old heartbeat is not stale, an 11-minute-old one is
          await reset();
          const t = Date.now();
          const fresh = await prisma.syncRun.create({ data: { kind: "FULL", trigger: "MANUAL", status: "RUNNING", startedAt: new Date(t - 3600_000), heartbeatAt: new Date(t - 5 * 60_000) } });
          const rec1 = await runner.recoverStaleRuns(deps());
          await prisma.syncRun.update({ where: { id: fresh.id }, data: { heartbeatAt: new Date(t - 11 * 60_000) } });
          const rec2 = await runner.recoverStaleRuns(deps());
          assert(rec1.length === 0 && rec2.join() === String(fresh.id), `TimeZone ${shown}: stale recovery keeps a 5-min heartbeat and fails an 11-min one`);
          // a claim of a queued run stores startedAt / heartbeatAt exactly
          await reset();
          const q = await queue("CHECK");
          const at = new Date(Date.UTC(2026, 9, 21, 12, 34, 56, 789));
          const claimed = await runner.tryClaim(deps(), q.id, at);
          const qr = await prisma.syncRun.findUniqueOrThrow({ where: { id: q.id } });
          assert(claimed === "claimed" && qr.startedAt?.getTime() === at.getTime() && qr.heartbeatAt?.getTime() === at.getTime(), `TimeZone ${shown}: tryClaim stores startedAt / heartbeatAt exactly (${qr.startedAt?.toISOString()})`);
          await prisma.syncRun.update({ where: { id: q.id }, data: { status: "OK", finishedAt: at } });
        }
      } finally {
        await setTz(null);
      }
    }

    // ---- third verify S4 / S6 ----
    {
      // S4: a checkpoint that cannot update its own RUNNING row throws (the full run then never starts its seed)
      await reset();
      let threw: string | null = null;
      const handlers: RunHandlers = {
        ...defaultHandlers,
        INCREMENTAL: async (ctx) => {
          await prisma.syncRun.update({ where: { id: ctx.run.id }, data: { status: "FAILED", finishedAt: new Date(), error: "taken away" } });
          ctx.stats.cardsNew = 1;
          try {
            await ctx.checkpoint();
          } catch (e) {
            threw = (e as Error).message;
          }
          return { status: "OK" };
        },
      };
      await queue("INCREMENTAL");
      await runner.tick(deps({ handlers }));
      assert(threw !== null && /checkpoint/.test(threw), `S4: ctx.checkpoint() throws when its RUNNING row was not updated (${threw ?? "did not throw"})`);

      // S6: a stopping worker claims nothing
      await reset();
      const q = await queue("CHECK");
      const stopping = new AbortController();
      stopping.abort(new Error("shutdown"));
      const n0 = fake.requests.length;
      const r = await runner.tick(deps({ shutdown: stopping.signal }));
      const qr = await prisma.syncRun.findUniqueOrThrow({ where: { id: q.id } });
      assert(r.claim !== "claimed" && r.executed === null && qr.status === "QUEUED" && fake.requests.length === n0, `S6: tick during shutdown claims nothing — the run stays QUEUED (claim ${r.claim}, status ${qr.status})`);
    }

    // ---- W3: a catalogue write and a cancel / abandon (verify finding W3) ----
    // `writeCatalogue` is the runner's guard around a committing write; the fallback only lets these
    // tests run (and fail meaningfully) against a runner without it.
    type Ctx = import("../src/runner.js").RunContext;
    const write = <T>(ctx: Ctx, what: string, fn: () => Promise<T>): Promise<T> =>
      (ctx as Partial<Pick<Ctx, "writeCatalogue">>).writeCatalogue ? ctx.writeCatalogue(what, fn) : fn();
    const waitRunning = async (id: number) => {
      for (let i = 0; i < 200; i++) {
        if ((await prisma.syncRun.findUniqueOrThrow({ where: { id } })).status === "RUNNING") return;
        await sleep(25);
      }
    };
    {
      // (a) The cancel lands while the write is committing: the rows are in → never CANCELLED.
      await reset();
      const handlers: RunHandlers = {
        ...defaultHandlers,
        INCREMENTAL: async (ctx) => {
          await write(ctx, "stub catalogue write", async () => {
            await sleep(1_500); // the "commit" outlives the cancel poll
            return 1;
          });
          return { status: "OK" };
        },
      };
      const run = await queue("INCREMENTAL");
      const p = runner.tick(deps({ handlers, cancelPollMs: 100 }));
      await waitRunning(run.id);
      await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
      await p;
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert(row.status === "OK" && row.error === null, `cancel during a committing write → recorded as the real outcome OK, not CANCELLED (got ${row.status})`);
      assert(/after the database write had committed/.test(row.logTail), "…with a note in the log tail");

      // (b) A write never starts once the run was aborted.
      await reset();
      let started = false;
      const late: RunHandlers = {
        ...defaultHandlers,
        INCREMENTAL: async (ctx) => {
          while (!ctx.signal.aborted) await sleep(20);
          try {
            await write(ctx, "late write", async () => {
              started = true;
            });
          } catch {
            /* refused */
          }
          return { status: "OK" };
        },
      };
      const run2 = await queue("INCREMENTAL");
      const p2 = runner.tick(deps({ handlers: late, cancelPollMs: 100 }));
      await waitRunning(run2.id);
      await prisma.syncRun.update({ where: { id: run2.id }, data: { cancelRequested: true } });
      await p2;
      const row2 = await prisma.syncRun.findUniqueOrThrow({ where: { id: run2.id } });
      assert(!started && row2.status === "CANCELLED", `a write requested after the abort is refused; the run is CANCELLED (started ${started}, ${row2.status})`);

      // (c) A handler that ignores its signal while its transaction runs: the slot is held until the
      //     database work ended (never freed at the abandon deadline), the heartbeat stays fresh.
      await reset();
      const stubborn: RunHandlers = {
        ...defaultHandlers,
        INCREMENTAL: async (ctx) => {
          await write(ctx, "slow transaction", () =>
            prisma.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT pg_sleep(8)`;
            }, { timeout: 20_000 }),
          );
          return { status: "OK" };
        },
      };
      const run3 = await queue("INCREMENTAL");
      const t0 = Date.now();
      const p3 = runner.tick(deps({ handlers: stubborn, cancelPollMs: 100, killGraceMs: 200, runHeartbeatMs: 1_000 }));
      await waitRunning(run3.id);
      await prisma.syncRun.update({ where: { id: run3.id }, data: { cancelRequested: true } });
      await sleep(Math.max(0, 6_500 - (Date.now() - t0))); // past the abandon deadline (grace 0.2 s + 5 s), before the transaction ends (8 s)
      const mid = await prisma.syncRun.findUniqueOrThrow({ where: { id: run3.id } });
      const other = await queue("CHECK");
      const claim = await runner.claimNextRun(deps());
      assert(mid.status === "RUNNING" && claim.claimed === null && claim.reason === "busy", `abandoned handler with a transaction in flight: the run stays RUNNING, the next run waits (status ${mid.status}, claim ${claim.claimed ? `claimed #${claim.claimed.id}` : claim.reason})`);
      if (claim.claimed) await prisma.syncRun.update({ where: { id: claim.claimed.id }, data: { status: "FAILED", finishedAt: new Date() } });
      assert(mid.heartbeatAt !== null && Date.now() - mid.heartbeatAt.getTime() < 3_000, "…and its heartbeat is still written");
      await p3;
      const end3 = await prisma.syncRun.findUniqueOrThrow({ where: { id: run3.id } });
      assert(Date.now() - t0 >= 7_500 && end3.status !== "CANCELLED", `the run ends only after the transaction, and not CANCELLED once it committed (${end3.status} after ${Date.now() - t0} ms)`);
      await prisma.syncRun.updateMany({ where: { id: other.id, status: "QUEUED" }, data: { status: "CANCELLED", finishedAt: new Date() } });
    }

    // ---- 5.2 redaction of every configured secret in stored logs and errors ----
    {
      await reset();
      let uploadEnvNames: string[] = [];
      const handlers: RunHandlers = {
        ...defaultHandlers,
        INCREMENTAL: async (ctx) => {
          const keyEcho = await ctx.runChild(process.execPath, ["-e", "console.log('key=' + process.env.EFBASE_API_KEY); console.error('stderr key ' + process.env.EFBASE_API_KEY)"], {
            env: childEnv(ctx.env, { EFBASE_API_KEY: ctx.env.efbaseApiKey! }),
            label: "dump",
          });
          const src = mkdtempSync(join(tmpdir(), "eflab-synctest-src-"));
          try {
            const { writeFileSync, mkdirSync } = await import("node:fs");
            mkdirSync(join(src, "cards"));
            writeFileSync(join(src, "cards", "1_dynamic.webp"), "x");
            const [cmd, ...pre] = ctx.env.uploadCommand;
            const up = await ctx.runChild(cmd!, [...pre, "--prefix", src, "--no-resume", "--echo-secret"], { env: childEnv(ctx.env, ctx.env.r2Env), label: "upload" });
            if (keyEcho.code !== 0 || up.code !== 0) return { status: "FAILED", error: "child failed" };
          } finally {
            rmSync(src, { recursive: true, force: true });
          }
          const inv = readFileSync(join(uploadDest, "_invocations.jsonl"), "utf8").trim().split("\n").pop()!;
          uploadEnvNames = (JSON.parse(inv) as { envNames: string[] }).envNames;
          ctx.log(`direct log line with ${TEST_SECRETS.R2_ACCESS_KEY_ID}`);
          throw new Error(`boom with key ${TEST_SECRETS.EFBASE_API_KEY} and account ${TEST_SECRETS.R2_ACCOUNT_ID}`);
        },
      };
      const run = await queue("INCREMENTAL");
      await runner.tick(deps({ handlers }));
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const stored = `${row.logTail}\n${row.error}\n${JSON.stringify(row.stats)}`;
      const leaked = Object.entries(TEST_SECRETS).filter(([, v]) => stored.includes(v)).map(([k]) => k);
      assert(leaked.length === 0, `redaction: no secret value in the stored log, error or stats (leaked: ${leaked.join(", ") || "none"})`);
      assert(row.logTail.includes(`key=${REDACTION_MASK}`) && row.logTail.includes(`stderr key ${REDACTION_MASK}`), "redaction: the child's key line is stored masked (stdout and stderr)");
      assert(row.logTail.includes(`secret: ${REDACTION_MASK}`), "redaction: the upload child's bucket secret is stored masked");
      assert(row.status === "FAILED" && (row.error ?? "").includes(REDACTION_MASK), "redaction: the error text is masked too");
      assert(uploadEnvNames.includes("R2_SECRET_ACCESS_KEY") && !uploadEnvNames.includes("EFBASE_API_KEY") && !uploadEnvNames.includes("DATABASE_URL"), "upload child got the R2 variables only (no key, no database URL)");
      assert(!stored.includes(scratch.url) && !stored.includes(new URL(scratch.url).password || "\u0000none"), "redaction: the database URL / password never stored");
    }

    // ---- 5.1 scheduler: queues due runs; nothing while disabled or blocked ----
    {
      const handlers: RunHandlers = { ...defaultHandlers, INCREMENTAL: async () => ({ status: "OK" }), FULL: async () => ({ status: "OK" }) };
      // A Wednesday 12:00 UTC: outside the default Sunday 03:00 window.
      const now = new Date(Date.UTC(2026, 9, 21, 12, 0, 0));
      const at = () => now;
      await reset({ enabled: true });
      await prisma.syncRun.create({ data: { kind: "INCREMENTAL", trigger: "SCHEDULE", status: "OK", queuedAt: new Date(now.getTime() - 7 * 3600_000), startedAt: new Date(now.getTime() - 7 * 3600_000), finishedAt: new Date(now.getTime() - 7 * 3600_000 + 1000) } });
      const r1 = await runner.tick(deps({ handlers, now: at }));
      const sched = await prisma.syncRun.findMany({ where: { trigger: "SCHEDULE", queuedAt: now } });
      assert(r1.queued.join() === "INCREMENTAL" && sched.length === 1 && sched[0]!.kind === "INCREMENTAL", "scheduler: last incremental 7 h ago, interval 360 → one scheduled incremental queued");
      assert(r1.executed?.status === "OK", "scheduler: …and executed by the same tick");
      const r2 = await runner.tick(deps({ handlers, now: at }));
      assert(r2.queued.length === 0, "scheduler: right after a run, nothing is due");

      await reset({ enabled: false });
      const r3 = await runner.tick(deps({ handlers, now: at }));
      assert(r3.queued.length === 0 && (await prisma.syncRun.count()) === 0, "scheduler: disabled → nothing queued");
      const manual = await queue("CHECK");
      await runner.tick(deps({ handlers }));
      assert((await prisma.syncRun.findUniqueOrThrow({ where: { id: manual.id } })).status === "OK", "scheduler disabled: a manual run still works");

      await reset({ enabled: true, blockedUntil: new Date(now.getTime() + 3600_000) });
      const n0 = fake.requests.length;
      const r4 = await runner.tick(deps({ handlers, now: at }));
      assert(r4.queued.length === 0 && (await prisma.syncRun.count()) === 0 && fake.requests.length === n0, "scheduler: blocked → nothing queued, no request");

      await reset({ enabled: true, blockedUntil: now });
      const r5 = await runner.tick(deps({ handlers, now: at }));
      assert(r5.queued.join() === "INCREMENTAL", "scheduler: blockedUntil = now is no longer blocked");

      // Weekly window: Wednesday 12:xx with the window at Wednesday 12:00 → FULL supersedes INCREMENTAL.
      await reset({ enabled: true });
      await prisma.syncConfig.update({ where: { id: 1 }, data: { fullWeekday: 3, fullHourUtc: 12 } });
      const inWindow = new Date(now.getTime() + 10 * 60_000);
      const r6 = await runner.tick(deps({ handlers, now: () => inWindow }));
      assert(r6.queued.join() === "FULL", "scheduler: inside the weekly window with no full run since it opened → FULL");
      const r7 = await runner.tick(deps({ handlers, now: () => new Date(inWindow.getTime() + 60_000) }));
      assert(r7.queued.length === 0, "scheduler: the window's full run happened → nothing more in that window");

      // Nothing is queued while a sync-group run is queued or running.
      await reset({ enabled: true });
      await queue("FULL");
      const deps2 = deps({ handlers, now: at });
      const due = await runner.queueDueRuns(deps2);
      assert(due.length === 0, "scheduler: a queued full run → no scheduled run");
    }

    assert(fetchGuard.refused.length === 0, "no request left the machine (fetch guard)");
    const hosts = new Set(fake.requests.map((r) => r.headers.host));
    assert([...hosts].every((h) => typeof h === "string" && isLoopbackHost(h.replace(/:\d+$/, ""))), "every request went to the local fake source");
  } finally {
    await fake?.close();
    fetchGuard.restore();
    await prisma.$disconnect();
    rmSync(uploadDest, { recursive: true, force: true });
    await scratch.drop();
    console.log(`scratch database ${scratch.name} dropped`);
  }
}

if (process.exitCode) console.error("\nworker tests FAILED");
else console.log("\nworker tests passed");
