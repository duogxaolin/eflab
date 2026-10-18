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

# 2. featured.list carries slugs and the "National All-Stars" bundle; featured.bySlug resolves it
trpc_get "featured.list" '{}'
NAS_SLUG="$(result '[b["slug"] for b in d if b["name"] == "National All-Stars"][0]')"
if [ "$CODE" = "200" ] && [ -n "$NAS_SLUG" ]; then
  pass "featured.list → bundle 'National All-Stars' with slug $NAS_SLUG"
  trpc_get "featured.bySlug" "{\"slug\":\"$NAS_SLUG\"}"
  NAS_CARDS="$(result 'len(d["cards"])')"
  if [ "$CODE" = "200" ] && [ -n "$NAS_CARDS" ] && [ "$NAS_CARDS" -gt 0 ]; then
    pass "featured.bySlug $NAS_SLUG → $NAS_CARDS cards"
  else
    fail "featured.bySlug $NAS_SLUG" "code=$CODE cards=$NAS_CARDS body=${BODY:0:200}"
  fi
else
  fail "featured.list → 'National All-Stars' bundle with slug" "code=$CODE body=${BODY:0:200}"
fi

# 3. removed procedures answer 404 (community / feed / tierList / user / pages /
#    pack / manager routers were deleted in change remove-dead-surface; the
#    manager tactic cross-fill is asserted by scripts/verify-seed.py instead)
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
