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

Sync-worker modes (openspec admin-sync-worker; all optional — without them the script behaves as before):
  python3 scripts/efootbase_dump.py --key-from-env --out /tmp/x --data-parts meta,players \\
      --newest-first-since 1791417600 --no-images
      # incremental: pages with sort=time_added&order=desc, ONE request at a time, stop after the first
      # page whose cards are all older than EPOCH (or the first short page); players.jsonl (atomic) holds
      # only the cards with time_added >= EPOCH. Aborts (exit 1) if the API does not return them newest
      # first (an ignored sort parameter would otherwise look like "nothing new").
  python3 scripts/efootbase_dump.py --meta-packs-only --no-images ...   # only players_meta.json + packs.json
  --data-parts meta,teams,packs,players   which data endpoints to fetch (default: all four, as before)
  --etag-vs-bucket https://<public bucket base>   before downloading an image, HEAD it on the CDN and HEAD
      the object already in the image bucket (public URL, no credentials); skip it when both ETags are
      the same plain md5, download it when they differ or the bucket has no object. A hash-named emblem
      the bucket already holds is skipped without a CDN request. images_overwritten.txt lists downloaded
      files that replace a bucket object (the "overwritten" count). Not combinable with --etag-vs.
  --key-from-env   read EFBASE_API_KEY from the process environment instead of the --env file (the worker
      passes the key to its child this way — never as an argument, never in a file)
  --api-base URL   API base (default https://api2.efootbase.com/api); tests point it at a local fake server
  --allow-host HOST:PORT   TESTS ONLY: also accept image URLs on this loopback host:port (http or https);
      refused unless SYNC_TEST_MODE=1 is set in the environment. Repeatable.

  --validate-only   run every source-data check below over <out>/players.jsonl and <out>/teams.json and
      exit 1 listing each refused entry (exit 0 when there is none); no request, no file written. The sync
      worker runs it before any database write.

Source-data safety (openspec admin-sync-worker, verify findings C1, W-a, W-b, W-e): image URLs, file names,
ids and shapes come from the source, so they are checked before any request or write.
  - URLs: https on port 443, no user-info; `dynamic` card renders and emblems only from the efootbase CDN
    host, `transparent` renders from that CDN or from pesdb.net under /assets/img/ (the source's own
    renders live there). Tests add loopback host:port entries with --allow-host (SYNC_TEST_MODE=1 only).
  - Shapes: a row, card_images, emblem_images or teams.json's data that is not the expected object / list
    is refused (counted), never a crash. Card ids are positive integers; emblem kinds are only
    nationality / league / team; file names fully match [A-Za-z0-9][A-Za-z0-9._-]*, emblems end in .png.
  - Writes: every path is checked to resolve inside the output directory and NOTHING below the --out
    directory may be a symbolic link (a directory, the target or its .part file): such a write is refused.
    The --out path itself is resolved once. Image bodies are written to a fresh .part (O_EXCL|O_NOFOLLOW)
    and renamed.
  - Bodies: an image is stored only when it is at most 10 MB (read in chunks) and carries a PNG / WEBP /
    JPEG / GIF signature — the Content-Type is never trusted (third verify S1); an HTML body (also behind a
    UTF-8 BOM / whitespace) is a challenge; anything else is an error (never stored, never counted as
    overwritten). API bodies are bounded (32 MB); an API challenge behind a BOM / whitespace is a block (S2).
  - Paths of allow-listed URLs contain neither "%" nor a "." / ".." segment (S3).
  - Redirects: never to another scheme / host / port or to a URL with user-info (urllib would otherwise
    forward the X-API-Key header).
  A refused entry is skipped, counted (imageStats.refused, manifest imageUrlsRefused) and listed in
  image_errors.log. Every image not stored for a reason other than "unchanged" / 404 is listed in
  images_failed.txt (the sync worker keeps those cards owed and retries them).

--etag-vs-bucket and "overwritten" (third verify W2): a downloaded body equal to the bucket object's
content-MD5 ETag is dropped; a differing one is a verified overwrite (images_overwritten.txt); a bucket
object whose ETag is not a content MD5 (or an unusable bucket answer) makes a replacement "unverified"
(images_unverified.txt, stats "unverified") — never "overwritten".

Politeness: defaults are 4 page workers / 4 image workers. HTTP 403/429 or an HTML (challenge)
body from efootbase's API or CDN aborts the run immediately (exit 2); nothing is retried against a block.
The same from a third-party image host (pesdb.net; --allow-third-party-host in tests) only skips that
host's remaining images for this run (imageStats hostBlocked / hostSkipped, images_failed.txt), exit 0.
"""

import argparse
import concurrent.futures
import hashlib
import ipaddress
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

import urllib.request
import urllib.error

# ---- config ----
DEFAULT_ENV = "/tmp/efootbase_apk_extract/base_decoded/assets/flutter_assets/.env"
DEFAULT_OUT = "dump/efootbase"
API_BASE = "https://api2.efootbase.com/api"
CDN_BASE = "https://cdn.assets.efootbase.com"
# The source's `transparent` card renders are pesdb.net images (36,815 of the 50,691 cards of the
# 2026-10-18 dump, 2,139 of its 2,284 newest); every other image the script fetches is on CDN_BASE.
PESDB_IMAGE_BASE = "https://pesdb.net"
UA = "efbase/1.9.7 (com.wildpluto.efbase; Android 14)"
DEFAULT_PAGE_SIZE = 100  # API accepts limit=100 (default 24) → ~4x fewer requests
MAX_PAGES = 20000        # safety stop if the end-of-data page is never seen
PAGE_RETRIES = 3         # per-page attempts for transient failures (timeouts, 5xx, bad JSON)
DATA_PARTS = ("meta", "teams", "packs", "players")  # --data-parts order = fetch order


class ApiBlocked(Exception):
    """HTTP 403/429 or a non-JSON (challenge) body — stop, do not retry."""


class RequestCounter:
    def __init__(self):
        self.api = 0
        self.cdn = 0
        self.bucket = 0  # HEAD requests to our own image bucket (--etag-vs-bucket)


COUNTER = RequestCounter()


# ---- source-data safety (see the module docstring) ----

# Image hosts per image kind (https, port 443), derived from the base URLs above (verify finding W-e:
# pesdb.net only for the `transparent` renders, and only under its /assets/img/ path).
CDN_HOST = urlparse(CDN_BASE).hostname
PESDB_HOST = urlparse(PESDB_IMAGE_BASE).hostname
IMAGE_HOSTS = {
    "transparent": {CDN_HOST: "/", PESDB_HOST: "/assets/img/"},
    "dynamic": {CDN_HOST: "/"},
    "emblems": {CDN_HOST: "/"},
}
CARD_KINDS = ("transparent", "dynamic")
EMBLEM_KINDS = ("nationality", "league", "team")
SAFE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")  # used with fullmatch (no "$" newline loophole)
MAX_IMAGE_BYTES = 10 * 1024 * 1024   # largest image of the 2026-10-18 dump: 168 KB
MAX_API_BYTES = 32 * 1024 * 1024     # largest API answer: packs.json, 1.5 MB
IMAGE_MAGIC = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"GIF87a", b"GIF89a")  # + RIFF....WEBP
# --allow-host entries ("host:port", loopback only, SYNC_TEST_MODE=1 only): treated as efootbase's own hosts
TEST_ALLOWED_NETLOCS: set = set()
# --allow-third-party-host entries: treated like pesdb.net (only `transparent`, a refusal skips only that host)
TEST_THIRD_PARTY_NETLOCS: set = set()
UTF8_BOM = b"\xef\xbb\xbf"
# entries refused while collecting image URLs: "<what>: <reason>"
REFUSED: list = []


class UnsafePath(Exception):
    """A destination outside the directory it must stay in, or reached through a symbolic link."""


class BodyTooLarge(Exception):
    """A response body over its bound."""


def _default_port(scheme: str) -> Optional[int]:
    return {"http": 80, "https": 443}.get(scheme)


def _origin(url: str) -> tuple:
    u = urlparse(url)
    return (u.scheme, (u.hostname or "").lower(), u.port or _default_port(u.scheme))


def _is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def image_url_allowed(url, kind: str) -> bool:
    """True when `url` may be fetched for an image of `kind` ("transparent" / "dynamic" / "emblems")."""
    if not isinstance(url, str) or not url.isascii() or any(c.isspace() or c == "\\" for c in url):
        return False
    try:
        u = urlparse(url)
        port = u.port
    except ValueError:
        return False
    host = (u.hostname or "").lower()
    if not host or u.username is not None or u.password is not None or "@" in u.netloc:
        return False
    # no percent-encoding and no dot segment in the path (third verify S3; 0 real URLs have either)
    if "%" in u.path or any(seg in (".", "..") for seg in u.path.split("/")):
        return False
    netloc = f"{host}:{port}"
    if u.scheme in ("http", "https") and port is not None and netloc in TEST_ALLOWED_NETLOCS:
        return True
    if u.scheme in ("http", "https") and port is not None and netloc in TEST_THIRD_PARTY_NETLOCS:
        return kind == "transparent"
    prefix = IMAGE_HOSTS.get(kind, {}).get(host)
    return u.scheme == "https" and port in (None, 443) and prefix is not None and u.path.startswith(prefix)


def image_host(url: str) -> str:
    """host[:port] of an image URL (the unit a refusal applies to)."""
    u = urlparse(url)
    return f"{(u.hostname or '').lower()}:{u.port or _default_port(u.scheme)}"


def is_third_party(url: str) -> bool:
    """True for an image host that is not efootbase's own (pesdb.net; --allow-third-party-host in tests):
    its 403 / 429 / challenge skips only its own images for the rest of the run, it never blocks the run
    (third verify W1). efootbase's API / CDN refusals still block."""
    u = urlparse(url)
    host = (u.hostname or "").lower()
    return host == PESDB_HOST or f"{host}:{u.port or _default_port(u.scheme)}" in TEST_THIRD_PARTY_NETLOCS


def safe_name(name) -> bool:
    return isinstance(name, str) and name not in (".", "..") and SAFE_NAME.fullmatch(name) is not None


def dest_under(base: Path, rel: str) -> Path:
    """base/rel, refused (UnsafePath) unless it resolves inside base and no path component below base —
    directory or target — is a symbolic link."""
    root = os.path.realpath(base)
    path = os.path.normpath(os.path.join(root, rel))
    if os.path.commonpath([root, path]) != root or path == root:
        raise UnsafePath(f"{rel!r} leaves {base}")
    cur = root
    for part in os.path.relpath(path, root).split(os.sep):
        cur = os.path.join(cur, part)
        if os.path.islink(cur):
            raise UnsafePath(f"{rel!r}: {cur} is a symbolic link")
    if os.path.realpath(path) != path:
        raise UnsafePath(f"{rel!r} resolves elsewhere")
    return Path(path)


def write_text_under(base: Path, name: str, text: str) -> Path:
    """Every fixed-name output file goes through here (checked to stay inside base, no link)."""
    p = dest_under(base, name)
    p.write_text(text)
    return p


def write_bytes_new(dest: Path, data: bytes) -> None:
    """dest via a fresh .part file (O_CREAT|O_EXCL|O_NOFOLLOW: never through a link) renamed into place."""
    tmp = dest_under(dest.parent, dest.name + ".part")
    if os.path.lexists(tmp):
        os.unlink(tmp)  # a stale .part (unlink removes a link itself, never its target)
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o644)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
    except BaseException:
        os.unlink(tmp)
        raise
    os.replace(tmp, dest)


def read_bounded(resp, limit: int) -> bytes:
    """resp body in 64 KB chunks; BodyTooLarge past `limit` bytes."""
    chunks, n = [], 0
    while True:
        chunk = resp.read(65536)
        if not chunk:
            return b"".join(chunks)
        n += len(chunk)
        if n > limit:
            raise BodyTooLarge(f"body larger than {limit} bytes")
        chunks.append(chunk)


def _strip_bom_ws(body: bytes) -> bytes:
    """Leading UTF-8 BOM(s) and whitespace removed (a challenge page may start with either)."""
    b = body.lstrip()
    while b.startswith(UTF8_BOM):
        b = b[len(UTF8_BOM):].lstrip()
    return b


def image_body_problem(body: bytes, content_type: str) -> Optional[str]:
    """None when `body` may be stored as an image: it must carry a PNG / WEBP / JPEG / GIF signature — the
    Content-Type is never trusted (third verify S1). 'html' for a challenge page (BOM / whitespace allowed
    before it), else why it is refused."""
    ct = (content_type or "").split(";")[0].strip().lower()
    head = _strip_bom_ws(body[:1024]).lower()
    if ct == "text/html" or head.startswith((b"<!doctype html", b"<html")):
        return "html"
    if body.startswith(IMAGE_MAGIC) or (body[:4] == b"RIFF" and body[8:12] == b"WEBP"):
        return None
    return f"not an image (Content-Type {ct or 'none'}, no PNG/WEBP/JPEG/GIF signature)"


class _SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to the same scheme, host and port without user-info — never elsewhere
    (urllib would carry the X-API-Key header along) and never from https to http."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urljoin(req.full_url, newurl)
        t = urlparse(target)
        if _origin(target) != _origin(req.full_url) or t.username is not None or t.password is not None or "@" in t.netloc:
            raise urllib.error.HTTPError(req.full_url, code,
                                         f"redirect to another origin or with user-info refused ({t.scheme}://{t.hostname})", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(_SameOriginRedirect)


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


def load_key_from_environment() -> str:
    """EFBASE_API_KEY from the process environment (--key-from-env)."""
    key = os.environ.get("EFBASE_API_KEY", "").strip()
    if not key:
        sys.exit("ERROR: --key-from-env given but EFBASE_API_KEY is not set in the environment")
    return key


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
        with OPENER.open(req, timeout=timeout) as resp:
            if resp.status != 200:
                raise urllib.error.HTTPError(url, resp.status, "non-200", resp.headers, None)
            body = read_bounded(resp, MAX_API_BYTES)
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            raise ApiBlocked(f"HTTP {e.code} from {url.split('?')[0]}") from e
        raise
    if _strip_bom_ws(body[:1024])[:1] == b"<":  # BOM / whitespace before it still a challenge (third verify S2)
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
        except (ApiBlocked, BodyTooLarge):
            raise
        except urllib.error.HTTPError as e:
            if e.code in (400, 404) or 300 <= e.code < 400:  # a refused redirect is not retried
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
    If-Modified-Since (verified), so the ETag is the only cheap change signal.
    The caller has checked url (image_url_allowed) and dest (dest_under); a redirect to another origin is
    refused (OPENER) and not retried."""
    if dest.exists() and dest.stat().st_size > 0:
        return ("skip_exists", url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    if ref is not None and ref.exists() and ref.stat().st_size > 0:
        COUNTER.cdn += 1
        try:
            head = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
            with OPENER.open(head, timeout=timeout) as resp:
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
            with OPENER.open(req, timeout=timeout) as resp:
                if resp.status == 200:
                    try:
                        body = read_bounded(resp, MAX_IMAGE_BYTES)
                    except BodyTooLarge as e:
                        return ("error", f"{url} | refused: {e}")  # not retried, never stored
                    problem = image_body_problem(body, resp.headers.get("Content-Type", ""))
                    if problem == "html":
                        return ("blocked", f"{url} | HTML (challenge?) body")
                    if problem:
                        return ("error", f"{url} | refused: {problem}")
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest_under(dest.parent, dest.name)  # re-checked after mkdir: no link below the root
                    write_bytes_new(dest, body)
                    return ("ok", url)
                else:
                    last_err = f"HTTP {resp.status}"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ("skip404", url)
            if e.code in (403, 429):
                return ("blocked", f"{url} | HTTP {e.code}")
            if 300 <= e.code < 400:
                return ("error", f"{url} | HTTP {e.code}: {e.msg}")
            last_err = f"HTTP {e.code}"
        except UnsafePath as e:
            return ("refused", f"{url} | {e}")
        except Exception as e:
            last_err = str(e)[:80]
        if attempt < retries:
            time.sleep(0.5 * (attempt + 1))
    return ("error", f"{url} | {last_err}")


def http_head(url: str, *, timeout: int = 30) -> tuple[int, Optional[str]]:
    """HEAD url (UA only, no key). Returns (status, ETag without quotes or None); (0, None) on a network error."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with OPENER.open(req, timeout=timeout) as resp:
            return resp.status, (resp.headers.get("ETag") or "").strip('"') or None
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def _plain_md5(etag: Optional[str]) -> bool:
    return bool(etag) and "-" not in etag and len(etag) == 32


def bucket_compare(url: str, rel: str, bucket_base: str) -> tuple[str, Optional[str]]:
    """--etag-vs-bucket: compare the CDN object with the one already in our image bucket.
    Returns (decision, the bucket object's ETag when it is a plain content MD5, else None). decision:
    'same' (skip), 'new' (bucket has no object), 'changed' (ETags differ), 'unknown' (the bucket or the CDN
    did not give a usable answer, e.g. a weak / multipart ETag → download, then verified by the body's MD5
    in download_images) or 'blocked' (403/429 on the image host). Hash-named emblems are content-addressed:
    present in the bucket = same bytes, no CDN request."""
    COUNTER.bucket += 1
    b_status, b_etag = http_head(f"{bucket_base}/{rel}")
    if b_status == 404:
        return "new", None
    plain = b_etag if b_status == 200 and _plain_md5(b_etag) else None
    if b_status != 200:
        return "unknown", None
    if rel.startswith("emblems/"):
        return "same", plain
    COUNTER.cdn += 1
    c_status, c_etag = http_head(url)
    if c_status in (403, 429):
        return "blocked", plain
    if c_status != 200 or plain is None or not _plain_md5(c_etag):
        return "unknown", plain
    return ("same" if plain == c_etag else "changed"), plain


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
    jsonl = dest_under(out, "players.jsonl")
    part = dest_under(out, "players.jsonl.partial")
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


def dump_players_newest_first(key: str, out: Path, since: int, *, limit_pages: Optional[int] = None,
                              page_size: int = DEFAULT_PAGE_SIZE, overwrite: bool = False) -> dict:
    """--newest-first-since: /players?page=N&limit=L&sort=time_added&order=desc, one request at a time,
    until the first page whose cards are ALL older than `since` (epoch seconds) or the first short/empty
    page. players.jsonl (written atomically) holds the cards with time_added >= since, newest first.

    A card released while the run pages through shifts rows down by one, so an id can show up on two
    pages: it is kept once (counted in `duplicates`), never an error. The order is checked — time_added
    must not increase along the walk — because the API silently ignores unknown parameters, and an
    ignored sort would make page 1 look "all older" and the run report nothing new."""
    jsonl = dest_under(out, "players.jsonl")
    part = dest_under(out, "players.jsonl.partial")
    jsonl.parent.mkdir(parents=True, exist_ok=True)
    if jsonl.exists() and not overwrite:
        sys.exit(f"ERROR: {jsonl} already exists. Dump into a new dir (--out) or pass --overwrite.")
    t0 = time.time()
    requests0 = COUNTER.api
    seen: set[int] = set()
    kept: list = []
    rows_seen = 0
    duplicates = 0
    prev_time: Optional[int] = None
    stopped_by = "limit-pages"
    pg = 0
    print(f"  dumping players newest first: limit={page_size}, since={since}, sequential")
    while True:
        pg += 1
        if limit_pages is not None and pg > limit_pages:
            pg -= 1
            break
        if pg > MAX_PAGES:
            sys.exit(f"ERROR: no stop page after {MAX_PAGES} pages — refusing to continue")
        url = f"{API_BASE}/players?page={pg}&limit={page_size}&sort=time_added&order=desc"
        resp = get_json(url, key, validate=_validate_page(pg, page_size))  # ApiBlocked propagates → exit 2
        rows = resp["data"]
        all_older = True
        for rec in rows:
            t = rec.get("time_added")
            if not isinstance(t, int):
                sys.exit(f"ERROR: page {pg}: card {rec['id']} has no integer time_added — cannot walk newest first")
            if prev_time is not None and t > prev_time:
                sys.exit(f"ERROR: page {pg}: time_added increases ({prev_time} → {t}) — the API did not return "
                         f"cards newest first (sort=time_added&order=desc ignored?); nothing written")
            prev_time = t
            rows_seen += 1
            if t >= since:
                all_older = False
            if rec["id"] in seen:
                duplicates += 1
                continue
            seen.add(rec["id"])
            if t >= since:
                kept.append(rec)
        if len(rows) < page_size:
            stopped_by = "end-of-data"
            break
        if all_older:
            stopped_by = "older-page"
            break
    with open(part, "w") as fout:
        for rec in kept:
            fout.write(json.dumps(rec, ensure_ascii=False) + "\n")
    with open(part) as f:
        lines = sum(1 for _ in f)
    if lines != len(kept):
        sys.exit(f"ERROR: line count {lines} != kept rows {len(kept)}")
    os.replace(part, jsonl)
    stats = {
        "mode": "newest-first",
        "since": since,
        "playersCount": len(kept),
        "rowsSeen": rows_seen,
        "duplicates": duplicates,
        "pages": pg,
        "stoppedBy": stopped_by,
        "newestTimeAdded": kept[0]["time_added"] if kept else None,
        "pageSize": page_size,
        "playerRequests": COUNTER.api - requests0,
        "playersSeconds": round(time.time() - t0, 1),
    }
    print(f"  newest first: {len(kept)} cards >= {since} over {pg} pages ({stats['playerRequests']} requests, "
          f"{duplicates} duplicate rows, stopped by {stopped_by})")
    return stats


def dump_meta(key: str, out: Path) -> dict:
    def v(d):
        if not isinstance(d, dict) or not d:
            raise ValueError("meta is not a non-empty object")
    meta = get_json(f"{API_BASE}/meta", key, validate=v)
    write_text_under(out, "players_meta.json", json.dumps(meta, ensure_ascii=False, indent=2))
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
    write_text_under(out, "teams.json", json.dumps(first, ensure_ascii=False, indent=2))
    print(f"  teams: {len(teams)}")
    return len(teams)


def dump_packs(key: str, out: Path) -> dict:
    def v(d):
        if not isinstance(d, dict) or not isinstance(d.get("data"), dict):
            raise ValueError("packs is not {data: {...}}")
    data = get_json(f"{API_BASE}/packs?page=1", key, validate=v)
    write_text_under(out, "packs.json", json.dumps(data, ensure_ascii=False, indent=2))
    special = len(data["data"].get("specialPlayerList", []))
    packs = len(data["data"].get("packs", []))
    print(f"  packs: specialPlayerList={special}, packs={packs}")
    return data


# ---- image dump ----

def _url_name(url) -> Optional[str]:
    """Last path segment of an image URL, or None when the URL does not parse."""
    try:
        return urlparse(url).path.rsplit("/", 1)[-1]
    except (ValueError, AttributeError):
        return None


def collect_image_urls(players_jsonl: Path, teams_json: Optional[Path], image_types: set,
                       only_ids: Optional[set] = None, refused: Optional[list] = None) -> list[tuple[str, str]]:
    """Returns list of (url, filename_relative_to_images/). teams_json may be None/missing.
    only_ids restricts CARD images (not emblems) to those player ids.
    Source-data checks (module docstring): a row / card_images / emblem_images / teams.json shape that is
    not the expected object or list, a card id that is not a positive integer, an emblem kind outside
    EMBLEM_KINDS, an unsafe or non-.png file name or a URL that image_url_allowed refuses is left out
    (never a crash) and, when `refused` is a list, reported there."""
    def refuse(what: str, why: str):
        if refused is not None:
            refused.append(f"{what}: refused ({why})")

    urls = []
    seen = set()
    want_cards = "cards" in image_types
    want_emblems = "emblems" in image_types

    def add_emblem(kind, url, where: str):
        if not url:
            return
        if not isinstance(url, str):
            return refuse(f"{where} emblem {str(kind)[:60]!r}", "URL is not a string")
        if url in seen:
            return
        seen.add(url)
        if kind not in EMBLEM_KINDS:
            return refuse(f"{where} emblem kind {str(kind)[:60]!r}", "kind not nationality / league / team")
        fn = _url_name(url)  # hash filename — keep .png
        if not safe_name(fn) or not fn.endswith(".png"):
            return refuse(f"{where} {kind} emblem {url[:120]}", "unsafe or non-.png file name")
        if not image_url_allowed(url, "emblems"):
            return refuse(f"{where} {kind} emblem {url[:120]}", "URL not on the efootbase CDN (https)")
        urls.append((url, f"emblems/{kind}/{fn}"))

    if players_jsonl.exists() and (want_cards or want_emblems):
        with open(players_jsonl) as f:
            for n, line in enumerate(f, 1):
                if not line.strip():
                    continue
                try:
                    p = json.loads(line)
                except ValueError:
                    refuse(f"players.jsonl line {n}", "not JSON")
                    continue
                if not isinstance(p, dict):
                    refuse(f"players.jsonl line {n}", "row is not an object")
                    continue
                pid = p.get("id")
                if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
                    refuse(f"card id {str(pid)[:60]!r}", "not a positive integer")
                    continue
                ci = p.get("card_images") or {}
                if not isinstance(ci, dict):
                    refuse(f"card {pid} card_images", "not an object")
                    ci = {}
                ei = p.get("emblem_images") or {}
                if not isinstance(ei, dict):
                    refuse(f"card {pid} emblem_images", "not an object")
                    ei = {}
                if want_cards and (only_ids is None or pid in only_ids):
                    for kind in CARD_KINDS:
                        url = ci.get(kind)
                        if not url:
                            continue
                        if not isinstance(url, str):
                            refuse(f"card {pid} {kind}", "URL is not a string")
                            continue
                        if url not in seen:
                            seen.add(url)
                            if not image_url_allowed(url, kind):
                                refuse(f"card {pid} {kind} {url[:120]}", "URL not on an allowed image host / path (https)")
                                continue
                            # filenames efootbase pattern: {pid}_{kind}.webp
                            urls.append((url, f"cards/{pid}_{kind}.webp"))
                if want_emblems:
                    for kind in EMBLEM_KINDS:
                        add_emblem(kind, ei.get(kind), f"card {pid}")
    # from teams.json (team emblems, may overlap — dedup via seen)
    if want_emblems and teams_json is not None and teams_json.exists():
        try:
            data = json.loads(teams_json.read_text())
        except ValueError:
            data = None
        teams = data["data"] if isinstance(data, dict) and "data" in data else data
        if not isinstance(teams, list):
            refuse("teams.json", "data is not a list")
            teams = []
        for t in teams:
            if not isinstance(t, dict):
                refuse("teams.json team", "not an object")
                continue
            ei = t.get("emblem_images") or {}
            if not isinstance(ei, dict):
                refuse(f"team {str(t.get('id'))[:20]} emblem_images", "not an object")
                continue
            for kind, url in ei.items():
                add_emblem(kind, url, f"team {str(t.get('id'))[:20]}")
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


def download_images(images_dir: Path, urls: list[tuple[str, str]], workers: int, ref_dir: Optional[Path] = None,
                    bucket_base: Optional[str] = None, refused: Optional[list] = None) -> dict:
    """Download all (url, relpath) concurrently. Returns {ok, skip404, skip_exists, blocked, error}.
    Stops (and exits 2) on 403/429 from the CDN. bucket_base (--etag-vs-bucket): compare each image with
    the object already in the bucket first (bucket_compare) and download only new / changed ones.
    refused = the entries collect_image_urls left out: counted as stats["refused"] (only when there are
    any) and listed first in image_errors.log. Each (url, rel) is checked again here: the URL against the
    allow-list, the destination (and its .part file) inside images_dir."""
    stats = {"ok": 0, "skip404": 0, "skip_exists": 0, "not_modified": 0, "blocked": 0, "error": 0, "bytes": 0}
    if bucket_base:
        stats.update({"bucketNew": 0, "bucketChanged": 0, "bucketUnknown": 0, "overwritten": 0, "unverified": 0})
    errors_log = list(refused or [])
    if errors_log:
        stats["refused"] = len(errors_log)
    total = len(urls)
    print(f"  downloading {total} images, {workers} workers" + (f" ({len(errors_log)} refused entries skipped)" if errors_log else ""))
    new_files: list[str] = []
    overwritten: list[str] = []
    unverified: list[str] = []
    failed: list[str] = []          # rels not stored for a reason other than "unchanged" / 404 (images_failed.txt)
    blocked_hosts: set = set()      # third-party hosts that refused during this run (third verify W1)
    t0 = time.time()
    done = 0
    stop = False

    def fetch_one(url: str, rel: str):
        """(status, info, bucket decision or None, the bucket's plain-MD5 ETag or None)."""
        kind = "emblems" if rel.startswith("emblems/") else "transparent" if rel.endswith("_transparent.webp") else "dynamic"
        if not image_url_allowed(url, kind):
            return "refused", f"{url} | URL not allowed for {kind}", None, None
        if image_host(url) in blocked_hosts:
            return "hostSkipped", f"{url} | {image_host(url)} refused an earlier request in this run", None, None
        try:
            dest = dest_under(images_dir, rel)
            ref = dest_under(ref_dir, rel) if ref_dir else None
        except UnsafePath as e:
            return "refused", f"{url} | {e}", None, None
        if not bucket_base:
            status, info = http_download(url, dest, ref=ref)
            return status, info, None, None
        decision, b_md5 = bucket_compare(url, rel, bucket_base)
        if decision == "blocked":
            return "blocked", f"{url} | HTTP 403/429 (HEAD)", decision, b_md5
        if decision == "same":
            return "not_modified", url, decision, b_md5
        status, info = http_download(url, dest)
        if status == "ok" and decision in ("changed", "unknown") and b_md5 is not None:
            # third verify W2: the body decides, not the CDN's ETag (pesdb / weak ETags): same bytes as the
            # bucket object → nothing to store, nothing overwritten
            if hashlib.md5(dest.read_bytes()).hexdigest() == b_md5:
                os.unlink(dest)
                return "not_modified", url, "same", b_md5
        return status, info, decision, b_md5

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_one, url, rel): (url, rel) for url, rel in urls}
        for fut in concurrent.futures.as_completed(futures):
            url, rel = futures[fut]
            try:
                status, info, decision, b_md5 = fut.result()
                if status == "blocked" and is_third_party(url):
                    # a third-party host (pesdb.net) refused: skip its remaining images, never block the run
                    blocked_hosts.add(image_host(url))
                    status = "hostBlocked"
                    print(f"  {image_host(url)} refused ({info.split(' | ')[-1]}) — its remaining images are skipped in this run")
                stats[status] = stats.get(status, 0) + 1
                if decision in ("new", "changed", "unknown"):
                    key = {"new": "bucketNew", "changed": "bucketChanged", "unknown": "bucketUnknown"}[decision]
                    stats[key] += 1
                if status == "ok" and decision in ("changed", "unknown"):
                    # replaces an object already in the bucket: "overwritten" only when that object's ETag is
                    # a content MD5 that differs from the body (checked in fetch_one); otherwise "unverified"
                    if b_md5 is not None:
                        overwritten.append(rel)
                        stats["overwritten"] += 1
                    else:
                        unverified.append(rel)
                        stats["unverified"] += 1
                if status == "ok":
                    new_files.append(rel)
                    try:
                        stats["bytes"] += (images_dir / rel).stat().st_size
                    except OSError:
                        pass
                elif status == "blocked":
                    errors_log.append(f"{rel}: {info}")
                    stop = True
                elif status in ("error", "refused", "hostBlocked", "hostSkipped"):
                    errors_log.append(f"{rel}: {info}")
                    failed.append(rel)
            except Exception as e:
                stats["error"] += 1
                errors_log.append(f"{rel}: {e}")
                failed.append(rel)
            done += 1
            if stop:
                for f2 in futures:
                    f2.cancel()
                break
            if done % 500 == 0 or done == total:
                rate = done / max(time.time() - t0, 1e-9)
                print(f"  {done}/{total} ({rate:.0f}/s) ok={stats['ok']} 404={stats['skip404']} exist={stats['skip_exists']} err={stats['error']}")
    if errors_log:
        write_text_under(images_dir.parent, "image_errors.log", "\n".join(errors_log[:200]))
        print(f"  logged {min(len(errors_log), 200)} errors to image_errors.log")
    # list of freshly downloaded files = upload candidates (r2_upload skips unchanged anyway)
    write_text_under(images_dir.parent, "images_new.txt", "\n".join(sorted(new_files)) + ("\n" if new_files else ""))
    if bucket_base:
        write_text_under(images_dir.parent, "images_overwritten.txt", "\n".join(sorted(overwritten)) + ("\n" if overwritten else ""))
        write_text_under(images_dir.parent, "images_unverified.txt", "\n".join(sorted(unverified)) + ("\n" if unverified else ""))
    if failed:
        # every entry not stored for a reason other than "unchanged" / 404: the sync worker retries these cards
        write_text_under(images_dir.parent, "images_failed.txt", "\n".join(sorted(failed)) + "\n")
    print(f"  done: ok={stats['ok']} ({stats['bytes']} bytes) not_modified={stats['not_modified']} skip404={stats['skip404']} exist={stats['skip_exists']} "
          f"blocked={stats['blocked']} error={stats['error']}" + "".join(f" {k}={stats[k]}" for k in ("refused", "hostBlocked", "hostSkipped") if k in stats))
    if bucket_base:
        print(f"  vs bucket: new={stats['bucketNew']} changed={stats['bucketChanged']} unknown={stats['bucketUnknown']} "
              f"overwritten={stats['overwritten']} (images_overwritten.txt) unverified={stats['unverified']} (images_unverified.txt)")
    if stop:
        print("ERROR: CDN returned 403/429 or an HTML challenge — stopped. See image_errors.log", file=sys.stderr)
        sys.exit(2)
    return stats


# ---- main ----

def main():
    global API_BASE  # --api-base (default unchanged); read by the fetch helpers at call time
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
    # ---- sync-worker modes (openspec admin-sync-worker); defaults keep the behaviour above ----
    ap.add_argument("--api-base", default=API_BASE, help=f"API base URL (default: {API_BASE}; tests: a local fake server)")
    ap.add_argument("--key-from-env", action="store_true", help="read EFBASE_API_KEY from the environment instead of --env")
    ap.add_argument("--data-parts", default=",".join(DATA_PARTS), help=f"data endpoints to fetch: {','.join(DATA_PARTS)} (default: all)")
    ap.add_argument("--meta-packs-only", action="store_true", help="fetch only players_meta.json and packs.json (= --data-parts meta,packs)")
    ap.add_argument("--newest-first-since", type=int, default=None, metavar="EPOCH",
                    help="players: newest first, sequential, stop after the first page fully older than EPOCH (seconds)")
    ap.add_argument("--etag-vs-bucket", default=None, metavar="BASE_URL",
                    help="public base URL of the image bucket: download an image only when the bucket lacks it or its ETag differs from the CDN's")
    ap.add_argument("--allow-third-party-host", action="append", default=[], metavar="HOST:PORT",
                    help="TESTS ONLY (needs SYNC_TEST_MODE=1): a loopback host:port treated like pesdb.net (transparent only; a refusal skips only it)")
    ap.add_argument("--allow-host", action="append", default=[], metavar="HOST:PORT",
                    help="TESTS ONLY (needs SYNC_TEST_MODE=1): also accept image URLs on this loopback host:port")
    ap.add_argument("--validate-only", action="store_true",
                    help="check <out>/players.jsonl + teams.json against every source-data rule; exit 1 on any refusal; no request, no file")
    args = ap.parse_args()

    for flag, entries, target in (("--allow-host", args.allow_host, TEST_ALLOWED_NETLOCS),
                                  ("--allow-third-party-host", args.allow_third_party_host, TEST_THIRD_PARTY_NETLOCS)):
        for entry in entries:
            if os.environ.get("SYNC_TEST_MODE") != "1":
                sys.exit(f"ERROR: {flag} is for tests only and needs SYNC_TEST_MODE=1 in the environment")
            try:
                u = urlparse(f"http://{entry}")
                port = u.port
            except ValueError:
                sys.exit(f"ERROR: {flag} {entry!r}: not host:port")
            host = (u.hostname or "").lower()
            if port is None or not host or u.username is not None or u.path or u.query:
                sys.exit(f"ERROR: {flag} {entry!r}: not host:port")
            if not _is_loopback(host):
                sys.exit(f"ERROR: {flag} {entry!r}: only a loopback host is allowed (tests never contact a real host)")
            target.add(f"{host}:{port}")

    API_BASE = args.api_base.rstrip("/")
    parts = DATA_PARTS if not args.meta_packs_only else ("meta", "packs")
    if not args.meta_packs_only and args.data_parts != ",".join(DATA_PARTS):
        parts = tuple(p.strip() for p in args.data_parts.split(",") if p.strip())
    unknown_parts = [p for p in parts if p not in DATA_PARTS]
    if unknown_parts:
        sys.exit(f"ERROR: unknown --data-parts {unknown_parts} (allowed: {','.join(DATA_PARTS)})")
    if args.meta_packs_only and args.data_parts != ",".join(DATA_PARTS):
        sys.exit("ERROR: --meta-packs-only and --data-parts are exclusive")
    if args.newest_first_since is not None and "players" not in parts:
        sys.exit("ERROR: --newest-first-since needs the players data part")
    if args.newest_first_since is not None and args.newest_first_since < 0:
        sys.exit("ERROR: --newest-first-since must be epoch seconds >= 0")
    if args.etag_vs_bucket and args.etag_vs:
        sys.exit("ERROR: --etag-vs and --etag-vs-bucket are exclusive")

    if args.validate_only:
        # Every source-data check of the image step over the whole dump: no request, no key, no file written.
        vout = Path(os.path.realpath(args.out))
        players_jsonl, teams_json = vout / "players.jsonl", vout / "teams.json"
        if not players_jsonl.is_file():
            sys.exit(f"ERROR: --validate-only: {players_jsonl} not found")
        refused: list = []
        urls = collect_image_urls(players_jsonl, teams_json if teams_json.is_file() else None, {"cards", "emblems"}, None,
                                  refused=refused)
        if refused:
            for line in refused[:200]:
                print(f"REFUSED: {line}", file=sys.stderr)
            sys.exit(f"ERROR: --validate-only: {len(refused)} source entries refused (first: {refused[0]})")
        print(f"validate-only: {len(urls)} image URLs, 0 refused")
        return

    key = load_key_from_environment() if args.key_from_env else load_key(args.env)
    out = Path(os.path.realpath(args.out))  # the --out path itself is resolved once; nothing below it may be a link
    out.mkdir(parents=True, exist_ok=True)
    images_dir = out / "images"
    if os.path.islink(images_dir):
        sys.exit(f"ERROR: {images_dir} is a symbolic link — refusing to write images through it")
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
            if tuple(parts) != DATA_PARTS:
                manifest["dataParts"] = list(parts)
            if "meta" in parts:
                print(f"\n[1/4] meta")
                meta = dump_meta(key, out)
                manifest["metaFields"] = len(meta)

            if "teams" in parts:
                print(f"\n[2/4] teams")
                manifest["teamsCount"] = dump_teams(key, out)

            if "packs" in parts:
                print(f"\n[3/4] packs")
                dump_packs(key, out)

            if "players" in parts:
                print(f"\n[4/4] players")
                if args.newest_first_since is not None:
                    manifest.update(dump_players_newest_first(key, out, args.newest_first_since, limit_pages=args.limit_pages,
                                                              page_size=args.page_size, overwrite=args.overwrite))
                else:
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
                urls = collect_image_urls(players_jsonl, teams_json if teams_json.exists() else None, image_types, only_ids,
                                          refused=REFUSED)
                manifest["imageUrlsTotal"] = len(urls)
                if REFUSED:
                    manifest["imageUrlsRefused"] = len(REFUSED)
                    print(f"  REFUSED {len(REFUSED)} image entries from the source data (see image_errors.log), e.g. {REFUSED[0]}")
                if args.skip_from:
                    urls, skipped = skip_known_emblems(urls, Path(args.skip_from), image_types)
                    manifest["emblemsSkippedKnown"] = skipped
                    print(f"  skip-from {args.skip_from}: known emblems skipped={skipped}, to fetch={len(urls)}")
                stats = download_images(images_dir, urls, args.workers, Path(args.etag_vs) / "images" if args.etag_vs else None,
                                        bucket_base=args.etag_vs_bucket.rstrip("/") if args.etag_vs_bucket else None,
                                        refused=REFUSED)
                manifest["imageStats"] = stats
                manifest["cdnRequests"] = COUNTER.cdn
                if args.etag_vs_bucket:
                    manifest["bucketRequests"] = COUNTER.bucket
    except ApiBlocked as e:
        print(f"\nBLOCKED: {e} — stopped, nothing else requested.", file=sys.stderr)
        sys.exit(2)
    except BodyTooLarge as e:
        sys.exit(f"ERROR: an API answer was too large ({e}) — refused, nothing written for it")
    except UnsafePath as e:
        sys.exit(f"ERROR: refused to write outside the output directory or through a link: {e}")

    # ---- manifest ----
    manifest["durationSeconds"] = round(time.time() - started, 1)
    write_text_under(out, "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"\n=== DONE ===")
    print(f"  manifest: {out / 'manifest.json'}")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
