#!/usr/bin/env bash
# Smoke test — boots the eflab API on a spare port, waits for /health and runs
# HTTP checks against the refreshed database (openspec eflab-parity-fixes,
# capability site-quality-baseline "Health Endpoint" / "Automated Checks").
#
# Run:  pnpm test              (unit tests, then this script)
#       pnpm test:smoke        (this script alone)
#       bash scripts/smoke-test.sh
#
# Env:  API_URL         use an already-running API instead of starting one
#                       (e.g. API_URL=http://localhost:4000); nothing is spawned.
#       SMOKE_API_PORT  port for the API this script starts (default 4300 —
#                       never 3000/4000, those belong to the dev servers).
#       SMOKE_TIMEOUT   seconds to wait for /health (default 60).
#       DATABASE_URL    read by the API from the shell or the repo-root .env.
#       SMOKE_ADMIN_PORT    port of the second API the admin checks start
#                           (default 4301; it serves a scratch database only).
#       SMOKE_SKIP_ADMIN=1  skip the admin checks on purpose (reported SKIPPED).
#       SMOKE_REQUIRE_ADMIN=1  a skipped admin section fails the run.
#       PSQL            psql binary for the independent SQL (default `psql` on PATH).
#       SMOKE_REQUIRE_REFRESH=1  the checks below that would be SKIPPED for the
#                       schema state (migration missing, card leagues / picker
#                       order not stored yet) FAIL instead — for the run after
#                       the refresh (efootbase-data-refresh-1024 task 5.1), which
#                       passes only with 0 skipped.
#
# Data-dependent checks (openspec efootbase-data-refresh-1024, design D8) do
# not pin the numbers of one dump: each compares the API with an INDEPENDENT
# read-only SQL computation of the same rule (psql, default_transaction_read_only)
# on the database of DATABASE_URL (shell first, then the repo-root .env — the one
# the API started here uses; with API_URL, DATABASE_URL must name the database
# that API serves: the first SQL check compares the catalogue sizes). The dated
# numbers stay in the specs as examples. Without psql or DATABASE_URL these
# checks fail (they never pass without comparing).
#
# Schema state: the checks of procedures that read the columns of migration
# 20261024000000_catalogue_data_refresh (player.byId / player.compare — full
# rows —, manager.picker — its order —, the League filter — the card league —,
# catalogue.meta) are SKIPPED, loudly and counted apart, while the database
# lacks that migration; the checks of stored card leagues / picker order are
# SKIPPED while a seed has not written them yet. Skips never count as passes;
# with SMOKE_REQUIRE_REFRESH=1 — or when the independent SQL is unavailable, so
# the schema state is unknown — they FAIL instead.
#
# Every check is counted; the script exits non-zero when any check fails and
# always stops the API(s) it started and drops the scratch database it created
# (trap on EXIT, including Ctrl-C). The admin checks (end of this file) never
# write to the database of the first API — see "Admin API checks" below.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SMOKE_API_PORT:-4300}"
TIMEOUT="${SMOKE_TIMEOUT:-60}"
API_PID=""
API_LOG=""
PASS=0
FAIL=0
FAILED_NAMES=()
# Admin section state (openspec admin-sync-worker, task 6.2)
ADMIN_PORT="${SMOKE_ADMIN_PORT:-4301}"
ADMIN_API_PID=""
ADMIN_API_LOG=""
ADMIN_TMP=""
SCRATCH_DB=""
SCRATCH_CREATED=0
APASS=0
AFAIL=0
ADMIN_SKIPPED=""

SKIP=0
SKIPPED_NAMES=()

pass() { PASS=$((PASS + 1)); echo "✓ $1"; }
fail() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); echo "✗ $1"; [ -n "${2:-}" ] && echo "    $2"; }
skip() { SKIP=$((SKIP + 1)); SKIPPED_NAMES+=("$1 — $2"); echo "○ SKIPPED $1 — $2"; }

# ---------------------------------------------------------------------------
# API lifecycle
# ---------------------------------------------------------------------------
port_listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# stop_server <pid> <port> <label>
stop_server() {
  local pid="$1" port="$2" label="$3"
  [ -z "$pid" ] && return 0
  # tsx runs the server in a child node process: signal the children first,
  # then tsx itself, then escalate if the port is still bound.
  pkill -TERM -P "$pid" 2>/dev/null
  kill -TERM "$pid" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    pkill -KILL -P "$pid" 2>/dev/null
    kill -KILL "$pid" 2>/dev/null
  fi
  wait "$pid" 2>/dev/null
  for _ in 1 2 3 4 5 6; do
    port_listening "$port" || break
    sleep 0.5
  done
  if port_listening "$port"; then
    echo "warning: port $port is still bound after stopping the $label (pid $pid)" >&2
  else
    echo "$label stopped (pid $pid), port $port free"
  fi
}

stop_api() { stop_server "$API_PID" "$PORT" "api"; API_PID=""; }
stop_admin_api() { stop_server "$ADMIN_API_PID" "$ADMIN_PORT" "admin api"; ADMIN_API_PID=""; }

# Postgres access for the admin section, through libpq variables (the password
# never appears in a process argument list). Set by run_admin_checks.
pg_maint() {
  PGHOST="$ADMIN_PGHOST" PGPORT="$ADMIN_PGPORT" PGUSER="$ADMIN_PGUSER" PGPASSWORD="$ADMIN_PGPASSWORD" \
    PGDATABASE=postgres PGCONNECT_TIMEOUT=5 psql -X -A -t -q -v ON_ERROR_STOP=1 "$@"
}
pg_scratch() {
  PGHOST="$ADMIN_PGHOST" PGPORT="$ADMIN_PGPORT" PGUSER="$ADMIN_PGUSER" PGPASSWORD="$ADMIN_PGPASSWORD" \
    PGDATABASE="$SCRATCH_DB" PGCONNECT_TIMEOUT=5 psql -X -A -t -q -v ON_ERROR_STOP=1 "$@"
}
# Read-only session on the live database (the first API's): snapshots only.
pg_live_ro() {
  PGHOST="$ADMIN_PGHOST" PGPORT="$ADMIN_PGPORT" PGUSER="$ADMIN_PGUSER" PGPASSWORD="$ADMIN_PGPASSWORD" \
    PGDATABASE="$LIVE_DB_NAME" PGOPTIONS="-c default_transaction_read_only=on" PGCONNECT_TIMEOUT=5 \
    psql -X -A -t -q -v ON_ERROR_STOP=1 "$@"
}

# Drops the scratch database this run created (and only that one).
drop_scratch_db() {
  [ "$SCRATCH_CREATED" = "1" ] || return 0
  if pg_maint -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE)" >/dev/null 2>&1 \
    && [ "$(pg_maint -c "SELECT count(*) FROM pg_database WHERE datname = '$SCRATCH_DB'" 2>/dev/null)" = "0" ]; then
    echo "scratch database $SCRATCH_DB dropped"
    SCRATCH_CREATED=0
    return 0
  fi
  echo "!!! could not drop the scratch database $SCRATCH_DB — drop it by hand (DROP DATABASE \"$SCRATCH_DB\")" >&2
  return 1
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  stop_api
  stop_admin_api
  drop_scratch_db || code=1
  [ -n "$ADMIN_TMP" ] && rm -rf "$ADMIN_TMP"
  if [ -n "$API_LOG" ] && [ -f "$API_LOG" ]; then
    if [ "$code" -ne 0 ]; then
      # pino JSON: level 40 = warn, 50 = error, 60 = fatal
      echo "--- api warnings/errors (full log: $API_LOG) ---"
      grep -E '"level":(40|50|60)' "$API_LOG" | tail -n 20
    else
      rm -f "$API_LOG"
    fi
  fi
  if [ -n "$ADMIN_API_LOG" ] && [ -f "$ADMIN_API_LOG" ]; then
    if [ "$code" -ne 0 ]; then
      echo "--- admin api warnings/errors (full log: $ADMIN_API_LOG) ---"
      grep -E '"level":(40|50|60)' "$ADMIN_API_LOG" | tail -n 20
    else
      rm -f "$ADMIN_API_LOG"
    fi
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

start_api() {
  if port_listening "$PORT"; then
    echo "error: port $PORT is already in use — set SMOKE_API_PORT to a free port or API_URL to reuse a running API" >&2
    exit 2
  fi
  API_LOG="$(mktemp -t eflab-smoke-api.XXXXXX)"
  # Shell variables win over the --env-file values (Node semantics), so the
  # repo-root .env's API_PORT=4000 cannot override the spare port.
  local tsx_bin="$ROOT/apps/api/node_modules/.bin/tsx"
  if [ ! -x "$tsx_bin" ]; then
    echo "error: $tsx_bin not found — run pnpm install first" >&2
    exit 2
  fi
  (
    cd "$ROOT/apps/api" || exit 1
    API_PORT="$PORT" API_HOST="127.0.0.1" NODE_ENV="production" \
      exec "$tsx_bin" --env-file-if-exists="$ROOT/.env" src/server.ts
  ) >"$API_LOG" 2>&1 &
  API_PID=$!
  echo "api starting on :$PORT (pid $API_PID, log $API_LOG)"
}

# wait_for_health [base URL] [pid] — defaults: the first API
wait_for_health() {
  local url="${1:-$API}" pid="${2:-$API_PID}"
  local deadline=$((SECONDS + TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -sS -m 3 -o /dev/null "$url/health" 2>/dev/null; then
      return 0
    fi
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      echo "error: api process exited before /health answered" >&2
      return 1
    fi
    sleep 0.5
  done
  echo "error: /health did not answer within ${TIMEOUT}s" >&2
  return 1
}

if [ -n "${API_URL:-}" ]; then
  API="${API_URL%/}"
  echo "using running api at $API"
else
  API="http://127.0.0.1:$PORT"
  start_api
fi
wait_for_health || exit 2

# ---------------------------------------------------------------------------
# Helpers — tRPC GET with a superjson-wrapped input. Each call stores the body
# in $BODY and the HTTP status in $CODE. JSON is read with python3 -I.
# ---------------------------------------------------------------------------
BODY=""
CODE=""
py() { python3 -I -c "$@"; }

# trpc_get <procedure> <input JSON (without the {"json":…} wrapper)> [curl args…]
trpc_get() {
  local proc="$1" input="$2"; shift 2
  local encoded
  encoded="$(py 'import json,sys,urllib.parse; print(urllib.parse.quote(json.dumps({"json": json.loads(sys.argv[1])})))' "$input")"
  local tmp; tmp="$(mktemp -t eflab-smoke-body.XXXXXX)"
  CODE="$(curl -sS -m 20 -o "$tmp" -w '%{http_code}' "$@" "$API/trpc/$proc?input=$encoded" 2>/dev/null || echo 000)"
  BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

# jq-lite: evaluate a python expression over the parsed tRPC result (`d` = result.data.json)
result() { printf '%s' "$BODY" | py 'import json,sys; d=json.load(sys.stdin)["result"]["data"]["json"]; print(eval(sys.argv[1]))' "$1" 2>/dev/null; }

# ---------------------------------------------------------------------------
# Independent read-only SQL (design D8 of efootbase-data-refresh-1024): the
# libpq variables of DATABASE_URL (shell first, then the repo-root .env — the
# precedence the API started here uses); the password stays in the
# environment of psql, never in an argument list. Every session is read-only.
# ---------------------------------------------------------------------------
SQL_DB_PY='
import os, shlex, sys, urllib.parse
root = sys.argv[1]
q = shlex.quote
def out(**kv): print(" ".join("%s=%s" % (k, q(v)) for k, v in kv.items()))
url = os.environ.get("DATABASE_URL") or ""
if not url:
    try:
        for line in open(os.path.join(root, ".env"), encoding="utf-8"):
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip("\"").strip("\x27")
    except OSError:
        pass
if not url:
    out(SQL_ERR="DATABASE_URL is not set (shell or repo-root .env)"); sys.exit()
u = urllib.parse.urlsplit(url)
if u.scheme not in ("postgres", "postgresql") or not u.hostname or not u.path.strip("/"):
    out(SQL_ERR="DATABASE_URL is not a postgres URL with a database name"); sys.exit()
out(SQL_ERR="", SQL_PGHOST=u.hostname, SQL_PGPORT=str(u.port or 5432), SQL_PGUSER=urllib.parse.unquote(u.username or ""),
    SQL_PGPASSWORD=urllib.parse.unquote(u.password or ""), SQL_DB=urllib.parse.unquote(u.path.lstrip("/")))
'
SQL_ERR="could not read DATABASE_URL"
eval "$(py "$SQL_DB_PY" "$ROOT")"
command -v "${PSQL:-psql}" >/dev/null 2>&1 || SQL_ERR="psql is not on PATH (set PSQL)"
# sql "<query>" → rows (tab-separated), or nothing and a non-zero status.
sql() {
  [ -z "$SQL_ERR" ] || return 1
  PGHOST="$SQL_PGHOST" PGPORT="$SQL_PGPORT" PGUSER="$SQL_PGUSER" PGPASSWORD="$SQL_PGPASSWORD" PGDATABASE="$SQL_DB" \
    PGOPTIONS="-c default_transaction_read_only=on" PGCONNECT_TIMEOUT=5 \
    "${PSQL:-psql}" -X -A -t -q -F $'\t' -v ON_ERROR_STOP=1 -c "$1" 2>/dev/null
}
if [ -n "$SQL_ERR" ]; then
  echo "!!! independent SQL unavailable: $SQL_ERR — every rule check below FAILS (none passes without comparing)"
else
  echo "independent SQL: read-only session on database $SQL_DB ($SQL_PGHOST:$SQL_PGPORT)"
fi

# The name-or-pack search rule (player.search / player.list `q`) as SQL: a pack
# matches when its name, folded EXACTLY like normalizeSearchQuery in
# @eflab/shared (NFD, U+0300–U+036F removed, lower case, whitespace collapsed),
# contains the folded term — folded here in Python, never with SQL unaccent
# (whose folding differs). Prints the matching pack ids as a SQL list.
FOLD_PY='
import re, sys, unicodedata
def fold(s):
    s = re.sub("[̀-ͯ]", "", unicodedata.normalize("NFD", s))
    return re.sub(r"\s+", " ", s.lower()).strip()
term = fold(sys.argv[1])
ids = []
for line in sys.stdin.read().splitlines():
    pid, _, name = line.partition("\t")
    if term and term in fold(name):
        if not re.fullmatch(r"[a-z0-9-]+", pid):
            sys.exit("unexpected pack id %r" % pid)
        ids.append(pid)
print(",".join("\x27%s\x27" % i for i in ids) or "NULL")
'
PACKS_TSV="$(sql 'SELECT id, name FROM "Pack"')"
# search_sql <term — lower-case ASCII letters, digits, spaces>: the cards the rule
# matches as "id <tab> maxOvr <tab> name <tab> pack name", max overall DESC, id DESC.
search_sql() {
  local term="$1" packs
  [[ "$term" =~ ^[a-z0-9\ ]+$ ]] || return 1
  packs="$(printf '%s\n' "$PACKS_TSV" | py "$FOLD_PY" "$term")" || return 1
  printf 'SELECT p.id, p."maxOvr", p.name, coalesce(pk.name, %s) FROM "Player" p LEFT JOIN "Pack" pk ON pk.id = p."featuredPackId" WHERE p."nameNormalized" LIKE %s OR p.id IN (SELECT "playerId" FROM "PackCard" WHERE "packId" IN (%s)) ORDER BY p."maxOvr" DESC, p.id DESC' \
    "''" "'%$term%'" "$packs"
}

# Schema state (see the header): migration 20261024000000_catalogue_data_refresh
# applied, and what a seed has written since.
MIGRATED="no"
LEAGUES_STORED="false"
PICKER_STORED="false"
DUMP_DATE=""
if [ "$(sql "SELECT (to_regclass('public.\"CatalogueMeta\"') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Player' AND column_name = 'leagueId')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Manager' AND column_name = 'pickerOrder'))::text")" = "true" ]; then
  MIGRATED="yes"
  LEAGUES_STORED="$(sql 'SELECT (EXISTS (SELECT 1 FROM "Player" WHERE "leagueId" IS NOT NULL))::text')"
  PICKER_STORED="$(sql 'SELECT (EXISTS (SELECT 1 FROM "Manager" WHERE "pickerOrder" IS NOT NULL))::text')"
  DUMP_DATE="$(sql "SELECT coalesce(to_char(\"playersDumpedAt\", 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), '') FROM \"CatalogueMeta\" WHERE id = 1")"
  echo "schema: migration 20261024000000_catalogue_data_refresh applied — card leagues stored: $LEAGUES_STORED, picker order stored: $PICKER_STORED, dump date: ${DUMP_DATE:-none}"
else
  echo "!!! schema: migration 20261024000000_catalogue_data_refresh NOT applied — the checks that read its columns are SKIPPED (see the summary)"
fi
# not_ready <check> <reason>: SKIPPED for the schema state, or FAILED when the
# refresh is required (SMOKE_REQUIRE_REFRESH=1) or the state is unknown (no SQL).
not_ready() {
  if [ -n "$SQL_ERR" ]; then
    fail "$1" "schema state unknown — independent SQL unavailable: $SQL_ERR"
  elif [ "${SMOKE_REQUIRE_REFRESH:-}" = "1" ]; then
    fail "$1" "SMOKE_REQUIRE_REFRESH=1: $2"
  else
    skip "$1" "$2"
  fi
}
needs_migration() {
  [ "$MIGRATED" = "yes" ] && return 0
  not_ready "$1" "the database lacks migration 20261024000000_catalogue_data_refresh (Player.leagueId, Manager.pickerOrder, CatalogueMeta)"
  return 1
}
needs_card_leagues() {
  needs_migration "$1" || return 1
  [ "$LEAGUES_STORED" = "true" ] && return 0
  not_ready "$1" "no card league stored yet (written by the first seed after the migration)"
  return 1
}
needs_picker_order() {
  needs_migration "$1" || return 1
  [ "$PICKER_STORED" = "true" ] && return 0
  not_ready "$1" "no picker order stored yet (written by the first seed with the manager snapshot after the migration)"
  return 1
}

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

# 1. /health — 200 + db connected
H_CODE="$(curl -sS -m 8 -o /dev/null -w '%{http_code}' "$API/health" 2>/dev/null || echo 000)"
H_BODY="$(curl -sS -m 8 "$API/health" 2>/dev/null)"
if [ "$H_CODE" = "200" ] && printf '%s' "$H_BODY" | grep -q '"status":"ok"' && printf '%s' "$H_BODY" | grep -q '"db":"connected"'; then
  pass "GET /health → 200, status ok, db connected"
else
  fail "GET /health" "code=$H_CODE body=${H_BODY:0:200}"
fi

# 1b. The SQL reads the API's database: the unfiltered list (the default
#     scope, every card type) counts exactly the Player rows — an independent
#     read-only count (catalog-browsing-parity "Default scope"; 50,694 on the
#     2026-10-18 data). Every rule check below depends on this.
trpc_get "player.list" '{"limit":1}'
API_TOTAL="$(result 'd["total"]')"
SQL_TOTAL="$(sql 'SELECT count(*) FROM "Player"')"
if [ "$CODE" = "200" ] && [ -n "$SQL_TOTAL" ] && [ "$API_TOTAL" = "$SQL_TOTAL" ] && [ "$SQL_TOTAL" -gt 0 ]; then
  pass "player.list unfiltered → $API_TOTAL cards = SELECT count(*) FROM \"Player\" (the SQL reads the API's database)"
else
  fail "player.list unfiltered = the independent catalogue count" "api=$API_TOTAL sql=${SQL_TOTAL:-unavailable (${SQL_ERR:-query failed})} code=$CODE"
fi

# 2. featured.list → every bundle has a unique non-empty slug and ≥ 1 card; the
#    first bundle resolves through featured.bySlug with the same ordered cards;
#    an unknown slug resolves to null (the web answers 404). Data-independent:
#    the bundle list changes with every dump, so no bundle name is hard-coded.
#    Since change efootbase-function-parity the answer is { bundles,
#    newestCardRelease } (check 2b).
trpc_get "featured.list" '{}'
FB_CODE="$CODE"
FB_COUNT="$(result 'len(d["bundles"])')"
FB_BAD="$(result 'sum(1 for b in d["bundles"] if not b.get("slug") or len(b.get("cards") or []) == 0) + (len(d["bundles"]) - len({b.get("slug") for b in d["bundles"]}))')"
FB_SLUG="$(result 'd["bundles"][0]["slug"] if d["bundles"] else ""')"
FB_NAME="$(result 'd["bundles"][0]["name"] if d["bundles"] else ""')"
FB_IDS="$(result '",".join(c["id"] for c in d["bundles"][0]["cards"]) if d["bundles"] else ""')"
FB_NEWEST="$(result 'd["newestCardRelease"]')"
FB_POSITIONS="$(result 'sorted(b["position"] for b in d["bundles"]) == list(range(len(d["bundles"])))')"
if [ "$FB_CODE" = "200" ] && [ -n "$FB_COUNT" ] && [ "$FB_COUNT" -gt 0 ] && [ "$FB_BAD" = "0" ] && [ -n "$FB_SLUG" ]; then
  pass "featured.list → $FB_COUNT bundles, unique non-empty slugs, ≥ 1 card each (first: '$FB_NAME' → $FB_SLUG)"
  trpc_get "featured.bySlug" "{\"slug\":\"$FB_SLUG\"}"
  BS_SLUG="$(result 'd["slug"]')"
  BS_CARDS="$(result 'len(d["cards"])')"
  BS_IDS="$(result '",".join(c["id"] for c in d["cards"])')"
  if [ "$CODE" = "200" ] && [ "$BS_SLUG" = "$FB_SLUG" ] && [ -n "$BS_CARDS" ] && [ "$BS_CARDS" -gt 0 ] && [ "$BS_IDS" = "$FB_IDS" ]; then
    pass "featured.bySlug $FB_SLUG → $BS_CARDS cards, same order as featured.list"
  else
    fail "featured.bySlug $FB_SLUG" "code=$CODE slug=$BS_SLUG cards=$BS_CARDS same_ids=$([ "$BS_IDS" = "$FB_IDS" ] && echo yes || echo no) body=${BODY:0:200}"
  fi
else
  fail "featured.list → bundles with unique slugs and cards" "code=$FB_CODE count=$FB_COUNT bad=$FB_BAD body=${BODY:0:200}"
fi
trpc_get "featured.bySlug" '{"slug":"no-such-bundle-1999-01-01"}'
UNKNOWN_BUNDLE="$(result 'd is None')"
if [ "$CODE" = "200" ] && [ "$UNKNOWN_BUNDLE" = "True" ]; then
  pass "featured.bySlug unknown slug → null"
else
  fail "featured.bySlug unknown slug → null" "code=$CODE body=${BODY:0:200}"
fi

# 2b. featured.list carries the newest card release (the /packs "Last updated"
#     chip, change efootbase-function-parity) = the newest stored release date
#     (independent SQL; the first card of the New cards order has it); each
#     bundle keeps its stored position (0..n-1, the /packs order).
NEWEST_RELEASE="$(sql "SELECT to_char(max(\"releaseDate\"), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM \"Player\"")"
trpc_get "player.list" '{"page":1,"limit":1,"sort":"new"}'
NEWEST_ID="$(result 'd["items"][0]["id"]')"
NEWEST_ID_SQL="$(sql 'SELECT id FROM "Player" ORDER BY "releaseDate" DESC NULLS LAST, id DESC LIMIT 1')"
if [ "$FB_CODE" = "200" ] && [ -n "$FB_NEWEST" ] && [ "$FB_NEWEST" != "None" ] && [ "$FB_NEWEST" = "$NEWEST_RELEASE" ] && [ "$FB_POSITIONS" = "True" ] && [ -n "$NEWEST_ID" ] && [ "$NEWEST_ID" = "$NEWEST_ID_SQL" ]; then
  pass "featured.list newestCardRelease = $FB_NEWEST (the newest stored release, SQL); New cards starts with that card ($NEWEST_ID); bundle positions 0..n-1"
else
  fail "featured.list newestCardRelease / positions" "newest=$FB_NEWEST expected=$NEWEST_RELEASE positions=$FB_POSITIONS first=$NEWEST_ID sql_first=$NEWEST_ID_SQL code=$FB_CODE"
fi

# 3. removed procedures answer 404 (community / feed / tierList / user / pages /
#    pack routers and the old manager router were deleted in change
#    remove-dead-surface; the manager tactic cross-fill is asserted by
#    scripts/verify-seed.py instead). The new `manager` router has `picker`
#    only (check 4c), so manager.list still answers 404.
trpc_get "manager.list" '{}'
MANAGER_CODE="$CODE"
trpc_get "pack.list" '{}'
if [ "$MANAGER_CODE" = "404" ] && [ "$CODE" = "404" ]; then
  pass "manager.list / pack.list → 404 (routers removed)"
else
  fail "manager.list / pack.list → 404" "manager=$MANAGER_CODE pack=$CODE body=${BODY:0:160}"
fi

# 4. skill.list → every released skill (84 on the 2026-10-18 data: 67 original +
#    17 added by eflab-parity-fixes) = the independent count of released rows,
#    each with its holder count (the /wiki/skills rarity rank is computed from
#    these) = the PlayerSkill count of that skill.
trpc_get "skill.list" '{}'
SKILL_COUNT="$(result 'len(d)')"
SKILL_COUNT_SQL="$(sql 'SELECT count(*) FROM "Skill" WHERE released')"
SKILL_HOLDERS_API="$(result '",".join("%d:%d" % (s["id"], s["playerCount"]) for s in sorted(d, key=lambda s: s["id"]))')"
SKILL_HOLDERS_SQL="$(sql 'SELECT string_agg(s.id || '"':'"' || (SELECT count(*) FROM "PlayerSkill" ps WHERE ps."skillId" = s.id), '"','"' ORDER BY s.id) FROM "Skill" s WHERE s.released')"
if [ "$CODE" = "200" ] && [ -n "$SKILL_COUNT_SQL" ] && [ "$SKILL_COUNT" = "$SKILL_COUNT_SQL" ] && [ "$SKILL_COUNT" -gt 0 ] && [ -n "$SKILL_HOLDERS_SQL" ] && [ "$SKILL_HOLDERS_API" = "$SKILL_HOLDERS_SQL" ]; then
  pass "skill.list → $SKILL_COUNT skills = the released rows (SQL); every holder count = its PlayerSkill count"
else
  fail "skill.list = the released skills with their holder counts" "code=$CODE api=$SKILL_COUNT sql=$SKILL_COUNT_SQL holders_equal=$([ "$SKILL_HOLDERS_API" = "$SKILL_HOLDERS_SQL" ] && echo yes || echo no)"
fi

# 4b. static efootbase data (efootbase-static-data; needs a seed with the
#     dump/efootbase/static snapshot): the grouped skills (23 Showtime + 44
#     Classic on 2026-10-18) each with a description and an R2 icon URL, the
#     "Other" entries (17), no hidden (unreleased) skill, the skills with
#     effects (28) carrying eFootLab stat names — each count equal to the
#     independent SQL count of the stored rows.
SKILL_STATIC="$(result '"%d %d %d %d %d %d %d" % (
  sum(1 for s in d if s["group"] == "showtime"),
  sum(1 for s in d if s["group"] == "classic"),
  sum(1 for s in d if s["group"] is None),
  sum(1 for s in d if s["group"] and s["description"] and (s["iconUrl"] or "").endswith(".webp") and "/skills/Skill_" in s["iconUrl"]),
  sum(1 for s in d if not s["released"] or s["slug"] in ("sharp-cut", "beast-drive", "decisive-pass", "gk-rush-out", "gk-aerial-claim")),
  sum(1 for s in d if s["effects"]),
  sum(1 for s in d for e in s["effects"] if e["stat"] in ("tackling", "jumping", "setPieceTaking", "set_piece_taking")))')"
SKILL_STATIC_SQL="$(sql "SELECT concat_ws(' ',
  count(*) FILTER (WHERE \"group\" = 'SHOWTIME'), count(*) FILTER (WHERE \"group\" = 'CLASSIC'), count(*) FILTER (WHERE \"group\" IS NULL),
  count(*) FILTER (WHERE \"group\" IS NOT NULL AND description <> '' AND \"iconKey\" LIKE 'skills/Skill\\_%.webp'),
  0, count(*) FILTER (WHERE effects <> '[]'::jsonb), 0) FROM \"Skill\" WHERE released")"
if [ "$CODE" = "200" ] && [ -n "$SKILL_STATIC_SQL" ] && [ "$SKILL_STATIC" = "$SKILL_STATIC_SQL" ] && [ "${SKILL_STATIC%% *}" -gt 0 ]; then
  pass "skill.list static data → Showtime · Classic · Other · with description + icon · hidden · with effects · raw stat names = $SKILL_STATIC (SQL: $SKILL_STATIC_SQL)"
else
  fail "skill.list static data = the stored rows" "code=$CODE api='$SKILL_STATIC' sql='$SKILL_STATIC_SQL'"
fi
trpc_get "skill.byId" '{"slug":"momentum-dribbling"}'
MD="$(result '"%s|%s|%s|%s" % (d["group"], ",".join("%s+%d" % (e["stat"], e["value"]) for e in d["effects"]), bool(d["activation"]), d["iconUrl"].rsplit("/", 1)[-1])')"
if [ "$CODE" = "200" ] && [ "$MD" = "showtime|dribbling+6,tightPossession+6,speed+6,acceleration+6|True|Skill_MomentumDribbling.webp" ]; then
  pass "skill.byId momentum-dribbling → showtime, +6 Dribbling/Tight Possession/Speed/Acceleration, activation, icon"
else
  fail "skill.byId momentum-dribbling static data" "code=$CODE got=$MD"
fi
ICON_URL="$(result 'd["iconUrl"]')"
ICON_CODE="$(curl -sS -m 10 -o /dev/null -I -w '%{http_code} %{content_type}' "$ICON_URL" 2>/dev/null || echo 000)"
if [ "$ICON_CODE" = "200 image/webp" ]; then
  pass "skill icon on R2 → 200 image/webp"
else
  fail "skill icon on R2 → 200 image/webp" "url=$ICON_URL got=$ICON_CODE"
fi
# 4c. manager.picker (change efootbase-exact-model-managers; order since
#     efootbase-data-refresh-1024, catalogue-data-refresh "Manager Picker
#     Order"): exactly the picker managers (70 on 2026-10-24, 46 with two pills;
#     69 / 45 on 2026-10-18)
#     in the order rating DESC, pickerOrder ASC NULLS LAST, id ASC — the same ids
#     in the same order as the independent SQL —, each with 1–2 eFootLab stat
#     pills and an image URL on the configured R2 host (the host the skill icon
#     above came from); one image answers 200 webp. Once a seed stored the
#     order: every picker manager has one, distinct 0…n−1, none outside the
#     picker. A malformed input is a 4xx, never a 5xx.
BASE_STATS_PY='["offensiveAwareness","ballControl","dribbling","tightPossession","lowPass","loftedPass","finishing","heading","placeKicking","curl","speed","acceleration","kickingPower","jump","physicalContact","balance","stamina","defensiveAwareness","ballWinning","defensiveEngagement","aggression","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach"]'
ICON_HOST="$(py 'import sys,urllib.parse; print(urllib.parse.urlsplit(sys.argv[1]).netloc)' "$ICON_URL")"
if needs_migration "manager.picker (order by the stored picker order)"; then
  trpc_get "manager.picker" '{}'
  MP="$(result "'%d|%s|%d|%d|%d|%s' % (len(d), all(1 <= len(m['pills']) <= 2 and len(set(m['pills'])) == len(m['pills']) and all(p in $BASE_STATS_PY for p in m['pills']) for m in d), sum(len(m['pills']) == 2 for m in d), len({m['id'] for m in d}), sum(83 <= m['rating'] <= 90 and bool(m['name']) for m in d), all(m['imageUrl'] and m['imageUrl'].split('/')[2] == '$ICON_HOST' for m in d))")"
  MP_IDS="$(result '",".join(m["id"] for m in d)')"
  MGR_IMG="$(result 'd[0]["imageUrl"]')"
  MP_SQL_N="$(sql 'SELECT count(*) || '"'|'"' || count(*) FILTER (WHERE "booster2Stat" IS NOT NULL) FROM "Manager" WHERE "inPicker"')"
  MP_SQL_IDS="$(sql 'SELECT string_agg(id::text, '"','"' ORDER BY rating DESC, "pickerOrder" ASC NULLS LAST, id ASC) FROM "Manager" WHERE "inPicker"')"
  MP_N="${MP_SQL_N%%|*}"
  if [ "$CODE" = "200" ] && [ -n "$MP_SQL_IDS" ] && [ "$MP_IDS" = "$MP_SQL_IDS" ] && [ "$MP" = "$MP_N|True|${MP_SQL_N#*|}|$MP_N|$MP_N|True" ] && [ "$MP_N" -gt 0 ]; then
    pass "manager.picker → $MP_N managers = the inPicker rows in the order rating DESC, pickerOrder, id (SQL); 1–2 valid pills each (${MP_SQL_N#*|} with two), ratings 83–90, images on $ICON_HOST"
  else
    fail "manager.picker = the inPicker rows in the order rating, pickerOrder, id (SQL)" "code=$CODE got='$MP' sql_counts='$MP_SQL_N' same_order=$([ "$MP_IDS" = "$MP_SQL_IDS" ] && echo yes || echo no) body=${BODY:0:200}"
  fi
  MGR_IMG_CODE="$(curl -sS -m 10 -o /dev/null -I -w '%{http_code} %{content_type}' "$MGR_IMG" 2>/dev/null || echo 000)"
  if [ "$MGR_IMG_CODE" = "200 image/webp" ]; then
    pass "picker manager image on R2 → 200 image/webp"
  else
    fail "picker manager image on R2 → 200 image/webp" "url=$MGR_IMG got=$MGR_IMG_CODE"
  fi
fi
if needs_picker_order "picker order stored for every picker manager"; then
  PO="$(sql 'SELECT concat_ws('"'|'"', count(*) FILTER (WHERE "inPicker"), count(DISTINCT "pickerOrder") FILTER (WHERE "inPicker"),
    min("pickerOrder") FILTER (WHERE "inPicker"), max("pickerOrder") FILTER (WHERE "inPicker"),
    count(*) FILTER (WHERE "inPicker" AND "pickerOrder" IS NULL), count(*) FILTER (WHERE NOT "inPicker" AND "pickerOrder" IS NOT NULL)) FROM "Manager"')"
  PO_N="${PO%%|*}"
  if [ -n "$PO_N" ] && [ "$PO" = "$PO_N|$PO_N|0|$((PO_N - 1))|0|0" ]; then
    pass "picker order: the $PO_N picker managers hold the distinct orders 0…$((PO_N - 1)), no other manager has one (SQL)"
  else
    fail "picker order 0…n−1 on the picker managers only" "got='$PO' (n|distinct|min|max|picker without|others with)"
  fi
fi
# (manager.picker ignores its input, so a malformed one runs the query: gated like it.)
if needs_migration "manager.picker with a malformed input → no 5xx"; then
  BAD_CODE="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$API/trpc/manager.picker?input=%7Bnot-json" 2>/dev/null || echo 000)"
  if [ "${BAD_CODE:0:1}" = "4" ] || [ "$BAD_CODE" = "200" ]; then
    pass "manager.picker with a malformed input → $BAD_CODE (no 5xx)"
  else
    fail "manager.picker with a malformed input → no 5xx" "code=$BAD_CODE"
  fi
fi

trpc_get "skill.byId" '{"slug":"sharp-cut"}'
if [ "$CODE" = "200" ] && [ "$(result 'd is None')" = "True" ]; then
  pass "skill.byId of an unreleased skill (sharp-cut) → null (hidden)"
else
  fail "skill.byId sharp-cut → null" "code=$CODE body=${BODY:0:160}"
fi

# 4d. Skills wiki data (change efootbase-function-parity, design decision
#     D12): every one of the 67 grouped skills has its stored key, a public
#     slug = the key without s_ with - for _ (unique, never another skill's
#     stored slug; only four differ from the stored slug — the reference's
#     phenomenal-pass, heading, rising-shot, acrobatic-clearance), and a leader
#     (the holder with the highest max overall, ties by the higher card id);
#     skill.byId answers both slugs; skill.players gives the leader and the
#     best card of 12 other base players (survey 2026-10-23 S3 §6), the old
#     page / limit ignored. Leaders and top cards are compared with the same
#     rule in independent SQL (window functions; on the 2026-10-18 data the
#     Fortress leader was Rijkaard 88045755960808, then 12 rows ending with
#     Desailly, Cannavaro 88036360723173; Long Reach Tackle: Rijkaard, then
#     Maldini, Stam, Nesta).
trpc_get "skill.list" '{}'
SK_WIKI="$(result '(lambda g: "%d|%s|%s|%s|%s|%d" % (
  len(g),
  all(s["key"] and s["publicSlug"] == s["key"][2:].replace("_", "-") and s["key"].startswith("s_") for s in g),
  len({s["publicSlug"] for s in d}) == len(d) and all(s["publicSlug"] == s["slug"] or s["publicSlug"] not in {t["slug"] for t in d} for s in d),
  ",".join(sorted(s["publicSlug"] for s in d if s["publicSlug"] != s["slug"])),
  all(s["leader"] and s["leader"]["maxOvr"] >= 40 for s in g if s["playerCount"] > 0),
  sum(1 for s in d if s["group"] is None and (s["key"] is not None or s["publicSlug"] != s["slug"]))))([s for s in d if s["group"]])')"
SK_LEADERS="$(result '",".join("%d:%s" % (s["id"], s["leader"]["id"] if s["leader"] else "-") for s in sorted(d, key=lambda s: s["id"]))')"
SK_GROUPED_SQL="$(sql 'SELECT count(*) FROM "Skill" WHERE released AND "group" IS NOT NULL')"
SK_LEADERS_SQL="$(sql 'SELECT string_agg(s.id || '"':'"' || coalesce(l.id::text, '"'-'"'), '"','"' ORDER BY s.id)
  FROM "Skill" s LEFT JOIN (
    SELECT "skillId", id FROM (
      SELECT ps."skillId", p.id, row_number() OVER (PARTITION BY ps."skillId" ORDER BY p."maxOvr" DESC, p.id DESC) AS rn
      FROM "PlayerSkill" ps JOIN "Player" p ON p.id = ps."playerId") ranked
    WHERE rn = 1) l ON l."skillId" = s.id
  WHERE s.released')"
if [ "$CODE" = "200" ] && [ -n "$SK_GROUPED_SQL" ] && [ "$SK_WIKI" = "$SK_GROUPED_SQL|True|True|acrobatic-clearance,heading,phenomenal-pass,rising-shot|True|0" ] && [ -n "$SK_LEADERS_SQL" ] && [ "$SK_LEADERS" = "$SK_LEADERS_SQL" ]; then
  pass "skill.list → $SK_GROUPED_SQL grouped skills (SQL) with key, public slug (unique, no clash; 4 differ: acrobatic-clearance, heading, phenomenal-pass, rising-shot); every skill's leader = its holder with the highest max overall, then card id (SQL)"
else
  fail "skill.list public slugs / keys / leaders (expected '$SK_GROUPED_SQL|True|True|acrobatic-clearance,heading,phenomenal-pass,rising-shot|True|0' and the SQL leaders)" "code=$CODE got='$SK_WIKI' leaders_equal=$([ "$SK_LEADERS" = "$SK_LEADERS_SQL" ] && echo yes || echo no)"
fi
# top_cards_sql <slug>: the best card of each base player holding the skill,
# max overall DESC then id DESC, first 13 (leader + 12) — "id <tab> name".
top_cards_sql() {
  sql "SELECT id, name FROM (
    SELECT p.id, p.name, p.\"maxOvr\", row_number() OVER (PARTITION BY p.\"baseId\" ORDER BY p.\"maxOvr\" DESC, p.id DESC) AS rn
    FROM \"PlayerSkill\" ps JOIN \"Player\" p ON p.id = ps.\"playerId\" JOIN \"Skill\" s ON s.id = ps.\"skillId\"
    WHERE s.slug = '$1') best
  WHERE rn = 1 ORDER BY \"maxOvr\" DESC, id DESC LIMIT 13"
}
trpc_get "skill.byId" '{"slug":"phenomenal-pass"}'
PP_PUBLIC="$(result '"%s|%s|%s" % (d["slug"], d["publicSlug"], d["key"])')"
trpc_get "skill.byId" '{"slug":"phenomenal-passing"}'
PP_STORED="$(result '"%s|%s|%s" % (d["slug"], d["publicSlug"], d["key"])')"
if [ "$CODE" = "200" ] && [ "$PP_PUBLIC" = "phenomenal-passing|phenomenal-pass|s_phenomenal_pass" ] && [ "$PP_STORED" = "$PP_PUBLIC" ]; then
  pass "skill.byId answers the public slug phenomenal-pass and the stored slug phenomenal-passing with the same skill"
else
  fail "skill.byId by public / stored slug" "public=$PP_PUBLIC stored=$PP_STORED code=$CODE"
fi
trpc_get "skill.players" '{"slug":"fortress","page":3,"limit":24}'
FORTRESS="$(result '"\n".join("%s\t%s" % (r["id"], r["name"]) for r in ([d["leader"]] if d["leader"] else []) + d["rows"])')"
FORTRESS_SHAPE="$(result '"%d|%s" % (len(d["rows"]), len({r["baseId"] for r in d["rows"]} | {d["leader"]["baseId"]}) == len(d["rows"]) + 1 and [ (-r["maxOvr"], -int(r["id"])) for r in d["rows"] ] == sorted((-r["maxOvr"], -int(r["id"])) for r in d["rows"]))')"
FORTRESS_SQL="$(top_cards_sql fortress)"
FORTRESS_N_SQL="$(printf '%s\n' "$FORTRESS_SQL" | grep -c .)"
if [ "$CODE" = "200" ] && [ -n "$FORTRESS_SQL" ] && [ "$FORTRESS" = "$FORTRESS_SQL" ] && [ "$FORTRESS_SHAPE" = "$((FORTRESS_N_SQL - 1))|True" ]; then
  pass "skill.players fortress → leader $(printf '%s' "$FORTRESS_SQL" | head -n 1 | cut -f2) + $((FORTRESS_N_SQL - 1)) rows (one per base player, max overall order) = the SQL top cards (old page / limit ignored)"
else
  fail "skill.players fortress = the SQL top cards (leader + 12, one per base player)" "code=$CODE shape='$FORTRESS_SHAPE' api_first='$(printf '%s' "$FORTRESS" | head -n 1)' sql_first='$(printf '%s' "$FORTRESS_SQL" | head -n 1)' body=${BODY:0:200}"
fi
trpc_get "skill.players" '{"slug":"long-reach-tackle"}'
LRT="$(result '"\n".join("%s\t%s" % (r["id"], r["name"]) for r in ([d["leader"]] if d["leader"] else []) + d["rows"])')"
LRT_SQL="$(top_cards_sql long-reach-tackle)"
if [ "$CODE" = "200" ] && [ -n "$LRT_SQL" ] && [ "$LRT" = "$LRT_SQL" ]; then
  pass "skill.players long-reach-tackle → $(printf '%s\n' "$LRT_SQL" | head -n 4 | cut -f2 | paste -sd, -)… = the SQL top cards"
else
  fail "skill.players long-reach-tackle = the SQL top cards" "code=$CODE api='$(printf '%s' "$LRT" | head -n 4 | cut -f2 | paste -sd, -)' sql='$(printf '%s' "$LRT_SQL" | head -n 4 | cut -f2 | paste -sd, -)'"
fi
trpc_get "skill.players" '{"slug":"sharp-cut"}'
if [ "$CODE" = "200" ] && [ "$(result 'd["leader"] is None and d["rows"] == []')" = "True" ]; then
  pass "skill.players of an unreleased skill → no leader, no rows"
else
  fail "skill.players sharp-cut → empty" "code=$CODE body=${BODY:0:160}"
fi

# 4e. booster.secondChoices (change efootbase-function-parity, design decision
#     D4): the 29 basic "+1" boosters of the committed fixture (ids 1–29),
#     alphabetical, four +1 stats each, slugs by the rule (Striker's Instinct
#     +1 → strikers-instinct1).
trpc_get "booster.secondChoices" '{}'
B2="$(result '"%d|%s|%s|%s|%s" % (len(d), [b["name"].lower() for b in d] == sorted(b["name"].lower() for b in d), sorted(b["id"] for b in d) == list(range(1, 30)), all(len(b["stats"]) == 4 and set(b["stats"].values()) == {1} and all(k in '"$BASE_STATS_PY"' for k in b["stats"]) for b in d), next((b["slug"] + ":" + ",".join(sorted(b["stats"])) for b in d if b["name"] == "Striker" + chr(39) + "s Instinct +1"), ""))')"
if [ "$CODE" = "200" ] && [ "$B2" = "29|True|True|True|strikers-instinct1:acceleration,ballControl,finishing,offensiveAwareness" ]; then
  pass "booster.secondChoices → 29 basic boosters (ids 1–29), alphabetical, four +1 stats each; Striker's Instinct +1 → strikers-instinct1"
else
  fail "booster.secondChoices (expected '29|True|True|True|strikers-instinct1:…')" "code=$CODE got='$B2' body=${BODY:0:200}"
fi

# 5. card-type enum: every CardType has rows; STRIKE_ARENA non-empty
for CT in STANDARD LEGENDARY TRENDING SELECTION EPIC HIGHLIGHT STRIKE_ARENA; do
  trpc_get "player.list" "{\"cardType\":\"$CT\",\"limit\":1}"
  CT_TOTAL="$(result 'd["total"]')"
  if [ "$CODE" = "200" ] && [ -n "$CT_TOTAL" ] && [ "$CT_TOTAL" -gt 0 ]; then
    pass "player.list cardType=$CT → $CT_TOTAL cards"
  else
    fail "player.list cardType=$CT → non-empty" "code=$CODE total=$CT_TOTAL body=${BODY:0:160}"
  fi
done

# 5b. default scope = the whole catalogue: an unfiltered list equals the sum of
#     the per-type totals (efootbase-parity-round2 "Default scope")
CT_SUM=0
for CT in STANDARD LEGENDARY TRENDING SELECTION EPIC HIGHLIGHT STRIKE_ARENA; do
  trpc_get "player.list" "{\"cardType\":\"$CT\",\"limit\":1}"
  CT_SUM=$((CT_SUM + $(result 'd["total"]')))
done
trpc_get "player.list" '{"limit":1}'
ALL_TOTAL="$(result 'd["total"]')"
if [ "$CODE" = "200" ] && [ -n "$ALL_TOTAL" ] && [ "$ALL_TOTAL" = "$CT_SUM" ] && [ "$ALL_TOTAL" -gt 40000 ]; then
  pass "player.list unfiltered → $ALL_TOTAL cards = sum of all card types (default scope is everything)"
else
  fail "player.list unfiltered equals the sum of the card types" "all=$ALL_TOTAL sum=$CT_SUM code=$CODE"
fi

# 5c. sort presets (New cards · High to low · Low to high, change
#     efootbase-function-parity; Top rated since task 6.3 of
#     efootbase-data-refresh-1024 — TOP_RATED in @eflab/shared, measured
#     2026-10-24; the former trending is still accepted as New cards):
#     each answers 200 and pages 1–5 carry no duplicate id
for PRESET in new highest lowest trending top; do
  P_IDS="$(mktemp -t eflab-smoke-preset.XXXXXX)"
  P_FAIL=""
  for P in 1 2 3 4 5; do
    trpc_get "player.list" "{\"page\":$P,\"limit\":24,\"sort\":\"$PRESET\"}"
    if [ "$CODE" != "200" ]; then P_FAIL="page $P code=$CODE"; break; fi
    result '"\n".join(str(i["id"]) for i in d["items"])' >>"$P_IDS"
  done
  P_TOTAL="$(grep -c . "$P_IDS")"
  P_DUP="$(sort "$P_IDS" | uniq -d | wc -l | tr -d ' ')"
  if [ -z "$P_FAIL" ] && [ "$P_TOTAL" = "120" ] && [ "$P_DUP" = "0" ]; then
    pass "player.list sort=$PRESET pages 1–5 → 120 ids, 0 duplicates"
  else
    fail "player.list sort=$PRESET pages 1–5 → no duplicates" "${P_FAIL:-ids=$P_TOTAL duplicates=$P_DUP}"
  fi
  rm -f "$P_IDS"
done
# "High to low" / "Low to high" sort by MAX overall with the id tiebreak (the
# reference's rule, survey 2026-10-23 S2 §2): max overall DESC, id DESC /
# max overall ASC, id ASC — page 1 is in that exact order, starts at the
# catalogue's highest / lowest max overall (the maxOvr field sort agrees), and
# the legacy preset reads as the new one (trending = new; `top` is Top rated,
# checked against SQL in 5c-top below).
# sort_ids <preset> [extra JSON members]: the page's ids, comma-separated, or
# nothing when the call failed. The second argument is optional (`${2:-}`:
# under `set -u` a bare `$2` aborted the command substitution, both sides of
# the legacy comparison came back empty and the check passed without
# comparing anything) — and the comparison below also requires 48 ids.
sort_ids() { trpc_get "player.list" "{\"page\":1,\"limit\":48,\"sort\":\"$1\"${2:-}}"; result "\",\".join(i[\"id\"] for i in d[\"items\"])"; }
trpc_get "player.list" '{"page":1,"limit":48,"sort":"highest"}'
HI_ORDER="$(result '[(-i["maxOvr"], -int(i["id"])) for i in d["items"]] == sorted((-i["maxOvr"], -int(i["id"])) for i in d["items"])')"
HI_MAX="$(result 'd["items"][0]["maxOvr"]')"
trpc_get "player.list" '{"page":1,"limit":48,"sort":"lowest"}'
LO_ORDER="$(result '[(i["maxOvr"], int(i["id"])) for i in d["items"]] == sorted((i["maxOvr"], int(i["id"])) for i in d["items"])')"
LO_MIN="$(result 'd["items"][0]["maxOvr"]')"
trpc_get "player.list" '{"page":1,"limit":1,"sort":"maxOvr","order":"desc"}'
FIELD_MAX="$(result 'd["items"][0]["maxOvr"]')"
trpc_get "player.list" '{"page":1,"limit":1,"sort":"maxOvr","order":"asc"}'
FIELD_MIN="$(result 'd["items"][0]["maxOvr"]')"
SORT_TRENDING="$(sort_ids trending)"
SORT_NEW="$(sort_ids new)"
# 48 ids = 47 commas; two empty answers must never compare equal.
ids48() { [ "$(printf '%s' "$1" | tr -cd ',' | wc -c | tr -d ' ')" = "47" ]; }
LEGACY_SAME="$(ids48 "$SORT_TRENDING" && [ "$SORT_TRENDING" = "$SORT_NEW" ] && echo yes || echo no)"
if [ "$HI_ORDER" = "True" ] && [ "$LO_ORDER" = "True" ] && [ -n "$HI_MAX" ] && [ "$HI_MAX" = "$FIELD_MAX" ] && [ "$LO_MIN" = "$FIELD_MIN" ] && [ "$LEGACY_SAME" = "yes" ]; then
  pass "sort=highest → max overall DESC, id DESC from $HI_MAX; sort=lowest → max overall ASC, id ASC from $LO_MIN; legacy trending = new"
else
  fail "sort=highest / lowest by max overall with the id tiebreak; legacy presets" "hi_order=$HI_ORDER lo_order=$LO_ORDER hi=$HI_MAX/$FIELD_MAX lo=$LO_MIN/$FIELD_MIN legacy=$LEGACY_SAME"
fi
# Legendary High to low = the same cards in the same order as the max
# overall field sort with the id tiebreak (the reference's Icons order).
trpc_get "player.list" '{"page":1,"limit":48,"sort":"highest","cardTypeIn":["LEGENDARY"]}'
LEG_HI="$(result '",".join(i["id"] for i in d["items"])')"
trpc_get "player.list" '{"page":1,"limit":48,"sort":"maxOvr","order":"desc","cardTypeIn":["LEGENDARY"]}'
LEG_FIELD="$(result '",".join(i["id"] for i in d["items"])')"
if [ -n "$LEG_HI" ] && [ "$LEG_HI" = "$LEG_FIELD" ]; then
  pass "Legendary High to low = the max overall order (48 ids, id tiebreak)"
else
  fail "Legendary High to low = the max overall order" "hi=${LEG_HI:0:80} field=${LEG_FIELD:0:80}"
fi

# 5c-top. Top rated (catalogue-data-refresh "Top Rated Sort"; design D7 result of
#     efootbase-data-refresh-1024, measured 2026-10-24: at least 10 votes, the
#     average DESC, then the higher card id): the whole list, read page by page
#     (200 a page), is exactly the independent SQL set in the same order — for
#     every card, for Standard alone, for Icons (the spec scenario's set), and with a second card type plus a
#     Community Rating minimum; the listed cards' smallest vote count is 10
#     (cards with exactly 10 votes are listed, none with fewer).
# top_all '<extra JSON members>' → "total|id,id,…" over every page; nothing on a failure.
top_all() {
  local extra="${1:-}" p=1 ids="" total="" chunk=""
  while :; do
    trpc_get "player.list" "{\"page\":$p,\"limit\":200,\"sort\":\"top\"$extra}"
    [ "$CODE" = "200" ] || return 0
    total="$(result 'd["total"]')"
    case "$total" in ''|*[!0-9]*) return 0 ;; esac
    chunk="$(result '",".join(i["id"] for i in d["items"])')"
    [ -n "$chunk" ] && ids="${ids:+$ids,}$chunk"
    [ $((p * 200)) -ge "$total" ] && break
    p=$((p + 1))
    [ "$p" -le 20 ] || return 0
  done
  echo "$total|$ids"
}
# top_sql '<extra SQL predicate>' → "count|id,id,…" by the same rule, computed by Postgres.
top_sql() {
  sql "SELECT count(*) || '|' || coalesce(string_agg(id::text, ',' ORDER BY \"avgRating\" DESC, id DESC), '') FROM \"Player\"
    WHERE \"ratingCount\" >= 10 AND \"avgRating\" IS NOT NULL ${1:-}"
}
TR_ALL="$(top_all)"
TR_ALL_SQL="$(top_sql)"
TR_STD="$(top_all ',"cardTypeIn":["STANDARD"]')"
TR_STD_SQL="$(top_sql "AND \"cardType\" = 'STANDARD'")"
TR_ICONS="$(top_all ',"cardTypeIn":["LEGENDARY"]')"
TR_ICONS_SQL="$(top_sql "AND \"cardType\" = 'LEGENDARY'")"
TR_MIX="$(top_all ',"cardTypeIn":["STANDARD","SELECTION"],"ratingMin":8')"
TR_MIX_SQL="$(top_sql "AND \"cardType\" IN ('STANDARD', 'SELECTION') AND \"avgRating\" >= 8")"
# The listed cards' vote counts (ids are digits only — checked before they reach SQL).
TR_VOTES=""
if printf '%s' "${TR_ALL#*|}" | grep -Eq '^[0-9]+(,[0-9]+)*$'; then
  TR_VOTES="$(sql "SELECT min(\"ratingCount\") || '|' || count(*) FILTER (WHERE \"ratingCount\" = 10) FROM \"Player\" WHERE id IN (${TR_ALL#*|})")"
fi
TR_DUP="$(printf '%s' "${TR_ALL#*|}" | tr ',' '\n' | sort | uniq -d | wc -l | tr -d ' ')"
if [ -n "$TR_ALL_SQL" ] && [ "$TR_ALL" = "$TR_ALL_SQL" ] && [ "${TR_ALL%%|*}" -gt 0 ] 2>/dev/null && [ "$TR_DUP" = "0" ] \
  && [ -n "$TR_STD_SQL" ] && [ "$TR_STD" = "$TR_STD_SQL" ] && [ -n "$TR_ICONS_SQL" ] && [ "$TR_ICONS" = "$TR_ICONS_SQL" ] \
  && [ -n "$TR_MIX_SQL" ] && [ "$TR_MIX" = "$TR_MIX_SQL" ] \
  && [ "${TR_VOTES%%|*}" = "10" ] && [ "${TR_VOTES#*|}" -gt 0 ] 2>/dev/null; then
  pass "sort=top → ${TR_ALL%%|*} cards = SQL (ratingCount ≥ 10, avgRating DESC, id DESC; same ids, same order, no duplicate across pages); Standard ${TR_STD%%|*}, Icons ${TR_ICONS%%|*} and Standard + Selection with rating ≥ 8 ${TR_MIX%%|*} = SQL; smallest listed vote count 10 (${TR_VOTES#*|} cards with exactly 10)"
else
  fail "sort=top = the measured Top rated rule (SQL)" "api=${TR_ALL%%|*} sql=${TR_ALL_SQL%%|*} same=$([ "$TR_ALL" = "$TR_ALL_SQL" ] && echo yes || echo no) dup=$TR_DUP std=${TR_STD%%|*}/${TR_STD_SQL%%|*} same=$([ "$TR_STD" = "$TR_STD_SQL" ] && echo yes || echo no) icons=${TR_ICONS%%|*}/${TR_ICONS_SQL%%|*} same=$([ "$TR_ICONS" = "$TR_ICONS_SQL" ] && echo yes || echo no) mix=${TR_MIX%%|*}/${TR_MIX_SQL%%|*} same=$([ "$TR_MIX" = "$TR_MIX_SQL" ] && echo yes || echo no) votes=$TR_VOTES"
fi

# 5d. the new filters narrow the list and never widen it; an AND of two skills
#     is a subset of one skill; a bound outside the schema → 400
trpc_get "player.list" '{"limit":1,"conditionIn":["A"],"formIn":[2],"weakFootAccuracyIn":[3],"weakFootUsageIn":[3]}'
NARROW="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"skillIds":[1]}'
SK1="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"skillIds":[1,2]}'
SK12="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"ovrMin":90,"heightMin":185,"statRanges":[{"stat":"speed","min":85}],"statsAtMax":true,"bodyRanges":[{"field":"neckLength","max":9}]}'
COMBO="$(result 'd["total"]')"
if [ -n "$NARROW" ] && [ -n "$SK1" ] && [ -n "$SK12" ] && [ -n "$COMBO" ] && [ "$NARROW" -lt "$ALL_TOTAL" ] && [ "$SK12" -le "$SK1" ] && [ "$SK1" -gt 0 ] && [ "$COMBO" -ge 0 ]; then
  pass "filters narrow: condition/form/WF → $NARROW · skill 1 → $SK1 · skills 1+2 → $SK12 · ovr/height/stat/body combo → $COMBO"
else
  fail "new player.list filters narrow the list" "narrow=$NARROW sk1=$SK1 sk12=$SK12 combo=$COMBO code=$CODE"
fi
trpc_get "player.list" '{"limit":1,"heightMin":999}'
if [ "$CODE" = "400" ]; then
  pass "player.list heightMin=999 → 400 (bounded range)"
else
  fail "player.list heightMin=999 → 400" "code=$CODE body=${BODY:0:160}"
fi

# 5e. league / team lists for the filters
trpc_get "player.leagues" '{}'
LEAGUES="$(result 'len(d)')"
trpc_get "player.teams" '{}'
TEAMS="$(result 'len(d)')"
if [ "$CODE" = "200" ] && [ -n "$LEAGUES" ] && [ "$LEAGUES" -gt 0 ] && [ -n "$TEAMS" ] && [ "$TEAMS" -gt "$LEAGUES" ]; then
  pass "player.leagues → $LEAGUES leagues · player.teams → $TEAMS teams"
else
  fail "player.leagues / player.teams" "leagues=$LEAGUES teams=$TEAMS code=$CODE"
fi

# 5f. multi-valued filters (change multi-select-filters): OR inside a list,
#     AND between lists, the single-value fields merged into the lists, and a
#     400 (never a 500) for an over-long list or an out-of-range member.
#     A card has one nationality, one team, one league and — since change
#     efootbase-function-parity, which filters Position by the registered
#     position (the reference's rule) — one position, so two leagues / two
#     teams / two positions are exactly additive.
trpc_get "player.list" '{"limit":1,"positions":["CF"]}'
POS_CF="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"positions":["SS"]}'
POS_SS="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"positions":["CF","SS"]}'
POS_CFSS="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"position":"CF","positions":["SS"]}'
POS_MERGED="$(result 'd["total"]')"
if [ -n "$POS_CF" ] && [ -n "$POS_SS" ] && [ -n "$POS_CFSS" ] && [ "$POS_CFSS" = $((POS_CF + POS_SS)) ] && [ "$POS_CFSS" -gt 0 ] && [ "$POS_MERGED" = "$POS_CFSS" ]; then
  pass "player.list positions [CF,SS] → $POS_CFSS cards = CF $POS_CF + SS $POS_SS (registered position, OR; single-value position merged)"
else
  fail "player.list positions [CF,SS] is an OR of the registered positions CF and SS" "cf=$POS_CF ss=$POS_SS cfss=$POS_CFSS merged=$POS_MERGED code=$CODE"
fi
# The survey's sets: Legendary + CB, then + LB — registered positions (23 and
# 32 on the 2026-10-18 data; the aptitude rule gave 45 / 56) = the independent
# count of Legendary cards registered at CB (index 1) / CB or LB (1, 2).
trpc_get "player.list" '{"limit":48,"cardTypeIn":["LEGENDARY"],"positions":["CB"]}'
LEG_CB="$(result '"%d|%s" % (d["total"], all(i["registeredPosition"] == 1 for i in d["items"]))')"
trpc_get "player.list" '{"limit":48,"cardTypeIn":["LEGENDARY"],"positions":["CB","LB"]}'
LEG_CBLB="$(result '"%d|%s" % (d["total"], all(i["registeredPosition"] in (1, 2) for i in d["items"]))')"
LEG_CB_SQL="$(sql "SELECT count(*) FROM \"Player\" WHERE \"cardType\" = 'LEGENDARY' AND \"registeredPosition\" = 1")"
LEG_CBLB_SQL="$(sql "SELECT count(*) FROM \"Player\" WHERE \"cardType\" = 'LEGENDARY' AND \"registeredPosition\" IN (1, 2)")"
if [ -n "$LEG_CB_SQL" ] && [ "$LEG_CB" = "$LEG_CB_SQL|True" ] && [ "$LEG_CBLB" = "$LEG_CBLB_SQL|True" ] && [ "$LEG_CB_SQL" -gt 0 ] && [ "$LEG_CBLB_SQL" -gt "$LEG_CB_SQL" ]; then
  pass "player.list Legendary + CB → $LEG_CB_SQL, + LB → $LEG_CBLB_SQL = the registered-position counts (SQL; every card registered there)"
else
  fail "player.list Legendary + CB / + LB = the registered-position counts" "cb=$LEG_CB sql=$LEG_CB_SQL cblb=$LEG_CBLB sql=$LEG_CBLB_SQL"
fi
# League filter = the card's OWN league (efootbase-data-refresh-1024,
# catalogue-data-refresh "Card League"): each list equals the independent count
# of cards whose stored league is in it (OR, duplicate ignored).
LG_A="" LG_B="" LG_AB_N=""
if needs_card_leagues "player.list leagueIds = the stored card leagues (two leagues, OR)"; then
  trpc_get "player.leagues" '{}'
  LG_A="$(result 'd[0]["id"]')"
  LG_B="$(result 'd[1]["id"]')"
  trpc_get "player.list" "{\"limit\":1,\"leagueIds\":[$LG_A]}"
  LG_A_N="$(result 'd["total"]')"
  trpc_get "player.list" "{\"limit\":1,\"leagueIds\":[$LG_B]}"
  LG_B_N="$(result 'd["total"]')"
  trpc_get "player.list" "{\"limit\":1,\"leagueIds\":[$LG_A,$LG_B,$LG_A]}"
  LG_AB_N="$(result 'd["total"]')"
  LG_SQL="$(sql "SELECT concat_ws('|', count(*) FILTER (WHERE \"leagueId\" = $LG_A), count(*) FILTER (WHERE \"leagueId\" = $LG_B), count(*) FILTER (WHERE \"leagueId\" IN ($LG_A, $LG_B))) FROM \"Player\"")"
  if [ -n "$LG_SQL" ] && [ "$LG_A_N|$LG_B_N|$LG_AB_N" = "$LG_SQL" ] && [ "$LG_AB_N" -gt 0 ]; then
    pass "player.list leagueIds [$LG_A] → $LG_A_N, [$LG_B] → $LG_B_N, [$LG_A,$LG_B,$LG_A] → $LG_AB_N = the cards whose own league is in the list (SQL)"
  else
    fail "player.list leagueIds = the stored card leagues" "api=$LG_A_N|$LG_B_N|$LG_AB_N sql=$LG_SQL code=$CODE"
  fi
fi
trpc_get "player.teams" '{}'
TM_A="$(result 'd[0]["id"]')"
TM_B="$(result 'd[1]["id"]')"
trpc_get "player.list" "{\"limit\":1,\"clubIds\":[$TM_A]}"
TM_A_N="$(result 'd["total"]')"
trpc_get "player.list" "{\"limit\":1,\"clubId\":$TM_B}"
TM_B_N="$(result 'd["total"]')"
trpc_get "player.list" "{\"limit\":1,\"clubIds\":[$TM_A,$TM_B]}"
TM_AB_N="$(result 'd["total"]')"
if [ -n "$TM_A_N" ] && [ -n "$TM_B_N" ] && [ -n "$TM_AB_N" ] && [ "$TM_AB_N" = $((TM_A_N + TM_B_N)) ] && [ "$TM_AB_N" -gt 0 ]; then
  pass "player.list clubIds [$TM_A,$TM_B] → $TM_AB_N cards = $TM_A_N + $TM_B_N (OR)"
else
  fail "player.list clubIds of two teams is additive" "a=$TM_A_N b=$TM_B_N ab=$TM_AB_N code=$CODE"
fi
# AND between lists: positions ∧ leagues ∧ nations = the independent count of
# the conjunction (a subset of each list alone).
if [ -n "$LG_AB_N" ]; then
  trpc_get "player.list" "{\"limit\":1,\"positions\":[\"CF\",\"SS\"],\"leagueIds\":[$LG_A,$LG_B],\"nationalityIds\":[1,14]}"
  AND_N="$(result 'd["total"]')"
  AND_CODE="$CODE"
  trpc_get "player.list" '{"limit":1,"nationalityIds":[1,14]}'
  NAT_N="$(result 'd["total"]')"
  AND_SQL="$(sql "SELECT count(*) FROM \"Player\" WHERE \"registeredPosition\" IN (11, 12) AND \"leagueId\" IN ($LG_A, $LG_B) AND \"nationalityId\" IN (1, 14)")"
  if [ "$AND_CODE" = "200" ] && [ -n "$AND_N" ] && [ "$AND_N" = "$AND_SQL" ] && [ "$AND_N" -le "$POS_CFSS" ] && [ "$AND_N" -le "$LG_AB_N" ] && [ "$AND_N" -le "$NAT_N" ]; then
    pass "player.list positions ∧ leagueIds ∧ nationalityIds → $AND_N cards = the conjunction (SQL; ≤ $POS_CFSS, ≤ $LG_AB_N, ≤ $NAT_N)"
  else
    fail "player.list lists are AND-ed with each other" "and=$AND_N sql=$AND_SQL cfss=$POS_CFSS leagues=$LG_AB_N nations=$NAT_N code=$AND_CODE"
  fi
else
  not_ready "player.list positions ∧ leagueIds ∧ nationalityIds" "needs the stored card leagues (see the League check above)"
fi
# invalid lists → 400
IDS_51="$(py 'print(",".join(str(i) for i in range(1, 52)))')"
IDS_50="$(py 'print(",".join(str(i) for i in range(1, 51)))')"
trpc_get "player.list" '{"limit":1,"positions":["GK","CB","LB","RB","DMF","CMF","LMF","RMF","AMF","LWF","RWF","SS","CF","CF"]}'
C_POS14="$CODE"
trpc_get "player.list" "{\"limit\":1,\"clubIds\":[$IDS_51]}"
C_IDS51="$CODE"
trpc_get "player.list" "{\"limit\":1,\"clubId\":999,\"clubIds\":[$IDS_50]}"
C_MERGED51="$CODE"
trpc_get "player.list" '{"limit":1,"nationalityIds":[2147483648]}'
C_RANGE="$CODE"
trpc_get "player.list" '{"limit":1,"leagueIds":[-1]}'
C_NEG="$CODE"
trpc_get "player.list" '{"limit":1,"positions":["ST"]}'
C_UNKNOWN="$CODE"
# a null member must not be coerced to id 0 (it used to answer 200)
trpc_get "player.list" '{"limit":1,"nationalityIds":[null]}'
C_NULL="$CODE"
if [ "$C_POS14" = "400" ] && [ "$C_IDS51" = "400" ] && [ "$C_MERGED51" = "400" ] && [ "$C_RANGE" = "400" ] && [ "$C_NEG" = "400" ] && [ "$C_UNKNOWN" = "400" ] && [ "$C_NULL" = "400" ]; then
  pass "player.list 14 positions / 51 ids / 50 ids + another single id / id > int4 / negative id / unknown position / null id → 400"
else
  fail "player.list invalid lists → 400" "pos14=$C_POS14 ids51=$C_IDS51 merged51=$C_MERGED51 range=$C_RANGE neg=$C_NEG unknown=$C_UNKNOWN null=$C_NULL"
fi

# 5g. the list filters of change efootbase-function-parity:
#     playingStyles — several main styles OR-ed (each in either slot), the
#     single playingStyle merged in, AI styles AND-ed with the group;
#     teamNames — Team.name, OR-ed with clubIds, AND with leagues (J1 +
#     Arsenal FC is empty), an unknown name matches nothing;
#     skillKeys — Skill.efbKey, AND-ed with skillIds, an unknown key matches
#     nothing; every bound a 400.
trpc_get "player.list" '{"limit":1,"playingStyles":[1]}'
ST_GP="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"playingStyles":[22]}'
ST_TM="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"playingStyles":[1,22]}'
ST_OR="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"playingStyle":1,"playingStyles":[22]}'
ST_MERGED="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"playingStyles":[1,22,24],"aiStyles":["trickster","mazingRun"]}'
ST_AI="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"playingStyles":[1,22,24],"aiStyles":["trickster"]}'
ST_AI1="$(result 'd["total"]')"
ST_MAX=$(( ST_GP > ST_TM ? ST_GP : ST_TM ))
if [ -n "$ST_OR" ] && [ "$ST_OR" -ge "$ST_MAX" ] && [ "$ST_OR" -le $((ST_GP + ST_TM)) ] && [ "$ST_MERGED" = "$ST_OR" ] && [ -n "$ST_AI" ] && [ "$ST_AI" -le "$ST_AI1" ] && [ "$ST_AI" -gt 0 ]; then
  pass "player.list playingStyles [Goal Poacher, Target Man] → $ST_OR (OR, single playingStyle merged); + Front Line Pressure with Trickster ∧ Mazing Run → $ST_AI (≤ Trickster alone $ST_AI1)"
else
  fail "player.list playingStyles OR / AI AND" "gp=$ST_GP tm=$ST_TM or=$ST_OR merged=$ST_MERGED ai=$ST_AI ai1=$ST_AI1"
fi
trpc_get "player.teams" '{}'
ARSENAL_ID="$(result 'next(t["id"] for t in d if t["name"] == "Arsenal FC")')"
trpc_get "player.list" "{\"limit\":1,\"clubIds\":[$ARSENAL_ID]}"
TN_ID="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"teamNames":["Arsenal FC"]}'
TN_NAME="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"teamNames":["No Such Team FC 1999"]}'
TN_NONE="$(result 'd["total"]')"
trpc_get "player.list" "{\"limit\":1,\"teamNames\":[\"Arsenal FC\"],\"clubIds\":[$ARSENAL_ID]}"
TN_BOTH="$(result 'd["total"]')"
TN_SQL="$(sql "SELECT count(*) FROM \"Player\" p JOIN \"Team\" t ON t.id = p.\"teamId\" WHERE t.name = 'Arsenal FC'")"
if [ -n "$TN_ID" ] && [ "$TN_ID" -gt 0 ] && [ "$TN_NAME" = "$TN_ID" ] && [ "$TN_NAME" = "$TN_SQL" ] && [ "$TN_BOTH" = "$TN_ID" ] && [ "$TN_NONE" = "0" ]; then
  pass "player.list teamNames [Arsenal FC] → $TN_NAME = clubIds [$ARSENAL_ID] = the team's cards (SQL); an unknown name → 0"
else
  fail "player.list teamNames" "id=$TN_ID name=$TN_NAME sql=$TN_SQL both=$TN_BOTH none=$TN_NONE"
fi
# Team AND League (the Team list is not narrowed by the League): Arsenal FC with
# League J1 (26) = the Arsenal FC cards whose own league is 26 (none on the
# 2026-10-18 data).
if needs_card_leagues "player.list teamNames [Arsenal FC] ∧ leagueIds [26]"; then
  trpc_get "player.list" '{"limit":1,"teamNames":["Arsenal FC"],"leagueIds":[26]}'
  TN_J1="$(result 'd["total"]')"
  TN_J1_SQL="$(sql "SELECT count(*) FROM \"Player\" p JOIN \"Team\" t ON t.id = p.\"teamId\" WHERE t.name = 'Arsenal FC' AND p.\"leagueId\" = 26")"
  if [ "$CODE" = "200" ] && [ -n "$TN_J1" ] && [ "$TN_J1" = "$TN_J1_SQL" ]; then
    pass "player.list teamNames [Arsenal FC] ∧ League J1 → $TN_J1 = the Arsenal FC cards in league 26 (SQL)"
  else
    fail "player.list teamNames ∧ leagueIds (AND)" "api=$TN_J1 sql=$TN_J1_SQL code=$CODE"
  fi
fi

# 5h. Card league (efootbase-data-refresh-1024, catalogue-data-refresh "Card
#     League"): leagues 4 ∨ 26 with Arsenal FC ∨ Vissel Kobe lists the cards
#     whose OWN league is 4 or 26 and whose team is one of the two — the
#     independent count (503 on the 2026-10-18 data, the reference's number;
#     the former team-league rule gave 547) — and no Vissel Kobe card whose own
#     league is another one (30 on 2026-10-18).
if needs_card_leagues "player.list card league (leagues 4 ∨ 26 × Arsenal FC ∨ Vissel Kobe)"; then
  trpc_get "player.list" '{"limit":200,"leagueIds":[4,26],"teamNames":["Arsenal FC","Vissel Kobe"],"sort":"highest"}'
  CL_API="$(result '"%d|%s" % (d["total"], ",".join(i["id"] for i in d["items"]))')"
  CL_SQL="$(sql "SELECT count(*) OVER () || '|', p.id FROM \"Player\" p JOIN \"Team\" t ON t.id = p.\"teamId\"
    WHERE p.\"leagueId\" IN (4, 26) AND t.name IN ('Arsenal FC', 'Vissel Kobe') ORDER BY p.\"maxOvr\" DESC, p.id DESC LIMIT 200" \
    | py 'import sys; rows=[l.split("\t") for l in sys.stdin.read().splitlines() if l]; print((rows[0][0] if rows else "0|") + ",".join(r[1] for r in rows))')"
  CL_OTHER="$(sql "SELECT concat_ws('|', count(*) FILTER (WHERE p.\"leagueId\" IS DISTINCT FROM t.\"leagueId\"),
    count(*) FILTER (WHERE t.\"leagueId\" IN (4, 26)), count(*) FILTER (WHERE t.name = 'Vissel Kobe' AND p.\"leagueId\" NOT IN (4, 26)))
    FROM \"Player\" p JOIN \"Team\" t ON t.id = p.\"teamId\" WHERE t.name IN ('Arsenal FC', 'Vissel Kobe')")"
  if [ "$CODE" = "200" ] && [ -n "$CL_SQL" ] && [ "$CL_API" = "$CL_SQL" ] && [ "${CL_API%%|*}" -gt 0 ]; then
    pass "player.list leagues 4 ∨ 26 × Arsenal FC ∨ Vissel Kobe → ${CL_API%%|*} cards = the cards whose own league is 4 or 26 (SQL, same ids in High to low order); by the teams' league it would be $(printf '%s' "$CL_OTHER" | cut -d'|' -f2), $(printf '%s' "$CL_OTHER" | cut -d'|' -f3) Vissel Kobe cards of another league are not listed"
  else
    fail "player.list card league = the independent count" "api=${CL_API%%|*} sql=${CL_SQL%%|*} same_ids=$([ "$CL_API" = "$CL_SQL" ] && echo yes || echo no) code=$CODE"
  fi
fi

# 5h2. Card league in the card DTO (change a11y-names-and-card-league, spec
#      a11y-and-card-league "Card League In The Card DTO"): player.byId's
#      `cardLeague` is the League row of the card's stored Player.leagueId
#      (null where SQL is NULL), and `leagueIds=[cardLeague.id]` lists the card
#      — so the card page never names a league the filter would not match.
#      Sample: 200 cards chosen by SQL at random, plus — chosen by SQL, never
#      fixed ids — a card without a stored league, a "FREE" card whose own
#      league differs from its team's ("Free Agent" vs "Other" on the
#      2026-10-24 data) and another card of that kind (a Vissel Kobe card of
#      league 30 there). Each card's list query is narrowed by its team,
#      nation and overall so it lands on page 1; calls go in tRPC batches of
#      ten (the API's maxBatchSize). The number of cards whose own league
#      differs from their team's league is then computed through the API alone
#      — per league L: the L-filter's total minus the total of L ∧ the teams
#      whose league is L (player.teams) — and compared with the independent
#      count (17,608 on the 2026-10-24 data).
if needs_card_leagues "player.byId cardLeague = the stored card league (sample) and the League filter lists the card"; then
  CDL_SAMPLE_SQL='SELECT p.id, p."baseId", coalesce(p."leagueId"::text, $$$$), coalesce(l.name, $$$$), coalesce(p."teamId"::text, $$$$),
      coalesce(t."leagueId"::text, $$$$), p."nationalityId", p.ovr, coalesce(tl.name, $$$$), s.tag
    FROM (
      (SELECT id, $$random$$ AS tag FROM "Player" ORDER BY random() LIMIT 200)
      UNION ALL (SELECT id, $$no-league$$ FROM "Player" WHERE "leagueId" IS NULL ORDER BY random() LIMIT 1)
      UNION ALL (SELECT p.id, $$free$$ FROM "Player" p JOIN "Team" t ON t.id = p."teamId"
                 WHERE t.name = $$FREE$$ AND p."leagueId" IS NOT NULL AND p."leagueId" IS DISTINCT FROM t."leagueId" ORDER BY random() LIMIT 1)
      UNION ALL (SELECT p.id, $$other-team$$ FROM "Player" p JOIN "Team" t ON t.id = p."teamId"
                 WHERE t.name <> $$FREE$$ AND p."leagueId" IS NOT NULL AND p."leagueId" IS DISTINCT FROM t."leagueId" ORDER BY random() LIMIT 1)
    ) s
    JOIN "Player" p ON p.id = s.id
    LEFT JOIN "League" l ON l.id = p."leagueId"
    LEFT JOIN "Team" t ON t.id = p."teamId"
    LEFT JOIN "League" tl ON tl.id = t."leagueId"'
  CDL_TSV="$(sql "$CDL_SAMPLE_SQL")"
  CDL_DIFF_SQL="$(sql 'SELECT count(*) FROM "Player" p JOIN "Team" t ON t.id = p."teamId" WHERE p."leagueId" IS NOT NULL AND p."leagueId" IS DISTINCT FROM t."leagueId"')"
  CDL_PY='
import json, sys, urllib.parse, urllib.request
api = sys.argv[1]
def batch(proc, inputs):
    out = []
    for i in range(0, len(inputs), 10):
        part = inputs[i:i + 10]
        q = urllib.parse.quote(json.dumps({str(k): {"json": v} for k, v in enumerate(part)}))
        url = "%s/trpc/%s?batch=1&input=%s" % (api, ",".join([proc] * len(part)), q)
        with urllib.request.urlopen(url, timeout=30) as r:
            for item in json.load(r):
                if "error" in item:
                    raise SystemExit("ERR %s: %s" % (proc, json.dumps(item["error"])[:200]))
                out.append(item["result"]["data"]["json"])
    return out
rows = [l.split("\t") for l in sys.stdin.read().splitlines() if l.strip()]
cards = [dict(id=r[0], base=r[1], league=r[2], lname=r[3], team=r[4], tleague=r[5], nat=int(r[6]), ovr=int(r[7]), tlname=r[8], tag=r[9]) for r in rows]
if len(cards) < 200:
    raise SystemExit("ERR sample has %d cards" % len(cards))
dtos = batch("player.byId", [{"baseId": c["base"], "cardId": c["id"]} for c in cards])
bad, notes, listed, unlisted, diff_api, diff_sql = [], [], 0, [], 0, 0
for c, d in zip(cards, dtos):
    cl = (d or {}).get("cardLeague")
    want = None if c["league"] == "" else (int(c["league"]), c["lname"])
    got = None if cl is None else (cl["id"], cl["name"])
    if d is None or got != want:
        bad.append("%s want=%s got=%s" % (c["id"], want, got))
        continue
    if cl is not None and c["tleague"] != "" and cl["id"] != int(c["tleague"]): diff_api += 1
    if c["league"] != "" and c["league"] != c["tleague"] and c["team"] != "": diff_sql += 1
    if c["tag"] != "random":
        notes.append("%s %s: own league %s, team league %s" % (c["tag"], c["id"], "null" if cl is None else "%d %s" % (cl["id"], cl["name"]), d.get("leagueName")))
    if c["tag"] == "free" and (cl is None or cl["name"] == d.get("leagueName")):
        bad.append("%s FREE card: own league %s equals the team league %s" % (c["id"], cl, d.get("leagueName")))
def narrowed(c, d):
    q = dict(leagueIds=[d["cardLeague"]["id"]], ovrMin=c["ovr"], ovrMax=c["ovr"], limit=100)
    if c["team"] != "": q["clubIds"] = [int(c["team"])]
    if c["nat"] > 0: q["nationalityIds"] = [c["nat"]]
    return q
pairs = [(c, d) for c, d in zip(cards, dtos) if d and d.get("cardLeague")]
need = [c for c, _ in pairs]
lists = batch("player.list", [narrowed(c, d) for c, d in pairs])
for c, res in zip(need, lists):
    if any(i["id"] == c["id"] for i in res["items"]): listed += 1
    else: unlisted.append("%s (total %d)" % (c["id"], res["total"]))
# Global: per league, the filter total minus the cards of the teams of that league.
leagues = batch("player.leagues", [None])[0]
teams = batch("player.teams", [None])[0]
specs = []
for lg in leagues:
    specs.append((lg["id"], "all", dict(leagueIds=[lg["id"]], limit=1)))
    own = [t["id"] for t in teams if t["leagueId"] == lg["id"]]
    for k in range(0, len(own), 50):
        specs.append((lg["id"], "same", dict(leagueIds=[lg["id"]], clubIds=own[k:k + 50], limit=1)))
totals = batch("player.list", [s[2] for s in specs])
global_diff = sum(t["total"] if s[1] == "all" else -t["total"] for s, t in zip(specs, totals))
print("|".join(map(str, [len(cards), len(bad), listed, len(need), len(unlisted), diff_api, diff_sql, global_diff])))
print("; ".join(notes))
print("; ".join(bad[:5] + unlisted[:5]))
'
  CDL_OUT="$(printf '%s\n' "$CDL_TSV" | py "$CDL_PY" "$API" 2>&1)"
  CDL_LINE="$(printf '%s\n' "$CDL_OUT" | sed -n 1p)"
  CDL_NOTES="$(printf '%s\n' "$CDL_OUT" | sed -n 2p)"
  CDL_BAD="$(printf '%s\n' "$CDL_OUT" | sed -n 3p)"
  IFS='|' read -r CDL_N CDL_BADN CDL_LISTED CDL_NEED CDL_UNLISTED CDL_DAPI CDL_DSQL CDL_GLOBAL <<<"$CDL_LINE"
  if [ -n "$CDL_TSV" ] && [[ "${CDL_N:-}" =~ ^[0-9]+$ ]] && [ "$CDL_BADN" = "0" ] && [ "$CDL_UNLISTED" = "0" ] && [ "$CDL_LISTED" = "$CDL_NEED" ] \
    && [ "$CDL_DAPI" = "$CDL_DSQL" ]; then
    pass "player.byId cardLeague = Player.leagueId → League (SQL) on $CDL_N cards (null where NULL), each listed by leagueIds=[cardLeague.id] ($CDL_LISTED/$CDL_NEED), own ≠ team league on $CDL_DAPI of them; $CDL_NOTES"
  else
    fail "player.byId cardLeague = the stored card league (sample) and the League filter lists the card" "out=${CDL_LINE:0:200} bad=${CDL_BAD:0:400}"
  fi
  if [ -n "$CDL_DIFF_SQL" ] && [[ "${CDL_GLOBAL:-}" =~ ^[0-9]+$ ]] && [ "$CDL_GLOBAL" = "$CDL_DIFF_SQL" ] && [ "$CDL_GLOBAL" -gt 0 ]; then
    pass "cards whose own league differs from their team's league: $CDL_GLOBAL through the API (per league: League filter − the league's own teams) = $CDL_DIFF_SQL (SQL)"
  else
    fail "cards whose own league differs from their team's league (API = SQL)" "api=${CDL_GLOBAL:-} sql=${CDL_DIFF_SQL:-}"
  fi
fi

# 5i. Community Rating (efootbase-data-refresh-1024, catalogue-data-refresh
#     "Community Rating Filter"): ratingMin N keeps the cards whose stored
#     average is at least N — no vote minimum, a card without ratings never
#     matches. Icons + 10 = the independent count of Icons with an average of 10
#     (every one exactly 10); ratingMin 2 = every card with an average ≥ 2;
#     1 / 11 / null / a fraction → 400. avgRating is a column of the original
#     schema, so this check needs no migration.
trpc_get "player.list" '{"limit":200,"cardTypeIn":["LEGENDARY"],"ratingMin":10,"sort":"new"}'
CR_ICONS="$(result '"%d|%s" % (d["total"], ",".join(i["id"] for i in d["items"]))')"
CR_ICONS_SQL="$(sql "SELECT count(*) OVER () || '|', id FROM \"Player\" WHERE \"cardType\" = 'LEGENDARY' AND \"avgRating\" >= 10
  ORDER BY \"releaseDate\" DESC NULLS LAST, id DESC LIMIT 200" \
  | py 'import sys; rows=[l.split("\t") for l in sys.stdin.read().splitlines() if l]; print((rows[0][0] if rows else "0|") + ",".join(r[1] for r in rows))')"
CR_EXACT="$(sql "SELECT count(*) FILTER (WHERE \"avgRating\" > 10) FROM \"Player\" WHERE \"cardType\" = 'LEGENDARY'")"
trpc_get "player.list" '{"limit":1,"ratingMin":2}'
CR_2="$(result 'd["total"]')"
CR_UNRATED="$(sql 'SELECT count(*) FROM "Player" WHERE "avgRating" IS NULL')"
trpc_get "player.list" '{"limit":1,"ratingMin":1}'
C_R1="$CODE"
trpc_get "player.list" '{"limit":1,"ratingMin":11}'
C_R11="$CODE"
trpc_get "player.list" '{"limit":1,"ratingMin":null}'
C_RNULL="$CODE"
trpc_get "player.list" '{"limit":1,"ratingMin":2.5}'
C_RFRAC="$CODE"
CR_2_RATED="$(sql 'SELECT count(*) FROM "Player" WHERE "avgRating" >= 2')"
if [ -n "$CR_ICONS_SQL" ] && [ "$CR_ICONS" = "$CR_ICONS_SQL" ] && [ "$CR_EXACT" = "0" ] && [ -n "$CR_2_RATED" ] && [ "$CR_2" = "$CR_2_RATED" ] \
  && [ "$C_R1" = "400" ] && [ "$C_R11" = "400" ] && [ "$C_RNULL" = "400" ] && [ "$C_RFRAC" = "400" ]; then
  pass "player.list Icons + ratingMin 10 → ${CR_ICONS%%|*} cards = the Icons with an average of 10 (SQL, same ids, none above 10); ratingMin 2 → $CR_2 = the cards rated ≥ 2 ($CR_UNRATED unrated cards never match); ratingMin 1 / 11 / null / 2.5 → 400"
else
  fail "player.list ratingMin = the stored average rule" "icons=${CR_ICONS%%|*} sql=${CR_ICONS_SQL%%|*} same_ids=$([ "$CR_ICONS" = "$CR_ICONS_SQL" ] && echo yes || echo no) above10=$CR_EXACT r2=$CR_2 sql=$CR_2_RATED codes=$C_R1/$C_R11/$C_RNULL/$C_RFRAC"
fi

# 5j. The dump date (catalogue-data-refresh "Stored Dump Date"): catalogue.meta
#     answers the stored CatalogueMeta.playersDumpedAt (ISO UTC) or null.
if needs_migration "catalogue.meta = the stored dump date"; then
  trpc_get "catalogue.meta" '{}'
  CM="$(result 'd["playersDumpedAt"] or ""')"
  if [ "$CODE" = "200" ] && [ "$CM" = "$DUMP_DATE" ] && { [ -n "$CM" ] || [ "${SMOKE_REQUIRE_REFRESH:-}" != "1" ]; }; then
    pass "catalogue.meta → playersDumpedAt ${CM:-null} = CatalogueMeta (SQL)"
  else
    fail "catalogue.meta = the stored dump date" "api='$CM' sql='$DUMP_DATE' code=$CODE body=${BODY:0:160}"
  fi
fi
trpc_get "skill.list" '{}'
RABONA_ID="$(result 'next(s["id"] for s in d if s["key"] == "s_rabona")')"
SOMBRERO_ID="$(result 'next(s["id"] for s in d if s["key"] == "s_sombrero")')"
trpc_get "player.list" "{\"limit\":1,\"skillIds\":[$RABONA_ID,$SOMBRERO_ID]}"
SK_IDS="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"skillKeys":["s_rabona","s_sombrero"]}'
SK_KEYS="$(result 'd["total"]')"
trpc_get "player.list" "{\"limit\":1,\"skillIds\":[$RABONA_ID],\"skillKeys\":[\"s_sombrero\"]}"
SK_MIX="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"skillKeys":["s_no_such_skill_1999"]}'
SK_NONE="$(result 'd["total"]')"
if [ -n "$SK_IDS" ] && [ "$SK_IDS" -gt 0 ] && [ "$SK_KEYS" = "$SK_IDS" ] && [ "$SK_MIX" = "$SK_IDS" ] && [ "$SK_NONE" = "0" ]; then
  pass "player.list skillKeys [s_rabona, s_sombrero] → $SK_KEYS = skillIds [$RABONA_ID, $SOMBRERO_ID] (AND, mixed forms merged); an unknown key → 0"
else
  fail "player.list skillKeys" "ids=$SK_IDS keys=$SK_KEYS mix=$SK_MIX none=$SK_NONE"
fi
NAMES_51="$(py 'import json; print(json.dumps(["Team %d" % i for i in range(51)]))')"
NAMES_21="$(py 'import json; print(json.dumps(["Team %d" % i for i in range(21)]))')"
KEYS_21="$(py 'import json; print(json.dumps(["s_k%d" % i for i in range(21)]))')"
IDS_30="$(py 'print(",".join(str(i) for i in range(1, 31)))')"
trpc_get "player.list" "{\"limit\":1,\"teamNames\":$NAMES_51}"
C_TN51="$CODE"
trpc_get "player.list" "{\"limit\":1,\"clubIds\":[$IDS_30],\"teamNames\":$NAMES_21}"
C_TNMIX="$CODE"
trpc_get "player.list" "{\"limit\":1,\"skillKeys\":$KEYS_21}"
C_SK21="$CODE"
trpc_get "player.list" '{"limit":1,"skillIds":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],"skillKeys":["s_rabona"]}'
C_SKMIX="$CODE"
trpc_get "player.list" '{"limit":1,"skillKeys":["rabona"]}'
C_SKBAD="$CODE"
trpc_get "player.list" '{"limit":1,"teamNames":[""]}'
C_TNEMPTY="$CODE"
trpc_get "player.list" "{\"limit\":1,\"playingStyles\":[$IDS_51]}"
C_ST51="$CODE"
if [ "$C_TN51" = "400" ] && [ "$C_TNMIX" = "400" ] && [ "$C_SK21" = "400" ] && [ "$C_SKMIX" = "400" ] && [ "$C_SKBAD" = "400" ] && [ "$C_TNEMPTY" = "400" ] && [ "$C_ST51" = "400" ]; then
  pass "player.list 51 team names / 30 ids + 21 names / 21 skill keys / 20 ids + 1 key / a malformed key / an empty name / 51 styles → 400"
else
  fail "player.list new list bounds → 400" "tn51=$C_TN51 tnmix=$C_TNMIX sk21=$C_SK21 skmix=$C_SKMIX skbad=$C_SKBAD tnempty=$C_TNEMPTY st51=$C_ST51"
fi

# 6. pagination: 10 pages sorted by Speed carry no duplicate id (deterministic tiebreaker)
IDS_FILE="$(mktemp -t eflab-smoke-ids.XXXXXX)"
PAGE_FAIL=""
for P in 1 2 3 4 5 6 7 8 9 10; do
  trpc_get "player.list" "{\"page\":$P,\"limit\":24,\"sort\":\"speed\",\"order\":\"desc\"}"
  if [ "$CODE" != "200" ]; then PAGE_FAIL="page $P code=$CODE"; break; fi
  result '"\n".join(str(i["id"]) for i in d["items"])' >>"$IDS_FILE"
done
TOTAL_IDS="$(grep -c . "$IDS_FILE")"
DUP_IDS="$(sort "$IDS_FILE" | uniq -d | wc -l | tr -d ' ')"
if [ -z "$PAGE_FAIL" ] && [ "$TOTAL_IDS" = "240" ] && [ "$DUP_IDS" = "0" ]; then
  pass "player.list sort=speed pages 1–10 → 240 ids, 0 duplicates"
else
  fail "player.list sort=speed pages 1–10 → no duplicates" "${PAGE_FAIL:-ids=$TOTAL_IDS duplicates=$DUP_IDS}"
fi
rm -f "$IDS_FILE"

# 7. compare keeps input order: [A,B] and [B,A] (full card rows: needs the migrated schema)
trpc_get "player.list" '{"page":1,"limit":2,"sort":"ovr","order":"desc"}'
ID_A="$(result 'd["items"][0]["id"]')"
ID_B="$(result 'd["items"][1]["id"]')"
if ! needs_migration "player.compare keeps selection order"; then
  :
elif [ -n "$ID_A" ] && [ -n "$ID_B" ] && [ "$ID_A" != "$ID_B" ]; then
  trpc_get "player.compare" "{\"cardIds\":[\"$ID_A\",\"$ID_B\"]}"
  ORDER_AB="$(result '",".join(str(p["id"]) for p in d)')"
  trpc_get "player.compare" "{\"cardIds\":[\"$ID_B\",\"$ID_A\"]}"
  ORDER_BA="$(result '",".join(str(p["id"]) for p in d)')"
  if [ "$ORDER_AB" = "$ID_A,$ID_B" ] && [ "$ORDER_BA" = "$ID_B,$ID_A" ]; then
    pass "player.compare keeps selection order ([A,B] and [B,A])"
  else
    fail "player.compare keeps selection order" "A=$ID_A B=$ID_B got AB=$ORDER_AB BA=$ORDER_BA"
  fi
else
  fail "player.compare (could not pick two ids from player.list)" "code=$CODE"
fi

# 8. accent-insensitive search in player.list: "Mbappe" finds Mbappé cards
trpc_get "player.list" '{"q":"Mbappe","limit":5}'
MB_TOTAL="$(result 'd["total"]')"
MB_NAME="$(result 'd["items"][0]["name"] if d["items"] else ""')"
if [ "$CODE" = "200" ] && [ -n "$MB_TOTAL" ] && [ "$MB_TOTAL" -gt 0 ]; then
  pass "player.list q=Mbappe → $MB_TOTAL cards (first: $MB_NAME)"
else
  fail "player.list q=Mbappe → >0 cards" "code=$CODE total=$MB_TOTAL body=${BODY:0:160}"
fi

# 9. player.search (change efootbase-function-parity, design decision D8;
#    survey 2026-10-23 S2 §4, S3 §1.5 / §2): the folded query is a substring
#    of the card name OR of its pack / campaign name, from 3 characters, in
#    the order max overall DESC, card id DESC (no tiers, no fuzzy matching),
#    12 rows per page with hasMore, each row with its pack name.
search_order_ok() { result '[(-r["maxOvr"], -int(r["id"])) for r in d["rows"]] == sorted((-r["maxOvr"], -int(r["id"])) for r in d["rows"])'; }
trpc_get "player.search" '{"q":"Lionel Messi"}'
TOP_NAME="$(result 'd["rows"][0]["name"] if d["rows"] else ""')"
if [ "$CODE" = "200" ] && [ "$TOP_NAME" = "Lionel Messi" ]; then
  pass "player.search 'Lionel Messi' → first result Lionel Messi"
else
  fail "player.search 'Lionel Messi' → first result Lionel Messi" "code=$CODE first=$TOP_NAME"
fi
# search_page_vs_sql <term>: player.search page 1 (rows: id, name, pack name;
# hasMore) against the rule in SQL (search_sql). Sets SP_RESULT to
# "<sql count>|<equal>" (and BODY / CODE, like trpc_get — not run in a subshell).
SP_RESULT=""
search_page_vs_sql() {
  local term="$1" want
  trpc_get "player.search" "{\"q\":\"$term\"}"
  if ! want="$(sql "$(search_sql "$term")")"; then SP_RESULT="|sql failed"; return; fi
  SP_RESULT="$(printf '%s' "$BODY" | py '
import json, sys
d = json.load(sys.stdin)["result"]["data"]["json"]
rows = [l.split("\t") for l in sys.argv[1].splitlines() if l]
got = [(r["id"], r["name"], r["packName"] or "") for r in d["rows"]]
want = [(r[0], r[2], r[3]) for r in rows[:12]]
print("%d|%s" % (len(rows), got == want and d["hasMore"] == (len(rows) > 12)))' "$want" 2>/dev/null)"
}
# A pack-name term: no card name contains "wonderkids" — the cards of the pack
# "Wonderkids 8 Oct '26" (8 on the 2026-10-18 data, Pau Cubarsí first), each
# row with its pack name.
search_page_vs_sql wonderkids
WK="$SP_RESULT"
WK_NAMES="$(sql "SELECT count(*) FROM \"Player\" WHERE \"nameNormalized\" LIKE '%wonderkids%'")"
if [ "$CODE" = "200" ] && [ "${WK#*|}" = "True" ] && [ "${WK%%|*}" -gt 0 ] && [ "$WK_NAMES" = "0" ]; then
  pass "player.search 'wonderkids' → the ${WK%%|*} cards of the matching pack (no card name has it) = the rule in SQL: same rows, order, pack names and hasMore"
else
  fail "player.search 'wonderkids' = the rule in SQL" "code=$CODE got='$WK' names_with_term=$WK_NAMES body=${BODY:0:200}"
fi
# Name or pack: "cote" → the cards named "cote" plus those of the packs whose
# folded name has it, e.g. Didier Drogba of "Côte d'Ivoire 2006" (7 cards on
# the 2026-10-18 data).
search_page_vs_sql cote
COTE="$SP_RESULT"
if [ "$CODE" = "200" ] && [ "${COTE#*|}" = "True" ] && [ "${COTE%%|*}" -gt 0 ]; then
  pass "player.search 'cote' → ${COTE%%|*} cards = the rule in SQL (accent-folded pack names, e.g. Côte d'Ivoire)"
else
  fail "player.search 'cote' = the rule in SQL" "code=$CODE got='$COTE'"
fi
# Contiguous substring only: reversed words find nothing.
trpc_get "player.search" '{"q":"messi lionel"}'
if [ "$CODE" = "200" ] && [ "$(result 'len(d["rows"]) == 0 and d["hasMore"] is False')" = "True" ]; then
  pass "player.search 'messi lionel' → no result"
else
  fail "player.search 'messi lionel' → no result" "code=$CODE body=${BODY:0:200}"
fi
# Max overall order, whole word or not: "ronald" → the rule in SQL (on the
# 2026-10-18 data Cristiano Ronaldo 103, Ronaldinho 102, Ronald Koeman 102 —
# id DESC breaks the tie); "ronaldo" → its first row = the SQL first row
# (Cristiano Ronaldo).
search_page_vs_sql ronald
RONALD="$SP_RESULT"
RONALD_ORDER="$(search_order_ok)"
RONALD_TOP3="$(result '"|".join("%s %d" % (r["name"], r["maxOvr"]) for r in d["rows"][:3])')"
search_page_vs_sql ronaldo
RONALDO="$SP_RESULT"
RONALDO_TOP="$(result 'd["rows"][0]["name"]')"
if [ "$CODE" = "200" ] && [ "${RONALD#*|}" = "True" ] && [ "$RONALD_ORDER" = "True" ] && [ "${RONALDO#*|}" = "True" ] && [ -n "$RONALDO_TOP" ]; then
  pass "player.search 'ronald' → $RONALD_TOP3 … = the rule in SQL (max overall, then id); 'ronaldo' → $RONALDO_TOP first (SQL)"
else
  fail "player.search 'ronald' / 'ronaldo' = the rule in SQL" "code=$CODE ronald='$RONALD' top3='$RONALD_TOP3' order=$RONALD_ORDER ronaldo='$RONALDO'"
fi
# Paging: "messi" (the cards named Messi + those of the "Leo Messi Edition …"
# packs; 113 on the 2026-10-18 data, the independent SQL count now) → pages of
# 12 with hasMore, the last page holds the rest and has no more; the pages
# hold exactly the SQL ids in its max-overall order; page 51 and a 2- or
# 101-character term are a 400.
MESSI_SQL="$(sql "$(search_sql messi)" | cut -f1,2)"
MESSI_N_SQL="$(printf '%s\n' "$MESSI_SQL" | grep -c .)"
MESSI_PAGES=$(( (MESSI_N_SQL + 11) / 12 ))
MESSI_IDS="$(mktemp -t eflab-smoke-messi.XXXXXX)"
MESSI_FAIL=""
[ "$MESSI_N_SQL" -gt 0 ] && [ "$MESSI_PAGES" -le 50 ] || MESSI_FAIL="SQL count $MESSI_N_SQL (expected 1–600)"
for P in $(seq 1 "$MESSI_PAGES"); do
  [ -n "$MESSI_FAIL" ] && break
  trpc_get "player.search" "{\"q\":\"messi\",\"page\":$P}"
  if [ "$CODE" != "200" ]; then MESSI_FAIL="page $P code=$CODE"; break; fi
  SHAPE="$(result '"%d|%s" % (len(d["rows"]), d["hasMore"])')"
  if [ "$P" -lt "$MESSI_PAGES" ] && [ "$SHAPE" != "12|True" ]; then MESSI_FAIL="page $P → $SHAPE"; break; fi
  if [ "$P" = "$MESSI_PAGES" ] && [ "$SHAPE" != "$((MESSI_N_SQL - 12 * (MESSI_PAGES - 1)))|False" ]; then MESSI_FAIL="page $P → $SHAPE"; break; fi
  result '"\n".join("%s\t%d" % (r["id"], r["maxOvr"]) for r in d["rows"])' >>"$MESSI_IDS"
done
MESSI_N="$(cut -f1 "$MESSI_IDS" | sort -u | grep -c .)"
MESSI_SORTED="$([ "$(cat "$MESSI_IDS")" = "$MESSI_SQL" ] && echo True || echo False)"
rm -f "$MESSI_IDS"
trpc_get "player.search" '{"q":"me"}'
C_Q2="$CODE"
trpc_get "player.search" "{\"q\":\"$(py 'print("x" * 101)')\"}"
C_Q101="$CODE"
trpc_get "player.search" '{"q":"messi","page":51}'
C_P51="$CODE"
trpc_get "player.search" '{"q":"messi","limit":8}'
C_LIMIT="$CODE"
if [ -z "$MESSI_FAIL" ] && [ "$MESSI_N" = "$MESSI_N_SQL" ] && [ "$MESSI_SORTED" = "True" ] && [ "$C_Q2" = "400" ] && [ "$C_Q101" = "400" ] && [ "$C_P51" = "400" ] && [ "$C_LIMIT" = "200" ]; then
  pass "player.search 'messi' → $((MESSI_PAGES - 1)) pages of 12 (hasMore) + $((MESSI_N_SQL - 12 * (MESSI_PAGES - 1))) = $MESSI_N_SQL distinct cards = the rule in SQL, same max-overall order; q of 2 / 101 characters and page 51 → 400; an old limit is ignored"
else
  fail "player.search paging and bounds" "fail=$MESSI_FAIL n=$MESSI_N sql=$MESSI_N_SQL same_order=$MESSI_SORTED q2=$C_Q2 q101=$C_Q101 p51=$C_P51 limit=$C_LIMIT"
fi
# player.trending (the palette's "Latest Players" empty state) carries the
# same pack chip as the search rows: `packName` on every row (the card's pack
# / campaign name or null), one card per base player; a row's pack name equals
# the one player.search gives that card.
trpc_get "player.trending" '{}'
TR_CODE="$CODE"
TR="$(result '"%d|%s|%s|%s" % (len(d), all("packName" in r for r in d), len({r["baseId"] for r in d}) == len(d), any(r["packName"] for r in d))')"
TR_PROBE="$(result 'next(("%s\t%s\t%s" % (r["id"], r["name"], r["packName"]) for r in d if r["packName"] and len(r["name"]) >= 3), "")')"
TR_SAME="no"
if [ -n "$TR_PROBE" ]; then
  TR_ID="$(printf '%s' "$TR_PROBE" | cut -f1)"
  TR_NAME="$(printf '%s' "$TR_PROBE" | cut -f2)"
  TR_PACK="$(printf '%s' "$TR_PROBE" | cut -f3)"
  for P in 1 2 3 4 5; do
    trpc_get "player.search" "$(py 'import json,sys; print(json.dumps({"q": sys.argv[1], "page": int(sys.argv[2])}))' "$TR_NAME" "$P")"
    FOUND="$(result "next((r[\"packName\"] or \"\") for r in d[\"rows\"] if r[\"id\"] == \"$TR_ID\") if any(r[\"id\"] == \"$TR_ID\" for r in d[\"rows\"]) else \"\"")"
    if [ -n "$FOUND" ]; then [ "$FOUND" = "$TR_PACK" ] && TR_SAME="yes"; break; fi
    [ "$(result 'd["hasMore"]')" = "True" ] || break
  done
fi
if [ "$TR_CODE" = "200" ] && [ "$TR" = "18|True|True|True" ] && [ "$TR_SAME" = "yes" ]; then
  pass "player.trending → 18 distinct players, each row with packName; '$TR_NAME' reads '$TR_PACK' as in player.search"
else
  fail "player.trending packName (expected '18|True|True|True' and the same pack as player.search)" "code=$TR_CODE got='$TR' probe='$TR_PROBE' same=$TR_SAME"
fi

# 9b. player.list `q` uses the same rule: "messi" → the SQL count of the rule
#     (113 on the 2026-10-18 data); a term shorter than 3 characters is
#     ignored (the whole catalogue), as on the reference; the reference's deep
#     link (Epic, search messi, RWF, left foot, weak-foot accuracy 3★ = 2, base
#     overall ≥ 87, High to low) lists exactly the cards the rule gives in SQL
#     (Messi 89136409091415 and 89133456301399 on the 2026-10-18 data).
trpc_get "player.list" '{"q":"messi","limit":1}'
LQ_MESSI="$(result 'd["total"]')"
trpc_get "player.list" '{"q":"me","limit":1}'
LQ_SHORT="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1}'
LQ_ALL="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":10,"sort":"highest","q":"messi","cardTypeIn":["EPIC"],"positions":["RWF"],"strongerFoot":1,"weakFootAccuracyIn":[2],"ovrMin":87}'
REF_LINK="$(result '"%d|%s" % (d["total"], ",".join(i["id"] for i in d["items"]))')"
REF_SQL="$(sql "SELECT m.id FROM ($(search_sql messi)) m JOIN \"Player\" p ON p.id = m.id
  WHERE p.\"cardType\" = 'EPIC' AND p.\"registeredPosition\" = 10 AND p.\"strongerFoot\" = 1 AND p.\"weakFootAccuracy\" = 2 AND p.ovr >= 87
  ORDER BY p.\"maxOvr\" DESC, p.id DESC" | py 'import sys; ids=[l for l in sys.stdin.read().splitlines() if l]; print("%d|%s" % (len(ids), ",".join(ids[:10])))')"
if [ "$LQ_MESSI" = "$MESSI_N_SQL" ] && [ -n "$LQ_ALL" ] && [ "$LQ_SHORT" = "$LQ_ALL" ] && [ "$REF_LINK" = "$REF_SQL" ] && [ "${REF_SQL%%|*}" -gt 0 ]; then
  pass "player.list q=messi → $LQ_MESSI (name or pack, = SQL); q=me ignored ($LQ_SHORT = all); the reference link → ${REF_LINK#*|} = the rule in SQL"
else
  fail "player.list q rule / reference link = the rule in SQL" "messi=$LQ_MESSI sql=$MESSI_N_SQL short=$LQ_SHORT all=$LQ_ALL ref=$REF_LINK sql=$REF_SQL"
fi

# 9c. Name sort orders by the accent-free, lower-case name (nameNormalized,
#     id tiebreaker): A→Z ascending, Z→A descending. The key below is the same
#     normalisation for plain Latin names (NFD, marks stripped, lower-case);
#     pairs whose key is still non-ASCII (ø, ß, CJK — transliterated by the
#     dump) are not compared. The database collation is "C" (byte order), which
#     Python's str order reproduces for ASCII.
NAME_KEY_PY='import unicodedata
def k(s): return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()
def ordered(names, rev):
    keys = [k(n) for n in names]
    pairs = [(a, b) for a, b in zip(keys, keys[1:]) if a.isascii() and b.isascii()]
    return len(names) >= 2 and len(pairs) > 0 and all((a >= b) if rev else (a <= b) for a, b in pairs)'
name_sorted() {
  printf '%s' "$BODY" | py "$NAME_KEY_PY"'
import json,sys
d=json.load(sys.stdin)["result"]["data"]["json"]
print(ordered([p["name"] for p in d["items"]], sys.argv[1] == "desc"), d["items"][0]["name"] if d["items"] else "")' "$1" 2>/dev/null
}
trpc_get "player.list" '{"page":1,"limit":40,"sort":"name","order":"asc"}'
NAME_ASC="$(name_sorted asc)"
trpc_get "player.list" '{"page":2,"limit":40,"sort":"name","order":"desc"}'
NAME_DESC="$(name_sorted desc)"
if [ "${NAME_ASC%% *}" = "True" ] && [ "${NAME_DESC%% *}" = "True" ]; then
  pass "player.list sort=name → A→Z ascending (first: ${NAME_ASC#* }), Z→A descending"
else
  fail "player.list sort=name → ordered by the normalised name" "asc=$NAME_ASC desc=$NAME_DESC"
fi

# 9d. player.countries = the Nation dialog's list: every row exactly id / name /
#     flagUrl (the per-nation card count was removed with the "Popular" group,
#     owner decision 2026-10-24), unique ids, and the ten nations the dialog
#     lists first (FIXED_FIRST_NATIONS in @eflab/shared, matched by exact name)
#     all present.
trpc_get "player.countries" '{}'
NAT_ROWS="$(result 'len(d) if all(set(c) == {"id", "name", "flagUrl"} for c in d) and len({c["id"] for c in d}) == len(d) else -1')"
NAT_FIXED="$(result 'sum(1 for n in ["England", "France", "Spain", "Brazil", "Argentina", "Germany", "Italy", "Netherlands", "Portugal", "Belgium"] if n in {c["name"] for c in d})')"
if [ "$CODE" = "200" ] && [ -n "$NAT_ROWS" ] && [ "$NAT_ROWS" -gt 0 ] && [ "$NAT_FIXED" = "10" ]; then
  pass "player.countries → $NAT_ROWS nations, each id / name / flagUrl only (no card count); the ten fixed first nations present"
else
  fail "player.countries rows are id / name / flagUrl and hold the ten fixed nations" "code=$CODE rows=$NAT_ROWS fixed=$NAT_FIXED"
fi

# 10. player.byId resolves a real card (baseId must match the card; full card
#     rows: needs the migrated schema)
if needs_migration "player.byId resolves a real card"; then
  trpc_get "player.list" '{"page":1,"limit":1,"sort":"ovr","order":"desc"}'
  BASE_1="$(result 'd["items"][0]["baseId"]')"
  CARD_1="$(result 'd["items"][0]["id"]')"
  trpc_get "player.byId" "{\"baseId\":\"$BASE_1\",\"cardId\":\"$CARD_1\"}"
  BYID_ID="$(result 'd["id"]')"
  if [ "$CODE" = "200" ] && [ "$BYID_ID" = "$CARD_1" ]; then
    pass "player.byId $BASE_1/$CARD_1 → card detail"
  else
    fail "player.byId $BASE_1/$CARD_1" "code=$CODE id=$BYID_ID body=${BODY:0:160}"
  fi
fi

# 11. out-of-range id (20 digits) → HTTP 400, never 500
trpc_get "player.byId" '{"baseId":"1","cardId":"12345678901234567890"}'
if [ "$CODE" = "400" ]; then
  pass "player.byId with a 20-digit id → 400"
else
  fail "player.byId with a 20-digit id → 400" "code=$CODE body=${BODY:0:160}"
fi

# 12. malformed cookie is ignored → request still 200
trpc_get "player.list" '{"limit":1}' -H 'Cookie: promo=50%off'
if [ "$CODE" = "200" ]; then
  pass "player.list with 'Cookie: promo=50%off' → 200 (undecodable cookie ignored)"
else
  fail "player.list with malformed cookie → 200" "code=$CODE body=${BODY:0:160}"
fi

# ---------------------------------------------------------------------------
# Admin API checks (openspec admin-sync-worker, task 6.2)
# ---------------------------------------------------------------------------
# The API above serves the database of the shell / repo-root .env — the live
# catalogue — so no admin check writes through it. This section starts a SECOND
# API on $ADMIN_PORT (default 4301) whose DATABASE_URL is a scratch database it
# creates in the same local Postgres (eflab_smoke_admin_<pid>), migrates with
# `prisma migrate deploy`, gives one throwaway admin (admin-cli `create`, a
# random password handed over in ADMIN_PASSWORD — never printed, never an
# argument) and ALWAYS drops on exit (trap). The migration, the CLI and the
# second API run with a minimal environment (PATH, HOME, TMPDIR and what they
# need — no root .env, no efootbase key, no R2 credential: "API process" of
# data-sync-worker "Secrets Stay In The Worker"). Session cookies and the
# password travel through mode-600 files (curl -H @file / --data-binary @file).
# The worker is not started: worker-side state (RUNNING, heartbeat, blocked,
# finished runs with statistics) is written into the scratch database with psql.
# When the scratch database cannot be created (no psql, Postgres unreachable, a
# non-loopback host, no CREATE DATABASE right) the section is SKIPPED with a
# loud warning and counted apart — it never falls back to the live database.
# Its counts are reported separately, so the checks above keep their number.

apass() { APASS=$((APASS + 1)); echo "✓ [admin] $1"; }
afail() { AFAIL=$((AFAIL + 1)); FAILED_NAMES+=("[admin] $1"); echo "✗ [admin] $1"; [ -n "${2:-}" ] && echo "    $2"; }
admin_skip() {
  ADMIN_SKIPPED="$1"
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!! ADMIN SMOKE SKIPPED: $1"
  echo "!!! The admin checks did NOT run (they never fall back to the live database)."
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
}

# exec_clean_env <dir> <NAME=value…> -- <command…>
# Must run inside a subshell: drops every exported variable but PATH, HOME,
# TMPDIR, LANG, exports the given ones (builtin: values never reach an argv),
# changes to <dir> and execs the command.
exec_clean_env() {
  local dir="$1" v; shift
  while IFS= read -r v; do
    case "$v" in PATH|HOME|TMPDIR|LANG) ;; *) unset "$v" 2>/dev/null ;; esac
  done < <(compgen -e)
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do export "$1"; shift; done
  shift
  cd "$dir" || exit 1
  exec "$@"
}

# Derives the libpq variables of the live DATABASE_URL (shell first, then the
# repo-root .env — the precedence the first API uses) and the scratch URL.
ADMIN_DB_PY='
import os, shlex, sys, urllib.parse
root, name = sys.argv[1], sys.argv[2]
q = shlex.quote
def out(**kv): print(" ".join("%s=%s" % (k, q(v)) for k, v in kv.items()))
url = os.environ.get("DATABASE_URL") or ""
if not url:
    try:
        for line in open(os.path.join(root, ".env"), encoding="utf-8"):
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip("\"").strip("\x27")
    except OSError:
        pass
if not url:
    out(ADMIN_DB_ERR="DATABASE_URL is not set (shell or repo-root .env)"); sys.exit()
u = urllib.parse.urlsplit(url)
if u.scheme not in ("postgres", "postgresql") or not u.hostname:
    out(ADMIN_DB_ERR="DATABASE_URL is not a postgres URL"); sys.exit()
if u.hostname not in ("localhost", "127.0.0.1", "::1"):
    out(ADMIN_DB_ERR="the database host is not loopback; the scratch database is only created on a local Postgres"); sys.exit()
live = urllib.parse.unquote(u.path.lstrip("/"))
if not live or live == name:
    out(ADMIN_DB_ERR="cannot tell the live database name from DATABASE_URL"); sys.exit()
out(ADMIN_PGHOST=u.hostname, ADMIN_PGPORT=str(u.port or 5432), ADMIN_PGUSER=urllib.parse.unquote(u.username or ""),
    ADMIN_PGPASSWORD=urllib.parse.unquote(u.password or ""), LIVE_DB_NAME=live,
    SCRATCH_DB_URL=urllib.parse.urlunsplit((u.scheme, u.netloc, "/" + name, u.query, "")))
'

# Live-database snapshot (read-only session) of what a misrouted admin check
# could write: Admin / AdminSession counts, smoke admins, MANUAL runs and the
# admin-owned schedule fields of SyncConfig. Worker-owned state (heartbeat,
# blocked window, scheduled runs) is left out — a worker running against the
# live database changes it legitimately while this script runs.
live_snapshot() {
  pg_live_ro 2>/dev/null <<'SQL' || echo "unavailable"
SELECT concat_ws('/', (SELECT count(*) FROM "Admin"), (SELECT count(*) FROM "AdminSession"),
                 (SELECT count(*) FROM "SyncRun" WHERE "trigger" = 'MANUAL' OR "requestedById" IS NOT NULL),
                 (SELECT count(*) FROM "Admin" WHERE "username" = 'smoke_admin'),
                 (SELECT md5(string_agg(concat_ws('|', "enabled", "incrementalIntervalMin", "fullWeekday", "fullHourUtc", "updatedAt", "updatedById"), ','))
                  FROM "SyncConfig"));
SQL
}

ABODY=""
ACODE=""
AHDRS=""
# admin_req <GET|POST> <procedure> <input JSON | - (none) | @ (payload file already written)> [curl args…]
# Body → $ABODY, status → $ACODE, headers → $AHDRS. Every body is appended to
# $ADMIN_BODIES for the secret-field scan.
admin_req() {
  local method="$1" proc="$2" input="$3"; shift 3
  local out="$ADMIN_TMP/body" hdr="$ADMIN_TMP/headers"
  : >"$out"; : >"$hdr"
  if [ "$method" = "GET" ]; then
    local qs=""
    [ "$input" != "-" ] && qs="?input=$(py 'import json,sys,urllib.parse; print(urllib.parse.quote(json.dumps({"json": json.loads(sys.argv[1])})))' "$input")"
    ACODE="$(curl -sS -m 20 -o "$out" -D "$hdr" -w '%{http_code}' "$@" "$ADMIN_API/trpc/$proc$qs" 2>/dev/null || echo 000)"
  else
    [ "$input" != "@" ] && py 'import json,sys; print(json.dumps({"json": json.loads(sys.argv[1])}))' "$input" >"$ADMIN_TMP/payload"
    ACODE="$(curl -sS -m 20 -o "$out" -D "$hdr" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      --data-binary @"$ADMIN_TMP/payload" "$@" "$ADMIN_API/trpc/$proc" 2>/dev/null || echo 000)"
  fi
  ABODY="$(cat "$out")"
  AHDRS="$(tr -d '\r' <"$hdr")"
  printf '%s\n' "$ABODY" >>"$ADMIN_BODIES"
}
# Python expression over result.data.json (`d`) / the error message of $ABODY
ares() { printf '%s' "$ABODY" | py 'import json,sys; d=json.load(sys.stdin)["result"]["data"]["json"]; print(eval(sys.argv[1]))' "$1" 2>/dev/null; }
aerr() { printf '%s' "$ABODY" | py 'import json,sys; print(json.load(sys.stdin)["error"]["json"]["message"])' 2>/dev/null; }
no_store() { printf '%s\n' "$AHDRS" | grep -qi '^cache-control: *no-store'; }
# write_signin <username> <password>: sign-in payload file (values from [a-zA-Z0-9_-], no escaping needed)
write_signin() { printf '{"json":{"username":"%s","password":"%s"}}' "$1" "$2" >"$ADMIN_TMP/payload"; }
# save_cookie <file>: the eflab_admin token of the last response → "Cookie:" header file; prints nothing
save_cookie() {
  local line token
  line="$(printf '%s\n' "$AHDRS" | grep -i '^set-cookie: *eflab_admin=' | head -n 1)"
  token="${line#*eflab_admin=}"; token="${token%%;*}"
  printf 'Cookie: eflab_admin=%s\n' "$token" >"$1"
}
cookie_token() { local c; c="$(cat "$1")"; printf '%s' "${c#Cookie: eflab_admin=}"; }

# start_admin_api: (re)starts the second API on $ADMIN_PORT against the scratch
# database with a minimal environment (appends to $ADMIN_API_LOG). A restart
# also clears its in-memory per-address sign-in limit (20 / 15 min), which the
# later sign-in checks need.
start_admin_api() {
  if port_listening "$ADMIN_PORT"; then
    echo "admin api port $ADMIN_PORT is already in use — set SMOKE_ADMIN_PORT to a free port" >&2
    return 1
  fi
  ( exec_clean_env "$ROOT/apps/api" "DATABASE_URL=$SCRATCH_DB_URL" "API_PORT=$ADMIN_PORT" API_HOST=127.0.0.1 NODE_ENV=production \
      "WEB_ORIGIN=$ADMIN_ORIGIN" -- "$ROOT/apps/api/node_modules/.bin/tsx" src/server.ts ) >>"$ADMIN_API_LOG" 2>&1 &
  ADMIN_API_PID=$!
  echo "admin api starting on :$ADMIN_PORT (pid $ADMIN_API_PID, log $ADMIN_API_LOG, no root .env, no efootbase / R2 variable)"
  wait_for_health "$ADMIN_API" "$ADMIN_API_PID"
}

# signin_batch <file> <username> <password…>: ONE batched POST of admin.signIn
# (one call per password, in that order — tRPC runs them concurrently). Body →
# $ABODY, headers → $AHDRS. The payload is written by the printf builtin into a
# mode-600 file (values from [a-zA-Z0-9_-]; a password never reaches an argv).
signin_batch() {
  local out="$1" user="$2"; shift 2
  local procs="" body="" i=0 p
  for p in "$@"; do
    procs="$procs${procs:+,}admin.signIn"
    body="$body${body:+,}\"$i\":{\"json\":{\"username\":\"$user\",\"password\":\"$p\"}}"
    i=$((i + 1))
  done
  printf '{%s}' "$body" >"$ADMIN_TMP/payload_batch"
  ACODE="$(curl -sS -m 30 -o "$out" -D "$ADMIN_TMP/headers" -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
    --data-binary @"$ADMIN_TMP/payload_batch" -H "x-eflab-admin: 1" -H "Origin: $ADMIN_ORIGIN" "$ADMIN_API/trpc/$procs?batch=1" 2>/dev/null || echo 000)"
  ABODY="$(cat "$out")"; AHDRS="$(tr -d '\r' <"$ADMIN_TMP/headers")"
  printf '%s\n' "$ABODY" >>"$ADMIN_BODIES"
}
# Python over the batch response list (`b`)
abatch() { printf '%s' "$ABODY" | py 'import json,sys; b=json.load(sys.stdin); print(eval(sys.argv[1]))' "$1" 2>/dev/null; }

run_admin_checks() {
  echo ""
  echo "--- admin API checks (second API on :$ADMIN_PORT, scratch database) ---"
  if [ "${SMOKE_SKIP_ADMIN:-}" = "1" ]; then admin_skip "SMOKE_SKIP_ADMIN=1"; return; fi
  if ! command -v psql >/dev/null 2>&1; then admin_skip "psql is not on PATH (needed to create the scratch database)"; return; fi
  local name="eflab_smoke_admin_$$" derived
  ADMIN_DB_ERR=""
  derived="$(py "$ADMIN_DB_PY" "$ROOT" "$name")" || { admin_skip "could not read DATABASE_URL"; return; }
  eval "$derived"
  if [ -n "$ADMIN_DB_ERR" ]; then admin_skip "$ADMIN_DB_ERR"; return; fi

  ADMIN_TMP="$(mktemp -d -t eflab-smoke-admin.XXXXXX)" || { admin_skip "mktemp failed"; return; }
  chmod 700 "$ADMIN_TMP"
  umask 077
  ADMIN_BODIES="$ADMIN_TMP/bodies"
  : >"$ADMIN_BODIES"

  local live_before; live_before="$(live_snapshot)"

  if ! pg_maint -c "CREATE DATABASE \"$name\"" >"$ADMIN_TMP/createdb.log" 2>&1; then
    admin_skip "cannot create the scratch database $name on $ADMIN_PGHOST:$ADMIN_PGPORT ($(head -n 1 "$ADMIN_TMP/createdb.log"))"
    return
  fi
  SCRATCH_DB="$name"
  SCRATCH_CREATED=1
  echo "scratch database $SCRATCH_DB created on $ADMIN_PGHOST:$ADMIN_PGPORT (live database $LIVE_DB_NAME is only read)"

  # -- setup: migrate, throwaway admin, second API --------------------------
  if ( exec_clean_env "$ROOT/packages/db" "DATABASE_URL=$SCRATCH_DB_URL" CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 -- \
        "$ROOT/packages/db/node_modules/.bin/prisma" migrate deploy --schema=prisma/schema.prisma ) >"$ADMIN_TMP/migrate.log" 2>&1 \
    && grep -q "database \"$SCRATCH_DB\"" "$ADMIN_TMP/migrate.log" \
    && [ "$(pg_scratch -c 'SELECT count(*) FROM "SyncConfig"')" = "1" ]; then
    apass "scratch database migrated (prisma migrate deploy → $SCRATCH_DB, $(pg_scratch -c 'SELECT count(*) FROM "_prisma_migrations"') migrations, SyncConfig row present)"
  else
    afail "prisma migrate deploy on the scratch database" "$(tail -n 5 "$ADMIN_TMP/migrate.log")"
    return
  fi

  local admin_user="smoke_admin" admin_pw
  admin_pw="$(py 'import secrets; print(secrets.token_urlsafe(24))')"
  ( exec_clean_env "$ROOT/packages/db" "DATABASE_URL=$SCRATCH_DB_URL" "ADMIN_PASSWORD=$admin_pw" NODE_ENV=production -- \
      "$ROOT/packages/db/node_modules/.bin/tsx" src/admin-cli.ts create "$admin_user" ) >"$ADMIN_TMP/cli.log" 2>&1
  local cli_code=$? cli_out; cli_out="$(cat "$ADMIN_TMP/cli.log")"
  if [ "$cli_code" = "0" ] && [[ "$cli_out" == *"admin \"$admin_user\" created"*"in database $SCRATCH_DB @"* ]] && [[ "$cli_out" != *"$admin_pw"* ]]; then
    apass "admin-cli create $admin_user (ADMIN_PASSWORD from the environment) → created in $SCRATCH_DB, password not printed"
  else
    afail "admin-cli create on the scratch database" "code=$cli_code"
    return
  fi
  local admin_id; admin_id="$(pg_scratch -c "SELECT id FROM \"Admin\" WHERE username = '$admin_user'")"

  # -- admin-cli refusals (verify finding W5): nothing changes, no password printed --
  local hash0; hash0="$(pg_scratch -c "SELECT md5(\"passwordHash\") FROM \"Admin\" WHERE username = '$admin_user'")"
  local other_pw; other_pw="$(py 'import secrets; print(secrets.token_urlsafe(24))')"
  ( exec_clean_env "$ROOT/packages/db" "DATABASE_URL=$SCRATCH_DB_URL" "ADMIN_PASSWORD=$other_pw" NODE_ENV=production -- \
      "$ROOT/packages/db/node_modules/.bin/tsx" src/admin-cli.ts create "$admin_user" ) >"$ADMIN_TMP/cli-dup.log" 2>&1
  local dup_code=$? dup_out; dup_out="$(cat "$ADMIN_TMP/cli-dup.log")"
  local short_pw="short-pw-11"   # 11 characters (< 12)
  ( exec_clean_env "$ROOT/packages/db" "DATABASE_URL=$SCRATCH_DB_URL" "ADMIN_PASSWORD=$short_pw" NODE_ENV=production -- \
      "$ROOT/packages/db/node_modules/.bin/tsx" src/admin-cli.ts create smoke_short ) >"$ADMIN_TMP/cli-short.log" 2>&1
  local short_code=$? short_out; short_out="$(cat "$ADMIN_TMP/cli-short.log")"
  ( exec_clean_env "$ROOT/packages/db" "DATABASE_URL=$SCRATCH_DB_URL" "ADMIN_PASSWORD=$short_pw" NODE_ENV=production -- \
      "$ROOT/packages/db/node_modules/.bin/tsx" src/admin-cli.ts set-password "$admin_user" ) >"$ADMIN_TMP/cli-short2.log" 2>&1
  local short2_code=$?
  ( exec_clean_env "$ROOT/packages/db" "DATABASE_URL=$SCRATCH_DB_URL" NODE_ENV=production -- \
      "$ROOT/packages/db/node_modules/.bin/tsx" src/admin-cli.ts create smoke_arg "$other_pw" ) >"$ADMIN_TMP/cli-arg.log" 2>&1
  local arg_code=$? arg_out; arg_out="$(cat "$ADMIN_TMP/cli-arg.log")"
  local hash1; hash1="$(pg_scratch -c "SELECT md5(\"passwordHash\") FROM \"Admin\" WHERE username = '$admin_user'")"
  local n_admins; n_admins="$(pg_scratch -c 'SELECT count(*) FROM "Admin"')"
  if [ "$dup_code" = "1" ] && [[ "$dup_out" == *"already exists — unchanged"* ]] && [ -n "$hash0" ] && [ "$hash0" = "$hash1" ] && [ "$n_admins" = "1" ] \
    && [[ "$dup_out$short_out$arg_out" != *"$other_pw"* ]] && [[ "$short_out" != *"$short_pw"* ]]; then
    apass "admin-cli create of an existing name → refused, the stored hash unchanged, password not printed"
  else
    afail "admin-cli duplicate name refused, hash unchanged" "code=$dup_code same_hash=$([ "$hash0" = "$hash1" ] && echo yes || echo no) admins=$n_admins"
  fi
  if [ "$short_code" = "1" ] && [[ "$short_out" == *"at least 12 characters"* ]] && [ "$short2_code" = "1" ] && [ "$n_admins" = "1" ] && [ "$hash0" = "$hash1" ]; then
    apass "admin-cli create / set-password with an 11-character password → refused (at least 12), nothing stored"
  else
    afail "admin-cli short password refused" "create=$short_code set-password=$short2_code admins=$n_admins"
  fi
  if [ "$arg_code" = "1" ] && [[ "$arg_out" == *"never accepted on the command line"* ]] && [[ "$arg_out" != *"$other_pw"* ]] && [ "$n_admins" = "1" ]; then
    apass "admin-cli with the password as an argument → refused (never accepted on the command line), not echoed, nothing stored"
  else
    afail "admin-cli password argument refused" "code=$arg_code admins=$n_admins"
  fi

  ADMIN_API="http://127.0.0.1:$ADMIN_PORT"
  ADMIN_ORIGIN="http://127.0.0.1:4302"   # an allowed origin string only; nothing listens there
  ADMIN_API_LOG="$(mktemp -t eflab-smoke-admin-api.XXXXXX)"
  if ! start_admin_api; then
    afail "admin api /health on the scratch database"
    return
  fi

  local CSRF=(-H "x-eflab-admin: 1" -H "Origin: $ADMIN_ORIGIN")
  local C1="$ADMIN_TMP/cookie1" C2="$ADMIN_TMP/cookie2" C3="$ADMIN_TMP/cookie3"
  local attempts=0   # sign-in attempts that reach the handler (the per-address limit counts these)

  # -- 1. no session → 401 on every admin procedure but signIn -----------------
  local bad=""
  local spec proc input
  for spec in 'GET|admin.me|-' 'GET|admin.config.get|-' 'GET|admin.runs.list|{}' 'GET|admin.runs.get|{"id":1}' 'GET|admin.dashboard|-' \
              'POST|admin.signOut|null' 'POST|admin.config.update|{"enabled":true,"incrementalIntervalMin":60,"fullWeekday":0,"fullHourUtc":3}' \
              'POST|admin.runs.queue|{"kind":"CHECK"}' 'POST|admin.runs.cancel|{"id":1}'; do
    proc="${spec#*|}"; input="${proc#*|}"; proc="${proc%%|*}"
    admin_req "${spec%%|*}" "$proc" "$input" "${CSRF[@]}"
    local shape
    shape="$(printf '%s' "$ABODY" | py 'import json,sys; j=json.load(sys.stdin); e=j["error"]["json"]; print("result" not in j and e["data"]["httpStatus"] == 401 and e["message"] == "Admin sign-in required")' 2>/dev/null)"
    if [ "$ACODE" != "401" ] || [ "$shape" != "True" ] || ! no_store; then bad="$bad $proc=$ACODE/$shape"; fi
  done
  if [ -z "$bad" ] && [ "$(pg_scratch -c 'SELECT count(*) FROM "SyncRun"')" = "0" ]; then
    apass "9 admin procedures without a session → 401 'Admin sign-in required', no data, Cache-Control: no-store, nothing queued"
  else
    afail "admin procedures without a session → 401" "bad:$bad"
  fi

  # -- 2. CSRF guard on sign-in (403s never reach the handler) -----------------
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ -H "Origin: $ADMIN_ORIGIN"
  local c_nohdr="$ACODE" k_nohdr; k_nohdr="$(printf '%s\n' "$AHDRS" | grep -ci '^set-cookie: *eflab_admin=')"
  admin_req POST admin.signIn @ -H "x-eflab-admin: 1" -H "Origin: http://evil.example"
  local c_foreign="$ACODE"
  admin_req POST admin.signIn @ -H "x-eflab-admin: 1"
  local c_noorigin="$ACODE"
  if [ "$c_nohdr" = "403" ] && [ "$c_foreign" = "403" ] && [ "$c_noorigin" = "403" ] && [ "$k_nohdr" = "0" ]; then
    apass "admin.signIn with the right password but no x-eflab-admin / a foreign Origin / no Origin → 403, no cookie"
  else
    afail "admin.signIn CSRF guard → 403" "no-header=$c_nohdr foreign=$c_foreign no-origin=$c_noorigin cookies=$k_nohdr"
  fi

  # -- 3. sign-in: cookie attributes, digest-only storage ----------------------
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1))
  local set_cookie; set_cookie="$(printf '%s\n' "$AHDRS" | grep -i '^set-cookie: *eflab_admin=' | head -n 1)"
  save_cookie "$C1"
  local tok1; tok1="$(cookie_token "$C1")"
  local me_name; me_name="$(ares 'd["username"]')"
  local attrs_ok=1 a
  for a in "HttpOnly" "SameSite=Strict" "Secure" "Path=/"; do
    printf '%s' "$set_cookie" | grep -qiE "; *$a(;|\$)" || attrs_ok=0
  done
  local digest1; digest1="$(TOKEN="$tok1" py 'import hashlib,os; print(hashlib.sha256(os.environ["TOKEN"].encode()).hexdigest())')"
  local sess_rows; sess_rows="$(pg_scratch -c 'SELECT row_to_json(s)::text FROM "AdminSession" s')"
  local digests; digests="$(pg_scratch -c 'SELECT "tokenDigest" FROM "AdminSession"')"
  if [ "$ACODE" = "200" ] && [ "$me_name" = "$admin_user" ] && [ "$attrs_ok" = "1" ] && [ "${#tok1}" -ge 43 ] \
    && [ "$digests" = "$digest1" ] && [[ "$sess_rows" != *"$tok1"* ]] && no_store; then
    apass "admin.signIn → 200, eflab_admin cookie HttpOnly · SameSite=Strict · Secure · Path=/ (≥ 32-byte token), only its SHA-256 digest stored"
  else
    afail "admin.signIn success" "code=$ACODE user=$me_name attrs=$attrs_ok token_len=${#tok1} digest_match=$([ "$digests" = "$digest1" ] && echo yes || echo no)"
  fi
  local pw_rows; pw_rows="$(pg_scratch -c 'SELECT row_to_json(a)::text FROM "Admin" a')"
  if [[ "$pw_rows" != *"$admin_pw"* ]] && [[ "$pw_rows" == *'"passwordHash":"scrypt$'* ]]; then
    apass "Admin row holds a scrypt\$N\$r\$p\$salt\$hash string, never the password"
  else
    afail "Admin row holds only the scrypt hash"
  fi
  admin_req GET admin.me - -H @"$C1"
  if [ "$ACODE" = "200" ] && [ "$(ares 'd["username"]')" = "$admin_user" ] && no_store; then
    apass "admin.me with the session → 200 $admin_user, Cache-Control: no-store"
  else
    afail "admin.me with the session" "code=$ACODE body=${ABODY:0:160}"
  fi

  # -- 4. CSRF guard on an authenticated mutation ------------------------------
  admin_req POST admin.runs.queue '{"kind":"CHECK"}' -H @"$C1" -H "Origin: $ADMIN_ORIGIN"
  local m_nohdr="$ACODE"
  admin_req POST admin.runs.queue '{"kind":"CHECK"}' -H @"$C1" -H "x-eflab-admin: 1" -H "Origin: http://evil.example"
  local m_foreign="$ACODE"
  admin_req POST admin.config.update '{"enabled":false,"incrementalIntervalMin":60,"fullWeekday":1,"fullHourUtc":1}' -H @"$C1"
  local m_none="$ACODE"
  if [ "$m_nohdr" = "403" ] && [ "$m_foreign" = "403" ] && [ "$m_none" = "403" ] \
    && [ "$(pg_scratch -c 'SELECT count(*) FROM "SyncRun"')" = "0" ] && [ "$(pg_scratch -c 'SELECT "updatedById" IS NULL AND enabled FROM "SyncConfig"')" = "t" ]; then
    apass "signed-in mutations without x-eflab-admin / with a foreign Origin / with neither → 403, nothing changed"
  else
    afail "signed-in mutations behind the CSRF guard → 403" "no-header=$m_nohdr foreign=$m_foreign none=$m_none"
  fi

  # -- 5. identical failures: unknown name vs wrong password -------------------
  write_signin "nobody_here" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1))
  local f_unknown_code="$ACODE" f_unknown_body="$ABODY"
  write_signin "$admin_user" "wrong-password-$$-x"
  admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1))
  local f_wrong_code="$ACODE" f_wrong_body="$ABODY" f_msg; f_msg="$(aerr)"
  if [ "$f_unknown_code" = "401" ] && [ "$f_unknown_code" = "$f_wrong_code" ] && [ "$f_unknown_body" = "$f_wrong_body" ] && [ "$f_msg" = "Wrong user name or password" ]; then
    apass "sign-in with an unknown name and with a wrong password → identical 401 bodies ('$f_msg')"
  else
    afail "sign-in failures identical" "unknown=$f_unknown_code wrong=$f_wrong_code same_body=$([ "$f_unknown_body" = "$f_wrong_body" ] && echo yes || echo no) msg=$f_msg"
  fi

  # -- 6. config.get / config.update ------------------------------------------
  admin_req GET admin.config.get - -H @"$C1"
  local cfg0; cfg0="$(ares '"%s|%s|%s|%s|%s|%s" % (d["enabled"], d["incrementalIntervalMin"], d["fullWeekday"], d["fullHourUtc"], d["blockedUntil"], d["updatedBy"])')"
  if [ "$ACODE" = "200" ] && [ "$cfg0" = "True|360|0|3|None|None" ]; then
    apass "admin.config.get → defaults (enabled, every 360 min, full Sunday 03:00 UTC, not blocked)"
  else
    afail "admin.config.get defaults" "code=$ACODE got=$cfg0"
  fi
  local invalid codes=""
  for invalid in '{"enabled":true,"incrementalIntervalMin":5,"fullWeekday":0,"fullHourUtc":3}' \
                 '{"enabled":true,"incrementalIntervalMin":1441,"fullWeekday":0,"fullHourUtc":3}' \
                 '{"enabled":true,"incrementalIntervalMin":360,"fullWeekday":0,"fullHourUtc":24}' \
                 '{"enabled":true,"incrementalIntervalMin":360,"fullWeekday":7,"fullHourUtc":3}' \
                 '{"enabled":true,"incrementalIntervalMin":90.5,"fullWeekday":0,"fullHourUtc":3}' \
                 '{"enabled":"yes","incrementalIntervalMin":360,"fullWeekday":0,"fullHourUtc":3}' \
                 '{"incrementalIntervalMin":360,"fullWeekday":0,"fullHourUtc":3}'; do
    admin_req POST admin.config.update "$invalid" -H @"$C1" "${CSRF[@]}"
    codes="$codes $ACODE"
  done
  admin_req GET admin.config.get - -H @"$C1"
  local cfg1; cfg1="$(ares '"%s|%s|%s|%s|%s|%s" % (d["enabled"], d["incrementalIntervalMin"], d["fullWeekday"], d["fullHourUtc"], d["blockedUntil"], d["updatedBy"])')"
  if [ "$codes" = " 400 400 400 400 400 400 400" ] && [ "$cfg1" = "$cfg0" ]; then
    apass "admin.config.update interval 5 / 1441 · hour 24 · weekday 7 · 90.5 min · non-boolean · missing field → 400, configuration unchanged"
  else
    afail "admin.config.update invalid values → 400" "codes=$codes after=$cfg1"
  fi
  admin_req POST admin.config.update '{"enabled":true,"incrementalIntervalMin":120,"fullWeekday":2,"fullHourUtc":5,"blockedUntil":null,"workerHeartbeatAt":"2030-01-01T00:00:00.000Z"}' -H @"$C1" "${CSRF[@]}"
  local cfg2; cfg2="$(ares '"%s|%s|%s|%s|%s" % (d["enabled"], d["incrementalIntervalMin"], d["fullWeekday"], d["fullHourUtc"], d["updatedBy"])')"
  if [ "$ACODE" = "200" ] && [ "$cfg2" = "True|120|2|5|$admin_user" ] \
    && [ "$(pg_scratch -c 'SELECT "updatedById" || '"'"'|'"'"' || ("workerHeartbeatAt" IS NULL) FROM "SyncConfig"')" = "$admin_id|true" ]; then
    apass "admin.config.update valid schedule → 200, stored with updatedBy $admin_user (worker-owned fields ignored)"
  else
    afail "admin.config.update valid schedule" "code=$ACODE got=$cfg2 body=${ABODY:0:200}"
  fi

  # -- 7. runs.queue: kinds, trigger, 409 groups --------------------------------
  admin_req POST admin.runs.queue '{"kind":"FULL"}' -H @"$C1" "${CSRF[@]}"
  local q_full="$ACODE" full_id; full_id="$(ares 'd["id"]')"
  local full_shape; full_shape="$(ares '"%s|%s|%s|%s|%s" % (d["kind"], d["trigger"], d["status"], d["requestedBy"], d["cancelRequested"])')"
  admin_req POST admin.runs.queue '{"kind":"INCREMENTAL"}' -H @"$C1" "${CSRF[@]}"
  local q_inc="$ACODE" q_inc_msg; q_inc_msg="$(aerr)"
  admin_req POST admin.runs.queue '{"kind":"FULL"}' -H @"$C1" "${CSRF[@]}"
  local q_full2="$ACODE"
  admin_req POST admin.runs.queue '{"kind":"CHECK"}' -H @"$C1" "${CSRF[@]}"
  local q_check="$ACODE" check_id; check_id="$(ares 'd["id"]')"
  admin_req POST admin.runs.queue '{"kind":"CHECK"}' -H @"$C1" "${CSRF[@]}"
  local q_check2="$ACODE"
  admin_req POST admin.runs.queue '{"kind":"SYNC"}' -H @"$C1" "${CSRF[@]}"
  local q_bad="$ACODE"
  if [ "$q_full" = "200" ] && [ "$full_shape" = "FULL|MANUAL|QUEUED|$admin_user|False" ] && [ "$q_inc" = "409" ] && [ "$q_full2" = "409" ] \
    && [ "$q_check" = "200" ] && [ "$q_check2" = "409" ] && [ "$q_bad" = "400" ] && [[ "$q_inc_msg" == *"run #$full_id"* ]] \
    && [ "$(pg_scratch -c "SELECT count(*) FROM \"SyncRun\" WHERE \"requestedById\" = $admin_id AND trigger = 'MANUAL' AND status = 'QUEUED'")" = "2" ]; then
    apass "runs.queue FULL → queued (manual, by $admin_user); INCREMENTAL / FULL while it waits → 409; CHECK → queued, a 2nd CHECK → 409; unknown kind → 400"
  else
    afail "runs.queue 409 rule" "full=$q_full shape=$full_shape inc=$q_inc ($q_inc_msg) full2=$q_full2 check=$q_check check2=$q_check2 bad=$q_bad"
  fi

  # -- 8. runs.cancel: queued → cancelled; finished → 409; unknown → 404 -------
  admin_req POST admin.runs.cancel "{\"id\":$full_id}" -H @"$C1" "${CSRF[@]}"
  local x_full="$ACODE" x_shape; x_shape="$(ares '"%s|%s|%s" % (d["status"], d["cancelRequested"], d["finishedAt"] is not None)')"
  admin_req POST admin.runs.cancel "{\"id\":$full_id}" -H @"$C1" "${CSRF[@]}"
  local x_again="$ACODE"
  admin_req POST admin.runs.cancel '{"id":999999}' -H @"$C1" "${CSRF[@]}"
  local x_unknown="$ACODE"
  admin_req POST admin.runs.cancel "{\"id\":$check_id}" -H @"$C1" "${CSRF[@]}"
  local x_check="$ACODE"
  if [ "$x_full" = "200" ] && [ "$x_shape" = "CANCELLED|True|True" ] && [ "$x_again" = "409" ] && [ "$x_unknown" = "404" ] && [ "$x_check" = "200" ] \
    && [ "$(pg_scratch -c "SELECT count(*) FROM \"SyncRun\" WHERE status IN ('QUEUED','RUNNING')")" = "0" ]; then
    apass "runs.cancel of a queued run → CANCELLED at once; again → 409; unknown id → 404"
  else
    afail "runs.cancel queued / finished / unknown" "full=$x_full shape=$x_shape again=$x_again unknown=$x_unknown check=$x_check"
  fi

  # -- 9. the 409 rule holds under concurrency (SyncConfig row lock) -----------
  # Deterministic: a second session takes the queue lock (SyncConfig FOR UPDATE,
  # as the worker does when it queues a scheduled run), inserts a QUEUED full run
  # and commits 1.5 s later; a runs.queue sent meanwhile must wait for the lock
  # and then see that run (409). Without the lock it would read no active run
  # and queue a second one.
  ( pg_scratch >/dev/null 2>&1 <<'SQL'
BEGIN;
SELECT 1 FROM "SyncConfig" WHERE "id" = 1 FOR UPDATE;
INSERT INTO "SyncRun" ("kind", "trigger", "status", "queuedAt") VALUES ('FULL', 'SCHEDULE', 'QUEUED', now() AT TIME ZONE 'UTC');
SELECT pg_sleep(1.5);
COMMIT;
SQL
  ) &
  local holder=$!
  sleep 0.5
  local lock_t0=$SECONDS
  admin_req POST admin.runs.queue '{"kind":"INCREMENTAL"}' -H @"$C1" "${CSRF[@]}"
  local lock_code="$ACODE" lock_msg; lock_msg="$(aerr)"
  wait "$holder" 2>/dev/null
  local sched_id; sched_id="$(pg_scratch -c "SELECT string_agg(id::text, ',') FROM \"SyncRun\" WHERE kind IN ('INCREMENTAL','FULL') AND status = 'QUEUED'")"
  local sched_trigger; sched_trigger="$(pg_scratch -c "SELECT trigger FROM \"SyncRun\" WHERE id = ${sched_id:-0}" 2>/dev/null)"
  if [ "$lock_code" = "409" ] && [[ "$sched_id" =~ ^[0-9]+$ ]] && [ "$sched_trigger" = "SCHEDULE" ] && [[ "$lock_msg" == *"run #$sched_id"* ]]; then
    apass "runs.queue while another session holds the queue lock and queues a full run → waits, then 409 ('$lock_msg'); one queued row"
  else
    afail "runs.queue waits for the SyncConfig lock" "code=$lock_code msg=$lock_msg queued=$sched_id trigger=$sched_trigger waited=$((SECONDS - lock_t0))s"
  fi
  admin_req POST admin.runs.cancel "{\"id\":${sched_id%%,*}}" -H @"$C1" "${CSRF[@]}"
  local sched_cancel="$ACODE"
  [ "$sched_cancel" = "200" ] || afail "runs.cancel of a queued scheduled run" "code=$sched_cancel"
  # End to end: three parallel requests (the HTTP timing rarely overlaps the
  # transactions, so this one alone would not prove the lock — the check above does).
  py 'import json; print(json.dumps({"json": {"kind": "INCREMENTAL"}}))' >"$ADMIN_TMP/payload_inc"
  local i par_pids=()
  for i in 1 2 3; do
    curl -sS -m 20 -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' --data-binary @"$ADMIN_TMP/payload_inc" \
      -H @"$C1" "${CSRF[@]}" "$ADMIN_API/trpc/admin.runs.queue" >"$ADMIN_TMP/par$i" 2>/dev/null &
    par_pids+=("$!")
  done
  wait "${par_pids[@]}" 2>/dev/null   # these three only — the admin API is a background job too
  local par; par="$(cat "$ADMIN_TMP/par1" "$ADMIN_TMP/par2" "$ADMIN_TMP/par3" | sort | tr '\n' ' ')"
  local inc_id; inc_id="$(pg_scratch -c "SELECT string_agg(id::text, ',') FROM \"SyncRun\" WHERE kind = 'INCREMENTAL' AND status = 'QUEUED'")"
  if [ "$par" = "200 409 409 " ] && [[ "$inc_id" =~ ^[0-9]+$ ]]; then
    apass "three concurrent runs.queue INCREMENTAL → exactly one 200 and two 409 (one queued row)"
  else
    afail "concurrent runs.queue → one queued run" "codes=$par queued=$inc_id"
  fi

  # -- 10. running run: 409 for another full; cancel sets cancelRequested -------
  pg_scratch -c "UPDATE \"SyncRun\" SET status = 'RUNNING', \"startedAt\" = now() AT TIME ZONE 'UTC', \"heartbeatAt\" = now() AT TIME ZONE 'UTC' WHERE id = ${inc_id:-0}" >/dev/null 2>&1
  admin_req POST admin.runs.queue '{"kind":"FULL"}' -H @"$C1" "${CSRF[@]}"
  local r_full="$ACODE" r_msg; r_msg="$(aerr)"
  admin_req POST admin.runs.queue '{"kind":"CHECK"}' -H @"$C1" "${CSRF[@]}"
  local r_check="$ACODE" check2_id; check2_id="$(ares 'd["id"]')"
  admin_req POST admin.runs.cancel "{\"id\":${inc_id:-0}}" -H @"$C1" "${CSRF[@]}"
  local r_cancel="$ACODE" r_shape; r_shape="$(ares '"%s|%s" % (d["status"], d["cancelRequested"])')"
  if [ "$r_full" = "409" ] && [[ "$r_msg" == *"already running"* ]] && [ "$r_check" = "200" ] && [ "$r_cancel" = "200" ] && [ "$r_shape" = "RUNNING|True" ] \
    && [ "$(pg_scratch -c "SELECT status || '|' || \"cancelRequested\" FROM \"SyncRun\" WHERE id = ${inc_id:-0}")" = "RUNNING|true" ]; then
    apass "while an incremental run is RUNNING: FULL → 409 ('$r_msg'), CHECK → queued; cancel → stays RUNNING with cancelRequested"
  else
    afail "running run: 409 + cancel request" "full=$r_full ($r_msg) check=$r_check cancel=$r_cancel shape=$r_shape"
  fi
  # the worker would now stop it; simulate that and clear the queued check
  pg_scratch -c "UPDATE \"SyncRun\" SET status = 'CANCELLED', \"finishedAt\" = now() AT TIME ZONE 'UTC' WHERE id = ${inc_id:-0}" >/dev/null 2>&1
  admin_req POST admin.runs.cancel "{\"id\":${check2_id:-0}}" -H @"$C1" "${CSRF[@]}"

  # -- 11. blocked: everything but a check refused, message names the time -----
  pg_scratch -c "UPDATE \"SyncConfig\" SET \"blockedUntil\" = date_trunc('second', now() AT TIME ZONE 'UTC') + interval '6 hours', \"blockedReason\" = 'smoke: simulated 403'" >/dev/null 2>&1
  admin_req GET admin.config.get - -H @"$C1"
  local blocked_until; blocked_until="$(ares 'd["blockedUntil"]')"
  admin_req POST admin.runs.queue '{"kind":"INCREMENTAL"}' -H @"$C1" "${CSRF[@]}"
  local b_inc="$ACODE" b_msg; b_msg="$(aerr)"
  admin_req POST admin.runs.queue '{"kind":"FULL"}' -H @"$C1" "${CSRF[@]}"
  local b_full="$ACODE"
  admin_req POST admin.runs.queue '{"kind":"CHECK"}' -H @"$C1" "${CSRF[@]}"
  local b_check="$ACODE" check3_id; check3_id="$(ares 'd["id"]')"
  admin_req GET admin.dashboard - -H @"$C1"
  local b_next; b_next="$(ares 'd["next"]["incremental"]')"
  if [ -n "$blocked_until" ] && [ "$blocked_until" != "None" ] && [ "$b_inc" = "412" ] && [ "$b_full" = "412" ] && [[ "$b_msg" == *"$blocked_until"* ]] \
    && [ "$b_check" = "200" ] && [ "$b_next" = "$blocked_until" ] \
    && [ "$(pg_scratch -c "SELECT count(*) FROM \"SyncRun\" WHERE kind <> 'CHECK' AND status = 'QUEUED'")" = "0" ]; then
    apass "blocked until $blocked_until: INCREMENTAL / FULL → 412 naming that time, CHECK → queued, next incremental = the block's end"
  else
    afail "blocked window refuses non-check runs" "until=$blocked_until inc=$b_inc full=$b_full check=$b_check next=$b_next msg=$b_msg"
  fi
  admin_req POST admin.runs.cancel "{\"id\":${check3_id:-0}}" -H @"$C1" "${CSRF[@]}"
  pg_scratch -c "UPDATE \"SyncConfig\" SET \"blockedUntil\" = NULL, \"blockedReason\" = NULL" >/dev/null 2>&1

  # -- 12. runs.list: newest first, cursor pages, no duplicates ----------------
  pg_scratch >/dev/null 2>&1 <<'SQL'
INSERT INTO "SyncRun" ("kind", "trigger", "status", "queuedAt", "startedAt", "finishedAt", "stats", "logTail")
SELECT 'CHECK', 'SCHEDULE', 'OK', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC',
       '{"requests": 1, "durationMs": 120}', 'check ' || g || E'\n'
FROM generate_series(1, 25) AS g;
INSERT INTO "SyncRun" ("kind", "trigger", "status", "queuedAt", "startedAt", "finishedAt", "stats", "error")
VALUES ('INCREMENTAL', 'SCHEDULE', 'FAILED', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC',
        '{"apiKey": "smoke-not-a-real-key-1234"}', 'smoke: simulated failure');
INSERT INTO "SyncRun" ("kind", "trigger", "status", "queuedAt", "startedAt", "finishedAt", "stats", "logTail",
                       "watermarkBefore", "watermarkAfter")
VALUES ('FULL', 'SCHEDULE', 'OK', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC', (now() AT TIME ZONE 'UTC') + interval '1 second',
        '{"pages": 507, "requests": 520, "cardsNew": 3, "cardsChanged": 40, "cardsUnchanged": 50648, "imagesDownloaded": 86,
          "imagesUploaded": 86, "imagesOverwritten": 12, "imagesFailed": 0, "durationMs": 1800000}',
        E'line one\nline two\n', '2026-10-08 00:00:00', '2026-10-15 00:00:00');
SQL
  local total_runs; total_runs="$(pg_scratch -c 'SELECT count(*) FROM "SyncRun"')"
  local over_id; over_id="$(pg_scratch -c "SELECT id FROM \"SyncRun\" WHERE kind = 'FULL' AND status = 'OK'")"
  local invalid_id; invalid_id="$(pg_scratch -c "SELECT id FROM \"SyncRun\" WHERE error = 'smoke: simulated failure'")"
  local pages_file="$ADMIN_TMP/list_ids" cursor="" page_n=0 list_fail=""
  : >"$pages_file"
  while [ "$page_n" -lt 20 ]; do
    page_n=$((page_n + 1))
    if [ -z "$cursor" ]; then admin_req GET admin.runs.list '{"limit":7}' -H @"$C1"; else admin_req GET admin.runs.list "{\"limit\":7,\"cursor\":$cursor}" -H @"$C1"; fi
    if [ "$ACODE" != "200" ]; then list_fail="page $page_n code=$ACODE"; break; fi
    ares '"\n".join("%d %s" % (r["id"], r["queuedAt"]) for r in d["items"])' >>"$pages_file"
    cursor="$(ares 'd["nextCursor"] if d["nextCursor"] is not None else ""')"
    [ -z "$cursor" ] && break
  done
  local list_check; list_check="$(py 'import sys
rows = [l.split() for l in open(sys.argv[1]) if l.strip()]
ids = [int(r[0]) for r in rows]; times = [r[1] for r in rows]
print("%d|%s|%s" % (len(ids), ids == sorted(set(ids), reverse=True), times == sorted(times, reverse=True)))' "$pages_file")"
  local expect_pages=$(( (total_runs + 6) / 7 ))
  if [ -z "$list_fail" ] && [ "$list_check" = "$total_runs|True|True" ] && [ "$page_n" = "$expect_pages" ]; then
    apass "runs.list limit 7 → $page_n cursor pages, $total_runs runs, newest first (id and queuedAt descending), no duplicates, last nextCursor null"
  else
    afail "runs.list cursor pagination" "${list_fail:-got=$list_check pages=$page_n expected=$total_runs|True|True in $expect_pages pages}"
  fi
  admin_req GET admin.runs.list - -H @"$C1"
  if [ "$ACODE" = "200" ] && [ "$(ares 'len(d["items"])')" = "20" ]; then
    apass "runs.list without input → first 20 runs (default page size)"
  else
    afail "runs.list without input → 20 runs" "code=$ACODE body=${ABODY:0:160}"
  fi

  # -- 13. runs.get: statistics, error, log tail; invalid statistics withheld ---
  admin_req GET admin.runs.get "{\"id\":${over_id:-0}}" -H @"$C1"
  local g_over; g_over="$(ares '"%s|%s|%s|%s|%s|%s" % (d["stats"].get("imagesOverwritten"), d["stats"].get("cardsNew"), d["statsInvalid"], d["logTail"] == "line one\nline two\n", d["watermarkBefore"], d["watermarkAfter"])')"
  admin_req GET admin.runs.get "{\"id\":${invalid_id:-0}}" -H @"$C1"
  local g_inv="$ACODE" g_inv_shape; g_inv_shape="$(ares '"%s|%s|%s" % (d["stats"], d["statsInvalid"], d["error"])')"
  local g_inv_body="$ABODY"
  admin_req GET admin.runs.get '{"id":999999}' -H @"$C1"
  local g_unknown="$ACODE"
  if [ "$g_over" = "12|3|False|True|2026-10-08T00:00:00.000Z|2026-10-15T00:00:00.000Z" ] && [ "$g_inv" = "200" ] \
    && [ "$g_inv_shape" = "{}|True|smoke: simulated failure" ] && [[ "$g_inv_body" != *"smoke-not-a-real-key"* ]] && [ "$g_unknown" = "404" ]; then
    apass "runs.get → statistics, watermarks, log tail; stored stats with an unlisted key → withheld ({} + statsInvalid); unknown id → 404"
  else
    afail "runs.get" "over=$g_over invalid=$g_inv/$g_inv_shape unknown=$g_unknown"
  fi

  # -- 13b. owed image ids stay in the database (third verify): the API sends only their count -
  local owed_id; owed_id="$(pg_scratch -c "INSERT INTO \"SyncRun\" (\"kind\", \"trigger\", \"status\", \"queuedAt\", \"startedAt\", \"finishedAt\", \"stats\")
    VALUES ('FULL', 'SCHEDULE', 'OK', (now() AT TIME ZONE 'UTC') - interval '1 day', (now() AT TIME ZONE 'UTC') - interval '1 day', (now() AT TIME ZONE 'UTC') - interval '1 day',
            '{\"imagesFailed\": 1, \"imagesPendingIds\": [990000000001, 990000000002], \"imagesChecked\": true, \"imagesUnverified\": 3}') RETURNING id")"
  admin_req GET admin.runs.get "{\"id\":${owed_id:-0}}" -H @"$C1"
  local owed_get; owed_get="$(ares '"%s|%s|%s|%s|%s" % (d["stats"].get("imagesPending"), "imagesPendingIds" in d["stats"], "imagesChecked" in d["stats"], d["stats"].get("imagesUnverified"), d["statsInvalid"])')"
  admin_req GET admin.runs.list '{"limit":50}' -H @"$C1"
  local owed_list; owed_list="$(ares '"%s" % [("imagesPendingIds" in r["stats"] or "imagesChecked" in r["stats"], r["stats"].get("imagesPending")) for r in d["items"] if r["id"] == '"${owed_id:-0}"']')"
  if [ "$owed_get" = "2|False|False|3|False" ] && [ "$owed_list" = "[(False, 2)]" ] && [[ "$ABODY" != *"990000000001"* ]]; then
    apass "a run's owed image ids stay stored: runs.get / runs.list send only imagesPending = 2 (no ids, no imagesChecked), unverified count passed"
  else
    afail "owed image ids withheld by the admin API" "get=$owed_get list=$owed_list"
  fi

  # -- 14. dashboard ------------------------------------------------------------
  admin_req GET admin.dashboard - -H @"$C1"
  local dash; dash="$(ares '"%s|%s|%s|%s|%s|%s|%s|%s" % (d["workerOnline"], d["lastRun"]["id"], d["activeRuns"], d["overwrittenImages"]["runId"], d["overwrittenImages"]["count"], d["newestCard"], d["config"]["updatedBy"], bool(d["next"]["incremental"] and d["next"]["full"]))')"
  pg_scratch -c "UPDATE \"SyncConfig\" SET \"workerHeartbeatAt\" = now() AT TIME ZONE 'UTC'" >/dev/null 2>&1
  admin_req GET admin.dashboard - -H @"$C1"
  local online_now; online_now="$(ares 'd["workerOnline"]')"
  pg_scratch -c "UPDATE \"SyncConfig\" SET \"workerHeartbeatAt\" = (now() AT TIME ZONE 'UTC') - interval '3 minutes'" >/dev/null 2>&1
  admin_req GET admin.dashboard - -H @"$C1"
  local online_stale; online_stale="$(ares 'd["workerOnline"]')"
  admin_req POST admin.runs.queue '{"kind":"CHECK"}' -H @"$C1" "${CSRF[@]}"
  local check4_id; check4_id="$(ares 'd["id"]')"
  admin_req GET admin.dashboard - -H @"$C1"
  local active_ids; active_ids="$(ares '",".join(str(r["id"]) for r in d["activeRuns"])')"
  admin_req POST admin.runs.cancel "{\"id\":${check4_id:-0}}" -H @"$C1" "${CSRF[@]}"
  if [ "$dash" = "False|${over_id}|[]|${over_id}|12|None|$admin_user|True" ] && [ "$online_now" = "True" ] && [ "$online_stale" = "False" ] \
    && [ -n "$check4_id" ] && [ "$active_ids" = "$check4_id" ]; then
    apass "dashboard → worker offline without heartbeat / online at 0 s / offline at 3 min; last run, active runs, next runs, 12 overwritten images (run #$over_id), empty catalogue → no newest card"
  else
    afail "dashboard" "dash=$dash online_now=$online_now stale=$online_stale active=$active_ids (check $check4_id)"
  fi

  # -- 15. lock after five failures (the count is per account) -----------------
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1))   # resets the failure count
  local l_reset="$ACODE"; save_cookie "$C2"
  local codes4=""
  for i in 1 2 3 4; do
    write_signin "$admin_user" "wrong-password-$$-$i"
    admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1)); codes4="$codes4 $ACODE"
  done
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1))
  local l_after4="$ACODE"; save_cookie "$C3"
  local codes5=""
  for i in 1 2 3 4 5; do
    write_signin "$admin_user" "wrong-password-$$-$i"
    admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1)); codes5="$codes5 $ACODE"
  done
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1))
  local l_locked="$ACODE" l_locked_body="$ABODY" l_cookie; l_cookie="$(printf '%s\n' "$AHDRS" | grep -ci '^set-cookie: *eflab_admin=')"
  # locked for 15 minutes (30 s of slack for the API host vs the Postgres container clock)
  local l_db; l_db="$(pg_scratch -c "SELECT (\"lockedUntil\" > (now() AT TIME ZONE 'UTC') + interval '14 minutes') || '|' || (\"lockedUntil\" <= (now() AT TIME ZONE 'UTC') + interval '15 minutes 30 seconds') FROM \"Admin\" WHERE id = $admin_id")"
  if [ "$l_reset" = "200" ] && [ "$codes4" = " 401 401 401 401" ] && [ "$l_after4" = "200" ] && [ "$codes5" = " 401 401 401 401 401" ] \
    && [ "$l_locked" = "401" ] && [ "$l_locked_body" = "$f_unknown_body" ] && [ "$l_cookie" = "0" ] && [ "$l_db" = "true|true" ]; then
    apass "4 wrong passwords then the right one → signed in; 5 wrong then the right one → refused with the identical generic 401 (locked 15 min)"
  else
    afail "lock after five failures" "reset=$l_reset four=$codes4 after4=$l_after4 five=$codes5 locked=$l_locked same_body=$([ "$l_locked_body" = "$f_unknown_body" ] && echo yes || echo no) cookie=$l_cookie db=$l_db"
  fi

  # -- 16. per-address limit: the 21st attempt in 15 minutes → 429 -------------
  local lim_codes=""
  while [ "$attempts" -lt 20 ]; do
    write_signin "nobody_$attempts" "$admin_pw"
    admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1)); lim_codes="$lim_codes$ACODE "
  done
  write_signin "nobody_21" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; attempts=$((attempts + 1))
  local lim_21="$ACODE"
  if [ "$lim_21" = "429" ] && [ -z "$(printf '%s' "$lim_codes" | tr -d '401 ')" ]; then
    apass "per-address limit: attempts up to 20 answered 401, the 21st → 429"
  else
    afail "per-address sign-in limit" "before=$lim_codes 21st=$lim_21"
  fi

  # The per-address limit is now spent: restart the admin API (clears it; the
  # lock-out and the sessions live in the database and survive).
  stop_admin_api
  if ! start_admin_api; then afail "admin api restart (clears the per-address limit)"; return; fi
  pg_scratch -c "UPDATE \"Admin\" SET \"failedLogins\" = 0, \"lockedUntil\" = NULL WHERE id = $admin_id" >/dev/null 2>&1

  # -- 16b. a visitor session never opens the admin area (verify finding W5) -----
  local v_token; v_token="$(py 'import secrets; print(secrets.token_hex(32))')"
  pg_scratch >/dev/null 2>&1 <<SQL
INSERT INTO "User" ("id", "username", "email", "updatedAt") VALUES ('smoke-visitor', 'smoke_visitor', 'visitor@smoke.invalid', now() AT TIME ZONE 'UTC');
INSERT INTO "Session" ("id", "token", "userId", "expiresAt", "updatedAt")
VALUES ('smoke-visitor-session', '$v_token', 'smoke-visitor', (now() AT TIME ZONE 'UTC') + interval '1 day', now() AT TIME ZONE 'UTC');
SQL
  printf 'Cookie: eflab_session=%s\n' "$v_token" >"$ADMIN_TMP/cookie_visitor"
  admin_req GET auth.getSession - -H @"$ADMIN_TMP/cookie_visitor"
  local v_user; v_user="$(ares 'd["username"] if d else None')"
  local v_bad=""
  for spec in 'GET|admin.me|-' 'GET|admin.config.get|-' 'GET|admin.runs.list|{}' 'GET|admin.runs.get|{"id":1}' 'GET|admin.dashboard|-' \
              'POST|admin.signOut|null' 'POST|admin.config.update|{"enabled":true,"incrementalIntervalMin":60,"fullWeekday":0,"fullHourUtc":3}' \
              'POST|admin.runs.queue|{"kind":"CHECK"}' 'POST|admin.runs.cancel|{"id":1}'; do
    proc="${spec#*|}"; input="${proc#*|}"; proc="${proc%%|*}"
    admin_req "${spec%%|*}" "$proc" "$input" -H @"$ADMIN_TMP/cookie_visitor" "${CSRF[@]}"
    [ "$ACODE" = "401" ] && [ "$(aerr)" = "Admin sign-in required" ] || v_bad="$v_bad $proc=$ACODE"
  done
  if [ "$v_user" = "smoke_visitor" ] && [ -z "$v_bad" ] && [ "$(pg_scratch -c "SELECT count(*) FROM \"SyncRun\" WHERE status = 'QUEUED'")" = "0" ]; then
    apass "a valid visitor eflab_session cookie (auth.getSession → smoke_visitor) → 401 on all 9 admin procedures, nothing queued"
  else
    afail "visitor session never opens the admin area" "getSession=$v_user bad:$v_bad"
  fi

  # -- 16c. idle (12 h) and absolute (7 d) expiry: 401 and the row removed (W5) -
  # Time is moved in the database (lastSeenAt / expiresAt), with minute margins
  # for the API host vs the Postgres container clock; a just-inside control first.
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; save_cookie "$ADMIN_TMP/cookie_idle"
  local idle_digest; idle_digest="$(TOKEN="$(cookie_token "$ADMIN_TMP/cookie_idle")" py 'import hashlib,os; print(hashlib.sha256(os.environ["TOKEN"].encode()).hexdigest())')"
  pg_scratch -c "UPDATE \"AdminSession\" SET \"lastSeenAt\" = (now() AT TIME ZONE 'UTC') - interval '11 hours 50 minutes' WHERE \"tokenDigest\" = '$idle_digest'" >/dev/null 2>&1
  admin_req GET admin.me - -H @"$ADMIN_TMP/cookie_idle"
  local idle_inside="$ACODE"
  pg_scratch -c "UPDATE \"AdminSession\" SET \"lastSeenAt\" = (now() AT TIME ZONE 'UTC') - interval '12 hours 2 minutes' WHERE \"tokenDigest\" = '$idle_digest'" >/dev/null 2>&1
  admin_req GET admin.me - -H @"$ADMIN_TMP/cookie_idle"
  local idle_out="$ACODE" idle_rows; idle_rows="$(pg_scratch -c "SELECT count(*) FROM \"AdminSession\" WHERE \"tokenDigest\" = '$idle_digest'")"
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"; save_cookie "$ADMIN_TMP/cookie_abs"
  local abs_digest; abs_digest="$(TOKEN="$(cookie_token "$ADMIN_TMP/cookie_abs")" py 'import hashlib,os; print(hashlib.sha256(os.environ["TOKEN"].encode()).hexdigest())')"
  local abs_ttl; abs_ttl="$(pg_scratch -c "SELECT round(extract(epoch FROM (\"expiresAt\" - \"createdAt\")) / 86400, 3) FROM \"AdminSession\" WHERE \"tokenDigest\" = '$abs_digest'")"
  pg_scratch -c "UPDATE \"AdminSession\" SET \"expiresAt\" = (now() AT TIME ZONE 'UTC') + interval '2 minutes' WHERE \"tokenDigest\" = '$abs_digest'" >/dev/null 2>&1
  admin_req GET admin.me - -H @"$ADMIN_TMP/cookie_abs"
  local abs_inside="$ACODE"
  pg_scratch -c "UPDATE \"AdminSession\" SET \"expiresAt\" = (now() AT TIME ZONE 'UTC') - interval '2 minutes', \"lastSeenAt\" = now() AT TIME ZONE 'UTC' WHERE \"tokenDigest\" = '$abs_digest'" >/dev/null 2>&1
  admin_req GET admin.me - -H @"$ADMIN_TMP/cookie_abs"
  local abs_out="$ACODE" abs_rows; abs_rows="$(pg_scratch -c "SELECT count(*) FROM \"AdminSession\" WHERE \"tokenDigest\" = '$abs_digest'")"
  if [ "$idle_inside" = "200" ] && [ "$idle_out" = "401" ] && [ "$idle_rows" = "0" ]; then
    apass "idle expiry: last use 11 h 50 min ago → 200; 12 h 2 min ago → 401 and the session row removed"
  else
    afail "idle expiry (12 h)" "inside=$idle_inside out=$idle_out rows=$idle_rows"
  fi
  if [ "$abs_ttl" = "7.000" ] && [ "$abs_inside" = "200" ] && [ "$abs_out" = "401" ] && [ "$abs_rows" = "0" ]; then
    apass "absolute expiry: a session expires 7 days after sign-in; 2 min before → 200, 2 min after (fresh last use) → 401 and the row removed"
  else
    afail "absolute expiry (7 d)" "ttl_days=$abs_ttl inside=$abs_inside out=$abs_out rows=$abs_rows"
  fi

  # -- 16d. concurrent sign-ins cannot bypass the lock-out (verify finding C2) ---
  # The verifier's repro: ONE batched POST of 6 admin.signIn — 5 wrong passwords
  # and the right one last — once with 4 earlier failures and once from 0. It
  # must end locked, answer the generic 401 to all six and issue no session.
  local c2_round c2_from c2_ok c2_detail=""
  for c2_from in 4 0; do
    pg_scratch -c "UPDATE \"Admin\" SET \"failedLogins\" = $c2_from, \"lockedUntil\" = NULL WHERE id = $admin_id" >/dev/null 2>&1
    local s_before; s_before="$(pg_scratch -c 'SELECT count(*) FROM "AdminSession"')"
    signin_batch "$ADMIN_TMP/batch_$c2_from" "$admin_user" "wrong-$$-a1" "wrong-$$-a2" "wrong-$$-a3" "wrong-$$-a4" "wrong-$$-a5" "$admin_pw"
    local b_shape; b_shape="$(abatch 'len(b) == 6 and all("result" not in x and x["error"]["json"]["message"] == "Wrong user name or password" for x in b)')"
    local b_cookie; b_cookie="$(printf '%s\n' "$AHDRS" | grep -ci '^set-cookie: *eflab_admin=')"
    local s_after; s_after="$(pg_scratch -c 'SELECT count(*) FROM "AdminSession"')"
    local b_locked; b_locked="$(pg_scratch -c "SELECT \"lockedUntil\" > (now() AT TIME ZONE 'UTC') + interval '14 minutes' FROM \"Admin\" WHERE id = $admin_id")"
    c2_detail="$c2_detail from$c2_from:shape=$b_shape,cookies=$b_cookie,sessions=${s_before}→${s_after},locked=$b_locked"
    if [ "$b_shape" = "True" ] && [ "$b_cookie" = "0" ] && [ "$s_before" = "$s_after" ] && [ "$b_locked" = "t" ]; then
      apass "one batched POST of 6 admin.signIn (5 wrong + the right one last) with $c2_from earlier failures → all six get the generic 401, no session, account locked"
    else
      afail "batched concurrent sign-ins from $c2_from failures → locked, no session" "$c2_detail"
    fi
  done
  # The same as 5 separate, parallel requests (4 wrong, the right one among them), from 4 failures.
  # (5, not 6: after the API restart the address may make 20 attempts — 2 + 6 + 6 + 5 + 1.)
  pg_scratch -c "UPDATE \"Admin\" SET \"failedLogins\" = 4, \"lockedUntil\" = NULL WHERE id = $admin_id" >/dev/null 2>&1
  local p_before; p_before="$(pg_scratch -c 'SELECT count(*) FROM "AdminSession"')"
  local p_pids=() k
  rm -f "$ADMIN_TMP"/par_code? "$ADMIN_TMP"/par_hdr?
  for k in 1 2 3 4 5; do
    if [ "$k" = "3" ]; then write_signin "$admin_user" "$admin_pw"; else write_signin "$admin_user" "wrong-$$-p$k"; fi
    cp "$ADMIN_TMP/payload" "$ADMIN_TMP/payload_par$k"
  done
  for k in 1 2 3 4 5; do
    curl -sS -m 30 -o "$ADMIN_TMP/par_body$k" -D "$ADMIN_TMP/par_hdr$k" -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
      --data-binary @"$ADMIN_TMP/payload_par$k" "${CSRF[@]}" "$ADMIN_API/trpc/admin.signIn" >"$ADMIN_TMP/par_code$k" 2>/dev/null &
    p_pids+=("$!")
  done
  wait "${p_pids[@]}" 2>/dev/null
  local p_codes; p_codes="$(cat "$ADMIN_TMP"/par_code? | tr '\n' ' ')"
  local p_cookies; p_cookies="$(cat "$ADMIN_TMP"/par_hdr? | tr -d '\r' | grep -ci '^set-cookie: *eflab_admin=')"
  local p_after; p_after="$(pg_scratch -c 'SELECT count(*) FROM "AdminSession"')"
  local p_locked; p_locked="$(pg_scratch -c "SELECT \"lockedUntil\" > (now() AT TIME ZONE 'UTC') + interval '14 minutes' FROM \"Admin\" WHERE id = $admin_id")"
  if [ "$p_codes" = "401 401 401 401 401 " ] && [ "$p_cookies" = "0" ] && [ "$p_before" = "$p_after" ] && [ "$p_locked" = "t" ]; then
    apass "5 parallel admin.signIn requests (the right password among them) with 4 earlier failures → five 401, no session, account locked"
  else
    afail "parallel sign-ins → locked, no session" "codes=$p_codes cookies=$p_cookies sessions=${p_before}→${p_after} locked=$p_locked"
  fi
  # While locked, the right password (now arriving alone) is still refused with the generic body.
  write_signin "$admin_user" "$admin_pw"
  admin_req POST admin.signIn @ "${CSRF[@]}"
  if [ "$ACODE" = "401" ] && [ "$ABODY" = "$f_unknown_body" ] && [ "$(pg_scratch -c 'SELECT count(*) FROM "AdminSession"')" = "$p_after" ]; then
    apass "the right password during the lock → the identical generic 401, no session"
  else
    afail "right password during the lock refused" "code=$ACODE same_body=$([ "$ABODY" = "$f_unknown_body" ] && echo yes || echo no)"
  fi
  pg_scratch -c "UPDATE \"Admin\" SET \"failedLogins\" = 0, \"lockedUntil\" = NULL WHERE id = $admin_id" >/dev/null 2>&1

  # -- 16e. the lock's end does not move with the database session's time zone ---
  # lockedUntil is a UTC timestamp; the lock comparison must not shift by the
  # session TimeZone (+7 h would end a lock hours early, −4 h would extend it).
  # Per zone: a restart (new connections), then the right password with the lock
  # 1 min ahead (refused) and 1 min past (signs in). 4 attempts, after a restart.
  local tz tz_detail="" tz_ok=1
  for tz in Asia/Ho_Chi_Minh America/New_York; do
    pg_maint -c "ALTER DATABASE \"$SCRATCH_DB\" SET timezone = '$tz'" >/dev/null 2>&1
    stop_admin_api
    if ! start_admin_api; then afail "admin api restart (time zone $tz)"; return; fi
    pg_scratch -c "UPDATE \"Admin\" SET \"failedLogins\" = 0, \"lockedUntil\" = (now() AT TIME ZONE 'UTC') + interval '1 minute' WHERE id = $admin_id" >/dev/null 2>&1
    write_signin "$admin_user" "$admin_pw"
    admin_req POST admin.signIn @ "${CSRF[@]}"
    local tz_ahead="$ACODE"
    pg_scratch -c "UPDATE \"Admin\" SET \"failedLogins\" = 0, \"lockedUntil\" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = $admin_id" >/dev/null 2>&1
    admin_req POST admin.signIn @ "${CSRF[@]}"
    local tz_past="$ACODE" tz_session; tz_session="$(pg_scratch -c 'SHOW timezone')"
    tz_detail="$tz_detail $tz(session=$tz_session):ahead=$tz_ahead,past=$tz_past"
    [ "$tz_session" = "$tz" ] && [ "$tz_ahead" = "401" ] && [ "$tz_past" = "200" ] || tz_ok=0
  done
  pg_maint -c "ALTER DATABASE \"$SCRATCH_DB\" RESET timezone" >/dev/null 2>&1
  pg_scratch -c "UPDATE \"Admin\" SET \"failedLogins\" = 0, \"lockedUntil\" = NULL WHERE id = $admin_id" >/dev/null 2>&1
  if [ "$tz_ok" = "1" ]; then
    apass "lock end independent of the session time zone (UTC+7 and UTC−4): 1 min before the end → refused, 1 min after → signed in"
  else
    afail "lock end shifted by the database session time zone" "$tz_detail"
  fi

  # -- 17. sign-out ends that session only --------------------------------------
  admin_req POST admin.signOut null -H @"$C2" "${CSRF[@]}"
  local so="$ACODE" so_clear; so_clear="$(printf '%s\n' "$AHDRS" | grep -ci '^set-cookie: *eflab_admin=;.*max-age=0')"
  admin_req GET admin.me - -H @"$C2"
  local so_me="$ACODE"
  admin_req GET admin.me - -H @"$C1"
  local so_other="$ACODE"
  if [ "$so" = "200" ] && [ "$so_clear" = "1" ] && [ "$so_me" = "401" ] && [ "$so_other" = "200" ]; then
    apass "admin.signOut → 200 and a clearing cookie; that cookie → 401 afterwards, another session still works"
  else
    afail "admin.signOut" "signout=$so clear=$so_clear me_after=$so_me other=$so_other"
  fi

  # -- 18. disabled admin: its sessions stop working ------------------------------
  ( exec_clean_env "$ROOT/packages/db" "DATABASE_URL=$SCRATCH_DB_URL" NODE_ENV=production -- \
      "$ROOT/packages/db/node_modules/.bin/tsx" src/admin-cli.ts disable "$admin_user" ) >"$ADMIN_TMP/cli-disable.log" 2>&1
  local dis_code=$?
  admin_req GET admin.me - -H @"$C1"
  local dis_me1="$ACODE"
  admin_req GET admin.me - -H @"$C3"
  local dis_me3="$ACODE"
  if [ "$dis_code" = "0" ] && [ "$dis_me1" = "401" ] && [ "$dis_me3" = "401" ] && [ "$(pg_scratch -c 'SELECT count(*) FROM "AdminSession"')" = "0" ]; then
    apass "admin-cli disable → every session of the account answers 401"
  else
    afail "disabled admin" "cli=$dis_code me1=$dis_me1 me3=$dis_me3"
  fi
  # Sign-in of the disabled account with the right password → the generic message (W5). A restart
  # first: the sign-ins of 16c/16d used this address's 20 attempts.
  stop_admin_api
  if start_admin_api; then
    write_signin "$admin_user" "$admin_pw"
    admin_req POST admin.signIn @ "${CSRF[@]}"
    local dis_cookie; dis_cookie="$(printf '%s\n' "$AHDRS" | grep -ci '^set-cookie: *eflab_admin=')"
    if [ "$ACODE" = "401" ] && [ "$ABODY" = "$f_unknown_body" ] && [ "$dis_cookie" = "0" ] && [ "$(pg_scratch -c 'SELECT count(*) FROM "AdminSession"')" = "0" ]; then
      apass "sign-in of the disabled account with the right password → the identical generic 401, no cookie, no session"
    else
      afail "disabled account sign-in refused generically" "code=$ACODE same_body=$([ "$ABODY" = "$f_unknown_body" ] && echo yes || echo no) cookie=$dis_cookie"
    fi
  else
    afail "admin api restart before the disabled-account sign-in"
  fi

  # -- 19. no secret field or value in any admin response -------------------------
  local secret_keys; secret_keys="$(py 'import json,re,sys
bad = re.compile(r"hash|token|digest|secret|passw|credential|cookie|apikey|api_key|accesskey|^key$|Key$", re.I)
found, n = set(), 0
def walk(v):
    if isinstance(v, dict):
        for k, x in v.items():
            if bad.search(k): found.add(k)
            walk(x)
    elif isinstance(v, list):
        for x in v: walk(x)
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    n += 1
    walk(json.loads(line))
print("%d|%s" % (n, ",".join(sorted(found))))' "$ADMIN_BODIES" 2>&1)"
  local all_bodies; all_bodies="$(cat "$ADMIN_BODIES")"
  local leaked=""
  [[ "$all_bodies" == *"$admin_pw"* ]] && leaked="$leaked password"
  local cf t
  for cf in "$C1" "$C2" "$C3"; do
    t="$(cookie_token "$cf")"
    [ -n "$t" ] && [[ "$all_bodies" == *"$t"* ]] && leaked="$leaked token"
    t="$(TOKEN="$t" py 'import hashlib,os; print(hashlib.sha256(os.environ["TOKEN"].encode()).hexdigest())')"
    [[ "$all_bodies" == *"$t"* ]] && leaked="$leaked digest"
  done
  [[ "$all_bodies" == *"scrypt\$"* ]] && leaked="$leaked hash"
  [[ "$all_bodies" == *"smoke-not-a-real-key"* ]] && leaked="$leaked stored-key"
  if [[ "$secret_keys" =~ ^[0-9]+\|$ ]] && [ "${secret_keys%%|*}" -gt 50 ] && [ -z "$leaked" ]; then
    apass "no hash / token / digest / key / credential field or value in any of the ${secret_keys%%|*} admin responses"
  else
    afail "no secret fields in admin responses" "scan=$secret_keys leaked:${leaked:- none}"
  fi

  # -- 20. teardown: the live database is untouched, the scratch database is gone -
  stop_admin_api
  local live_after; live_after="$(live_snapshot)"
  local live_smoke_admins; live_smoke_admins="$(printf '%s' "$live_after" | cut -d/ -f4)"
  if [ "$live_before" != "unavailable" ] && [ "$live_before" = "$live_after" ] && [ "$live_smoke_admins" = "0" ]; then
    apass "live database $LIVE_DB_NAME unchanged (Admin / AdminSession / manual SyncRun counts $(printf '%s' "$live_before" | cut -d/ -f1-3), no smoke_admin, schedule fields identical; read-only check)"
  elif [ "$live_before" = "unavailable" ] && [ "$live_after" = "unavailable" ]; then
    echo "  note: the live database has no admin tables (migration not applied) — nothing to compare"
  else
    afail "live database unchanged" "before=$live_before after=$live_after"
  fi
  if drop_scratch_db; then
    apass "scratch database $SCRATCH_DB dropped"
  else
    afail "drop the scratch database $SCRATCH_DB"
  fi
}

run_admin_checks

# ---------------------------------------------------------------------------
echo ""
echo "Smoke summary: $PASS passed, $FAIL failed, $SKIP skipped (api: $API; SQL: ${SQL_DB:-none}; migration 20261024000000_catalogue_data_refresh: $MIGRATED${SMOKE_REQUIRE_REFRESH:+; SMOKE_REQUIRE_REFRESH=$SMOKE_REQUIRE_REFRESH})"
if [ "$SKIP" -gt 0 ]; then
  echo "Skipped (not counted as passed — they run once the database has the migration / the seeded columns):"
  for n in "${SKIPPED_NAMES[@]}"; do echo "  ○ $n"; done
fi
if [ -n "$ADMIN_SKIPPED" ]; then
  echo "Admin smoke: SKIPPED — $ADMIN_SKIPPED (not counted as passed)"
else
  echo "Admin smoke: $APASS passed, $AFAIL failed (api: ${ADMIN_API:-not started} on scratch database ${SCRATCH_DB:-none})"
fi
if [ "$FAIL" -gt 0 ] || [ "$AFAIL" -gt 0 ]; then
  for n in "${FAILED_NAMES[@]}"; do echo "  ✗ $n"; done
  exit 1
fi
if [ -n "$ADMIN_SKIPPED" ] && [ "${SMOKE_REQUIRE_ADMIN:-}" = "1" ]; then
  echo "SMOKE_REQUIRE_ADMIN=1: the skipped admin section fails the run"
  exit 1
fi
exit 0
