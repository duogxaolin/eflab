// Progression engine — pure and deterministic. Training rules recovered from
// the eFHUB data (change `player-progression-simulator`, 2026-10-18); the
// Manager Proficiency bands, the manager effect and the overall formula are
// efootbase's own (change `efootbase-exact-model-managers`, 2026-10-19,
// constants in ovrModel.ts, provenance in docs/efootbase-exact-model.md).
//
// Rules:
//   · training points available = levelCap − 1 (one per level above 1);
//   · ten categories, each raising every stat it contains by the number of
//     stat points bought in it (TRAINING_STATS); a stat in two categories
//     (Jump: Aerial Strength and Goalkeeper 1) gets the sum;
//   · the nth stat point in a category costs ceil(n / 4) half-points, i.e.
//     0.5 for points 1–4, 1 for 5–8, 1.5 for 9–12 … (Σ cost = levelCap − 1 on
//     all 32,601 hub cards with a cap ≥ 2);
//   · stat pipeline, for s₀ = base + training:
//       s₁ = s₀                         if s₀ ≥ 99 (no bonus, not cut back)
//          = min(99, s₀ + band(level, s₀)) otherwise   (PROFICIENCY_BANDS)
//       final = s₁ + active boosters + (1 on each pill stat of a selected manager)
//     boosters and the manager's +1 come after the cap and may exceed 99;
//     efootbase's client cuts s₀ above 99 back to 99, this engine does not —
//     no measured reading covers that case and the game's own max-level
//     overall agrees with not cutting it (docs/efootbase-exact-model.md);
//   · overall at a position = the exact integer-weight formula (`exactOvr`):
//     every stat scaled by 1 / 0.97 / 0.85 (full / half / no proficiency),
//     rounded half up and limited to 0..255; each stat and the weak-foot term
//     enter as max(0, v − 25), height as max(0, h − 111 − 25), weak-foot
//     accuracy as 59 × a / 3 + 40; overall = floor((Σ w·term + 499) / 1000)
//     limited to 40..127. No per-card anchor, no fitted penalty.
//
// Costs are handled as integers in half-points to avoid float drift.
import {
  BASE_STATS,
  POSITIONS,
  TRAINING_CATEGORIES,
  TRAINING_STATS,
  proficiencyFromAptitude,
  type BaseStat,
  type Position,
  type PositionProficiency,
  type TrainingCategory,
} from "./constants";
import {
  MANAGER_PILL_BONUS,
  OVR_MODEL,
  OVR_TERMS,
  PROFICIENCY_BANDS,
  PROFICIENCY_STAT_CAP,
  type OvrModel,
  type ProficiencyBand,
} from "./ovrModel";
import type { BuildConfig, BuildResult } from "./types";

export type StatVector = Record<BaseStat, number>;
export type TrainingAllocation = Record<TrainingCategory, number>;
/** Sparse stat deltas (a booster's `stats`, see BoosterDTO). */
export type BoosterVector = Partial<Record<BaseStat, number>>;
/** Anything that carries a booster vector — BoosterDTO satisfies it. */
export interface BoosterLike {
  stats: BoosterVector;
}
/** A selected manager as the engine sees it: its one or two pill stats
 *  (efootbase lists 24 of its 69 picker managers with a single pill). The
 *  rating is not an engine input — choosing a manager sets the proficiency
 *  level to the rating in the UI state. */
export interface ManagerEffect {
  stats: readonly BaseStat[];
}
/** Position aptitude codes as stored (PlayerCardDTO.positionAptitudes:
 *  0 full, 1 half, 2 none). */
export type PositionAptitudes = Readonly<Partial<Record<Position, number>>>;

/** Stat points per cost tier: points 1–4 cost 0.5, 5–8 cost 1, … */
export const COST_TIER_SIZE = 4;

/** efootbase shows the same budget in whole points — exactly twice our
 *  training points (its progression sheet reads "62/62 pts" for a level-32
 *  card whose budget is 31 here; the first four stat points of a category
 *  cost 1 each in that unit). The engine keeps half-points; the UI converts
 *  with `toDisplayPoints` wherever a point value is printed. */
export const POINT_DISPLAY_SCALE = 2;
export const toDisplayPoints = (points: number): number => Math.round(points * POINT_DISPLAY_SCALE);

/** Category labels as efootbase prints them in its progression sheet
 *  (capture 2026-10-18): the three short names of TRAINING_CATEGORY_LABELS
 *  ("Lower Body", "Aerial", "GK 1–3") are spelled out there. The web panel
 *  uses this table. */
export const PROGRESSION_CATEGORY_LABELS: Readonly<Record<TrainingCategory, string>> = {
  Shooting: "Shooting",
  Passing: "Passing",
  Dribbling: "Dribbling",
  Dexterity: "Dexterity",
  LowerBody: "Lower Body Strength",
  Aerial: "Aerial Strength",
  Defending: "Defending",
  GK1: "Goalkeeper 1",
  GK2: "Goalkeeper 2",
  GK3: "Goalkeeper 3",
};

/** Manager Proficiency — efootbase applies it to every stat even when no
 *  manager is selected (slider 70–90, default 90); a selected manager sets it
 *  to the manager's rating. The bonus of a trained stat comes from the band
 *  table of the level (PROFICIENCY_BANDS); levels 70–76 give none. */
export const MANAGER_PROFICIENCY_MIN = 70;
export const MANAGER_PROFICIENCY_MAX = 90;
/** efootbase's default (and this engine's when a config omits the level). */
export const MANAGER_PROFICIENCY_DEFAULT = 90;

/** Integer level within 70..90 (non-finite input → the default). */
export function clampManagerProficiency(level: number | null | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return MANAGER_PROFICIENCY_DEFAULT;
  return Math.min(MANAGER_PROFICIENCY_MAX, Math.max(MANAGER_PROFICIENCY_MIN, Math.round(level)));
}

/** Bonus of one stat whose value after training is `s` at `level`: the band
 *  containing `s`, 0 below the first band or at 99 and above, and never more
 *  than what takes the stat to 99. */
export function managerProficiencyBonus(
  level: number,
  s: number,
  bands: Readonly<Record<number, readonly ProficiencyBand[]>> = PROFICIENCY_BANDS,
): number {
  if (s >= PROFICIENCY_STAT_CAP) return 0;
  const table = bands[clampManagerProficiency(level)] ?? [];
  for (const band of table) {
    if (s >= band.min && s <= band.max) return Math.min(band.bonus, PROFICIENCY_STAT_CAP - s);
  }
  return 0;
}

/** Per-stat bonus for the stats after training (`trained` = base + training). */
export function applyManagerProficiency(
  level: number,
  trained: Readonly<StatVector>,
  bands: Readonly<Record<number, readonly ProficiencyBand[]>> = PROFICIENCY_BANDS,
): StatVector {
  const deltas = zeroStats();
  for (const s of BASE_STATS) deltas[s] = managerProficiencyBonus(level, trained[s], bands);
  return deltas;
}

/** +1 (MANAGER_PILL_BONUS) on each pill stat of the selected manager, nothing
 *  without one. Added after the boosters, with no cap at 99. */
export function applyManager(manager: ManagerEffect | null | undefined): StatVector {
  const deltas = zeroStats();
  if (!manager) return deltas;
  for (const s of manager.stats) if (s in deltas) deltas[s] += MANAGER_PILL_BONUS;
  return deltas;
}

export const zeroStats = (): StatVector =>
  Object.fromEntries(BASE_STATS.map((s) => [s, 0])) as StatVector;

export const emptyAllocation = (): TrainingAllocation =>
  Object.fromEntries(TRAINING_CATEGORIES.map((c) => [c, 0])) as TrainingAllocation;

/** Training points of a card at `maxLevel`: one per level above 1. */
export function trainingPointsAvailable(maxLevel: number): number {
  if (!Number.isFinite(maxLevel)) return 0;
  return Math.max(0, Math.floor(maxLevel) - 1);
}

/** Cost, in half-points, of the nth stat point bought in one category. */
export function statPointCostHalf(n: number): number {
  if (n < 1) return 0;
  return Math.ceil(n / COST_TIER_SIZE);
}

/** Cumulative cost, in half-points, of `g` stat points in one category. */
export function categoryCostHalf(g: number): number {
  const n = Math.max(0, Math.floor(g));
  // Closed form over full tiers + the partial tier.
  const fullTiers = Math.floor(n / COST_TIER_SIZE);
  const rest = n - fullTiers * COST_TIER_SIZE;
  return (COST_TIER_SIZE * fullTiers * (fullTiers + 1)) / 2 + rest * (fullTiers + 1);
}

/** Cumulative cost, in training points, of `g` stat points in one category
 *  (multiples of 0.5): c(2)=1, c(4)=2, c(8)=6, c(12)=12, c(16)=20, c(20)=30, c(22)=36. */
export function categoryCost(g: number): number {
  return categoryCostHalf(g) / 2;
}

/** Cost, in training points, of the next (g+1)th stat point of a category. */
export function nextStatPointCost(g: number): number {
  return statPointCostHalf(Math.max(0, Math.floor(g)) + 1) / 2;
}

/** Total cost of an allocation in half-points. */
export function allocationCostHalf(alloc: Partial<TrainingAllocation>): number {
  let total = 0;
  for (const c of TRAINING_CATEGORIES) total += categoryCostHalf(alloc[c] ?? 0);
  return total;
}

/** Total cost of an allocation in training points. */
export function allocationCost(alloc: Partial<TrainingAllocation>): number {
  return allocationCostHalf(alloc) / 2;
}

/** Largest number of stat points one category can hold for `budget` points. */
export function maxGainForBudget(budget: number): number {
  const halves = Math.floor(Math.max(0, budget) * 2 + 1e-9);
  let g = 0;
  while (categoryCostHalf(g + 1) <= halves) g += 1;
  return g;
}

/** Stat deltas produced by an allocation: every stat of a category rises by
 *  the points bought in it, and a stat listed under two categories (Jump:
 *  Aerial Strength + Goalkeeper 1) adds both. */
export function applyTraining(alloc: Partial<TrainingAllocation>): StatVector {
  const deltas = zeroStats();
  for (const cat of TRAINING_CATEGORIES) {
    const pts = Math.max(0, Math.floor(alloc[cat] ?? 0));
    if (pts === 0) continue;
    for (const stat of TRAINING_STATS[cat]) deltas[stat] += pts;
  }
  return deltas;
}

/** Sum of the vectors of the active boosters (slot i counts when
 *  `active[i]` is true and the slot carries a booster). */
export function applyBoosters(
  boosters: ReadonlyArray<BoosterLike | null | undefined>,
  active: ReadonlyArray<boolean>,
): StatVector {
  const deltas = zeroStats();
  boosters.forEach((b, i) => {
    if (!b || !active[i]) return;
    for (const [stat, v] of Object.entries(b.stats) as Array<[BaseStat, number | undefined]>) {
      if (typeof v === "number" && stat in deltas) deltas[stat] += v;
    }
  });
  return deltas;
}

/** Resolve a booster id against a table (sparse vectors by id). Unknown or
 *  empty ids resolve to null — callers show "unknown booster", never a guess. */
export function resolveBooster<T extends BoosterLike>(
  id: number | null | undefined,
  table: ReadonlyMap<number, T> | Readonly<Record<number, T>>,
): T | null {
  if (id == null || id <= 0) return null;
  const hit = table instanceof Map ? (table as ReadonlyMap<number, T>).get(id) : (table as Readonly<Record<number, T>>)[id];
  return hit ?? null;
}

/** Add stat vectors (a dense base plus any number of deltas). No clamp. */
export function addStats(base: StatVector, ...deltas: ReadonlyArray<Partial<StatVector>>): StatVector {
  const out = { ...base };
  for (const d of deltas) {
    for (const s of BASE_STATS) out[s] += d[s] ?? 0;
  }
  return out;
}

/** What the overall needs besides the stats: height (cm) and weak-foot
 *  accuracy (0–3, as stored). */
export interface OvrBody {
  height: number;
  weakFootAccuracy: number;
}

const termValue = (v: number, offset: number): number => (v > offset ? v - offset : 0);

/**
 * The exact overall at `position` for final (displayed) stats, efootbase's
 * formula: every stat is scaled by the proficiency factor at that position,
 * rounded half up and limited to 0..255; the weighted sum of the 28 terms is
 * accumulated in OVR_TERMS order and the result is
 * floor((sum + 499) / 1000) limited to 40..127. `model` exists for the
 * tamper tests; callers use the default.
 */
export function exactOvr(
  position: Position,
  stats: Readonly<StatVector>,
  body: OvrBody,
  proficiency: PositionProficiency = "full",
  model: OvrModel = OVR_MODEL,
): number {
  const w = model.weights[position];
  const f = model.scale[proficiency];
  const scaled = (v: number) => Math.max(0, Math.min(model.scaleMax, Math.floor(v * f + model.scaleRoundBias)));
  let sum = 0;
  for (const term of OVR_TERMS) {
    let v: number;
    if (term === "height") v = termValue(body.height - model.heightOffset, model.termOffset);
    else if (term === "weakFootAccuracy") v = termValue((model.wfSlope * body.weakFootAccuracy) / model.wfDivisor + model.wfBase, model.termOffset);
    else v = termValue(scaled(stats[term] ?? 0), model.termOffset);
    sum += w[term] * v;
  }
  const raw = (sum + model.sumBias) / model.sumDivisor;
  return Math.max(model.min, Math.min(model.max, Math.floor(raw)));
}

/** The 13 position tiles for final stats and the card's aptitudes (codes 0
 *  full, 1 half, 2 none; a missing code counts as none), in POSITIONS order. */
export function positionTiles(
  stats: Readonly<StatVector>,
  body: OvrBody,
  positionAptitudes: PositionAptitudes,
  model: OvrModel = OVR_MODEL,
): Record<Position, number> {
  const out = {} as Record<Position, number>;
  for (const p of POSITIONS) out[p] = exactOvr(p, stats, body, proficiencyFromAptitude(positionAptitudes[p]), model);
  return out;
}

/** Position with the highest tile; the registered position wins ties, then
 *  POSITIONS order. */
export function bestFitPosition(tiles: Readonly<Record<Position, number>>, registered: Position): Position {
  let best = registered;
  for (const p of POSITIONS) if (tiles[p] > tiles[best]) best = p;
  return best;
}

/** Linear part of the overall at `position` (Σ weight × stat over the 26
 *  stats, no offsets, no scaling, no rounding) — the Max OVR objective. */
export function linearOvrValue(position: Position, stats: Readonly<StatVector>, model: OvrModel = OVR_MODEL): number {
  const w = model.weights[position];
  let v = 0;
  for (const s of BASE_STATS) v += w[s] * stats[s];
  return v;
}

/** Gain of the linear objective per stat point in `cat` at `position`: the
 *  sum of the weights of every stat the category raises (Jump's weight counts
 *  in both Aerial Strength and Goalkeeper 1, as each of them lifts it). */
export function categoryGain(position: Position, cat: TrainingCategory, model: OvrModel = OVR_MODEL): number {
  const w = model.weights[position];
  let g = 0;
  for (const stat of TRAINING_STATS[cat]) g += w[stat];
  return g;
}

/**
 * Allocation that maximises the linear part of the exact overall at
 * `position` within `budget` training points. The objective is linear in the
 * stats, so the value of an allocation is Σ_cat gain(cat) · points(cat) even
 * when a stat belongs to two categories, and the cost per stat point only
 * grows with the tier, so a dynamic programme over the ten categories with the
 * budget in half-points is exact. Ties prefer fewer stat points (a category
 * with zero gain stays at 0) and, between equal values, the cheaper total.
 * The proficiency bonus, the 99 cap, the scaling and the rounding are left
 * out of the objective on purpose: the preset is then the same at every
 * proficiency level and for every manager, as efootbase's own Max OVR build
 * was on every measured card. The bound against an exact bonus-aware search
 * is in progression.test.ts.
 */
export function bestAllocation(position: Position, budget: number, model: OvrModel = OVR_MODEL): TrainingAllocation {
  const B = Math.floor(Math.max(0, budget) * 2 + 1e-9);
  const EPS = 1e-9;
  const NEG = Number.NEGATIVE_INFINITY;
  let dp: number[] = new Array<number>(B + 1).fill(NEG);
  dp[0] = 0;
  const choices: Array<Array<{ prev: number; g: number }>> = [];

  for (const cat of TRAINING_CATEGORIES) {
    const gain = categoryGain(position, cat, model);
    const next: number[] = new Array<number>(B + 1).fill(NEG);
    const choice: Array<{ prev: number; g: number }> = new Array(B + 1);
    for (let used = 0; used <= B; used++) {
      if (dp[used] === NEG) continue;
      // g = 0 first so an equal value keeps the smaller allocation.
      for (let g = 0, cost = 0; used + cost <= B; g++, cost = categoryCostHalf(g)) {
        const v = dp[used]! + gain * g;
        if (v > next[used + cost]! + EPS) {
          next[used + cost] = v;
          choice[used + cost] = { prev: used, g };
        }
      }
    }
    dp = next;
    choices.push(choice);
  }

  // Best value; among equal values the cheapest state wins (ascending scan).
  let bestUsed = 0;
  for (let used = 1; used <= B; used++) {
    if (dp[used]! > dp[bestUsed]! + EPS) bestUsed = used;
  }
  const alloc = emptyAllocation();
  let used = bestUsed;
  for (let i = TRAINING_CATEGORIES.length - 1; i >= 0; i--) {
    const ch = choices[i]![used]!;
    alloc[TRAINING_CATEGORIES[i]!] = ch.g;
    used = ch.prev;
  }
  return alloc;
}

export interface SimulateInput {
  /** 26 base (level-1, unboosted) stats of the card. */
  base: StatVector;
  /** Real level cap of the card (upper bound for `config.maxLevel`). */
  levelCap: number;
  /** Height and weak-foot accuracy of the card (terms of the overall). */
  height: number;
  weakFootAccuracy: number;
  config: BuildConfig;
  /** Resolved Booster 1 / Booster 2 (null when the slot is empty or unknown). */
  boosters: readonly [BoosterLike | null, BoosterLike | null];
  /** Position aptitude codes of the card (0 full, 1 half, 2 none). Without
   *  them every position counts as full proficiency. */
  positionAptitudes?: PositionAptitudes;
  /** The selected manager's pill stats, or null / undefined for none. The
   *  proficiency level is `config.managerProficiency` either way. */
  manager?: ManagerEffect | null;
}

/** Full simulation: training → Manager Proficiency bonus (band table, cap 99)
 *  → active boosters → manager +1 → final stats, budget accounting, the exact
 *  overall at the configured position and all 13 position tiles. */
export function simulateBuild(input: SimulateInput): BuildResult {
  const { base, levelCap, config, boosters, positionAptitudes, manager, height, weakFootAccuracy } = input;
  const proficiency: PositionProficiency = positionAptitudes ? proficiencyFromAptitude(positionAptitudes[config.position]) : "full";
  const maxLevel = Math.min(Math.max(1, Math.floor(config.maxLevel)), Math.max(1, Math.floor(levelCap)));
  const managerProficiency = clampManagerProficiency(config.managerProficiency);
  const pointsAvailable = trainingPointsAvailable(maxLevel);
  const usedHalf = allocationCostHalf(config.trainingPoints);
  const pointsUsed = usedHalf / 2;
  const remainingPoints = pointsAvailable - pointsUsed;

  const trainingDeltas = applyTraining(config.trainingPoints);
  // The bonus is read off the trained value, before any booster.
  const proficiencyDeltas = applyManagerProficiency(managerProficiency, addStats(base, trainingDeltas));
  const boosterDeltas = applyBoosters(boosters, config.boosters);
  const managerDeltas = applyManager(manager);
  const projectedStats = addStats(base, trainingDeltas, proficiencyDeltas, boosterDeltas, managerDeltas);
  const body = { height, weakFootAccuracy };
  const aptitudes: PositionAptitudes = positionAptitudes ?? (Object.fromEntries(POSITIONS.map((p) => [p, 0])) as Record<Position, number>);
  const tiles = positionTiles(projectedStats, body, aptitudes);

  return {
    config: { ...config, maxLevel, managerProficiency },
    base,
    trainingDeltas,
    proficiencyDeltas,
    boosterDeltas,
    managerDeltas,
    projectedStats,
    pointsAvailable,
    pointsUsed,
    remainingPoints,
    withinBudget: remainingPoints >= 0,
    overall: tiles[config.position],
    proficiency,
    tiles,
  };
}

/** Position index (Konami registered position) → Position, GK when unknown. */
export const positionFromIndex = (idx: number): Position => POSITIONS[idx] ?? "GK";
