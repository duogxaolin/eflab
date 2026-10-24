// Build state in the player-page URL (change efootbase-function-parity, design
// decision D2; spec efootbase-function-parity "Build State In The Card URL").
// Pure: the page calls `decodeBuildQuery` on load, `encodeBuildQuery` on every
// change (written with history.replaceState). The decoder never trusts a value
// and never throws: whatever it had to change is listed in `corrections`
// (the page then rewrites the URL at once and announces it); a value that is
// merely written in a non-canonical form (another key order, `dri=03`) is
// read as is and is not a correction.
//
// Parameters, written in this order:
//   sho pas dri dex lbs aer def gk1 gk2 gk3   stat points per category (0–25)
//   pts=0   no category holds a point (written whenever that is the case)
//   ml      Max Level — a Highlight card with a level cap of 1 when above 1,
//           a card with a level cap above 1 when below its cap
//   mp      Manager Proficiency 70–89 (only without a manager; 90 = default)
//   mgr     selected manager id (proficiency = its rating; `mp` not written)
//   b1      Booster 1: 0 = off; 1 / 2 = the level of a Trending card's +3 booster
//   b2      slug of the chosen second booster (a card without its own Booster 2)
//   b2l=0   the card's own Booster 2 off
// The opening state writes no query; the selected position is never written.
//
// eFootLab rules that differ from the reference on purpose (D1, recorded as
// "reference oddities not copied"): a link with no category key and no
// `pts=0` opens the card's opening allocation for the link's Max Level — the
// Max-OVR allocation on a card with a level cap above 1 (the reference then
// loads a zero build), no point on a Highlight card with a level cap of 1
// (as the reference); a category never holds more than 25; corrections are applied and
// announced (the reference clamps silently and leaves the URL wrong).
import { TRAINING_CATEGORIES, type TrainingCategory } from "./constants";
import { MANAGER_PROFICIENCY_DEFAULT, MANAGER_PROFICIENCY_MAX, MANAGER_PROFICIENCY_MIN, emptyAllocation, trainingPointsAvailable, type TrainingAllocation } from "./progression";
import {
  CATEGORY_POINT_MAX,
  booster1Levels,
  buildMode,
  clampAllocationInOrder,
  defaultAllocation,
  defaultMaxLevel,
  hasPoints,
  maxLevelRange,
  modeHasBuild,
  modeHasCategories,
  ownBooster2Levels,
  sameAllocation,
  takesSecondBooster,
  type BoosterLevel,
  type BuildCard,
  type BuildMode,
} from "./build";

/** URL key of each training category (the reference's names). */
export const BUILD_CATEGORY_KEYS: Readonly<Record<TrainingCategory, string>> = {
  Shooting: "sho",
  Passing: "pas",
  Dribbling: "dri",
  Dexterity: "dex",
  LowerBody: "lbs",
  Aerial: "aer",
  Defending: "def",
  GK1: "gk1",
  GK2: "gk2",
  GK3: "gk3",
};

/** Every build parameter of the player page, in the written order. */
export const BUILD_QUERY_KEYS = ["sho", "pas", "dri", "dex", "lbs", "aer", "def", "gk1", "gk2", "gk3", "pts", "ml", "mp", "mgr", "b1", "b2", "b2l"] as const;
export type BuildQueryKey = (typeof BUILD_QUERY_KEYS)[number];

/** The build as the URL carries it. The web's Progression state maps onto it. */
export interface BuildUrlState {
  /** Stat points per category (0–25 each, within the budget of `maxLevel`). */
  allocation: TrainingAllocation;
  /** Committed Max Level (maxLevelRange). */
  maxLevel: number;
  /** Manager Proficiency of the slider, 70–90. While `managerId` is set the
   *  page uses the manager's rating instead and the writer omits `mp`. */
  managerProficiency: number;
  /** Selected manager id (a picker manager), or null. */
  managerId: string | null;
  /** Booster 1 (booster1Levels). */
  booster1: BoosterLevel;
  /** The card's own Booster 2: "full" or 0 (ownBooster2Levels). */
  booster2: BoosterLevel;
  /** Chosen second booster slug (a card without its own Booster 2), or null. */
  secondBooster: string | null;
}

/** Anything that reads query parameters (URLSearchParams, Next's ReadonlyURLSearchParams). */
export interface QueryReader {
  get(name: string): string | null;
  has(name: string): boolean;
  getAll?(name: string): string[];
}

/** What a correction did to one parameter:
 *  invalid         not a valid value (non-numeric, fractional, negative, malformed) — dropped or set to 0 / the default
 *  clamped         outside its range — limited to the range
 *  over-budget     the categories cost more than the budget — cut in category order
 *  unknown         a manager id / booster slug that is not in the list — dropped
 *  not-applicable  the card has no such control — dropped
 *  redundant       repeated, or contradicted by another parameter — dropped */
export type BuildCorrectionKind = "invalid" | "clamped" | "over-budget" | "unknown" | "not-applicable" | "redundant";
export interface BuildCorrection {
  key: string;
  kind: BuildCorrectionKind;
  /** The value as it was in the URL. */
  value: string;
}

/** Lists some values are checked against. A list left out (not loaded yet)
 *  defers that check: the value is kept and flagged in `pending`; check it
 *  later with `resolveBuildLists` once the list has answered. */
export interface BuildQueryLists {
  /** Ids of the picker managers (manager.picker). */
  managerIds?: Iterable<string> | null;
  /** Slugs of the second-booster choices (booster.secondChoices). */
  secondBoosterSlugs?: Iterable<string> | null;
}

export interface DecodedBuildQuery {
  state: BuildUrlState;
  corrections: BuildCorrection[];
  /** True when the query holds at least one build parameter (BUILD_QUERY_KEYS);
   *  other parameters (`utm_source`, …) do not count. */
  hasBuildParams: boolean;
  /** Checks still waiting for their list (BuildQueryLists). */
  pending: { manager: boolean; secondBooster: boolean };
}

/**
 * The allocation a link without any category key and without `pts=0` opens
 * with, at the link's Max Level (D2 step 2): the Max-OVR allocation for that
 * level's budget on a card with a level cap above 1 (eFootLab's rule — the
 * reference loads a zero build there), and no point on a Highlight card with a
 * level cap of 1, whose panel opens empty at every Max Level (the reference
 * also reads `?ml=10` as an empty build). Empty for a mode without categories.
 * `defaultAllocation` stays "Max OVR at a level" (the Max OVR button).
 */
export function linkOpeningAllocation(card: BuildCard, maxLevel: number): TrainingAllocation {
  return buildMode(card) === "capped" ? defaultAllocation(card, maxLevel) : emptyAllocation();
}

/** The opening state of a card: the Max-OVR allocation at the opening Max
 *  Level, proficiency 90, no manager, every booster at its own level, no
 *  second booster. (A remembered manager is applied by the page on top.) */
export function openingBuildState(card: BuildCard): BuildUrlState {
  return {
    allocation: defaultAllocation(card),
    maxLevel: defaultMaxLevel(card),
    managerProficiency: MANAGER_PROFICIENCY_DEFAULT,
    managerId: null,
    booster1: "full",
    booster2: "full",
    secondBooster: null,
  };
}

/** True when two states mean the same build for this card: only the parts
 *  the card has are compared, and the slider value only without a manager. */
export function sameBuildState(a: BuildUrlState, b: BuildUrlState, card: BuildCard): boolean {
  const mode = buildMode(card);
  if (!modeHasBuild(mode)) return true;
  if (modeHasCategories(mode) && (a.maxLevel !== b.maxLevel || !sameAllocation(a.allocation, b.allocation))) return false;
  if (a.managerId !== b.managerId) return false;
  if (a.managerId === null && a.managerProficiency !== b.managerProficiency) return false;
  if (booster1Levels(card).length > 0 && a.booster1 !== b.booster1) return false;
  if (ownBooster2Levels(card).length > 0 && a.booster2 !== b.booster2) return false;
  if (takesSecondBooster(card) && a.secondBooster !== b.secondBooster) return false;
  return true;
}

/** True when `params` holds any build parameter of the player page. */
export function hasBuildParams(params: QueryReader): boolean {
  return BUILD_QUERY_KEYS.some((k) => params.has(k));
}

// ---- shared parsing (also used by compare-url.ts) ----

const INT_RE = /^\d+$/;
/** A plain decimal integer (digits only, at most 9 — anything longer is out of range anyway). */
export function parseIntParam(raw: string): number | null {
  if (!INT_RE.test(raw)) return null;
  const n = Number(raw.length > 9 ? "999999999" : raw);
  return Number.isSafeInteger(n) ? n : null;
}
/** A manager or card id: 1–19 digits within int8 (the API's `bigIntString`). */
export function isIdParam(raw: string): boolean {
  return /^\d{1,19}$/.test(raw) && BigInt(raw) <= 9223372036854775807n;
}
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A second-booster slug as `secondBoosterSlug` writes it. */
export const isSecondBoosterSlugParam = (raw: string): boolean => raw.length <= 64 && SLUG_RE.test(raw);

const toSet = (it: Iterable<string> | null | undefined): ReadonlySet<string> | null => (it == null ? null : it instanceof Set ? (it as ReadonlySet<string>) : new Set(it));

/** Reads the categories of one build. `keyOf` gives each category's key; the
 *  zero-build marker (`pts=0` / `lb=1`) is `zeroKey` = `zeroValue`. Returns
 *  null when the build has neither a category key nor the marker (then the
 *  default allocation applies), else the allocation, capped at 25 and cut to
 *  the budget in category order. Corrections are appended. */
export function readAllocation(
  params: QueryReader,
  keyOf: (c: TrainingCategory) => string,
  zero: { key: string; value: string },
  budget: number,
  corrections: BuildCorrection[],
): TrainingAllocation | null {
  const zeroRaw = params.get(zero.key);
  if (zeroRaw !== null && zeroRaw !== zero.value) corrections.push({ key: zero.key, kind: "invalid", value: zeroRaw });
  const present = TRAINING_CATEGORIES.filter((c) => params.has(keyOf(c)));
  if (present.length === 0 && zeroRaw !== zero.value) return null;
  const alloc = emptyAllocation();
  for (const c of present) {
    const key = keyOf(c);
    const raw = params.get(key) ?? "";
    const n = parseIntParam(raw);
    if (n === null) {
      corrections.push({ key, kind: "invalid", value: raw });
    } else if (n > CATEGORY_POINT_MAX) {
      corrections.push({ key, kind: "clamped", value: raw });
      alloc[c] = CATEGORY_POINT_MAX;
    } else {
      alloc[c] = n;
    }
  }
  if (zeroRaw === zero.value && hasPoints(alloc)) corrections.push({ key: zero.key, kind: "redundant", value: zeroRaw });
  const fitted = clampAllocationInOrder(alloc, budget);
  for (const c of TRAINING_CATEGORIES) {
    if (fitted[c] !== alloc[c]) corrections.push({ key: keyOf(c), kind: "over-budget", value: params.get(keyOf(c)) ?? "" });
  }
  return fitted;
}

/** Repeated keys (`dri=3&dri=5`): the first value is read, the others reported. */
export function reportRepeated(params: QueryReader, keys: readonly string[], corrections: BuildCorrection[]): void {
  if (!params.getAll) return;
  for (const key of keys) {
    const all = params.getAll(key);
    for (const extra of all.slice(1)) corrections.push({ key, kind: "redundant", value: extra });
  }
}

/** Reads a manager id; `lists` defers the check when not given. */
export function readManager(
  params: QueryReader,
  key: string,
  managerIds: ReadonlySet<string> | null,
  corrections: BuildCorrection[],
): { id: string | null; pending: boolean } {
  const raw = params.get(key);
  if (raw === null) return { id: null, pending: false };
  if (!isIdParam(raw)) {
    corrections.push({ key, kind: "invalid", value: raw });
    return { id: null, pending: false };
  }
  if (managerIds === null) return { id: raw, pending: true };
  if (!managerIds.has(raw)) {
    corrections.push({ key, kind: "unknown", value: raw });
    return { id: null, pending: false };
  }
  return { id: raw, pending: false };
}

const notApplicable = (params: QueryReader, keys: readonly string[], corrections: BuildCorrection[]): void => {
  for (const key of keys) {
    const raw = params.get(key);
    if (raw !== null) corrections.push({ key, kind: "not-applicable", value: raw });
  }
};

const CATEGORY_KEYS = TRAINING_CATEGORIES.map((c) => BUILD_CATEGORY_KEYS[c]);

/**
 * Reads the build of a player-page query for `card`. Never throws. `lists`
 * holds the picker managers and the second-booster slugs when they are
 * loaded; a list left out defers its check (`pending`, `resolveBuildLists`).
 */
export function decodeBuildQuery(input: QueryReader | string, card: BuildCard, lists: BuildQueryLists = {}): DecodedBuildQuery {
  const params: QueryReader = typeof input === "string" ? new URLSearchParams(input) : input;
  const mode: BuildMode = buildMode(card);
  const state = openingBuildState(card);
  const corrections: BuildCorrection[] = [];
  const pending = { manager: false, secondBooster: false };
  const present = hasBuildParams(params);
  if (!present) return { state, corrections, hasBuildParams: false, pending };
  if (!modeHasBuild(mode)) {
    notApplicable(params, BUILD_QUERY_KEYS, corrections);
    return { state, corrections, hasBuildParams: true, pending };
  }
  reportRepeated(params, BUILD_QUERY_KEYS, corrections);

  // Max Level first: it sets the budget.
  const mlRaw = params.get("ml");
  if (mlRaw !== null) {
    if (!modeHasCategories(mode)) {
      corrections.push({ key: "ml", kind: "not-applicable", value: mlRaw });
    } else {
      const [lo, hi] = maxLevelRange(card);
      const n = parseIntParam(mlRaw);
      if (n === null) corrections.push({ key: "ml", kind: "invalid", value: mlRaw });
      else if (n < lo || n > hi) {
        corrections.push({ key: "ml", kind: "clamped", value: mlRaw });
        state.maxLevel = Math.min(hi, Math.max(lo, n));
      } else state.maxLevel = n;
    }
  }

  // Categories: explicit (a category key or pts=0 present — the others are 0)
  // or the card's opening allocation at the Max Level read above
  // (`linkOpeningAllocation`: Max OVR for a card with a level cap above 1,
  // nothing for a Highlight card with a level cap of 1).
  if (modeHasCategories(mode)) {
    const alloc = readAllocation(params, (c) => BUILD_CATEGORY_KEYS[c], { key: "pts", value: "0" }, trainingPointsAvailable(state.maxLevel), corrections);
    state.allocation = alloc ?? linkOpeningAllocation(card, state.maxLevel);
  } else {
    notApplicable(params, [...CATEGORY_KEYS, "pts"], corrections);
  }

  const mpRaw = params.get("mp");
  if (mpRaw !== null) {
    const n = parseIntParam(mpRaw);
    if (n === null) corrections.push({ key: "mp", kind: "invalid", value: mpRaw });
    else if (n < MANAGER_PROFICIENCY_MIN || n > MANAGER_PROFICIENCY_MAX) {
      corrections.push({ key: "mp", kind: "clamped", value: mpRaw });
      state.managerProficiency = Math.min(MANAGER_PROFICIENCY_MAX, Math.max(MANAGER_PROFICIENCY_MIN, n));
    } else state.managerProficiency = n;
  }
  const manager = readManager(params, "mgr", toSet(lists.managerIds), corrections);
  state.managerId = manager.id;
  pending.manager = manager.pending;
  // A manager sets the proficiency to its rating: an `mp` next to it is not
  // written back (the slider value is kept for the case the manager is dropped).
  if (manager.id !== null && mpRaw !== null && parseIntParam(mpRaw) !== null) corrections.push({ key: "mp", kind: "redundant", value: mpRaw });

  const b1Raw = params.get("b1");
  if (b1Raw !== null) {
    const levels = booster1Levels(card);
    const level = b1Raw === "0" ? 0 : b1Raw === "1" ? 1 : b1Raw === "2" ? 2 : null;
    if (levels.length === 0) corrections.push({ key: "b1", kind: "not-applicable", value: b1Raw });
    else if (level === null || !levels.includes(level)) corrections.push({ key: "b1", kind: "invalid", value: b1Raw });
    else state.booster1 = level;
  }

  const b2Raw = params.get("b2");
  if (b2Raw !== null) {
    if (!takesSecondBooster(card)) corrections.push({ key: "b2", kind: "not-applicable", value: b2Raw });
    else if (!isSecondBoosterSlugParam(b2Raw)) corrections.push({ key: "b2", kind: "invalid", value: b2Raw });
    else {
      const slugs = toSet(lists.secondBoosterSlugs);
      if (slugs === null) {
        state.secondBooster = b2Raw;
        pending.secondBooster = true;
      } else if (slugs.has(b2Raw)) state.secondBooster = b2Raw;
      else corrections.push({ key: "b2", kind: "unknown", value: b2Raw });
    }
  }

  const b2lRaw = params.get("b2l");
  if (b2lRaw !== null) {
    if (ownBooster2Levels(card).length === 0) corrections.push({ key: "b2l", kind: "not-applicable", value: b2lRaw });
    else if (b2lRaw !== "0") corrections.push({ key: "b2l", kind: "invalid", value: b2lRaw });
    else state.booster2 = 0;
  }

  return { state, corrections, hasBuildParams: true, pending };
}

/**
 * The deferred checks of `decodeBuildQuery`, once a list has answered: a
 * manager id that is not a picker manager and a second-booster slug that is
 * not a choice are dropped and reported. A list left out stays unchecked.
 */
export function resolveBuildLists(state: BuildUrlState, lists: BuildQueryLists): { state: BuildUrlState; corrections: BuildCorrection[] } {
  const corrections: BuildCorrection[] = [];
  let next = state;
  const managerIds = toSet(lists.managerIds);
  if (managerIds !== null && state.managerId !== null && !managerIds.has(state.managerId)) {
    corrections.push({ key: "mgr", kind: "unknown", value: state.managerId });
    next = { ...next, managerId: null };
  }
  const slugs = toSet(lists.secondBoosterSlugs);
  if (slugs !== null && state.secondBooster !== null && !slugs.has(state.secondBooster)) {
    corrections.push({ key: "b2", kind: "unknown", value: state.secondBooster });
    next = { ...next, secondBooster: null };
  }
  return { state: next, corrections };
}

/** Writes the categories of one build: every category holding a point, or
 *  the zero-build marker when none does. */
export function writeAllocation(sp: URLSearchParams, alloc: TrainingAllocation, keyOf: (c: TrainingCategory) => string, zero: { key: string; value: string }): void {
  let any = false;
  for (const c of TRAINING_CATEGORIES) {
    const v = Math.max(0, Math.floor(alloc[c] ?? 0));
    if (v > 0) {
      sp.append(keyOf(c), String(v));
      any = true;
    }
  }
  if (!any) sp.append(zero.key, zero.value);
}

/**
 * The query of a build (without "?"), in the fixed order of BUILD_QUERY_KEYS;
 * empty for the opening state and for a card without a build.
 */
export function encodeBuildQuery(state: BuildUrlState, card: BuildCard): URLSearchParams {
  const sp = new URLSearchParams();
  const mode = buildMode(card);
  if (!modeHasBuild(mode) || sameBuildState(state, openingBuildState(card), card)) return sp;
  if (modeHasCategories(mode)) {
    writeAllocation(sp, state.allocation, (c) => BUILD_CATEGORY_KEYS[c], { key: "pts", value: "0" });
    const def = defaultMaxLevel(card);
    if (state.maxLevel !== def) sp.append("ml", String(state.maxLevel));
  }
  if (state.managerId === null && state.managerProficiency !== MANAGER_PROFICIENCY_DEFAULT) sp.append("mp", String(state.managerProficiency));
  if (state.managerId !== null) sp.append("mgr", state.managerId);
  if (state.booster1 !== "full" && booster1Levels(card).includes(state.booster1)) sp.append("b1", String(state.booster1));
  if (state.secondBooster !== null && takesSecondBooster(card)) sp.append("b2", state.secondBooster);
  if (state.booster2 === 0 && ownBooster2Levels(card).length > 0) sp.append("b2l", "0");
  return sp;
}
