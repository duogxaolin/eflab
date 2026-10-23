// Small pure helpers shared by the API and the web app (eflab-parity-fixes,
// design decisions 6 and 15; multi-select-filters for the repeated-parameter
// lists). No I/O, no framework imports — tested by helpers.test.ts with the
// same assert-style runner as progression.test.ts.
import { POSITIONS, type Position } from "./constants";

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

/**
 * Search key of a label for the client-side list filters (the `/skills`
 * search, the Nation / League / Team / Skills pickers of `/players`):
 * separators read as spaces, then `normalizeSearchQuery` (accents and case
 * folded, spaces collapsed). Built the same way for the query and for each
 * label, so a substring test of the two keys matches
 *
 *   "one touch"     → "One-touch Pass"
 *   "cote"          → "Côte d'Ivoire"
 *   "sao paulo"     → "São Paulo F.C."
 *   "saint etienne" → "AS Saint-Étienne"
 */
export function labelSearchKey(s: string): string {
  return normalizeSearchQuery(s.replace(LABEL_SEPARATORS, " "));
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
