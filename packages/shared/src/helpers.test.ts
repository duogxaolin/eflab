// Tests for the shared helpers (feet/inch conversion, search normalisation,
// LIKE escaping). Same assert-style runner as progression.test.ts.
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/helpers.test.ts)
import {
  escapeLike,
  formatFeetInches,
  formatRangeParam,
  hasNonAscii,
  heightToFeetInches,
  normalizeSearchQuery,
  parseRangeParam,
} from "./helpers";
import {
  CARD_TYPES,
  CARD_TYPE_LABELS,
  CARD_TYPE_BY_EFOOTBASE_CODE,
  DEFAULT_SORT_PRESET,
  PLAYING_STYLES,
  PLAYING_STYLES_UNAVAILABLE,
  PLAYING_STYLE_GROUPS,
  SORT_FIELDS,
  SORT_PRESETS,
  SORT_PRESET_LABELS,
  isSortPreset,
} from "./constants";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

// 1. heightToFeetInches — floor feet, round inches, carry a rounded 12".
{
  const cases: Array<[number, string]> = [
    [170, "5'7\""],
    [175, "5'9\""],
    [180, "5'11\""],
    [182, "6'0\""], // 71.65 in → 11.65 in rounds to 12 → carries (never prints 5'12")
    [183, "6'0\""],
    [185, "6'1\""],
    [160, "5'3\""],
    [200, "6'7\""],
  ];
  for (const [cm, expected] of cases) {
    assert(formatFeetInches(cm) === expected, `${cm} cm → ${expected} (got ${formatFeetInches(cm)})`);
  }
  const r = heightToFeetInches(182);
  assert(r.inches >= 0 && r.inches < 12, "inches are always within 0..11 after carry");
  assert(formatFeetInches(0) === "0'0\"" && formatFeetInches(Number.NaN) === "0'0\"", "non-positive / NaN height → 0'0\"");
}

// 2. normalizeSearchQuery — NFD + strip combining marks + lower-case + collapse spaces.
{
  assert(normalizeSearchQuery("Mbappé") === "mbappe", "Mbappé → mbappe");
  assert(normalizeSearchQuery("  Fabian   Schär ") === "fabian schar", "Schär with extra spaces → fabian schar");
  assert(normalizeSearchQuery("Müller-Ødegaard") === "muller-ødegaard", "ü stripped, ø kept (no combining mark)");
  assert(normalizeSearchQuery("CRISTIANO RONALDO") === "cristiano ronaldo", "upper-case → lower-case");
  assert(normalizeSearchQuery("三笘 薫") === "三笘 薫", "CJK is left unchanged");
  assert(normalizeSearchQuery("") === "", "empty stays empty");
  assert(!hasNonAscii("mbappe") && hasNonAscii("三笘") && hasNonAscii("é"), "hasNonAscii detects non-ASCII only");
}

// 3. escapeLike — %, _ and \ become literal under ESCAPE '\'.
{
  assert(escapeLike("50%") === "50\\%", "% is escaped");
  assert(escapeLike("a_b") === "a\\_b", "_ is escaped");
  assert(escapeLike("C:\\x") === "C:\\\\x", "backslash is escaped");
  assert(escapeLike("%_\\") === "\\%\\_\\\\", "all three together");
  assert(escapeLike("ronaldo") === "ronaldo", "plain text untouched");
}

// 4. Card-type tables stay in sync (one label per enum value, one enum value per dump code).
{
  for (const t of CARD_TYPES) {
    assert(typeof CARD_TYPE_LABELS[t] === "string" && CARD_TYPE_LABELS[t].length > 0, `CARD_TYPE_LABELS has a label for ${t}`);
    assert(!/^[A-Z_]+$/.test(CARD_TYPE_LABELS[t]), `label for ${t} is not a raw enum name`);
  }
  const mapped = new Set(Object.values(CARD_TYPE_BY_EFOOTBASE_CODE));
  for (const t of CARD_TYPES) assert(mapped.has(t), `dump code map covers ${t}`);
  assert(!("BIG_TIME" in CARD_TYPE_LABELS) && !("SHOW_TIME" in CARD_TYPE_LABELS), "removed enum values are gone from the label table");
}

// 5. SORT_FIELDS only contains sorts backed by a real Player column.
{
  const offered: readonly string[] = SORT_FIELDS;
  const removed = ["squadNumber", "nationalShirtNumber", "sumOfAbilities", "averageAbility", "legCoverage", "armCoverage", "peakJumpHeight", "torsoCollisionWidth", "club"];
  for (const s of removed) assert(!offered.includes(s), `SORT_FIELDS no longer offers ${s}`);
  for (const s of ["maxOvr", "ovr", "releaseDate", "age", "height", "speed", "stamina", "playerValue", "ratingCf"]) {
    assert(offered.includes(s), `SORT_FIELDS still offers ${s}`);
  }
}

// 6. parseRangeParam / formatRangeParam — efootbase `min-max` URL syntax.
{
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  assert(eq(parseRangeParam("90-", 0, 100), { min: 90 }), "'90-' → {min:90}");
  assert(eq(parseRangeParam("-85", 0, 100), { max: 85 }), "'-85' → {max:85}");
  assert(eq(parseRangeParam("80-90", 0, 100), { min: 80, max: 90 }), "'80-90' → {min:80,max:90}");
  assert(eq(parseRangeParam("90", 0, 100), { min: 90 }), "bare '90' is a minimum");
  assert(parseRangeParam("95-90", 0, 100) === null, "inverted range is dropped");
  assert(eq(parseRangeParam("150-", 0, 100), null), "edge above the bound is dropped");
  assert(eq(parseRangeParam("150-99", 0, 100), { max: 99 }), "only the out-of-bound edge is dropped");
  assert(parseRangeParam("abc", 0, 100) === null && parseRangeParam("", 0, 100) === null && parseRangeParam(null, 0, 100) === null, "garbage / empty / missing → null");
  assert(formatRangeParam({ min: 90 }) === "90-" && formatRangeParam({ max: 85 }) === "-85" && formatRangeParam({ min: 80, max: 90 }) === "80-90", "formatRangeParam writes min-max");
  assert(formatRangeParam({}) === null && formatRangeParam(null) === null, "empty range → no parameter");
  for (const v of ["90-", "-85", "80-90"]) assert(formatRangeParam(parseRangeParam(v, 0, 100)) === v, `round-trip ${v}`);
}

// 7. Sort presets and playing-style groups stay consistent with the tables.
{
  for (const p of SORT_PRESETS) assert(typeof SORT_PRESET_LABELS[p] === "string", `SORT_PRESET_LABELS has ${p}`);
  assert(DEFAULT_SORT_PRESET === "trending" && isSortPreset("top") && !isSortPreset("ovr"), "default preset is Trending; presets are distinct from field sorts");
  for (const s of SORT_PRESETS) assert(!(SORT_FIELDS as readonly string[]).includes(s), `preset ${s} does not collide with a field sort`);
  for (const group of ["attack", "defence"] as const) {
    for (const id of PLAYING_STYLE_GROUPS[group]) assert(typeof PLAYING_STYLES[id] === "string", `${group} style ${id} has a label`);
    for (const name of PLAYING_STYLES_UNAVAILABLE[group]) {
      assert(!Object.values(PLAYING_STYLES).includes(name), `unavailable style "${name}" has no invented id`);
    }
  }
  assert(PLAYING_STYLE_GROUPS.attack.length === 20 && PLAYING_STYLE_GROUPS.defence.length === 13, "20 attack + 13 defence styles are available in the data");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ helper tests passed");
