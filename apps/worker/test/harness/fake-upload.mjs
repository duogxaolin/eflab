#!/usr/bin/env node
// Stand-in for scripts/r2_upload.py in the worker tests (openspec change
// admin-sync-worker, task 5.6). Never contacts a bucket: it copies the files of
// --prefix into the local --dest directory under --key-prefix + relative path,
// prints r2_upload.py-like summary lines and appends one JSON line per call to
// <dest>/_invocations.jsonl with its arguments and the NAMES (not values) of
// the environment variables it received.
//
// Use as SYNC_R2_UPLOAD_CMD='["<node>", "<this file>", "--dest", "<dir>"]'; the
// worker appends r2_upload.py's own arguments (--prefix, --key-prefix,
// --no-resume, …). With --echo-secret it also prints R2_SECRET_ACCESS_KEY (the
// redaction test reads it back from the stored log tail).
//
// The opt-in flags of r2_upload.py (openspec change admin-sync-live-progress)
// behave as in the real script: --progress-every N prints `PROGRESS <done>/<total>`
// before the first file, every N files and after the last; --results-file PATH
// writes one `{"key", "outcome"}` JSON line per file (PATH must be absolute and
// new). Test-only: --fail-match <text> fails every key containing <text> (outcome
// http_500, not copied); --delay-ms <n> waits n ms per file; --results-extra <line>
// appends a raw line to the results file (a hostile record the worker must drop);
// --die-after <n> kills itself with SIGKILL after n files (an upload child that dies
// part-way — its results file holds the n lines written so far, nothing else).
//
// Stopping, as the real script does since the fix round (verify W2): each results line
// is written (synchronously, whole) as its file finishes; with --progress-every or
// --results-file a SIGTERM lets the file in progress finish and be recorded, then
// exits 143 with no summary line; without those flags a SIGTERM kills it at once.

import { appendFileSync, copyFileSync, mkdirSync, openSync, readdirSync, statSync, writeSync, closeSync, constants } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dest = opt("--dest");
const prefix = opt("--prefix");
const keyPrefix = opt("--key-prefix") ?? "";
const progressEvery = opt("--progress-every") ? Number(opt("--progress-every")) : 0;
const resultsFile = opt("--results-file");
const failMatch = opt("--fail-match");
const delayMs = Number(opt("--delay-ms") ?? 0);
const resultsExtra = opt("--results-extra");
const dieAfter = opt("--die-after") ? Number(opt("--die-after")) : null;
if (!dest || !prefix) {
  console.error("fake-upload: --dest and --prefix are required");
  process.exit(2);
}
let resultsFd = null;
if (resultsFile) {
  if (!isAbsolute(resultsFile)) {
    console.error("ERROR: --results-file must be an absolute path");
    process.exit(1);
  }
  resultsFd = openSync(resultsFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
}
let stopRequested = false;
if (progressEvery > 0 || resultsFile) {
  // like r2_upload.py with its flags: finish the file in progress, record it, exit 143 (a second SIGTERM kills)
  process.once("SIGTERM", () => {
    stopRequested = true;
    process.once("SIGTERM", () => process.kill(process.pid, "SIGKILL"));
  });
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

mkdirSync(dest, { recursive: true });
appendFileSync(join(dest, "_invocations.jsonl"), JSON.stringify({ argv, envNames: Object.keys(process.env).sort() }) + "\n");
console.log("=== r2_upload (stand-in) ===");
console.log(`  prefix: ${prefix}`);
if (argv.includes("--echo-secret")) console.log(`  secret: ${process.env.R2_SECRET_ACCESS_KEY ?? ""}`);
const files = walk(prefix).filter((f) => !(keyPrefix + relative(prefix, f)).endsWith("_manifest.json"));
let ok = 0;
let errors = 0;
let done = 0;
if (progressEvery > 0 && files.length > 0) console.log(`PROGRESS 0/${files.length}`);
for (const file of files) {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  const key = keyPrefix + relative(prefix, file).split("\\").join("/");
  let outcome = "ok";
  if (failMatch && key.includes(failMatch)) {
    errors++;
    outcome = "http_500";
  } else {
    const target = join(dest, key);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
    ok++;
  }
  if (resultsFd !== null) writeSync(resultsFd, JSON.stringify({ key, outcome }) + "\n"); // whole line, now
  done++;
  if (dieAfter !== null && done >= dieAfter) process.kill(process.pid, "SIGKILL"); // no close, no summary
  if (progressEvery > 0 && (done % progressEvery === 0 || done === files.length)) console.log(`PROGRESS ${done}/${files.length}`);
  if (stopRequested) {
    if (resultsFd !== null) closeSync(resultsFd);
    if (progressEvery > 0 && done % progressEvery !== 0 && done !== files.length) console.log(`PROGRESS ${done}/${files.length}`);
    console.error(`[upload] stopped by SIGTERM after ${done} of ${files.length} files; no manifest written`);
    await new Promise((r) => process.stdout.write("", r)); // let the lines above reach the pipe
    process.exit(143);
  }
}
if (resultsFd !== null) {
  if (resultsExtra) writeSync(resultsFd, resultsExtra + "\n");
  closeSync(resultsFd);
}
console.log("=== DONE ===");
console.log(`  ok=${ok} skip_exists=0 error=${errors}`);
