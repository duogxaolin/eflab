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
  python3 -I scripts/verify-seed.py --static-dir DIR      # efootbase static snapshot (default dump/efootbase/static)
  python3 -I scripts/verify-seed.py --efhub-db FILE       # eFHUB SQLite (default EFHUB_DB_PATH, then dump/efhub/efhub_db.sqlite)
  python3 -I scripts/verify-seed.py --after-crossfill     # right after `pnpm db:refresh` / `db:crossfill`: nothing may be pending

Manager duplicates (cross-fill checks). A no-art manager (created by the cross-fill
from an eFHUB coach) duplicates an art manager when its name equals the art row's
name ignoring case and accents (Postgres `unaccent`), the art name's cross-fill alias
(CROSSFILL_ALIASES, mirrors ALIASES in seed-efhub-crossfill.ts) or the eFHUB name of
the art row's own id. The cross-fill merges every art row it can (exact id, then
alias / name) and deletes such twins, so:
  - a twin of an art row that HAS tactics is always a failure;
  - a twin of a tactic-less art row that eFHUB cannot fill (id and alias key unknown
    to eFHUB, read read-only from the SQLite file) is a failure too — the cross-fill
    would never remove it (usually a missing alias);
  - a twin of a tactic-less art row that eFHUB CAN fill is "pending": the seed added
    that art row after the last cross-fill (efootbase-static-data's 4 picker
    managers), and the next `pnpm db:crossfill` fills it and deletes the twin. The
    database alone cannot tell "the cross-fill has not run since that seed" from
    "the cross-fill ran and failed to fill it" (no run marker is stored), so pending
    rows are listed as info by default and are failures under --after-crossfill,
    which asserts that a cross-fill ran after the last seed (use it after every
    `pnpm db:refresh`). Without the eFHUB file every tactic-less art row counts as
    pending.

Static snapshot checks (openspec efootbase-static-data, skipped when the files are
missing): released efootbase skills carry a description and an icon key, 23 Showtime
+ 44 Classic, the non-skill entries have no group, effects / activation / efbKey equal
the snapshot mapped to eFootLab stat names, hidden skills match the fixture and have
no holders, per-skill holder counts equal the dump, and exactly the snapshot's
managers are flagged inPicker with matching name, rating (83–90) and pills.

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
import sqlite3
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
BASE_STATS = set(STAT_MAP.values())
# efootbase stat name (snake_case manager pills + camelCase skill effects) → eFootLab
# stat; mirrors EFOOTBASE_STAT_MAP in packages/shared/src/constants.ts (used by the seed).
EFOOTBASE_STAT_MAP = dict(STAT_MAP, **{
    "offensiveAwareness": "offensiveAwareness", "ballControl": "ballControl",
    "tightPossession": "tightPossession", "lowPass": "lowPass", "loftedPass": "loftedPass",
    "setPieceTaking": "placeKicking", "kickingPower": "kickingPower",
    "physicalContact": "physicalContact", "defensiveAwareness": "defensiveAwareness",
    "defensiveEngagement": "defensiveEngagement", "gkAwareness": "gkAwareness",
    "gkCatching": "gkCatching", "gkParrying": "gkParrying", "gkReflexes": "gkReflexes", "gkReach": "gkReach",
})
FIXTURES_DIR = ROOT / "packages" / "db" / "fixtures"
EFHUB_DB_DEFAULT = ROOT / "dump" / "efhub" / "efhub_db.sqlite"
# efootbase manager name (lower case) → eFHUB coachesName (lower case). Mirrors ALIASES in
# packages/db/src/seed-efhub-crossfill.ts: the cross-fill's name merge and its
# duplicate key. Keep the two in sync.
CROSSFILL_ALIASES = {
    "josé mourinho": "jose mourinho", "rúben amorim": "ruben amorim", "ståle solbakken": "stale solbakken",
    "niko kovač": "niko kovac", "didier deschamps": "d. deschamps", "patrick kluivert": "p. kluivert",
    "franz beckenbauer": "f. beckenbauer", "julian nagelsmann": "j. nagelsmann",
    "roberto martínez": "r. martinez", "vincenzo montella": "v. montella", "jürgen klopp": "jurgen klopp",
}


def skill_slug(key: str) -> str:
    return SKILL_KEY_ALIASES.get(key, key[2:].replace("_", "-"))

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


# ---------------------------------------------------------------- manager duplicates
def efhub_coach_names(path: Path) -> dict[str, str] | None:
    """eFHUB coach id → lower-case coachesName (read-only SQLite); None when the file is missing."""
    if not path.exists():
        return None
    con = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
    try:
        return {str(i): n.lower() for i, n in con.execute("SELECT Id, coachesName FROM coaches WHERE coachesName != 'Manager'")
                if isinstance(n, str) and n.strip()}
    finally:
        con.close()


def check_manager_twins(db: "Psql", efhub_path: Path, after_crossfill: bool) -> None:
    """No no-art manager may duplicate an art manager (see the header, "Manager duplicates")."""
    rows = db.rows('SELECT id::text, name, lower(unaccent(name)), ("imageUrl" IS NOT NULL)::text, '
                   '("possessionGame" > 0)::text FROM "Manager"')
    coach = efhub_coach_names(efhub_path)
    coach_names = set(coach.values()) if coach is not None else set()
    noart = [(r[0], r[1], {r[1].lower(), r[2]}) for r in rows if r[3] == "false"]
    hard: list[str] = []          # duplicates the cross-fill should already have removed, or never will
    pending: list[str] = []       # art rows the next cross-fill fills (seeded after the last cross-fill)
    pending_twins: list[str] = []  # no-art rows the next cross-fill deletes
    for a_id, a_name, a_unaccent, a_art, a_tactics in rows:
        if a_art != "true":
            continue
        alias_key = CROSSFILL_ALIASES.get(a_name.lower(), a_name.lower())
        keys = {a_unaccent, alias_key}
        if coach is not None and a_id in coach:
            keys.add(coach[a_id])
        twins = [f"{n_name} ({n_id})" for n_id, n_name, n_keys in noart if n_keys & keys]
        has_tactics = a_tactics == "true"
        # Without the eFHUB file a tactic-less art row can only be assumed to be pending.
        fillable = coach is None or a_id in coach or alias_key in coach_names
        if not has_tactics and fillable:
            pending.append(f"{a_name} ({a_id})")
            pending_twins += [f"{t} of {a_name} ({a_id})" for t in twins]
        else:
            hard += [f"{t} of {a_name} ({a_id}{'' if has_tactics else ', no eFHUB coach: missing alias?'})" for t in twins]
    check(not hard, f"no no-art manager duplicates an art manager ({len(hard)} found{': ' + ', '.join(hard[:5]) if hard else ''})")
    if coach is None:
        print(f"  info {efhub_path} missing — every art manager without tactics is treated as pending")
    if after_crossfill:
        check(not pending, f"--after-crossfill: no art manager still waits for its tactics ({', '.join(pending) or 'none'})")
        check(not pending_twins, f"--after-crossfill: no pending no-art twin remains ({', '.join(pending_twins) or 'none'})")
    else:
        if pending:
            print(f"  info art managers seeded after the last cross-fill (`pnpm db:crossfill` fills them): {', '.join(pending)}")
        if pending_twins:
            print(f"  info no-art twins the next cross-fill deletes: {', '.join(pending_twins)}")


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed-only", action="store_true", help="skip the cross-fill checks")
    ap.add_argument("--users", help="expected User,Session,Account counts, e.g. 8,12,8")
    ap.add_argument("--database-url")
    ap.add_argument("--jsonl", default=str(DUMP_DIR / "players.jsonl"))
    ap.add_argument("--meta", default=str(DUMP_DIR / "players_meta.json"))
    ap.add_argument("--static-dir", default=str(DUMP_DIR / "static"),
                    help="efootbase static snapshot (skills.json / managers.json); checks are skipped when missing")
    ap.add_argument("--efhub-db", default=os.environ.get("EFHUB_DB_PATH") or str(EFHUB_DB_DEFAULT),
                    help="eFHUB SQLite (read-only) used to tell pending cross-fill work from real manager duplicates")
    ap.add_argument("--after-crossfill", action="store_true",
                    help="assert that `pnpm db:crossfill` ran after the last seed: no art manager may still be "
                         "waiting for its tactics and no no-art twin may remain")
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
    skill_true = collections.Counter()   # s_* key → cards with the flag set
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
                        skill_true[k] += 1
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
    unmatched = sorted(k for k in skill_keys if skill_slug(k) not in slugs)
    check(not unmatched, f"every dump s_* key has a Skill slug ({len(unmatched)} unmatched: {unmatched[:5]})")
    ps = db.count('SELECT count(*) FROM "PlayerSkill"')
    check(ps == true_flags, f"PlayerSkill rows {ps} == true s_* flags in dump {true_flags}")
    holders = {r[0]: int(r[1]) for r in db.rows('SELECT s.slug, count(ps."playerId") FROM "Skill" s '
                                                 'LEFT JOIN "PlayerSkill" ps ON ps."skillId" = s.id GROUP BY s.slug')}
    bad_holders = [f"{k}: db {holders.get(skill_slug(k))} dump {skill_true[k]}" for k in sorted(skill_keys)
                   if holders.get(skill_slug(k)) != skill_true[k]]
    check(not bad_holders, f"per-skill holder counts equal the dump's true flags for all {len(skill_keys)} keys ({bad_holders[:3]})")
    fixture_skills = json.loads((FIXTURES_DIR / "skills.json").read_text())["skills"]
    check(len(slugs) == len(fixture_skills), f"Skill rows {len(slugs)} == fixture entries {len(fixture_skills)}")
    hidden_fx = {s["slug"] for s in fixture_skills if s.get("released") is False}
    hidden_db = {r[0] for r in db.rows('SELECT slug FROM "Skill" WHERE NOT released')}
    check(hidden_db == hidden_fx, f"unreleased (hidden) skills {sorted(hidden_db)} == fixture released:false {sorted(hidden_fx)}")
    held_hidden = [s for s in hidden_db if holders.get(s, 0) > 0]
    check(not held_hidden, f"no card carries a hidden skill ({held_hidden})")

    # ---- static efootbase snapshot (efootbase-static-data) -------------------
    static_dir = Path(args.static_dir)
    static_skills_path = static_dir / "skills.json"
    if static_skills_path.exists():
        print("Skill static data (dump/efootbase/static/skills.json)")
        snap = json.loads(static_skills_path.read_text())
        released_snap = [s for s in snap if s.get("on_wiki_list")]
        want_show = sum(1 for s in released_snap if s["group"] == "showtime")
        want_classic = sum(1 for s in released_snap if s["group"] == "classic")
        cols = ["slug", "coalesce(\"efbKey\", '')", "released::text", "coalesce(\"group\"::text, '')",
                "coalesce(\"iconKey\", '')", "length(description)", "effects::text", "coalesce(activation, '')"]
        srows = {r[0]: r for r in db.rows('SELECT ' + ", ".join(cols) + ' FROM "Skill"')}
        rel_with_key = [r for r in srows.values() if r[2] == "true" and r[1]]
        check(len(rel_with_key) == len(released_snap),
              f"released skills with efootbase data {len(rel_with_key)} == snapshot wiki skills {len(released_snap)}")
        no_desc = [r[0] for r in rel_with_key if int(r[5]) == 0]
        no_icon = [r[0] for r in rel_with_key if not r[4].startswith("skills/Skill_")]
        check(not no_desc, f"every released efootbase skill has a description ({len(no_desc)} empty: {no_desc[:5]})")
        check(not no_icon, f"every released efootbase skill has an icon key ({len(no_icon)} missing: {no_icon[:5]})")
        got_show = sum(1 for r in rel_with_key if r[3] == "SHOWTIME")
        got_classic = sum(1 for r in rel_with_key if r[3] == "CLASSIC")
        check(got_show == want_show == 23, f"released Showtime skills db {got_show} == snapshot {want_show} == 23")
        check(got_classic == want_classic == 44, f"released Classic skills db {got_classic} == snapshot {want_classic} == 44")
        other = [r[0] for r in srows.values() if r[2] == "true" and not r[3]]
        check(len(other) == len(fixture_skills) - len(snap),
              f"non-skill entries without a group ('Other') {len(other)} == fixture {len(fixture_skills)} − snapshot {len(snap)}")
        bad_eff: list[str] = []
        n_eff = 0
        for s in snap:
            row = srows.get(skill_slug(s["key"]))
            if row is None:
                bad_eff.append(f"{s['key']}: no Skill row")
                continue
            want = [{"stat": EFOOTBASE_STAT_MAP.get(e["attributeKey"], f"?{e['attributeKey']}"), "value": e["value"]}
                    for e in ((s.get("boost") or {}).get("effects") or [])]
            got = json.loads(row[6])
            n_eff += 1 if want else 0
            if got != want or any(e["stat"] not in BASE_STATS for e in got):
                bad_eff.append(f"{s['key']}: db {got} snapshot {want}")
            act = ((s.get("boost") or {}).get("activation") or "").strip()
            if row[7] != act:
                bad_eff.append(f"{s['key']}: activation differs")
            if row[1] != s["key"]:
                bad_eff.append(f"{s['key']}: efbKey {row[1]!r}")
        check(not bad_eff, f"effects (eFootLab stat names), activation and efbKey match the snapshot for {len(snap)} skills, "
                           f"{n_eff} with effects ({len(bad_eff)} bad: {bad_eff[:3]})")
    else:
        print(f"Skill static data skipped ({static_skills_path} missing)")

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
    fixture_managers = json.loads((FIXTURES_DIR / "managers.json").read_text())
    check(managers >= len(fixture_managers), f"Manager rows {managers} >= {len(fixture_managers)} fixtures")
    static_managers_path = Path(args.static_dir) / "managers.json"
    if static_managers_path.exists():
        snap_m = {m["id"]: m for m in json.loads(static_managers_path.read_text())}
        mrows = {r[0]: r for r in db.rows('SELECT id::text, name, rating, coalesce("booster1Stat", \'\'), '
                                          'coalesce("booster2Stat", \'\'), "inPicker"::text FROM "Manager" WHERE "inPicker"')}
        check(set(mrows) == set(snap_m), f"inPicker managers {len(mrows)} == snapshot ids {len(snap_m)} (same set)")
        bad_m = []
        for mid, m in snap_m.items():
            r = mrows.get(mid)
            if r is None:
                continue
            want_pills = [EFOOTBASE_STAT_MAP.get(p, f"?{p}") if p else "" for p in (m["booster_1"], m["booster_2"])]
            if r[1] != m["name"] or int(r[2]) != m["rating"] or not 83 <= int(r[2]) <= 90 \
                    or [r[3], r[4]] != want_pills or not r[3] or (r[3] not in BASE_STATS) or (r[4] and r[4] not in BASE_STATS):
                bad_m.append(f"{mid} {r[1:5]} vs {m['name']} {m['rating']} {want_pills}")
        check(not bad_m, f"picker managers: name, rating 83–90 and pills (eFootLab stat names) match the snapshot ({bad_m[:3]})")
    else:
        print(f"  picker checks skipped ({static_managers_path} missing)")

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
        # The art managers legitimately contain several versions of one coach
        # (Mourinho ×3, Klopp ×2 …); what must never happen is a no-art eFHUB row
        # duplicating an art row, or two no-art rows for one name. See the header
        # ("Manager duplicates") for the rule and why --after-crossfill exists.
        check_manager_twins(db, Path(args.efhub_db), args.after_crossfill)
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
