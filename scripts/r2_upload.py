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
"""

import argparse
import concurrent.futures
import json
import os
import sys
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


def upload_one(s3, bucket: str, local_path: Path, key: str, *, no_resume: bool) -> tuple[str, str]:
    """Returns (status, key). status ∈ {ok, skip_exists, error}."""
    try:
        if not no_resume and object_exists(s3, bucket, key):
            return ("skip_exists", key)
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
        return ("ok", key)
    except Exception as e:
        return ("error", f"{key} | {str(e)[:120]}")


def main():
    ap = argparse.ArgumentParser(description="Upload dump/efootbase/images to Cloudflare R2")
    ap.add_argument("--env", default=".env", help="path to .env (default: .env)")
    ap.add_argument("--prefix", default="dump/efootbase/images", help="local dir to upload (default: dump/efootbase/images)")
    ap.add_argument("--key-prefix", default=None, help="optional R2 key prefix to PREPEND to relpath (e.g. 'managers/' when prefix is a leaf dir)")
    ap.add_argument("--workers", type=int, default=32, help="upload workers (default: 32)")
    ap.add_argument("--limit", type=int, default=None, help="limit N files (test mode)")
    ap.add_argument("--dry-run", action="store_true", help="list files, no upload")
    ap.add_argument("--no-resume", action="store_true", help="force re-upload (skip HEAD check)")
    args = ap.parse_args()

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
        return

    s3 = make_s3_client(account_id, access_key, secret)
    stats = {"ok": 0, "skip_exists": 0, "error": 0}
    errors_log = []
    t0 = time.time()
    done = 0

    print(f"\n[upload] starting {len(files)} files, {args.workers} workers...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(upload_one, s3, bucket, p, k, no_resume=args.no_resume): k
            for p, k in files
        }
        for fut in concurrent.futures.as_completed(futures):
            k = futures[fut]
            try:
                status, info = fut.result()
                stats[status] = stats.get(status, 0) + 1
                if status == "error":
                    errors_log.append(info)
            except Exception as e:
                stats["error"] += 1
                errors_log.append(f"{k} | {str(e)[:120]}")
            done += 1
            if done % 500 == 0 or done == len(files):
                rate = done / (time.time() - t0) if time.time() > t0 else 0
                print(f"  {done}/{len(files)} ({rate:.0f}/s) ok={stats['ok']} skip={stats['skip_exists']} err={stats['error']}")

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
