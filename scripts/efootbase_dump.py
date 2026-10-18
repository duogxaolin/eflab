#!/usr/bin/env python3
"""
efootbase_dump.py — Dump toàn bộ data + ảnh efootbase qua API (api2.efootbase.com) + CDN.

Source: APP eFootBase v1.9.7 (Flutter, com.wildpluto.efbase), key EFBASE_API_KEY hardcode
trong assets/flutter_assets/.env. Path B đã reopen 2026-10-06 (user gỡ reject).

Output: dump/efootbase/  (or --out DIR; fresh dumps go to a NEW dir, e.g. dump/efootbase-new/)
  ├── players.jsonl        # 50.691 player (2026-10-18), 1 JSON object/line (NDJSON), written atomically
  ├── players_meta.json   # /api/meta → field label translations (154 keys)
  ├── teams.json          # /api/teams → 591 team
  ├── packs.json          # /api/packs → specialPlayerList + packs (nested)
  ├── manifest.json       # {dumpedAt, keyLength (never the key), pageSize, counts, request counts, imageStats}
  └── images/
      ├── cards/          # playerCards: transparent.webp + dynamic.webp (efootbase CDN)
      └── emblems/        # emblemImages: nationality/league/team .png (efootbase CDN)

NOT dumped (intentional):
  - pesdb.net card images (front/back/mobile/compact/portrait) — đã có script pesdb riêng,
    và eflab web dùng efimg.com (decision khác - see CLAUDE.md image pipeline).
  - user data (/api/user-profiles/me*) — gated per-user, không relevant.

API facts (verified 2026-10-18):
  - /players?page=N[&limit=L][&sort=FIELD&order=asc|desc]: default order = overall_at_max_level desc;
    `limit` up to at least 100 works; `sort=time_added&order=desc` = newest first (time_added = epoch
    seconds of the card's release). `since`/`sortBy`/`sort=-field` are silently ignored.
  - `total_count` / `total_pages` in the response are a LOOKAHEAD ("one more page exists"),
    NOT real totals (page 1 says total_count=limit+1). The end of data is the first short/empty page.

Usage:
  python3 scripts/efootbase_dump.py                    # full: data + images
  python3 scripts/efootbase_dump.py --no-images        # chỉ data
  python3 scripts/efootbase_dump.py --no-data         # chỉ ảnh (cần players.jsonl có sẵn)
  python3 scripts/efootbase_dump.py --limit-pages 10  # test 10 page đầu
  python3 scripts/efootbase_dump.py --workers 4
  python3 scripts/efootbase_dump.py --image-types cards,emblems
  python3 scripts/efootbase_dump.py --env /path/to/.env  # override .env path
  python3 scripts/efootbase_dump.py --out dump/efootbase-new --no-data --only-ids ids.json --skip-from dump/efootbase
      # incremental images: fetch card images only for the ids in ids.json (new + changed cards; card
      # URLs are id-based so a changed card keeps its URL and cannot be detected from the URL), and
      # skip hash-named emblem files the old dump already has. images/ then holds ONLY new/changed files.
      add --etag-vs dump/efootbase to HEAD each card and store it only when its ETag differs from the old file (md5).
  --overwrite   replace an existing players.jsonl (default: refuse, no append/resume ambiguity)

Politeness: defaults are 4 page workers / 4 image workers. HTTP 403/429 or an HTML (challenge)
body aborts the run immediately (exit 2); nothing is retried against a block.
"""

import argparse
import concurrent.futures
import hashlib
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
DEFAULT_PAGE_SIZE = 100  # API accepts limit=100 (default 24) → ~4x fewer requests
MAX_PAGES = 20000        # safety stop if the end-of-data page is never seen
PAGE_RETRIES = 3         # per-page attempts for transient failures (timeouts, 5xx, bad JSON)


class ApiBlocked(Exception):
    """HTTP 403/429 or a non-JSON (challenge) body — stop, do not retry."""


class RequestCounter:
    def __init__(self):
        self.api = 0
        self.cdn = 0


COUNTER = RequestCounter()


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
    """GET with X-API-Key header + UA. Raises ApiBlocked on 403/429 or an HTML body,
    urllib HTTPError on other non-200."""
    COUNTER.api += 1
    req = urllib.request.Request(url, headers={
        "X-API-Key": key,
        "User-Agent": UA,
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                raise urllib.error.HTTPError(url, resp.status, "non-200", resp.headers, None)
            body = resp.read()
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            raise ApiBlocked(f"HTTP {e.code} from {url.split('?')[0]}") from e
        raise
    if body[:1] == b"<":
        raise ApiBlocked(f"HTML (challenge?) body from {url.split('?')[0]}")
    return body


def get_json(url: str, key: str, *, validate=None, retries: int = PAGE_RETRIES):
    """GET + json.loads + optional validate(data) (raise ValueError when the shape is wrong).
    Retries transient failures with backoff; ApiBlocked / 400 / 404 propagate immediately."""
    last = None
    for attempt in range(retries):
        try:
            data = json.loads(http_get(url, key))
            if validate:
                validate(data)
            return data
        except ApiBlocked:
            raise
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                raise
            last = e
        except (ValueError, OSError, urllib.error.URLError) as e:  # JSON/shape/network/timeouts
            last = e
        if attempt < retries - 1:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"{url.split('?')[0]}?{url.split('?', 1)[-1]}: {last}")


def http_download(url: str, dest: Path, *, timeout: int = 60, retries: int = 2,
                  ref: Optional[Path] = None) -> tuple[str, str]:
    """Download URL to dest. Returns (status, url). status ∈ {'ok','skip404','skip_exists','blocked','error'}.
    Skip if dest exists (resume). 404 → skip (not an error, e.g., team-virtual emblem).
    403/429 → 'blocked' (never retried). Writes via a .part file so a crash leaves no truncated image.
    ref = a previously downloaded copy: a HEAD request first, and when the CDN's ETag (md5, DigitalOcean
    Spaces) equals the md5 of ref the file is unchanged → 'not_modified' (nothing stored). The CDN ignores
    If-Modified-Since (verified), so the ETag is the only cheap change signal."""
    if dest.exists() and dest.stat().st_size > 0:
        return ("skip_exists", url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    if ref is not None and ref.exists() and ref.stat().st_size > 0:
        COUNTER.cdn += 1
        try:
            head = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
            with urllib.request.urlopen(head, timeout=timeout) as resp:
                etag = (resp.headers.get("ETag") or "").strip('"')
            if etag and "-" not in etag and hashlib.md5(ref.read_bytes()).hexdigest() == etag:
                return ("not_modified", url)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                return ("blocked", f"{url} | HTTP {e.code}")
            if e.code == 404:
                return ("skip404", url)
        except Exception:
            pass  # fall through to a normal GET
    last_err = None
    for attempt in range(retries + 1):
        COUNTER.cdn += 1
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    tmp = dest.with_name(dest.name + ".part")
                    tmp.write_bytes(resp.read())
                    os.replace(tmp, dest)
                    return ("ok", url)
                else:
                    last_err = f"HTTP {resp.status}"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ("skip404", url)
            if e.code in (403, 429):
                return ("blocked", f"{url} | HTTP {e.code}")
            last_err = f"HTTP {e.code}"
        except Exception as e:
            last_err = str(e)[:80]
        if attempt < retries:
            time.sleep(0.5 * (attempt + 1))
    return ("error", f"{url} | {last_err}")


# ---- data dump ----

def _validate_page(page: int, size: int):
    """Shape check for one /players page; returns a validator for get_json."""
    def v(data):
        if not isinstance(data, dict) or not isinstance(data.get("data"), list):
            raise ValueError("response is not {data: [...]}")
        if data.get("page") not in (page, None):
            raise ValueError(f"page mismatch: asked {page}, got {data.get('page')}")
        if len(data["data"]) > size:
            raise ValueError(f"page has {len(data['data'])} rows > limit {size}")
        for rec in data["data"]:
            if not isinstance(rec, dict) or not isinstance(rec.get("id"), int) or not isinstance(rec.get("name"), str):
                raise ValueError("record without int id / str name")
    return v


def dump_players(key: str, out: Path, *, limit_pages: Optional[int] = None, workers: int = 4,
                 page_size: int = DEFAULT_PAGE_SIZE, overwrite: bool = False) -> dict:
    """Dump /api/players?page=N&limit=L → players.jsonl (NDJSON), written atomically.

    The API's total_count/total_pages are a lookahead, not totals, so the end of data is the first
    short/empty page. Every page is shape-validated and retried; the file is only renamed into place
    after all checks pass (unique ids, line count == rows seen, no gaps). Returns a stats dict."""
    jsonl = out / "players.jsonl"
    part = out / "players.jsonl.partial"
    jsonl.parent.mkdir(parents=True, exist_ok=True)
    if jsonl.exists() and not overwrite:
        sys.exit(f"ERROR: {jsonl} already exists. Dump into a new dir (--out) or pass --overwrite "
                 f"(no append/resume: a dump is always complete or absent).")

    pages: dict[int, list] = {}
    last_meta: dict = {}
    end_page: Optional[int] = None  # first page with len < page_size (rows end here)
    next_page = 1
    t0 = time.time()
    requests0 = COUNTER.api
    print(f"  dumping players: limit={page_size}, {workers} workers (end = first short/empty page)")

    def fetch(pg):
        url = f"{API_BASE}/players?page={pg}&limit={page_size}"
        return pg, get_json(url, key, validate=_validate_page(pg, page_size))

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        while end_page is None:
            if next_page > MAX_PAGES:
                sys.exit(f"ERROR: no short page after {MAX_PAGES} pages — refusing to continue")
            batch = list(range(next_page, next_page + workers))
            if limit_pages is not None:
                batch = [b for b in batch if b <= limit_pages]
                if not batch:
                    break
            futs = [pool.submit(fetch, pg) for pg in batch]
            for fut in concurrent.futures.as_completed(futs):
                pg, resp = fut.result()  # ApiBlocked / RuntimeError propagate → abort, no partial rename
                pages[pg] = resp["data"]
                last_meta[pg] = {k: resp.get(k) for k in ("total_count", "total_pages", "page", "limit")}
            next_page = batch[-1] + 1
            for pg in batch:
                if len(pages[pg]) < page_size and (end_page is None or pg < end_page):
                    end_page = pg
            rows = sum(len(v) for v in pages.values())
            if next_page % 20 < workers + 1:
                rate = rows / max(time.time() - t0, 1e-9)
                print(f"  {rows} rows ({rate:.0f}/s) page {batch[-1]}")

    if end_page is None and limit_pages is None:
        sys.exit("ERROR: end of data not reached")
    last_page = end_page if end_page is not None else max(pages)
    # pages beyond the end must be empty; pages before it must be full
    for pg in sorted(pages):
        if end_page is not None and pg > end_page and pages[pg]:
            sys.exit(f"ERROR: page {pg} has rows after short page {end_page} — API inconsistent, rerun")
        if pg < last_page and len(pages[pg]) != page_size:
            sys.exit(f"ERROR: page {pg} has {len(pages[pg])} rows (expected {page_size}) before end — rerun")

    seen: set[int] = set()
    dup: list[int] = []
    n = 0
    with open(part, "w") as fout:
        for pg in range(1, last_page + 1):
            for pl in pages[pg]:
                if pl["id"] in seen:
                    dup.append(pl["id"])
                    continue
                seen.add(pl["id"])
                fout.write(json.dumps(pl, ensure_ascii=False) + "\n")
                n += 1
    if dup:
        sys.exit(f"ERROR: {len(dup)} duplicate ids across pages (e.g. {dup[:5]}) — data changed mid-dump or "
                 f"unstable sort; kept {part}, rerun")
    with open(part) as f:
        lines = sum(1 for _ in f)
    if lines != n or lines != len(seen):
        sys.exit(f"ERROR: line count {lines} != rows {n} / unique ids {len(seen)}")
    os.replace(part, jsonl)
    stats = {
        "playersCount": n,
        "uniqueIds": len(seen),
        "pageSize": page_size,
        "lastPage": last_page,
        "lastPageRows": len(pages[last_page]),
        "apiLastPageMeta": last_meta.get(last_page),
        "playerRequests": COUNTER.api - requests0,
        "playersSeconds": round(time.time() - t0, 1),
    }
    print(f"  dumped {n} players over {last_page} pages ({stats['playerRequests']} requests, {stats['playersSeconds']}s); "
          f"unique ids OK; last page API meta: {stats['apiLastPageMeta']}")
    return stats


def dump_meta(key: str, out: Path) -> dict:
    def v(d):
        if not isinstance(d, dict) or not d:
            raise ValueError("meta is not a non-empty object")
    meta = get_json(f"{API_BASE}/meta", key, validate=v)
    (out / "players_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(f"  meta: {len(meta)} field labels")
    return meta


def dump_teams(key: str, out: Path) -> int:
    """/api/teams?page=N until an empty or repeated page (the API has returned everything on page 1)."""
    def v(d):
        if not isinstance(d, dict) or not isinstance(d.get("data"), list):
            raise ValueError("teams is not {data: [...]}")
    teams: list = []
    first = None
    prev = None
    for pg in range(1, 51):
        data = get_json(f"{API_BASE}/teams?page={pg}", key, validate=v)
        rows = data["data"]
        sig = json.dumps(rows, sort_keys=True)
        if not rows or sig == prev:
            break
        if first is None:
            first = data
        teams.extend(rows)
        prev = sig
        if len(rows) < 1:
            break
    if first is None:
        raise RuntimeError("teams: empty response")
    first["data"] = teams
    (out / "teams.json").write_text(json.dumps(first, ensure_ascii=False, indent=2))
    print(f"  teams: {len(teams)}")
    return len(teams)


def dump_packs(key: str, out: Path) -> dict:
    def v(d):
        if not isinstance(d, dict) or not isinstance(d.get("data"), dict):
            raise ValueError("packs is not {data: {...}}")
    data = get_json(f"{API_BASE}/packs?page=1", key, validate=v)
    (out / "packs.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))
    special = len(data["data"].get("specialPlayerList", []))
    packs = len(data["data"].get("packs", []))
    print(f"  packs: specialPlayerList={special}, packs={packs}")
    return data


# ---- image dump ----

def collect_image_urls(players_jsonl: Path, teams_json: Optional[Path], image_types: set,
                       only_ids: Optional[set] = None) -> list[tuple[str, str]]:
    """Returns list of (url, filename_relative_to_images/). teams_json may be None/missing.
    only_ids restricts CARD images (not emblems) to those player ids."""
    urls = []
    seen = set()
    want_cards = "cards" in image_types
    want_emblems = "emblems" in image_types
    if players_jsonl.exists() and (want_cards or want_emblems):
        with open(players_jsonl) as f:
            for line in f:
                p = json.loads(line)
                if want_cards and (only_ids is None or p["id"] in only_ids):
                    ci = p.get("card_images") or {}
                    for kind in ("transparent", "dynamic"):
                        url = ci.get(kind)
                        if url and url not in seen:
                            seen.add(url)
                            # filenames efootbase pattern: {pid}_{kind}.webp
                            urls.append((url, f"cards/{p['id']}_{kind}.webp"))
                if want_emblems:
                    ei = p.get("emblem_images") or {}
                    for kind in ("nationality", "league", "team"):
                        url = ei.get(kind)
                        if url and url not in seen:
                            seen.add(url)
                            # hash filename — keep .png
                            fn = Path(urlparse(url).path).name
                            urls.append((url, f"emblems/{kind}/{fn}"))
    # from teams.json (team emblems, may overlap — dedup via seen)
    if want_emblems and teams_json is not None and teams_json.exists():
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


def skip_known_emblems(urls: list[tuple[str, str]], skip_from: Path, image_types: set):
    """Drop emblem URLs the OLD dump already knew (emblem files are named by content hash, so same URL =
    same bytes; a URL it knew without a file was a 404 then). Card images are never skipped here: their
    URL is id-based and the bytes can change. Returns (todo, skipped)."""
    old_players = skip_from / "players.jsonl"
    old_teams = skip_from / "teams.json"
    known = {u for u, rel in collect_image_urls(old_players, old_teams, image_types - {"cards"})} if old_players.exists() else set()
    todo = [(u, rel) for u, rel in urls if not (rel.startswith("emblems/") and u in known)]
    return todo, len(urls) - len(todo)


def download_images(images_dir: Path, urls: list[tuple[str, str]], workers: int, ref_dir: Optional[Path] = None) -> dict:
    """Download all (url, relpath) concurrently. Returns {ok, skip404, skip_exists, blocked, error}.
    Stops (and exits 2) on 403/429 from the CDN."""
    stats = {"ok": 0, "skip404": 0, "skip_exists": 0, "not_modified": 0, "blocked": 0, "error": 0, "bytes": 0}
    total = len(urls)
    print(f"  downloading {total} images, {workers} workers")
    errors_log = []
    new_files: list[str] = []
    t0 = time.time()
    done = 0
    stop = False
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(http_download, url, images_dir / rel, ref=(ref_dir / rel if ref_dir else None)): (url, rel) for url, rel in urls}
        for fut in concurrent.futures.as_completed(futures):
            url, rel = futures[fut]
            try:
                status, info = fut.result()
                stats[status] = stats.get(status, 0) + 1
                if status == "ok":
                    new_files.append(rel)
                    try:
                        stats["bytes"] += (images_dir / rel).stat().st_size
                    except OSError:
                        pass
                elif status == "blocked":
                    errors_log.append(f"{rel}: {info}")
                    stop = True
                elif status == "error":
                    errors_log.append(f"{rel}: {info}")
            except Exception as e:
                stats["error"] += 1
                errors_log.append(f"{rel}: {e}")
            done += 1
            if stop:
                for f2 in futures:
                    f2.cancel()
                break
            if done % 500 == 0 or done == total:
                rate = done / max(time.time() - t0, 1e-9)
                print(f"  {done}/{total} ({rate:.0f}/s) ok={stats['ok']} 404={stats['skip404']} exist={stats['skip_exists']} err={stats['error']}")
    if errors_log:
        (images_dir.parent / "image_errors.log").write_text("\n".join(errors_log[:200]))
        print(f"  logged {min(len(errors_log), 200)} errors to image_errors.log")
    # list of freshly downloaded files = upload candidates (r2_upload skips unchanged anyway)
    (images_dir.parent / "images_new.txt").write_text("\n".join(sorted(new_files)) + ("\n" if new_files else ""))
    print(f"  done: ok={stats['ok']} ({stats['bytes']} bytes) not_modified={stats['not_modified']} skip404={stats['skip404']} exist={stats['skip_exists']} "
          f"blocked={stats['blocked']} error={stats['error']}")
    if stop:
        print("ERROR: CDN returned 403/429 — stopped. See image_errors.log", file=sys.stderr)
        sys.exit(2)
    return stats


# ---- main ----

def main():
    ap = argparse.ArgumentParser(description="Dump efootbase data + images via API + CDN")
    ap.add_argument("--env", default=DEFAULT_ENV, help=f"path to .env (default: {DEFAULT_ENV})")
    ap.add_argument("--out", default=DEFAULT_OUT, help=f"output dir (default: {DEFAULT_OUT})")
    ap.add_argument("--no-images", action="store_true", help="skip image download")
    ap.add_argument("--no-data", action="store_true", help="skip data (use existing players.jsonl for images)")
    ap.add_argument("--limit-pages", type=int, default=None, help="limit player pages (test runs; default: until the end)")
    ap.add_argument("--workers", type=int, default=4, help="image download workers (default: 4)")
    ap.add_argument("--page-workers", type=int, default=4, help="page fetch workers (default: 4)")
    ap.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help=f"players per page (default: {DEFAULT_PAGE_SIZE}; the app uses 24)")
    ap.add_argument("--image-types", default="cards,emblems", help="image types: cards,emblems (default: both)")
    ap.add_argument("--only-ids", default=None, help="JSON list / one-id-per-line file: fetch CARD images only for these player ids")
    ap.add_argument("--etag-vs", default=None, help="old dump dir: HEAD each image and skip it when the CDN ETag (md5) equals the md5 of the old file (unchanged, not stored)")
    ap.add_argument("--skip-from", default=None, help="old dump dir: skip emblem URLs it already knows (hash-named = immutable)")
    ap.add_argument("--overwrite", action="store_true", help="replace an existing players.jsonl (default: refuse)")
    ap.add_argument("--dumped-at", default=None, help="ISO timestamp for manifest (avoids Date.now in automation)")
    args = ap.parse_args()

    key = load_key(args.env)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    images_dir = out / "images"
    image_types = set(args.image_types.split(","))
    started = time.time()

    print(f"=== efootbase_dump ===")
    print(f"  out: {out}")
    print(f"  key: len {len(key)}")
    print(f"  image types: {image_types}")

    manifest = {
        "dumpedAt": args.dumped_at or "manual",
        "source": "api2.efootbase.com (+ cdn.assets.efootbase.com)",
        "keyLength": len(key),
        "pageSize": args.page_size,
    }

    try:
        # ---- data ----
        if not args.no_data:
            print(f"\n[1/4] meta")
            meta = dump_meta(key, out)
            manifest["metaFields"] = len(meta)

            print(f"\n[2/4] teams")
            manifest["teamsCount"] = dump_teams(key, out)

            print(f"\n[3/4] packs")
            dump_packs(key, out)

            print(f"\n[4/4] players")
            manifest.update(dump_players(key, out, limit_pages=args.limit_pages, workers=args.page_workers,
                                         page_size=args.page_size, overwrite=args.overwrite))
            manifest["apiRequests"] = COUNTER.api

        # ---- images ----
        if not args.no_images:
            players_jsonl = out / "players.jsonl"
            teams_json = out / "teams.json"
            if not players_jsonl.exists():
                print(f"\n  SKIP images: {players_jsonl} not found (run without --no-data first)")
            else:
                print(f"\n[images] collecting URLs from players + teams")
                only_ids = None
                if args.only_ids:
                    txt = Path(args.only_ids).read_text().strip()
                    only_ids = {int(x) for x in (json.loads(txt) if txt.startswith("[") else txt.split())}
                    print(f"  only-ids: {len(only_ids)} player ids")
                urls = collect_image_urls(players_jsonl, teams_json if teams_json.exists() else None, image_types, only_ids)
                manifest["imageUrlsTotal"] = len(urls)
                if args.skip_from:
                    urls, skipped = skip_known_emblems(urls, Path(args.skip_from), image_types)
                    manifest["emblemsSkippedKnown"] = skipped
                    print(f"  skip-from {args.skip_from}: known emblems skipped={skipped}, to fetch={len(urls)}")
                stats = download_images(images_dir, urls, args.workers, Path(args.etag_vs) / "images" if args.etag_vs else None)
                manifest["imageStats"] = stats
                manifest["cdnRequests"] = COUNTER.cdn
    except ApiBlocked as e:
        print(f"\nBLOCKED: {e} — stopped, nothing else requested.", file=sys.stderr)
        sys.exit(2)

    # ---- manifest ----
    manifest["durationSeconds"] = round(time.time() - started, 1)
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"\n=== DONE ===")
    print(f"  manifest: {out / 'manifest.json'}")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
