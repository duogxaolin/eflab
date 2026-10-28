// scripts/r2_upload.py — the opt-in flags of openspec change admin-sync-live-progress
// (`--progress-every N`, `--results-file PATH`). No database, no bucket, no network.
//
// The script runs from a COPY in a temporary "repository" (it writes its manifest under
// <its repo>/dump/efootbase/ and resolves --env against it) with boto3 / botocore replaced
// by local stubs on PYTHONPATH: the stub "bucket" is a directory, a key containing "fail"
// answers an S3 500, one containing "slow" a timeout. Checks: no PROGRESS line and no
// results file without the flags; the line format and the per-file outcome classes with
// them; the output minus the PROGRESS lines unchanged; the results file refused inside the
// repository tree, relative or existing; and the real script stopped mid-run (verify W2 of the
// fix round): a SIGTERM with the flags drains the running upload and exits 143 with every
// finished upload in the results file, a SIGKILL loses at most the in-flight line and leaves no
// torn one, a SIGTERM without the flags still kills the script as before (no handler).
// Same assert-style runner as the other tests.
//
// Run: pnpm --filter @eflab/worker test

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { UPLOAD_SCRIPT } from "../src/env.js";
import { readUploadResults } from "../src/scripts.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

const box = mkdtempSync(join(tmpdir(), "eflab-synctest-upload-script-"));
try {
  const root = join(box, "repo");
  mkdirSync(join(root, "scripts"), { recursive: true });
  const script = join(root, "scripts", "r2_upload.py");
  copyFileSync(UPLOAD_SCRIPT, script);
  const stub = join(box, "stub");
  mkdirSync(join(stub, "boto3"), { recursive: true });
  mkdirSync(join(stub, "botocore"), { recursive: true });
  writeFileSync(join(stub, "botocore", "__init__.py"), "");
  writeFileSync(join(stub, "botocore", "config.py"), "class Config:\n    def __init__(self, **kw):\n        self.kw = kw\n");
  writeFileSync(
    join(stub, "botocore", "exceptions.py"),
    "class ClientError(Exception):\n    def __init__(self, response, op):\n        super().__init__('An error occurred (%s) when calling %s: secret-looking text' % (response['Error']['Code'], op))\n        self.response = response\n",
  );
  writeFileSync(
    join(stub, "boto3", "__init__.py"),
    [
      "import os, shutil, time",
      "from botocore.exceptions import ClientError",
      "class _S3:",
      "    def head_object(self, Bucket, Key):",
      "        if not os.path.exists(os.path.join(os.environ['STUB_BUCKET_DIR'], Key)):",
      "            raise ClientError({'Error': {'Code': '404'}, 'ResponseMetadata': {'HTTPStatusCode': 404}}, 'HeadObject')",
      "        return {}",
      "    def upload_file(self, src, Bucket, Key, ExtraArgs=None):",
      "        time.sleep(int(os.environ.get('STUB_UPLOAD_DELAY_MS', '0')) / 1000)",
      "        if 'fail' in Key:",
      "            raise ClientError({'Error': {'Code': 'InternalError'}, 'ResponseMetadata': {'HTTPStatusCode': 500}}, 'PutObject')",
      "        if 'slow' in Key:",
      "            raise TimeoutError('read timed out')",
      "        d = os.path.join(os.environ['STUB_BUCKET_DIR'], Key)",
      "        os.makedirs(os.path.dirname(d), exist_ok=True)",
      "        shutil.copyfile(src, d)",
      "def client(*a, **kw):",
      "    return _S3()",
      "",
    ].join("\n"),
  );
  const src = join(box, "images");
  for (const k of ["cards/1_dynamic.webp", "cards/2_dynamic.webp", "cards/fail_dynamic.webp", "cards/slow_dynamic.webp", "emblems/team/x1.png"]) {
    mkdirSync(join(src, k, ".."), { recursive: true });
    writeFileSync(join(src, k), `bytes of ${k}`);
  }
  const run = (bucket: string, extra: string[]): Promise<{ code: number | null; out: string }> =>
    new Promise((res) => {
      mkdirSync(bucket, { recursive: true });
      const c = spawn("python3", ["-B", script, "--env", devNull, "--prefix", src, "--workers", "1", ...extra], {
        shell: false,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          PYTHONIOENCODING: "utf-8",
          PYTHONHASHSEED: "0",
          PYTHONPATH: stub,
          STUB_BUCKET_DIR: bucket,
          R2_ACCOUNT_ID: "stub-account-000111",
          R2_ACCESS_KEY_ID: "stub-access",
          R2_SECRET_ACCESS_KEY: "stub-secret",
        },
      });
      let out = "";
      c.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
      c.stderr.on("data", (b: Buffer) => (out += b.toString("utf8")));
      c.on("error", (e) => res({ code: null, out: e.message }));
      c.on("close", (code) => res({ code, out }));
    });
  const timing = (s: string) => s.replace(/\(\d+\/s\)/g, "(N/s)").replace(/duration: \d+s/g, "duration: Ns");

  const plain = await run(join(box, "bucket-plain"), ["--no-resume"]);
  assert(plain.code === 0 && !/PROGRESS/.test(plain.out) && /ok=3 skip_exists=0 error=2/.test(plain.out), `without the flags: no PROGRESS line (exit ${plain.code}; ${plain.out.split("\n").find((l) => l.includes("ok=")) ?? "no summary"})`);
  const rf = join(box, "upload-results.jsonl");
  const flagged = await run(join(box, "bucket-flags"), ["--no-resume", "--progress-every", "2", "--results-file", rf]);
  const prog = flagged.out.split("\n").filter((l) => l.startsWith("PROGRESS"));
  assert(flagged.code === 0 && prog.join("|") === "PROGRESS 0/5|PROGRESS 2/5|PROGRESS 4/5|PROGRESS 5/5", `--progress-every 2: ${prog.join(" | ")}`);
  const strip = (s: string) => timing(s.split("\n").filter((l) => !l.startsWith("PROGRESS")).join("\n"));
  assert(strip(flagged.out) === timing(plain.out), "with the flags: the output minus the PROGRESS lines is the unflagged output (timings aside)");
  const recs = readFileSync(rf, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { key: string; outcome: string });
  const by = Object.fromEntries(recs.map((r) => [r.key, r.outcome]));
  assert(
    by["cards/1_dynamic.webp"] === "ok" && by["cards/fail_dynamic.webp"] === "http_500" && by["cards/slow_dynamic.webp"] === "timeout" && by["emblems/team/x1.png"] === "ok" && recs.length === 5,
    `--results-file: one record per file — ok, http_500, timeout (${JSON.stringify(by)})`,
  );
  assert(!readFileSync(rf, "utf8").includes("secret-looking") && (statSync(rf).mode & 0o777) === 0o600, "--results-file: outcome classes only (no error text), mode 0600");
  const rf2 = join(box, "upload-results-resume.jsonl");
  mkdirSync(join(box, "bucket-resume", "cards"), { recursive: true });
  writeFileSync(join(box, "bucket-resume", "cards", "2_dynamic.webp"), "already there");
  await run(join(box, "bucket-resume"), ["--results-file", rf2]);
  assert(readFileSync(rf2, "utf8").includes('{"key": "cards/2_dynamic.webp", "outcome": "skipped_exists"}'), "--results-file: skipped_exists in resume mode");
  const inRepo = join(root, "dump", "results.jsonl");
  mkdirSync(join(root, "dump"), { recursive: true });
  const r1 = await run(join(box, "bucket-x"), ["--results-file", inRepo]);
  const r2 = await run(join(box, "bucket-x"), ["--results-file", "relative.jsonl"]);
  const r3 = await run(join(box, "bucket-x"), ["--results-file", rf]);
  const r4 = await run(join(box, "bucket-x"), ["--progress-every", "0"]);
  assert(r1.code === 1 && /outside the repository/.test(r1.out) && !existsSync(inRepo) && !existsSync(join(box, "bucket-x", "cards")), "--results-file inside the script's repository tree → refused before any upload, no file");
  assert(r2.code === 1 && /absolute/.test(r2.out) && r3.code === 1 && /must not exist/.test(r3.out) && r4.code === 1 && /at least 1/.test(r4.out), "--results-file relative / already existing and --progress-every 0 → refused");

  // ---- the real script stopped mid-run (verify W2): SIGTERM / SIGKILL after N uploads ----
  // 20 files, one worker, 150 ms per upload; the signal is sent when "PROGRESS N/20" is read (unbuffered output).
  const many = join(box, "many");
  for (let i = 1; i <= 20; i++) {
    mkdirSync(join(many, "cards"), { recursive: true });
    writeFileSync(join(many, "cards", `${1000 + i}_dynamic.webp`), `bytes ${i}`);
  }
  const manifestFile = join(root, "dump", "efootbase", "r2_manifest.json");
  const stopAt = (bucket: string, extra: string[], at: number | null, sig: NodeJS.Signals): Promise<{ code: number | null; signal: NodeJS.Signals | null; out: string; err: string; sentAt: number | null }> =>
    new Promise((res) => {
      mkdirSync(bucket, { recursive: true });
      const c = spawn("python3", ["-B", script, "--env", devNull, "--prefix", many, "--workers", "1", "--no-resume", ...extra], {
        shell: false,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1", PYTHONPATH: stub, STUB_BUCKET_DIR: bucket, STUB_UPLOAD_DELAY_MS: "150", R2_ACCOUNT_ID: "stub-account-000111", R2_ACCESS_KEY_ID: "stub-access", R2_SECRET_ACCESS_KEY: "stub-secret" },
      });
      let out = "";
      let err = "";
      let sentAt: number | null = null;
      c.stdout.on("data", (b: Buffer) => {
        out += b.toString("utf8");
        if (sentAt !== null) return;
        // without --progress-every the trigger is the bucket itself (N files stored)
        const n = at === null ? null : Math.max(-1, ...[...out.matchAll(/^PROGRESS (\d+)\/20$/gm)].map((m) => Number(m[1])));
        if (n !== null && n >= at!) {
          sentAt = n;
          c.kill(sig);
        }
      });
      c.stderr.on("data", (b: Buffer) => (err += b.toString("utf8")));
      const poll = at === null ? setInterval(() => {
        const stored = existsSync(join(bucket, "cards")) ? readdirSync(join(bucket, "cards")).length : 0;
        if (sentAt === null && stored >= 6) {
          sentAt = stored;
          c.kill(sig);
        }
      }, 20) : null;
      c.on("close", (code, signal) => {
        if (poll) clearInterval(poll);
        res({ code, signal, out, err, sentAt });
      });
    });
  const lines = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
  const whole = (txt: string) =>
    (txt === "" || txt.endsWith("\n")) &&
    txt.split("\n").filter(Boolean).every((l) => {
      try {
        JSON.parse(l);
        return true;
      } catch {
        return false;
      }
    });
  const lastProgress = (out: string) => Math.max(...[...out.matchAll(/^PROGRESS (\d+)\/20$/gm)].map((m) => Number(m[1])));

  rmSync(manifestFile, { force: true });
  const rfTerm = join(box, "term-results.jsonl");
  const term = await stopAt(join(box, "bucket-term"), ["--progress-every", "1", "--results-file", rfTerm], 9, "SIGTERM");
  const termText = lines(rfTerm);
  const termRecs = termText.split("\n").filter(Boolean).map((l) => JSON.parse(l) as { key: string; outcome: string });
  const termStored = readdirSync(join(box, "bucket-term", "cards")).length;
  assert(
    // sentAt = the PROGRESS count the test saw when it signalled (≥ 9; one more if it read late): one worker → sentAt or sentAt + 1 lines
    term.code === 143 && term.signal === null && termText.endsWith("\n") && term.sentAt !== null && term.sentAt >= 9 && termRecs.length >= term.sentAt && termRecs.length <= term.sentAt + 1 && termRecs.every((r) => r.outcome === "ok" && /^cards\/10\d\d_dynamic\.webp$/.test(r.key)),
    `SIGTERM after ${term.sentAt} uploads (with the flags): exit ${term.code ?? term.signal}, the results file lists the ${termRecs.length} finished uploads (the running one drained), every line whole`,
  );
  assert(
    termRecs.length === termStored && lastProgress(term.out) === termRecs.length && /stopped by SIGTERM after \d+ of 20 files/.test(term.err) && !existsSync(manifestFile),
    `…the lines = the files stored (${termStored}) = the last PROGRESS line (${lastProgress(term.out)}); "stopped by SIGTERM" on stderr; no manifest written (as an error exit)`,
  );
  const termRead = readUploadResults(rfTerm);
  assert(termRead.present && termRead.uploaded.length === termRecs.length && termRead.skipped === 0, `…and the worker's reader takes every line (${termRead.uploaded.length} uploaded, ${termRead.skipped} skipped)`);

  const rfKill = join(box, "kill-results.jsonl");
  const kill = await stopAt(join(box, "bucket-kill"), ["--progress-every", "1", "--results-file", rfKill], 4, "SIGKILL");
  const killText = lines(rfKill);
  const killLines = killText.split("\n").filter(Boolean);
  const killStored = readdirSync(join(box, "bucket-kill", "cards")).length;
  assert(
    kill.signal === "SIGKILL" && killText.endsWith("\n") && killLines.length >= 4 && killStored - killLines.length >= 0 && killStored - killLines.length <= 1 && killLines.every((l) => { try { const r = JSON.parse(l); return r.outcome === "ok"; } catch { return false; } }),
    `SIGKILL after ${kill.sentAt} uploads: ${killLines.length} whole lines survive of ${killStored} files stored (each line written before its PROGRESS line; at most the in-flight one lost, no torn line)`,
  );
  // a line torn by a kill inside a write: the worker's reader drops that line alone
  const torn = join(box, "torn-results.jsonl");
  writeFileSync(torn, killText + '{"key": "cards/1099_dyn');
  const tornRead = readUploadResults(torn);
  assert(tornRead.uploaded.length === killLines.length && tornRead.skipped === 1, `a torn last line is dropped on its own (${tornRead.uploaded.length} kept, ${tornRead.skipped} skipped)`);

  const rfCtl = join(box, "ctl-results.jsonl");
  const ctl = await stopAt(join(box, "bucket-ctl"), ["--progress-every", "5", "--results-file", rfCtl], 99, "SIGTERM");
  assert(ctl.code === 0 && ctl.sentAt === null && lines(rfCtl).split("\n").filter(Boolean).length === 20 && existsSync(manifestFile), "control run (no signal): 20 lines, exit 0, manifest written");

  // third re-verify W1: a SIGTERM that lands while concurrent.futures holds every future's lock (the stock
  // lock loop made slow: all locks taken, a marker, 300 ms) must not deadlock — exit 143 within 20 s
  const lockWrapper = [
    "import runpy, sys, time, concurrent.futures._base as b",
    "def enter(self):",
    "    for f in self.futures:",
    "        f._condition.acquire()",
    "    sys.stderr.write('LOCKLOOP\\n'); sys.stderr.flush()",
    "    time.sleep(0.3)",
    "b._AcquireFutures.__enter__ = enter",
    "s = sys.argv[1]; sys.argv = sys.argv[1:]",
    "runpy.run_path(s, run_name='__main__')",
  ].join("\n");
  const rfLock = join(box, "lock-results.jsonl");
  const lockBucket = join(box, "bucket-lock");
  mkdirSync(lockBucket, { recursive: true });
  const lock = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; err: string; out: string; hung: boolean; sent: boolean }>((res) => {
    const c = spawn("python3", ["-B", "-u", "-c", lockWrapper, script, "--env", devNull, "--prefix", many, "--workers", "1", "--no-resume", "--progress-every", "1", "--results-file", rfLock], {
      shell: false,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PYTHONIOENCODING: "utf-8", PYTHONPATH: stub, STUB_BUCKET_DIR: lockBucket, STUB_UPLOAD_DELAY_MS: "150", R2_ACCOUNT_ID: "stub-account-000111", R2_ACCESS_KEY_ID: "stub-access", R2_SECRET_ACCESS_KEY: "stub-secret" },
    });
    let out = "";
    let err = "";
    let sent = false;
    let hung = false;
    c.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
    c.stderr.on("data", (b: Buffer) => {
      err += b.toString("utf8");
      // the first marker (every lock held; as_completed() or wait() entering its lock loop): the signal lands
      // inside the window — a handler that raised there would leave the locks held and hang the pool
      if (!sent && b.toString("utf8").includes("LOCKLOOP")) {
        sent = true;
        c.kill("SIGTERM");
      }
    });
    const guard = setTimeout(() => {
      hung = true;
      c.kill("SIGKILL");
    }, 20_000);
    c.on("close", (code, signal) => {
      clearTimeout(guard);
      res({ code, signal, err, out, hung, sent });
    });
  });
  const lockLines = lines(rfLock).split("\n").filter(Boolean);
  const lockStored = existsSync(join(lockBucket, "cards")) ? readdirSync(join(lockBucket, "cards")).length : 0;
  assert(
    lock.sent && !lock.hung && lock.code === 143 && whole(lines(rfLock)) && lockLines.length === lockStored && lastProgress(lock.out) === lockLines.length,
    `SIGTERM while every future's lock is held (inside concurrent.futures' lock loop): exit ${lock.hung ? "— HUNG, killed after 20 s" : lock.code ?? lock.signal}, ${lockLines.length} whole lines = ${lockStored} files stored = the last PROGRESS line (no deadlock)`,
  );

  // third re-verify S3: a SIGTERM right after the handler is installed (before any upload) — the stop is
  // still explained: "stopped by SIGTERM after 0 of 20 files" on stderr, exit 143, nothing uploaded
  const earlyWrapper = [
    "import os, runpy, signal, sys",
    "_orig = signal.signal",
    "def patched(sig, handler):",
    "    prev = _orig(sig, handler)",
    "    if sig == signal.SIGTERM and callable(handler):",
    "        os.kill(os.getpid(), signal.SIGTERM)",
    "    return prev",
    "signal.signal = patched",
    "s = sys.argv[1]; sys.argv = sys.argv[1:]",
    "runpy.run_path(s, run_name='__main__')",
  ].join("\n");
  const rfEarly = join(box, "early-results.jsonl");
  const earlyBucket = join(box, "bucket-early");
  mkdirSync(earlyBucket, { recursive: true });
  rmSync(manifestFile, { force: true });
  const early = await new Promise<{ code: number | null; out: string }>((res) => {
    const c = spawn("python3", ["-B", "-c", earlyWrapper, script, "--env", devNull, "--prefix", many, "--workers", "1", "--no-resume", "--progress-every", "1", "--results-file", rfEarly], {
      shell: false,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PYTHONIOENCODING: "utf-8", PYTHONPATH: stub, STUB_BUCKET_DIR: earlyBucket, STUB_UPLOAD_DELAY_MS: "150", R2_ACCOUNT_ID: "stub-account-000111", R2_ACCESS_KEY_ID: "stub-access", R2_SECRET_ACCESS_KEY: "stub-secret" },
    });
    let out = "";
    c.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
    c.stderr.on("data", (b: Buffer) => (out += b.toString("utf8")));
    c.on("close", (code) => res({ code, out }));
  });
  assert(
    early.code === 143 && /stopped by SIGTERM after 0 of 20 files/.test(early.out) && lines(rfEarly) === "" && !existsSync(join(earlyBucket, "cards")) && !existsSync(manifestFile),
    `SIGTERM between the handler's installation and the first upload: exit ${early.code}, "stopped by SIGTERM after 0 of 20 files" printed, nothing uploaded, empty results file, no manifest`,
  );

  rmSync(manifestFile, { force: true });
  const plainTerm = await stopAt(join(box, "bucket-plain-term"), [], null, "SIGTERM");
  assert(
    plainTerm.code === null && plainTerm.signal === "SIGTERM" && !/stopped by SIGTERM/.test(plainTerm.err) && !existsSync(manifestFile),
    `without the flags a SIGTERM ends the script as before (killed by the signal after ${plainTerm.sentAt} stored files, no handler, no manifest)`,
  );
} finally {
  rmSync(box, { recursive: true, force: true });
}

if (process.exitCode) console.error("\nupload-script tests FAILED");
else console.log("\nupload-script tests passed");
