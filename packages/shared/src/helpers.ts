// Small pure helpers shared by the API and the web app (eflab-parity-fixes,
// design decisions 6 and 15; multi-select-filters for the repeated-parameter
// lists). No I/O, no framework imports — tested by helpers.test.ts with the
// same assert-style runner as progression.test.ts.
import { BUNDLE_SLUG_MAX_LENGTH, POSITIONS, SKILL_SLUG_MAX_LENGTH, WEAK_FOOT_STARS, type Position } from "./constants";

/**
 * Normalise a free-text player search query the same way efootbase derives
 * `name_normalized` (stored as `Player.nameNormalized`): Unicode NFD, strip the
 * combining marks (accents), lower-case, collapse whitespace. Done in
 * application code so the database never needs an IMMUTABLE `unaccent` wrapper
 * and the C-locale `lower()` of the docker Postgres is never relied on.
 *
 *   "Mbappé"  → "mbappe"
 *   " Schär " → "schar"
 *   "三笘 薫"  → "三笘 薫" (non-Latin scripts are left as-is)
 */
export function normalizeSearchQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Hyphens, dashes (‐ ‑ ‒ – — ― and the minus sign), slashes and underscores. */
const LABEL_SEPARATORS = /[-‐-―−_/]/g;

/** Typographic apostrophes (’ ‘ and the modifier letter ʼ), read as the ASCII
 *  apostrophe — phone keyboards type ’ in "Striker’s". */
const LABEL_APOSTROPHES = /[’‘ʼ]/g;

/**
 * Search key of a label for the client-side list filters (the `/wiki/skills`
 * search, the Nation / League / Team / Skills pickers of `/players`, the
 * manager and second-booster drawers of the Progression panel): separators
 * read as spaces, typographic apostrophes as `'`, then `normalizeSearchQuery`
 * (accents and case folded, spaces collapsed). Built the same way for the
 * query and for each label, so a substring test of the two keys matches
 *
 *   "one touch"     → "One-touch Pass"
 *   "cote"          → "Côte d'Ivoire"
 *   "sao paulo"     → "São Paulo F.C."
 *   "saint etienne" → "AS Saint-Étienne"
 *   "striker’s"     → "Striker's Instinct +1"
 *
 * The apostrophe fold is deliberately not part of `normalizeSearchQuery`: the
 * player search (API, against the stored `nameNormalized` and the pack names)
 * keeps its exact rule.
 */
export function labelSearchKey(s: string): string {
  return normalizeSearchQuery(s.replace(LABEL_SEPARATORS, " ").replace(LABEL_APOSTROPHES, "'"));
}

/**
 * Escape the three characters that are special inside a SQL `LIKE` pattern so a
 * user query is matched literally. The SQL side must declare the same escape
 * character: `… LIKE '%' || $1 || '%' ESCAPE '\'`.
 *
 *   "50%"  → "50\%"
 *   "a_b"  → "a\_b"
 *   "C:\x" → "C:\\x"
 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** True when the string contains any character outside 7-bit ASCII (used to
 *  decide whether the Japanese/Chinese name columns must be searched too). */
export function hasNonAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7f]/.test(s);
}

/**
 * Centimetres → feet and inches (design decision 15): whole feet are floored,
 * the remaining inches are rounded to the nearest whole inch, and a rounded 12"
 * carries into the next foot (so a value never prints as 5'12").
 *
 *   170 cm = 66.93 in → 5 ft + 6.93 in → 5'7"
 *   180 cm = 70.87 in → 5 ft + 10.87 in → 5'11"
 *   182 cm = 71.65 in → 5 ft + 11.65 in → rounds to 12 → carry → 6'0"
 *   183 cm = 72.05 in → 6'0"
 *
 * 1 in = 2.54 cm exactly; there is no truncation step (truncating would print
 * 170 cm as 5'6", which contradicts the documented 5'7").
 */
export function heightToFeetInches(cm: number): { feet: number; inches: number } {
  if (!Number.isFinite(cm) || cm <= 0) return { feet: 0, inches: 0 };
  const totalInches = cm / 2.54;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

/** `heightToFeetInches` formatted the efootbase way: 5'11". */
export function formatFeetInches(cm: number): string {
  const { feet, inches } = heightToFeetInches(cm);
  return `${feet}'${inches}"`;
}

/** An integer range with optional edges, as carried by a URL parameter. */
export interface IntRange {
  min?: number;
  max?: number;
}

/**
 * Parse efootbase's range URL syntax `min-max` (`90-` = at least 90, `-85` = at
 * most 85, `80-90` = between). Edges outside `[lo, hi]`, non-integers and an
 * inverted range are dropped so a hand-edited URL never produces a 400 from the
 * API; a range with no usable edge returns `null`. A bare number is a minimum
 * (`base=90` behaves like `base=90-`).
 */
export function parseRangeParam(value: string | null | undefined, lo: number, hi: number): IntRange | null {
  if (value == null) return null;
  const m = /^\s*(\d*)\s*(-?)\s*(\d*)\s*$/.exec(value);
  if (!m) return null;
  const [, a, dash, b] = m;
  const edge = (s: string | undefined): number | undefined => {
    if (!s) return undefined;
    const n = Number(s);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
  };
  const min = edge(a);
  const max = dash ? edge(b) : undefined;
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined && min > max) return null;
  const out: IntRange = {};
  if (min !== undefined) out.min = min;
  if (max !== undefined) out.max = max;
  return out;
}

/** Inverse of `parseRangeParam`: `{min:90}` → `90-`, `{max:85}` → `-85`,
 *  `{min:80,max:90}` → `80-90`; an empty range → `null` (parameter omitted). */
export function formatRangeParam(range: IntRange | null | undefined): string | null {
  if (!range || (range.min === undefined && range.max === undefined)) return null;
  return `${range.min ?? ""}-${range.max ?? ""}`;
}

// ---- Repeated URL parameters of the multi-valued filters (multi-select-filters).
// efootbase repeats the parameter (`pos=12&pos=11`, `nation=…&nation=…`); the
// web's URL helper reads the repeated form, a comma list inside one value and
// the older single value alike, and always writes the repeated form in the
// canonical order below, so equal selections produce equal URLs and
// `write(read(url))` is a fixed point.

/** Split repeated parameter values that may themselves be comma lists. */
function splitParamValues(values: readonly string[]): string[] {
  return values.flatMap((v) => v.split(",")).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Distinct integers within `[lo, hi]` from repeated parameter values, sorted
 * ascending (the canonical URL order for id lists). Non-integers and values
 * outside the bound are dropped; once `limit` distinct values are collected
 * the rest are dropped too, so a hand-edited URL never sends an over-long list.
 *
 *   ["14", "3", "14"]      → [3, 14]
 *   ["3,14", "x", "-1"]    → [3, 14]
 */
export function parseIntListParams(values: readonly string[], lo: number, hi: number, limit: number): number[] {
  const set = new Set<number>();
  for (const part of splitParamValues(values)) {
    if (!/^\d+$/.test(part)) continue;
    const n = Number(part);
    if (!Number.isSafeInteger(n) || n < lo || n > hi) continue;
    set.add(n);
  }
  return Array.from(set)
    .sort((a, b) => a - b)
    .slice(0, limit);
}

/**
 * Positions from repeated `pos` values — a name (`CF`, case-insensitive) or
 * efootbase's registered-position index (`12`, the index into POSITIONS) —
 * de-duplicated and returned in catalogue order (POSITIONS), which is the
 * canonical URL order. Unknown values are dropped.
 *
 *   ["12", "11"]        → ["SS", "CF"]
 *   ["cf", "CF", "GK"]  → ["GK", "CF"]
 */
export function parsePositionParams(values: readonly string[]): Position[] {
  const picked = new Set<Position>();
  for (const part of splitParamValues(values)) {
    const upper = part.toUpperCase();
    if ((POSITIONS as readonly string[]).includes(upper)) {
      picked.add(upper as Position);
      continue;
    }
    if (/^\d{1,2}$/.test(part)) {
      const p = POSITIONS[Number(part)];
      if (p) picked.add(p);
    }
  }
  return POSITIONS.filter((p) => picked.has(p));
}

/** Canonical order for a position list (catalogue order, duplicates removed). */
export function sortPositions(positions: readonly Position[]): Position[] {
  return POSITIONS.filter((p) => positions.includes(p));
}

/** Canonical order for an id list (ascending, duplicates removed). */
export function sortIds(ids: readonly number[]): number[] {
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

// ---- change efootbase-function-parity ----

/**
 * URL slug of a second booster (`b2=`): the name without its trailing " +1",
 * lower case, apostrophes removed, every other run of characters that are
 * not letters or digits replaced by "-" (none at either end), then "1" —
 * the one slug the reference was seen to write, `strikers-instinct1`.
 *
 *   "Striker's Instinct +1" → "strikers-instinct1"
 *   "Free-kick Taking +1"   → "free-kick-taking1"
 *   "Off the Ball +1"       → "off-the-ball1"
 */
export function secondBoosterSlug(name: string): string {
  const base = name
    .replace(/\s*\+1\s*$/, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}1`;
}

/**
 * Public slug of a skill page (`/wiki/skills/<slug>`): the stored skill key
 * (`Skill.efbKey`, `s_phenomenal_pass`) without its leading `s_`, underscores
 * as hyphens (`phenomenal-pass`) — equal to the reference's slug for every
 * one of the 67 public skills; the stored slug (the join key, never changed)
 * for an entry without a key.
 */
export function skillPublicSlug(skill: { slug: string; efbKey: string | null | undefined }): string {
  return skill.efbKey ? skill.efbKey.replace(/^s_/, "").replace(/_/g, "-") : skill.slug;
}

/** Inverse of the key part of `skillPublicSlug`: the stored key a public slug
 *  stands for (`phenomenal-pass` → `s_phenomenal_pass`), or null when the slug
 *  cannot be one. */
export function skillKeyFromPublicSlug(slug: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `s_${slug.replace(/-/g, "_")}` : null;
}

/** A path segment shaped like a slug — a letter or digit, then letters,
 *  digits or hyphens (either case: the API compares the slug exactly) — of at
 *  most `max` characters. */
function isSlugWithin(s: string, max: number): boolean {
  return s.length <= max && /^[a-z0-9][a-z0-9-]*$/i.test(s);
}

/**
 * Path pre-checks of the web's slug pages (`apps/web/lib/api-server.ts`): a
 * segment that fails is a 404 without an API request. Each is bounded by the
 * same constant as its API input (`skillByIdInput` / `skillPlayersInput`,
 * `featuredBySlugInput`), so a segment that passes is never refused by the
 * input — a refusal comes back as an API error, which a server page answers
 * with HTTP 500 instead of the 404 an unknown slug deserves.
 */
export const isSkillSlug = (s: string): boolean => isSlugWithin(s, SKILL_SLUG_MAX_LENGTH);
export const isBundleSlug = (s: string): boolean => isSlugWithin(s, BUNDLE_SLUG_MAX_LENGTH);

/**
 * "Rarity rank #R of T skills" on a skill page (spec "Skill Leader, Rarity
 * Rank And Top Cards"): T = the listed skills — those with a group, the
 * index's Showtime and Classic tiles (67 today) — and R = 1 + the number of
 * listed skills with fewer holders, so skills with the same holder count
 * share a rank (eFootLab's rule; the reference showed no tie). Null for a
 * skill that is not listed (an entry without a group, reachable by direct
 * link only). `skills` is the `skill.list` answer.
 *
 *   Fortress 121 holders → #19 of 67; One-touch Pass and Fighting Spirit
 *   (9,125 each) → #66 of 67 both
 */
export function skillRarityRank(
  skills: ReadonlyArray<{ slug: string; group: string | null; playerCount: number }>,
  slug: string,
): { rank: number; total: number } | null {
  const listed = skills.filter((s) => s.group !== null);
  const own = listed.find((s) => s.slug === slug);
  if (!own) return null;
  const fewer = listed.filter((s) => s.playerCount < own.playerCount).length;
  return { rank: fewer + 1, total: listed.length };
}

/** True when the folded `name` has a word that starts with the folded query:
 *  the query sits at the start of the name or right after a character that
 *  is not a letter or digit ("mes" → "Lionel Messi", not "James Rodríguez"). */
export function nameHasWordStart(name: string, q: string): boolean {
  const needle = normalizeSearchQuery(q);
  if (needle.length === 0) return false;
  const hay = normalizeSearchQuery(name);
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(hay[at - 1] ?? "")) return true;
  }
  return false;
}

/**
 * The result lists' order inside one search page (reference survey
 * 2026-10-23 S3 §1.5 / §2): rows whose name has a word starting with the
 * query come first, every other row keeps the server order (a stable
 * partition — the server order is max overall DESC, card id DESC). Apply it
 * to each 12-row page on its own, never across pages.
 *
 *   "mes": 7 × Messi, James Rodríguez, 4 × Messi → 11 × Messi, James Rodríguez
 */
export function liftWordStartRows<T extends { name: string }>(rows: readonly T[], q: string): T[] {
  const lifted: T[] = [];
  const rest: T[] = [];
  for (const row of rows) (nameHasWordStart(row.name, q) ? lifted : rest).push(row);
  return [...lifted, ...rest];
}

/** The UTC calendar day of a moment as "YYYY-MM-DD" (the request day the
 *  /packs server page hands to its client, so both render the same age). */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/**
 * Age of the newest card release for the /packs "Last updated" chip
 * (reference survey 2026-10-23 S3 §3): the number of whole UTC calendar days
 * between `todayUtc` ("YYYY-MM-DD", the request's UTC day) and the UTC day of
 * `releaseIso`, written "today", "yesterday" or "N days ago". A release later
 * than today reads "today". Null when either input cannot be read. Pure — the
 * caller passes the day, so a server render and its hydration agree.
 *
 *   ("2026-10-20", "2026-10-15T00:00:00.000Z") → "5 days ago"
 */
export function releaseAgeLabel(todayUtc: string, releaseIso: string): string | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayUtc);
  const release = new Date(releaseIso);
  if (!day || Number.isNaN(release.getTime())) return null;
  const today = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  if (utcDayKey(new Date(today)) !== todayUtc) return null; // 2026-02-31 and the like
  const releaseDay = Date.UTC(release.getUTCFullYear(), release.getUTCMonth(), release.getUTCDate());
  const days = Math.round((today - releaseDay) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * Stars shown for a stored weak-foot level (usage or accuracy). The database
 * stores 0–3 — the dump's value, the reference's `wfu` / `wfa` codes and the
 * overall formula's input — and every display reads it as value + 1 of
 * `WEAK_FOOT_STARS` (1★–4★), like the /players filter. One rule for the player
 * page and compare (catalog-browsing-parity "Player Detail Accuracy"). A value
 * outside 0–3 is held to the scale; a value that is not a number gives 0.
 *
 *   0 → 1, 2 → 3, 3 → 4
 */
export function weakFootStars(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(WEAK_FOOT_STARS, Math.max(1, Math.round(level) + 1));
}
