#!/usr/bin/env python3 -I
"""verify-seed.py — assert that the eflab database is a faithful copy of the efootbase
dump (+ the eFHUB cross-fill). Implements the Requirements of
openspec/changes/eflab-parity-fixes/specs/efootbase-data-integrity/spec.md.

Streams dump/efootbase/players.jsonl once (never held in memory) and compares
aggregates and per-row fields with the database through a READ-ONLY psql session
(PGOPTIONS=-c default_transaction_read_only=on). Exit code 0 = every check passed,
1 = at least one check failed, 2 = could not run.

Usage (from the repo root, stdlib only):
  python3 -I scripts/verify-seed.py                      # seed + cross-fill checks
  python3 -I scripts/verify-seed.py --seed-only          # skip cross-fill checks
  python3 -I scripts/verify-seed.py --users 8,12,8       # also assert User/Session/Account counts
  python3 -I scripts/verify-seed.py --database-url postgresql://…   # default: DATABASE_URL env, then .env

psql is taken from PSQL (env), then `psql` on PATH, then
`docker exec -i eflab-postgres psql -U eflab -d <db>` as a last resort.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
DUMP_DIR = ROOT / "dump" / "efootbase"
POSITIONS = ["GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF"]
CONDITION_LETTERS = ["E", "D", "C", "B", "A"]
# efootbase card_type code → CardType (mirrors CARD_TYPE_BY_EFOOTBASE_CODE in @eflab/shared).
CARD_TYPE_BY_CODE = {0: "STANDARD", 1: "LEGENDARY", 3: "TRENDING", 4: "SELECTION", 5: "EPIC", 6: "HIGHLIGHT", 7: "STRIKE_ARENA"}
CARD_TYPE_LABELS = {"STANDARD": "Standard", "LEGENDARY": "Legendary", "TRENDING": "Trending", "SELECTION": "Selection",
                    "EPIC": "Epic", "HIGHLIGHT": "Highlight", "STRIKE_ARENA": "Strike Arena"}
META_LABEL_OVERRIDES = {4: "Legendary", 7: ""}  # codes resolved from pack names (see @eflab/shared constants)
PACK_FAMILY_TYPES = {
    "Big Time": {"EPIC"}, "Strike Arena": {"STRIKE_ARENA"}, "POT*": {"TRENDING"},
    "Show Time": {"HIGHLIGHT"}, "Highlight": {"HIGHLIGHT"}, "Selection": {"HIGHLIGHT", "SELECTION"},
}
# dump stat key → Player column (base) — the max column is "max" + Capitalised.
STAT_MAP = {
    "offensive_awareness": "offensiveAwareness", "ball_control": "ballControl", "dribbling": "dribbling",
    "tight_possession": "tightPossession", "low_pass": "lowPass", "lofted_pass": "loftedPass",
    "finishing": "finishing", "heading": "heading", "set_piece_taking": "placeKicking", "curl": "curl",
    "speed": "speed", "acceleration": "acceleration", "kicking_power": "kickingPower", "jumping": "jump",
    "physical_contact": "physicalContact", "balance": "balance", "stamina": "stamina",
    "defensive_awareness": "defensiveAwareness", "tackling": "ballWinning",
    "defensive_engagement": "defensiveEngagement", "aggression": "aggression", "gk_awareness": "gkAwareness",
    "gk_catching": "gkCatching", "gk_parrying": "gkParrying", "gk_reflexes": "gkReflexes", "gk_reach": "gkReach",
}
BOOSTER_STAT_MAP = dict(STAT_MAP, weak_foot_accuracy="weakFootAccuracy")
BOOSTER_LABEL = {"jumping": "Jump", "set_piece_taking": "SetPiece"}
SKILL_KEY_ALIASES = {"s_heading": "s-heading", "s_phenomenal_pass": "phenomenal-passing",
                     "s_acrobatic_clearance": "acrobatic-clear", "s_rising_shot": "rising-shots"}

failures: list[str] = []
passes = 0


def check(ok: bool, msg: str) -> None:
    global passes
    if ok:
        passes += 1
        print(f"  ok   {msg}")
    else:
        failures.append(msg)
        print(f"  FAIL {msg}")


def pack_family(featured: str | None) -> str | None:
    if not featured or featured == "none":
        return None
    f = featured
    if re.search(r"big time", f, re.I): return "Big Time"
    if re.search(r"strike arena", f, re.I): return "Strike Arena"
    if re.search(r"\bPOT[WDS]\b", f, re.I): return "POT*"
    if re.search(r"show time", f, re.I): return "Show Time"
    if re.search(r"highlight", f, re.I): return "Highlight"
    if re.search(r"selection", f, re.I): return "Selection"
    return None


# ---------------------------------------------------------------- psql (read-only)
PRISMA_ONLY_PARAMS = {"schema", "connection_limit", "pool_timeout", "pgbouncer", "connect_timeout", "socket_timeout"}


def strip_prisma_params(database_url: str) -> str:
    """Drop Prisma-only query parameters (?schema=public …) that libpq rejects."""
    u = urlparse(database_url)
    kept = [kv for kv in u.query.split("&") if kv and kv.split("=", 1)[0] not in PRISMA_ONLY_PARAMS]
    return u._replace(query="&".join(kept)).geturl()


class Psql:
    def __init__(self, database_url: str) -> None:
        database_url = strip_prisma_params(database_url)
        self.url = database_url
        env = dict(os.environ)
        env["PGOPTIONS"] = "-c default_transaction_read_only=on"
        self.env = env
        psql = os.environ.get("PSQL") or shutil.which("psql")
        if psql:
            self.cmd = [psql, database_url]
        else:
            u = urlparse(database_url)
            db = u.path.lstrip("/") or "eflab"
            self.cmd = ["docker", "exec", "-i", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
                        "eflab-postgres", "psql", "-U", unquote(u.username or "eflab"), "-d", db]
        self.cmd += ["-X", "-q", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1"]

    def rows(self, query: str, fatal: bool = True) -> list[list[str]]:
        p = subprocess.run(self.cmd + ["-c", query], env=self.env, capture_output=True, text=True)
        if p.returncode != 0:
            err = p.stderr.strip().splitlines()
            print(f"psql failed for: {query[:120]}…\n{p.stderr}", file=sys.stderr)
            if fatal:
                sys.exit(2)
            raise RuntimeError(err[0] if err else "psql failed")
        return [line.split("\t") for line in p.stdout.splitlines() if line != ""]

    def one(self, query: str) -> str:
        r = self.rows(query)
        return r[0][0] if r and r[0] else ""

    def count(self, query: str) -> int:
        return int(self.one(query) or 0)


def database_url(cli: str | None) -> str:
    if cli:
        return cli
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            m = re.match(r'^\s*DATABASE_URL\s*=\s*"?([^"\s]+)"?', line)
            if m:
                return m.group(1)
    print("DATABASE_URL not set and not found in .env", file=sys.stderr)
    sys.exit(2)


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed-only", action="store_true", help="skip the cross-fill checks")
    ap.add_argument("--users", help="expected User,Session,Account counts, e.g. 8,12,8")
    ap.add_argument("--database-url")
    ap.add_argument("--jsonl", default=str(DUMP_DIR / "players.jsonl"))
    ap.add_argument("--meta", default=str(DUMP_DIR / "players_meta.json"))
    args = ap.parse_args()

    db = Psql(database_url(args.database_url))
    jsonl = Path(args.jsonl)
    meta = json.loads(Path(args.meta).read_text())
    if not jsonl.exists():
        print(f"missing {jsonl}", file=sys.stderr)
        return 2

    # ---- players_meta.json agreement ----------------------------------------
    print("players_meta.json")
    meta_ct = meta["card_type"]["values"]
    for code, ctype in CARD_TYPE_BY_CODE.items():
        expected = META_LABEL_OVERRIDES.get(code, CARD_TYPE_LABELS[ctype])
        check(meta_ct[code] == expected, f"card_type code {code} meta label {meta_ct[code]!r} == {expected!r} ({ctype})")
    check(meta["pos"]["values"] == POSITIONS, "pos.values == POSITIONS")
    check(meta["condition"]["values"] == CONDITION_LETTERS, "condition.values == [E,D,C,B,A]")

    # ---- stream the dump ----------------------------------------------------
    print("dump")
    dump: dict[int, dict] = {}          # id → the few fields compared row-by-row
    n = 0
    jump40 = 0
    cond_dist = collections.Counter()
    code_dist = collections.Counter()
    true_flags = 0
    skill_keys: set[str] = set()
    boosters: dict[int, dict] = {}
    pack_disagree = collections.Counter()
    jump_hist = collections.Counter()
    pk_hist = collections.Counter()
    with jsonl.open() as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            n += 1
            code = r.get("card_type", 0)
            ctype = CARD_TYPE_BY_CODE.get(code)
            if ctype is None:
                failures.append(f"dump id={r['id']} has unknown card_type {code}")
                continue
            code_dist[ctype] += 1
            fam = pack_family(r.get("featured"))
            if fam and ctype not in PACK_FAMILY_TYPES[fam]:
                pack_disagree[f"{fam} → {ctype}"] += 1
            cond_dist[CONDITION_LETTERS[r["condition"]]] += 1
            if r.get("jumping") == 40 and r.get("set_piece_taking") == 40:
                jump40 += 1
            jump_hist[r.get("jumping")] += 1
            pk_hist[r.get("set_piece_taking")] += 1
            for k, v in r.items():
                if k.startswith("s_"):
                    skill_keys.add(k)
                    if v:
                        true_flags += 1
            for bid, b in ((r.get("booster_id"), r.get("booster")), (r.get("booster2_id"), r.get("booster2"))):
                if bid is not None and b and bid not in boosters:
                    boosters[bid] = b
            dump[r["id"]] = {
                "pos": r["pos"], "cond": CONDITION_LETTERS[r["condition"]], "ctype": ctype,
                "jump": r.get("jumping"), "pk": r.get("set_piece_taking"),
                "ir": r.get("injury_resistance"), "pv": r.get("player_value"),
                "nn": r.get("name_normalized"), "llh": r.get("leg_length_height"),
                "ovr": r.get("overall_rating"), "ballWinning": r.get("tackling"),
                "maxJump": (r.get("max_attributes") or {}).get("jumping"),
            }
    print(f"  rows {n} | jumping=40&set_piece=40 {jump40} | true s_* flags {true_flags} | s_* keys {len(skill_keys)} | boosters {len(boosters)}")
    check(n > 0, "dump has rows")
    check(not pack_disagree, f"pack-name families agree with the card-type map ({dict(pack_disagree) or 'no disagreement'})")
    check(code_dist["STRIKE_ARENA"] > 0, f"dump has Strike Arena cards ({code_dist['STRIKE_ARENA']})")

    # ---- Player counts and per-row faithfulness ------------------------------
    print("Player")
    total_players = db.count('SELECT count(*) FROM "Player"')
    try:
        rows = db.rows('SELECT id, "registeredPosition", condition, "cardType"::text, jump, "placeKicking", '
                       '"injuryResistance", "marketValue", coalesce("nameNormalized", \'\'), "dribbleHeight", ovr, '
                       '"ballWinning", "maxJump", '
                       'CASE "registeredPosition" ' + " ".join(f'WHEN {i} THEN "pos{p}"' for i, p in enumerate(POSITIONS)) + ' END '
                       'FROM "Player"', fatal=False)
    except RuntimeError as e:
        # Pre-parity schema (no nameNormalized column): report it, keep going with what exists.
        check(False, f"Player columns readable (run pnpm db:migrate): {e}")
        rows = []
    db_ids = set()
    mismatch = collections.Counter()
    examples: dict[str, str] = {}
    db_cond = collections.Counter()
    db_ctype = collections.Counter()
    db_jump40 = 0
    db_jump_hist = collections.Counter()
    db_pk_hist = collections.Counter()
    for (pid, pos, cond, ctype, jump, pk, ir, pv, nn, dh, ovr, bw, mj, apt) in rows:
        pid = int(pid)
        db_ids.add(pid)
        d = dump.get(pid)
        if d is None:
            continue  # extra players (cross-fill) are checked separately
        db_cond[cond] += 1
        db_ctype[ctype] += 1
        if jump == "40" and pk == "40":
            db_jump40 += 1
        db_jump_hist[int(jump)] += 1
        db_pk_hist[int(pk)] += 1
        for field, got, want in (
            ("registeredPosition == pos", int(pos), d["pos"]),
            ("aptitude at registered position is registered (0)", int(apt), 0),
            ("condition", cond, d["cond"]),
            ("cardType", ctype, d["ctype"]),
            ("jump == jumping", int(jump), d["jump"]),
            ("placeKicking == set_piece_taking", int(pk), d["pk"]),
            ("injuryResistance == injury_resistance", int(ir), d["ir"]),
            ("marketValue == player_value", int(pv), d["pv"]),
            ("nameNormalized == name_normalized", nn, d["nn"] or ""),
            ("ovr == overall_rating", int(ovr), d["ovr"]),
            ("ballWinning == tackling", int(bw), d["ballWinning"]),
            ("maxJump == max_attributes.jumping", int(mj), d["maxJump"]),
        ):
            if got != want:
                mismatch[field] += 1
                examples.setdefault(field, f"id={pid} db={got!r} dump={want!r}")
        if d["llh"] is not None and abs(float(dh) - float(d["llh"])) > 1e-6:
            mismatch["dribbleHeight == leg_length_height"] += 1
            examples.setdefault("dribbleHeight == leg_length_height", f"id={pid} db={dh} dump={d['llh']}")
    missing = len(set(dump) - db_ids)
    check(missing == 0, f"every dump id exists in Player ({missing} missing)")
    check(total_players >= n, f"Player count {total_players} >= dump rows {n}")
    for field in ("registeredPosition == pos", "aptitude at registered position is registered (0)", "condition", "cardType",
                  "jump == jumping", "placeKicking == set_piece_taking", "injuryResistance == injury_resistance",
                  "marketValue == player_value", "nameNormalized == name_normalized", "dribbleHeight == leg_length_height",
                  "ovr == overall_rating", "ballWinning == tackling", "maxJump == max_attributes.jumping"):
        bad = mismatch[field]
        check(bad == 0, f"{field} on 100% of dump rows" + (f" — {bad} differ, e.g. {examples[field]}" if bad else ""))
    check(db_jump40 == jump40 and db_jump40 != n,
          f"players with jump=40 AND placeKicking=40: db {db_jump40} == dump {jump40} (and != {n})")
    check(db_jump_hist == jump_hist, "jump value histogram equals dump jumping histogram")
    check(db_pk_hist == pk_hist, "placeKicking value histogram equals dump set_piece_taking histogram")
    check(db_cond == cond_dist, f"condition distribution db {dict(sorted(db_cond.items()))} == dump {dict(sorted(cond_dist.items()))}")
    check(db_ctype == code_dist, f"card-type distribution db {dict(sorted(db_ctype.items()))} == dump {dict(sorted(code_dist.items()))}")
    enum_values = {r[0] for r in db.rows('SELECT unnest(enum_range(NULL::"CardType"))::text')}
    empty_types = sorted(v for v in enum_values if db_ctype.get(v, 0) == 0)
    check(not empty_types, f"no CardType enum value is empty ({empty_types or 'none empty'})")

    # ---- skills --------------------------------------------------------------
    print("Skill / PlayerSkill")
    slugs = {r[0] for r in db.rows('SELECT slug FROM "Skill"')}
    unmatched = sorted(k for k in skill_keys if SKILL_KEY_ALIASES.get(k, k[2:].replace("_", "-")) not in slugs)
    check(not unmatched, f"every dump s_* key has a Skill slug ({len(unmatched)} unmatched: {unmatched[:5]})")
    ps = db.count('SELECT count(*) FROM "PlayerSkill"')
    check(ps == true_flags, f"PlayerSkill rows {ps} == true s_* flags in dump {true_flags}")

    # ---- boosters ------------------------------------------------------------
    print("Booster")
    cols = ["id", "name", "magnitude"] + sorted(set(BOOSTER_STAT_MAP.values()))
    brows = {int(r[0]): dict(zip(cols, r)) for r in db.rows('SELECT ' + ", ".join(f'"{c}"' for c in cols) + ' FROM "Booster"')}
    missing_b = [bid for bid in boosters if bid not in brows]
    check(not missing_b, f"every dump booster id has a Booster row ({len(missing_b)} missing: {missing_b[:5]})")
    bad_mag = []
    bad_name = []
    for bid, b in boosters.items():
        row = brows.get(bid)
        if row is None:
            continue
        stats = {k: v for k, v in (b.get("stats") or {}).items() if v}
        for key, v in (b.get("stats") or {}).items():
            col = BOOSTER_STAT_MAP.get(key)
            if col is None or int(row[col] or 0) != int(v):
                bad_mag.append(f"{bid}.{key}={v} db={row.get(col) if col else '?'}")
            # The generated name lists the four largest stats with readable labels
            # ("Jump", "SetPiece"), never the raw snake_case key.
            if key in BOOSTER_LABEL and v:
                if key in row["name"] or (len(stats) <= 4 and BOOSTER_LABEL[key] not in row["name"]):
                    bad_name.append(f"{bid} {row['name']!r} lacks {BOOSTER_LABEL[key]}")
        if int(row["magnitude"]) != int(b.get("add") or 0):
            bad_mag.append(f"{bid}.add={b.get('add')} db={row['magnitude']}")
    check(not bad_mag, f"booster stat magnitudes (incl. jumping / set_piece_taking) match the dump ({len(bad_mag)} bad: {bad_mag[:4]})")
    check(not bad_name, f"booster names say Jump / SetPiece, not raw keys ({len(bad_name)} bad: {bad_name[:3]})")

    # ---- managers ------------------------------------------------------------
    print("Manager")
    managers = db.count('SELECT count(*) FROM "Manager"')
    check(managers >= 65, f"Manager rows {managers} >= 65 fixtures")

    # ---- cross-fill ----------------------------------------------------------
    if not args.seed_only:
        print("cross-fill")
        check(total_players == n + 3, f"Player count {total_players} == {n} + 3 eFHUB-only players")
        # 65 art managers + 1,410 eFHUB-only coach names (1,454 distinct names in the
        # 2026-10 eFHUB file, 44 of them already carried by an art row) = 1,475. The
        # spec's "≥1,478" was measured on the old cross-fill, which created no-art
        # duplicates of alias-merged art rows.
        tactics = db.count('SELECT count(*) FROM "Manager" WHERE "possessionGame" > 0')
        check(tactics >= 1475, f"managers with non-zero tactics {tactics} >= 1475")
        # The 65 art managers legitimately contain several versions of one coach
        # (Mourinho ×3 …); what must never happen is a no-art eFHUB row duplicating an
        # art row, or two no-art rows for one name.
        dup_noart = db.count('SELECT count(*) FROM "Manager" n WHERE n."imageUrl" IS NULL AND EXISTS '
                             '(SELECT 1 FROM "Manager" a WHERE a."imageUrl" IS NOT NULL AND lower(a.name) = lower(n.name))')
        check(dup_noart == 0, f"no no-art manager duplicates an art manager ({dup_noart} found)")
        dup_names = db.count('SELECT count(*) FROM (SELECT lower(name) FROM "Manager" WHERE "imageUrl" IS NULL '
                             'GROUP BY 1 HAVING count(*) > 1) d')
        check(dup_names == 0, f"no eFHUB-only manager name appears twice ({dup_names} duplicated)")
        tiers = db.count('SELECT count(*) FROM "Player" WHERE "communityTier" IS NOT NULL')
        check(tiers == 10745, f"tier badges {tiers} == 10745")
        gk = db.count('SELECT count(*) FROM "Player" WHERE "gkClearing" <> 40 AND "maxGkClearing" = 40')
        check(gk == 0, f"maxGkClearing written with gkClearing ({gk} rows have gkClearing filled but maxGkClearing not)")
        rated = db.count('SELECT count(*) FROM "Player" WHERE "ratingGK" IS NOT NULL')
        check(rated >= 44000, f"per-position ratings filled for {rated} players (>= 44000 from eFHUB)")
        unrated_40 = db.count('SELECT count(*) FROM "Player" WHERE "ratingGK" IS NULL AND "ratingCF" IS NOT NULL')
        check(unrated_40 == 0, "ratings are either all present or all NULL per player")
        rep = db.count('SELECT count(*) FROM "Player" WHERE reputation > 0')
        check(rep > 40000, f"reputation filled for {rep} players")
    else:
        print("cross-fill checks skipped (--seed-only)")

    # ---- user tables ---------------------------------------------------------
    if args.users:
        print("user tables")
        want = [int(x) for x in args.users.split(",")]
        # The user-content tables (TierList & co.) were dropped in change remove-dead-surface.
        got = [db.count(f'SELECT count(*) FROM "{t}"') for t in ("User", "Session", "Account")]
        check(got == want, f"User/Session/Account counts {got} == expected {want}")

    print(f"\n{passes} checks passed, {len(failures)} failed")
    for f_ in failures:
        print(f"  - {f_}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
