#!/bin/bash
# Smoke test — validates tRPC endpoints against the running server.
# Run: bash scripts/smoke-test.sh  (with `pnpm api:dev` running + Postgres seeded)
set +e
API="${API_URL:-http://localhost:4000}"
FAILS=0

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; FAILS=$((FAILS + 1)); }

# /health
H=$(curl -sS -m 8 "$API/health")
if echo "$H" | grep -q '"ok"'; then pass "health"; else fail "health"; echo "$H"; fi

# player.list (paginated, sorted)
L=$(curl -sS -m 8 "$API/trpc/player.list?input=%7B%22json%22%3A%7B%22page%22%3A1%2C%22limit%22%3A5%2C%22sort%22%3A%22ovr%22%2C%22order%22%3A%22desc%22%7D%7D")
if echo "$L" | grep -q '"id"'; then pass "player.list (paginated, sorted by OVR)"; else fail "player.list"; echo "$L" | head -c 240; echo; fi

# Pull baseId/id from the first result for the by-id probe.
BASE1=$(echo "$L" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['items'][0]['baseId'])" 2>/dev/null)
ID2=$(echo "$L" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['items'][0]['id'])" 2>/dev/null)

if [ -n "$ID2" ] && [ -n "$BASE1" ]; then
  ENCODED=$(python3 -c "import urllib.parse, json, sys; print(urllib.parse.quote(json.dumps({'json':{'baseId':sys.argv[1],'cardId':sys.argv[2]}})))" "$BASE1" "$ID2")
  R=$(curl -sS -m 8 "$API/trpc/player.byId?input=$ENCODED")
  if echo "$R" | grep -q '"id"'; then pass "player.byId (full card detail)"; else fail "player.byId"; echo "$R" | head -c 240; echo; fi
else
  fail "player.list → byId (id parse)"
fi

# player.search — fuzzy match
S=$(curl -sS -m 8 "$API/trpc/player.search?input=%7B%22json%22%3A%7B%22q%22%3A%22Messi%22%2C%22limit%22%3A3%7D%7D")
if echo "$S" | grep -q 'Lionel Messi'; then pass "player.search Messi (fuzzy)"; else fail "player.search"; echo "$S" | head -c 240; echo; fi

# manager.list with tactic filter QuickCounter >= 88 (spec scenario)
M=$(curl -sS -m 8 "$API/trpc/manager.list?input=%7B%22json%22%3A%7B%22tacticMin%22%3A%7B%22quickCounter%22%3A88%7D%7D%7D")
if echo "$M" | grep -q 'Antonio Conte'; then pass "manager.filter QC>=88 → Conte"; else fail "manager.list"; echo "$M" | head -c 240; echo; fi

# skill.list
SL=$(curl -sS -m 8 "$API/trpc/skill.list?input=%7B%22json%22%3A%7B%7D%7D")
COUNT=$(echo "$SL" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['data']['json']))" 2>/dev/null)
if [ -n "$COUNT" ] && [ "$COUNT" -ge 67 ]; then pass "skill.list (>=67: got $COUNT)"; else fail "skill.list count=$COUNT"; fi

# pack.list
PK=$(curl -sS -m 8 "$API/trpc/pack.list?input=%7B%22json%22%3A%7B%22type%22%3A%22all%22%7D%7D")
if echo "$PK" | grep -q 'National All-Stars'; then pass "pack.list"; else fail "pack.list"; echo "$PK" | head -c 240; echo; fi

# community.simulate — build simulator spec scenario (4 points → Shooting)
SIM_INPUT_JSON=$(python3 -c "import json, sys; print(json.dumps({'json': {'playerId': sys.argv[1], 'level': 1, 'maxLevel': 100, 'trainingPoints': {'Shooting': 4, 'Passing': 0, 'Dribbling': 0, 'Dexterity': 0, 'LowerBody': 0, 'Aerial': 0, 'Defending': 0, 'Goalkeeping': 0}, 'boosters': [False, False]}}))" "$ID2")
SIM=$(curl -sS -m 8 "$API/trpc/community.simulate?input=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$SIM_INPUT_JSON")")
OA=$(echo "$SIM" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['trainingDeltas']['offensiveAwareness'])" 2>/dev/null)
FIN=$(echo "$SIM" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['trainingDeltas']['finishing'])" 2>/dev/null)
PK=$(echo "$SIM" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['data']['json']['trainingDeltas']['placeKicking'])" 2>/dev/null)
if [ "$OA" = 4 ] && [ "$FIN" = 4 ] && [ "$PK" = 2 ]; then
  pass "build.simulator spec scenario — Shooting+4 → OA+4 / Fin+4 / SPT(API)+2"
else
  fail "build.simulator spec — OA=$OA, Fin=$FIN, SPT=$PK"
fi

echo ""
echo "Smoke summary: $FAILS failure(s)"
exit $FAILS
