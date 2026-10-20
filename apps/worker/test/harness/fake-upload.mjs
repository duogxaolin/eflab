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

import { appendFileSync, copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dest = opt("--dest");
const prefix = opt("--prefix");
const keyPrefix = opt("--key-prefix") ?? "";
if (!dest || !prefix) {
  console.error("fake-upload: --dest and --prefix are required");
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
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
let ok = 0;
for (const file of walk(prefix)) {
  const key = keyPrefix + relative(prefix, file).split("\\").join("/");
  if (key.endsWith("_manifest.json")) continue;
  const target = join(dest, key);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  ok++;
}
console.log("=== DONE ===");
console.log(`  ok=${ok} skip_exists=0 error=0`);
