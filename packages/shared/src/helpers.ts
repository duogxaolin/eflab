// Small pure helpers shared by the API and the web app (eflab-parity-fixes,
// design decisions 6 and 15). No I/O, no framework imports — tested by
// helpers.test.ts with the same assert-style runner as progression.test.ts.

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
