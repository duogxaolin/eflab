// Tests for the build helpers and the URL codecs (change efootbase-function-parity,
// design decisions D2, D4, D5, D11). Same assert-style runner as
// progression.test.ts. The cards below carry only what the rules read (card
// type, level cap, registered position, booster vectors); the allocations and
// point totals they are checked against are the readings of the reference
// survey of 2026-10-23 (numbers only), re-derived with this engine.
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/build.test.ts)
import { POSITIONS, TRAINING_CATEGORIES } from "./constants";
import { MANAGER_PROFICIENCY_DEFAULT, applyManagerProficiency, emptyAllocation, toDisplayPoints, trainingPointsAvailable, allocationCost, zeroStats, type TrainingAllocation } from "./progression";
import {
  CATEGORY_POINT_MAX,
  HIGHLIGHT_MAX_LEVEL,
  TRENDING_BOOSTER_CYCLE,
  allocationForMaxLevel,
  booster1Levels,
  boosterAtLevel,
  boosterForLevel,
  buildMode,
  categoryLimit,
  clampAllocationInOrder,
  defaultAllocation,
  engineBoosters,
  maxLevelRange,
  nextBoosterLevel,
  ownBooster2Levels,
  setCategoryPoints,
  simulateCardBuild,
  statBreakdown,
  takesSecondBooster,
  trimAllocationFromLast,
  type BuildCard,
} from "./build";
import {
  BUILD_QUERY_KEYS,
  decodeBuildQuery,
  encodeBuildQuery,
  hasBuildParams,
  openingBuildState,
  resolveBuildLists,
  sameBuildState,
  type BuildUrlState,
} from "./build-url";
import { COMPARE_NO_MANAGER_PROFICIENCY, appendCompareSideBuild, appendRawCompareSide, decodeCompareSide, encodeCompareQuery, parseCompareCards } from "./compare-url";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const alloc = (s: string): TrainingAllocation => {
  const out = emptyAllocation();
  s.split("/").forEach((v, i) => (out[TRAINING_CATEGORIES[i]!] = Number(v)));
  return out;
};
const allocStr = (a: TrainingAllocation): string => TRAINING_CATEGORIES.map((c) => a[c]).join("/");
const kinds = (r: { corrections: Array<{ key: string; kind: string }> }) => r.corrections.map((c) => `${c.key}:${c.kind}`).sort().join(",");
const pos = (p: (typeof POSITIONS)[number]) => POSITIONS.indexOf(p);

// Boosters (sparse vectors as the API sends them; only the stats raised).
const BALL_CARRYING_4 = { stats: { dribbling: 4, tightPossession: 4, speed: 4, balance: 4 } };
const AGILITY_4 = { stats: { speed: 4, acceleration: 4, balance: 4, stamina: 4 } };
const KICKING_POWER_6 = { stats: { kickingPower: 6 } };
const STRIKERS_INSTINCT_3 = { stats: { offensiveAwareness: 3, ballControl: 3, finishing: 3, acceleration: 3 } };
const EMPTY = { stats: {} }; // Booster 136 "Booster +1" / id 0 — no stat data

// Cards (survey cards; level caps, positions and boosters from the local data).
const quaresma: BuildCard = { cardType: "EPIC", levelCap: 31, registeredPosition: pos("RWF"), booster1: BALL_CARRYING_4, booster2: EMPTY };
const messi: BuildCard = { cardType: "EPIC", levelCap: 34, registeredPosition: pos("RWF"), booster1: { stats: { dribbling: 5, tightPossession: 5, speed: 5, balance: 5 } }, booster2: EMPTY };
const bale: BuildCard = { cardType: "EPIC", levelCap: 35, registeredPosition: pos("RWF"), booster1: AGILITY_4, booster2: KICKING_POWER_6 };
const umeda: BuildCard = { cardType: "HIGHLIGHT", levelCap: 73, registeredPosition: pos("CF"), booster1: null, booster2: null };
const messiGracias: BuildCard = { cardType: "HIGHLIGHT", levelCap: 1, registeredPosition: pos("SS"), booster1: null, booster2: null };
const vitinha: BuildCard = { cardType: "HIGHLIGHT", levelCap: 1, registeredPosition: pos("CMF"), booster1: null, booster2: null };
const yamal: BuildCard = { cardType: "TRENDING", levelCap: 1, registeredPosition: pos("RWF"), booster1: STRIKERS_INSTINCT_3, booster2: null };
const standardCap1: BuildCard = { cardType: "STANDARD", levelCap: 1, registeredPosition: pos("CB"), booster1: BALL_CARRYING_4, booster2: null };

// 1. Modes and ranges.
{
  assert(buildMode(quaresma) === "capped" && buildMode(messiGracias) === "highlight" && buildMode(yamal) === "trending" && buildMode(standardCap1) === "none", "modes: cap > 1 → capped, Highlight cap 1 → highlight, Trending → trending, other cap 1 → none");
  assert(eq(maxLevelRange(quaresma), [1, 31]) && eq(maxLevelRange(messiGracias), [1, HIGHLIGHT_MAX_LEVEL]) && eq(maxLevelRange(yamal), [1, 1]), "Max Level ranges 1..cap / 1..80 / none");
  assert(allocStr(defaultAllocation(quaresma)) === "4/4/12/9/8/1/0/0/0/0" && allocStr(defaultAllocation(messi)) === "4/4/12/11/8/1/0/0/0/0" && allocStr(defaultAllocation(bale)) === "4/4/12/12/8/0/0/0/0/0", "opening allocations Quaresma 4/4/12/9/8/1, Messi 4/4/12/11/8/1, Bale 4/4/12/12/8 (survey Max OVR)");
  assert(allocStr(defaultAllocation(messiGracias)) === "0/0/0/0/0/0/0/0/0/0", "a Highlight cap-1 card opens empty at Max Level 1");
  assert(allocStr(defaultAllocation(messiGracias, 10)) === "4/0/5/4/4/0/0/0/0/0", "Messi \"Gracias, Leo!\" Max OVR at Max Level 10 → 4/0/5/4/4 (18 pts)");
  assert(toDisplayPoints(trainingPointsAvailable(10)) === 18 && toDisplayPoints(allocationCost(defaultAllocation(messiGracias, 10))) === 18, "… which costs exactly the 18 pts of Max Level 10");
  assert(allocStr(defaultAllocation(vitinha, 20)) === "0/8/5/4/8/0/4/0/0/0", "Vitinha Max OVR at Max Level 20 → Passing 8, Dribbling 5, Dexterity 4, Lower Body 8, Defending 4");
  assert(allocStr(defaultAllocation(yamal)) === "0/0/0/0/0/0/0/0/0/0" && allocStr(defaultAllocation(standardCap1)) === "0/0/0/0/0/0/0/0/0/0", "no categories for Trending / other cap-1 cards");
}

// 2. trimAllocationFromLast — the survey's Messi "Gracias, Leo!" sequence.
{
  const max10 = defaultAllocation(messiGracias, 10);
  const at = (ml: number, a: TrainingAllocation) => trimAllocationFromLast(a, trainingPointsAvailable(ml));
  const a9 = at(9, max10);
  const a8 = at(8, a9);
  const a5 = at(5, a8);
  const a1 = at(1, a5);
  assert(allocStr(a9) === "4/0/5/4/2/0/0/0/0/0", "ml 10 → 9: Lower Body Strength 4 → 2 (16 pts)");
  assert(allocStr(a8) === "4/0/5/4/0/0/0/0/0/0", "ml 9 → 8: Lower Body Strength 0 (14 pts)");
  assert(allocStr(a5) === "4/0/4/0/0/0/0/0/0/0", "ml 8 → 5: Shooting 4 and Dribbling 4 only (8 pts)");
  assert(allocStr(a1) === "0/0/0/0/0/0/0/0/0/0", "ml 5 → 1: no point");
  assert(allocStr(at(5, max10)) === "4/0/4/0/0/0/0/0/0/0", "ml 10 → 5 in one step gives the same build");
  assert(allocStr(at(10, max10)) === allocStr(max10) && at(10, max10) !== max10, "an allocation that fits is returned unchanged (a copy)");
  // Highlight slider 10 → 9 after Max OVR: only the last category holding points loses, by the fewest points.
  const vit20 = defaultAllocation(vitinha, 20);
  const vit19 = at(19, vit20);
  assert(toDisplayPoints(allocationCost(vit19)) <= 36 && TRAINING_CATEGORIES.slice(0, 6).every((c) => vit19[c] === vit20[c]) && vit19.Defending < vit20.Defending, "Vitinha ml 20 → 19: only Defending (the last category with points) loses points");
  // A capped card at a lower level (the input of cards with a cap above 1): 12 pts spent, level 5 → ≤ 8 pts, last categories first.
  const twelve = alloc("4/4/4/0/0/0/0/0/0/0"); // 4 + 4 + 4 = 12 pts
  const fit = trimAllocationFromLast(twelve, trainingPointsAvailable(5));
  assert(allocStr(fit) === "4/4/0/0/0/0/0/0/0/0" && toDisplayPoints(allocationCost(fit)) === 8, "12 pts at level 5 → the last category (Dribbling) is emptied first, 8 pts");
  assert(allocStr(trimAllocationFromLast(twelve, trainingPointsAvailable(25))) === allocStr(twelve) && toDisplayPoints(trainingPointsAvailable(25)) === 48, "12 pts at level 25 (48 pts) are unchanged");
}

// 3. clampAllocationInOrder — the survey's Umeda over-budget link (144 pts).
{
  const cut = clampAllocationInOrder(alloc("25/0/25/25/0/0/0/0/0/0"), trainingPointsAvailable(73));
  assert(allocStr(cut) === "25/0/18/3/0/0/0/0/0/0" && toDisplayPoints(allocationCost(cut)) === 144, "sho 25 / dri 25 / dex 25 at 144 pts → 25 / 18 / 3 (144/144)");
  assert(allocStr(clampAllocationInOrder(alloc("4/4/12/9/8/1/0/0/0/0"), trainingPointsAvailable(31))) === "4/4/12/9/8/1/0/0/0/0", "an allocation within the budget is unchanged");
  assert(allocStr(clampAllocationInOrder(alloc("3/3/0/0/0/0/0/0/0/0"), 0)) === "0/0/0/0/0/0/0/0/0/0", "a zero budget empties everything");
}

// 4. Booster levels.
{
  const lvl1 = boosterAtLevel(STRIKERS_INSTINCT_3, 1);
  assert(eq(lvl1.stats, { offensiveAwareness: 1, ballControl: 1, finishing: 1, acceleration: 1 }), "boosterAtLevel(+3 booster, 1) → +1 on each of its stats");
  assert(eq(boosterAtLevel(STRIKERS_INSTINCT_3, 2).stats, { offensiveAwareness: 2, ballControl: 2, finishing: 2, acceleration: 2 }), "… level 2 → +2 each");
  assert(eq(boosterAtLevel({ stats: { dribbling: 4, speed: 0 } }, 1).stats, { dribbling: 1 }), "a stat the booster does not raise stays out");
  assert(eq(boosterAtLevel(STRIKERS_INSTINCT_3, 0).stats, { offensiveAwareness: 0, ballControl: 0, finishing: 0, acceleration: 0 }), "level 0 raises nothing");
  assert(eq(booster1Levels(yamal), TRENDING_BOOSTER_CYCLE) && eq(booster1Levels(quaresma), ["full", 0]) && eq(booster1Levels(umeda), []), "Booster 1 levels: Trending +3 cycles, others toggle, none without stat data");
  assert(eq(booster1Levels({ cardType: "TRENDING", booster1: { stats: { speed: 2, balance: 2 } } }), ["full", 0]), "a Trending booster of another magnitude falls back to on / off (not measured)");
  const cycle: unknown[] = [];
  let cur = booster1Levels(yamal)[0]!;
  for (let i = 0; i < 4; i++) cycle.push((cur = nextBoosterLevel(booster1Levels(yamal), cur)));
  assert(eq(cycle, [0, 1, 2, "full"]), "the Trending cycle on four activations: off, +1, +2, +3");
  assert(eq(ownBooster2Levels(bale), ["full", 0]) && eq(ownBooster2Levels(quaresma), []) && !takesSecondBooster(bale) && takesSecondBooster(quaresma) && !takesSecondBooster(yamal), "own Booster 2 toggles; a card without one takes a second booster (not Trending)");
  assert(!takesSecondBooster(messiGracias) && !takesSecondBooster(vitinha) && kinds(decodeBuildQuery("b2=strikers-instinct1", messiGracias)) === "b2:not-applicable", "no second booster on a Highlight card with a level cap of 1 (the reference shows no booster row there, S1 L5 / L9): b2 dropped");
  assert(boosterForLevel(KICKING_POWER_6, 0) === null && boosterForLevel(KICKING_POWER_6, "full") === KICKING_POWER_6, "boosterForLevel: 0 → off, full → the booster");
  const strikers1 = { stats: { offensiveAwareness: 1, ballControl: 1, finishing: 1, acceleration: 1 } };
  const q = engineBoosters(quaresma, { booster1: "full", booster2: "full" }, strikers1);
  assert(q.boosters[0] === BALL_CARRYING_4 && q.boosters[1] === strikers1 && eq(q.active, [true, true]), "engineBoosters: Quaresma's own Booster 1 + the chosen second booster");
  const qOff = engineBoosters(quaresma, { booster1: 0, booster2: "full" }, null);
  assert(qOff.boosters[0] === null && qOff.boosters[1] === null && eq(qOff.active, [false, false]), "… Booster 1 off and no second booster → nothing applied");
  const b = engineBoosters(bale, { booster1: "full", booster2: 0 }, strikers1);
  assert(b.boosters[0] === AGILITY_4 && b.boosters[1] === null, "Bale's own Booster 2 off; a second booster is never added to a card with its own");
  const y = engineBoosters(yamal, { booster1: 1, booster2: "full" }, strikers1);
  assert(eq(y.boosters[0]?.stats, strikers1.stats) && y.boosters[1] === null, "Yamal's Booster 1 at +1; no second booster on a Trending card");
  // Compare: no proficiency bonus without a manager.
  const bonus = applyManagerProficiency(COMPARE_NO_MANAGER_PROFICIENCY, Object.fromEntries(Object.keys(zeroStats()).map((s) => [s, 85])) as ReturnType<typeof zeroStats>);
  assert(Object.values(bonus).every((v) => v === 0) && COMPARE_NO_MANAGER_PROFICIENCY === 70, "compare runs at proficiency 70 without a manager: no bonus");
}

// 5. The card-page codec — survey scenarios.
{
  const enc = (s: BuildUrlState, card: BuildCard) => encodeBuildQuery(s, card).toString();
  // Opening state: no query.
  assert(enc(openingBuildState(quaresma), quaresma) === "" && enc(openingBuildState(messiGracias), messiGracias) === "", "the opening state writes no query");
  // Quaresma ?dri=3 (Reset, then + three times; reload).
  {
    const r = decodeBuildQuery("dri=3", quaresma);
    assert(allocStr(r.state.allocation) === "0/0/3/0/0/0/0/0/0/0" && r.corrections.length === 0 && r.hasBuildParams, "Quaresma ?dri=3 → Dribbling 3, every other category 0, no correction");
    assert(toDisplayPoints(allocationCost(r.state.allocation)) === 3 && toDisplayPoints(trainingPointsAvailable(r.state.maxLevel)) === 60, "… 3/60 pts");
    assert(enc(r.state, quaresma) === "dri=3", "… and writes dri=3 back");
  }
  // Proficiency on the opening allocation.
  {
    const s = { ...openingBuildState(quaresma), managerProficiency: 85 };
    assert(enc(s, quaresma) === "sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&mp=85", "Quaresma proficiency 85 → ?sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&mp=85");
  }
  // Reset.
  {
    const s = { ...openingBuildState(quaresma), allocation: emptyAllocation() };
    assert(enc(s, quaresma) === "pts=0", "Reset at proficiency 90 → ?pts=0");
    const r = decodeBuildQuery("pts=0", quaresma);
    assert(allocStr(r.state.allocation) === "0/0/0/0/0/0/0/0/0/0" && r.corrections.length === 0, "?pts=0 → a zero build (0/60 pts), no correction");
  }
  // Bale deep link restores every part, URL unchanged.
  {
    const q = "sho=2&pas=3&dri=4&dex=5&lbs=6&aer=1&def=2&gk1=1&gk3=1&mp=80&b1=0&b2l=0";
    const r = decodeBuildQuery(q, bale);
    assert(allocStr(r.state.allocation) === "2/3/4/5/6/1/2/1/0/1" && r.state.managerProficiency === 80 && r.state.booster1 === 0 && r.state.booster2 === 0, "Bale deep link → 2/3/4/5/6/1/2/1/0/1, proficiency 80, Booster 1 and own Booster 2 off");
    assert(r.corrections.length === 0 && enc(r.state, bale) === q, "… no correction, and the written query equals the link (URL unchanged)");
  }
  // Umeda over-budget link → corrected and announced.
  {
    const q = "sho=25&dri=27&dex=25&mgr=17593528325190";
    const r = decodeBuildQuery(q, umeda, { managerIds: ["17593528325190"] });
    assert(allocStr(r.state.allocation) === "25/0/18/3/0/0/0/0/0/0" && toDisplayPoints(allocationCost(r.state.allocation)) === 144, "Umeda over-budget link → Shooting 25, Dribbling 18, Dexterity 3 (144/144 pts)");
    assert(r.state.managerId === "17593528325190" && r.corrections.length > 0 && kinds(r) === "dex:over-budget,dri:clamped,dri:over-budget", "… with that manager; dri 27 capped at 25, dri and dex cut to the budget (corrections)");
    assert(enc(r.state, umeda) === "sho=25&dri=18&dex=3&mgr=17593528325190", "… and the corrected URL is ?sho=25&dri=18&dex=3&mgr=17593528325190");
  }
  // A link without categories → the opening Max-OVR allocation (eFootLab's rule).
  {
    const r = decodeBuildQuery("mp=85", quaresma);
    assert(allocStr(r.state.allocation) === "4/4/12/9/8/1/0/0/0/0" && r.state.managerProficiency === 85 && r.corrections.length === 0, "?mp=85 → the Max-OVR allocation 4/4/12/9/8/1 at proficiency 85 (the reference would load a zero build)");
    const ml = decodeBuildQuery("ml=20", quaresma);
    assert(ml.state.maxLevel === 20 && allocStr(ml.state.allocation) === allocStr(defaultAllocation(quaresma, 20)) && ml.corrections.length === 0, "?ml=20 without categories → the Max-OVR allocation of Max Level 20 (chosen rule)");
    // A Highlight card with a level cap of 1 opens empty at every Max Level:
    // `?ml=10` is an empty build at Max Level 10 (as the reference reads it).
    const hl = decodeBuildQuery("ml=10", messiGracias);
    assert(hl.state.maxLevel === 10 && allocStr(hl.state.allocation) === "0/0/0/0/0/0/0/0/0/0" && hl.corrections.length === 0, "Highlight cap 1 ?ml=10 → an empty build at Max Level 10, no correction");
    assert(enc(hl.state, messiGracias) === "pts=0&ml=10" && allocStr(decodeBuildQuery("pts=0&ml=10", messiGracias).state.allocation) === "0/0/0/0/0/0/0/0/0/0", "… written back as pts=0&ml=10, which reads the same build");
    const hlMp = decodeBuildQuery("mp=85", messiGracias);
    assert(hlMp.state.maxLevel === 1 && allocStr(hlMp.state.allocation) === "0/0/0/0/0/0/0/0/0/0" && hlMp.state.managerProficiency === 85 && hlMp.corrections.length === 0, "Highlight cap 1 ?mp=85 → no point at Max Level 1, proficiency 85");
    const vit = decodeBuildQuery("ml=20&mp=80", vitinha);
    assert(vit.state.maxLevel === 20 && allocStr(vit.state.allocation) === "0/0/0/0/0/0/0/0/0/0" && enc(vit.state, vitinha) === "pts=0&ml=20&mp=80", "Highlight cap 1 ?ml=20&mp=80 → empty at Max Level 20, written pts=0&ml=20&mp=80");
    const hlMax = { ...hl.state, allocation: defaultAllocation(messiGracias, 10) };
    assert(enc(hlMax, messiGracias) === "sho=4&dri=5&dex=4&lbs=4&ml=10" && allocStr(decodeBuildQuery("sho=4&dri=5&dex=4&lbs=4&ml=10", messiGracias).state.allocation) === "4/0/5/4/4/0/0/0/0/0", "Highlight Max OVR at ml 10 → sho=4&dri=5&dex=4&lbs=4&ml=10, and back");
  }
  // The second booster on Quaresma, with and without Booster 1.
  {
    const s = { ...openingBuildState(quaresma), secondBooster: "strikers-instinct1" };
    assert(enc(s, quaresma) === "sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&b2=strikers-instinct1", "Striker's Instinct chosen → ?sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&b2=strikers-instinct1");
    assert(enc({ ...s, booster1: 0 }, quaresma) === "sho=4&pas=4&dri=12&dex=9&lbs=8&aer=1&b1=0&b2=strikers-instinct1", "… with Booster 1 off → …&b1=0&b2=strikers-instinct1");
    const r = decodeBuildQuery("mp=85&b2=strikers-instinct1", quaresma);
    assert(r.state.secondBooster === "strikers-instinct1" && r.pending.secondBooster && r.corrections.length === 0, "b2 without the choices list: kept, check deferred");
    const known = resolveBuildLists(r.state, { secondBoosterSlugs: ["strikers-instinct1", "passing1"] });
    assert(known.state.secondBooster === "strikers-instinct1" && known.corrections.length === 0, "… a known slug stays once the list answered");
    const unknown = resolveBuildLists({ ...r.state, secondBooster: "no-such-booster1" }, { secondBoosterSlugs: ["strikers-instinct1"] });
    assert(unknown.state.secondBooster === null && kinds(unknown) === "b2:unknown", "… an unknown slug is dropped and reported");
    assert(kinds(decodeBuildQuery("b2=strikers-instinct1", bale)) === "b2:not-applicable", "b2 on a card with its own Booster 2 is dropped");
    assert(kinds(decodeBuildQuery("b2=Bad_Slug", quaresma)) === "b2:invalid", "a malformed b2 is dropped");
  }
  // Booster 1 / own Booster 2 values.
  {
    assert(decodeBuildQuery("b1=0", quaresma).state.booster1 === 0 && kinds(decodeBuildQuery("b1=1", quaresma)) === "b1:invalid", "non-Trending Booster 1: b1=0 only (b1=1 dropped)");
    assert(kinds(decodeBuildQuery("b1=0", umeda)) === "b1:not-applicable", "b1 on a card without Booster 1 data is dropped");
    assert(kinds(decodeBuildQuery("b2l=1", bale)) === "b2l:invalid" && kinds(decodeBuildQuery("b2l=0", quaresma)) === "b2l:not-applicable", "b2l: only 0, only on a card with its own Booster 2");
  }
  // Remembered / linked manager: deferred check, mp next to a manager.
  {
    const r = decodeBuildQuery("mgr=17593528325190", umeda);
    assert(r.state.managerId === "17593528325190" && r.pending.manager && r.corrections.length === 0 && allocStr(r.state.allocation) === allocStr(defaultAllocation(umeda)), "?mgr=… alone: the manager (check deferred) on the opening allocation");
    const dropped = resolveBuildLists(r.state, { managerIds: ["17606144688129"] });
    assert(dropped.state.managerId === null && kinds(dropped) === "mgr:unknown", "… an id that is not a picker manager is dropped once the list answered");
    assert(kinds(decodeBuildQuery("mgr=12x", umeda)) === "mgr:invalid", "a malformed manager id is dropped at once");
    const both = decodeBuildQuery("mp=80&mgr=17593528325190", umeda);
    assert(kinds(both) === "mp:redundant" && encodeBuildQuery(both.state, umeda).toString() === "sho=16&dri=8&dex=19&lbs=12&aer=8&gk1=1&mgr=17593528325190", "mp next to a manager is reported and not written back");
    assert(resolveBuildLists(both.state, { managerIds: [] }).state.managerProficiency === 80, "… and still applies if the manager is then dropped");
  }
  // Values are corrected, never trusted.
  {
    const r = decodeBuildQuery("sho=-3&pas=2.5&dri=abc&dex=&lbs=30", umeda);
    assert(allocStr(r.state.allocation) === "0/0/0/0/25/0/0/0/0/0" && kinds(r) === "dex:invalid,dri:invalid,lbs:clamped,pas:invalid,sho:invalid", "negative / fractional / non-numeric / empty → 0, above 25 → 25");
    assert(decodeBuildQuery("dri=03", quaresma).corrections.length === 0 && decodeBuildQuery("dri=03", quaresma).state.allocation.Dribbling === 3, "dri=03 reads 3 without a correction (non-canonical form, not a fix)");
    assert(kinds(decodeBuildQuery("dri=3&dri=5", quaresma)) === "dri:redundant" && decodeBuildQuery("dri=3&dri=5", quaresma).state.allocation.Dribbling === 3, "a repeated key: the first value, the rest reported");
    const pts = decodeBuildQuery("pts=5", quaresma);
    assert(kinds(pts) === "pts:invalid" && allocStr(pts.state.allocation) === "4/4/12/9/8/1/0/0/0/0", "pts=5 is dropped; without category keys the opening allocation applies");
    assert(kinds(decodeBuildQuery("pts=0&dri=3", quaresma)) === "pts:redundant", "pts=0 next to category points is dropped");
    const ml = decodeBuildQuery("ml=99", quaresma);
    assert(ml.state.maxLevel === 31 && kinds(ml) === "ml:clamped", "ml above the cap → the cap");
    assert(decodeBuildQuery("ml=0", messiGracias).state.maxLevel === 1 && decodeBuildQuery("ml=81", messiGracias).state.maxLevel === 80 && kinds(decodeBuildQuery("ml=x", messiGracias)) === "ml:invalid", "Highlight ml limited to 1..80; a non-number dropped");
    assert(decodeBuildQuery("mp=95", quaresma).state.managerProficiency === 90 && decodeBuildQuery("mp=60", quaresma).state.managerProficiency === 70 && kinds(decodeBuildQuery("mp=8.5", quaresma)) === "mp:invalid", "mp limited to 70..90");
    const hl = decodeBuildQuery("dri=3", messiGracias);
    assert(allocStr(hl.state.allocation) === "0/0/0/0/0/0/0/0/0/0" && kinds(hl) === "dri:over-budget", "a Highlight cap-1 card at Max Level 1 cannot hold points (over budget)");
  }
  // Card kinds: Trending and other level-cap-1 cards.
  {
    const t = decodeBuildQuery("mp=85&b1=1", yamal);
    assert(t.state.managerProficiency === 85 && t.state.booster1 === 1 && t.corrections.length === 0 && encodeBuildQuery(t.state, yamal).toString() === "mp=85&b1=1", "Trending: mp and b1 levels read and written");
    for (const [q, level] of [["b1=0", 0], ["b1=1", 1], ["b1=2", 2]] as const) {
      assert(decodeBuildQuery(q, yamal).state.booster1 === level && encodeBuildQuery(decodeBuildQuery(q, yamal).state, yamal).toString() === q, `Trending ${q} round trip`);
    }
    assert(kinds(decodeBuildQuery("dri=3&pts=0&ml=5&b2=strikers-instinct1&b2l=0&b1=3", yamal)) === "b1:invalid,b2:not-applicable,b2l:not-applicable,dri:not-applicable,ml:not-applicable,pts:not-applicable", "Trending: categories, pts, ml, b2, b2l dropped; b1=3 is not a level");
    const n = decodeBuildQuery("dri=3&mp=85&mgr=17606144688129&b1=0", standardCap1);
    assert(kinds(n) === "b1:not-applicable,dri:not-applicable,mgr:not-applicable,mp:not-applicable" && encodeBuildQuery(n.state, standardCap1).toString() === "", "other cap-1 cards: no build at all — every build parameter dropped, nothing written");
  }
  // Which parameters count as a build.
  {
    assert(!hasBuildParams(new URLSearchParams("utm_source=x&ref=y")) && hasBuildParams(new URLSearchParams("utm_source=x&b1=0")), "foreign parameters do not count as build parameters");
    const r = decodeBuildQuery("utm_source=x", quaresma);
    assert(!r.hasBuildParams && r.corrections.length === 0 && sameBuildState(r.state, openingBuildState(quaresma), quaresma), "a query without build parameters is the opening state");
    assert(eq(BUILD_QUERY_KEYS, ["sho", "pas", "dri", "dex", "lbs", "aer", "def", "gk1", "gk2", "gk3", "pts", "ml", "mp", "mgr", "b1", "b2", "b2l"]), "the spec's parameter order");
  }
}

// 6. Fuzz: the decoder never throws, its state is always valid, and
//    decode(encode(state)) is the same build with no correction.
{
  let seed = 20261023;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const values = ["0", "1", "2", "3", "5", "12", "25", "26", "99", "-1", "2.5", "", "abc", "03", "1e3", "999999999999", "17606144688129", "strikers-instinct1", "Bad Slug", "%", "0x1"];
  const keys = [...BUILD_QUERY_KEYS, "utm_source", "pos", "ids"];
  const cards = [quaresma, messi, bale, umeda, messiGracias, vitinha, yamal, standardCap1];
  const managerIds = ["17606144688129", "17593528325190"];
  const slugs = ["strikers-instinct1", "passing1"];
  let runs = 0;
  let threw = 0;
  let broke = 0;
  for (let i = 0; i < 600; i++) {
    const sp = new URLSearchParams();
    const n = Math.floor(rnd() * 8);
    for (let j = 0; j < n; j++) sp.append(pick(keys), pick(values));
    if (rnd() < 0.2) sp.append(pick(keys), String.fromCharCode(...Array.from({ length: 4 }, () => 32 + Math.floor(rnd() * 90))));
    const card = pick(cards);
    const lists = rnd() < 0.5 ? { managerIds, secondBoosterSlugs: slugs } : {};
    runs++;
    try {
      const r = decodeBuildQuery(sp, card, lists);
      const [lo, hi] = maxLevelRange(card);
      const valid =
        r.state.maxLevel >= lo && r.state.maxLevel <= hi &&
        TRAINING_CATEGORIES.every((c) => Number.isInteger(r.state.allocation[c]) && r.state.allocation[c] >= 0 && r.state.allocation[c] <= CATEGORY_POINT_MAX) &&
        allocationCost(r.state.allocation) <= trainingPointsAvailable(r.state.maxLevel) &&
        r.state.managerProficiency >= 70 && r.state.managerProficiency <= 90;
      const written = encodeBuildQuery(r.state, card);
      const order = [...written.keys()].map((k) => BUILD_QUERY_KEYS.indexOf(k as (typeof BUILD_QUERY_KEYS)[number]));
      const ordered = order.every((v, k) => v >= 0 && (k === 0 || v > order[k - 1]!));
      const again = decodeBuildQuery(written, card, lists);
      if (!valid || !ordered || again.corrections.length > 0 || !sameBuildState(again.state, r.state, card)) {
        broke++;
        if (broke <= 3) console.error("  fuzz case:", sp.toString(), "→", written.toString(), again.corrections);
      }
    } catch (e) {
      threw++;
      if (threw <= 3) console.error("  fuzz threw:", sp.toString(), e);
    }
  }
  assert(threw === 0, `fuzz: the decoder never threw on ${runs} random queries`);
  assert(broke === 0, `fuzz: every decoded state was valid, written in the canonical order, and read back unchanged with no correction (${runs} queries)`);
}

// 7. The compare codec.
{
  const MESSI = "89136409091415";
  const QUARESMA = "88045487395246";
  const MARTINEZ = "17606144688129";
  const c = parseCompareCards(`left=${MESSI}`);
  assert(c.left === MESSI && c.right === null && c.legacyIds === null && c.corrections.length === 0, "?left=… → the left card");
  const side = decodeCompareSide(`left=${MESSI}`, "left", messi);
  assert(allocStr(side.allocation) === "4/4/12/11/8/1/0/0/0/0" && side.managerId === null && side.corrections.length === 0, "… its default build 4/4/12/11/8/1 (66/66 pts)");
  const def = { cardId: MESSI, allocation: side.allocation, managerId: null };
  assert(encodeCompareQuery({ left: def, right: null }, { left: messi }).toString() === `left=${MESSI}`, "a default build writes only the card");
  const reset = { ...def, allocation: emptyAllocation() };
  assert(encodeCompareQuery({ left: reset, right: null }, { left: messi }).toString() === `left=${MESSI}&lb=1`, "Reset on the left → ?left=…&lb=1");
  const withMgr = { cardId: MESSI, allocation: defaultAllocation(messi), managerId: MARTINEZ };
  const q = encodeCompareQuery({ left: def, right: withMgr }, { left: messi, right: messi }).toString();
  assert(q === `left=${MESSI}&right=${MESSI}&r_sho=4&r_pas=4&r_dri=12&r_dex=11&r_lbs=8&r_aer=1&r_mgr=${MARTINEZ}`, "Martínez on the right → r_sho=4&r_pas=4&r_dri=12&r_dex=11&r_lbs=8&r_aer=1&r_mgr=… (the same card twice)");
  // Restore from that link.
  const cards = parseCompareCards(q);
  const l = decodeCompareSide(q, "left", messi);
  const r = decodeCompareSide(q, "right", messi, { managerIds: [MARTINEZ] });
  assert(cards.left === MESSI && cards.right === MESSI && allocStr(l.allocation) === "4/4/12/11/8/1/0/0/0/0" && l.managerId === null && allocStr(r.allocation) === "4/4/12/11/8/1/0/0/0/0" && r.managerId === MARTINEZ && r.corrections.length === 0, "the copied link restores both sides and the manager");
  // Swap: the side keys exchange.
  const swapped = encodeCompareQuery({ left: withMgr, right: reset }, { left: messi, right: messi }).toString();
  assert(swapped === `left=${MESSI}&right=${MESSI}&l_sho=4&l_pas=4&l_dri=12&l_dex=11&l_lbs=8&l_aer=1&l_mgr=${MARTINEZ}&rb=1`, "Swap exchanges the l_* / r_* parameters and lb / rb");
  // Remove keeps the other side in place.
  assert(encodeCompareQuery({ left: null, right: withMgr }, { right: messi }).toString() === `right=${MESSI}&r_sho=4&r_pas=4&r_dri=12&r_dex=11&r_lbs=8&r_aer=1&r_mgr=${MARTINEZ}`, "Remove on the left → ?right=… with the right side's build");
  // Two different cards.
  const two = parseCompareCards(`left=${MESSI}&right=${QUARESMA}`);
  assert(two.left === MESSI && two.right === QUARESMA && allocStr(decodeCompareSide("", "right", quaresma).allocation) === "4/4/12/9/8/1/0/0/0/0", "Messi vs Quaresma: the right side's default 4/4/12/9/8/1 (60/60 pts)");
  // Legacy ids and bad ids.
  const legacy = parseCompareCards(`ids=${MESSI},${QUARESMA},123`);
  assert(eq(legacy.legacyIds, [MESSI, QUARESMA, "123"]) && legacy.left === null && legacy.corrections.length === 0, "?ids=a,b,c → the ids in order for the page to look up (left = first found, right = second)");
  assert(kinds(parseCompareCards(`left=1x&right=${QUARESMA}`)) === "left:invalid", "a malformed left id is dropped");
  assert(kinds(parseCompareCards(`left=${MESSI}&ids=1,2`)) === "ids:redundant", "ids next to left / right is dropped");
  assert(kinds(parseCompareCards(`right=${MESSI}&l_sho=4&lb=1`)) === "l_sho:not-applicable,lb:not-applicable", "build keys of an empty side are dropped");
  // Corrections per side, as on the card page.
  const over = decodeCompareSide("left=1&l_sho=25&l_dri=27&l_dex=25", "left", umeda);
  assert(allocStr(over.allocation) === "25/0/18/3/0/0/0/0/0/0" && kinds(over) === "l_dex:over-budget,l_dri:clamped,l_dri:over-budget", "a side's over-budget link is cut in category order (25/18/3)");
  const cap1 = decodeCompareSide(`left=1&l_dri=3&lb=1&l_mgr=${MARTINEZ}`, "left", messiGracias);
  assert(allocStr(cap1.allocation) === "0/0/0/0/0/0/0/0/0/0" && cap1.managerId === MARTINEZ && kinds(cap1) === "l_dri:not-applicable,lb:not-applicable", "a level-cap-1 card has no categories in compare (a manager still applies)");
  assert(encodeCompareQuery({ left: { cardId: "1", allocation: emptyAllocation(), managerId: MARTINEZ }, right: null }, { left: messiGracias }).toString() === `left=1&l_mgr=${MARTINEZ}`, "… and writes only its manager");
  assert(MANAGER_PROFICIENCY_DEFAULT === 90, "card page default proficiency stays 90");
  // A side whose card has not loaded yet keeps the link's build, re-keyed
  // when it moves (Swap) — the page composes the query side by side.
  const link = `left=${MESSI}&right=${QUARESMA}&l_sho=4&l_dri=27&l_mgr=${MARTINEZ}&rb=1`;
  const moved = new URLSearchParams();
  appendRawCompareSide(moved, link, "left", "right");
  assert(moved.toString() === `r_sho=4&r_dri=27&r_mgr=${MARTINEZ}`, "appendRawCompareSide: the left side's raw keys re-keyed for the right, values unchanged (corrected only once decoded)");
  const kept = new URLSearchParams();
  appendRawCompareSide(kept, link, "right", "right");
  assert(kept.toString() === "rb=1", "… the right side's own keys copied in place (lb / rb included)");
  const twice = new URLSearchParams();
  appendRawCompareSide(twice, "l_sho=3&l_sho=5", "left", "left");
  assert(twice.toString() === "l_sho=3&l_sho=5", "… repeated values are copied too (the decoder reports them)");
  // Swap while the right card loads: decoded left moves right, the raw right side moves left.
  const composed = new URLSearchParams();
  composed.append("left", QUARESMA);
  composed.append("right", MESSI);
  appendRawCompareSide(composed, link, "right", "left");
  appendCompareSideBuild(composed, "right", reset, messi);
  assert(composed.toString() === `left=${QUARESMA}&right=${MESSI}&lb=1&rb=1`, "appendCompareSideBuild + appendRawCompareSide compose the swapped query (left build first, then right)");
  const plain = new URLSearchParams();
  appendCompareSideBuild(plain, "left", def, messi);
  assert(plain.toString() === "", "appendCompareSideBuild writes nothing for a default build");

  // Fuzz: the compare codec never throws, and a decoded compare state written
  // back and read again is the same, with no correction.
  let seed = 20261024;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const keys = ["left", "right", "ids", "lb", "rb", "l_sho", "l_dri", "l_dex", "l_gk1", "l_mgr", "r_sho", "r_pas", "r_lbs", "r_mgr", "pts", "utm"];
  const values = [MESSI, QUARESMA, "1", "0", "3", "12", "25", "27", "-1", "2.5", "", "abc", `${MESSI},${QUARESMA}`, MARTINEZ, "99999999999999999999", "1x"];
  const cardsPool = [messi, quaresma, umeda, messiGracias, yamal, standardCap1];
  let threw = 0;
  let broke = 0;
  for (let i = 0; i < 300; i++) {
    const sp = new URLSearchParams();
    const n = Math.floor(rnd() * 8);
    for (let j = 0; j < n; j++) sp.append(pick(keys), pick(values));
    const lists = rnd() < 0.5 ? { managerIds: [MARTINEZ] } : {};
    try {
      const parsed = parseCompareCards(sp);
      const cardOf = { left: pick(cardsPool), right: pick(cardsPool) };
      const state = {
        left: parsed.left ? { cardId: parsed.left, ...decodeCompareSide(sp, "left", cardOf.left, lists) } : null,
        right: parsed.right ? { cardId: parsed.right, ...decodeCompareSide(sp, "right", cardOf.right, lists) } : null,
      };
      const written = encodeCompareQuery(state, cardOf);
      const again = parseCompareCards(written);
      const sides = (["left", "right"] as const).map((side) => {
        const s = state[side];
        if (!s) return again[side] === null;
        const d = decodeCompareSide(written, side, cardOf[side], lists);
        return again[side] === s.cardId && allocStr(d.allocation) === allocStr(s.allocation) && d.managerId === s.managerId && d.corrections.length === 0;
      });
      if (!sides.every(Boolean) || again.corrections.length > 0 || again.legacyIds !== null) {
        broke++;
        if (broke <= 3) console.error("  compare fuzz case:", sp.toString(), "→", written.toString());
      }
    } catch (e) {
      threw++;
      if (threw <= 3) console.error("  compare fuzz threw:", sp.toString(), e);
    }
  }
  assert(threw === 0 && broke === 0, "compare fuzz: 300 random queries — never threw; every decoded state was written and read back unchanged with no correction");
}

// 8. Category limit, category set and Max Level changes (D5, D6).
{
  const budget152 = trainingPointsAvailable(77); // Yoneda Shunya: 152 pts
  assert(categoryLimit(emptyAllocation(), "Dribbling", budget152) === CATEGORY_POINT_MAX, "a 152-pt budget would buy more than 25 in one category: the limit stays 25 (the reference's '+' past 25 is not copied)");
  assert(categoryLimit(alloc("4/4/12/9/8/0/0/0/0/0"), "Aerial", trainingPointsAvailable(31)) === 1, "Quaresma at 59/60 pts: Aerial can still take 1 stat point");
  const full = alloc("4/4/12/9/8/1/0/0/0/0"); // 60/60
  assert(setCategoryPoints(full, "Defending", 1, trainingPointsAvailable(31)) === null, "a full budget: + on another category changes nothing");
  const lowered = setCategoryPoints(full, "Dribbling", 3, trainingPointsAvailable(31));
  assert(lowered !== null && lowered.Dribbling === 3 && allocStr(full) === "4/4/12/9/8/1/0/0/0/0", "lowering a category always applies (the input is not mutated)");
  const dragged = setCategoryPoints(emptyAllocation(), "Dribbling", 25, trainingPointsAvailable(31));
  assert(dragged !== null && dragged.Dribbling === 20 && toDisplayPoints(allocationCost(dragged)) === 60, "Quaresma, empty build: the slider dragged to 25 commits 20 (the largest affordable, 60/60 pts)");
  const capped = setCategoryPoints(emptyAllocation(), "Dribbling", 30, budget152);
  assert(capped !== null && capped.Dribbling === 25, "… and never more than 25, however large the budget");
  assert(setCategoryPoints(emptyAllocation(), "Dribbling", -2, budget152) === null && setCategoryPoints(emptyAllocation(), "Dribbling", Number.NaN, budget152) === null, "negative / not-a-number requests change nothing");
  const g10 = defaultAllocation(messiGracias, 10);
  const at9 = allocationForMaxLevel(g10, 9);
  assert(at9.trimmed && allocStr(at9.allocation) === "4/0/5/4/2/0/0/0/0/0", "allocationForMaxLevel: ml 10 → 9 trims Lower Body Strength to 2 (reported)");
  const up = allocationForMaxLevel(g10, 20);
  assert(!up.trimmed && allocStr(up.allocation) === allocStr(g10), "… raising the level keeps the build (nothing reported)");
}

// 9. simulateCardBuild and statBreakdown on a synthetic card (the survey
//    numbers themselves are replayed against the local data by the browser
//    check; the engine's rules are pinned in progression.test.ts).
{
  const flat = (v: number) => Object.fromEntries(Object.keys(zeroStats()).map((s) => [s, v])) as ReturnType<typeof zeroStats>;
  const aptitudes = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
  const base = { id: "1", stats: flat(70), height: 180, weakFootAccuracy: 2, positionAptitudes: aptitudes };
  const hlCard = { ...base, cardType: "HIGHLIGHT" as const, levelCap: 1, registeredPosition: pos("CF"), booster1: null, booster2: null };
  const build = { allocation: alloc("4/0/0/0/0/0/0/0/0/0"), maxLevel: 10, managerProficiency: 80, booster1: "full" as const, booster2: "full" as const };
  const none = { manager: null, second: null };
  const r = simulateCardBuild(hlCard, build, "CF", none);
  assert(r.pointsAvailable === 9 && r.trainingDeltas.finishing === 4 && r.config.managerProficiency === 80, "Highlight cap 1 at Max Level 10: 9 training points (18 pts), Shooting trains, the slider's level applies");
  const withMgr = simulateCardBuild(hlCard, build, "CF", { manager: { rating: 85, pills: ["finishing"] }, second: null });
  assert(withMgr.config.managerProficiency === 85 && withMgr.managerDeltas.finishing === 1 && withMgr.managerDeltas.speed === 0, "a selected manager's rating replaces the slider's level and its pill gets +1");
  const trCard = { ...base, cardType: "TRENDING" as const, levelCap: 1, registeredPosition: pos("RWF"), booster1: STRIKERS_INSTINCT_3, booster2: null };
  const tr = simulateCardBuild(trCard, { ...build, booster1: 1 }, "RWF", { manager: null, second: { stats: { speed: 1 } } });
  assert(Object.values(tr.trainingDeltas).every((v) => v === 0) && tr.pointsAvailable === 0, "Trending: an allocation passed by mistake trains nothing (no categories)");
  assert(tr.boosterDeltas.finishing === 1 && tr.boosterDeltas.speed === 0, "Trending Booster 1 at +1; no second booster on a Trending card");
  const qCard = { ...base, cardType: "EPIC" as const, levelCap: 31, registeredPosition: pos("RWF"), booster1: BALL_CARRYING_4, booster2: EMPTY };
  const q = simulateCardBuild(qCard, { ...build, maxLevel: 31, booster1: 0 }, "RWF", { manager: null, second: { stats: { finishing: 1, acceleration: 1 } } });
  assert(q.boosterDeltas.dribbling === 0 && q.boosterDeltas.finishing === 1 && q.boosterDeltas.acceleration === 1, "Booster 1 off and the chosen second booster applied");
  // Breakdown: every part adds up to the shown value; a stat trained past 99 shows its cut.
  const hot = { ...qCard, stats: { ...flat(70), finishing: 98 } };
  const hotR = simulateCardBuild(hot, { ...build, maxLevel: 31, allocation: alloc("3/0/0/0/0/0/0/0/0/0") }, "RWF", { manager: { rating: 90, pills: ["finishing"] }, second: null });
  const rows = statBreakdown(hotR);
  assert(Object.values(rows).length === 26 && Object.values(rows).every((x) => x.base + x.training + x.cut + x.proficiency + x.boosters + x.manager === x.shown), "statBreakdown: 26 rows, base + training + cut + proficiency + boosters + manager = shown on every stat");
  assert(rows.finishing.training === 3 && rows.finishing.cut === -2 && rows.finishing.proficiency === 0 && rows.finishing.manager === 1 && rows.finishing.shown === 100, "98 trained +3 → cut −2 at 99, then the manager's +1 → 100");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ build tests passed");
