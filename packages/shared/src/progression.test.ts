// Oracle tests for the progression engine (player-progression-simulator; exact
// model since efootbase-exact-model-managers).
// Run: tsx packages/shared/src/progression.test.ts  (pnpm --filter @eflab/shared test)
//
// Two fixtures, numbers only:
//   · `__fixtures__/progression-oracle.json` — 261 cards (20 per position,
//     level cap ≥ 2, plus the one outfield card with a Goalkeeper 1 value)
//     sampled from the eFHUB player export joined to the efootbase dump: base
//     stats, hub max stats, the hub's per-category allocation, level cap,
//     registered position and booster vectors. It pins the training rules
//     (stat map, cost curve, budget) and the Max OVR dynamic programme.
//   · `__fixtures__/exact-model-oracle.json` — five anonymous cards (c1…c5:
//     SS, GK, CB, DMF, CF; c1 is the reference card) measured on efootbase's
//     Progression sheet: height, weak-foot accuracy, aptitudes (0 full, 1 half,
//     2 none), level cap, base stats, both booster vectors, three allocations
//     (A = Reset, C = the survey's second build, M = efootbase's own Max OVR
//     build), efootbase's Max OVR overall by level (`maxOvr`), and 262
//     readings [card, build, level, manager pill stat indices (BASE_STATS
//     order, [] = no manager), 26 displayed stats (BASE_STATS order), 13
//     displayed position tiles (POSITIONS order), displayed overall]. It pins
//     the band table, the manager effect and the overall formula; the tamper
//     tests (section 11) check that the oracle notices any altered constant.
import { readFileSync } from "node:fs";
import {
  BASE_STATS,
  POSITIONS,
  TRAINING_CATEGORIES,
  TRAINING_STATS,
  proficiencyFromAptitude,
  type BaseStat,
  type Position,
  type TrainingCategory,
} from "./constants";
import {
  MANAGER_PROFICIENCY_DEFAULT,
  MANAGER_PROFICIENCY_MAX,
  MANAGER_PROFICIENCY_MIN,
  POINT_DISPLAY_SCALE,
  PROGRESSION_CATEGORY_LABELS,
  addStats,
  allocationCost,
  applyBoosters,
  applyManager,
  applyManagerProficiency,
  applyTraining,
  bestAllocation,
  bestFitPosition,
  categoryCost,
  categoryCostHalf,
  categoryGain,
  clampManagerProficiency,
  cutTrainedStats,
  emptyAllocation,
  exactOvr,
  linearOvrValue,
  managerProficiencyBonus,
  maxGainForBudget,
  nextStatPointCost,
  positionTiles,
  resolveBooster,
  simulateBuild,
  statPointCostHalf,
  toDisplayPoints,
  trainingPointsAvailable,
  zeroStats,
  type BoosterVector,
  type StatVector,
  type TrainingAllocation,
} from "./progression";
import { OVR_MODEL, OVR_TERMS, OVR_WEIGHTS, PROFICIENCY_BANDS, type OvrModel, type ProficiencyBand } from "./ovrModel";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const pct = (n: number, d: number) => `${n}/${d} = ${((100 * n) / Math.max(1, d)).toFixed(2)}%`;

interface FixtureCard {
  pos: number;
  levelCap: number;
  ovr: number;
  efMaxOvr: number | null;
  base: number[];
  max: number[];
  alloc: number[];
  b1: number | null;
  b2: number | null;
  alt: Array<[number, number, number]>;
}
interface Fixture {
  cards: FixtureCard[];
  boosters: Record<string, BoosterVector>;
}

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/progression-oracle.json", import.meta.url), "utf8"),
) as Fixture;
const cards = fixture.cards;
const boosterTable = new Map<number, { stats: BoosterVector }>(
  Object.entries(fixture.boosters).map(([id, stats]) => [Number(id), { stats }]),
);
const toStats = (arr: number[]): StatVector =>
  Object.fromEntries(BASE_STATS.map((s, i) => [s, arr[i] ?? 0])) as StatVector;
const toAlloc = (arr: number[]): TrainingAllocation =>
  Object.fromEntries(TRAINING_CATEGORIES.map((c, i) => [c, arr[i] ?? 0])) as TrainingAllocation;
const allocArr = (a: TrainingAllocation): number[] => TRAINING_CATEGORIES.map((c) => a[c]);
const posOf = (c: FixtureCard): Position => POSITIONS[c.pos] ?? "GK";

assert(cards.length >= 200, `fixture has ≥ 200 cards (${cards.length})`);
assert(POSITIONS.every((p) => cards.some((c) => posOf(c) === p)), "fixture covers all 13 positions");

// ---------------------------------------------------------------- 1. stat map
// hub MAX<stat> − <stat> equals the sum of the allocations of the categories
// that contain the stat — one category for 25 stats, two for Jump (Aerial
// Strength + Goalkeeper 1; change jump-from-gk1) — on every card, goalkeepers
// included.
{
  assert(TRAINING_STATS.Aerial.includes("jump") && TRAINING_STATS.GK1.includes("jump"), "Jump is listed under Aerial Strength and under Goalkeeper 1");
  assert(TRAINING_STATS.GK1.length === 2 && TRAINING_STATS.GK1.includes("gkAwareness"), "Goalkeeper 1 raises GK Awareness and Jump, nothing else");
  const multi = BASE_STATS.filter((s) => TRAINING_CATEGORIES.filter((cat) => TRAINING_STATS[cat].includes(s)).length > 1);
  assert(multi.length === 1 && multi[0] === "jump", `Jump is the only stat in two categories (got ${JSON.stringify(multi)})`);
  const catsOf = (s: BaseStat) => TRAINING_CATEGORIES.filter((cat) => TRAINING_STATS[cat].includes(s));
  assert(BASE_STATS.every((s) => catsOf(s).length >= 1), "every one of the 26 stats is trained by at least one category");

  let exact = 0;
  const wrongStats = new Map<BaseStat, number>();
  for (const c of cards) {
    const base = toStats(c.base);
    const max = toStats(c.max);
    const alloc = toAlloc(c.alloc);
    let ok = true;
    for (const s of BASE_STATS) {
      const expected = catsOf(s).reduce((sum, cat) => sum + alloc[cat], 0);
      if (max[s] - base[s] !== expected) {
        ok = false;
        wrongStats.set(s, (wrongStats.get(s) ?? 0) + 1);
      }
    }
    if (ok) exact++;
  }
  assert(exact === cards.length, `stat map exact on ${pct(exact, cards.length)} cards, all 26 stats (mismatches: ${JSON.stringify([...wrongStats])})`);

  const gks = cards.filter((c) => posOf(c) === "GK");
  const gkWithGk1 = gks.filter((c) => toAlloc(c.alloc).GK1 > 0);
  assert(gkWithGk1.length >= 15, `fixture goalkeepers with Goalkeeper 1 points: ${gkWithGk1.length} of ${gks.length} (≥ 15 required)`);
  const gkSum = gkWithGk1.filter((c) => { const a = toAlloc(c.alloc); return toStats(c.max).jump - toStats(c.base).jump === a.Aerial + a.GK1; }).length;
  assert(gkSum === gkWithGk1.length, `goalkeeper Jump lift = Aerial + Goalkeeper 1 on ${pct(gkSum, gkWithGk1.length)} cards`);

  const outfieldGk1 = cards.filter((c) => posOf(c) !== "GK" && toAlloc(c.alloc).GK1 > 0);
  assert(outfieldGk1.length === 1 && posOf(outfieldGk1[0]!) === "DMF", `the fixture carries the one outfield card with Goalkeeper 1 points (${outfieldGk1.length})`);
  {
    const a = toAlloc(outfieldGk1[0]!.alloc);
    assert(applyTraining(a).jump === 9 && applyTraining(a).gkAwareness === 1, "that card's Aerial 8 + Goalkeeper 1 1 → Jump +9, GK Awareness +1");
  }

  let reproduced = 0;
  for (const c of cards) {
    const projected = addStats(toStats(c.base), applyTraining(toAlloc(c.alloc)));
    if (BASE_STATS.every((s) => projected[s] === toStats(c.max)[s])) reproduced++;
  }
  assert(reproduced === cards.length, `applyTraining reproduces hub max stats on ${pct(reproduced, cards.length)} cards, goalkeepers included`);
}

// ---------------------------------------------------------------- 2. cost curve
{
  const expected: Array<[number, number]> = [[0, 0], [1, 0.5], [2, 1], [4, 2], [5, 3], [8, 6], [12, 12], [16, 20], [20, 30], [22, 36]];
  for (const [g, cost] of expected) assert(categoryCost(g) === cost, `categoryCost(${g}) = ${cost} (got ${categoryCost(g)})`);
  assert(categoryCostHalf(22) === 72, "categoryCostHalf(22) = 72 half-points");
  for (let n = 1; n <= 4; n++) assert(statPointCostHalf(n) === 1, `stat point ${n} costs 0.5`);
  assert(statPointCostHalf(5) === 2 && statPointCostHalf(8) === 2 && statPointCostHalf(9) === 3, "points 5–8 cost 1, point 9 costs 1.5");
  assert(nextStatPointCost(0) === 0.5 && nextStatPointCost(4) === 1 && nextStatPointCost(8) === 1.5, "next cost at 0 / 4 / 8 points is 0.5 / 1 / 1.5");
  let tiersOk = 0;
  for (let g = 1; g <= 60; g++) if (categoryCostHalf(g) - categoryCostHalf(g - 1) === statPointCostHalf(g)) tiersOk++;
  assert(tiersOk === 60, `cumulative cost adds the nth point's cost for n = 1..60 (${tiersOk}/60)`);
  assert(maxGainForBudget(0) === 0 && maxGainForBudget(0.5) === 1 && maxGainForBudget(2) === 4 && maxGainForBudget(6) === 8 && maxGainForBudget(36) === 22 && maxGainForBudget(49) === 26,
    "maxGainForBudget: 0→0, 0.5→1, 2→4, 6→8, 36→22, 49→26");
}

// ---------------------------------------------------------------- 2b. displayed unit + labels
{
  assert(POINT_DISPLAY_SCALE === 2, "display unit is twice the engine unit");
  assert(toDisplayPoints(trainingPointsAvailable(32)) === 62, `level-32 budget displays as 62 pts (got ${toDisplayPoints(trainingPointsAvailable(32))})`);
  const full32 = bestAllocation("SS", trainingPointsAvailable(32));
  assert(toDisplayPoints(allocationCost(full32)) === 62, `a fully spent level-32 build displays as 62/62 pts (got ${toDisplayPoints(allocationCost(full32))})`);
  assert(toDisplayPoints(nextStatPointCost(0)) === 1 && toDisplayPoints(nextStatPointCost(4)) === 2 && toDisplayPoints(nextStatPointCost(8)) === 3, "stat points 1–4 / 5 / 9 cost 1 / 2 / 3 displayed points");
  assert(toDisplayPoints(trainingPointsAvailable(28)) === 54 && toDisplayPoints(trainingPointsAvailable(27)) === 52, "level 28 → 54 pts, level 27 → 52 pts (as measured on efootbase)");
  const expectedLabels: Record<TrainingCategory, string> = {
    Shooting: "Shooting", Passing: "Passing", Dribbling: "Dribbling", Dexterity: "Dexterity",
    LowerBody: "Lower Body Strength", Aerial: "Aerial Strength", Defending: "Defending",
    GK1: "Goalkeeper 1", GK2: "Goalkeeper 2", GK3: "Goalkeeper 3",
  };
  assert(TRAINING_CATEGORIES.every((cat) => PROGRESSION_CATEGORY_LABELS[cat] === expectedLabels[cat]), "category labels exactly as efootbase prints them");
  assert(MANAGER_PROFICIENCY_MIN === 70 && MANAGER_PROFICIENCY_MAX === 90 && MANAGER_PROFICIENCY_DEFAULT === 90, "Manager Proficiency constants: range 70–90, default 90");
  assert(clampManagerProficiency(60) === 70 && clampManagerProficiency(95) === 90 && clampManagerProficiency(Number.NaN) === 90 && clampManagerProficiency(undefined) === 90 && clampManagerProficiency(84.6) === 85,
    "clampManagerProficiency: 60→70, 95→90, NaN/undefined→90 (default), 84.6→85");
}

// ---------------------------------------------------------------- 3. budget invariant
{
  let ok = 0;
  for (const c of cards) if (allocationCost(toAlloc(c.alloc)) === trainingPointsAvailable(c.levelCap)) ok++;
  assert(ok === cards.length, `Σ cost(allocation) = levelCap − 1 on ${pct(ok, cards.length)} cards`);
  assert(trainingPointsAvailable(1) === 0 && trainingPointsAvailable(0) === 0 && trainingPointsAvailable(31) === 30 && trainingPointsAvailable(50) === 49,
    "trainingPointsAvailable: 1→0, 0→0, 31→30, 50→49");
}

// ---------------------------------------------------------------- 4. Max OVR (DP) on the exact weights
{
  const w = (p: Position, s: BaseStat) => OVR_WEIGHTS[p][s];
  const gainOf = (p: Position, cat: TrainingCategory) => TRAINING_STATS[cat].reduce((sum, st) => sum + w(p, st), 0);
  // Independent reference: a top-down knapsack over (category, half-points left).
  const referenceBest = (p: Position, budgetHalf: number): number => {
    const memo = new Map<number, number>();
    const go = (i: number, left: number): number => {
      if (i === TRAINING_CATEGORIES.length) return 0;
      const key = i * 4096 + left;
      const hit = memo.get(key);
      if (hit !== undefined) return hit;
      const gain = gainOf(p, TRAINING_CATEGORIES[i]!);
      let best = Number.NEGATIVE_INFINITY;
      for (let g = 0; categoryCostHalf(g) <= left; g++) best = Math.max(best, gain * g + go(i + 1, left - categoryCostHalf(g)));
      memo.set(key, best);
      return best;
    };
    return go(0, budgetHalf);
  };
  let withinBudget = 0, atLeastReference = 0, matchesReference = 0, linearObjective = 0, gkChecked = 0, outfieldGk1 = 0, outfield = 0;
  for (const c of cards) {
    const p = posOf(c);
    const budget = trainingPointsAvailable(c.levelCap);
    const best = bestAllocation(p, budget);
    const base = toStats(c.base);
    if (allocationCost(best) <= budget) withinBudget++;
    // Spec "Optimal allocation": linear part of the formula (in overall units)
    // at the preset ≥ that of the hub's own allocation − 0.8.
    const vBest = linearOvrValue(p, addStats(base, applyTraining(best))) / OVR_MODEL.sumDivisor;
    const vRef = linearOvrValue(p, addStats(base, applyTraining(toAlloc(c.alloc)))) / OVR_MODEL.sumDivisor;
    if (vBest >= vRef - 0.8) atLeastReference++;
    const dpValue = TRAINING_CATEGORIES.reduce((s, cat) => s + gainOf(p, cat) * best[cat], 0);
    if (dpValue === referenceBest(p, Math.round(budget * 2))) matchesReference++;
    if (linearOvrValue(p, addStats(base, applyTraining(best))) - linearOvrValue(p, base) === dpValue) linearObjective++;
    if (p === "GK") gkChecked++;
    else { outfield++; if (best.GK1 > 0) outfieldGk1++; }
  }
  assert(withinBudget === cards.length, `bestAllocation never exceeds the budget: ${pct(withinBudget, cards.length)}`);
  assert(atLeastReference === cards.length, `bestAllocation's linear value ≥ the hub allocation's − 0.8 OVR: ${pct(atLeastReference, cards.length)}`);
  assert(matchesReference === cards.length && gkChecked >= 20, `bestAllocation value equals an independent knapsack optimum on ${pct(matchesReference, cards.length)} cards (${gkChecked} goalkeepers)`);
  assert(linearObjective === cards.length, `DP objective = linear lift of the projected stats through the combined table on ${pct(linearObjective, cards.length)} cards`);
  // Reported, not asserted: efootbase marks Goalkeeper 1–3 as goalkeeper
  // categories; our DP may still buy Goalkeeper 1 for an outfield card when
  // Jump's weight makes it the best last point.
  console.log(`  outfield fixture cards whose Max OVR build buys Goalkeeper 1: ${outfieldGk1}/${outfield}`);
  let sweepOk = 0, sweepN = 0;
  for (const p of POSITIONS) for (let b = 0; b <= 40; b++) {
    sweepN++;
    const best = bestAllocation(p, b);
    const v = TRAINING_CATEGORIES.reduce((s, cat) => s + gainOf(p, cat) * best[cat], 0);
    if (allocationCost(best) <= b && v === referenceBest(p, b * 2)) sweepOk++;
  }
  assert(sweepOk === sweepN, `bestAllocation matches the reference on ${pct(sweepOk, sweepN)} (position, budget) pairs`);
  assert(categoryGain("GK", "GK1") === w("GK", "gkAwareness") + w("GK", "jump"), `GK1 gain at GK = w(GK Awareness) + w(Jump) = ${categoryGain("GK", "GK1")}`);
  const best49 = bestAllocation("CF", 49);
  assert(allocationCost(best49) <= 49, `Max OVR on a striker with budget 49 ("98 pts") spends ${allocationCost(best49)} ≤ 49`);
  assert(best49.GK2 === 0 && best49.GK3 === 0, "CF Max OVR spends nothing on Goalkeeper 2 / 3 (zero gain)");
  assert(TRAINING_CATEGORIES.every((cat) => bestAllocation("GK", 0)[cat] === 0), "budget 0 → empty allocation");
}

// ---------------------------------------------------------------- 5. simulateBuild / edge cases
{
  const base = toStats(cards[0]!.base);
  const body = { height: 180, weakFootAccuracy: 2 };
  const config = (over: Partial<Parameters<typeof simulateBuild>[0]["config"]> = {}) => ({
    playerId: "1", maxLevel: 31, position: "CF" as Position, trainingPoints: emptyAllocation(), boosters: [true, false] as [boolean, boolean], managerProficiency: 70, ...over,
  });
  const sim = (over: Partial<Parameters<typeof simulateBuild>[0]["config"]> = {}, extra: Partial<Parameters<typeof simulateBuild>[0]> = {}) =>
    simulateBuild({ base, levelCap: 31, ...body, config: config(over), boosters: [null, null], ...extra });

  const l1 = simulateBuild({ base, levelCap: 1, ...body, config: config({ maxLevel: 1 }), boosters: [null, null] });
  assert(l1.pointsAvailable === 0 && l1.remainingPoints === 0 && l1.withinBudget, "level cap 1 → 0 training points");
  const clamped = simulateBuild({ base, levelCap: 10, ...body, config: config({ maxLevel: 31 }), boosters: [null, null] });
  assert(clamped.config.maxLevel === 10 && clamped.pointsAvailable === 9, "maxLevel above the level cap is clamped (10 → 9 points)");

  const sh = sim({ trainingPoints: { ...emptyAllocation(), Shooting: 4 } });
  assert(sh.trainingDeltas.finishing === 4 && sh.trainingDeltas.placeKicking === 4 && sh.trainingDeltas.curl === 4, "Shooting 4 → Finishing/Place Kicking/Curl +4");
  assert(BASE_STATS.filter((s) => sh.trainingDeltas[s] !== 0).length === 3, "Shooting changes no other stat");
  assert(sh.pointsUsed === 2 && sh.remainingPoints === 28, `Shooting 4 costs 2 of 30 points (used ${sh.pointsUsed}, left ${sh.remainingPoints})`);
  const over = sim({ trainingPoints: { ...emptyAllocation(), Shooting: 22, Passing: 2 } });
  assert(!over.withinBudget && over.remainingPoints === -7, "37 points on a 30-point budget is flagged (remaining −7)");

  const boosted = cards.find((c) => c.b1 != null && c.b1 > 0 && boosterTable.has(c.b1) && Object.keys(boosterTable.get(c.b1)!.stats).length < BASE_STATS.length)!;
  const b1 = resolveBooster(boosted.b1, boosterTable);
  assert(b1 !== null && Object.keys(b1.stats).length > 0, `booster id ${boosted.b1} resolves to a non-empty vector`);
  assert(resolveBooster(0, boosterTable) === null && resolveBooster(null, boosterTable) === null && resolveBooster(999999, boosterTable) === null, "ids 0 / null / unknown resolve to null");
  const b2Stat = BASE_STATS.find((s) => b1!.stats[s] === undefined)!;
  const b2 = { stats: { [b2Stat]: 4 } as BoosterVector };
  const b1Stat = Object.keys(b1!.stats)[0] as BaseStat;
  const r1 = sim({}, { boosters: [b1, b2] });
  assert(r1.boosterDeltas[b1Stat] === b1!.stats[b1Stat] && r1.boosterDeltas[b2Stat] === 0, "Booster 1 applied when on, Booster 2 not when off");
  const r2 = sim({ boosters: [true, true] }, { boosters: [b1, b2] });
  assert(r2.boosterDeltas[b2Stat] === 4 && r2.projectedStats[b2Stat] === base[b2Stat] + 4, "Booster 2 toggled → its vector is added (projected = base + boosters at proficiency 70)");
  const r3 = sim({ boosters: [false, false] }, { boosters: [b1, b2] });
  assert(BASE_STATS.every((s) => r3.boosterDeltas[s] === 0), "both boosters off → no booster delta");

  // A stat trained past 99 is cut to 99 before the boosters (efootbase's
  // client: min(99, base + training + bonus), then boosters, then the
  // manager's +1); the bonus never applies there. No measured reading trains
  // a stat past 99 (the highest is exactly 99), so these synthetic cases pin
  // the rule: keeping the trained value above 99 must fail them.
  {
    const hi = { ...base, finishing: 98, curl: 97, placeKicking: 95 };
    const shooting4 = { ...emptyAllocation(), Shooting: 4 };
    const r4 = simulateBuild({ base: hi, levelCap: 31, ...body, config: config({ trainingPoints: shooting4, managerProficiency: 90 }), boosters: [null, null] });
    assert(r4.projectedStats.finishing === 99 && r4.trainingDeltas.finishing === 4 && r4.capDeltas.finishing === -3 && r4.proficiencyDeltas.finishing === 0,
      "98 + 4 training at proficiency 90 → 99 (cut −3, no bonus at 99+); trainingDeltas keep the 4 points bought");
    assert(r4.projectedStats.curl === 99 && r4.capDeltas.curl === -2 && r4.projectedStats.placeKicking === 99 && r4.capDeltas.placeKicking === 0,
      "97 + 4 → 99 (cut −2); 95 + 4 = 99 exactly → 99, nothing cut");
    const fBoost = { stats: { finishing: 2, curl: 1 } as BoosterVector };
    const r5 = simulateBuild({
      base: hi, levelCap: 31, ...body, config: config({ trainingPoints: shooting4, managerProficiency: 90, boosters: [true, false] }), boosters: [fBoost, null],
      manager: { stats: ["finishing"] },
    });
    assert(r5.projectedStats.finishing === 102 && r5.projectedStats.curl === 100,
      "98 + 4 training + Booster +2 + manager +1 → 99 + 2 + 1 = 102 (only boosters and the manager pass 99); 97 + 4 + Booster +1 → 100");
    const sumOk = BASE_STATS.every((s) => r5.projectedStats[s] === hi[s] + r5.trainingDeltas[s] + r5.capDeltas[s] + r5.proficiencyDeltas[s] + r5.boosterDeltas[s] + r5.managerDeltas[s]);
    assert(sumOk && BASE_STATS.every((s) => r5.capDeltas[s] <= 0), "projected = base + training + cut + bonus + boosters + manager on every stat; the cut is never positive");
    // What the stat-grid tooltip derives as "base" (value minus every part) is the real base.
    assert(r5.projectedStats.finishing - r5.trainingDeltas.finishing - r5.capDeltas.finishing - r5.proficiencyDeltas.finishing - r5.boosterDeltas.finishing - r5.managerDeltas.finishing === 98,
      "tooltip arithmetic: 102 − 4 training + 3 cut − 0 bonus − 2 booster − 1 manager = base 98");
    // Below 99 nothing changes: base 80 + 4 at 90 → 84 + band 3 = 87, no cut.
    const lo = simulateBuild({ base: { ...base, finishing: 80 }, levelCap: 31, ...body, config: config({ trainingPoints: shooting4, managerProficiency: 90 }), boosters: [null, null] });
    assert(lo.projectedStats.finishing === 87 && lo.capDeltas.finishing === 0, "80 + 4 training at proficiency 90 → 84 + 3 = 87, nothing cut");
    // Inverse tamper: keeping the trained value above 99 (the engine before
    // this rule) must disagree with the pinned cases.
    const keep = (s: BaseStat) => hi[s] + r4.trainingDeltas[s] + managerProficiencyBonus(90, hi[s] + r4.trainingDeltas[s]);
    assert(keep("finishing") !== r4.projectedStats.finishing && keep("curl") !== r4.projectedStats.curl,
      `tamper "trained stat kept above 99" is detected (finishing ${keep("finishing")} vs 99, curl ${keep("curl")} vs 99)`);
  }

  // Jump from two categories (Aerial + GK1), goalkeepers and outfield cards alike.
  const gkBase = toStats(cards.find((c) => posOf(c) === "GK")!.base);
  const gkSim = (tp: Partial<TrainingAllocation>) => simulateBuild({ base: gkBase, levelCap: 31, ...body, config: config({ position: "GK", trainingPoints: { ...emptyAllocation(), ...tp } }), boosters: [null, null] });
  const gkAerial = gkSim({ Aerial: 3 });
  assert(gkAerial.trainingDeltas.heading === 3 && gkAerial.trainingDeltas.physicalContact === 3 && gkAerial.trainingDeltas.jump === 3 && gkAerial.projectedStats.jump === gkBase.jump + 3, "GK Aerial 3 → Heading/Physical Contact/Jump +3, Jump projected");
  const gk1Only = gkSim({ GK1: 12 });
  assert(gk1Only.trainingDeltas.gkAwareness === 12 && gk1Only.trainingDeltas.jump === 12 && BASE_STATS.filter((s) => gk1Only.trainingDeltas[s] !== 0).length === 2, "GK buying only Goalkeeper 1 (12) → GK Awareness and Jump +12, nothing else");
  const both = gkSim({ Aerial: 6, GK1: 6 });
  assert(both.trainingDeltas.jump === 12 && both.trainingDeltas.heading === 6 && both.trainingDeltas.gkAwareness === 6, "Aerial 6 + Goalkeeper 1 6 → Jump +12, Heading +6, GK Awareness +6");

  // The overall is the tile at the configured position; no aptitudes → full everywhere.
  const asCmf = sim({ position: "CMF" });
  assert(asCmf.overall === exactOvr("CMF", asCmf.projectedStats, body) && asCmf.proficiency === "full" && asCmf.overall === asCmf.tiles.CMF, "without aptitudes the overall is the full-proficiency formula and equals the tile");
  const apt = Object.fromEntries(POSITIONS.map((p) => [p, 2])) as Record<Position, number>;
  apt.CF = 0; apt.SS = 1;
  const atHalf = sim({ position: "SS" }, { positionAptitudes: apt });
  assert(atHalf.proficiency === "half" && atHalf.overall === exactOvr("SS", atHalf.projectedStats, body, "half") && atHalf.overall < exactOvr("SS", atHalf.projectedStats, body), "half proficiency → the formula with every stat scaled by 0.97 (below the full value)");
  const atNone = sim({ position: "AMF" }, { positionAptitudes: apt });
  assert(atNone.proficiency === "none" && atNone.overall === exactOvr("AMF", atNone.projectedStats, body, "none"), "no proficiency → the formula with the 0.85 scaling");
  const outfieldBase = toStats(cards.find((c) => posOf(c) === "CF")!.base);
  assert(sim({ position: "GK" }, { base: outfieldBase, positionAptitudes: apt }).overall === 40, "outfield card at GK (no proficiency) → 40");
  // Floor and ceiling of the formula.
  const all = (v: number) => Object.fromEntries(BASE_STATS.map((s) => [s, v])) as StatVector;
  assert(exactOvr("CB", all(1), { height: 150, weakFootAccuracy: 0 }) === 40, "a weighted sum below 40 reads 40");
  assert(exactOvr("CF", all(250), { height: 210, weakFootAccuracy: 3 }) === 127, "a weighted sum above 127 reads 127");
  // The 255 limit of a scaled stat, pinned away from the 127 ceiling: one
  // heavily weighted stat (CF finishing, weight 358) on an otherwise plain
  // card. 300 must read like 255 (limit present), 255 must read above 200
  // (limit not lowered to 200 or 120), and the result stays below 127 even
  // without the limit (300 unclamped would read 121), so the ceiling cannot
  // mask a missing clamp.
  {
    const plain = (finishing: number) => ({ ...all(40), finishing });
    const cfBody = { height: 180, weakFootAccuracy: 2 };
    const v200 = exactOvr("CF", plain(200), cfBody), v255 = exactOvr("CF", plain(255), cfBody), v300 = exactOvr("CF", plain(300), cfBody);
    assert(v300 === v255 && v255 > v200 && v255 < 127, `a scaled stat is limited to 255: finishing 300 reads ${v300} = 255's ${v255} (> 200's ${v200}, below the 127 ceiling)`);
  }
  // Best Fit: highest tile, registered position on ties.
  const tiles = Object.fromEntries(POSITIONS.map((p) => [p, 80])) as Record<Position, number>;
  assert(bestFitPosition(tiles, "CF") === "CF" && bestFitPosition({ ...tiles, AMF: 81 }, "CF") === "AMF", "bestFitPosition: highest tile, registered position wins a tie");
}

// ================================================================ exact model
interface ExactCard {
  pos: number; height: number; wf: number; levelCap: number; apt: number[]; base: number[]; b1: number[]; b2: number[];
  builds: Record<"A" | "C" | "M", number[]>; maxOvr: Array<[number, number]>;
}
type Reading = [string, "A" | "C", number, number[], number[], number[], number];
const exact = JSON.parse(readFileSync(new URL("./__fixtures__/exact-model-oracle.json", import.meta.url), "utf8")) as { cards: Record<string, ExactCard>; readings: Reading[] };
const ex = exact.cards;
const readings = exact.readings;
const sparse = (v: number[]): BoosterVector => Object.fromEntries(BASE_STATS.flatMap((s, i) => ((v[i] ?? 0) !== 0 ? [[s, v[i]!]] : []))) as BoosterVector;
const aptOf = (c: ExactCard) => Object.fromEntries(POSITIONS.map((p, i) => [p, c.apt[i]!])) as Record<Position, number>;
const bodyOf = (c: ExactCard) => ({ height: c.height, weakFootAccuracy: c.wf });
const pillsOf = (idx: number[]): BaseStat[] => idx.map((i) => BASE_STATS[i]!);
const simExact = (c: ExactCard, alloc: number[] | TrainingAllocation, level: number, pills: number[], position: Position = POSITIONS[c.pos]!) =>
  simulateBuild({
    base: toStats(c.base), levelCap: c.levelCap, height: c.height, weakFootAccuracy: c.wf,
    config: { playerId: "x", maxLevel: c.levelCap, position, trainingPoints: Array.isArray(alloc) ? toAlloc(alloc) : alloc, boosters: [true, true], managerProficiency: level },
    boosters: [{ stats: sparse(c.b1) }, { stats: sparse(c.b2) }], positionAptitudes: aptOf(c), manager: pills.length ? { stats: pillsOf(pills) } : null,
  });

// ---------------------------------------------------------------- 6. fixture shape (numbers only)
{
  const ids = Object.keys(ex);
  assert(ids.length === 5 && ids.every((id, i) => id === `c${i + 1}`), `exact fixture: five anonymous cards c1…c5 (${ids.join(", ")})`);
  const strings: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") strings.push(`${path}=${v}`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(exact, "");
  const allowed = new Set(["c1", "c2", "c3", "c4", "c5", "A", "C"]);
  assert(strings.every((s) => allowed.has(s.split("=")[1]!)), `exact fixture holds no text besides card ids and build letters (${strings.filter((s) => !allowed.has(s.split("=")[1]!)).slice(0, 3).join("; ") || "ok"})`);
  const lines = readFileSync(new URL("./__fixtures__/exact-model-oracle.json", import.meta.url), "utf8").split("\n").length;
  assert(lines <= 301, `exact fixture is at most 300 lines (${lines - 1})`);
  assert(POSITIONS[ex.c1!.pos] === "SS" && Object.values(ex).some((c) => POSITIONS[c.pos] === "GK"), "c1 (reference card) is an SS; a goalkeeper is among the cards");
  const mgrReads = readings.filter((r) => r[3].length > 0);
  assert(readings.length >= 250 && mgrReads.length >= 40, `exact fixture: ${readings.length} readings, ${mgrReads.length} with a manager`);
  const levels = new Set(readings.filter((r) => r[3].length === 0).map((r) => r[2]));
  assert(levels.size === 21, `baseline readings cover all 21 levels 70–90 (${levels.size})`);
}

// ---------------------------------------------------------------- 7. band table
{
  // Data integrity: 70–90 present, 70–76 empty, bands ascending and disjoint, bonus 1–3, never above 98.
  let ok = true;
  for (let level = 70; level <= 90; level++) {
    const t = PROFICIENCY_BANDS[level];
    if (!t) { ok = false; continue; }
    if (level <= 76 && t.length !== 0) ok = false;
    for (let i = 0; i < t.length; i++) {
      const b = t[i]!;
      if (b.min > b.max || b.max > 98 || b.bonus < 1 || b.bonus > 3 || (i > 0 && b.min !== t[i - 1]!.max + 1) || (i > 0 && b.bonus !== t[i - 1]!.bonus + 1)) ok = false;
    }
  }
  assert(ok, "band table: levels 70–90, 70–76 empty, contiguous ascending bands of bonus 1, 2(, 3), all ≤ 98");
  // Spec scenarios.
  const at = (level: number, s: number) => managerProficiencyBonus(level, s);
  assert(at(90, 40) === 1 && at(90, 55) === 1 && at(90, 56) === 2 && at(90, 82) === 2 && at(90, 83) === 3 && at(90, 96) === 3 && at(90, 99) === 0 && at(90, 104) === 0, "level 90: 40–55 → 1, 56–82 → 2, 83–98 → 3, 99+ → 0");
  assert(at(90, 80) === 2 && at(90, 83) === 3, "level 90: 80 → 82 and 83 → 86 before boosters");
  assert(at(86, 57) === 1 && at(86, 58) === 2 && at(86, 89) === 2 && at(86, 90) === 3, "level 86: 40–57 → 1, 58–89 → 2, 90–98 → 3 (an ordinary level)");
  assert(at(90, 39) === 0 && at(77, 47) === 0 && at(77, 48) === 1, "below the first band the bonus is 0 (39 at 90, 47 at 77)");
  assert(at(90, 98) === 1 && at(77, 98) === 1 && at(84, 97) === 2, "the bonus is limited so the stat stops at 99 (98 + 3 → 99)");
  let zero = 0, n = 0;
  for (let level = 70; level <= 76; level++) for (let s = 1; s <= 120; s++) { n++; if (at(level, s) === 0) zero++; }
  assert(zero === n, `levels 70–76 give no bonus to any stat (${zero}/${n})`);
  // Every level × s = 40..98 against an independent reading of the table.
  let cellsOk = 0, cellsN = 0;
  for (let level = 70; level <= 90; level++) for (let s = 40; s <= 98; s++) {
    cellsN++;
    const band = (PROFICIENCY_BANDS[level] ?? []).find((b) => s >= b.min && s <= b.max);
    if (at(level, s) === Math.min(99 - s, band?.bonus ?? 0)) cellsOk++;
  }
  assert(cellsOk === cellsN, `bonus = table lookup capped at 99 for every level 70–90 × s 40–98 (${cellsOk}/${cellsN})`);
  // Measured cells: trained stat + bonus + boosters = the displayed stat on every no-manager reading.
  let mOk = 0, mN = 0;
  for (const [id, b, level, pills, shown] of readings) {
    if (pills.length) continue;
    const c = ex[id]!;
    const trained = addStats(toStats(c.base), applyTraining(toAlloc(c.builds[b])));
    const boost = applyBoosters([{ stats: sparse(c.b1) }, { stats: sparse(c.b2) }], [true, true]);
    BASE_STATS.forEach((s, i) => { mN++; if (Math.min(99, trained[s] + at(level, trained[s])) + boost[s] === shown[i]) mOk++; });
  }
  assert(mOk === mN && mN >= 5000, `band table reproduces every measured no-manager cell: ${pct(mOk, mN)}`);
}

// ---------------------------------------------------------------- 8. the formula against every reading
{
  let n = 0, statsOk = 0, cells = 0, ovrOk = 0, regTiles = 0, regOk = 0, otherTiles = 0, otherOk = 0, gkN = 0, gkOk = 0;
  const miss: string[] = [];
  for (const [id, b, level, pills, shown, tiles, ovr] of readings) {
    const c = ex[id]!;
    const pos = POSITIONS[c.pos]!;
    const r = simExact(c, c.builds[b], level, pills);
    n++;
    BASE_STATS.forEach((s, i) => { cells++; if (r.projectedStats[s] === shown[i]) statsOk++; else if (miss.length < 5) miss.push(`${id} ${b} ${level} ${s} ${r.projectedStats[s]} vs ${shown[i]}`); });
    if (r.overall === ovr) ovrOk++; else if (miss.length < 5) miss.push(`${id} ${b} ${level} overall ${r.overall} vs ${ovr}`);
    if (pos === "GK") { gkN++; if (r.overall === ovr) gkOk++; }
    POSITIONS.forEach((p, i) => {
      // The formula on the RECORDED stats, so the tile check does not lean on the stat pipeline.
      const v = exactOvr(p, toStats(shown), bodyOf(c), proficiencyFromAptitude(c.apt[i]));
      if (p === pos) { regTiles++; if (v === tiles[i] && v === ovr) regOk++; }
      else { otherTiles++; if (v === tiles[i]) otherOk++; }
    });
    if (POSITIONS.some((p, i) => r.tiles[p] !== tiles[i]) && miss.length < 5) miss.push(`${id} ${b} ${level} engine tiles differ`);
  }
  assert(statsOk === cells, `engine reproduces every displayed stat: ${pct(statsOk, cells)}${miss.length ? ` (${miss.join("; ")})` : ""}`);
  assert(ovrOk === n, `engine overall = efootbase's displayed overall on ${pct(ovrOk, n)} readings`);
  assert(gkN >= 40 && gkOk === gkN, `… goalkeeper readings: ${pct(gkOk, gkN)}`);
  assert(regOk === regTiles, `formula on the recorded stats = the registered-position tile and the overall: ${pct(regOk, regTiles)}`);
  assert(otherOk === otherTiles && otherTiles === n * 12, `formula = the other 12 position tiles (aptitude scaling): ${pct(otherOk, otherTiles)}`);
  // positionTiles is the same function the web uses for the Pitch Map and the compare page.
  const [id0, b0, l0, p0] = readings[0]!;
  const c0 = ex[id0]!;
  const r0 = simExact(c0, c0.builds[b0], l0, p0);
  assert(POSITIONS.every((p) => positionTiles(r0.projectedStats, bodyOf(c0), aptOf(c0))[p] === r0.tiles[p]), "positionTiles(final stats) = BuildResult.tiles");
  // The scaled stats include defensive engagement and the goalkeeper stats, not height or weak foot.
  assert(OVR_TERMS.length === 28 && new Set(OVR_TERMS).size === 28 && POSITIONS.every((p) => OVR_TERMS.every((t) => Number.isInteger(OVR_WEIGHTS[p][t]))), "weight table: 13 positions × 28 named integer terms");
}

// ---------------------------------------------------------------- 9. manager rule
{
  const mgrReads = readings.filter((r) => r[3].length > 0);
  let deltaOk = 0, deltaN = 0, lowered = 0, above99 = 0, above99Ok = 0, single = 0;
  for (const [id, b, level, pills, shown] of mgrReads) {
    const c = ex[id]!;
    if (pills.length === 1) single++;
    // The same build and level without the manager, through the engine.
    const plain = simExact(c, c.builds[b], level, []);
    const at90 = simExact(c, c.builds[b], 90, []);
    BASE_STATS.forEach((s, i) => {
      deltaN++;
      const want = plain.projectedStats[s] + (pills.includes(i) ? 1 : 0);
      if (shown[i] === want) deltaOk++;
      if (pills.includes(i) && plain.projectedStats[s] >= 99) { above99++; if (shown[i] === plain.projectedStats[s] + 1) above99Ok++; }
    });
    if (level < 90 && BASE_STATS.some((s, i) => !pills.includes(i) && shown[i]! < at90.projectedStats[s])) lowered++;
  }
  assert(deltaOk === deltaN, `manager = the plain result at its rating + 1 on each pill stat, nothing else: ${pct(deltaOk, deltaN)}`);
  assert(single > 0, `single-pill managers are in the fixture (${single} readings) and get one +1`);
  assert(above99 > 0 && above99Ok === above99, `a pill stat already at 99+ still gains +1: ${pct(above99Ok, above99)}`);
  assert(lowered > 0, `a manager rated below 90 shows lower stats than the plain result at 90 (${lowered} readings)`);
  assert(new Set(mgrReads.map((r) => r[2])).has(83), "a rating-83 manager is in the fixture");
  // Deselect = no manager: the engine gives the plain result.
  const [id, b, level] = mgrReads[0]!;
  const c = ex[id]!;
  const plain = simExact(c, c.builds[b], level, []);
  assert(BASE_STATS.every((s) => plain.managerDeltas[s] === 0) && applyManager(null).finishing === 0, "no manager → no +1 anywhere");
  // Spec scenario "Choose a manager": a real picker shape — rating 89 with
  // Lofted Pass + Defensive Engagement.
  const iL = BASE_STATS.indexOf("loftedPass"), iD = BASE_STATS.indexOf("defensiveEngagement");
  const m89 = simExact(ex.c1!, ex.c1!.builds.C, 89, [iL, iD]);
  const p89 = simExact(ex.c1!, ex.c1!.builds.C, 89, []);
  assert(m89.config.managerProficiency === 89 && BASE_STATS.every((s) => m89.projectedStats[s] === p89.projectedStats[s] + (s === "loftedPass" || s === "defensiveEngagement" ? 1 : 0)),
    "rating 89, pills Lofted Pass + Defensive Engagement: those two +1 on the level-89 result, every other stat equal to it");
  const recorded = readings.filter((r) => r[2] === 89 && r[3].length === 2 && r[3].includes(iL) && r[3].includes(iD));
  // Reported only: the fixture's manager sample need not contain this shape
  // (the rule itself is checked on every manager reading above).
  console.log(`  fixture readings with exactly this manager shape at level 89: ${recorded.length}`);
}

// ---------------------------------------------------------------- 10. Max OVR preset vs efootbase's Max readings
{
  const c1 = ex.c1!;
  const reg = POSITIONS[c1.pos]!;
  const preset = bestAllocation(reg, trainingPointsAvailable(c1.levelCap));
  assert(allocArr(preset).join(",") === c1.builds.M.join(",") && c1.builds.M.join(",") === c1.builds.C.join(","), `reference card: Max OVR = efootbase's Max build ${c1.builds.M.join("/")} (got ${allocArr(preset).join("/")})`);
  const table: Array<[number, number, number]> = [[70, 106, 94], [80, 109, 97], [85, 109, 97], [90, 110, 97]];
  for (const [level, mx, rs] of table) {
    const m = simExact(c1, preset, level, []).overall;
    const r = simExact(c1, c1.builds.A, level, []).overall;
    const recM = readings.find((x) => x[0] === "c1" && x[1] === "C" && x[2] === level && x[3].length === 0)![6];
    const recR = readings.find((x) => x[0] === "c1" && x[1] === "A" && x[2] === level && x[3].length === 0)![6];
    assert(m === mx && r === rs && recM === mx && recR === rs, `reference card at proficiency ${level}: Max ${m} (measured ${recM}, expected ${mx}), Reset ${r} (measured ${recR}, expected ${rs})`);
  }
  // Same allocation at every proficiency and for every manager: the preset takes no level.
  assert(bestAllocation(reg, trainingPointsAvailable(c1.levelCap)).Shooting === preset.Shooting, "the preset is a function of position and budget only");
  // efootbase's own Max OVR readings (21 levels on three cards, five on the reference card, the opening reading at 90 on the goalkeeper).
  let n = 0, ok = 0, allocSame = 0;
  const diffAlloc: string[] = [];
  for (const [id, c] of Object.entries(ex)) {
    const pos = POSITIONS[c.pos]!;
    const ours = bestAllocation(pos, trainingPointsAvailable(c.levelCap));
    if (allocArr(ours).join(",") === c.builds.M.join(",")) allocSame++;
    else diffAlloc.push(`${id} ${pos}: ours ${allocArr(ours).join("/")} vs efootbase ${c.builds.M.join("/")} (linear ${linearOvrValue(pos, addStats(toStats(c.base), applyTraining(ours)))} vs ${linearOvrValue(pos, addStats(toStats(c.base), applyTraining(toAlloc(c.builds.M))))})`);
    for (const [level, ovr] of c.maxOvr) { n++; if (simExact(c, ours, level, []).overall === ovr) ok++; }
  }
  assert(n >= 60 && ok === n, `Max OVR preset reproduces efootbase's Max OVR reading on ${pct(ok, n)} readings (5 cards)`);
  // Reported, not asserted (the spec does not require equal allocations).
  // Expected on the committed fixture: 4/5, c5 (CF) differs with a lower
  // objective value on efootbase's side.
  console.log(`  preset allocation = efootbase's Max allocation on ${allocSame}/5 fixture cards${diffAlloc.length ? `; differs: ${diffAlloc.join("; ")}` : ""}`);
}

// ---------------------------------------------------------------- 11. bound against the bonus-aware optimum
// The preset ignores the bonus and the 99 cap. Reference: an exact grouped
// knapsack over the weighted sum WITH the bonus and the cap at the registered
// position (full proficiency, scaling 1, so the sum is Σ w · final + constants)
// — every category is a group of value Σ w · (F(base + g) − F(base)),
// F(s) = min(99, s + bonus(s)) (a stat trained past 99 reads 99); Aerial
// Strength and Goalkeeper 1 share Jump and form one joint group over every
// pair. Boosters are constants of the build.
{
  const F = (level: number, s: number) => Math.min(99, s + managerProficiencyBonus(level, s));
  const bonusAwareBest = (p: Position, budget: number, base: StatVector, level: number): TrainingAllocation => {
    const B = Math.round(budget * 2);
    const w = (s: BaseStat) => OVR_WEIGHTS[p][s];
    const lift = (s: BaseStat, g: number) => w(s) * (F(level, base[s] + g) - F(level, base[s]));
    const gmax = maxGainForBudget(budget);
    type Opt = { cost: number; val: number; set: Partial<TrainingAllocation> };
    const groups: Opt[][] = [];
    for (const cat of TRAINING_CATEGORIES) {
      if (cat === "GK1") continue;
      const opts: Opt[] = [];
      if (cat === "Aerial") {
        for (let a = 0; a <= gmax; a++) for (let k = 0; k <= gmax; k++) {
          const cost = categoryCostHalf(a) + categoryCostHalf(k);
          if (cost > B) continue;
          let val = lift("jump", a + k);
          for (const s of TRAINING_STATS.Aerial) if (s !== "jump") val += lift(s, a);
          for (const s of TRAINING_STATS.GK1) if (s !== "jump") val += lift(s, k);
          opts.push({ cost, val, set: { Aerial: a, GK1: k } });
        }
      } else {
        for (let g = 0; categoryCostHalf(g) <= B; g++) {
          let val = 0;
          for (const s of TRAINING_STATS[cat]) val += lift(s, g);
          opts.push({ cost: categoryCostHalf(g), val, set: { [cat]: g } });
        }
      }
      groups.push(opts);
    }
    let dp: number[] = new Array<number>(B + 1).fill(Number.NEGATIVE_INFINITY);
    dp[0] = 0;
    const back: Array<Array<{ prev: number; o: Opt } | undefined>> = [];
    for (const opts of groups) {
      const next: number[] = new Array<number>(B + 1).fill(Number.NEGATIVE_INFINITY);
      const ch: Array<{ prev: number; o: Opt } | undefined> = new Array(B + 1);
      for (let u = 0; u <= B; u++) {
        if (dp[u] === Number.NEGATIVE_INFINITY) continue;
        for (const o of opts) {
          if (u + o.cost > B) continue;
          const v = dp[u]! + o.val;
          if (v > next[u + o.cost]!) { next[u + o.cost] = v; ch[u + o.cost] = { prev: u, o }; }
        }
      }
      dp = next;
      back.push(ch);
    }
    let best = 0;
    for (let u = 1; u <= B; u++) if (dp[u]! > dp[best]!) best = u;
    const alloc = emptyAllocation();
    for (let i = groups.length - 1, u = best; i >= 0; i--) { const x = back[i]![u]!; Object.assign(alloc, x.o.set); u = x.prev; }
    return alloc;
  };
  let n = 0, below = 0, dispOver1 = 0, refWorse = 0, noBonusDiff = 0, overBudget = 0;
  const dispGap = new Map<number, number>();
  // The ≤ 1 bound holds for presets that stay at or below 99; a preset that
  // trains a stat past 99 wastes those points (up to 2 on dump cards, see
  // docs/efootbase-exact-model.md). The fixture has no such card.
  const past99 = Object.values(ex).filter((c) => {
    const t = addStats(toStats(c.base), applyTraining(bestAllocation(POSITIONS[c.pos]!, trainingPointsAvailable(c.levelCap))));
    return BASE_STATS.some((s) => t[s] > 99);
  }).length;
  assert(past99 === 0, `no fixture card's Max OVR preset trains a stat past 99 (${past99})`);
  for (const c of Object.values(ex)) {
    const p = POSITIONS[c.pos]!;
    const budget = trainingPointsAvailable(c.levelCap);
    const preset = bestAllocation(p, budget);
    for (let level = MANAGER_PROFICIENCY_MIN; level <= MANAGER_PROFICIENCY_MAX; level++) {
      const ref = bonusAwareBest(p, budget, toStats(c.base), level);
      if (allocationCost(ref) > budget) overBudget++;
      const rp = simExact(c, preset, level, []).overall;
      const rr = simExact(c, ref, level, []).overall;
      n++;
      if (rr < rp) refWorse++;
      if (rr > rp) below++;
      dispGap.set(rr - rp, (dispGap.get(rr - rp) ?? 0) + 1);
      if (rr - rp > 1) dispOver1++;
      if (level <= 76 && rr !== rp) noBonusDiff++;
    }
  }
  assert(overBudget === 0 && refWorse === 0, `bonus-aware reference stays within budget and never reads below the preset (${n} card × level pairs)`);
  assert(noBonusDiff === 0, "levels 70–76 (no bonus): the preset reads exactly the optimum");
  assert(dispOver1 === 0, `preset vs bonus-aware optimum, 5 cards × 21 levels: below it on ${pct(below, n)}, displayed gap ${JSON.stringify([...dispGap].sort((a, b) => a[0] - b[0]))} (≤ 1 required)`);
}

// ---------------------------------------------------------------- 12. tamper tests
// Each change below is applied to a copy of the model (or to the stat
// pipeline) and must make the oracle fail on at least one reading.
{
  type Pipe = { model?: OvrModel; bands?: Readonly<Record<number, readonly ProficiencyBand[]>>; dropManager?: boolean; managerBeforeBonus?: boolean; boosterBeforeBonus?: boolean };
  const finalStats = (c: ExactCard, b: "A" | "C", level: number, pills: number[], o: Pipe): StatVector => {
    const trained = addStats(toStats(c.base), applyTraining(toAlloc(c.builds[b])));
    const mgr = o.dropManager ? zeroStats() : applyManager({ stats: pillsOf(pills) });
    const boost = applyBoosters([{ stats: sparse(c.b1) }, { stats: sparse(c.b2) }], [true, true]);
    let pre = trained;
    if (o.managerBeforeBonus) pre = addStats(pre, mgr);
    if (o.boosterBeforeBonus) pre = addStats(pre, boost);
    // min(99, pre + bonus): the bonus stops at 99 by itself, cutTrainedStats
    // brings a value already past 99 back to it (as simulateBuild does).
    let out = addStats(pre, applyManagerProficiency(level, pre, o.bands), cutTrainedStats(pre));
    if (!o.boosterBeforeBonus) out = addStats(out, boost);
    if (!o.managerBeforeBonus) out = addStats(out, mgr);
    return out;
  };
  /** Readings (stats, overall, 13 tiles) the pipeline gets right. */
  const oracle = (o: Pipe): { ok: number; n: number } => {
    let ok = 0;
    for (const [id, b, level, pills, shown, tiles, ovr] of readings) {
      const c = ex[id]!;
      const st = finalStats(c, b, level, pills, o);
      const t = positionTiles(st, bodyOf(c), aptOf(c), o.model);
      const good = BASE_STATS.every((s, i) => st[s] === shown[i]) && t[POSITIONS[c.pos]!] === ovr && POSITIONS.every((p, i) => t[p] === tiles[i]);
      if (good) ok++;
    }
    return { ok, n: readings.length };
  };
  const base = oracle({});
  assert(base.ok === base.n, `untampered pipeline passes the oracle (${pct(base.ok, base.n)})`);
  const withWeights = (f: (w: Record<Position, Record<string, number>>) => void): OvrModel => {
    const weights = JSON.parse(JSON.stringify(OVR_MODEL.weights)) as Record<Position, Record<string, number>>;
    f(weights);
    return { ...OVR_MODEL, weights: weights as OvrModel["weights"] };
  };
  const bandsWith = (f: (b: Record<number, ProficiencyBand[]>) => void) => {
    const bands = JSON.parse(JSON.stringify(PROFICIENCY_BANDS)) as Record<number, ProficiencyBand[]>;
    f(bands);
    return bands;
  };
  const tampers: Array<[string, Pipe]> = [
    ["one weight +1 (SS finishing)", { model: withWeights((w) => { w.SS!.finishing! += 1; }) }],
    ["one weight +1 (GK gkReflexes)", { model: withWeights((w) => { w.GK!.gkReflexes! += 1; }) }],
    ["one weight −1 (CB height)", { model: withWeights((w) => { w.CB!.height! -= 1; }) }],
    ["two stat terms swapped at every position (finishing ↔ heading)", { model: withWeights((w) => { for (const p of POSITIONS) { const t = w[p]!.finishing!; w[p]!.finishing = w[p]!.heading!; w[p]!.heading = t; } }) }],
    ["LMF and RMF columns swapped", { model: withWeights((w) => { const t = w.LMF!; w.LMF = w.RMF!; w.RMF = t; }) }],
    ["one band bound moved (level 90: 56–82 → 56–83)", { bands: bandsWith((b) => { b[90]![1]!.max = 83; b[90]![2]!.min = 84; }) }],
    ["one band bound moved (level 86: 40–57 → 40–56)", { bands: bandsWith((b) => { b[86]![0]!.max = 56; b[86]![1]!.min = 57; }) }],
    ["manager +1 dropped", { dropManager: true }],
    ["manager +1 applied before the bonus and the 99 cap", { managerBeforeBonus: true }],
    ["boosters applied before the bonus and the 99 cap", { boosterBeforeBonus: true }],
    ["rounding: overall truncated (no +499)", { model: { ...OVR_MODEL, sumBias: 0 } }],
    ["rounding: overall bias 499 → 500", { model: { ...OVR_MODEL, sumBias: 500 } }],
    ["rounding: scaled stats truncated (no +0.5)", { model: { ...OVR_MODEL, scaleRoundBias: 0 } }],
    ["scale factor half 0.97 → 0.96", { model: { ...OVR_MODEL, scale: { ...OVR_MODEL.scale, half: 0.96 } } }],
    ["scale factor none 0.85 → 0.86", { model: { ...OVR_MODEL, scale: { ...OVR_MODEL.scale, none: 0.86 } } }],
    ["clamp: floor 40 → 39", { model: { ...OVR_MODEL, min: 39 } }],
    ["clamp: floor 40 → 41", { model: { ...OVR_MODEL, min: 41 } }],
    ["term offset 25 → 24", { model: { ...OVR_MODEL, termOffset: 24 } }],
    ["height offset 111 → 112", { model: { ...OVR_MODEL, heightOffset: 112 } }],
    ["weak-foot base 40 → 41", { model: { ...OVR_MODEL, wfBase: 41 } }],
  ];
  for (const [label, pipe] of tampers) {
    const r = oracle(pipe);
    assert(r.ok < r.n, `tamper "${label}" is detected (${r.n - r.ok} of ${r.n} readings fail)`);
  }
  // Not asserted (reported): a change the measured readings cannot see — the
  // ceiling is pinned by the "Floor and ceiling" check in section 5 instead.
  const cap = oracle({ model: { ...OVR_MODEL, max: 126 } });
  console.log(`  note: ceiling 127 → 126 changes ${cap.n - cap.ok} of ${cap.n} readings (no measured overall reaches 127)`);
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ progression tests passed");
