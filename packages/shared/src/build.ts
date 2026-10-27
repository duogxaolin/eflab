// Build helpers around the progression engine (change efootbase-function-parity,
// design decisions D2, D4, D5). Pure and deterministic, like progression.ts,
// whose rules they do not change: they decide what a card's build may hold
// (its mode), scale a booster to a level, and fit an allocation into a smaller
// budget. The URL codecs (build-url.ts, compare-url.ts) and the web's
// Progression state are built on them.
//
// Evidence: the reference survey of 2026-10-23 (outside the repo), S1 §7 / §8 /
// §10 and the manager / booster check; every rule below was seen on at least
// two cards unless its comment says otherwise.
import { BASE_STATS, POSITIONS, TRAINING_CATEGORIES, type BaseStat, type CardType, type Position, type TrainingCategory } from "./constants";
import {
  MATCH_STATE_OFF,
  allocationCost,
  allocationCostHalf,
  bestAllocation,
  categoryCostHalf,
  clampManagerProficiency,
  emptyAllocation,
  maxGainForBudget,
  simulateBuild,
  statPointCostHalf,
  trainingPointsAvailable,
  type BoosterLike,
  type BoosterVector,
  type PositionAptitudes,
  type StatVector,
  type TrainingAllocation,
} from "./progression";
import type { BuildResult, MatchState } from "./types";

/** What a card needs for its build rules — PlayerCardDTO satisfies it. */
export interface BuildCard {
  cardType: CardType;
  levelCap: number;
  /** Registered position index (POSITIONS order). */
  registeredPosition: number;
  /** Resolved Booster 1 / Booster 2 (null when the slot is empty or unknown). */
  booster1: BoosterLike | null;
  booster2: BoosterLike | null;
}

/**
 * The build a card can hold:
 *   "capped"    level cap above 1 — Max Level 1..levelCap, the ten categories;
 *   "highlight" a Highlight card with a level cap of 1 — Max Level 1..80
 *               (HIGHLIGHT_MAX_LEVEL), the categories from Max Level 2;
 *   "trending"  a Trending card (level cap 1) — the "Build" panel: manager
 *               and proficiency only, no Max Level, no categories;
 *   "none"      any other card with a level cap of 1 — no build at all (the
 *               reference was not measured on them; the page keeps its note).
 */
export type BuildMode = "capped" | "highlight" | "trending" | "none";

/** Highest Max Level of a Highlight card with a level cap of 1 (the reference's slider: 1–80). */
export const HIGHLIGHT_MAX_LEVEL = 80;
/** Most stat points one category holds (the reference's slider max; its "+" passing 25 is a bug not copied). */
export const CATEGORY_POINT_MAX = 25;

export function buildMode(card: Pick<BuildCard, "cardType" | "levelCap">): BuildMode {
  if (Math.floor(card.levelCap) > 1) return "capped";
  if (card.cardType === "HIGHLIGHT") return "highlight";
  if (card.cardType === "TRENDING") return "trending";
  return "none";
}

/** True when the mode has training categories (and so Max Level, Max OVR and Reset). */
export const modeHasCategories = (mode: BuildMode): boolean => mode === "capped" || mode === "highlight";
/** True when the mode has a build at all (manager, proficiency, boosters). */
export const modeHasBuild = (mode: BuildMode): boolean => mode !== "none";

/** Committed Max Level range [min, max] of a card ([1, 1] without a level control). */
export function maxLevelRange(card: Pick<BuildCard, "cardType" | "levelCap">): readonly [number, number] {
  const mode = buildMode(card);
  if (mode === "capped") return [1, Math.floor(card.levelCap)];
  if (mode === "highlight") return [1, HIGHLIGHT_MAX_LEVEL];
  return [1, 1];
}

/** Max Level a card opens at: its level cap, 1 for the level-cap-1 modes (the
 *  Highlight slider starts empty at 1). */
export function defaultMaxLevel(card: Pick<BuildCard, "cardType" | "levelCap">): number {
  return buildMode(card) === "capped" ? Math.floor(card.levelCap) : 1;
}

/** The registered position of a card (GK when unknown). */
export const registeredPositionOf = (card: Pick<BuildCard, "registeredPosition">): Position =>
  POSITIONS[card.registeredPosition] ?? "GK";

/** Default allocation of a card at `maxLevel`: the Max-OVR allocation for
 *  that level's budget at the registered position (empty for a mode without
 *  categories). At the opening Max Level this is the opening allocation. */
export function defaultAllocation(card: BuildCard, maxLevel: number = defaultMaxLevel(card)): TrainingAllocation {
  if (!modeHasCategories(buildMode(card))) return emptyAllocation();
  return bestAllocation(registeredPositionOf(card), trainingPointsAvailable(maxLevel));
}

/** Budget in half-points (the engine's integer unit; = the displayed points). */
const budgetHalf = (budget: number): number => Math.floor(Math.max(0, budget) * 2 + 1e-9);
const points = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/**
 * Lowering the Max Level (the reference's rule, S1 §10): stat points are
 * removed one at a time from the last category that holds points (Goalkeeper
 * 3 back to Shooting) until the allocation costs at most `budget` training
 * points. An allocation that fits is returned unchanged (a copy).
 *
 *   Messi "Gracias, Leo!" 4/0/5/4/4 (18 pts): budget 8 (16 pts) → lbs 2;
 *   7 (14 pts) → lbs 0; 4 (8 pts) → Shooting 4, Dribbling 4; 0 → nothing.
 */
export function trimAllocationFromLast(alloc: Partial<TrainingAllocation>, budget: number): TrainingAllocation {
  const out = emptyAllocation();
  for (const c of TRAINING_CATEGORIES) out[c] = points(alloc[c]);
  const limit = budgetHalf(budget);
  let cost = allocationCostHalf(out);
  for (let i = TRAINING_CATEGORIES.length - 1; i >= 0 && cost > limit; i--) {
    const c = TRAINING_CATEGORIES[i]!;
    while (out[c] > 0 && cost > limit) {
      cost -= statPointCostHalf(out[c]);
      out[c] -= 1;
    }
  }
  return out;
}

/**
 * An over-budget link (the reference's load rule, S1 §8, one reading): the
 * categories are taken in order (Shooting … Goalkeeper 3), each keeping what
 * the remaining budget buys. Umeda Kaito (144 pts) 25/27/25 → 25/18/3.
 * The caller caps each category at CATEGORY_POINT_MAX first.
 */
export function clampAllocationInOrder(alloc: Partial<TrainingAllocation>, budget: number): TrainingAllocation {
  const out = emptyAllocation();
  let left = budgetHalf(budget);
  for (const c of TRAINING_CATEGORIES) {
    const wanted = points(alloc[c]);
    let g = 0;
    while (g < wanted && categoryCostHalf(g + 1) <= left) g += 1;
    out[c] = g;
    left -= categoryCostHalf(g);
  }
  return out;
}

/** True when two allocations hold the same points in every category. */
export function sameAllocation(a: Partial<TrainingAllocation>, b: Partial<TrainingAllocation>): boolean {
  return TRAINING_CATEGORIES.every((c) => points(a[c]) === points(b[c]));
}

/** True when the allocation holds at least one point. */
export const hasPoints = (alloc: Partial<TrainingAllocation>): boolean => TRAINING_CATEGORIES.some((c) => points(alloc[c]) > 0);

/**
 * Most stat points `cat` can hold within `budget` training points, given what
 * the other categories already cost — never above CATEGORY_POINT_MAX (the
 * reference's slider max; its "+" passing 25 is a bug not copied). The one
 * limit behind the panel rows, their tracks and the Adjust popover.
 */
export function categoryLimit(alloc: Partial<TrainingAllocation>, cat: TrainingCategory, budget: number): number {
  const others = allocationCost({ ...alloc, [cat]: 0 });
  return Math.min(CATEGORY_POINT_MAX, maxGainForBudget(budget - others));
}

/**
 * One category set to `value` (D6): never below 0; an increase is limited to
 * the largest value the budget affords and to CATEGORY_POINT_MAX, so a slider
 * dragged past what is affordable commits the largest affordable value at or
 * below the request. Returns the new allocation, or null when nothing changes.
 * A category already above the limit (it cannot come from the UI) is only
 * ever lowered.
 */
export function setCategoryPoints(alloc: TrainingAllocation, cat: TrainingCategory, value: number, budget: number): TrainingAllocation | null {
  const cur = points(alloc[cat]);
  const wanted = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : cur;
  const next = wanted <= cur ? wanted : Math.max(cur, Math.min(wanted, categoryLimit(alloc, cat, budget)));
  if (next === cur) return null;
  return { ...alloc, [cat]: next };
}

/**
 * A committed Max Level change (D5, every card with categories): the
 * allocation at `maxLevel`, trimmed from the last categories when the new
 * budget no longer covers it (`trimAllocationFromLast`); `trimmed` says
 * whether points were removed (the page announces it).
 */
export function allocationForMaxLevel(alloc: TrainingAllocation, maxLevel: number): { allocation: TrainingAllocation; trimmed: boolean } {
  const allocation = trimAllocationFromLast(alloc, trainingPointsAvailable(maxLevel));
  return { allocation, trimmed: !sameAllocation(allocation, alloc) };
}

// ---- Boosters (D4) ----

/** A booster with stat data — the only kind with a control. */
export function isUsableBooster(b: BoosterLike | null | undefined): b is BoosterLike {
  return !!b && Object.values(b.stats).some((v) => typeof v === "number" && v !== 0);
}

/**
 * The booster at `level`: every stat it raises is raised by `level` instead
 * (the reference's `b1=n` / `b2l=n`, S1 §0 / §7: "+n on each stat of that
 * booster"); stats it does not raise stay out. Level 0 raises nothing.
 */
export function boosterAtLevel<T extends BoosterLike>(booster: T, level: number): T {
  const n = points(level);
  const stats: BoosterVector = {};
  for (const [stat, v] of Object.entries(booster.stats) as Array<[keyof BoosterVector, number | undefined]>) {
    if (typeof v === "number" && v !== 0) stats[stat] = n;
  }
  return { ...booster, stats };
}

/** State of a booster slot: "full" (on at its own level — no URL parameter),
 *  0 (off), or a lower level 1 / 2 (a Trending card's Booster 1 only). */
export type BoosterLevel = "full" | 0 | 1 | 2;

/** Magnitude of every Trending card's usable Booster 1 in the data (785 cards). */
export const TRENDING_BOOSTER_MAGNITUDE = 3;
/** The Trending Booster 1 cycle on each activation: +3 → off → +1 → +2 → +3. */
export const TRENDING_BOOSTER_CYCLE: readonly BoosterLevel[] = ["full", 0, 1, 2];
/** Any other usable booster toggles off and on. */
export const TOGGLE_BOOSTER_CYCLE: readonly BoosterLevel[] = ["full", 0];

/**
 * The states Booster 1 cycles through on each activation, starting at
 * "full"; [] when it has no stat data (no control). A Trending card's
 * Booster 1 has levels when every stat it raises is +3 (true of all of them
 * today); another magnitude on a Trending card was never measured and falls
 * back to on / off.
 */
export function booster1Levels(card: Pick<BuildCard, "cardType" | "booster1">): readonly BoosterLevel[] {
  const b = card.booster1;
  if (!isUsableBooster(b)) return [];
  if (card.cardType === "TRENDING") {
    const values = Object.values(b.stats).filter((v): v is number => typeof v === "number" && v !== 0);
    if (values.every((v) => v === TRENDING_BOOSTER_MAGNITUDE)) return TRENDING_BOOSTER_CYCLE;
  }
  return TOGGLE_BOOSTER_CYCLE;
}

/** The states the card's own Booster 2 toggles through: on / off for a card
 *  with categories and a usable Booster 2; [] otherwise (a card without one
 *  offers the second-booster choice instead; a Trending card's build uses
 *  only Booster 1). Its intermediate levels (`b2l=1/2`) were seen on one card
 *  only: not built. */
export function ownBooster2Levels(card: BuildCard): readonly BoosterLevel[] {
  return modeHasCategories(buildMode(card)) && isUsableBooster(card.booster2) ? TOGGLE_BOOSTER_CYCLE : [];
}

/** True when the card takes a second booster from the 29 basic ones: a card
 *  with a level cap above 1 and no usable Booster 2 of its own (the
 *  reference's "Select Booster" slot, seen on Quaresma, Messi and Yoneda).
 *  Not a Highlight card with a level cap of 1: the reference showed no
 *  booster row at all on both such cards (S1 L5, L9), so a choice there is
 *  not offered (unmeasured); nor a Trending card (Courtois, Yamal: Booster 1
 *  only). */
export function takesSecondBooster(card: BuildCard): boolean {
  return buildMode(card) === "capped" && !isUsableBooster(card.booster2);
}

/** The state after one activation of a booster control (its cycle wraps). */
export function nextBoosterLevel(levels: readonly BoosterLevel[], current: BoosterLevel): BoosterLevel {
  if (levels.length === 0) return current;
  const at = levels.indexOf(current);
  return levels[(at + 1) % levels.length] ?? "full";
}

/** A booster slot at a level: the booster itself ("full"), nothing (0), or
 *  the booster scaled to the level. */
export function boosterForLevel<T extends BoosterLike>(booster: T | null, level: BoosterLevel): T | null {
  if (!booster || level === 0) return null;
  return level === "full" ? booster : boosterAtLevel(booster, level);
}

/**
 * The engine's booster input for a build (`SimulateInput.boosters` and
 * `BuildConfig.boosters`): Booster 1 at its level, then the card's own
 * Booster 2 at its level or, for a card without one, the chosen second
 * booster (`second`, resolved from booster.secondChoices by the caller).
 */
export function engineBoosters(
  card: BuildCard,
  levels: { booster1: BoosterLevel; booster2: BoosterLevel },
  second: BoosterLike | null,
): { boosters: [BoosterLike | null, BoosterLike | null]; active: [boolean, boolean] } {
  const b1 = isUsableBooster(card.booster1) ? boosterForLevel(card.booster1, levels.booster1) : null;
  const b2 = isUsableBooster(card.booster2)
    ? boosterForLevel(card.booster2, levels.booster2)
    : takesSecondBooster(card) && isUsableBooster(second)
      ? second
      : null;
  return { boosters: [b1, b2], active: [b1 !== null, b2 !== null] };
}

// ---- One card's build through the engine (D2, D4, D5) ----

/** What the engine needs of a card besides its build rules — PlayerCardDTO satisfies it. */
export interface SimulatedCard extends BuildCard {
  id: string;
  /** 26 base (level-1, unboosted) stats. */
  stats: StatVector;
  height: number;
  weakFootAccuracy: number;
  positionAptitudes: PositionAptitudes;
}

/** The parts of a build the engine reads (BuildUrlState satisfies it). */
export interface SimulatedBuild {
  allocation: TrainingAllocation;
  maxLevel: number;
  /** The slider's level; a selected manager's rating replaces it. */
  managerProficiency: number;
  booster1: BoosterLevel;
  booster2: BoosterLevel;
}

/**
 * Runs one card's build through the engine: the boosters at their levels and
 * the chosen second booster (`engineBoosters`), the selected manager's rating
 * as the proficiency and its "+1" pills, and the Max Level range of the card's
 * mode (a Highlight card with a level cap of 1 trains up to
 * HIGHLIGHT_MAX_LEVEL). A mode without categories trains nothing. Every mode
 * applies the proficiency bonus (the reference's faces at level 1 include it);
 * a caller that wants none passes a level of 70–76 (compare). The match state
 * (`extras.matchState`, the detail page's Weak foot / Position Training
 * toggles — change efootbase-s4-measure) is not part of the build: omitted,
 * the result is the one without it; Position Training trains from the card's
 * registered position.
 */
export function simulateCardBuild(
  card: SimulatedCard,
  build: SimulatedBuild,
  position: Position,
  extras: { manager: { rating: number; pills: readonly BaseStat[] } | null; second: BoosterLike | null; matchState?: MatchState | null },
): BuildResult {
  const mode = buildMode(card);
  const [, hi] = maxLevelRange(card);
  const categories = modeHasCategories(mode);
  const { boosters, active } = engineBoosters(card, { booster1: build.booster1, booster2: build.booster2 }, extras.second);
  return simulateBuild({
    base: card.stats,
    levelCap: hi,
    height: card.height,
    weakFootAccuracy: card.weakFootAccuracy,
    config: {
      playerId: card.id,
      maxLevel: categories ? build.maxLevel : 1,
      position,
      trainingPoints: categories ? build.allocation : emptyAllocation(),
      boosters: active,
      managerProficiency: clampManagerProficiency(extras.manager ? extras.manager.rating : build.managerProficiency),
    },
    boosters,
    positionAptitudes: card.positionAptitudes,
    manager: extras.manager ? { stats: extras.manager.pills } : null,
    registeredPosition: registeredPositionOf(card),
    matchState: extras.matchState ?? null,
  });
}

/** The match state as the card page holds it: the two toggles and the card
 *  they were set on (change efootbase-s4-measure, design D1). */
export interface HeldMatchState extends MatchState {
  cardId: string;
}

/** The match state that applies to `cardId`: the held one when it was set on
 *  that card, else both toggles off (a state held for another card never
 *  applies). It keeps ONE held state, so it cannot restore an earlier card's:
 *  in a single component instance, toggles set on A, then card B, then A again
 *  would bring A's toggles back — but Next remounts the card page when the
 *  `[cardId]` segment changes, so a new card starts with nothing held
 *  (browser-checked: off after Other Versions and after Back). */
export function matchStateForCard(held: HeldMatchState | null | undefined, cardId: string): MatchState {
  return held && held.cardId === cardId ? held : MATCH_STATE_OFF;
}

/** One stat of a build split into its parts (the "Stat breakdown" list of
 *  "About this build", D6): base + training + cut at 99 (≤ 0) + proficiency
 *  bonus + weak foot (≤ 0, change efootbase-s4-measure) + boosters + manager
 *  = shown. */
export interface StatBreakdownRow {
  stat: BaseStat;
  base: number;
  training: number;
  cut: number;
  proficiency: number;
  weakFoot: number;
  boosters: number;
  manager: number;
  shown: number;
}

/** The breakdown of every stat of a build, in BASE_STATS order. */
export function statBreakdown(result: BuildResult): Record<BaseStat, StatBreakdownRow> {
  const out = {} as Record<BaseStat, StatBreakdownRow>;
  for (const stat of BASE_STATS) {
    out[stat] = {
      stat,
      base: result.base[stat],
      training: result.trainingDeltas[stat],
      cut: result.capDeltas[stat],
      proficiency: result.proficiencyDeltas[stat],
      weakFoot: result.weakFootDeltas[stat],
      boosters: result.boosterDeltas[stat],
      manager: result.managerDeltas[stat],
      shown: result.shownStats[stat],
    };
  }
  return out;
}
