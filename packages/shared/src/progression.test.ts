// Oracle tests for the progression engine (player-progression-simulator).
// Run: tsx packages/shared/src/progression.test.ts  (pnpm --filter @eflab/shared test)
//
// The fixture `__fixtures__/progression-oracle.json` holds 260 cards (20 per
// position, level cap ≥ 2) sampled from the eFHUB player export joined to the
// efootbase dump: base stats, hub max stats, the hub's per-category
// allocation, level cap, registered position, the hub overall at that
// position (`ovr`), efootbase's overall at max level (`efMaxOvr`, carries
// Booster 1) and the booster vectors by id. Numeric game data only.
import { readFileSync } from "node:fs";
import {
  BASE_STATS,
  POSITIONS,
  TRAINING_CATEGORIES,
  TRAINING_STATS,
  type BaseStat,
  type Position,
  type TrainingCategory,
} from "./constants";
import {
  addStats,
  allocationCost,
  applyBoosters,
  applyTraining,
  bestAllocation,
  categoryCost,
  categoryCostHalf,
  emptyAllocation,
  maxGainForBudget,
  nextStatPointCost,
  projectOvr,
  resolveBooster,
  roundOvr,
  simulateBuild,
  statPointCostHalf,
  trainingPointsAvailable,
  type BoosterVector,
  type StatVector,
  type TrainingAllocation,
} from "./progression";
import { OVR_WEIGHTS } from "./ovrWeights";

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
  efMaxOvr: number;
  base: number[];
  max: number[];
  alloc: number[];
  b1: number | null;
  b2: number | null;
  /** [position index, hub aptitude (1 half / 0 none), hub overall] for every
   *  position where the card is not fully proficient. */
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
const posOf = (c: FixtureCard): Position => POSITIONS[c.pos] ?? "GK";

assert(cards.length >= 200, `fixture has ≥ 200 cards (${cards.length})`);
assert(POSITIONS.every((p) => cards.some((c) => posOf(c) === p)), "fixture covers all 13 positions");

// ---------------------------------------------------------------- 1. stat map
// hub MAX<stat> − <stat> equals the category allocation for every stat of the
// category (goalkeeper Jump excluded — card-specific offset).
{
  let exact = 0;
  let gkJumpOffsets = 0;
  const wrongStats = new Map<BaseStat, number>();
  for (const c of cards) {
    const base = toStats(c.base);
    const max = toStats(c.max);
    const alloc = toAlloc(c.alloc);
    const gk = posOf(c) === "GK";
    let ok = true;
    for (const cat of TRAINING_CATEGORIES) {
      for (const stat of TRAINING_STATS[cat]) {
        const delta = max[stat] - base[stat];
        if (gk && stat === "jump") {
          if (delta !== alloc[cat]) gkJumpOffsets++;
          continue;
        }
        if (delta !== alloc[cat]) {
          ok = false;
          wrongStats.set(stat, (wrongStats.get(stat) ?? 0) + 1);
        }
      }
    }
    // Stats outside every category never move.
    const trained = new Set<BaseStat>(TRAINING_CATEGORIES.flatMap((cat) => [...TRAINING_STATS[cat]]));
    for (const s of BASE_STATS) if (!trained.has(s) && max[s] !== base[s]) ok = false;
    if (ok) exact++;
  }
  assert(exact === cards.length, `stat map exact on ${pct(exact, cards.length)} cards (mismatches: ${JSON.stringify([...wrongStats])})`);
  console.log(`  goalkeeper Jump card-specific offsets in the fixture: ${gkJumpOffsets}`);
  // The engine reproduces the hub max stats from base + allocation.
  let reproduced = 0;
  for (const c of cards) {
    const gk = posOf(c) === "GK";
    const projected = addStats(toStats(c.base), applyTraining(toAlloc(c.alloc), { goalkeeper: gk }));
    const max = toStats(c.max);
    if (BASE_STATS.every((s) => (gk && s === "jump") || projected[s] === max[s])) reproduced++;
  }
  assert(reproduced === cards.length, `applyTraining reproduces hub max stats on ${pct(reproduced, cards.length)} cards`);
}

// ---------------------------------------------------------------- 2. cost curve
{
  const expected: Array<[number, number]> = [[0, 0], [1, 0.5], [2, 1], [4, 2], [5, 3], [8, 6], [12, 12], [16, 20], [20, 30], [22, 36]];
  for (const [g, cost] of expected) assert(categoryCost(g) === cost, `categoryCost(${g}) = ${cost} (got ${categoryCost(g)})`);
  assert(categoryCostHalf(22) === 72, "categoryCostHalf(22) = 72 half-points");
  for (let n = 1; n <= 4; n++) assert(statPointCostHalf(n) === 1, `stat point ${n} costs 0.5`);
  assert(statPointCostHalf(5) === 2 && statPointCostHalf(8) === 2 && statPointCostHalf(9) === 3, "points 5–8 cost 1, point 9 costs 1.5");
  assert(nextStatPointCost(0) === 0.5, "next cost at 0 points is 0.5");
  assert(nextStatPointCost(4) === 1, "next cost at 4 points is 1 (spec scenario)");
  assert(nextStatPointCost(8) === 1.5, "next cost at 8 points is 1.5");
  // Costs are strictly increasing and the curve is consistent with its tiers.
  for (let g = 1; g <= 60; g++) assert(categoryCostHalf(g) - categoryCostHalf(g - 1) === statPointCostHalf(g), `cumulative cost at ${g} adds the ${g}th point`);
  // 26 points cost 4·(1+…+6) + 2·7 = 98 half-points = 49.
  assert(maxGainForBudget(0) === 0 && maxGainForBudget(0.5) === 1 && maxGainForBudget(2) === 4 && maxGainForBudget(6) === 8 && maxGainForBudget(36) === 22 && maxGainForBudget(49) === 26,
    "maxGainForBudget: 0→0, 0.5→1, 2→4, 6→8, 36→22, 49→26");
}

// ---------------------------------------------------------------- 3. budget invariant
{
  let ok = 0;
  for (const c of cards) if (allocationCost(toAlloc(c.alloc)) === trainingPointsAvailable(c.levelCap)) ok++;
  assert(ok === cards.length, `Σ cost(allocation) = levelCap − 1 on ${pct(ok, cards.length)} cards`);
  assert(trainingPointsAvailable(1) === 0 && trainingPointsAvailable(0) === 0 && trainingPointsAvailable(31) === 30 && trainingPointsAvailable(50) === 49,
    "trainingPointsAvailable: 1→0, 0→0, 31→30, 50→49");
}

// ---------------------------------------------------------------- 4. overall estimate
{
  const within1 = new Map<Position, { n: number; base: number; max: number }>();
  for (const p of POSITIONS) within1.set(p, { n: 0, base: 0, max: 0 });
  for (const c of cards) {
    const p = posOf(c);
    const r = within1.get(p)!;
    r.n++;
    if (Math.abs(roundOvr(projectOvr(p, toStats(c.base))) - c.ovr) <= 1) r.base++;
    // Max level: base + hub allocation + Booster 1 vs efootbase overall_at_max_level.
    const b1 = resolveBooster(c.b1, boosterTable);
    const maxStats = addStats(toStats(c.base), applyTraining(toAlloc(c.alloc), { goalkeeper: p === "GK" }), applyBoosters([b1], [true]));
    if (Math.abs(roundOvr(projectOvr(p, maxStats)) - c.efMaxOvr) <= 1) r.max++;
  }
  const OUTFIELD_11 = POSITIONS.filter((p) => p !== "GK" && p !== "CB" && p !== "CF");
  let n = 0, base = 0, max = 0;
  for (const p of OUTFIELD_11) { const r = within1.get(p)!; n += r.n; base += r.base; max += r.max; }
  assert(base / n >= 0.99, `level-1 estimate within ±1 of the hub overall on the 11 outfield positions (excl. CB/CF): ${pct(base, n)} (≥ 99% required)`);
  assert(max / n >= 0.9, `max-level estimate (+ Booster 1) within ±1 of efootbase overall_at_max_level, 11 outfield: ${pct(max, n)}`);
  for (const p of POSITIONS) {
    const r = within1.get(p)!;
    console.log(`  ${p.padEnd(3)} n=${r.n} level-1 within ±1 ${pct(r.base, r.n)} · max-level ${pct(r.max, r.n)}`);
  }
  const gk = within1.get("GK")!;
  console.log(`  GK (reported separately, lower confidence): level-1 ${pct(gk.base, gk.n)} · max-level ${pct(gk.max, gk.n)}`);
  // Per-position floors for the three positions the aggregate leaves out, so a
  // regenerated weights table cannot silently degrade them. Fixture values on
  // 2026-10-18 (20 cards each): CB 17/20 (the held-out fit is 98.6%, and the
  // fixture happens to hold 3 of the ±2 cards — no margin is possible without
  // dropping below the measured value), CF 20/20 and GK 20/20 (one card of
  // margin each; held-out 99.85% and 93.3%). Each card is 5 points.
  const floors: Array<[Position, number]> = [["CB", 0.85], ["CF", 0.95], ["GK", 0.9]];
  for (const [p, floor] of floors) {
    const r = within1.get(p)!;
    assert(r.base / r.n >= floor, `level-1 estimate within ±1 at ${p}: ${pct(r.base, r.n)} (≥ ${Math.round(floor * 100)}% required)`);
  }

  // Proficiency penalty: the hub overall at every half / non-proficient
  // position of the fixture cards vs projectOvr with the fitted adjustment.
  // Floors from the fixture values on 2026-10-18 (half 498/500 = 99.6 %, none
  // 1,933/1,938 = 99.74 % at outfield positions, GK at none 240/240) with a
  // margin of about half a point; the held-out rates are 99.9 % / 99.7 % / 100 %.
  {
    const tally = { half: { n: 0, ok: 0, raw: 0 }, none: { n: 0, ok: 0, raw: 0 }, gkNone: { n: 0, ok: 0 } };
    const perPos = new Map<string, { n: number; ok: number }>();
    for (const c of cards) {
      const stats = toStats(c.base);
      for (const [posIdx, apt, hubOvr] of c.alt) {
        const p = POSITIONS[posIdx]!;
        const prof = apt === 1 ? "half" : "none";
        const est = roundOvr(projectOvr(p, stats, prof));
        const raw = roundOvr(projectOvr(p, stats));
        if (prof === "none" && p === "GK") {
          tally.gkNone.n++;
          if (est === hubOvr) tally.gkNone.ok++;
          continue;
        }
        const t = tally[prof];
        t.n++;
        if (Math.abs(est - hubOvr) <= 1) t.ok++;
        if (Math.abs(raw - hubOvr) <= 1) t.raw++;
        const key = `${prof} ${p}`;
        const pp = perPos.get(key) ?? { n: 0, ok: 0 };
        pp.n++;
        if (Math.abs(est - hubOvr) <= 1) pp.ok++;
        perPos.set(key, pp);
      }
    }
    assert(tally.half.n >= 300 && tally.none.n >= 1000, `fixture carries proficiency oracles (half ${tally.half.n}, none ${tally.none.n}, GK-none ${tally.gkNone.n})`);
    assert(tally.half.ok / tally.half.n >= 0.99, `half-proficiency estimate within ±1 of the hub overall: ${pct(tally.half.ok, tally.half.n)} (≥ 99% required; unpenalised ${pct(tally.half.raw, tally.half.n)})`);
    assert(tally.none.ok / tally.none.n >= 0.99, `non-proficient estimate within ±1 at outfield positions: ${pct(tally.none.ok, tally.none.n)} (≥ 99% required; unpenalised ${pct(tally.none.raw, tally.none.n)})`);
    assert(tally.gkNone.ok === tally.gkNone.n, `non-proficient estimate at GK is the constant 40: ${pct(tally.gkNone.ok, tally.gkNone.n)}`);
    for (const [key, pp] of [...perPos].sort()) console.log(`  ${key.padEnd(9)} n=${pp.n} within ±1 ${pct(pp.ok, pp.n)}`);
    // The penalty is monotone in the full estimate (Max OVR stays optimal).
    const s0 = toStats(cards[0]!.base);
    const monotone = POSITIONS.every((p) =>
      (["half", "none"] as const).every((prof) => projectOvr(p, { ...s0, finishing: s0.finishing + 10 }, prof) >= projectOvr(p, s0, prof)),
    );
    assert(monotone, "penalised estimates never decrease when a stat rises (13 positions × half/none)");
  }
  // Weights table integrity: 26 weights, outfield fits carry no GK weights.
  for (const p of POSITIONS) {
    assert(OVR_WEIGHTS[p].w.length === BASE_STATS.length, `${p} has ${BASE_STATS.length} weights`);
    if (p !== "GK") {
      const gkW = (["gkAwareness", "gkCatching", "gkParrying", "gkReflexes", "gkReach"] as BaseStat[]).map((s) => OVR_WEIGHTS[p].w[BASE_STATS.indexOf(s)]);
      assert(gkW.every((w) => w === 0), `${p} fit excludes GK stats`);
    }
  }
}

// ---------------------------------------------------------------- 5. Max OVR (DP)
{
  let withinBudget = 0;
  let atLeastReference = 0;
  let identical = 0;
  let worst = 0;
  for (const c of cards) {
    const p = posOf(c);
    const gk = p === "GK";
    const budget = trainingPointsAvailable(c.levelCap);
    const best = bestAllocation(p, budget, { goalkeeper: gk });
    const base = toStats(c.base);
    if (allocationCost(best) <= budget) withinBudget++;
    const vBest = projectOvr(p, addStats(base, applyTraining(best, { goalkeeper: gk })));
    const vRef = projectOvr(p, addStats(base, applyTraining(toAlloc(c.alloc), { goalkeeper: gk })));
    if (vBest >= vRef - 0.8) atLeastReference++;
    worst = Math.min(worst, vBest - vRef);
    if (TRAINING_CATEGORIES.every((cat) => best[cat] === (toAlloc(c.alloc)[cat] ?? 0))) identical++;
  }
  assert(withinBudget === cards.length, `bestAllocation never exceeds the budget: ${pct(withinBudget, cards.length)}`);
  assert(atLeastReference === cards.length, `bestAllocation ≥ hub allocation − 0.8 OVR: ${pct(atLeastReference, cards.length)} (worst Δ ${worst.toFixed(3)})`);
  assert(worst >= -1e-9, "bestAllocation is never below the hub allocation (exact DP)");
  console.log(`  bestAllocation identical to the hub allocation on ${pct(identical, cards.length)} cards`);

  // Spec scenario: striker, budget 49 → spent ≤ 49, ≥ reference − 0.8.
  const cf = cards.find((c) => posOf(c) === "CF")!;
  const best49 = bestAllocation("CF", 49);
  const base = toStats(cf.base);
  assert(allocationCost(best49) <= 49, `Max OVR on a striker with budget 49 spends ${allocationCost(best49)} ≤ 49`);
  // A plain greedy (always buy the best marginal gain) must not beat the DP.
  const greedy = emptyAllocation();
  let left = 98; // half-points
  for (;;) {
    let bestCat: TrainingCategory | null = null;
    let bestRatio = 0;
    for (const cat of TRAINING_CATEGORIES) {
      const cost = statPointCostHalf(greedy[cat] + 1);
      if (cost > left) continue;
      const gain = TRAINING_STATS[cat].reduce((s, st) => s + (OVR_WEIGHTS.CF.w[BASE_STATS.indexOf(st)] ?? 0), 0);
      if (gain / cost > bestRatio) { bestRatio = gain / cost; bestCat = cat; }
    }
    if (!bestCat) break;
    left -= statPointCostHalf(greedy[bestCat] + 1);
    greedy[bestCat] += 1;
  }
  const vDp = projectOvr("CF", addStats(base, applyTraining(best49)));
  const vGreedy = projectOvr("CF", addStats(base, applyTraining(greedy)));
  assert(vDp >= vGreedy - 1e-9, `DP (${vDp.toFixed(2)}) ≥ greedy (${vGreedy.toFixed(2)}) at budget 49`);
  // Zero-gain categories stay at zero (GK categories at an outfield position).
  assert(best49.GK1 === 0 && best49.GK2 === 0 && best49.GK3 === 0, "CF Max OVR spends nothing on GK categories");
  assert(TRAINING_CATEGORIES.every((cat) => bestAllocation("GK", 0)[cat] === 0), "budget 0 → empty allocation");
}

// ---------------------------------------------------------------- 6. simulateBuild / edge cases
{
  const base = toStats(cards[0]!.base);
  const config = (over: Partial<Parameters<typeof simulateBuild>[0]["config"]> = {}) => ({
    playerId: "1", maxLevel: 31, position: "CF" as Position, trainingPoints: emptyAllocation(), boosters: [true, false] as [boolean, boolean], ...over,
  });

  // Level cap 1 → 0 points, nothing to spend.
  const l1 = simulateBuild({ base, levelCap: 1, registeredPosition: "CF", config: config({ maxLevel: 1 }), boosters: [null, null] });
  assert(l1.pointsAvailable === 0 && l1.remainingPoints === 0 && l1.withinBudget, "level cap 1 → 0 training points");
  // maxLevel is clamped to the card's level cap.
  const clamped = simulateBuild({ base, levelCap: 10, registeredPosition: "CF", config: config({ maxLevel: 31 }), boosters: [null, null] });
  assert(clamped.config.maxLevel === 10 && clamped.pointsAvailable === 9, "maxLevel above the level cap is clamped (10 → 9 points)");

  // Shooting +4 → finishing, placeKicking, curl +4, nothing else; costs 2 points.
  const sh = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ trainingPoints: { ...emptyAllocation(), Shooting: 4 } }), boosters: [null, null] });
  assert(sh.trainingDeltas.finishing === 4 && sh.trainingDeltas.placeKicking === 4 && sh.trainingDeltas.curl === 4, "Shooting 4 → Finishing/Set Piece Taking/Curl +4");
  assert(BASE_STATS.filter((s) => sh.trainingDeltas[s] !== 0).length === 3, "Shooting changes no other stat");
  assert(sh.pointsUsed === 2 && sh.remainingPoints === 28, `Shooting 4 costs 2 of 30 points (used ${sh.pointsUsed}, left ${sh.remainingPoints})`);

  // Budget limit: level cap 31, 30 points spent → a further point is over budget.
  const full = bestAllocation("CF", 30);
  const atLimit = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ trainingPoints: full }), boosters: [null, null] });
  assert(atLimit.withinBudget && atLimit.remainingPoints >= 0, "optimal allocation at level cap 31 stays within 30 points");
  const over = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ trainingPoints: { ...emptyAllocation(), Shooting: 22, Passing: 2 } }), boosters: [null, null] });
  assert(!over.withinBudget && over.remainingPoints === -7, "37 points on a 30-point budget is flagged (remaining −7)");

  // Booster by id only: resolved from the table and applied; Booster 2 only when toggled.
  // A card whose Booster 1 is sparse (some boosters raise all 26 stats).
  const boosted = cards.find((c) => c.b1 != null && c.b1 > 0 && boosterTable.has(c.b1) && Object.keys(boosterTable.get(c.b1)!.stats).length < BASE_STATS.length)!;
  const b1 = resolveBooster(boosted.b1, boosterTable);
  assert(b1 !== null && Object.keys(b1.stats).length > 0, `booster id ${boosted.b1} resolves to a non-empty vector`);
  assert(resolveBooster(0, boosterTable) === null && resolveBooster(null, boosterTable) === null && resolveBooster(999999, boosterTable) === null, "ids 0 / null / unknown resolve to null");
  // Booster 2 bumps a stat Booster 1 does not touch so the two are separable.
  const b2Stat = BASE_STATS.find((s) => b1!.stats[s] === undefined)!;
  const b2 = { stats: { [b2Stat]: 4 } as BoosterVector };
  const r1 = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config(), boosters: [b1, b2] });
  const b1Stat = Object.keys(b1!.stats)[0] as BaseStat;
  assert(r1.boosterDeltas[b1Stat] === b1!.stats[b1Stat] && r1.boosterDeltas[b2Stat] === 0, "Booster 1 applied by default, Booster 2 not");
  const r2 = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ boosters: [true, true] }), boosters: [b1, b2] });
  assert(r2.boosterDeltas[b2Stat] === 4 && r2.boosterDeltas[b1Stat] === b1!.stats[b1Stat], "Booster 2 toggled → its vector is added on top of Booster 1");
  assert(r2.projectedStats[b2Stat] === base[b2Stat] + 4, "projected = base + boosters");
  const r3 = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ boosters: [false, false] }), boosters: [b1, b2] });
  assert(BASE_STATS.every((s) => r3.boosterDeltas[s] === 0), "both boosters off → no booster delta");

  // No clamp at 99.
  const hi = { ...base, finishing: 98 };
  const r4 = simulateBuild({ base: hi, levelCap: 31, registeredPosition: "CF", config: config({ trainingPoints: { ...emptyAllocation(), Shooting: 4 } }), boosters: [null, null] });
  assert(r4.projectedStats.finishing === 102, "stats are not capped at 99 (98 + 4 = 102)");

  // Goalkeeper Aerial: Heading / Physical Contact rise, Jump is not projected.
  const gkCard = cards.find((c) => posOf(c) === "GK")!;
  const gkBase = toStats(gkCard.base);
  const gk = simulateBuild({ base: gkBase, levelCap: 31, registeredPosition: "GK", config: config({ position: "GK", trainingPoints: { ...emptyAllocation(), Aerial: 3 } }), boosters: [null, null] });
  assert(gk.trainingDeltas.heading === 3 && gk.trainingDeltas.physicalContact === 3 && gk.trainingDeltas.jump === 0 && gk.jumpNotProjected, "GK Aerial 3 → Heading/Physical Contact +3, Jump n/a (card-specific)");
  const of = simulateBuild({ base, levelCap: 31, registeredPosition: "CB", config: config({ position: "CB", trainingPoints: { ...emptyAllocation(), Aerial: 3 } }), boosters: [null, null] });
  assert(of.trainingDeltas.jump === 3 && !of.jumpNotProjected, "outfield Aerial 3 → Jump +3");

  // Estimate follows the position and is rounded; exact value is kept.
  assert(Number.isInteger(sh.estimatedOvr) && Math.abs(sh.estimatedOvr - sh.estimatedOvrExact) <= 0.5, "estimatedOvr is the rounded exact estimate");
  const asCmf = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ position: "CMF" }), boosters: [null, null] });
  assert(asCmf.estimatedOvrExact === projectOvr("CMF", asCmf.projectedStats), "position selector changes the estimate");
  assert(asCmf.proficiency === "full", "without aptitudes the estimate assumes full proficiency");

  // Aptitudes given: the estimate at a half / non-proficient position carries the penalty.
  const apt = Object.fromEntries(POSITIONS.map((p) => [p, 2])) as Record<Position, number>;
  apt.CF = 0; apt.SS = 1;
  const atFull = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config(), boosters: [null, null], positionAptitudes: apt });
  const atHalf = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ position: "SS" }), boosters: [null, null], positionAptitudes: apt });
  const atNone = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ position: "AMF" }), boosters: [null, null], positionAptitudes: apt });
  assert(atFull.proficiency === "full" && atFull.estimatedOvrExact === projectOvr("CF", atFull.projectedStats), "registered position → full proficiency, no penalty");
  assert(atHalf.proficiency === "half" && atHalf.estimatedOvrExact === projectOvr("SS", atHalf.projectedStats, "half") && atHalf.estimatedOvrExact < projectOvr("SS", atHalf.projectedStats), "half proficiency → penalised estimate below the full one");
  assert(atNone.proficiency === "none" && atNone.estimatedOvrExact === projectOvr("AMF", atNone.projectedStats, "none") && atNone.estimatedOvrExact < projectOvr("AMF", atNone.projectedStats, "half"), "no proficiency → penalised below half");
  const gkNone = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: config({ position: "GK" }), boosters: [null, null], positionAptitudes: apt });
  assert(gkNone.estimatedOvr === 40, "outfield card at GK (no proficiency) → 40");
  assert(projectOvr("CB", { ...base, ...Object.fromEntries(BASE_STATS.map((s) => [s, 40])) } as StatVector, "none") === 40, "the penalised estimate never drops below the hub floor of 40");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ progression tests passed");
