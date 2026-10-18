// Oracle tests for the progression engine (player-progression-simulator;
// Manager Proficiency + anchor: manager-proficiency-slider, section 7 and
// `__fixtures__/proficiency-oracle.json`).
// Run: tsx packages/shared/src/progression.test.ts  (pnpm --filter @eflab/shared test)
//
// The fixture `__fixtures__/progression-oracle.json` holds 261 cards (20 per
// position, level cap ≥ 2, plus the one outfield card with a Goalkeeper 1
// value — hub PlayerID 179425, DMF, Aerial 8 + GK1 1) sampled from the eFHUB
// player export joined to the efootbase dump: base stats, hub max stats, the
// hub's per-category allocation, level cap, registered position, the hub
// overall at that position (`ovr`), efootbase's overall at max level
// (`efMaxOvr`, carries Booster 1; null where the dump has no progression for
// the card) and the booster vectors by id. Numeric game data only.
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
  MANAGER_PROFICIENCY_DEFAULT,
  MANAGER_PROFICIENCY_MAX,
  MANAGER_PROFICIENCY_MIN,
  MANAGER_PROFICIENCY_RATES,
  MANAGER_PROFICIENCY_UNCONFIRMED_LEVEL,
  POINT_DISPLAY_SCALE,
  PROGRESSION_CATEGORY_LABELS,
  addStats,
  allocationCost,
  applyBoosters,
  applyTraining,
  bestAllocation,
  categoryCost,
  categoryCostHalf,
  clampManagerProficiency,
  emptyAllocation,
  isUnconfirmedProficiencyLevel,
  managerProficiencyBonus,
  maxGainForBudget,
  nextStatPointCost,
  ovrAnchor,
  projectOvr,
  resolveBooster,
  roundOvr,
  simulateBuild,
  statPointCostHalf,
  toDisplayPoints,
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
  efMaxOvr: number | null;
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
// hub MAX<stat> − <stat> equals the sum of the allocations of the categories
// that contain the stat — one category for 25 stats, two for Jump (Aerial
// Strength + Goalkeeper 1; change jump-from-gk1) — on every card, goalkeepers
// included. The table itself is pinned first so a regression in constants.ts
// is named, not just counted.
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

  // Goalkeepers: the Jump lift is Aerial + GK1 and the GK1 part is real (the
  // hub Jump lift exceeds the Aerial value on every goalkeeper with GK1 > 0).
  const gks = cards.filter((c) => posOf(c) === "GK");
  const gkWithGk1 = gks.filter((c) => toAlloc(c.alloc).GK1 > 0);
  assert(gkWithGk1.length >= 15, `fixture goalkeepers with Goalkeeper 1 points: ${gkWithGk1.length} of ${gks.length} (≥ 15 required)`);
  const gkSum = gkWithGk1.filter((c) => { const a = toAlloc(c.alloc); return toStats(c.max).jump - toStats(c.base).jump === a.Aerial + a.GK1; }).length;
  const gkBeyondAerial = gkWithGk1.filter((c) => toStats(c.max).jump - toStats(c.base).jump > toAlloc(c.alloc).Aerial).length;
  assert(gkSum === gkWithGk1.length, `goalkeeper Jump lift = Aerial + Goalkeeper 1 on ${pct(gkSum, gkWithGk1.length)} cards`);
  assert(gkBeyondAerial === gkWithGk1.length, `goalkeeper Jump lift exceeds the Aerial value alone on ${pct(gkBeyondAerial, gkWithGk1.length)} cards (the Goalkeeper 1 part)`);

  // The outfield card with a Goalkeeper 1 value (hub 179425: DMF, Aerial 8 +
  // GK1 1 → Jump 67 → 76) follows the same rule.
  const outfieldGk1 = cards.filter((c) => posOf(c) !== "GK" && toAlloc(c.alloc).GK1 > 0);
  assert(outfieldGk1.length === 1 && posOf(outfieldGk1[0]!) === "DMF", `the fixture carries the one outfield card with Goalkeeper 1 points (${outfieldGk1.length})`);
  {
    const c = outfieldGk1[0]!;
    const a = toAlloc(c.alloc);
    const lift = toStats(c.max).jump - toStats(c.base).jump;
    assert(a.Aerial === 8 && a.GK1 === 1 && lift === 9, `outfield exception: Aerial ${a.Aerial} + GK1 ${a.GK1} → Jump +${lift} (expected 8 + 1 → +9)`);
    assert(applyTraining(a).jump === 9 && applyTraining(a).gkAwareness === 1, "applyTraining gives that card Jump +9 and GK Awareness +1");
  }

  // The engine reproduces the hub max stats from base + allocation on every
  // card — no stat excluded for any position.
  let reproduced = 0;
  const wrongProjected = new Map<BaseStat, number>();
  for (const c of cards) {
    const projected = addStats(toStats(c.base), applyTraining(toAlloc(c.alloc)));
    const max = toStats(c.max);
    let ok = true;
    for (const s of BASE_STATS) if (projected[s] !== max[s]) { ok = false; wrongProjected.set(s, (wrongProjected.get(s) ?? 0) + 1); }
    if (ok) reproduced++;
  }
  assert(reproduced === cards.length, `applyTraining reproduces hub max stats on ${pct(reproduced, cards.length)} cards, goalkeepers included (mismatches: ${JSON.stringify([...wrongProjected])})`);
  const gkReproduced = gks.filter((c) => { const p = addStats(toStats(c.base), applyTraining(toAlloc(c.alloc))); return BASE_STATS.every((s) => p[s] === toStats(c.max)[s]); }).length;
  assert(gkReproduced === gks.length, `… and on ${pct(gkReproduced, gks.length)} goalkeepers in particular (Jump included)`);
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

// ---------------------------------------------------------------- 2b. displayed unit + labels (efootbase-parity-round2)
{
  // efootbase prints whole points = 2 × our training points: a level-32 card
  // reads "62 pts", a fully spent build "62/62 pts"; the first four stat
  // points of a category cost 1 each, the next four 2 each.
  assert(POINT_DISPLAY_SCALE === 2, "display unit is twice the engine unit");
  assert(toDisplayPoints(trainingPointsAvailable(32)) === 62, `level-32 budget displays as 62 pts (got ${toDisplayPoints(trainingPointsAvailable(32))})`);
  const full32 = bestAllocation("SS", trainingPointsAvailable(32));
  assert(toDisplayPoints(allocationCost(full32)) === 62, `a fully spent level-32 build displays as 62/62 pts (got ${toDisplayPoints(allocationCost(full32))})`);
  assert(toDisplayPoints(nextStatPointCost(0)) === 1 && toDisplayPoints(nextStatPointCost(3)) === 1, "stat points 1–4 cost 1 displayed point each");
  assert(toDisplayPoints(nextStatPointCost(4)) === 2 && toDisplayPoints(nextStatPointCost(8)) === 3, "stat point 5 costs 2, stat point 9 costs 3 displayed points");
  assert(toDisplayPoints(categoryCost(8)) === 12 && toDisplayPoints(categoryCost(12)) === 24, "8 stat points = 12 displayed, 12 = 24 displayed");
  assert(toDisplayPoints(trainingPointsAvailable(28)) === 54 && toDisplayPoints(trainingPointsAvailable(27)) === 52, "level 28 → 54 pts, level 27 → 52 pts (as measured on efootbase)");
  assert(toDisplayPoints(1.5) === 3 && toDisplayPoints(0) === 0, "half-points convert without float drift");
  // Category labels exactly as efootbase prints them.
  const expectedLabels: Record<TrainingCategory, string> = {
    Shooting: "Shooting", Passing: "Passing", Dribbling: "Dribbling", Dexterity: "Dexterity",
    LowerBody: "Lower Body Strength", Aerial: "Aerial Strength", Defending: "Defending",
    GK1: "Goalkeeper 1", GK2: "Goalkeeper 2", GK3: "Goalkeeper 3",
  };
  for (const cat of TRAINING_CATEGORIES) assert(PROGRESSION_CATEGORY_LABELS[cat] === expectedLabels[cat], `label ${cat} = "${expectedLabels[cat]}" (got "${PROGRESSION_CATEGORY_LABELS[cat]}")`);
  // The Manager Proficiency control: 70–90, default 90, level 86 unconfirmed.
  assert(MANAGER_PROFICIENCY_MIN === 70 && MANAGER_PROFICIENCY_MAX === 90 && MANAGER_PROFICIENCY_DEFAULT === 90 && MANAGER_PROFICIENCY_UNCONFIRMED_LEVEL === 86,
    "Manager Proficiency constants: range 70–90, default 90, level 86 flagged");
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
  const within1 = new Map<Position, { n: number; base: number; nMax: number; max: number }>();
  for (const p of POSITIONS) within1.set(p, { n: 0, base: 0, nMax: 0, max: 0 });
  for (const c of cards) {
    const p = posOf(c);
    const r = within1.get(p)!;
    r.n++;
    if (Math.abs(roundOvr(projectOvr(p, toStats(c.base))) - c.ovr) <= 1) r.base++;
    // Max level: base + hub allocation + Booster 1 vs efootbase overall_at_max_level
    // (cards the dump carries no progression for have no oracle here).
    if (c.efMaxOvr === null) continue;
    r.nMax++;
    const b1 = resolveBooster(c.b1, boosterTable);
    const maxStats = addStats(toStats(c.base), applyTraining(toAlloc(c.alloc)), applyBoosters([b1], [true]));
    if (Math.abs(roundOvr(projectOvr(p, maxStats)) - c.efMaxOvr) <= 1) r.max++;
  }
  const OUTFIELD_11 = POSITIONS.filter((p) => p !== "GK" && p !== "CB" && p !== "CF");
  let n = 0, base = 0, nMax = 0, max = 0;
  for (const p of OUTFIELD_11) { const r = within1.get(p)!; n += r.n; base += r.base; nMax += r.nMax; max += r.max; }
  assert(base / n >= 0.99, `level-1 estimate within ±1 of the hub overall on the 11 outfield positions (excl. CB/CF): ${pct(base, n)} (≥ 99% required)`);
  assert(max / nMax >= 0.9, `max-level estimate (+ Booster 1) within ±1 of efootbase overall_at_max_level, 11 outfield: ${pct(max, nMax)}`);
  for (const p of POSITIONS) {
    const r = within1.get(p)!;
    console.log(`  ${p.padEnd(3)} n=${r.n} level-1 within ±1 ${pct(r.base, r.n)} · max-level ${pct(r.max, r.nMax)}`);
  }
  const gk = within1.get("GK")!;
  console.log(`  GK (reported separately, lower confidence): level-1 ${pct(gk.base, gk.n)} · max-level ${pct(gk.max, gk.nMax)}`);
  // With Jump projected for goalkeepers (Aerial + GK1) the max-level estimate
  // reaches the goalkeepers too: fixture 18/20 on 2026-10-18 (6/20 while Jump
  // was left at its base value); the hub-wide figure is 82.0 % (587/716).
  assert(gk.max / gk.nMax >= 0.75, `max-level estimate (+ Booster 1) within ±1 at GK: ${pct(gk.max, gk.nMax)} (≥ 75% required)`);
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
  // Independent reference: a top-down knapsack over (category, half-points
  // left) whose per-point gain is read straight from the weights through the
  // category table — Jump's weight therefore counts once in Aerial Strength
  // and once in Goalkeeper 1, exactly as applyTraining lifts it twice.
  const gainOf = (p: Position, cat: TrainingCategory) => TRAINING_STATS[cat].reduce((s, st) => s + (OVR_WEIGHTS[p].w[BASE_STATS.indexOf(st)] ?? 0), 0);
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
  let matchesReference = 0;
  let linearObjective = 0;
  let gkChecked = 0;
  for (const c of cards) {
    const p = posOf(c);
    const budget = trainingPointsAvailable(c.levelCap);
    const best = bestAllocation(p, budget);
    const base = toStats(c.base);
    if (allocationCost(best) <= budget) withinBudget++;
    const vBase = projectOvr(p, base);
    const vBest = projectOvr(p, addStats(base, applyTraining(best)));
    const vRef = projectOvr(p, addStats(base, applyTraining(toAlloc(c.alloc))));
    if (vBest >= vRef - 0.8) atLeastReference++;
    worst = Math.min(worst, vBest - vRef);
    if (TRAINING_CATEGORIES.every((cat) => best[cat] === (toAlloc(c.alloc)[cat] ?? 0))) identical++;
    // The DP's value equals the independent knapsack optimum …
    const dpValue = TRAINING_CATEGORIES.reduce((s, cat) => s + gainOf(p, cat) * best[cat], 0);
    if (Math.abs(dpValue - referenceBest(p, Math.round(budget * 2))) < 1e-9) matchesReference++;
    // … and that linear value is the real lift of the projected stats (the
    // objective sums the stat effects through the combined table).
    if (Math.abs(vBest - vBase - dpValue) < 1e-9) linearObjective++;
    if (p === "GK") gkChecked++;
  }
  assert(withinBudget === cards.length, `bestAllocation never exceeds the budget: ${pct(withinBudget, cards.length)}`);
  assert(atLeastReference === cards.length, `bestAllocation ≥ hub allocation − 0.8 OVR: ${pct(atLeastReference, cards.length)} (worst Δ ${worst.toFixed(3)})`);
  assert(worst >= -1e-9, "bestAllocation is never below the hub allocation (exact DP)");
  assert(matchesReference === cards.length && gkChecked >= 20, `bestAllocation value equals an independent knapsack optimum on ${pct(matchesReference, cards.length)} cards (${gkChecked} goalkeepers)`);
  assert(linearObjective === cards.length, `DP objective = projected OVR lift through the combined table on ${pct(linearObjective, cards.length)} cards`);
  // Every position × budgets 0..40 points against the same reference.
  let sweepOk = 0, sweepN = 0;
  for (const p of POSITIONS) for (let b = 0; b <= 40; b++) {
    sweepN++;
    const best = bestAllocation(p, b);
    const v = TRAINING_CATEGORIES.reduce((s, cat) => s + gainOf(p, cat) * best[cat], 0);
    if (allocationCost(best) <= b && Math.abs(v - referenceBest(p, b * 2)) < 1e-9) sweepOk++;
  }
  assert(sweepOk === sweepN, `bestAllocation matches the reference on ${pct(sweepOk, sweepN)} (position, budget) pairs`);
  console.log(`  bestAllocation identical to the hub allocation on ${pct(identical, cards.length)} cards`);
  // At GK the Goalkeeper 1 gain carries Jump's weight: it is strictly larger
  // than the GK Awareness weight alone.
  const gkW = OVR_WEIGHTS.GK.w;
  const gk1Gain = gainOf("GK", "GK1");
  assert(Math.abs(gk1Gain - (gkW[BASE_STATS.indexOf("gkAwareness")]! + gkW[BASE_STATS.indexOf("jump")]!)) < 1e-12 && gk1Gain > gkW[BASE_STATS.indexOf("gkAwareness")]!,
    `GK1 gain at GK = w(GK Awareness) + w(Jump) = ${gk1Gain.toFixed(4)}`);

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
  // Proficiency 70 (no bonus) so these checks see the training and booster
  // rules alone; section 7 covers the bonus.
  const config = (over: Partial<Parameters<typeof simulateBuild>[0]["config"]> = {}) => ({
    playerId: "1", maxLevel: 31, position: "CF" as Position, trainingPoints: emptyAllocation(), boosters: [true, false] as [boolean, boolean], managerProficiency: 70, ...over,
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

  // Jump from two categories (spec "Ten Training Categories" / "Honest Limits",
  // change jump-from-gk1): Aerial Strength and Goalkeeper 1 both lift it, for
  // goalkeepers and outfield cards alike, and no stat is left unprojected.
  const gkCard = cards.find((c) => posOf(c) === "GK")!;
  const gkBase = toStats(gkCard.base);
  const gkCfg = (trainingPoints: Partial<TrainingAllocation>) => config({ position: "GK", trainingPoints: { ...emptyAllocation(), ...trainingPoints } });
  const gkAerial = simulateBuild({ base: gkBase, levelCap: 31, registeredPosition: "GK", config: gkCfg({ Aerial: 3 }), boosters: [null, null] });
  assert(gkAerial.trainingDeltas.heading === 3 && gkAerial.trainingDeltas.physicalContact === 3 && gkAerial.trainingDeltas.jump === 3, "GK Aerial 3 → Heading/Physical Contact/Jump +3");
  assert(gkAerial.projectedStats.jump === gkBase.jump + 3, "goalkeeper Jump is projected (base + 3)");
  assert(!("jumpNotProjected" in gkAerial), "BuildResult carries no unprojected-Jump flag any more");
  // Goalkeeper 1 alone (spec scenario): GK Awareness and Jump +12, nothing else.
  const gk1Only = simulateBuild({ base: gkBase, levelCap: 31, registeredPosition: "GK", config: gkCfg({ GK1: 12 }), boosters: [null, null] });
  assert(gk1Only.trainingDeltas.gkAwareness === 12 && gk1Only.trainingDeltas.jump === 12, "GK buying only Goalkeeper 1 (12) → GK Awareness +12 and Jump +12");
  assert(BASE_STATS.filter((s) => gk1Only.trainingDeltas[s] !== 0).length === 2, "Goalkeeper 1 changes no other stat");
  assert(gk1Only.pointsUsed === 12 && gk1Only.remainingPoints === 18, `Goalkeeper 1 × 12 costs 12 of 30 points (used ${gk1Only.pointsUsed})`);
  // Jump from two categories (spec scenario): Aerial 6 + GK1 6 → Jump +12.
  const both = simulateBuild({ base: gkBase, levelCap: 31, registeredPosition: "GK", config: gkCfg({ Aerial: 6, GK1: 6 }), boosters: [null, null] });
  assert(both.trainingDeltas.jump === 12 && both.trainingDeltas.heading === 6 && both.trainingDeltas.physicalContact === 6 && both.trainingDeltas.gkAwareness === 6,
    "Aerial 6 + Goalkeeper 1 6 → Jump +12, Heading/Physical Contact +6, GK Awareness +6");
  assert(BASE_STATS.filter((s) => both.trainingDeltas[s] !== 0).length === 4, "Aerial + Goalkeeper 1 touch exactly four stats");
  assert(both.projectedStats.jump === gkBase.jump + 12, "projected Jump = base + 12");
  // The rule does not depend on the card's position: an outfield card buying
  // Goalkeeper 1 gets the same Jump lift; Aerial alone is unchanged.
  const of = simulateBuild({ base, levelCap: 31, registeredPosition: "CB", config: config({ position: "CB", trainingPoints: { ...emptyAllocation(), Aerial: 3 } }), boosters: [null, null] });
  assert(of.trainingDeltas.jump === 3 && of.trainingDeltas.gkAwareness === 0, "outfield Aerial 3 → Jump +3, GK Awareness untouched");
  const ofGk1 = simulateBuild({ base, levelCap: 31, registeredPosition: "CB", config: config({ position: "CB", trainingPoints: { ...emptyAllocation(), Aerial: 8, GK1: 1 } }), boosters: [null, null] });
  assert(ofGk1.trainingDeltas.jump === 9 && ofGk1.trainingDeltas.gkAwareness === 1, "outfield Aerial 8 + Goalkeeper 1 1 → Jump +9 (the hub 179425 case)");
  // applyTraining is the single source of the lift: the two categories add.
  const direct = applyTraining({ Aerial: 6, GK1: 6 });
  assert(direct.jump === 12 && direct.heading === 6 && direct.gkAwareness === 6, "applyTraining({Aerial 6, GK1 6}).jump = 12");

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

// ---------------------------------------------------------------- 7. Manager Proficiency + anchor (manager-proficiency-slider)
// Fixture `__fixtures__/proficiency-oracle.json`: six cards measured on the
// reference Progression sheet (numbers only — registered position index,
// displayed overall, level cap, base stats, both booster vectors) and 263
// builds [proficiency level, allocation, displayed overall at the registered
// position with both boosters on, 26 displayed stats, 1 = the sheet's own
// Max OVR build]: card 0 (SS) reset + Max OVR + four hand builds at 70, 75,
// 80, 85 and 90; card 1 (GK) 17 builds at 70 and 90; cards 2–5 the reset and
// the Max OVR build at all 21 levels plus 12 hand builds at 70/80/90. The
// cells left ambiguous by the measurements (s 66 at 83, s 88 at 87) are not
// in the selection (7c guards that). The shipped rates were pooled over all
// six cards, so every figure below is IN-SAMPLE — a regression guard against
// tampering, not a validation. The held-out and prospective runs (scripts
// outside the repo) are recorded in design.md; note that the anchor was
// chosen after the held-out goalkeeper failures were seen, so its held-out
// figure is post hoc and its independent support is the population check
// recorded in ovrWeights.ts. Rates moved inside their measured intervals
// (e.g. r(90) = 0.0362) pass these tests by design: the data cannot tell them
// apart.
{
  interface ProfCard { pos: number; ovr: number; levelCap: number; base: number[]; b1: number[]; b2: number[]; builds: Array<[number, number[], number, Array<number | null>, number]> }
  const prof = JSON.parse(readFileSync(new URL("./__fixtures__/proficiency-oracle.json", import.meta.url), "utf8")) as { cards: ProfCard[] };
  const pc = prof.cards;
  const nBuilds = pc.reduce((s, c) => s + c.builds.length, 0);
  assert(pc.length === 6 && nBuilds >= 150, `proficiency fixture: ${pc.length} cards, ${nBuilds} builds`);
  assert(pc.filter((c) => POSITIONS[c.pos] === "GK").length >= 2, "proficiency fixture carries at least two goalkeepers");
  const boostersOf = (c: ProfCard) => [{ stats: toStats(c.b1) as BoosterVector }, { stats: toStats(c.b2) as BoosterVector }] as const;
  const simulate = (c: ProfCard, level: number, alloc: number[], anchored: boolean, position: Position = POSITIONS[c.pos]!) =>
    simulateBuild({
      base: toStats(c.base),
      levelCap: c.levelCap,
      registeredPosition: POSITIONS[c.pos]!,
      ...(anchored ? { cardOvr: c.ovr } : {}),
      config: { playerId: "1", maxLevel: c.levelCap, position, trainingPoints: toAlloc(alloc), boosters: [true, true], managerProficiency: level },
      boosters: boostersOf(c),
    });

  // 7a. Rule pins (spec scenarios).
  assert(managerProficiencyBonus(90, 80) === 2 && managerProficiencyBonus(90, 83) === 3, "proficiency 90: 80 → 82 and 83 → 86 before boosters (spec scenario)");
  assert(managerProficiencyBonus(90, 98) === 1 && managerProficiencyBonus(90, 99) === 0 && managerProficiencyBonus(90, 104) === 0, "cap: 98 gains only 1, 99 and above gain nothing");
  assert([70, 71, 72, 73, 74, 75, 76].every((p) => [40, 60, 80, 98].every((s) => managerProficiencyBonus(p, s) === 0)), "levels 70–76 give no bonus");
  {
    let ok = 0, n = 0;
    for (let s = 1; s <= 98; s++) { n++; if (managerProficiencyBonus(86, s) === Math.min(99 - s, Math.floor((s + 6) / 32))) ok++; }
    assert(ok === n && isUnconfirmedProficiencyLevel(86) && !isUnconfirmedProficiencyLevel(85) && !isUnconfirmedProficiencyLevel(87), "level 86 uses the flagged exception floor((s + 6) / 32), capped; only 86 is flagged");
    assert(!(86 in MANAGER_PROFICIENCY_RATES) && Object.keys(MANAGER_PROFICIENCY_RATES).length === 20, "the rate table covers 70–90 except 86");
    // No product s · r sits so close to an integer that float rounding could flip the floor.
    let close = 0;
    for (const [p, r] of Object.entries(MANAGER_PROFICIENCY_RATES)) for (let s = 1; s <= 98; s++) { const x = s * r; if (r > 0 && Math.abs(x - Math.round(x)) < 1e-6) { close++; console.log(`  near-integer product at ${p}: ${s} × ${r}`); } }
    assert(close === 0, "no s · r(level) is within 1e-6 of an integer (floor is float-safe)");
  }
  assert(clampManagerProficiency(60) === 70 && clampManagerProficiency(95) === 90 && clampManagerProficiency(Number.NaN) === 90 && clampManagerProficiency(undefined) === 90 && clampManagerProficiency(84.6) === 85,
    "clampManagerProficiency: 60→70, 95→90, NaN/undefined→90 (default), 84.6→85");
  {
    // Boosters come after the bonus and may exceed 99: s = 98 at 90 → +1 bonus, then +3.
    const base = toStats(cards[0]!.base);
    const hi = { ...base, ballControl: 98 };
    const r = simulateBuild({ base: hi, levelCap: 31, registeredPosition: "CF", config: { playerId: "1", maxLevel: 31, position: "CF", trainingPoints: emptyAllocation(), boosters: [true, false], managerProficiency: 90 }, boosters: [{ stats: { ballControl: 3 } }, null] });
    assert(r.proficiencyDeltas.ballControl === 1 && r.projectedStats.ballControl === 102, `98 + bonus 1 + booster 3 = 102 (got ${r.projectedStats.ballControl}; booster before bonus would give 101)`);
    const dflt = simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: { playerId: "1", maxLevel: 31, position: "CF", trainingPoints: emptyAllocation(), boosters: [false, false] }, boosters: [null, null] });
    assert(dflt.config.managerProficiency === MANAGER_PROFICIENCY_DEFAULT && BASE_STATS.some((s) => dflt.proficiencyDeltas[s] > 0), "a config without managerProficiency runs at the default 90");
    assert(simulateBuild({ base, levelCap: 31, registeredPosition: "CF", config: { playerId: "1", maxLevel: 31, position: "CF", trainingPoints: emptyAllocation(), boosters: [false, false], managerProficiency: 86 }, boosters: [null, null] }).managerProficiencyUnconfirmed,
      "BuildResult flags level 86 as unconfirmed");
  }

  // 7b. Regression: proficiency 70–76 equals the engine before the control on
  // the 261-card hub oracle (stats and the UNANCHORED estimate; the panel
  // passes the card overall, so its overall at the registered position
  // differs from the pre-change engine by the anchor).
  {
    let same = 0, n = 0;
    for (const c of cards) {
      const base = toStats(c.base);
      const alloc = toAlloc(c.alloc);
      const bs = [resolveBooster(c.b1, boosterTable), resolveBooster(c.b2, boosterTable)] as const;
      const before = addStats(base, applyTraining(alloc), applyBoosters(bs, [true, true]));
      for (const level of [70, 73, 76]) {
        n++;
        const r = simulateBuild({ base, levelCap: c.levelCap, registeredPosition: posOf(c), config: { playerId: "1", maxLevel: c.levelCap, position: posOf(c), trainingPoints: alloc, boosters: [true, true], managerProficiency: level }, boosters: bs });
        if (BASE_STATS.every((s) => r.projectedStats[s] === before[s] && r.proficiencyDeltas[s] === 0) && r.estimatedOvrExact === projectOvr(posOf(c), before) && r.ovrAnchor === null) same++;
      }
    }
    assert(same === n, `proficiency 70/73/76 reproduces the pre-change engine on ${pct(same, n)} oracle builds (stats + unanchored estimate)`);
  }

  // 7c. Feasible rate interval per level from the fixture cells: every shipped
  // rate lies inside, level 86 has none (the exception), no ambiguous cell.
  {
    const iv = new Map<number, { lo: number; hi: number; n: number }>();
    const cells86: Array<{ s: number; b: number }> = [];
    let atCap = 0, capOk = 0, ambiguous = 0, aboveCapped = 0;
    for (const c of pc) for (const [level, alloc, , shown] of c.builds) {
      const trained = addStats(toStats(c.base), applyTraining(toAlloc(alloc)));
      const boost = addStats(toStats(c.b1), toStats(c.b2));
      BASE_STATS.forEach((stat, i) => {
        const v = shown[i];
        if (v === null || v === undefined) return;
        const s = trained[stat];
        const b = v - s - boost[stat];
        if ((level === 83 && s === 66) || (level === 87 && s === 88)) ambiguous++;
        if (s >= 99) { atCap++; if (b === 0) capOk++; return; }
        if (s + b === 99 && boost[stat] > 0) aboveCapped++;
        if (level === 86) { cells86.push({ s, b }); return; }
        const t = iv.get(level) ?? { lo: 0, hi: Number.POSITIVE_INFINITY, n: 0 };
        t.n++;
        t.lo = Math.max(t.lo, b / s);
        if (s + b < 99) t.hi = Math.min(t.hi, (b + 1) / s);
        iv.set(level, t);
      });
    }
    assert(ambiguous === 0, `no fixture cell sits at an ambiguous point (s 66 @ 83, s 88 @ 87): ${ambiguous}`);
    assert(atCap === capOk, `stats already at 99+ after training gain no bonus: ${pct(capOk, atCap)}`);
    assert(aboveCapped > 0, `the fixture holds capped cells pushed above 99 by a booster (${aboveCapped})`);
    let inside = 0;
    for (let level = 70; level <= 90; level++) {
      if (level === 86) continue;
      const t = iv.get(level);
      const r = MANAGER_PROFICIENCY_RATES[level]!;
      const ok = !!t && t.lo <= r && r < t.hi;
      if (ok) inside++;
      console.log(`  level ${level}: n=${t?.n ?? 0} feasible r ∈ [${t?.lo.toFixed(5)}, ${t && Number.isFinite(t.hi) ? t.hi.toFixed(5) : "∞"}) width ${t && Number.isFinite(t.hi) ? (t.hi - t.lo).toFixed(5) : "∞"} · shipped ${r}${ok ? "" : "  ✗ OUTSIDE"}`);
    }
    assert(inside === 20, `every shipped rate lies inside the feasible interval of its level (${inside}/20)`);
    let lo86 = 0, hi86 = Number.POSITIVE_INFINITY;
    for (const { s, b } of cells86) { lo86 = Math.max(lo86, b / s); if (s + b < 99) hi86 = Math.min(hi86, (b + 1) / s); }
    assert(cells86.length >= 100 && lo86 >= hi86, `level 86: no single rate fits its ${cells86.length} cells (feasible interval [${lo86.toFixed(5)}, ${hi86.toFixed(5)}) is empty)`);
    const fit86 = cells86.filter(({ s, b }) => b === Math.min(99 - s, Math.floor((s + 6) / 32))).length;
    assert(fit86 === cells86.length, `level 86 exception floor((s + 6) / 32) reproduces ${pct(fit86, cells86.length)} cells`);
  }

  // 7d. Engine vs the fixture: every displayed stat, and the overall at the
  // registered position anchored (≥ 95 %, goalkeepers asserted on their own)
  // and unanchored (recorded).
  {
    let cellsN = 0, cellsOk = 0;
    const misses: string[] = [];
    const tally = { all: { n: 0, a: 0, u: 0 }, gk: { n: 0, a: 0, u: 0 } };
    for (const [ci, c] of pc.entries()) {
      const pos = POSITIONS[c.pos]!;
      let n = 0, a = 0, u = 0, cn = 0, co = 0;
      for (const [level, alloc, ovr, shown] of c.builds) {
        const ra = simulate(c, level, alloc, true);
        const ru = simulate(c, level, alloc, false);
        BASE_STATS.forEach((stat, i) => {
          const v = shown[i];
          if (v === null || v === undefined) return;
          cn++;
          if (ra.projectedStats[stat] === v) co++;
          else misses.push(`card ${ci} level ${level} ${stat}: engine ${ra.projectedStats[stat]} vs ${v}`);
        });
        n++;
        if (Math.abs(ra.estimatedOvr - ovr) <= 1) a++;
        if (Math.abs(ru.estimatedOvr - ovr) <= 1) u++;
      }
      cellsN += cn; cellsOk += co;
      for (const t of pos === "GK" ? [tally.all, tally.gk] : [tally.all]) { t.n += n; t.a += a; t.u += u; }
      console.log(`  card ${ci} (${pos}): ${n} builds · stats exact ${co}/${cn} · overall within ±1 anchored ${a}/${n}, unanchored ${u}/${n}`);
    }
    assert(cellsOk === cellsN && cellsN >= 5000, `displayed stats reproduced exactly: ${pct(cellsOk, cellsN)} cells${misses.length ? ` (${misses.slice(0, 5).join("; ")})` : ""}`);
    assert(tally.all.a / tally.all.n >= 0.95, `anchored overall within ±1 at the registered position: ${pct(tally.all.a, tally.all.n)} (≥ 95% required; unanchored ${pct(tally.all.u, tally.all.n)})`);
    assert(tally.gk.a / tally.gk.n >= 0.95, `… goalkeepers alone: anchored ${pct(tally.gk.a, tally.gk.n)} (≥ 95% required; unanchored ${pct(tally.gk.u, tally.gk.n)})`);
    assert(tally.all.a >= tally.all.u && tally.gk.a > tally.gk.u, "the anchor never loses builds and fixes goalkeeper builds");
  }

  // 7e. Anchor semantics: card overall − formula on the base stats (no
  // training, bonus or boosters); only at the registered position.
  {
    const c = pc.find((x) => POSITIONS[x.pos] === "SS")!;
    const base = toStats(c.base);
    const r90 = simulate(c, 90, c.builds[0]![1], true);
    const r70 = simulate(c, 70, c.builds[0]![1], true);
    const expected = c.ovr - projectOvr("SS", base);
    assert(Math.abs(r90.ovrAnchor! - expected) < 1e-12 && r90.ovrAnchor === r70.ovrAnchor && r90.ovrAnchor === ovrAnchor("SS", base, c.ovr), `anchor = card overall − formula(base) = ${expected.toFixed(3)}, the same at every proficiency`);
    const offPos = simulate(c, 90, c.builds[0]![1], true, "RWF");
    assert(offPos.ovrAnchor === null && offPos.estimatedOvrExact === projectOvr("RWF", offPos.projectedStats), "another position (full proficiency or not) is not anchored");
    assert(simulate(c, 90, c.builds[0]![1], false).ovrAnchor === null, "no card overall → no anchor");
  }

  // 7f. Max OVR: the linear DP + bonus + anchor against the sheet's own Max
  // OVR build; and the measured SS table (Max build 106/109/109/110, Reset
  // 94/97/97/97 at 70/80/85/90).
  {
    const ss = pc.find((x) => POSITIONS[x.pos] === "SS")!;
    const best = bestAllocation("SS", trainingPointsAvailable(ss.levelCap));
    const sheetMax = [8, 4, 12, 8, 7, 0, 0, 0, 0, 0];
    assert(TRAINING_CATEGORIES.every((cat, i) => best[cat] === sheetMax[i]), `SS card: Max OVR picks the sheet's build Shooting 8, Passing 4, Dribbling 12, Dexterity 8, Lower Body 7 (got ${JSON.stringify(best)})`);
    const table: Array<[number, number, number]> = [[70, 106, 94], [80, 109, 97], [85, 109, 97], [90, 110, 97]];
    for (const [level, maxOvr, resetOvr] of table) {
      const mx = ss.builds.find((b) => b[0] === level && b[4] === 1)!;
      const rs = ss.builds.find((b) => b[0] === level && b[1].every((v) => v === 0))!;
      const em = simulate(ss, level, TRAINING_CATEGORIES.map((cat) => best[cat]), true).estimatedOvr;
      const er = simulate(ss, level, rs[1], true).estimatedOvr;
      assert(mx[2] === maxOvr && rs[2] === resetOvr && Math.abs(em - maxOvr) <= 1 && Math.abs(er - resetOvr) <= 1,
        `SS at proficiency ${level}: Max ${em} vs measured ${maxOvr}, Reset ${er} vs measured ${resetOvr}`);
    }
    let n = 0, ok = 0, budgetOk = 0;
    for (const c of pc) {
      const pos = POSITIONS[c.pos]!;
      const budget = trainingPointsAvailable(c.levelCap);
      const alloc = bestAllocation(pos, budget);
      if (allocationCost(alloc) <= budget) budgetOk++;
      for (const [level, , ovr, , isMax] of c.builds) {
        if (isMax !== 1) continue;
        n++;
        if (Math.abs(simulate(c, level, TRAINING_CATEGORIES.map((cat) => alloc[cat]), true).estimatedOvr - ovr) <= 1) ok++;
      }
    }
    assert(budgetOk === pc.length, "Max OVR stays within the budget on every fixture card");
    assert(n >= 20 && ok === n, `engine Max OVR (linear DP + bonus + anchor) within ±1 of the sheet's Max OVR reading: ${pct(ok, n)}`);
    // The reference sheet's own Max OVR build does not move with the
    // proficiency level (one allocation per card across every level it was
    // read at) — the reason the preset stays the level-independent linear DP.
    const invariant = pc.filter((c) => new Set(c.builds.filter((b) => b[4] === 1).map((b) => b[1].join(","))).size === 1);
    const levelsRead = pc.reduce((s, c) => s + c.builds.filter((b) => b[4] === 1).length, 0);
    assert(invariant.length === 5 && levelsRead === n, `the sheet's Max OVR build is the same at every proficiency level on ${invariant.length}/5 cards with a recorded Max build (${levelsRead} readings)`);
  }
}

// ---------------------------------------------------------------- 8. Max OVR vs the bonus-aware optimum (spec "Max OVR Preset")
// bestAllocation maximises the linear estimate and ignores the Manager
// Proficiency bonus (its floors and the 99 cap). Independent reference: an
// exact grouped knapsack over the estimate WITH the bonus — every category is
// a group whose value is Σ w · (f(base + g) − f(base)), f(s) = s + bonus(s),
// except Aerial Strength and Goalkeeper 1, which share Jump and therefore
// form one joint group over every pair (Aerial, GK1). Boosters and the anchor
// are constants of the build, so the reference maximises the same unrounded
// estimate the panel shows. Asserted on every hub-oracle card at its
// registered position and at every level 70–90: the preset is never more than
// 1 below the optimum unrounded (so at most 1 below it displayed) and equal to
// it at 70–76, where there is no bonus.
{
  const bonusAwareBest = (p: Position, budget: number, base: StatVector, level: number): TrainingAllocation => {
    const B = Math.round(budget * 2);
    const w = (s: BaseStat) => OVR_WEIGHTS[p].w[BASE_STATS.indexOf(s)] ?? 0;
    const f = (s: number) => s + managerProficiencyBonus(level, s);
    const lift = (s: BaseStat, g: number) => w(s) * (f(base[s] + g) - f(base[s]));
    const gmax = maxGainForBudget(budget);
    type Opt = { cost: number; val: number; set: Partial<TrainingAllocation> };
    const groups: Opt[][] = [];
    for (const cat of TRAINING_CATEGORIES) {
      if (cat === "GK1") continue; // folded into the Aerial group
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
          if (v > next[u + o.cost]! + 1e-9) { next[u + o.cost] = v; ch[u + o.cost] = { prev: u, o }; }
        }
      }
      dp = next;
      back.push(ch);
    }
    let best = 0;
    for (let u = 1; u <= B; u++) if (dp[u]! > dp[best]! + 1e-9) best = u;
    const alloc = emptyAllocation();
    for (let i = groups.length - 1, u = best; i >= 0; i--) { const x = back[i]![u]!; Object.assign(alloc, x.o.set); u = x.prev; }
    return alloc;
  };

  let n = 0, below = 0, gapOver1 = 0, dispOver1 = 0, refWorse = 0, noBonusDiff = 0, overBudget = 0;
  let worstGap = 0;
  const dispGap = new Map<number, number>();
  for (const c of cards) {
    const p = posOf(c);
    const base = toStats(c.base);
    const budget = trainingPointsAvailable(c.levelCap);
    const bs = [resolveBooster(c.b1, boosterTable), resolveBooster(c.b2, boosterTable)] as const;
    const preset = bestAllocation(p, budget);
    for (let level = MANAGER_PROFICIENCY_MIN; level <= MANAGER_PROFICIENCY_MAX; level++) {
      const sim = (alloc: TrainingAllocation) =>
        simulateBuild({ base, levelCap: c.levelCap, registeredPosition: p, cardOvr: c.ovr, config: { playerId: "1", maxLevel: c.levelCap, position: p, trainingPoints: alloc, boosters: [true, true], managerProficiency: level }, boosters: bs });
      const ref = bonusAwareBest(p, budget, base, level);
      if (allocationCost(ref) > budget) overBudget++;
      const rp = sim(preset);
      const rr = sim(ref);
      const gap = rr.estimatedOvrExact - rp.estimatedOvrExact;
      n++;
      if (gap < -1e-9) refWorse++;
      if (gap > 1e-9) below++;
      if (gap >= 1) gapOver1++;
      worstGap = Math.max(worstGap, gap);
      const dg = rr.estimatedOvr - rp.estimatedOvr;
      dispGap.set(dg, (dispGap.get(dg) ?? 0) + 1);
      if (dg > 1) dispOver1++;
      if (level <= 76 && Math.abs(gap) > 1e-9) noBonusDiff++;
    }
  }
  assert(overBudget === 0 && refWorse === 0, `bonus-aware reference stays within budget and never scores below the preset (${n} card × level pairs)`);
  assert(noBonusDiff === 0, "levels 70–76 (no bonus): the preset is exactly the optimum");
  assert(gapOver1 === 0 && dispOver1 === 0,
    `preset vs bonus-aware optimum, 261 cards × 21 levels: below it on ${pct(below, n)}, worst unrounded gap ${worstGap.toFixed(3)} (< 1 required), displayed gap ${JSON.stringify([...dispGap].sort((a, b) => a[0] - b[0]))} (≤ 1 required)`);
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ progression tests passed");
