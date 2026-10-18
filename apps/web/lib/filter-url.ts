// URL ⇄ state of the /players page (catalog-browsing-parity "Page State Lives
// in the URL", efootbase-parity-round2 "Additional Player Filters"). Pure
// functions, no React: PlayersClient reads the state from `useSearchParams`
// and writes every change back with `router.replace`.
//
// Parameter names follow efootbase where they were observed in the 2026-10-18
// capture (`sort`, `pos`, `card` repeated, `base`, `ovr`, `playingStyle`,
// `foot`, `search`); the names eflab used before (`q`, `type`, `style`,
// `dstyle`, `ovrMin`, `maxOvrMin`, `maxOvrMax`) are still read so old links
// keep working, but are never written. Ranges use efootbase's `min-max`
// syntax (`base=90-`, `ovr=-100`, `height=180-190`).
import {
  AI_PLAYING_STYLE_KEYS,
  BASE_STATS,
  CARD_TYPES,
  CARD_TYPE_BY_EFOOTBASE_CODE,
  CONDITIONS,
  DEFAULT_SORT_PRESET,
  FILTER_RANGE_BOUNDS,
  PHYSIQUE_FIELDS,
  POSITIONS,
  SORT_FIELDS,
  formatRangeParam,
  isSortPreset,
  parseRangeParam,
  type AiPlayingStyleKey,
  type BaseStat,
  type CardType,
  type Condition,
  type IntRange,
  type PhysiqueField,
  type Position,
  type SortField,
  type SortPreset,
} from "@eflab/shared";

export type PlayersSort = SortPreset | SortField;

export interface PlayersState {
  /** Name query (`search`). */
  q: string;
  /** `null` = all card types (the default); otherwise the selected types (`card`). */
  types: CardType[] | null;
  pos: Position | "";
  /** Playing-style id, matched in either slot (`playingStyle`). */
  style: number | undefined;
  /** AI playing styles — every listed flag must be set (`ai`). */
  ai: AiPlayingStyleKey[];
  /** Country id (`nat`) — efootbase uses ISO-like codes, which the data lacks. */
  nat: number | undefined;
  league: number | undefined;
  team: number | undefined;
  foot: 0 | 1 | undefined;
  /** Base Overall Rating (`base`) and Max Overall Rating (`ovr`) ranges. */
  base: IntRange | null;
  max: IntRange | null;
  condition: Condition[];
  /** Form / weak-foot filters as 1-based stars, exactly as shown (`form`, `wfa`, `wfu`). */
  form: number[];
  wfa: number[];
  wfu: number[];
  height: IntRange | null;
  weight: IntRange | null;
  age: IntRange | null;
  /** Skill ids — every listed skill must be present (`skill`). */
  skills: number[];
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
  pos: "",
  style: undefined,
  ai: [],
  nat: undefined,
  league: undefined,
  team: undefined,
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
  stats: {},
  statsAtMax: false,
  body: {},
  sort: DEFAULT_SORT_PRESET,
  order: "desc",
  page: 1,
};

const INT4_MAX = 2_147_483_647;
const isCardType = (s: string): s is CardType => (CARD_TYPES as readonly string[]).includes(s);
const isPosition = (s: string): s is Position => (POSITIONS as readonly string[]).includes(s);
const isSortField = (s: string): s is SortField => (SORT_FIELDS as readonly string[]).includes(s);
const isCondition = (s: string): s is Condition => (CONDITIONS as readonly string[]).includes(s);
const isAiKey = (s: string): s is AiPlayingStyleKey => (AI_PLAYING_STYLE_KEYS as readonly string[]).includes(s);
const isBaseStat = (s: string): s is BaseStat => (BASE_STATS as readonly string[]).includes(s);
const isPhysique = (s: string): s is PhysiqueField => (PHYSIQUE_FIELDS as readonly string[]).includes(s);

function intParam(v: string | null, min: number, max: number): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** Distinct integers of a comma list within [min, max], in list order. */
function intList(v: string | null, min: number, max: number): number[] {
  if (!v) return [];
  const out: number[] = [];
  for (const part of v.split(",")) {
    const n = intParam(part, min, max);
    if (n !== undefined && !out.includes(n)) out.push(n);
  }
  return out;
}

/** `key:min-max,key:min-max` → ranges keyed by a validated key. */
function rangeMap<K extends string>(v: string | null, isKey: (s: string) => s is K, bounds: readonly [number, number]): Partial<Record<K, IntRange>> {
  const out: Partial<Record<K, IntRange>> = {};
  if (!v) return out;
  for (const part of v.split(",")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const range = parseRangeParam(part.slice(i + 1), bounds[0], bounds[1]);
    if (isKey(key) && range) out[key] = range;
  }
  return out;
}

function formatRangeMap(map: Partial<Record<string, IntRange>>): string | null {
  const parts: string[] = [];
  for (const [key, range] of Object.entries(map)) {
    const f = formatRangeParam(range);
    if (f) parts.push(`${key}:${f}`);
  }
  return parts.length ? parts.join(",") : null;
}

/** Card types from `card=<code>` (repeated or comma-separated efootbase codes)
 *  with the legacy `type=EPIC,HIGHLIGHT` / `type=all` as fallback. */
function readTypes(sp: URLSearchParams): CardType[] | null {
  const picked: CardType[] = [];
  for (const raw of sp.getAll("card").flatMap((v) => v.split(","))) {
    const code = intParam(raw, 0, 99);
    const t = code === undefined ? undefined : CARD_TYPE_BY_EFOOTBASE_CODE[code];
    if (t && !picked.includes(t)) picked.push(t);
  }
  if (picked.length === 0) {
    for (const raw of (sp.get("type") ?? "").split(",")) {
      if (isCardType(raw) && !picked.includes(raw)) picked.push(raw);
    }
  }
  if (picked.length === 0 || picked.length >= CARD_TYPES.length) return null;
  return CARD_TYPES.filter((t) => picked.includes(t));
}

function readPosition(sp: URLSearchParams): Position | "" {
  const raw = sp.get("pos") ?? "";
  if (isPosition(raw)) return raw;
  // efootbase sends the registered-position index (same ids as POSITIONS).
  const idx = intParam(raw, 0, POSITIONS.length - 1);
  return idx === undefined ? "" : POSITIONS[idx]!;
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

export function readPlayersState(sp: URLSearchParams): PlayersState {
  const footRaw = sp.get("foot");
  const sortRaw = sp.get("sort") ?? "";
  const sort: PlayersSort = isSortPreset(sortRaw) ? sortRaw : isSortField(sortRaw) ? sortRaw : DEFAULT_SORT_PRESET;
  const b = FILTER_RANGE_BOUNDS;
  return {
    q: (sp.get("search") ?? sp.get("q") ?? "").trim(),
    types: readTypes(sp),
    pos: readPosition(sp),
    style: intParam(sp.get("playingStyle"), 1, 99) ?? intParam(sp.get("style"), 1, 99) ?? intParam(sp.get("dstyle"), 1, 99),
    ai: (sp.get("ai") ?? "").split(",").filter(isAiKey),
    nat: intParam(sp.get("nat"), 1, INT4_MAX),
    league: intParam(sp.get("league"), 0, INT4_MAX),
    team: intParam(sp.get("team"), 0, INT4_MAX),
    foot: footRaw === "0" ? 0 : footRaw === "1" ? 1 : undefined,
    base: parseRangeParam(sp.get("base"), b.ovr[0], b.ovr[1]) ?? legacyRange(sp.get("ovrMin"), sp.get("ovrMax"), b.ovr),
    max: parseRangeParam(sp.get("ovr"), b.maxOvr[0], b.maxOvr[1]) ?? legacyRange(sp.get("maxOvrMin"), sp.get("maxOvrMax"), b.maxOvr),
    condition: (sp.get("condition") ?? "").split(",").map((s) => s.toUpperCase()).filter(isCondition),
    form: intList(sp.get("form"), 1, 3),
    wfa: intList(sp.get("wfa"), 1, 4),
    wfu: intList(sp.get("wfu"), 1, 4),
    height: parseRangeParam(sp.get("height"), b.height[0], b.height[1]),
    weight: parseRangeParam(sp.get("weight"), b.weight[0], b.weight[1]),
    age: parseRangeParam(sp.get("age"), b.age[0], b.age[1]),
    skills: intList(sp.get("skill"), 1, INT4_MAX).slice(0, 20),
    stats: rangeMap(sp.get("stat"), isBaseStat, b.stat),
    statsAtMax: sp.get("smax") === "1",
    body: rangeMap(sp.get("body"), isPhysique, b.physique),
    sort,
    order: sp.get("order") === "asc" ? "asc" : "desc",
    page: intParam(sp.get("page"), 1, 10_000) ?? 1,
  };
}

/** Query string for a state; defaults are omitted so `/players` stays clean. */
export function writePlayersState(s: PlayersState): string {
  const sp = new URLSearchParams();
  const setRange = (key: string, r: IntRange | null) => {
    const f = formatRangeParam(r);
    if (f) sp.set(key, f);
  };
  if (s.q) sp.set("search", s.q);
  for (const t of s.types ?? []) {
    const code = Object.entries(CARD_TYPE_BY_EFOOTBASE_CODE).find(([, v]) => v === t)?.[0];
    if (code !== undefined) sp.append("card", code);
  }
  if (s.pos) sp.set("pos", s.pos);
  if (s.style !== undefined) sp.set("playingStyle", String(s.style));
  if (s.ai.length) sp.set("ai", s.ai.join(","));
  if (s.nat !== undefined) sp.set("nat", String(s.nat));
  if (s.league !== undefined) sp.set("league", String(s.league));
  if (s.team !== undefined) sp.set("team", String(s.team));
  if (s.foot !== undefined) sp.set("foot", String(s.foot));
  setRange("base", s.base);
  setRange("ovr", s.max);
  if (s.condition.length) sp.set("condition", s.condition.join(","));
  if (s.form.length) sp.set("form", s.form.join(","));
  if (s.wfa.length) sp.set("wfa", s.wfa.join(","));
  if (s.wfu.length) sp.set("wfu", s.wfu.join(","));
  setRange("height", s.height);
  setRange("weight", s.weight);
  setRange("age", s.age);
  if (s.skills.length) sp.set("skill", s.skills.join(","));
  const stat = formatRangeMap(s.stats);
  if (stat) sp.set("stat", stat);
  if (s.statsAtMax && stat) sp.set("smax", "1");
  const body = formatRangeMap(s.body);
  if (body) sp.set("body", body);
  if (s.sort !== DEFAULT_SORT_PRESET) sp.set("sort", s.sort);
  if (!isSortPreset(s.sort) && s.order !== "desc") sp.set("order", s.order);
  if (s.page > 1) sp.set("page", String(s.page));
  return sp.toString();
}

/** Number of active filters (everything except query, sort and page) — the
 *  badge on the mobile "Filters" button and the Reset affordance. */
export function countActiveFilters(s: PlayersState): number {
  let n = 0;
  if (s.types !== null) n++;
  if (s.pos) n++;
  if (s.style !== undefined) n++;
  n += s.ai.length;
  if (s.nat !== undefined) n++;
  if (s.league !== undefined) n++;
  if (s.team !== undefined) n++;
  if (s.foot !== undefined) n++;
  for (const r of [s.base, s.max, s.height, s.weight, s.age]) if (r) n++;
  for (const list of [s.condition, s.form, s.wfa, s.wfu]) if (list.length) n++;
  n += s.skills.length;
  n += Object.keys(s.stats).length;
  n += Object.keys(s.body).length;
  return n;
}

/** `true` when anything differs from the clean /players view. */
export function hasAnyState(s: PlayersState): boolean {
  return Boolean(s.q) || countActiveFilters(s) > 0 || s.sort !== DEFAULT_SORT_PRESET || s.order !== "desc";
}
