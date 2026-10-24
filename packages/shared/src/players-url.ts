// /players page state ⇄ URL (change efootbase-function-parity, design decision
// D9; spec catalog-browsing-parity "Page State Lives in the URL"). Pure, no
// React: `apps/web/lib/filter-url.ts` re-exports it for PlayersClient, which
// holds the state, writes every change with `history.replaceState` and reads
// the URL on load and on navigation. Kept here, next to the card-page and
// compare codecs (build-url.ts, compare-url.ts), so its rules are unit-tested
// (players-url.test.ts).
//
// Keys are written in one fixed order (PLAYERS_URL_KEYS) with the reference's
// names and encodings where the survey of 2026-10-23 (S2 §5, §6, §8) verified
// them, and eFootLab's own keys where it holds no such value:
//
//   search        the text (card name or pack name; sent from 3 characters)
//   sort          highest | lowest | a field sort; New cards (the default) = absent
//   pos           registered-position index, repeated (GK 0 … CF 12)
//   card          card-type code, repeated (Standard 0, Legendary 1, Trending 3, …)
//   base / ovr    Base / Max Overall Rating as `min-max` (`87-`, `90-91`, `-85`)
//   foot          1 left, 0 right
//   condition     0–4 for E, D, C, B, A, repeated
//   form          0–2 for 1★–3★, repeated
//   wfa / wfu     0–3 for 1★–4★, repeated
//   height / weight / age  `min-max`
//   playingStyle  style id, repeated; an AI style as `p_<dump key>` (`p_trickster`)
//   skill         skill key, repeated (`s_rabona`)
//   nat           eFootLab's internal Country.id, repeated (no nation code is stored)
//   league        League.id, repeated
//   team          team name, repeated (`team=Arsenal+FC`)
//   stat / smax   eFootLab's stat ranges (`speed:85-,finishing:80-95`), `smax=1` = on the max stats
//   body          eFootLab's body-model ranges (`legLength:13-`)
//   order         a field sort's direction, only when it is not the natural one
//   page          only past 1
//
// Repeated values are written in a stable order without duplicates (indexes,
// codes and ids ascending, AI styles in catalogue order, names and keys in
// code-unit order), defaults are omitted, so equal states give equal URLs and
// `write(read(write(s)))` is a fixed point. The reader still accepts every
// older eFootLab form and never writes it back: `q`, `type`, `style`, `dstyle`,
// `ai`, `ovrMin` / `ovrMax`, `maxOvrMin` / `maxOvrMax`, position names in
// `pos`, condition letters, comma lists of `form`, `wfa` and `wfu` (the old
// 1-based stars), skill ids (single or comma lists), all-digit `team` values
// (team ids — no stored team name is all digits), `sort=trending` (the
// default) and `sort=top` (High to low). A single `form`, `wfa` or `wfu` value
// is read 0-based, the reference's encoding — an intentional change for such
// old single-value links, which now select one star more. Out-of-range,
// unknown or inverted values are dropped, never sent.
//
// Legacy team and skill ids need the team / skill lists to become names and
// keys: the reader keeps them apart (`legacyTeamIds`, `legacySkillIds`, sent to
// the API as ids), `resolveLegacyIds` turns them into names / keys once the
// lists are known, and the next write uses the new form. An id the lists do
// not know (or a write before they have loaded) stays an id, written as the
// digits it was read from, so the link keeps its meaning.
import type { z } from "zod";
import {
  AI_PLAYING_STYLE_KEYS,
  BASE_STATS,
  CARD_TYPES,
  CARD_TYPE_BY_EFOOTBASE_CODE,
  CARD_TYPE_FILTER_ORDER,
  CONDITIONS,
  DEFAULT_SORT_PRESET,
  FILTER_RANGE_BOUNDS,
  FIXED_FIRST_NATIONS,
  FORM_STARS,
  LIST_SEARCH_MAX_LENGTH,
  MAX_FILTER_IDS,
  MAX_FILTER_SKILLS,
  PHYSIQUE_FIELDS,
  PLAYING_STYLE_GROUPS,
  POSITIONS,
  SEARCH_MIN_LENGTH,
  SKILL_KEY_RE,
  SORT_FIELDS,
  TEAM_NAME_MAX_LENGTH,
  WEAK_FOOT_STARS,
  isSortPreset,
  resolveLegacySort,
  type AiPlayingStyleKey,
  type BaseStat,
  type CardType,
  type Condition,
  type PhysiqueField,
  type Position,
  type SortField,
  type SortPreset,
} from "./constants";
import {
  formatRangeParam,
  normalizeSearchQuery,
  parseIntListParams,
  parsePositionParams,
  parseRangeParam,
  sortIds,
  sortPositions,
  type IntRange,
} from "./helpers";
import { INT4_MAX, type playerListInput } from "./schemas";

export type PlayersSort = SortPreset | SortField;

export interface PlayersState {
  /** Search text (`search`): card name or pack name, applied from SEARCH_MIN_LENGTH characters. */
  q: string;
  /** `null` = all card types (the default); otherwise the selected types (`card`). */
  types: CardType[] | null;
  /** Registered positions (`pos`, repeated) — any of them; catalogue order. */
  pos: Position[];
  /** Main playing-style ids (`playingStyle`, repeated) — any of them, each in
   *  either slot (OR). Ascending. */
  styles: number[];
  /** AI playing styles (`playingStyle=p_*`) — every one must be set (AND); catalogue order. */
  ai: AiPlayingStyleKey[];
  /** Country ids (`nat`, repeated, any of them) — internal ids. Ascending. */
  nat: number[];
  /** League ids (`league`, repeated, any of them). Ascending. */
  league: number[];
  /** Team names (`team`, repeated, any of them). Code-unit order. */
  teams: string[];
  /** All-digit `team` values of an older link — team ids not yet resolved to
   *  names (`resolveLegacyIds`). Ascending. */
  legacyTeamIds: number[];
  foot: 0 | 1 | undefined;
  /** Base Overall Rating (`base`) and Max Overall Rating (`ovr`) ranges. */
  base: IntRange | null;
  max: IntRange | null;
  /** Condition letters (`condition`, 0–4 in the URL); CONDITIONS order (E … A). */
  condition: Condition[];
  /** Form / weak-foot filters as 1-based stars, as shown (`form`, `wfa`, `wfu`
   *  hold the 0-based level). Ascending. */
  form: number[];
  wfa: number[];
  wfu: number[];
  height: IntRange | null;
  weight: IntRange | null;
  age: IntRange | null;
  /** Skill keys (`skill=s_*`) — every listed skill must be present (AND). Code-unit order. */
  skills: string[];
  /** Skill ids of an older link, not yet resolved to keys. Ascending. */
  legacySkillIds: number[];
  /** Stat ranges (`stat=speed:85-,finishing:80-95`); `statsAtMax` = `smax=1`. */
  stats: Partial<Record<BaseStat, IntRange>>;
  statsAtMax: boolean;
  /** Body-model ranges (`body=neckLength:-8`). */
  body: Partial<Record<PhysiqueField, IntRange>>;
  sort: PlayersSort;
  /** Direction of a field sort (presets fix their own). */
  order: "asc" | "desc";
  page: number;
}

export const DEFAULT_PLAYERS_STATE: PlayersState = {
  q: "",
  types: null,
  pos: [],
  styles: [],
  ai: [],
  nat: [],
  league: [],
  teams: [],
  legacyTeamIds: [],
  foot: undefined,
  base: null,
  max: null,
  condition: [],
  form: [],
  wfa: [],
  wfu: [],
  height: null,
  weight: null,
  age: null,
  skills: [],
  legacySkillIds: [],
  stats: {},
  statsAtMax: false,
  body: {},
  sort: DEFAULT_SORT_PRESET,
  order: "desc",
  page: 1,
};

/** The /players URL keys in the order they are written. */
export const PLAYERS_URL_KEYS = [
  "search",
  "sort",
  "pos",
  "card",
  "base",
  "ovr",
  "foot",
  "condition",
  "form",
  "wfa",
  "wfu",
  "height",
  "weight",
  "age",
  "playingStyle",
  "skill",
  "nat",
  "league",
  "team",
  "stat",
  "smax",
  "body",
  "order",
  "page",
] as const;

/** Largest page `player.list` accepts (`playerListInput.page`). A larger page in
 *  the URL is kept as read (so the page can say which page did not exist) and
 *  sent as this bound; PlayersClient then replaces it with the last page. */
export const MAX_LIST_PAGE = 10_000;

/** An AI playing style's URL value: `playingStyle=p_<dump key>` (survey S2 §6). */
export const AI_STYLE_URL_KEYS: Readonly<Record<AiPlayingStyleKey, string>> = {
  earlyCross: "p_early_cross",
  incisiveRun: "p_incisive_run",
  longBallExpert: "p_long_ball_expert",
  mazingRun: "p_mazing_run",
  speedingBullet: "p_speeding_bullet",
  trickster: "p_trickster",
};
const AI_KEY_BY_URL: ReadonlyMap<string, AiPlayingStyleKey> = new Map(
  AI_PLAYING_STYLE_KEYS.map((k) => [AI_STYLE_URL_KEYS[k], k] as const),
);

/** Style ids the Playing Style dialog offers (every id a stored card carries). */
const STYLE_IDS: ReadonlySet<number> = new Set([...PLAYING_STYLE_GROUPS.attack, ...PLAYING_STYLE_GROUPS.defence]);

const CARD_CODE: Readonly<Record<CardType, number>> = Object.fromEntries(
  Object.entries(CARD_TYPE_BY_EFOOTBASE_CODE).map(([code, t]) => [t, Number(code)]),
) as Record<CardType, number>;

/** Field sorts that read naturally from A to Z; every other field sort (the
 *  numbers) starts with the highest value. */
const ASCENDING_FIELD_SORTS: ReadonlySet<SortField> = new Set<SortField>(["name", "namePrint", "japName", "chineseName"]);

/**
 * Direction a sort starts in when it is chosen, and the direction an `order`-less
 * URL means: Name (and the other name columns) A → Z, numeric fields high → low.
 * The presets fix their own direction and ignore `order`; "desc" is their
 * neutral value. The URL writes `order` only when it differs from this, so
 * `sort=name` is A → Z and `sort=name&order=desc` is Z → A.
 */
export function defaultSortOrder(sort: PlayersSort): "asc" | "desc" {
  return !isSortPreset(sort) && ASCENDING_FIELD_SORTS.has(sort) ? "asc" : "desc";
}

const isCardType = (s: string): s is CardType => (CARD_TYPES as readonly string[]).includes(s);
const isSortField = (s: string): s is SortField => (SORT_FIELDS as readonly string[]).includes(s);
const isCondition = (s: string): s is Condition => (CONDITIONS as readonly string[]).includes(s);
const isAiKey = (s: string): s is AiPlayingStyleKey => (AI_PLAYING_STYLE_KEYS as readonly string[]).includes(s);
const isBaseStat = (s: string): s is BaseStat => (BASE_STATS as readonly string[]).includes(s);
const isPhysique = (s: string): s is PhysiqueField => (PHYSIQUE_FIELDS as readonly string[]).includes(s);

/** Canonical order of a list of names or keys: distinct, code-unit order (the
 *  same in every browser and in Node — a URL order, not a display order). */
export function sortNames(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Lenient integer (as before: `Number()`), used for `page`. */
function intParam(v: string | null, min: number, max: number): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** A plain decimal integer within [lo, hi], else undefined. */
function digitsIn(s: string, lo: number, hi: number): number | undefined {
  if (!/^\d{1,15}$/.test(s)) return undefined;
  const n = Number(s);
  return n >= lo && n <= hi ? n : undefined;
}

/** Repeated values, each possibly a comma list, as trimmed non-empty tokens. */
function tokens(values: readonly string[]): string[] {
  return values
    .flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Card types from `card=<code>` (repeated or comma-separated) with the legacy
 *  `type=EPIC,HIGHLIGHT` as fallback; every type selected = all (null). */
function readTypes(sp: URLSearchParams): CardType[] | null {
  const picked = new Set<CardType>();
  for (const raw of tokens(sp.getAll("card"))) {
    const code = digitsIn(raw, 0, 99);
    const t = code === undefined ? undefined : CARD_TYPE_BY_EFOOTBASE_CODE[code];
    if (t) picked.add(t);
  }
  if (picked.size === 0) {
    for (const raw of tokens(sp.getAll("type"))) if (isCardType(raw)) picked.add(raw);
  }
  if (picked.size === 0 || picked.size >= CARD_TYPES.length) return null;
  return CARD_TYPES.filter((t) => picked.has(t));
}

/** Legacy `ovrMin` / `maxOvrMin` / `maxOvrMax` → ranges when the new
 *  parameters are absent. */
function legacyRange(min: string | null, max: string | null, bounds: readonly [number, number]): IntRange | null {
  const lo = intParam(min, bounds[0], bounds[1]);
  const hi = intParam(max, bounds[0], bounds[1]);
  if (lo === undefined && hi === undefined) return null;
  if (lo !== undefined && hi !== undefined && lo > hi) return null;
  const out: IntRange = {};
  if (lo !== undefined) out.min = lo;
  if (hi !== undefined) out.max = hi;
  return out;
}

/** `condition`: the reference's 0–4 (E … A) or the old letters (`A,B`). */
function readConditions(values: readonly string[]): Condition[] {
  const picked = new Set<Condition>();
  for (const t of tokens(values)) {
    const upper = t.toUpperCase();
    if (isCondition(upper)) {
      picked.add(upper);
      continue;
    }
    const i = digitsIn(t, 0, CONDITIONS.length - 1);
    const c = i === undefined ? undefined : CONDITIONS[i];
    if (c) picked.add(c);
  }
  return CONDITIONS.filter((c) => picked.has(c));
}

/**
 * `form` / `wfa` / `wfu` → 1-based stars, ascending. A value with a comma is
 * an old eFootLab list of stars (`form=1,3` = 1★ and 3★); any other value is
 * the reference's 0-based level (`form=2` = 3★) — one value per parameter.
 */
function readStars(values: readonly string[], stars: number): number[] {
  const out = new Set<number>();
  for (const raw of values) {
    if (raw.includes(",")) {
      for (const t of tokens([raw])) {
        const n = digitsIn(t, 1, stars);
        if (n !== undefined) out.add(n);
      }
    } else {
      const n = digitsIn(raw.trim(), 0, stars - 1);
      if (n !== undefined) out.add(n + 1);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** `playingStyle` (ids and `p_*` AI keys) plus the legacy `style`, `dstyle`
 *  (single ids, either slot) and `ai` (comma list of AI flag names). */
function readStyles(sp: URLSearchParams): { styles: number[]; ai: AiPlayingStyleKey[] } {
  const styles = new Set<number>();
  const ai = new Set<AiPlayingStyleKey>();
  for (const t of tokens([...sp.getAll("playingStyle"), ...sp.getAll("style"), ...sp.getAll("dstyle")])) {
    const id = digitsIn(t, 0, INT4_MAX);
    if (id !== undefined) {
      if (STYLE_IDS.has(id)) styles.add(id);
      continue;
    }
    const key = AI_KEY_BY_URL.get(t.toLowerCase());
    if (key) ai.add(key);
  }
  for (const t of tokens(sp.getAll("ai"))) {
    const key = isAiKey(t) ? t : AI_KEY_BY_URL.get(t.toLowerCase());
    if (key) ai.add(key);
  }
  return { styles: sortIds(Array.from(styles)), ai: AI_PLAYING_STYLE_KEYS.filter((k) => ai.has(k)) };
}

/** An all-digit `team` value (or comma list of them): team ids of an older link. */
const LEGACY_ID_VALUE = /^\d+(?:\s*,\s*\d+)*$/;

/** `team`: names (never split on commas) or legacy all-digit ids; at most
 *  MAX_FILTER_IDS together, names first. */
function readTeams(values: readonly string[]): { teams: string[]; legacyTeamIds: number[] } {
  const names: string[] = [];
  const ids: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (v.length === 0) continue;
    if (LEGACY_ID_VALUE.test(v)) ids.push(v);
    else if (v.length <= TEAM_NAME_MAX_LENGTH) names.push(v);
  }
  const teams = sortNames(names).slice(0, MAX_FILTER_IDS);
  return { teams, legacyTeamIds: parseIntListParams(ids, 0, INT4_MAX, MAX_FILTER_IDS - teams.length) };
}

/** `skill`: keys (`s_rabona`) or legacy ids (`skill=8`, `skill=8,23`); at
 *  most MAX_FILTER_SKILLS together, keys first. */
function readSkills(values: readonly string[]): { skills: string[]; legacySkillIds: number[] } {
  const keys: string[] = [];
  const ids: string[] = [];
  for (const t of tokens(values)) {
    if (SKILL_KEY_RE.test(t)) keys.push(t);
    else if (/^\d+$/.test(t)) ids.push(t);
  }
  const skills = sortNames(keys).slice(0, MAX_FILTER_SKILLS);
  return { skills, legacySkillIds: parseIntListParams(ids, 1, INT4_MAX, MAX_FILTER_SKILLS - skills.length) };
}

/** `key:min-max,key:min-max` (one value or repeated) → ranges keyed by a validated key. */
function rangeMap<K extends string>(values: readonly string[], isKey: (s: string) => s is K, bounds: readonly [number, number]): Partial<Record<K, IntRange>> {
  const out: Partial<Record<K, IntRange>> = {};
  for (const part of tokens(values)) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const range = parseRangeParam(part.slice(i + 1), bounds[0], bounds[1]);
    if (isKey(key) && range) out[key] = range;
  }
  return out;
}

/** Ranges written in catalogue order (`speed:85-,finishing:80-95`), or null. */
function formatRangeMap<K extends string>(map: Partial<Record<K, IntRange>>, order: readonly K[]): string | null {
  const parts: string[] = [];
  for (const key of order) {
    const f = formatRangeParam(map[key]);
    if (f) parts.push(`${key}:${f}`);
  }
  return parts.length ? parts.join(",") : null;
}

/** The page state a /players query string stands for. Never throws. */
export function readPlayersState(sp: URLSearchParams): PlayersState {
  const footRaw = sp.get("foot");
  // Former presets: `sort=top` reads as High to low, `sort=trending` as the
  // default New cards (resolveLegacySort).
  const sortRaw = resolveLegacySort(sp.get("sort") ?? "");
  const sort: PlayersSort = isSortPreset(sortRaw) ? sortRaw : isSortField(sortRaw) ? sortRaw : DEFAULT_SORT_PRESET;
  const orderRaw = sp.get("order");
  const b = FILTER_RANGE_BOUNDS;
  const { styles, ai } = readStyles(sp);
  const { teams, legacyTeamIds } = readTeams(sp.getAll("team"));
  const { skills, legacySkillIds } = readSkills(sp.getAll("skill"));
  return {
    q: (sp.get("search") ?? sp.get("q") ?? "").trim().slice(0, LIST_SEARCH_MAX_LENGTH).trim(),
    types: readTypes(sp),
    // Repeated `pos` — the reference's registered-position index (`pos=12` =
    // CF) or an older link's position name (`pos=CF`, also a comma list).
    pos: parsePositionParams(sp.getAll("pos")),
    styles,
    ai,
    nat: parseIntListParams(sp.getAll("nat"), 1, INT4_MAX, MAX_FILTER_IDS),
    league: parseIntListParams(sp.getAll("league"), 0, INT4_MAX, MAX_FILTER_IDS),
    teams,
    legacyTeamIds,
    foot: footRaw === "0" ? 0 : footRaw === "1" ? 1 : undefined,
    base: parseRangeParam(sp.get("base"), b.ovr[0], b.ovr[1]) ?? legacyRange(sp.get("ovrMin"), sp.get("ovrMax"), b.ovr),
    max: parseRangeParam(sp.get("ovr"), b.maxOvr[0], b.maxOvr[1]) ?? legacyRange(sp.get("maxOvrMin"), sp.get("maxOvrMax"), b.maxOvr),
    condition: readConditions(sp.getAll("condition")),
    form: readStars(sp.getAll("form"), FORM_STARS),
    wfa: readStars(sp.getAll("wfa"), WEAK_FOOT_STARS),
    wfu: readStars(sp.getAll("wfu"), WEAK_FOOT_STARS),
    height: parseRangeParam(sp.get("height"), b.height[0], b.height[1]),
    weight: parseRangeParam(sp.get("weight"), b.weight[0], b.weight[1]),
    age: parseRangeParam(sp.get("age"), b.age[0], b.age[1]),
    skills,
    legacySkillIds,
    stats: rangeMap(sp.getAll("stat"), isBaseStat, b.stat),
    statsAtMax: sp.get("smax") === "1",
    body: rangeMap(sp.getAll("body"), isPhysique, b.physique),
    sort,
    // An explicit `order` wins; without one a field sort uses its natural
    // direction (defaultSortOrder).
    order: orderRaw === "asc" || orderRaw === "desc" ? orderRaw : defaultSortOrder(sort),
    // Any positive integer: a page past the end (or past MAX_LIST_PAGE) is
    // replaced by the last page once the list has answered.
    page: intParam(sp.get("page"), 1, Number.MAX_SAFE_INTEGER) ?? 1,
  };
}

/** Query string for a state, keys in PLAYERS_URL_KEYS order; defaults are
 *  omitted so the clean view is `/players`. */
export function writePlayersState(s: PlayersState): string {
  const sp = new URLSearchParams();
  const add = (key: (typeof PLAYERS_URL_KEYS)[number], value: string | number) => sp.append(key, String(value));
  const range = (key: (typeof PLAYERS_URL_KEYS)[number], r: IntRange | null) => {
    const f = formatRangeParam(r);
    if (f) add(key, f);
  };
  const stars = (key: (typeof PLAYERS_URL_KEYS)[number], list: readonly number[], max: number) => {
    for (const n of sortIds(list)) if (n >= 1 && n <= max) add(key, n - 1);
  };
  if (s.q) add("search", s.q);
  if (s.sort !== DEFAULT_SORT_PRESET) add("sort", s.sort);
  for (const p of sortPositions(s.pos)) add("pos", POSITIONS.indexOf(p));
  for (const t of CARD_TYPES) if (s.types?.includes(t)) add("card", CARD_CODE[t]);
  range("base", s.base);
  range("ovr", s.max);
  if (s.foot !== undefined) add("foot", s.foot);
  CONDITIONS.forEach((c, i) => {
    if (s.condition.includes(c)) add("condition", i);
  });
  stars("form", s.form, FORM_STARS);
  stars("wfa", s.wfa, WEAK_FOOT_STARS);
  stars("wfu", s.wfu, WEAK_FOOT_STARS);
  range("height", s.height);
  range("weight", s.weight);
  range("age", s.age);
  for (const id of sortIds(s.styles)) add("playingStyle", id);
  for (const k of AI_PLAYING_STYLE_KEYS) if (s.ai.includes(k)) add("playingStyle", AI_STYLE_URL_KEYS[k]);
  // Safety-net slices only: the pickers refuse a selection beyond the bound
  // with a visible message, and the reader applies the same bounds.
  const skills = sortNames(s.skills).slice(0, MAX_FILTER_SKILLS);
  for (const key of skills) add("skill", key);
  for (const id of sortIds(s.legacySkillIds).slice(0, MAX_FILTER_SKILLS - skills.length)) add("skill", id);
  for (const id of sortIds(s.nat).slice(0, MAX_FILTER_IDS)) add("nat", id);
  for (const id of sortIds(s.league).slice(0, MAX_FILTER_IDS)) add("league", id);
  const teams = sortNames(s.teams).slice(0, MAX_FILTER_IDS);
  for (const name of teams) add("team", name);
  for (const id of sortIds(s.legacyTeamIds).slice(0, MAX_FILTER_IDS - teams.length)) add("team", id);
  const stat = formatRangeMap(s.stats, BASE_STATS);
  if (stat) add("stat", stat);
  if (s.statsAtMax && stat) add("smax", 1);
  const body = formatRangeMap(s.body, PHYSIQUE_FIELDS);
  if (body) add("body", body);
  if (!isSortPreset(s.sort) && s.order !== defaultSortOrder(s.sort)) add("order", s.order);
  if (s.page > 1) add("page", s.page);
  return sp.toString();
}

/**
 * The query without its `page` parameter when that parameter does not name a
 * page past the first (`page=0`, `page=abc`, `page=-2`, `page=1.5`, `page=1`
 * — all read as page 1), so the address can be rewritten to the clean one;
 * `null` when there is nothing to drop. Every other parameter is kept as it
 * is (legacy names are rewritten on the next change, not on load).
 */
export function withoutDefaultPage(sp: URLSearchParams): string | null {
  if (!sp.has("page") || readPlayersState(sp).page > 1) return null;
  const out = new URLSearchParams(sp);
  out.delete("page");
  return out.toString();
}

// ---- Legacy ids → names / keys --------------------------------------------

export interface LegacyIdLookups {
  /** The name of a team id, or undefined while the list is unknown / for an unknown id. */
  teamName?: (id: number) => string | undefined;
  /** The key of a skill id, or null / undefined when it has none or is unknown. */
  skillKey?: (id: number) => string | null | undefined;
}

/**
 * The state with the legacy team / skill ids that the lookups know replaced
 * by team names and skill keys (the canonical form the next write uses);
 * the same object when nothing changed. Unknown ids stay ids.
 */
export function resolveLegacyIds(s: PlayersState, lookups: LegacyIdLookups): PlayersState {
  let { teams, legacyTeamIds, skills, legacySkillIds } = s;
  let changed = false;
  if (lookups.teamName && legacyTeamIds.length > 0) {
    const names: string[] = [];
    const keep: number[] = [];
    for (const id of legacyTeamIds) {
      const name = lookups.teamName(id)?.trim();
      if (name && name.length <= TEAM_NAME_MAX_LENGTH && !LEGACY_ID_VALUE.test(name)) names.push(name);
      else keep.push(id);
    }
    if (names.length > 0) {
      teams = sortNames([...teams, ...names]);
      legacyTeamIds = keep;
      changed = true;
    }
  }
  if (lookups.skillKey && legacySkillIds.length > 0) {
    const keys: string[] = [];
    const keep: number[] = [];
    for (const id of legacySkillIds) {
      const key = lookups.skillKey(id);
      if (key && SKILL_KEY_RE.test(key)) keys.push(key);
      else keep.push(id);
    }
    if (keys.length > 0) {
      skills = sortNames([...skills, ...keys]);
      legacySkillIds = keep;
      changed = true;
    }
  }
  return changed ? { ...s, teams, legacyTeamIds, skills, legacySkillIds } : s;
}

// ---- The list request -------------------------------------------------------

/** `player.list`'s input as a client sends it. */
export type PlayersListQuery = z.input<typeof playerListInput>;

/** True when the search text is long enough to be sent (SEARCH_MIN_LENGTH after folding). */
export function searchApplies(q: string): boolean {
  return normalizeSearchQuery(q).length >= SEARCH_MIN_LENGTH;
}

/** The `player.list` input for a state (`limit` cards per page). Empty lists
 *  and defaults are left out. */
export function playersListQuery(s: PlayersState, limit: number): PlayersListQuery {
  const statRanges = BASE_STATS.flatMap((stat) => {
    const r = s.stats[stat];
    return r ? [{ stat, min: r.min, max: r.max }] : [];
  });
  const bodyRanges = PHYSIQUE_FIELDS.flatMap((field) => {
    const r = s.body[field];
    return r ? [{ field, min: r.min, max: r.max }] : [];
  });
  const list = <T>(values: readonly T[]): T[] | undefined => (values.length > 0 ? [...values] : undefined);
  const levels = (starsList: readonly number[]) => list(sortIds(starsList).map((n) => n - 1));
  return {
    // The URL may carry a page past MAX_LIST_PAGE (the API bound); it is
    // asked for as the bound and then replaced by the last page.
    page: Math.min(s.page, MAX_LIST_PAGE),
    limit,
    sort: s.sort,
    order: s.order,
    // A 1- or 2-character search is shown in the field but not sent.
    q: searchApplies(s.q) ? s.q : undefined,
    cardTypeIn: s.types ?? undefined,
    // Lists: OR within, AND between (positions = registered position).
    positions: list(sortPositions(s.pos)),
    playingStyles: list(sortIds(s.styles)),
    aiStyles: list(AI_PLAYING_STYLE_KEYS.filter((k) => s.ai.includes(k))),
    nationalityIds: list(sortIds(s.nat)),
    leagueIds: list(sortIds(s.league)),
    teamNames: list(sortNames(s.teams)),
    clubIds: list(sortIds(s.legacyTeamIds)),
    strongerFoot: s.foot,
    ovrMin: s.base?.min,
    ovrMax: s.base?.max,
    maxOvrMin: s.max?.min,
    maxOvrMax: s.max?.max,
    conditionIn: list(CONDITIONS.filter((c) => s.condition.includes(c))),
    // Stars (1-based, as shown) → stored levels (0-based).
    formIn: levels(s.form),
    weakFootAccuracyIn: levels(s.wfa),
    weakFootUsageIn: levels(s.wfu),
    heightMin: s.height?.min,
    heightMax: s.height?.max,
    weightMin: s.weight?.min,
    weightMax: s.weight?.max,
    ageMin: s.age?.min,
    ageMax: s.age?.max,
    skillKeys: list(sortNames(s.skills)),
    skillIds: list(sortIds(s.legacySkillIds)),
    statRanges: list(statRanges),
    statsAtMax: statRanges.length > 0 && s.statsAtMax ? true : undefined,
    bodyRanges: list(bodyRanges),
  };
}

// ---- Counts, Reset, active-filter chips ------------------------------------

/** Number of active filters (everything except search, sort and page) — the
 *  badge on the phone "Filters" button and the Reset affordance. A
 *  multi-valued OR filter (Position, Card Type, main playing styles, Nation,
 *  League, Team, Condition, Form, the weak-foot lists) counts once however
 *  many values it holds; the AND lists (AI styles, skills, stat and body
 *  ranges) count per value. */
export function countActiveFilters(s: PlayersState): number {
  let n = 0;
  if (s.types !== null) n++;
  if (s.styles.length) n++;
  n += s.ai.length;
  if (s.foot !== undefined) n++;
  for (const r of [s.base, s.max, s.height, s.weight, s.age]) if (r) n++;
  for (const list of [s.pos, s.nat, s.league, s.condition, s.form, s.wfa, s.wfu]) if (list.length) n++;
  if (s.teams.length + s.legacyTeamIds.length) n++;
  n += s.skills.length + s.legacySkillIds.length;
  n += Object.keys(s.stats).length;
  n += Object.keys(s.body).length;
  return n;
}

/** True when any filter is active (search, sort and page excluded). */
export function hasActiveFilters(s: PlayersState): boolean {
  return countActiveFilters(s) > 0;
}

/** The dialog rows of the filter rail. */
export type FilterDialogRow = "stats" | "body" | "style" | "skills" | "nation" | "league" | "team";

/**
 * The count badge of each dialog row of the rail (survey S2 §6: "Stats 2" =
 * a stat range plus the max switch, "Playing Style 5", "Nation 2"): the
 * number of selected values. The max-level switch counts only while a stat
 * range exists — it is written to the URL (and applied) only then.
 */
export function filterDialogCounts(s: PlayersState): Record<FilterDialogRow, number> {
  const statRanges = Object.keys(s.stats).length;
  return {
    stats: statRanges + (s.statsAtMax && statRanges > 0 ? 1 : 0),
    body: Object.keys(s.body).length,
    style: s.styles.length + s.ai.length,
    skills: s.skills.length + s.legacySkillIds.length,
    nation: s.nat.length,
    league: s.league.length,
    team: s.teams.length + s.legacyTeamIds.length,
  };
}

/** Reset (rail, sheet, chip row): every filter cleared, the search text and
 *  the sort (with a field sort's direction) kept, page 1 (survey S2 §7). */
export function resetFilters(s: PlayersState): PlayersState {
  return { ...DEFAULT_PLAYERS_STATE, q: s.q, sort: s.sort, order: s.order };
}

/** One active filter value — one removable chip. */
export type ActiveFilter =
  | { kind: "pos"; value: Position }
  | { kind: "card"; value: CardType }
  | { kind: "base" | "max" | "height" | "weight" | "age"; range: IntRange }
  | { kind: "foot"; value: 0 | 1 }
  | { kind: "condition"; value: Condition }
  | { kind: "form" | "wfa" | "wfu"; value: number }
  | { kind: "style"; value: number }
  | { kind: "ai"; value: AiPlayingStyleKey }
  | { kind: "skill"; value: string }
  | { kind: "skillId"; value: number }
  | { kind: "nat" | "league"; value: number }
  | { kind: "team"; value: string }
  | { kind: "teamId"; value: number }
  | { kind: "stat"; value: BaseStat; range: IntRange }
  | { kind: "statsAtMax" }
  | { kind: "body"; value: PhysiqueField; range: IntRange };

/** Every active filter value, in the URL's key order (the reference's chip
 *  order: card types, then condition, form, …; leagues before teams). Inside
 *  the card types the chips follow the Card Type toggles
 *  (CARD_TYPE_FILTER_ORDER: Standard, Selection, Icons, …), while the URL
 *  writes `card=<code>` in code order. */
export function activeFilters(s: PlayersState): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const value of sortPositions(s.pos)) out.push({ kind: "pos", value });
  for (const value of CARD_TYPE_FILTER_ORDER) if (s.types?.includes(value)) out.push({ kind: "card", value });
  if (s.base) out.push({ kind: "base", range: s.base });
  if (s.max) out.push({ kind: "max", range: s.max });
  if (s.foot !== undefined) out.push({ kind: "foot", value: s.foot });
  for (const value of CONDITIONS) if (s.condition.includes(value)) out.push({ kind: "condition", value });
  for (const value of sortIds(s.form)) out.push({ kind: "form", value });
  for (const value of sortIds(s.wfa)) out.push({ kind: "wfa", value });
  for (const value of sortIds(s.wfu)) out.push({ kind: "wfu", value });
  if (s.height) out.push({ kind: "height", range: s.height });
  if (s.weight) out.push({ kind: "weight", range: s.weight });
  if (s.age) out.push({ kind: "age", range: s.age });
  for (const value of sortIds(s.styles)) out.push({ kind: "style", value });
  for (const value of AI_PLAYING_STYLE_KEYS) if (s.ai.includes(value)) out.push({ kind: "ai", value });
  for (const value of sortNames(s.skills)) out.push({ kind: "skill", value });
  for (const value of sortIds(s.legacySkillIds)) out.push({ kind: "skillId", value });
  for (const value of sortIds(s.nat)) out.push({ kind: "nat", value });
  for (const value of sortIds(s.league)) out.push({ kind: "league", value });
  for (const value of sortNames(s.teams)) out.push({ kind: "team", value });
  for (const value of sortIds(s.legacyTeamIds)) out.push({ kind: "teamId", value });
  for (const value of BASE_STATS) {
    const range = s.stats[value];
    if (range) out.push({ kind: "stat", value, range });
  }
  if (s.statsAtMax && Object.keys(s.stats).length > 0) out.push({ kind: "statsAtMax" });
  for (const value of PHYSIQUE_FIELDS) {
    const range = s.body[value];
    if (range) out.push({ kind: "body", value, range });
  }
  return out;
}

/** A stable key for a chip (`pos:CF`, `team:Arsenal FC`, `base`). */
export function activeFilterKey(f: ActiveFilter): string {
  return "value" in f ? `${f.kind}:${f.value}` : f.kind;
}

/** The state without one filter value (that value only), back on page 1. */
export function withoutFilter(s: PlayersState, f: ActiveFilter): PlayersState {
  const next: PlayersState = { ...s, page: 1 };
  switch (f.kind) {
    case "pos":
      next.pos = s.pos.filter((v) => v !== f.value);
      break;
    case "card": {
      const types = (s.types ?? []).filter((v) => v !== f.value);
      next.types = types.length > 0 ? types : null;
      break;
    }
    case "base":
    case "max":
    case "height":
    case "weight":
    case "age":
      next[f.kind] = null;
      break;
    case "foot":
      next.foot = undefined;
      break;
    case "condition":
      next.condition = s.condition.filter((v) => v !== f.value);
      break;
    case "form":
    case "wfa":
    case "wfu":
      next[f.kind] = s[f.kind].filter((v) => v !== f.value);
      break;
    case "style":
      next.styles = s.styles.filter((v) => v !== f.value);
      break;
    case "ai":
      next.ai = s.ai.filter((v) => v !== f.value);
      break;
    case "skill":
      next.skills = s.skills.filter((v) => v !== f.value);
      break;
    case "skillId":
      next.legacySkillIds = s.legacySkillIds.filter((v) => v !== f.value);
      break;
    case "nat":
    case "league":
      next[f.kind] = s[f.kind].filter((v) => v !== f.value);
      break;
    case "team":
      next.teams = s.teams.filter((v) => v !== f.value);
      break;
    case "teamId":
      next.legacyTeamIds = s.legacyTeamIds.filter((v) => v !== f.value);
      break;
    case "stat": {
      const stats = { ...s.stats };
      delete stats[f.value];
      next.stats = stats;
      break;
    }
    case "statsAtMax":
      next.statsAtMax = false;
      break;
    case "body": {
      const body = { ...s.body };
      delete body[f.value];
      next.body = body;
      break;
    }
  }
  return next;
}

// ---- Picker order ------------------------------------------------------------

/**
 * The Nation dialog's order (survey S2 §6, spec efootbase-behaviour-parity
 * "Players Paging, Search And Filters"): FIXED_FIRST_NATIONS first, in that
 * order, matched by stored name, then every other nation once, A–Z — no group
 * headings.
 */
export function orderNationsForPicker<T extends { name: string }>(rows: readonly T[]): T[] {
  const first: T[] = [];
  for (const name of FIXED_FIRST_NATIONS) {
    const row = rows.find((r) => r.name === name);
    if (row && !first.includes(row)) first.push(row);
  }
  const rest = rows.filter((r) => !first.includes(r)).sort((a, b) => a.name.localeCompare(b.name, "en"));
  return [...first, ...rest];
}

export interface PickerTeamRow {
  id: number;
  name: string;
  leagueId: number | null;
}

/**
 * The Team dialog's list (spec catalog-browsing-parity "Additional Player
 * Filters"): every team, grouped under its league — leagues A–Z, teams A–Z
 * inside — and the teams without a (known) league last with `league: null`.
 * Not narrowed by a League selection. League id 0 ("Other") is a real league.
 */
export function groupTeamsForPicker<T extends PickerTeamRow>(
  teams: readonly T[],
  leagues: ReadonlyArray<{ id: number; name: string }>,
): Array<{ team: T; league: string | null }> {
  const leagueName = new Map(leagues.map((l) => [l.id, l.name]));
  const byName = (a: string, b: string) => a.localeCompare(b, "en");
  const rows = teams.map((team) => ({ team, league: team.leagueId === null ? null : (leagueName.get(team.leagueId) ?? null) }));
  return rows.sort((a, b) => {
    if (a.league !== b.league) {
      if (a.league === null) return 1;
      if (b.league === null) return -1;
      return byName(a.league, b.league);
    }
    return byName(a.team.name, b.team.name) || a.team.id - b.team.id;
  });
}
