// Progression engine — the rules recovered from the eFHUB data (change
// `player-progression-simulator`, 2026-10-18). Everything here is pure and
// deterministic; the oracle tests in progression.test.ts check each rule
// against cards sampled from the hub (`__fixtures__/progression-oracle.json`).
//
// Rules (verified on 44,103 cards, see design.md of the change):
//   · training points available = levelCap − 1 (one per level above 1);
//   · ten categories, each raising every stat it contains by the number of
//     stat points bought in it (TRAINING_STATS); a stat in two categories
//     (Jump: Aerial Strength and Goalkeeper 1) gets the sum — with that, the
//     table reproduces the hub max stats of all 44,103 cards, goalkeepers
//     included (change `jump-from-gk1`); no cap at 99;
//   · the nth stat point in a category costs ceil(n / 4) half-points, i.e.
//     0.5 for points 1–4, 1 for 5–8, 1.5 for 9–12 … (Σ cost = levelCap − 1 on
//     all 32,601 cards with a cap ≥ 2);
//   · the overall at a position is estimated by a fitted linear formula
//     (ovrWeights.ts) — accurate to about ±1 at full-proficiency positions,
//     lower confidence for GK/CB; at half / non-proficient positions a fitted
//     affine penalty with a floor of 40 is applied (OVR_PROFICIENCY_ADJUST,
//     held-out within ±1: 99.9 % half, 99.7 % none at outfield positions);
//   · Manager Proficiency (change `manager-proficiency-slider`, measured on
//     efootbase's Progression sheet): with s = base + training, every stat
//     gains min(99 − s, floor(s · r(level))) (0 once s ≥ 99) and the boosters
//     are added after that bonus (they may exceed 99); r(70–76) = 0 and level
//     86 is an unconfirmed exception, floor((s + 6) / 32);
//   · at the card's registered position the estimate is anchored: it adds the
//     card's displayed overall minus the formula on its base stats (no
//     boosters); other positions keep the unanchored estimate (+ penalty).
// Per-manager effects are not modelled: no dataset ties a manager to a stat.
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
import { OVR_PROFICIENCY_ADJUST, OVR_PROFICIENCY_FLOOR, OVR_WEIGHTS } from "./ovrWeights";
import type { BuildConfig, BuildResult } from "./types";

export type StatVector = Record<BaseStat, number>;
export type TrainingAllocation = Record<TrainingCategory, number>;
/** Sparse stat deltas (a booster's `stats`, see BoosterDTO). */
export type BoosterVector = Partial<Record<BaseStat, number>>;
/** Anything that carries a booster vector — BoosterDTO satisfies it. */
export interface BoosterLike {
  stats: BoosterVector;
}

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

/** Manager Proficiency — efootbase's Progression sheet applies it to every
 *  stat even when no manager is selected (slider 70–90, default 90). Rule
 *  recovered from six measured cards: with s = base + training,
 *      bonus = 0                                   if s ≥ 99
 *            = min(99 − s, floor(s · r(level)))    otherwise,
 *  and the boosters are added after the bonus (they may exceed 99).
 *  Evidence (scripts outside the repo, see design.md of the change):
 *   · held-out — rates read off one outfield card (Messi SS, at 70/75/80/85/90)
 *     and one goalkeeper (Neuer, at 70/90) only, then frozen: the other four
 *     cards at 70/75/80/85/90 gave 178 builds with 4,628/4,628 stat cells exact;
 *   · prospective — rates from four cards, the last two (DMF, CF) predicted at
 *     all 21 levels: 4,257/4,264 stat cells at the interval midpoints (misses
 *     at 79/81/82/83, levels whose shipped rates those two cards then narrowed);
 *   · the 15 levels between the held-out ones (71–74, 76–79, 81–84, 87–89) were
 *     measured on four cards only and have no two-card held-out run; level 86
 *     was fitted on all six;
 *   · the shipped rates were pooled over all six cards: each is one point
 *     inside its measured interval (widths 0.00022–0.00092), so another rate
 *     inside the same interval (e.g. r(90) = 0.0362) fits the evidence equally
 *     well and no test can tell them apart.
 *  The rate depends on the level only; levels 70–76 give no bonus, so at 70
 *  every stat equals the engine without the control (the overall at the
 *  registered position still differs by the anchor, see `ovrAnchor`). */
export const MANAGER_PROFICIENCY_MIN = 70;
export const MANAGER_PROFICIENCY_MAX = 90;
/** efootbase's default (and this engine's when a config omits the level). */
export const MANAGER_PROFICIENCY_DEFAULT = 90;
/** Level 86 fits no single rate (the 86 interval of the measurements is
 *  empty); its bonus is floor((s + 6) / 32), which reproduces every measured
 *  86 cell (207/207, fitted on all six cards — no held-out check) but is an
 *  UNCONFIRMED exception — the UI says so. It is not monotone in the level:
 *  s = 26–29 and s = 58 gain 1 more at 86 than at 87. */
export const MANAGER_PROFICIENCY_UNCONFIRMED_LEVEL = 86;
/** r(level) for every level except 86 (inside the feasible interval of the
 *  measurements; the interval bounds are re-derived from the fixture by the
 *  tests). Cells left ambiguous by those intervals — s = 66 at 83, s = 88 at
 *  87 — are not in the fixture. */
export const MANAGER_PROFICIENCY_RATES: Readonly<Record<number, number>> = {
  70: 0, 71: 0, 72: 0, 73: 0, 74: 0, 75: 0, 76: 0,
  77: 0.02116,
  78: 0.02286,
  79: 0.02614, 80: 0.02614,
  81: 0.02878, 82: 0.02878,
  83: 0.03031,
  84: 0.03243, 85: 0.03243,
  87: 0.03419,
  88: 0.0355,
  89: 0.03593,
  90: 0.03625,
};

/** Integer level within 70..90 (non-finite input → the default). */
export function clampManagerProficiency(level: number | null | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return MANAGER_PROFICIENCY_DEFAULT;
  return Math.min(MANAGER_PROFICIENCY_MAX, Math.max(MANAGER_PROFICIENCY_MIN, Math.round(level)));
}

export const isUnconfirmedProficiencyLevel = (level: number): boolean =>
  clampManagerProficiency(level) === MANAGER_PROFICIENCY_UNCONFIRMED_LEVEL;

/** Bonus of one stat whose value after training is `s` at `level`. */
export function managerProficiencyBonus(level: number, s: number): number {
  if (s >= 99) return 0;
  const p = clampManagerProficiency(level);
  const raw = p === MANAGER_PROFICIENCY_UNCONFIRMED_LEVEL ? Math.floor((s + 6) / 32) : Math.floor(s * MANAGER_PROFICIENCY_RATES[p]!);
  return Math.max(0, Math.min(99 - s, raw));
}

/** Per-stat bonus for the stats after training (`trained` = base + training). */
export function applyManagerProficiency(level: number, trained: Readonly<StatVector>): StatVector {
  const deltas = zeroStats();
  for (const s of BASE_STATS) deltas[s] = managerProficiencyBonus(level, trained[s]);
  return deltas;
}

/** Per-card anchor of the estimate at the registered position: the card's
 *  displayed overall minus the formula on its base stats (no training, no
 *  bonus, no boosters). It absorbs the formula's per-card residual.
 *  It was chosen post hoc, after the unanchored goalkeeper builds of the
 *  held-out run had failed (Čech GK 14/50 within ±1; anchored 50/50); the
 *  other held-out cards pass with or without it, so the held-out builds do
 *  not discriminate it. The independent support is the population check
 *  (no proficiency bonus involved): formula on the hub max stats + Booster 1
 *  vs efootbase's overall at max level, within ±1 — 9,839 cards with a
 *  level cap > 1 in both sources: 97.0 % → 98.3 %, GK 83.6 % → 97.4 %
 *  (702); all 10,073 cards with dump max level > 1: 94.7 % → 96.1 %, GK
 *  82.0 % → 95.5 % (716). On Messi it matches the measured overall exactly
 *  less often than the unanchored form (4/8 vs 6/8, all within ±1). */
export function ovrAnchor(registeredPosition: Position, base: Readonly<StatVector>, cardOvr: number): number {
  return cardOvr - projectOvr(registeredPosition, base);
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

/** Estimated overall (unrounded) at `position` for a stat vector, at full
 *  proficiency unless `proficiency` says otherwise (half / none apply the
 *  fitted affine penalty floored at 40 — a monotone map of the full estimate,
 *  so the allocation that maximises one maximises the other). */
export function projectOvr(position: Position, stats: Readonly<StatVector>, proficiency: PositionProficiency = "full"): number {
  const { intercept, w } = OVR_WEIGHTS[position];
  let v = intercept;
  for (let i = 0; i < BASE_STATS.length; i++) v += (w[i] ?? 0) * stats[BASE_STATS[i]!];
  return applyProficiency(v, position, proficiency);
}

/** Fitted penalty of a full-proficiency estimate at a half / non-proficient
 *  position: max(40, k · estimate + c). Identity at full proficiency. */
export function applyProficiency(fullEstimate: number, position: Position, proficiency: PositionProficiency): number {
  if (proficiency === "full") return fullEstimate;
  const { k, c } = OVR_PROFICIENCY_ADJUST[proficiency][position];
  return Math.max(OVR_PROFICIENCY_FLOOR, k * fullEstimate + c);
}

/** Display rounding of an estimate (half away from zero, like the hub). */
export const roundOvr = (v: number): number => Math.round(v);

/** OVR gain of one stat point in `cat` at `position`: the sum of the weights
 *  of every stat the category raises (Jump's weight counts in both Aerial
 *  Strength and Goalkeeper 1, as each of them lifts it). */
export function categoryGain(position: Position, cat: TrainingCategory): number {
  const { w } = OVR_WEIGHTS[position];
  let g = 0;
  for (const stat of TRAINING_STATS[cat]) g += w[BASE_STATS.indexOf(stat)] ?? 0;
  return g;
}

/**
 * Allocation that maximises the estimated overall at `position` within
 * `budget` training points. The objective is linear in the stats, so the
 * value of an allocation is Σ_cat gain(cat) · points(cat) even when a stat
 * belongs to two categories (its two lifts add, and so do their weighted
 * gains), and the cost per stat point only grows with the tier, so a dynamic
 * programme over the ten categories with the budget in half-points is exact.
 * Ties prefer fewer stat points (a category with zero gain stays at 0) and,
 * between equal values, the cheaper total.
 * The Manager Proficiency bonus (a floored, capped fraction of each stat) is
 * deliberately left out of the objective, so the preset does not depend on
 * the proficiency level — like the reference sheet's own Max OVR build, which
 * is the same allocation at every level on all 5 measured cards with one.
 * With the bonus it is therefore not always the best build: on the 261
 * hub-oracle cards × 21 levels an exact bonus-aware search scores higher on
 * 1,694 of 5,481 pairs, by at most 0.668 unrounded and 1 displayed point
 * (202 pairs), never at 70–76 (test section 8). With the bonus and the anchor
 * its build lands within ±1 of the sheet's own Max OVR reading on 89/89
 * readings (5 cards: SS at 5 levels, four cards at 21 levels); the allocation
 * equals the sheet's on the SS card only.
 */
export function bestAllocation(position: Position, budget: number): TrainingAllocation {
  const B = Math.floor(Math.max(0, budget) * 2 + 1e-9);
  const EPS = 1e-9;
  const NEG = Number.NEGATIVE_INFINITY;
  let dp: number[] = new Array<number>(B + 1).fill(NEG);
  dp[0] = 0;
  const choices: Array<Array<{ prev: number; g: number }>> = [];

  for (const cat of TRAINING_CATEGORIES) {
    const gain = categoryGain(position, cat);
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
  /** Registered position of the card: the only position where the estimate
   *  is anchored (see `cardOvr`). */
  registeredPosition: Position;
  /** The card's displayed overall at its registered position (level 1, no
   *  boosters — PlayerCardDTO.ovr). When given, the estimate at the
   *  registered position adds `ovrAnchor`; without it nothing is anchored. */
  cardOvr?: number;
  config: BuildConfig;
  /** Resolved Booster 1 / Booster 2 (null when the slot is empty or unknown). */
  boosters: readonly [BoosterLike | null, BoosterLike | null];
  /** Position aptitude codes of the card (PlayerCardDTO.positionAptitudes:
   *  0 full, 1 half, 2 none). Without them the estimate assumes full
   *  proficiency at `config.position` (reported in `BuildResult.proficiency`). */
  positionAptitudes?: Readonly<Partial<Record<Position, number>>>;
}

/** Full simulation: training → Manager Proficiency bonus → active boosters
 *  → projected stats, budget accounting and the estimated overall at the
 *  configured position (anchored at the registered position when `cardOvr`
 *  is given). */
export function simulateBuild(input: SimulateInput): BuildResult {
  const { base, levelCap, config, boosters, positionAptitudes, registeredPosition, cardOvr } = input;
  const proficiency: PositionProficiency = positionAptitudes
    ? proficiencyFromAptitude(positionAptitudes[config.position])
    : "full";
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
  const projectedStats = addStats(base, trainingDeltas, proficiencyDeltas, boosterDeltas);
  const anchored = typeof cardOvr === "number" && Number.isFinite(cardOvr) && config.position === registeredPosition;
  const anchor = anchored ? ovrAnchor(registeredPosition, base, cardOvr) : null;
  const estimatedOvrExact = projectOvr(config.position, projectedStats, proficiency) + (anchor ?? 0);

  return {
    config: { ...config, maxLevel, managerProficiency },
    base,
    trainingDeltas,
    proficiencyDeltas,
    boosterDeltas,
    projectedStats,
    pointsAvailable,
    pointsUsed,
    remainingPoints,
    withinBudget: remainingPoints >= 0,
    estimatedOvr: roundOvr(estimatedOvrExact),
    estimatedOvrExact,
    proficiency,
    ovrAnchor: anchor,
    managerProficiencyUnconfirmed: managerProficiency === MANAGER_PROFICIENCY_UNCONFIRMED_LEVEL,
  };
}

/** Position index (Konami registered position) → Position, GK when unknown. */
export const positionFromIndex = (idx: number): Position => POSITIONS[idx] ?? "GK";
