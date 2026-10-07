#!/usr/bin/env python3
"""
fetch_card_assets.py — Dump efootbase card composite assets (backgrounds, frames,
conditions) into dump/efootbase/card-assets/ for upload to Cloudflare R2.

efootbase web renders cards as a 4-layer composite (DNA §10):
  1. background  /images/card-backgrounds/{Type}.webp
  2. face       R2 (already uploaded): cards/{pid}_transparent.webp
  3. frame      /images/frames/{Type}_Frame...webp  (booster/variant-dependent)
  4. condition  /icons/conditions/condition_{a-e}.svg

This script fetches layers 1, 3, 4 (face is already on R2). URL-encodes spaced
filenames (e.g. "Big Time Frame (Cyan Booster).webp" → "Big%20Time%20Frame%20(Cyan%20Booster).webp").

Output:  dump/efootbase/card-assets/
  card-backgrounds/<file>.webp
  frames/<file>.webp
  conditions/condition_<a-e>.svg

Then upload with:
  python scripts/r2_upload.py dump/efootbase/card-assets/

Resume-safe: skips files that already exist.
"""
import os
import sys
import urllib.parse
import urllib.request

BASE = "https://efootbase.com"
OUT = "dump/efootbase/card-assets"

# Probe-verified 2026-10-07. Backgrounds: only Big_Time / Epic / Show_Time / POTD
# have dedicated backgrounds; Standard/Trending/Highlight/Strike_Arena/Legendary
# fall back to a CSS gradient in PlayerCard (no bg image).
BACKGROUNDS = [
    "Big_Time_2025", "Big_Time_2026", "Big_Time_2027", "Big_Time_WC_26",
    "Epic_2025", "Epic_2026", "Epic_2027",
    "Show_Time_2023", "Show_Time_2024", "Show_Time_2025",
    "Show_Time_2026", "Show_Time_2027", "Show_Time_WC_26",
    "POTD_WC_26",
]

# Frames: mix of underscored and space-separated names (URL-encode spaces).
# Latest WC variant takes priority for each card type; plus generic single-booster.
FRAMES = [
    "Big_Time_WC_26_Frame",
    "Big_Time_Frame_Single_Booster",
    "Big Time Frame (Cyan Booster)",
    "Show_Time_WC_26_Frame",
    "Show Time Frame (Cyan Booster)",
    "Epic_Frame_Single_Booster",
    "Epic Frame (Cyan Booster)",
    "POTD_WC_26_Frame",
]

CONDITIONS = ["a", "b", "c", "d", "e"]


def fetch(url: str, out_path: str) -> bool:
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        print(f"skip (exists): {out_path}")
        return True
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "eflab-asset-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            if r.status != 200 or not data:
                print(f"FAIL {r.status}: {url}")
                return False
        with open(out_path, "wb") as f:
            f.write(data)
        print(f"ok ({len(data)}B): {out_path}")
        return True
    except Exception as e:
        print(f"ERROR {url}: {e}")
        return False


def main() -> int:
    n_ok = n_fail = 0

    # Backgrounds
    for name in BACKGROUNDS:
        url = f"{BASE}/images/card-backgrounds/{name}.webp"
        out = f"{OUT}/card-backgrounds/{name}.webp"
        n_ok += fetch(url, out); n_fail += not n_ok and True  # noop guard

    # Frames (URL-encode)
    for name in FRAMES:
        enc = urllib.parse.quote(name) + ".webp"
        url = f"{BASE}/images/frames/{enc}"
        out = f"{OUT}/frames/{name}.webp"
        if fetch(url, out):
            n_ok += 1
        else:
            n_fail += 1

    # Conditions
    for c in CONDITIONS:
        url = f"{BASE}/icons/conditions/condition_{c}.svg"
        out = f"{OUT}/conditions/condition_{c}.svg"
        if fetch(url, out):
            n_ok += 1
        else:
            n_fail += 1

    # Clean tally
    # Count via filesystem to be accurate (the noop-guard above is just defensive)
    total = sum(len(files) for _, _, files in os.walk(OUT)) if os.path.isdir(OUT) else 0
    print(f"\nDone. {total} files in {OUT}.")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
