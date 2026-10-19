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
#
# Every check is counted; the script exits non-zero when any check fails and
# always stops the API it started (trap on EXIT, including Ctrl-C).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SMOKE_API_PORT:-4300}"
TIMEOUT="${SMOKE_TIMEOUT:-60}"
API_PID=""
API_LOG=""
PASS=0
FAIL=0
FAILED_NAMES=()

pass() { PASS=$((PASS + 1)); echo "✓ $1"; }
fail() { FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); echo "✗ $1"; [ -n "${2:-}" ] && echo "    $2"; }

# ---------------------------------------------------------------------------
# API lifecycle
# ---------------------------------------------------------------------------
port_listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

stop_api() {
  [ -z "$API_PID" ] && return 0
  # tsx runs the server in a child node process: signal the children first,
  # then tsx itself, then escalate if the port is still bound.
  pkill -TERM -P "$API_PID" 2>/dev/null
  kill -TERM "$API_PID" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$API_PID" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$API_PID" 2>/dev/null; then
    pkill -KILL -P "$API_PID" 2>/dev/null
    kill -KILL "$API_PID" 2>/dev/null
  fi
  wait "$API_PID" 2>/dev/null
  for _ in 1 2 3 4 5 6; do
    port_listening "$PORT" || break
    sleep 0.5
  done
  if port_listening "$PORT"; then
    echo "warning: port $PORT is still bound after stopping the API (pid $API_PID)" >&2
  else
    echo "api stopped (pid $API_PID), port $PORT free"
  fi
  API_PID=""
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  stop_api
  if [ -n "$API_LOG" ] && [ -f "$API_LOG" ]; then
    if [ "$code" -ne 0 ]; then
      # pino JSON: level 40 = warn, 50 = error, 60 = fatal
      echo "--- api warnings/errors (full log: $API_LOG) ---"
      grep -E '"level":(40|50|60)' "$API_LOG" | tail -n 20
    else
      rm -f "$API_LOG"
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

wait_for_health() {
  local deadline=$((SECONDS + TIMEOUT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -sS -m 3 -o /dev/null "$API/health" 2>/dev/null; then
      return 0
    fi
    if [ -n "$API_PID" ] && ! kill -0 "$API_PID" 2>/dev/null; then
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

# 2. featured.list → every bundle has a unique non-empty slug and ≥ 1 card; the
#    first bundle resolves through featured.bySlug with the same ordered cards;
#    an unknown slug resolves to null (the web answers 404). Data-independent:
#    the bundle list changes with every dump, so no bundle name is hard-coded.
trpc_get "featured.list" '{}'
FB_CODE="$CODE"
FB_COUNT="$(result 'len(d)')"
FB_BAD="$(result 'sum(1 for b in d if not b.get("slug") or len(b.get("cards") or []) == 0) + (len(d) - len({b.get("slug") for b in d}))')"
FB_SLUG="$(result 'd[0]["slug"] if d else ""')"
FB_NAME="$(result 'd[0]["name"] if d else ""')"
FB_IDS="$(result '",".join(c["id"] for c in d[0]["cards"]) if d else ""')"
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

# 4. skill.list → exactly 84 skills (67 original + 17 added by eflab-parity-fixes)
trpc_get "skill.list" '{}'
SKILL_COUNT="$(result 'len(d)')"
if [ "$CODE" = "200" ] && [ "$SKILL_COUNT" = "84" ]; then
  pass "skill.list → 84 skills"
else
  fail "skill.list → 84 skills" "code=$CODE got=$SKILL_COUNT"
fi

# 4b. static efootbase data (efootbase-static-data; needs a seed with the
#     dump/efootbase/static snapshot): 67 grouped skills (23 Showtime + 44 Classic)
#     each with a description and an R2 icon URL, 17 "Other" entries, no hidden
#     (unreleased) skill, effects carry eFootLab stat names
SKILL_STATIC="$(result '"%d %d %d %d %d %d %d" % (
  sum(1 for s in d if s["group"] == "showtime"),
  sum(1 for s in d if s["group"] == "classic"),
  sum(1 for s in d if s["group"] is None),
  sum(1 for s in d if s["group"] and s["description"] and (s["iconUrl"] or "").endswith(".webp") and "/skills/Skill_" in s["iconUrl"]),
  sum(1 for s in d if not s["released"] or s["slug"] in ("sharp-cut", "beast-drive", "decisive-pass", "gk-rush-out", "gk-aerial-claim")),
  sum(1 for s in d if s["effects"]),
  sum(1 for s in d for e in s["effects"] if e["stat"] in ("tackling", "jumping", "setPieceTaking", "set_piece_taking")))')"
if [ "$CODE" = "200" ] && [ "$SKILL_STATIC" = "23 44 17 67 0 28 0" ]; then
  pass "skill.list static data → Showtime 23 · Classic 44 · Other 17 · 67 with description + icon · 0 hidden · 28 with effects (eFootLab stat names)"
else
  fail "skill.list static data (expected '23 44 17 67 0 28 0')" "code=$CODE got='$SKILL_STATIC'"
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
# 4c. manager.picker (change efootbase-exact-model-managers): the 69 picker
#     managers, rating DESC then id ASC, each with 1–2 eFootLab stat pills (24
#     have one pill on efootbase) and an image URL on the configured R2 host
#     (the host the skill icon above came from); one image answers 200 webp.
#     A malformed input is a 4xx, never a 5xx.
BASE_STATS_PY='["offensiveAwareness","ballControl","dribbling","tightPossession","lowPass","loftedPass","finishing","heading","placeKicking","curl","speed","acceleration","kickingPower","jump","physicalContact","balance","stamina","defensiveAwareness","ballWinning","defensiveEngagement","aggression","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach"]'
ICON_HOST="$(py 'import sys,urllib.parse; print(urllib.parse.urlsplit(sys.argv[1]).netloc)' "$ICON_URL")"
trpc_get "manager.picker" '{}'
MP="$(result "'%d|%s|%s|%d|%d|%d|%s' % (len(d), [ (-m['rating'], int(m['id'])) for m in d ] == sorted((-m['rating'], int(m['id'])) for m in d), all(1 <= len(m['pills']) <= 2 and len(set(m['pills'])) == len(m['pills']) and all(p in $BASE_STATS_PY for p in m['pills']) for m in d), sum(len(m['pills']) == 2 for m in d), len({m['id'] for m in d}), sum(83 <= m['rating'] <= 90 and bool(m['name']) for m in d), all(m['imageUrl'] and m['imageUrl'].split('/')[2] == '$ICON_HOST' for m in d))")"
MGR_IMG="$(result 'd[0]["imageUrl"]')"
if [ "$CODE" = "200" ] && [ "$MP" = "69|True|True|45|69|69|True" ]; then
  pass "manager.picker → 69 managers, rating desc then id asc, 1–2 valid pills each (45 with two), ratings 83–90, images on $ICON_HOST"
else
  fail "manager.picker (expected '69|True|True|45|69|69|True')" "code=$CODE got='$MP' body=${BODY:0:200}"
fi
MGR_IMG_CODE="$(curl -sS -m 10 -o /dev/null -I -w '%{http_code} %{content_type}' "$MGR_IMG" 2>/dev/null || echo 000)"
if [ "$MGR_IMG_CODE" = "200 image/webp" ]; then
  pass "picker manager image on R2 → 200 image/webp"
else
  fail "picker manager image on R2 → 200 image/webp" "url=$MGR_IMG got=$MGR_IMG_CODE"
fi
BAD_CODE="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$API/trpc/manager.picker?input=%7Bnot-json" 2>/dev/null || echo 000)"
if [ "${BAD_CODE:0:1}" = "4" ] || [ "$BAD_CODE" = "200" ]; then
  pass "manager.picker with a malformed input → $BAD_CODE (no 5xx)"
else
  fail "manager.picker with a malformed input → no 5xx" "code=$BAD_CODE"
fi

trpc_get "skill.byId" '{"slug":"sharp-cut"}'
if [ "$CODE" = "200" ] && [ "$(result 'd is None')" = "True" ]; then
  pass "skill.byId of an unreleased skill (sharp-cut) → null (hidden)"
else
  fail "skill.byId sharp-cut → null" "code=$CODE body=${BODY:0:160}"
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

# 5c. sort presets (Trending · New cards · Top rated · High to low · Low to high):
#     each answers 200 and pages 1–5 carry no duplicate id
for PRESET in trending new top highest lowest; do
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
# "High to low" and "Low to high" sort by base overall: first ovr of each must bracket the catalogue
trpc_get "player.list" '{"page":1,"limit":1,"sort":"highest"}'
HI_OVR="$(result 'd["items"][0]["ovr"]')"
trpc_get "player.list" '{"page":1,"limit":1,"sort":"lowest"}'
LO_OVR="$(result 'd["items"][0]["ovr"]')"
if [ -n "$HI_OVR" ] && [ -n "$LO_OVR" ] && [ "$HI_OVR" -gt "$LO_OVR" ]; then
  pass "sort=highest starts at OVR $HI_OVR, sort=lowest at OVR $LO_OVR"
else
  fail "sort=highest / sort=lowest bracket the catalogue" "hi=$HI_OVR lo=$LO_OVR"
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
#     A card has one nationality, one team and one league, so two leagues /
#     two teams are exactly additive; two positions overlap (a card may play
#     both), so CF|SS is bracketed by max(CF, SS) and CF + SS.
trpc_get "player.list" '{"limit":1,"positions":["CF"]}'
POS_CF="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"positions":["SS"]}'
POS_SS="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"positions":["CF","SS"]}'
POS_CFSS="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"position":"CF","positions":["SS"]}'
POS_MERGED="$(result 'd["total"]')"
POS_MAX=$(( POS_CF > POS_SS ? POS_CF : POS_SS ))
if [ -n "$POS_CF" ] && [ -n "$POS_SS" ] && [ -n "$POS_CFSS" ] && [ "$POS_CFSS" -ge "$POS_MAX" ] && [ "$POS_CFSS" -lt $((POS_CF + POS_SS)) ] && [ "$POS_MERGED" = "$POS_CFSS" ]; then
  pass "player.list positions [CF,SS] → $POS_CFSS cards (CF $POS_CF · SS $POS_SS · OR, single-value position merged)"
else
  fail "player.list positions [CF,SS] is an OR of CF and SS" "cf=$POS_CF ss=$POS_SS cfss=$POS_CFSS merged=$POS_MERGED code=$CODE"
fi
trpc_get "player.leagues" '{}'
LG_A="$(result 'd[0]["id"]')"
LG_B="$(result 'd[1]["id"]')"
trpc_get "player.list" "{\"limit\":1,\"leagueIds\":[$LG_A]}"
LG_A_N="$(result 'd["total"]')"
trpc_get "player.list" "{\"limit\":1,\"leagueIds\":[$LG_B]}"
LG_B_N="$(result 'd["total"]')"
trpc_get "player.list" "{\"limit\":1,\"leagueIds\":[$LG_A,$LG_B,$LG_A]}"
LG_AB_N="$(result 'd["total"]')"
if [ -n "$LG_A_N" ] && [ -n "$LG_B_N" ] && [ -n "$LG_AB_N" ] && [ "$LG_AB_N" = $((LG_A_N + LG_B_N)) ] && [ "$LG_AB_N" -gt 0 ]; then
  pass "player.list leagueIds [$LG_A,$LG_B] → $LG_AB_N cards = $LG_A_N + $LG_B_N (OR, duplicate ignored)"
else
  fail "player.list leagueIds of two leagues is additive" "a=$LG_A_N b=$LG_B_N ab=$LG_AB_N code=$CODE"
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
# AND between lists: positions ∧ leagues ∧ nations is a subset of each list alone
trpc_get "player.list" "{\"limit\":1,\"positions\":[\"CF\",\"SS\"],\"leagueIds\":[$LG_A,$LG_B],\"nationalityIds\":[1,14]}"
AND_N="$(result 'd["total"]')"
trpc_get "player.list" '{"limit":1,"nationalityIds":[1,14]}'
NAT_N="$(result 'd["total"]')"
if [ "$CODE" = "200" ] && [ -n "$AND_N" ] && [ -n "$NAT_N" ] && [ "$AND_N" -le "$POS_CFSS" ] && [ "$AND_N" -le "$LG_AB_N" ] && [ "$AND_N" -le "$NAT_N" ]; then
  pass "player.list positions ∧ leagueIds ∧ nationalityIds → $AND_N cards (≤ $POS_CFSS, ≤ $LG_AB_N, ≤ $NAT_N)"
else
  fail "player.list lists are AND-ed with each other" "and=$AND_N cfss=$POS_CFSS leagues=$LG_AB_N nations=$NAT_N code=$CODE"
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

# 7. compare keeps input order: [A,B] and [B,A]
trpc_get "player.list" '{"page":1,"limit":2,"sort":"ovr","order":"desc"}'
ID_A="$(result 'd["items"][0]["id"]')"
ID_B="$(result 'd["items"][1]["id"]')"
if [ -n "$ID_A" ] && [ -n "$ID_B" ] && [ "$ID_A" != "$ID_B" ]; then
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

# 9. player.search ranks the exact name first
trpc_get "player.search" '{"q":"Lionel Messi","limit":3}'
TOP_NAME="$(result 'd[0]["name"] if d else ""')"
if [ "$CODE" = "200" ] && [ "$TOP_NAME" = "Lionel Messi" ]; then
  pass "player.search 'Lionel Messi' → first result Lionel Messi"
else
  fail "player.search 'Lionel Messi' → first result Lionel Messi" "code=$CODE first=$TOP_NAME"
fi

# 10. player.byId resolves a real card (baseId must match the card)
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
echo ""
echo "Smoke summary: $PASS passed, $FAIL failed (api: $API)"
if [ "$FAIL" -gt 0 ]; then
  for n in "${FAILED_NAMES[@]}"; do echo "  ✗ $n"; done
  exit 1
fi
exit 0
