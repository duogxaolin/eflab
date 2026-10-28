#!/usr/bin/env python3
"""
r2_upload.py — Upload toàn bộ ảnh efootbase dump lên Cloudflare R2 bucket.

Source: dump/efootbase/images/ (92.489 cards + 1.011 emblems, ~6.5GB)
Target: R2 bucket `footlab` (public URL via pub-{id}.r2.dev)

S3-compatible API via boto3. Endpoint: https://{ACCOUNT_ID}.r2.cloudflarestorage.com
Credentials đọc từ env (.env hoặc shell): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET.

Key structure (mirror local disk layout onto R2):
  dump/efootbase/images/cards/{pid}_transparent.webp → key "cards/{pid}_transparent.webp"
  dump/efootbase/images/cards/{pid}_dynamic.webp     → key "cards/{pid}_dynamic.webp"
  dump/efootbase/images/emblems/nationality/{hash}.png → key "emblems/nationality/{hash}.png"
  dump/efootbase/images/emblems/league/{hash}.png     → key "emblems/league/{hash}.png"
  dump/efootbase/images/emblems/team/{hash}.png       → key "emblems/team/{hash}.png"

Resume support: HEAD object before PUT. Skip if exists. Saves bandwidth on re-run.
Manifest: dump/efootbase/r2_manifest.json {uploaded, skipped, errors, totalKeys, duration}

Usage:
  python3 scripts/r2_upload.py                    # full upload
  python3 scripts/r2_upload.py --dry-run          # list files, no upload
  python3 scripts/r2_upload.py --limit 100        # upload first 100 files (test)
  python3 scripts/r2_upload.py --workers 32       # default 32
  python3 scripts/r2_upload.py --prefix dump/efootbase/images
  python3 scripts/r2_upload.py --no-resume        # force re-upload (overwrite)

Sync-worker progress / results (openspec admin-sync-live-progress; both opt-in — without them the output
and the files are byte for byte what the script wrote before):
  --progress-every N   print `PROGRESS <done>/<total>` (numbers only) once before the first upload and after
      every N files and the last one
  --results-file PATH  one JSON line per file, {"key": "<bucket key>", "outcome": "<class>"} — ok,
      skipped_exists, or a failure class: http_<status>, timeout, other (never an error text or a URL).
      PATH must be absolute, outside this repository, and not exist yet (created 0600, never through a link).
      Each line is written whole as its upload finishes, so a killed run leaves every finished line.
  With either flag, SIGTERM stops the run cleanly: the handler just sets a flag, which the upload loop reads
  every 0.25 s; nothing more is uploaded, the running uploads finish and are recorded, the last PROGRESS
  line and a "stopped by SIGTERM after N of M files" line are printed, then exit 143 with no manifest (as an
  error exit). A second SIGTERM ends it at once.
"""

from __future__ import annotations  # py3.9 (system python) cannot evaluate `str | None` at def time

import argparse
import concurrent.futures
import json
import os
import signal
import socket
import sys
import threading
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def load_env(env_path: Path) -> None:
    """Load .env file into os.environ (simple parser, no quoting)."""
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def get_creds():
    """Returns (account_id, access_key, secret, bucket) from env."""
    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET", "efootlab")
    missing = [k for k, v in [
        ("R2_ACCOUNT_ID", account_id),
        ("R2_ACCESS_KEY_ID", access_key),
        ("R2_SECRET_ACCESS_KEY", secret),
    ] if not v]
    if missing:
        sys.exit(f"ERROR: missing env: {', '.join(missing)}. Load .env or set in shell.")
    return account_id, access_key, secret, bucket


def make_s3_client(account_id: str, access_key: str, secret: str):
    """R2 S3-compatible client. R2 supports S3 API (no ACL, no streaming speed limit)."""
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(
            max_pool_connections=50,
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=10,
            read_timeout=120,
        ),
    )


def collect_files(prefix: Path, key_prefix: str | None = None) -> list[tuple[Path, str]]:
    """Walk prefix dir → list of (abs_path, key). key = relpath from prefix,
    optionally prepended with `key_prefix` (use when prefix is a leaf dir and
    you want the R2 key to retain the subdir name, e.g. prefix=.../images/managers
    with key_prefix="managers/" → key "managers/{id}.webp").
    Skips OS junk (.DS_Store, Thumbs.db) and hidden files."""
    SKIP = {".DS_Store", "Thumbs.db", ".gitkeep"}
    files = []
    kp = key_prefix.rstrip("/") + "/" if key_prefix else ""
    for p in sorted(prefix.rglob("*")):
        if not p.is_file():
            continue
        if p.name in SKIP or p.name.startswith("."):
            continue
        rel = p.relative_to(prefix)
        key = kp + str(rel).replace(os.sep, "/")
        files.append((p, key))
    return files


def content_type_for(key: str) -> str:
    if key.endswith(".webp"):
        return "image/webp"
    if key.endswith(".png"):
        return "image/png"
    if key.endswith(".jpg") or key.endswith(".jpeg"):
        return "image/jpeg"
    if key.endswith(".svg"):
        return "image/svg+xml"
    return "application/octet-stream"


def object_exists(s3, bucket: str, key: str) -> bool:
    """HEAD object → True if exists."""
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NotFound"):
            return False
        raise


def error_class(e: BaseException) -> str:
    """--results-file failure class of an upload error: http_<status> from an S3 error answer, 'timeout' for a
    connect / read timeout, else 'other' — never the error text."""
    if isinstance(e, ClientError):
        code = (getattr(e, "response", None) or {}).get("ResponseMetadata", {}).get("HTTPStatusCode")
        if isinstance(code, int) and 100 <= code <= 599:
            return f"http_{code}"
        return "other"
    if isinstance(e, (socket.timeout, TimeoutError)) or "Timeout" in type(e).__name__:
        return "timeout"
    return "other"


REPO_ROOT = Path(__file__).resolve().parent.parent


class ResultsFile:
    """--results-file, written as the uploads finish: each record is ONE whole JSON line handed to the kernel
    in one unbuffered os.write (nothing waits in a Python buffer), so a process killed at any moment leaves
    every finished line on disk and at most an unfinished last line, which readers drop."""

    def __init__(self, fd: int):
        self.fd = fd
        self.lock = threading.Lock()  # the completion loop is the only writer today; kept for any later caller

    def write(self, rec: dict) -> None:
        data = (json.dumps(rec, ensure_ascii=True) + "\n").encode("ascii")
        with self.lock:
            while data:
                data = data[os.write(self.fd, data):]

    def close(self) -> None:
        with self.lock:
            if self.fd >= 0:
                os.close(self.fd)
                self.fd = -1


def open_results_file(path: str) -> ResultsFile:
    """--results-file: an absolute path outside this repository that does not exist yet, created 0600 with
    O_EXCL|O_NOFOLLOW (never through a link). Exits with an error otherwise."""
    if not os.path.isabs(path):
        sys.exit(f"ERROR: --results-file must be an absolute path (got {path!r})")
    parent = os.path.realpath(os.path.dirname(path))
    target = os.path.join(parent, os.path.basename(path))
    root = str(REPO_ROOT)
    if os.path.commonpath([root, target]) == root:
        sys.exit("ERROR: --results-file must be outside the repository tree")
    try:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    except OSError as e:
        sys.exit(f"ERROR: --results-file {target}: cannot create it ({e.strerror}; it must not exist yet)")
    return ResultsFile(fd)


class StopRequested(SystemExit):
    """The stop a SIGTERM asked for (--progress-every / --results-file only): exit 143. Raised from ordinary
    code once the uploads already running have been recorded — never from the signal handler."""

    def __init__(self):
        super().__init__(143)


_TERM = {"requested": False}


def _on_sigterm(signum, frame):
    # Never raises: an exception at an arbitrary bytecode — e.g. inside concurrent.futures' loop that takes
    # every future's lock — would leave locks held and deadlock the pool. It only marks the request, which
    # the completion loop reads every 0.25 s. A second SIGTERM ends the script at once (lines already on disk).
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    _TERM["requested"] = True


def run_stoppable(items, submit, take, window: int) -> bool:
    """The completion loop used with --progress-every / --results-file. At most `window` (= the worker count)
    items are submitted at a time, in `items` order, so each concurrent.futures.wait round costs O(window),
    not O(all files), and no item waits queued behind the running ones (a freed worker cannot start one
    before this loop has read the flag); the finished ones of a round are taken in submission order; the
    SIGTERM flag is read every 0.25 s even while every worker is busy. On the flag: nothing more is
    submitted, anything still queued is cancelled, the running ones finish and are taken. Returns True when
    stopped by SIGTERM."""
    it = iter(items)
    order: dict = {}
    pending: set = set()
    seq = 0

    def refill() -> None:
        nonlocal seq
        while len(pending) < window and not _TERM["requested"]:
            item = next(it, None)
            if item is None:
                return
            fut = submit(item)
            order[fut] = seq
            seq += 1
            pending.add(fut)

    refill()
    while pending:
        done, rest = concurrent.futures.wait(pending, timeout=0.25, return_when=concurrent.futures.FIRST_COMPLETED)
        pending.clear()
        pending.update(rest)
        for fut in sorted(done, key=order.__getitem__):
            if not fut.cancelled():
                take(fut)
        if _TERM["requested"]:
            for fut in list(pending):
                if fut.cancel():
                    pending.discard(fut)  # queued, never started
        else:
            refill()
    return _TERM["requested"]


def upload_one(s3, bucket: str, local_path: Path, key: str, *, no_resume: bool) -> tuple:
    """Returns (status, key, failure class or ''). status ∈ {ok, skip_exists, error}."""
    try:
        if not no_resume and object_exists(s3, bucket, key):
            return ("skip_exists", key, "")
        ct = content_type_for(key)
        s3.upload_file(
            str(local_path),
            bucket,
            key,
            ExtraArgs={
                "ContentType": ct,
                "CacheControl": "public, max-age=31536000, immutable",
            },
        )
        return ("ok", key, "")
    except Exception as e:
        return ("error", f"{key} | {str(e)[:120]}", error_class(e))


def main():
    ap = argparse.ArgumentParser(description="Upload dump/efootbase/images to Cloudflare R2")
    ap.add_argument("--env", default=".env", help="path to .env (default: .env)")
    ap.add_argument("--prefix", default="dump/efootbase/images", help="local dir to upload (default: dump/efootbase/images)")
    ap.add_argument("--key-prefix", default=None, help="optional R2 key prefix to PREPEND to relpath (e.g. 'managers/' when prefix is a leaf dir)")
    ap.add_argument("--workers", type=int, default=32, help="upload workers (default: 32)")
    ap.add_argument("--limit", type=int, default=None, help="limit N files (test mode)")
    ap.add_argument("--dry-run", action="store_true", help="list files, no upload")
    ap.add_argument("--no-resume", action="store_true", help="force re-upload (skip HEAD check)")
    # ---- sync-worker progress / results (openspec admin-sync-live-progress); off by default ----
    ap.add_argument("--progress-every", type=int, default=None, metavar="N",
                    help="print 'PROGRESS <done>/<total>' before the first upload and every N files (numbers only)")
    ap.add_argument("--results-file", default=None, metavar="PATH",
                    help="one JSON line per file {key, outcome} to PATH (absolute, outside the repository, new)")
    args = ap.parse_args()
    if args.progress_every is not None and args.progress_every < 1:
        sys.exit("ERROR: --progress-every must be at least 1")
    results_fh = open_results_file(args.results_file) if args.results_file else None
    stoppable = args.progress_every is not None or results_fh is not None
    if stoppable:
        # only with the sync-worker flags (without them a SIGTERM ends the script exactly as before)
        signal.signal(signal.SIGTERM, _on_sigterm)

    repo_root = Path(__file__).resolve().parent.parent
    load_env(repo_root / args.env)

    account_id, access_key, secret, bucket = get_creds()
    prefix = (repo_root / args.prefix).resolve() if not Path(args.prefix).is_absolute() else Path(args.prefix).resolve()
    if not prefix.exists():
        sys.exit(f"ERROR: prefix not found: {prefix}")

    print(f"=== r2_upload ===")
    print(f"  bucket: {bucket}")
    print(f"  account: {account_id[:6]}...{account_id[-4:]}")
    print(f"  prefix: {prefix}")
    print(f"  workers: {args.workers}")

    files = collect_files(prefix, key_prefix=args.key_prefix)
    total = len(files)
    if args.limit:
        files = files[:args.limit]
        print(f"  limit: {args.limit} (of {total} total)")
    print(f"  files to process: {len(files)}")

    if args.dry_run:
        print(f"\n[dry-run] sample keys (first 10):")
        for p, k in files[:10]:
            size = p.stat().st_size
            print(f"  {k}  ({size:,} B)")
        print(f"...\n[dry-run] total {len(files)} files, would upload to bucket {bucket}")
        if results_fh is not None:  # nothing uploaded: left empty
            results_fh.close()
        if _TERM["requested"]:
            print(f"[upload] stopped by SIGTERM after 0 of {len(files)} files (dry run); no manifest written", file=sys.stderr)
            raise StopRequested()
        return

    s3 = make_s3_client(account_id, access_key, secret)
    stats = {"ok": 0, "skip_exists": 0, "error": 0}
    errors_log = []
    t0 = time.time()
    done = 0

    print(f"\n[upload] starting {len(files)} files, {args.workers} workers...")
    if args.progress_every and files:
        print(f"PROGRESS 0/{len(files)}")
    progress_shown = 0
    key_of: dict = {}  # submitted future → its bucket key (both loops fill it)

    def take(fut) -> None:
        """One finished upload: its counts and error line, its results line (written now, before the progress
        line that announces it), then the progress lines."""
        nonlocal done, progress_shown
        k = key_of[fut]
        try:
            status, info, reason = fut.result()
            stats[status] = stats.get(status, 0) + 1
            if status == "error":
                errors_log.append(info)
            if results_fh is not None:
                results_fh.write({"key": k, "outcome": "skipped_exists" if status == "skip_exists" else (reason or "other") if status == "error" else "ok"})
        except Exception as e:
            stats["error"] += 1
            errors_log.append(f"{k} | {str(e)[:120]}")
            if results_fh is not None:
                results_fh.write({"key": k, "outcome": error_class(e)})
        done += 1
        if args.progress_every and (done % args.progress_every == 0 or done == len(files)):
            print(f"PROGRESS {done}/{len(files)}")
            progress_shown = done
        if done % 500 == 0 or done == len(files):
            rate = done / (time.time() - t0) if time.time() > t0 else 0
            print(f"  {done}/{len(files)} ({rate:.0f}/s) ok={stats['ok']} skip={stats['skip_exists']} err={stats['error']}")

    stopped = False
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        def submit(item):
            p, k = item
            fut = pool.submit(upload_one, s3, bucket, p, k, no_resume=args.no_resume)
            key_of[fut] = k
            return fut

        if stoppable:
            stopped = run_stoppable(files, submit, take, window=max(1, args.workers))
        else:
            futures = [submit(item) for item in files]  # the loop as it always was
            for fut in concurrent.futures.as_completed(futures):
                take(fut)

    if results_fh is not None:
        results_fh.close()
    if stopped:
        if args.progress_every and progress_shown != done:
            print(f"PROGRESS {done}/{len(files)}")
        print(f"[upload] stopped by SIGTERM after {done} of {len(files)} files "
              f"(ok={stats['ok']} skip={stats['skip_exists']} err={stats['error']}); no manifest written", file=sys.stderr)
        raise StopRequested()

    duration = time.time() - t0
    manifest = {
        "uploadedAt": "manual",
        "bucket": bucket,
        "prefix": str(prefix),
        "totalFiles": len(files),
        "stats": stats,
        "durationSeconds": round(duration, 1),
        "errors": errors_log[:200],
    }
    manifest_path = repo_root / "dump" / "efootbase" / "r2_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    public_base = os.environ.get("R2_PUBLIC_BASE", f"https://pub-XXXXX.r2.dev")
    print(f"\n=== DONE ===")
    print(f"  ok={stats['ok']} skip_exists={stats['skip_exists']} error={stats['error']}")
    print(f"  duration: {duration:.0f}s")
    print(f"  manifest: {manifest_path}")
    if stats["ok"] > 0:
        sample_key = files[0][1] if files else "cards/sample.webp"
        print(f"  sample URL: {public_base}/{sample_key}")
    if errors_log:
        print(f"  ⚠ {len(errors_log)} errors (first 5):")
        for e in errors_log[:5]:
            print(f"    {e}")


if __name__ == "__main__":
    main()
