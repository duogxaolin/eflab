// Oracle tests for the detail page's match state (change efootbase-s4-measure):
// the weak-foot chips, Position Training and their place in the engine.
// Run: tsx packages/shared/src/match-state.test.ts  (pnpm --filter @eflab/shared test)
//
// Two fixtures, numbers only (readings of a public page taken 2026-10-23 and
// 2026-10-27, outside the repository; anonymous ids):
//   · `__fixtures__/weak-foot-oracle.json` — `chips`: the chip table by
//     weak-foot accuracy (Ball Control, Low Pass, Lofted Pass, Finishing, Curl);
//     `readings`: [card, accuracy, usage, the five stats before the deduction
//     (after the proficiency band, the cut at 99 and the form offset of the
//     state read; before the boosters), the five chips read, the booster part
//     read, the five values shown] — 13 states of 7 cards (w1 … w7).
//   · `__fixtures__/position-training-oracle.json` — 8 cards (p1 … p8: seven
//     outfield cards and one goalkeeper): registered position (POSITIONS
//     index), height, weak-foot accuracy, the 13 aptitude codes (0 full,
//     1 half, 2 none), the 26 stats the overall reads in the state read
//     (BASE_STATS order: the shown value with any weak-foot / stamina
//     deduction added back), the 13 tiles before and after the toggle was
//     turned on (POSITIONS order) and the trained positions read (POSITIONS
//     indices). p2's stats are not a reading: the survey saved no full stat
//     list of that state, so they were rebuilt by the engine from the card's
//     local data and the build of the reading (proficiency 90, boosters on);
//     its 13 tiles before training reproduce the reading, which checks the
//     rebuild. The rebuild is not circular: an independent outside-repo
//     survey reading of the same card (the compare build with a manager whose
//     +1 is on Finishing and Offensive Awareness — the radar fixture's third
//     build) minus that +1 equals all 26 of p2's stats.
import { readFileSync } from "node:fs";
import { BASE_STATS, POSITIONS, TRAINING_CATEGORIES, proficiencyFromAptitude, type BaseStat, type Position } from "./constants";
import {
  MATCH_STATE_OFF,
  WEAK_FOOT_CHIPS,
  WEAK_FOOT_CHIP_STATS,
  WEAK_FOOT_FLOOR,
  bestFitPosition,
  emptyAllocation,
  exactOvr,
  positionTiles,
  simulateBuild,
  trainedAptitudes,
  trainedPositions,
  weakFootChipsAvailable,
  weakFootDeltas,
  zeroStats,
  type BoosterVector,
  type StatVector,
  type TrainingAllocation,
} from "./progression";
import { PITCH_GRID, PITCH_NEIGHBOURS, PITCH_ROWS, pitchNeighbours } from "./pitch";
import { matchStateForCard, simulateCardBuild, statBreakdown, type HeldMatchState, type SimulatedCard } from "./build";
import type { BuildResult, MatchState } from "./types";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

const toStats = (arr: number[]): StatVector => Object.fromEntries(BASE_STATS.map((s, i) => [s, arr[i] ?? 0])) as StatVector;
const toAlloc = (arr: number[]): TrainingAllocation => Object.fromEntries(TRAINING_CATEGORIES.map((c, i) => [c, arr[i] ?? 0])) as TrainingAllocation;
const aptFrom = (arr: number[]) => Object.fromEntries(POSITIONS.map((p, i) => [p, arr[i]!])) as Record<Position, number>;
const sparse = (v: number[]): BoosterVector => Object.fromEntries(BASE_STATS.flatMap((s, i) => ((v[i] ?? 0) !== 0 ? [[s, v[i]!]] : []))) as BoosterVector;
const numbersOnly = (doc: unknown, idPattern: RegExp): string[] => {
  const bad: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (!idPattern.test(v)) bad.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      if (!/^(chips|readings|cards|pos|height|wf|apt|stats|before|after|trained|[0-3])$/.test(k) && !idPattern.test(k)) bad.push(`key ${k}`);
      walk(x);
    }
  };
  walk(doc);
  return bad;
};

// ================================================================ weak foot
type WfReading = [string, number, number, number[], number[], number[], number[]];
const wf = JSON.parse(readFileSync(new URL("./__fixtures__/weak-foot-oracle.json", import.meta.url), "utf8")) as { chips: Record<string, number[]>; readings: WfReading[] };

// ---------------------------------------------------------------- 1. weak-foot fixture shape
{
  const bad = numbersOnly(wf, /^w[1-9]$/);
  assert(bad.length === 0, `weak-foot fixture holds numbers and anonymous ids only (${bad.slice(0, 3).join("; ") || "ok"})`);
  assert(wf.readings.length === 13 && new Set(wf.readings.map((r) => r[0])).size === 7, `13 weak-foot states of 7 cards (${wf.readings.length}, ${new Set(wf.readings.map((r) => r[0])).size})`);
  const cardsAt = (acc: number) => new Set(wf.readings.filter((r) => r[1] === acc).map((r) => r[0])).size;
  assert(cardsAt(2) === 3 && cardsAt(1) === 2 && cardsAt(0) === 2, `cards per accuracy: 2 → ${cardsAt(2)}, 1 → ${cardsAt(1)}, 0 → ${cardsAt(0)} (3 / 2 / 2)`);
}

// ---------------------------------------------------------------- 2. the chip table against every reading
{
  assert(
    Object.keys(WEAK_FOOT_CHIPS).join() === "0,1,2" && ["0", "1", "2"].every((a) => WEAK_FOOT_CHIP_STATS.every((s, i) => WEAK_FOOT_CHIPS[Number(a)]![s] === wf.chips[a]![i])),
    "WEAK_FOOT_CHIPS = the measured table (0: 7/15/15/15/24, 1: 4/11/11/11/17, 2: 2/7/7/7/10); accuracy 3 not built",
  );
  let cells = 0, ok = 0, shownOk = 0;
  const floors = new Set<string>();
  const miss: string[] = [];
  for (const [card, acc, , before, chips, boost, shown] of wf.readings) {
    const s1 = zeroStats();
    WEAK_FOOT_CHIP_STATS.forEach((s, i) => (s1[s] = before[i]!));
    const d = weakFootDeltas(s1, acc);
    WEAK_FOOT_CHIP_STATS.forEach((s, i) => {
      cells++;
      if (d[s] === chips[i]) ok++;
      else miss.push(`${card} acc ${acc} ${s} ${before[i]}: ${d[s]} vs ${chips[i]}`);
      if (before[i]! + d[s] + boost[i]! === shown[i]) shownOk++;
      if (before[i]! - WEAK_FOOT_CHIPS[acc]![s] < WEAK_FOOT_FLOOR) floors.add(`${card}:${s}:${before[i]}`);
    });
    // The other 21 stats get nothing.
    if (BASE_STATS.some((s) => !(WEAK_FOOT_CHIP_STATS as readonly string[]).includes(s) && d[s] !== 0)) miss.push(`${card} a non-chip stat moved`);
  }
  assert(ok === cells && miss.length === 0, `every measured chip reproduced: ${ok}/${cells}${miss.length ? ` (${miss.slice(0, 4).join("; ")})` : ""}`);
  assert(shownOk === cells, `before + chip + boosters = the shown value on every cell (${shownOk}/${cells}): the boosters come after the deduction`);
  const floorCards = new Set([...floors].map((f) => f.split(":")[0]));
  assert(floors.size === 11 && floorCards.size === 4, `the floor at 40: ${floors.size} distinct cells on ${floorCards.size} cards (11 on 4)`);
  // Usage does not change the chips (accuracy 0 and 2 were read with usage 0 and 1).
  const usages = (acc: number) => new Set(wf.readings.filter((r) => r[1] === acc).map((r) => r[2]));
  assert(usages(0).size === 2 && usages(2).size === 2, "accuracies 0 and 2 were read at two weak-foot usages with the same table");
}

// ---------------------------------------------------------------- 3. spec scenarios and edge cases
{
  const one = (acc: number, over: Partial<StatVector>) => weakFootDeltas({ ...zeroStats(), ballControl: 80, lowPass: 80, loftedPass: 80, finishing: 80, curl: 80, ...over }, acc);
  const a2 = one(2, { lowPass: 80 });
  assert(a2.lowPass === -7 && a2.ballControl === -2 && a2.loftedPass === -7 && a2.finishing === -7 && a2.curl === -10, "accuracy 2: Low Pass 80 → 73 (−7), Ball Control −2, Lofted Pass and Finishing −7, Curl −10");
  assert(one(0, { curl: 91 }).curl === -24 && one(1, { ballControl: 58 }).ballControl === -4 && one(1, { ballControl: 90 }).ballControl === -4, "accuracy 0: Curl 91 → 67 (−24); accuracy 1: Ball Control 58 → 54 and 90 → 86 (−4 both)");
  assert(one(2, { finishing: 41 }).finishing === -1, "floor: accuracy 2, Finishing 41 → 40 (chip −1)");
  assert(one(0, { finishing: 38 }).finishing === 0 && one(0, { finishing: 40 }).finishing === 0, "below the floor: a stat of 38 keeps 38, a stat of 40 keeps 40 (never raised, no chip)");
  let never = true;
  for (let acc = 0; acc <= 2; acc++) for (let v = 1; v <= 120; v++) {
    const d = one(acc, { finishing: v, curl: v });
    if (d.finishing > 0 || d.curl > 0 || (v >= WEAK_FOOT_FLOOR && (v + d.finishing < WEAK_FOOT_FLOOR || v + d.curl < WEAK_FOOT_FLOOR)) || (v < WEAK_FOOT_FLOOR && (d.finishing !== 0 || d.curl !== 0))) never = false;
  }
  assert(never, "for every value 1–120 and accuracy 0–2 a chip never raises a stat and never takes one below 40");
  const unavailable = [3, 4, -1, 1.5, Number.NaN, null, undefined];
  assert(
    unavailable.every((a) => !weakFootChipsAvailable(a) && BASE_STATS.every((s) => one(a as number, {})[s] === 0)) && [0, 1, 2].every((a) => weakFootChipsAvailable(a)),
    "accuracy 3 (one card read), out of range or not a whole number → unavailable and zero deltas; 0–2 available",
  );
}

// ================================================================ pitch grid and Position Training
type PtCard = { pos: number; height: number; wf: number; apt: number[]; stats: number[]; before: number[]; after: number[]; trained: number[] };
const pt = JSON.parse(readFileSync(new URL("./__fixtures__/position-training-oracle.json", import.meta.url), "utf8")) as { cards: Record<string, PtCard> };

// ---------------------------------------------------------------- 4. the grid neighbours
{
  // The spec's table (capability efootbase-s4-measure, "Position Training Toggle").
  const SPEC: Record<Position, Position[]> = {
    CF: ["SS", "LWF", "RWF"], SS: ["CF", "AMF", "LWF", "RWF"], AMF: ["SS", "CMF", "LMF", "RMF"], CMF: ["AMF", "DMF", "LMF", "RMF"],
    DMF: ["CMF", "CB", "LMF", "RMF"], CB: ["DMF", "GK", "LB", "RB"], LWF: ["CF", "SS", "LMF"], RWF: ["CF", "SS", "RMF"],
    LMF: ["LWF", "AMF", "CMF", "DMF", "LB"], RMF: ["RWF", "AMF", "CMF", "DMF", "RB"], LB: ["LMF", "CB", "GK"], RB: ["RMF", "CB", "GK"], GK: ["CB", "LB", "RB"],
  };
  const same = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();
  assert(POSITIONS.every((p) => same(PITCH_NEIGHBOURS[p], SPEC[p])), "PITCH_NEIGHBOURS = the spec's grid neighbours for all 13 positions");
  assert(POSITIONS.every((p) => PITCH_NEIGHBOURS[p].every((q) => PITCH_NEIGHBOURS[q].includes(p))), "the neighbour relation is symmetric");
  // The geometry the Pitch Map draws: centre column of seven one-row cells,
  // side columns of 2 / 3 / 2 rows; the cells tile the 3 × 7 grid exactly once.
  const covered = new Map<string, Position>();
  let overlap = false;
  for (const p of POSITIONS) {
    const c = PITCH_GRID[p];
    for (let r = c.row; r < c.row + c.rowSpan; r++) {
      const key = `${c.col}:${r}`;
      if (covered.has(key)) overlap = true;
      covered.set(key, p);
    }
  }
  assert(!overlap && covered.size === 3 * PITCH_ROWS, `PITCH_GRID tiles the 3 × ${PITCH_ROWS} grid exactly once (${covered.size} cells)`);
  const spans = (col: number) => POSITIONS.filter((p) => PITCH_GRID[p].col === col).sort((a, b) => PITCH_GRID[a].row - PITCH_GRID[b].row).map((p) => `${p}:${PITCH_GRID[p].rowSpan}`).join(" ");
  assert(spans(1) === "LWF:2 LMF:3 LB:2" && spans(3) === "RWF:2 RMF:3 RB:2" && spans(2) === "CF:1 SS:1 AMF:1 CMF:1 DMF:1 CB:1 GK:1", `row spans: left ${spans(1)} · centre ${spans(2)} · right ${spans(3)}`);
  // Moving one cell changes the derived neighbours (the map and the rule share the geometry).
  const moved = pitchNeighbours({ ...PITCH_GRID, LMF: { col: 1, row: 3, rowSpan: 2 }, LB: { col: 1, row: 5, rowSpan: 3 } });
  assert(!same(moved.LB, PITCH_NEIGHBOURS.LB), "a different row span gives different neighbours (derived from the geometry, not copied)");
}

// ---------------------------------------------------------------- 5. Position Training against the readings
{
  const bad = numbersOnly(pt, /^p[1-9]$/);
  assert(bad.length === 0, `Position Training fixture holds numbers and anonymous ids only (${bad.slice(0, 3).join("; ") || "ok"})`);
  const cards = Object.entries(pt.cards);
  const outfield = cards.filter(([, c]) => POSITIONS[c.pos] !== "GK");
  const regs = new Set(outfield.map(([, c]) => POSITIONS[c.pos]));
  assert(cards.length === 8 && outfield.length === 7 && regs.size === 4, `7 outfield cards of 4 registered positions (${[...regs].join(", ")}) + 1 goalkeeper`);
  let setOk = 0, before = 0, after = 0, untouched = 0, untouchedN = 0, tilesN = 0;
  const miss: string[] = [];
  for (const [id, c] of cards) {
    const reg = POSITIONS[c.pos]!;
    const apt = aptFrom(c.apt);
    const got = trainedPositions(reg, apt);
    const want = c.trained.map((i) => POSITIONS[i]!);
    if (got.join() === want.join()) setOk++;
    else miss.push(`${id} trained ${got.join(" ")} vs ${want.join(" ")}`);
    const stats = toStats(c.stats);
    const body = { height: c.height, weakFootAccuracy: c.wf };
    const t0 = positionTiles(stats, body, apt);
    const t1 = positionTiles(stats, body, trainedAptitudes(apt, got));
    POSITIONS.forEach((p, i) => {
      tilesN++;
      if (t0[p] === c.before[i]) before++;
      else miss.push(`${id} ${p} before ${t0[p]} vs ${c.before[i]}`);
      if (t1[p] === c.after[i]) after++;
      else miss.push(`${id} ${p} after ${t1[p]} vs ${c.after[i]}`);
      if (!got.includes(p)) {
        untouchedN++;
        if (t1[p] === t0[p] && c.after[i] === c.before[i]) untouched++;
      }
    });
  }
  assert(setOk === cards.length, `trainedPositions = the trained set read on every card (${setOk}/${cards.length})${miss.length ? ` — ${miss.slice(0, 4).join("; ")}` : ""}`);
  assert(before === tilesN && after === tilesN, `the 13 tiles before (${before}/${tilesN}) and after (${after}/${tilesN}) the toggle: the formula with the trained positions at full`);
  assert(untouched === untouchedN, `every tile outside the trained set is unchanged (${untouched}/${untouchedN})`);
  // Spec scenarios, by card.
  const tile = (id: string, p: Position) => [pt.cards[id]!.before[POSITIONS.indexOf(p)], pt.cards[id]!.after[POSITIONS.indexOf(p)]].join("→");
  assert(tile("p1", "CF") === "78→98" && tile("p1", "SS") === "82→104", "registered RWF, no half positions: CF 78 → 98, SS 82 → 104");
  assert(tile("p2", "LWF") === "104→108" && tile("p2", "RMF") === "102→106", "half positions first: LWF 104 → 108, RMF 102 → 106");
  assert(tile("p3", "RB") === "96→101" && tile("p3", "DMF") === "82→103" && tile("p3", "RMF") === "89→93", "registered CB: RB 96 → 101, DMF 82 → 103 (a grid neighbour), RMF 89 → 93");
  assert(trainedPositions("GK", aptFrom(pt.cards.p8!.apt)).length === 0 && pt.cards.p8!.before.join() === pt.cards.p8!.after.join(), "a goalkeeper trains nothing and no tile changes");
  // p2's engine-rebuilt stats against an independent reading: the radar fixture's third build (the same card's
  // compare build with a manager whose +1 is on Finishing and Offensive Awareness) minus that +1.
  const radar = JSON.parse(readFileSync(new URL("./__fixtures__/radar-oracle.json", import.meta.url), "utf8")) as { builds: Array<{ stats: number[] }> };
  const viaReading = radar.builds[2]!.stats.map((v, i) => v - (BASE_STATS[i] === "finishing" || BASE_STATS[i] === "offensiveAwareness" ? 1 : 0));
  const same26 = viaReading.filter((v, i) => v === pt.cards.p2!.stats[i]).length;
  assert(same26 === 26, `p2's rebuilt stats equal an independent reading of the same build (minus the manager's +1): ${same26}/26`);
  // Untested registrations follow the same rule on the grid (inferred, not measured).
  const none = aptFrom(new Array(13).fill(2));
  assert(trainedPositions("DMF", { ...none, DMF: 0 }).join() === "CB,CMF,LMF,RMF" && trainedPositions("LB", { ...none, LB: 0, CB: 0 }).join() === "LMF", "other registrations use the grid neighbours (DMF → CB, CMF, LMF, RMF; LB with CB full → LMF; GK never)");
  // Best Fit keeps the registered position on a tie (the reference breaks such ties differently).
  const p4 = pt.cards.p4!;
  const p4Tiles = Object.fromEntries(POSITIONS.map((p, i) => [p, p4.after[i]!])) as Record<Position, number>;
  assert(p4Tiles.LWF === p4Tiles.RWF && bestFitPosition(p4Tiles, "LWF") === "LWF", "a trained tile equal to the registered one: Best Fit names the registered position (LWF 101 = RWF 101 → LWF)");
}

// ================================================================ the engine with a match state
interface ExactCard {
  pos: number; height: number; wf: number; levelCap: number; apt: number[]; base: number[]; b1: number[]; b2: number[];
  builds: Record<"A" | "C" | "M", number[]>; maxOvr: Array<[number, number]>;
}
type Reading = [string, "A" | "C", number, number[], number[], number[], number];
const exact = JSON.parse(readFileSync(new URL("./__fixtures__/exact-model-oracle.json", import.meta.url), "utf8")) as { cards: Record<string, ExactCard>; readings: Reading[] };
interface ProgCard { pos: number; levelCap: number; base: number[]; alloc: number[]; b1: number | null; b2: number | null }
const prog = JSON.parse(readFileSync(new URL("./__fixtures__/progression-oracle.json", import.meta.url), "utf8")) as { cards: ProgCard[]; boosters: Record<string, BoosterVector> };

const NEW_FIELDS = new Set(["weakFootDeltas", "shownStats", "trainedPositions", "untrainedTiles"]);
const oldFields = (r: BuildResult) => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !NEW_FIELDS.has(k))));
const neutral = (r: BuildResult) =>
  BASE_STATS.every((s) => r.weakFootDeltas[s] === 0 && r.shownStats[s] === r.projectedStats[s]) && r.trainedPositions.length === 0 && POSITIONS.every((p) => r.untrainedTiles[p] === r.tiles[p]);

const exactInput = (c: ExactCard, b: "A" | "C" | "M", level: number, pills: number[], matchState?: MatchState) => ({
  base: toStats(c.base), levelCap: c.levelCap, height: c.height, weakFootAccuracy: c.wf,
  config: { playerId: "x", maxLevel: c.levelCap, position: POSITIONS[c.pos]!, trainingPoints: toAlloc(c.builds[b]), boosters: [true, true] as [boolean, boolean], managerProficiency: level },
  boosters: [{ stats: sparse(c.b1) }, { stats: sparse(c.b2) }] as const, positionAptitudes: aptFrom(c.apt),
  manager: pills.length ? { stats: pills.map((i) => BASE_STATS[i]!) } : null,
  registeredPosition: POSITIONS[c.pos]!, ...(matchState ? { matchState } : {}),
});

// ---------------------------------------------------------------- 6. match state off = the result without it
{
  let n = 0, same = 0, neutralN = 0, shownOk = 0;
  for (const [id, b, level, pills, shown] of exact.readings) {
    const c = exact.cards[id]!;
    const plain = simulateBuild({ ...exactInput(c, b, level, pills), registeredPosition: undefined });
    const off = simulateBuild(exactInput(c, b, level, pills, { ...MATCH_STATE_OFF }));
    n++;
    if (JSON.stringify(plain) === JSON.stringify(off) && oldFields(plain) === oldFields(off)) same++;
    if (neutral(plain) && neutral(off)) neutralN++;
    if (BASE_STATS.every((s, i) => off.shownStats[s] === shown[i])) shownOk++;
  }
  assert(same === n && neutralN === n, `exact-model oracle: with the match state off (or omitted) the result is identical on ${same}/${n} readings, weak-foot zeros / shown = projected / nothing trained on ${neutralN}/${n}`);
  assert(shownOk === n, `… and shownStats equal efootbase's displayed stats on ${shownOk}/${n} readings`);
  const booster = (id: number | null) => (id && prog.boosters[String(id)] ? { stats: prog.boosters[String(id)]! } : null);
  let pn = 0, psame = 0;
  for (const c of prog.cards) {
    const base = {
      base: toStats(c.base), levelCap: c.levelCap, height: 180, weakFootAccuracy: 2,
      config: { playerId: "x", maxLevel: c.levelCap, position: POSITIONS[c.pos]!, trainingPoints: toAlloc(c.alloc), boosters: [true, true] as [boolean, boolean] },
      boosters: [booster(c.b1), booster(c.b2)] as const,
    };
    const plain = simulateBuild(base);
    const off = simulateBuild({ ...base, registeredPosition: POSITIONS[c.pos]!, matchState: null });
    pn++;
    if (JSON.stringify(plain) === JSON.stringify(off) && neutral(plain)) psame++;
  }
  assert(psame === pn, `progression oracle: match state off = no match state on ${psame}/${pn} cards`);
}

// ---------------------------------------------------------------- 7. weak foot on through the engine
{
  let n = 0, formulaSame = 0, onlyFive = 0, neverRaised = 0, acc3 = 0;
  for (const [id, b, level, pills] of exact.readings) {
    const c = exact.cards[id]!;
    const off = simulateBuild(exactInput(c, b, level, pills, MATCH_STATE_OFF));
    const on = simulateBuild(exactInput(c, b, level, pills, { weakFoot: true, positionTraining: false }));
    n++;
    if (oldFields(on) === oldFields(off) && POSITIONS.every((p) => on.untrainedTiles[p] === off.tiles[p])) formulaSame++;
    const chipStats = WEAK_FOOT_CHIP_STATS as readonly BaseStat[];
    const others = BASE_STATS.every((s) => chipStats.includes(s) || on.shownStats[s] === off.shownStats[s]);
    // A card of accuracy 3 (c1 here) has no measured chips: nothing moves.
    const chipsMoved = chipStats.some((s) => on.shownStats[s] !== off.shownStats[s]);
    if (!weakFootChipsAvailable(c.wf)) acc3++;
    if (others && chipsMoved === weakFootChipsAvailable(c.wf)) onlyFive++;
    if (BASE_STATS.every((s) => on.weakFootDeltas[s] <= 0 && on.shownStats[s] === on.projectedStats[s] + on.weakFootDeltas[s])) neverRaised++;
  }
  assert(formulaSame === n, `weak foot on: overall, 13 tiles and projectedStats identical to off on ${formulaSame}/${n} readings`);
  assert(onlyFive === n && neverRaised === n && acc3 > 0 && acc3 < n, `weak foot on: shownStats differ on the five chip stats only, and not at all at accuracy 3 (${onlyFive}/${n}; ${acc3} readings at accuracy 3); deltas ≤ 0 and shown = projected + weak foot (${neverRaised}/${n})`);
  // Spec "Boosters and manager stay on top": Finishing 60 before boosters, accuracy 2, a +4 booster → 57; a manager's +1 after it → 58.
  // Away from the floor a flat chip and a booster commute (60 − 7 + 4 = 60 + 4 − 7), so these two pin the
  // sum only; the floor cases below pin WHICH value the chip is taken from.
  const base = toStats(new Array(26).fill(60));
  const sim = (manager: boolean, finishing = 60, booster = true) =>
    simulateBuild({
      base: { ...base, finishing }, levelCap: 30, height: 180, weakFootAccuracy: 2,
      config: { playerId: "x", maxLevel: 30, position: "CF", trainingPoints: emptyAllocation(), boosters: [booster, false], managerProficiency: 70 },
      boosters: [{ stats: { finishing: 4 } }, null], manager: manager ? { stats: ["finishing"] } : null,
      registeredPosition: "CF", matchState: { weakFoot: true, positionTraining: false },
    });
  const r = sim(false);
  const rm = sim(true);
  assert(r.shownStats.finishing === 57 && r.weakFootDeltas.finishing === -7 && r.boosterDeltas.finishing === 4 && r.projectedStats.finishing === 64, "Finishing 60 − 7 + 4 = 57 with the chip and the booster (the overall reads 64)");
  assert(rm.shownStats.finishing === 58 && rm.managerDeltas.finishing === 1, "a selected manager's +1 is added after the deduction (58)");
  // The order against the boosters and the manager matters only at the floor of 40 (no reading floored a stat that
  // also had a booster or a manager: the order is eFootLab's inference). Two floor cases through the engine
  // (proficiency 70, so s1 = base) pin it — the chip is taken from s1, never from s1 + boosters (or the
  // projected value) nor from s1 + manager:
  //   (a) s1 41 + a +4 booster, accuracy 2: chip max(40, 41 − 7) − 41 = −1 → shown 41 − 1 + 4 = 44
  //       (from s1 + booster: max(40, 45 − 7) − 45 = −5 → 40);
  //   (b) s1 46 + the manager's +1, accuracy 2: chip max(40, 46 − 7) − 46 = −6 → shown 46 − 6 + 1 = 41
  //       (from s1 + manager: max(40, 47 − 7) − 47 = −7 → 40).
  const fa = sim(false, 41, true);
  assert(fa.weakFootDeltas.finishing === -1 && fa.shownStats.finishing === 44 && fa.projectedStats.finishing === 45, `floor with a booster: s1 41, +4 booster, accuracy 2 → chip −1, shown 44 (got ${fa.weakFootDeltas.finishing}, ${fa.shownStats.finishing})`);
  const fb = sim(true, 46, false);
  assert(fb.weakFootDeltas.finishing === -6 && fb.shownStats.finishing === 41 && fb.projectedStats.finishing === 47, `floor with a manager: s1 46, manager +1, accuracy 2 → chip −6, shown 41 (got ${fb.weakFootDeltas.finishing}, ${fb.shownStats.finishing})`);
  // 98 + 4 training at proficiency 90 → cut to 99 → 92 at accuracy 2: pins that the deduction is subtracted from
  // the cut value (not min(99, 102 − 7) = 95). Whether the delta is COMPUTED from the value before or after the
  // cut is an equivalent mutant here and everywhere — a chip of at most 24 only meets the floor near 40, far from
  // 99 — so this case proves nothing about that.
  const hot = simulateBuild({
    base: { ...base, finishing: 98 }, levelCap: 30, height: 180, weakFootAccuracy: 2,
    config: { playerId: "x", maxLevel: 30, position: "CF", trainingPoints: { ...emptyAllocation(), Shooting: 4 }, boosters: [false, false], managerProficiency: 90 },
    boosters: [null, null], registeredPosition: "CF", matchState: { weakFoot: true, positionTraining: false },
  });
  assert(hot.projectedStats.finishing === 99 && hot.weakFootDeltas.finishing === -7 && hot.shownStats.finishing === 92, "a stat cut to 99 shows 99 − 7 = 92 with the chip (98 + 4 → 99 → 92)");
  // Accuracy 3: no chip, no change.
  const at3 = simulateBuild({ ...exactInput(exact.cards.c3!, "C", 90, [], { weakFoot: true, positionTraining: false }), weakFootAccuracy: 3 });
  assert(BASE_STATS.every((s) => at3.weakFootDeltas[s] === 0 && at3.shownStats[s] === at3.projectedStats[s]), "accuracy 3: the toggle changes no stat (not built)");
  // Stat breakdown: base + training + cut + proficiency + weak foot + boosters + manager = shown.
  const rows = Object.values(statBreakdown(rm));
  assert(rows.length === 26 && rows.every((x) => x.base + x.training + x.cut + x.proficiency + x.weakFoot + x.boosters + x.manager === x.shown) && statBreakdown(rm).finishing.weakFoot === -7, "Stat breakdown: a weak-foot part (≤ 0) and the parts add up to the shown value on all 26 stats");
}

// ---------------------------------------------------------------- 8. Position Training through the engine
{
  let n = 0, statsSame = 0, onlyTrained = 0, faceSame = 0, profOk = 0;
  for (const [id, b, level, pills] of exact.readings) {
    const c = exact.cards[id]!;
    const reg = POSITIONS[c.pos]!;
    const off = simulateBuild(exactInput(c, b, level, pills, MATCH_STATE_OFF));
    const on = simulateBuild(exactInput(c, b, level, pills, { weakFoot: false, positionTraining: true }));
    n++;
    if (BASE_STATS.every((s) => on.projectedStats[s] === off.projectedStats[s] && on.shownStats[s] === off.shownStats[s])) statsSame++;
    const expected = trainedPositions(reg, aptFrom(c.apt));
    if (on.trainedPositions.join() === expected.join() && POSITIONS.every((p) => (expected.includes(p) ? on.tiles[p] === exactOvr(p, on.projectedStats, { height: c.height, weakFootAccuracy: c.wf }, "full") : on.tiles[p] === off.tiles[p]))) onlyTrained++;
    if (POSITIONS.every((p) => on.untrainedTiles[p] === off.tiles[p]) && on.overall === off.overall) faceSame++;
    const atTrained = expected[0];
    if (atTrained) {
      const moved = simulateBuild({ ...exactInput(c, b, level, pills, { weakFoot: false, positionTraining: true }), config: { ...exactInput(c, b, level, pills).config, position: atTrained } });
      if (moved.proficiency === "full" && moved.overall === moved.tiles[atTrained] && moved.untrainedTiles[atTrained] === positionTiles(moved.projectedStats, { height: c.height, weakFootAccuracy: c.wf }, aptFrom(c.apt))[atTrained]) profOk++;
    } else profOk++;
  }
  assert(statsSame === n, `Position Training on: every stat identical on ${statsSame}/${n} readings`);
  assert(onlyTrained === n, `… only the trained tiles change, each now at full proficiency (${onlyTrained}/${n})`);
  assert(faceSame === n, `… the untrained tiles (the card face) and the overall at the registered position are unchanged (${faceSame}/${n})`);
  assert(profOk === n, `… at a trained position the panel overall and its proficiency read full, the untrained tile keeps the card's own (${profOk}/${n})`);
  // The registered position, never the selected one: a GK card moved to CF trains nothing; no registered position → nothing.
  const gk = exact.cards.c2!;
  const gkAtCf = simulateBuild({ ...exactInput(gk, "C", 90, [], { weakFoot: false, positionTraining: true }), config: { ...exactInput(gk, "C", 90, []).config, position: "CF" } });
  const noReg = simulateBuild({ ...exactInput(exact.cards.c1!, "C", 90, [], { weakFoot: false, positionTraining: true }), registeredPosition: undefined });
  assert(POSITIONS[gk.pos] === "GK" && gkAtCf.trainedPositions.length === 0 && noReg.trainedPositions.length === 0, "trains from the registered position: a goalkeeper at CF trains nothing; without a registered position nothing is trained");
  // simulateCardBuild passes the card's registered position and the match state.
  const c1 = exact.cards.c1!;
  const card: SimulatedCard = {
    id: "1", cardType: "EPIC", levelCap: c1.levelCap, registeredPosition: c1.pos, booster1: { stats: sparse(c1.b1) }, booster2: { stats: sparse(c1.b2) },
    stats: toStats(c1.base), height: c1.height, weakFootAccuracy: 1, positionAptitudes: aptFrom(c1.apt),
  };
  const build = { allocation: toAlloc(c1.builds.C), maxLevel: c1.levelCap, managerProficiency: 90, booster1: "full" as const, booster2: "full" as const };
  const plainCard = simulateCardBuild(card, build, "CF", { manager: null, second: null });
  const both = simulateCardBuild(card, build, "CF", { manager: null, second: null, matchState: { weakFoot: true, positionTraining: true } });
  const s1 = Object.fromEntries(BASE_STATS.map((s) => [s, both.projectedStats[s] - both.boosterDeltas[s] - both.managerDeltas[s]])) as StatVector;
  const wantChips = weakFootDeltas(s1, 1);
  assert(
    neutral(plainCard) && both.trainedPositions.join() === trainedPositions(POSITIONS[c1.pos]!, aptFrom(c1.apt)).join() && BASE_STATS.every((s) => both.weakFootDeltas[s] === wantChips[s]) && wantChips.curl < 0,
    "simulateCardBuild: no match state → neutral; with both toggles → the card's trained set (from its registered position) and the accuracy-1 chips",
  );
  assert(proficiencyFromAptitude(aptFrom(c1.apt).GK) === "none" && both.proficiency === proficiencyFromAptitude(trainedAptitudes(aptFrom(c1.apt), both.trainedPositions).CF), "the result's proficiency follows the trained aptitudes at the selected position");
}

// ---------------------------------------------------------------- 9. tamper cases (the oracles notice another rule)
{
  // Weak foot: the floor dropped, or a rate instead of a flat chip.
  const replay = (fn: (before: number, acc: number, i: number) => number) => {
    let ok = 0, n = 0;
    for (const [, acc, , before, chips] of wf.readings) before.forEach((b, i) => { n++; if (fn(b, acc, i) === chips[i]) ok++; });
    return { ok, n };
  };
  const noFloor = replay((b, acc, i) => -WEAK_FOOT_CHIPS[acc]![WEAK_FOOT_CHIP_STATS[i]!]);
  const rate = replay((b, acc, i) => Math.max(40, Math.round(b * (1 - WEAK_FOOT_CHIPS[acc]![WEAK_FOOT_CHIP_STATS[i]!] / 80))) - b);
  assert(noFloor.ok < noFloor.n && rate.ok < rate.n, `weak-foot tampers detected: no floor at 40 (${noFloor.n - noFloor.ok} cells fail), a rate instead of a flat chip (${rate.n - rate.ok} cells fail)`);
  // Position Training: only the half positions (S4's H1), or the non-full neighbours of every full position (S5's H6).
  const sets = Object.values(pt.cards).map((c) => ({ c, want: c.trained.map((i) => POSITIONS[i]!).join() }));
  const h1 = sets.filter(({ c, want }) => POSITIONS.filter((p, i) => p !== "GK" && c.apt[i] === 1).join() !== want).length;
  const h6 = sets.filter(({ c, want }) => POSITIONS.filter((p, i) => p !== "GK" && c.apt[i] !== 0 && POSITIONS.some((q, j) => c.apt[j] === 0 && PITCH_NEIGHBOURS[q].includes(p))).join() !== want).length;
  assert(h1 > 0 && h6 > 0, `Position Training tampers detected: half positions only (${h1} cards fail), neighbours of any full position (${h6} cards fail)`);
}

// ---------------------------------------------------------------- 10. the page's match state resets on another card
{
  // The card page holds the toggles with the card they were set on (design D1); any other card reads both off.
  const held: HeldMatchState = { weakFoot: true, positionTraining: true, cardId: "11" };
  const same = matchStateForCard(held, "11");
  const other = matchStateForCard(held, "12");
  assert(same.weakFoot && same.positionTraining, "the held match state applies to the card it was set on");
  assert(!other.weakFoot && !other.positionTraining && !matchStateForCard(null, "11").weakFoot && !matchStateForCard(undefined, "11").positionTraining, "another card (or nothing held) reads both toggles off");
  // A → B → A with one held state: the helper only compares the held card id, so asking for A again brings
  // A's toggles back while nothing new was held — it cannot "forget" A by itself; the page relies on Next
  // remounting it on a [cardId] change (browser-checked) for a new card to start with nothing held.
  const aba = [matchStateForCard(held, "11"), matchStateForCard(held, "12"), matchStateForCard(held, "11")];
  assert(aba[0]!.weakFoot && !aba[1]!.weakFoot && !aba[1]!.positionTraining && aba[2]!.weakFoot && aba[2]!.positionTraining, "A → B → A with one held state: on for A, off for B, on again for A (the helper's real behaviour; the remount resets it)");
  // Through the engine: the other card's build is the one without a match state.
  const c1 = exact.cards.c1!;
  const card = (id: string): SimulatedCard => ({
    id, cardType: "EPIC", levelCap: c1.levelCap, registeredPosition: c1.pos, booster1: { stats: sparse(c1.b1) }, booster2: { stats: sparse(c1.b2) },
    stats: toStats(c1.base), height: c1.height, weakFootAccuracy: 1, positionAptitudes: aptFrom(c1.apt),
  });
  const build = { allocation: toAlloc(c1.builds.C), maxLevel: c1.levelCap, managerProficiency: 90, booster1: "full" as const, booster2: "full" as const };
  const onOther = simulateCardBuild(card("12"), build, POSITIONS[c1.pos]!, { manager: null, second: null, matchState: matchStateForCard(held, "12") });
  const onSame = simulateCardBuild(card("11"), build, POSITIONS[c1.pos]!, { manager: null, second: null, matchState: matchStateForCard(held, "11") });
  assert(neutral(onOther) && !neutral(onSame), "another card's build carries no weak-foot deduction and trains nothing; the card it was set on does");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ match-state tests passed");
