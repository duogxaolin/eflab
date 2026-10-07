#!/usr/bin/env python3
"""
efootbase_dump.py — Dump toàn bộ data + ảnh efootbase qua API (api2.efootbase.com) + CDN.

Source: APP eFootBase v1.9.7 (Flutter, com.wildpluto.efbase), key EFBASE_API_KEY hardcode
trong assets/flutter_assets/.env. Path B đã reopen 2026-10-06 (user gỡ reject).

Output: dump/efootbase/
  ├── players.jsonl        # 48.407 player, 1 JSON object/line (NDJSON, append-friendly)
  ├── players_meta.json   # /api/meta → field label translations (154 keys)
  ├── teams.json          # /api/teams → 591 team
  ├── packs.json          # /api/packs → specialPlayerList + packs (nested)
  ├── manifest.json       # {dumpedAt, counts, pageCount, keyPrefix, schema}
  └── images/
      ├── cards/          # playerCards: transparent.webp + dynamic.webp (efootbase CDN)
      └── emblems/        # emblemImages: nationality/league/team .png (efootbase CDN)

NOT dumped (intentional):
  - pesdb.net card images (front/back/mobile/compact/portrait) — đã có script pesdb riêng,
    và eflab web dùng efimg.com (decision khác - see CLAUDE.md image pipeline).
  - user data (/api/user-profiles/me*) — gated per-user, không relevant.

Usage:
  python3 scripts/efootbase_dump.py                    # full: data + images
  python3 scripts/efootbase_dump.py --no-images        # chỉ data
  python3 scripts/efootbase_dump.py --no-data         # chỉ ảnh (cần players.jsonl có sẵn)
  python3 scripts/efootbase_dump.py --limit-pages 10  # test 10 page đầu
  python3 scripts/efootbase_dump.py --workers 32
  python3 scripts/efootbase_dump.py --image-types cards,emblems
  python3 scripts/efootbase_dump.py --env /path/to/.env  # override .env path
"""

import argparse
import concurrent.futures
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import urllib.request
import urllib.error

# ---- config ----
DEFAULT_ENV = "/tmp/efootbase_apk_extract/base_decoded/assets/flutter_assets/.env"
DEFAULT_OUT = "dump/efootbase"
API_BASE = "https://api2.efootbase.com/api"
CDN_BASE = "https://cdn.assets.efootbase.com"
UA = "efbase/1.9.7 (com.wildpluto.efbase; Android 14)"
LAST_PAGE = 2017  # verified: page 2017 has 23, page 2018 empty → 48.407 cards total
PAGE_SIZE = 24


def load_key(env_path: str) -> str:
    """Load EFBASE_API_KEY from .env file."""
    if not os.path.exists(env_path):
        sys.exit(f"ERROR: .env not found: {env_path}\nPass --env /path/to/.env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("EFBASE_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if not key:
                    sys.exit("ERROR: EFBASE_API_KEY empty in .env")
                return key
    sys.exit("ERROR: EFBASE_API_KEY not found in .env")


def http_get(url: str, key: str, *, timeout: int = 30) -> bytes:
    """GET with X-API-Key header + UA. Raises on non-200."""
    req = urllib.request.Request(url, headers={
        "X-API-Key": key,
        "User-Agent": UA,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise urllib.error.HTTPError(url, resp.status, "non-200", resp.headers, None)
        return resp.read()


def http_download(url: str, dest: Path, *, timeout: int = 60, retries: int = 2) -> tuple[str, str]:
    """Download URL to dest. Returns (status, url). status ∈ {'ok','skip404','error'}.
    Skip if dest exists (resume). 404 → skip (not an error, e.g., team-virtual emblem)."""
    if dest.exists() and dest.stat().st_size > 0:
        return ("skip_exists", url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last_err = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with open(dest, "wb") as f:
                        f.write(resp.read())
                    return ("ok", url)
                else:
                    last_err = f"HTTP {resp.status}"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ("skip404", url)
            last_err = f"HTTP {e.code}"
        except Exception as e:
            last_err = str(e)[:80]
        if attempt < retries:
            time.sleep(0.5 * (attempt + 1))
    return ("error", f"{url} | {last_err}")


# ---- data dump ----

def dump_players(key: str, out: Path, *, limit_pages: Optional[int] = None, workers: int = 4) -> int:
    """Dump /api/players?page=N → players.jsonl (NDJSON). Returns total dumped count.
    Uses multi-thread on pages (each page = 1 request)."""
    jsonl = out / "players.jsonl"
    jsonl.parent.mkdir(parents=True, exist_ok=True)
    # resume: count existing lines
    existing = 0
    if jsonl.exists():
        with open(jsonl) as f:
            existing = sum(1 for _ in f)
        print(f"  resume: {existing} players already in {jsonl.name}")
    last_page = LAST_PAGE if limit_pages is None else min(limit_pages, LAST_PAGE)
    # resume page: skip pages already covered (existing_count // PAGE_SIZE + 1)
    start_page = 1
    if existing > 0:
        start_page = (existing // PAGE_SIZE) + 1
        if start_page > last_page:
            print(f"  all pages already dumped")
            return existing

    print(f"  dumping pages {start_page}-{last_page} ({last_page - start_page + 1} pages, {workers} workers)")
    pages = list(range(start_page, last_page + 1))
    dumped = existing
    errors = 0
    t0 = time.time()

    with open(jsonl, "a") as fout, concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        # batch by chunks of `workers` to preserve order while parallel
        for batch_start in range(0, len(pages), workers):
            batch = pages[batch_start:batch_start + workers]
            futures = {pool.submit(http_get, f"{API_BASE}/players?page={p}", key): p for p in batch}
            batch_results = []
            for fut in concurrent.futures.as_completed(futures):
                p = futures[fut]
                try:
                    raw = fut.result()
                    data = json.loads(raw)
                    batch_results.append((p, data["data"]))
                except Exception as e:
                    batch_results.append((p, None))
                    errors += 1
                    print(f"  ERROR page {p}: {e}", file=sys.stderr)
            # write in page order
            batch_results.sort(key=lambda x: x[0])
            for p, players in batch_results:
                if not players:
                    continue
                for pl in players:
                    fout.write(json.dumps(pl, ensure_ascii=False) + "\n")
                    dumped += 1
            if dumped % 1000 < PAGE_SIZE * workers:
                rate = dumped / (time.time() - t0) if time.time() > t0 else 0
                print(f"  {dumped} players ({rate:.0f}/s) page {batch_results[-1][0]}/{last_page}")

    print(f"  dumped {dumped - existing} new players, total {dumped}, errors {errors}")
    return dumped


def dump_meta(key: str, out: Path) -> dict:
    raw = http_get(f"{API_BASE}/meta", key)
    meta = json.loads(raw)
    (out / "players_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(f"  meta: {len(meta)} field labels")
    return meta


def dump_teams(key: str, out: Path) -> int:
    raw = http_get(f"{API_BASE}/teams?page=1", key)
    data = json.loads(raw)
    teams = data["data"] if isinstance(data, dict) and "data" in data else data
    (out / "teams.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"  teams: {len(teams)}")
    return len(teams)


def dump_packs(key: str, out: Path) -> dict:
    raw = http_get(f"{API_BASE}/packs?page=1", key)
    data = json.loads(raw)
    (out / "packs.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))
    special = len(data["data"].get("specialPlayerList", [])) if isinstance(data.get("data"), dict) else 0
    packs = len(data["data"].get("packs", [])) if isinstance(data.get("data"), dict) else 0
    print(f"  packs: specialPlayerList={special}, packs={packs}")
    return data


# ---- image dump ----

def collect_image_urls(players_jsonl: Path, teams_json: Path, image_types: set) -> list[tuple[str, str]]:
    """Returns list of (url, filename_relative_to_images/)."""
    urls = []
    seen = set()
    # player images (cards: transparent + dynamic)
    if "cards" in image_types and players_jsonl.exists():
        with open(players_jsonl) as f:
            for line in f:
                p = json.loads(line)
                ci = p.get("card_images") or {}
                for kind in ("transparent", "dynamic"):
                    url = ci.get(kind)
                    if url and url not in seen:
                        seen.add(url)
                        pid = p["id"]
                        # filenames efootbase pattern: {pid}_{kind}.webp
                        urls.append((url, f"cards/{pid}_{kind}.webp"))
    # emblem images (nationality/league/team) from players + teams
    if "emblems" in image_types:
        # from players (unique URLs already in player records)
        if players_jsonl.exists():
            with open(players_jsonl) as f:
                for line in f:
                    p = json.loads(line)
                    ei = p.get("emblem_images") or {}
                    for kind in ("nationality", "league", "team"):
                        url = ei.get(kind)
                        if url and url not in seen:
                            seen.add(url)
                            # hash filename — keep .png
                            fn = Path(urlparse(url).path).name
                            urls.append((url, f"emblems/{kind}/{fn}"))
        # from teams.json (team emblems, may overlap — dedup via seen)
        if teams_json.exists():
            data = json.loads(teams_json.read_text())
            teams = data["data"] if isinstance(data, dict) and "data" in data else data
            for t in teams:
                ei = t.get("emblem_images") or {}
                for kind, url in ei.items():
                    if url and url not in seen:
                        seen.add(url)
                        fn = Path(urlparse(url).path).name
                        urls.append((url, f"emblems/{kind}/{fn}"))
    return urls


def download_images(images_dir: Path, urls: list[tuple[str, str]], workers: int) -> dict:
    """Download all (url, relpath) concurrently. Returns {ok, skip404, skip_exists, error}."""
    stats = {"ok": 0, "skip404": 0, "skip_exists": 0, "error": 0}
    total = len(urls)
    print(f"  downloading {total} images, {workers} workers")
    errors_log = []
    t0 = time.time()
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(http_download, url, images_dir / rel): (url, rel) for url, rel in urls}
        for fut in concurrent.futures.as_completed(futures):
            url, rel = futures[fut]
            try:
                status, _ = fut.result()
                stats[status] = stats.get(status, 0) + 1
            except Exception as e:
                stats["error"] += 1
                errors_log.append(f"{rel}: {e}")
            done += 1
            if done % 500 == 0 or done == total:
                rate = done / (time.time() - t0)
                print(f"  {done}/{total} ({rate:.0f}/s) ok={stats['ok']} 404={stats['skip404']} exist={stats['skip_exists']} err={stats['error']}")
    if errors_log:
        (images_dir.parent / "image_errors.log").write_text("\n".join(errors_log[:200]))
        print(f"  logged {min(len(errors_log), 200)} errors to image_errors.log")
    print(f"  done: ok={stats['ok']} skip404={stats['skip404']} exist={stats['skip_exists']} error={stats['error']}")
    return stats


# ---- main ----

def main():
    ap = argparse.ArgumentParser(description="Dump efootbase data + images via API + CDN")
    ap.add_argument("--env", default=DEFAULT_ENV, help=f"path to .env (default: {DEFAULT_ENV})")
    ap.add_argument("--out", default=DEFAULT_OUT, help=f"output dir (default: {DEFAULT_OUT})")
    ap.add_argument("--no-images", action="store_true", help="skip image download")
    ap.add_argument("--no-data", action="store_true", help="skip data (use existing players.jsonl for images)")
    ap.add_argument("--limit-pages", type=int, default=None, help=f"limit player pages (default: full {LAST_PAGE})")
    ap.add_argument("--workers", type=int, default=16, help="image download workers (default: 16)")
    ap.add_argument("--page-workers", type=int, default=8, help="page fetch workers (default: 8)")
    ap.add_argument("--image-types", default="cards,emblems", help="image types: cards,emblems (default: both)")
    ap.add_argument("--dumped-at", default=None, help="ISO timestamp for manifest (avoids Date.now in automation)")
    args = ap.parse_args()

    key = load_key(args.env)
    key_prefix = key[:4] + "..." + key[-2:]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    images_dir = out / "images"
    image_types = set(args.image_types.split(","))

    print(f"=== efootbase_dump ===")
    print(f"  out: {out}")
    print(f"  key: {key_prefix} (len {len(key)})")
    print(f"  image types: {image_types}")

    manifest = {
        "dumpedAt": args.dumped_at or "manual",
        "source": "api2.efootbase.com (+ cdn.assets.efootbase.com)",
        "keyPrefix": key_prefix,
        "keyLength": len(key),
        "lastPage": LAST_PAGE,
        "pageSize": PAGE_SIZE,
    }

    # ---- data ----
    if not args.no_data:
        print(f"\n[1/4] meta")
        try:
            meta = dump_meta(key, out)
            manifest["metaFields"] = len(meta)
        except Exception as e:
            print(f"  ERROR meta: {e}", file=sys.stderr)

        print(f"\n[2/4] teams")
        try:
            manifest["teamsCount"] = dump_teams(key, out)
        except Exception as e:
            print(f"  ERROR teams: {e}", file=sys.stderr)

        print(f"\n[3/4] packs")
        try:
            dump_packs(key, out)
        except Exception as e:
            print(f"  ERROR packs: {e}", file=sys.stderr)

        print(f"\n[4/4] players (pages 1-{LAST_PAGE})")
        manifest["playersCount"] = dump_players(key, out, limit_pages=args.limit_pages, workers=args.page_workers)

    # ---- images ----
    if not args.no_images:
        players_jsonl = out / "players.jsonl"
        teams_json = out / "teams.json"
        if not players_jsonl.exists():
            print(f"\n  SKIP images: {players_jsonl} not found (run without --no-data first)")
        else:
            print(f"\n[images] collecting URLs from players + teams")
            urls = collect_image_urls(players_jsonl, teams_json if teams_json.exists() else None, image_types)
            manifest["imageUrlsTotal"] = len(urls)
            stats = download_images(images_dir, urls, args.workers)
            manifest["imageStats"] = stats

    # ---- manifest ----
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"\n=== DONE ===")
    print(f"  manifest: {out / 'manifest.json'}")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
