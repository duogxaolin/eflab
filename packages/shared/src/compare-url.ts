// Two-build compare in the URL (change efootbase-function-parity, design
// decision D11; spec efootbase-function-parity "Two-Build Compare"). The card
// page's codec (build-url.ts) per side, with the side's prefix:
//   left=<card id>  right=<card id>
//   l_sho … l_gk3 / r_sho … r_gk3   the side's stat points per category
//   lb=1 / rb=1                     the side holds no category point
//   l_mgr / r_mgr                   the side's manager
// A side writes its build only when it differs from its default (the Max-OVR
// allocation, no manager); then every category holding a point (or lb / rb),
// then the manager. Order: left, right, the left side's build, the right
// side's. Boosters are fixed at the card's own (both on) and there is no
// proficiency control without a manager — no proficiency bonus then
// (COMPARE_NO_MANAGER_PROFICIENCY). A card with a level cap of 1 has no
// categories here. A legacy `?ids=a,b` link maps to left = a, right = b.
//
// Two steps, because a side's budget needs its card: `parseCompareCards`
// reads the card ids; `decodeCompareSide` reads one side once its card is
// loaded. Neither throws; whatever was changed is listed in `corrections`.
import { TRAINING_CATEGORIES, type TrainingCategory } from "./constants";
import { MANAGER_PROFICIENCY_MIN, emptyAllocation, trainingPointsAvailable, type TrainingAllocation } from "./progression";
import { buildMode, defaultAllocation, sameAllocation, type BuildCard } from "./build";
import {
  BUILD_CATEGORY_KEYS,
  isIdParam,
  readAllocation,
  readManager,
  reportRepeated,
  writeAllocation,
  type BuildCorrection,
  type QueryReader,
} from "./build-url";

export type CompareSide = "left" | "right";
export const COMPARE_SIDES: readonly CompareSide[] = ["left", "right"];
/** Prefix of a side's category and manager keys. */
export const COMPARE_SIDE_PREFIX: Readonly<Record<CompareSide, string>> = { left: "l_", right: "r_" };
/** A side's zero-build marker (the card page's `pts=0`). */
export const COMPARE_ZERO_KEY: Readonly<Record<CompareSide, string>> = { left: "lb", right: "rb" };
/** Most ids read from a legacy `?ids=` link (the page looks them up in turn). */
export const COMPARE_LEGACY_MAX_IDS = 20;
/** Proficiency a side runs at without a manager: levels 70–76 give no bonus,
 *  so the side shows its stats without one (the reference's compare). */
export const COMPARE_NO_MANAGER_PROFICIENCY = MANAGER_PROFICIENCY_MIN;

/** One filled compare slot. */
export interface CompareSideState {
  cardId: string;
  /** Stat points per category (empty for a card with a level cap of 1). */
  allocation: TrainingAllocation;
  managerId: string | null;
}
export interface CompareUrlState {
  left: CompareSideState | null;
  right: CompareSideState | null;
}

const sideCategoryKey = (side: CompareSide) => (c: TrainingCategory): string => `${COMPARE_SIDE_PREFIX[side]}${BUILD_CATEGORY_KEYS[c]}`;
const sideZero = (side: CompareSide) => ({ key: COMPARE_ZERO_KEY[side], value: "1" });
const sideManagerKey = (side: CompareSide): string => `${COMPARE_SIDE_PREFIX[side]}mgr`;

/** Every build key of one side. */
export function compareSideKeys(side: CompareSide): string[] {
  return [...TRAINING_CATEGORIES.map(sideCategoryKey(side)), COMPARE_ZERO_KEY[side], sideManagerKey(side)];
}

/** A side has categories in compare only with a level cap above 1. */
export const compareHasCategories = (card: BuildCard): boolean => buildMode(card) === "capped";

/** A side's default allocation: the Max-OVR allocation at its level cap (empty for a level-cap-1 card). */
export function compareSideDefault(card: BuildCard): TrainingAllocation {
  return compareHasCategories(card) ? defaultAllocation(card) : emptyAllocation();
}

export interface CompareQueryCards {
  left: string | null;
  right: string | null;
  /** The well-formed ids of a legacy `?ids=a,b,…` link (in order, at most
   *  COMPARE_LEGACY_MAX_IDS) when the query has neither `left` nor `right`;
   *  the page fills left / right with the first two that exist. Null otherwise. */
  legacyIds: string[] | null;
  corrections: BuildCorrection[];
}

/** Step 1: the card ids of a compare query. A malformed id is dropped. */
export function parseCompareCards(input: QueryReader | string): CompareQueryCards {
  const params: QueryReader = typeof input === "string" ? new URLSearchParams(input) : input;
  const corrections: BuildCorrection[] = [];
  reportRepeated(params, ["left", "right"], corrections);
  const id = (key: CompareSide): string | null => {
    const raw = params.get(key);
    if (raw === null) return null;
    if (isIdParam(raw)) return raw;
    corrections.push({ key, kind: "invalid", value: raw });
    return null;
  };
  const left = id("left");
  const right = id("right");
  let legacyIds: string[] | null = null;
  const legacyRaw = params.getAll ? params.getAll("ids") : params.get("ids") === null ? [] : [params.get("ids")!];
  if (legacyRaw.length > 0) {
    if (params.has("left") || params.has("right")) {
      for (const raw of legacyRaw) corrections.push({ key: "ids", kind: "redundant", value: raw });
    } else {
      legacyIds = [];
      for (const part of legacyRaw.flatMap((v) => v.split(",")).map((s) => s.trim()).filter((s) => s.length > 0)) {
        if (!isIdParam(part)) corrections.push({ key: "ids", kind: "invalid", value: part });
        else if (legacyIds.length < COMPARE_LEGACY_MAX_IDS) legacyIds.push(part);
      }
    }
  }
  // Build keys of a side without a card mean nothing.
  for (const side of COMPARE_SIDES) {
    if ((side === "left" ? left : right) !== null) continue;
    for (const key of compareSideKeys(side)) {
      const raw = params.get(key);
      if (raw !== null) corrections.push({ key, kind: "not-applicable", value: raw });
    }
  }
  return { left, right, legacyIds, corrections };
}

export interface DecodedCompareSide {
  allocation: TrainingAllocation;
  managerId: string | null;
  corrections: BuildCorrection[];
  /** The manager id waits for the picker list (`managerIds` not given). */
  pending: { manager: boolean };
}

/**
 * Step 2: one side's build for its loaded card. Without category keys and
 * without `lb` / `rb` the side has its default allocation; otherwise every
 * category without a key is 0, each capped at 25 and the whole cut to the
 * card's budget in category order. `managerIds` (manager.picker) checks the
 * manager; left out, the check is deferred (`pending`, `resolveBuildLists`).
 */
export function decodeCompareSide(
  input: QueryReader | string,
  side: CompareSide,
  card: BuildCard,
  lists: { managerIds?: Iterable<string> | null } = {},
): DecodedCompareSide {
  const params: QueryReader = typeof input === "string" ? new URLSearchParams(input) : input;
  const corrections: BuildCorrection[] = [];
  reportRepeated(params, compareSideKeys(side), corrections);
  let allocation = compareSideDefault(card);
  if (compareHasCategories(card)) {
    const read = readAllocation(params, sideCategoryKey(side), sideZero(side), trainingPointsAvailable(card.levelCap), corrections);
    if (read) allocation = read;
  } else {
    for (const key of [...TRAINING_CATEGORIES.map(sideCategoryKey(side)), COMPARE_ZERO_KEY[side]]) {
      const raw = params.get(key);
      if (raw !== null) corrections.push({ key, kind: "not-applicable", value: raw });
    }
  }
  const ids = lists.managerIds == null ? null : lists.managerIds instanceof Set ? (lists.managerIds as ReadonlySet<string>) : new Set(lists.managerIds);
  const manager = readManager(params, sideManagerKey(side), ids, corrections);
  return { allocation, managerId: manager.id, corrections, pending: { manager: manager.pending } };
}

/** True when a side differs from its default build (then its build is written). */
export function compareSideIsCustom(state: CompareSideState, card: BuildCard): boolean {
  return state.managerId !== null || !sameAllocation(state.allocation, compareSideDefault(card));
}

/**
 * Appends one side's build to `sp` when it differs from the side's default:
 * every category holding a point (or `lb` / `rb`) on a card with categories,
 * then the manager. Nothing for a default build.
 */
export function appendCompareSideBuild(sp: URLSearchParams, side: CompareSide, state: Pick<CompareSideState, "allocation" | "managerId">, card: BuildCard): void {
  if (!compareSideIsCustom({ cardId: "", ...state }, card)) return;
  if (compareHasCategories(card)) writeAllocation(sp, state.allocation, sideCategoryKey(side), sideZero(side));
  if (state.managerId !== null) sp.append(sideManagerKey(side), state.managerId);
}

/**
 * Appends the build parameters a link holds for `fromSide`, unchanged and
 * re-keyed for `toSide` (`l_sho` → `r_sho`, `lb` → `rb`, …), in the order of
 * `compareSideKeys`; repeated values are copied too. For a side whose card has
 * not loaded yet, so its build cannot be decoded: a Swap, a Remove or a pick
 * in the other slot rewrites the URL without losing the link's build — it is
 * decoded (and corrected) once the card is in.
 */
export function appendRawCompareSide(sp: URLSearchParams, input: QueryReader | string, fromSide: CompareSide, toSide: CompareSide): void {
  const params: QueryReader = typeof input === "string" ? new URLSearchParams(input) : input;
  const from = compareSideKeys(fromSide);
  const to = compareSideKeys(toSide);
  from.forEach((key, i) => {
    const values = params.getAll ? params.getAll(key) : params.get(key) === null ? [] : [params.get(key)!];
    for (const v of values) sp.append(to[i]!, v);
  });
}

/**
 * The compare query (without "?"): `left`, `right`, then each side's build
 * when it differs from its default. `cards` holds each filled side's card
 * (its budget and default decide what is written).
 */
export function encodeCompareQuery(state: CompareUrlState, cards: Partial<Record<CompareSide, BuildCard | null>>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const side of COMPARE_SIDES) {
    const s = state[side];
    if (s) sp.append(side, s.cardId);
  }
  for (const side of COMPARE_SIDES) {
    const s = state[side];
    const card = cards[side];
    if (s && card) appendCompareSideBuild(sp, side, s, card);
  }
  return sp;
}
