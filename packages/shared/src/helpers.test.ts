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
  parseIntListParams,
  parsePositionParams,
  parseRangeParam,
  sortIds,
  sortPositions,
} from "./helpers";
import {
  CARD_TYPES,
  CARD_TYPE_LABELS,
  CARD_TYPE_BY_EFOOTBASE_CODE,
  DEFAULT_SORT_PRESET,
  MAX_FILTER_IDS,
  PLAYING_STYLES,
  PLAYING_STYLES_UNAVAILABLE,
  PLAYING_STYLE_GROUPS,
  POSITIONS,
  SORT_FIELDS,
  SORT_PRESETS,
  SORT_PRESET_LABELS,
  isSortPreset,
} from "./constants";
import { playerListInput } from "./schemas";

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

// 8. Repeated-parameter lists of the multi-valued filters (multi-select-filters):
//    canonical order, de-duplication, invalid members dropped, legacy single
//    values read, round-trip is a fixed point.
{
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const INT4_MAX = 2_147_483_647;
  // positions: names, efootbase indexes, case, duplicates, garbage → catalogue order
  assert(eq(parsePositionParams(["12", "11"]), ["SS", "CF"]), "pos=12&pos=11 → SS, CF (catalogue order, index form read)");
  assert(eq(parsePositionParams(["CF", "SS"]), ["SS", "CF"]), "pos=CF&pos=SS → SS, CF (names, re-ordered)");
  assert(eq(parsePositionParams(["cf", "CF", "GK", "gk"]), ["GK", "CF"]), "case-insensitive names, duplicates collapsed");
  assert(eq(parsePositionParams(["CF,SS", "13", "-1", "ST", ""]), ["SS", "CF"]), "comma list read; 13 / -1 / ST / empty dropped");
  assert(eq(parsePositionParams(["CF"]), ["CF"]), "legacy single value pos=CF is a one-item list");
  assert(eq(parsePositionParams([]), []), "no pos → empty list");
  assert(eq(parsePositionParams([...POSITIONS].reverse()), [...POSITIONS]), "all 13 positions come back in catalogue order");
  assert(eq(sortPositions(["CF", "GK", "CF"]), ["GK", "CF"]), "sortPositions = catalogue order without duplicates");

  // ids: ascending, de-duplicated, bounded, limited
  assert(eq(parseIntListParams(["14", "3", "14"], 1, INT4_MAX, MAX_FILTER_IDS), [3, 14]), "nat=14&nat=3&nat=14 → [3, 14]");
  assert(eq(parseIntListParams(["3,14", "x", "-1", "0", "1.5", " 7 "], 1, INT4_MAX, MAX_FILTER_IDS), [3, 7, 14]), "comma list read; garbage, negative, below-min and fractional dropped");
  assert(eq(parseIntListParams(["2147483648", "2147483647"], 0, INT4_MAX, MAX_FILTER_IDS), [2147483647]), "an id above int4 is dropped, the maximum kept");
  assert(eq(parseIntListParams(["99999999999999999999"], 0, INT4_MAX, MAX_FILTER_IDS), []), "a 20-digit id is dropped");
  assert(eq(parseIntListParams(["14"], 1, INT4_MAX, MAX_FILTER_IDS), [14]), "legacy single value nat=14 is a one-item list");
  const many = Array.from({ length: 60 }, (_, i) => String(60 - i));
  const limited = parseIntListParams(many, 1, INT4_MAX, MAX_FILTER_IDS);
  assert(limited.length === MAX_FILTER_IDS && limited[0] === 1 && limited[MAX_FILTER_IDS - 1] === MAX_FILTER_IDS, `60 ids are cut to the ${MAX_FILTER_IDS} smallest, ascending`);
  assert(eq(sortIds([14, 3, 14]), [3, 14]), "sortIds = ascending without duplicates");

  // round-trip: writing the parsed list (repeated form, canonical order) and
  // parsing it again changes nothing — the URL helper of the web relies on it.
  const write = (xs: readonly (string | number)[]) => xs.map(String);
  for (const input of [["12", "11"], ["CF", "SS", "GK"], ["cf"], ["LWF,RWF", "9"]]) {
    const once = parsePositionParams(input);
    assert(eq(parsePositionParams(write(once)), once), `positions round-trip is a fixed point for ${JSON.stringify(input)}`);
  }
  for (const input of [["14", "3"], ["3,14"], ["7"], ["20", "20", "1"]]) {
    const once = parseIntListParams(input, 1, INT4_MAX, MAX_FILTER_IDS);
    assert(eq(parseIntListParams(write(once), 1, INT4_MAX, MAX_FILTER_IDS), once), `id round-trip is a fixed point for ${JSON.stringify(input)}`);
  }

  // the API input bounds the lists the same way (400 from Zod, never a 500)
  const ok = (v: unknown) => playerListInput.safeParse(v).success;
  assert(ok({ positions: ["CF", "SS"], nationalityIds: [1, 14], leagueIds: [4, 12], clubIds: [2, 4] }), "list fields parse");
  assert(ok({ positions: [...POSITIONS], clubIds: Array.from({ length: MAX_FILTER_IDS }, (_, i) => i + 1) }), `13 positions and ${MAX_FILTER_IDS} ids are accepted`);
  assert(!ok({ positions: [...POSITIONS, "CF"] }), "14 positions are rejected");
  assert(!ok({ positions: ["ST"] }), "an unknown position is rejected");
  assert(!ok({ clubIds: Array.from({ length: MAX_FILTER_IDS + 1 }, (_, i) => i + 1) }), `${MAX_FILTER_IDS + 1} ids are rejected`);
  assert(!ok({ nationalityIds: [INT4_MAX + 1] }) && !ok({ leagueIds: [-1] }) && !ok({ clubIds: [1.5] }), "ids outside int4 / negative / fractional are rejected");
  assert(ok({ position: "CF", nationalityId: 14, leagueId: 4, clubId: 2 }), "the single-value fields still parse");
  // an id must be a number or a digit string — nothing that `Number()` would
  // quietly turn into 0 (null, booleans, "", arrays) may become a filter on id 0
  assert(!ok({ nationalityIds: [null] }) && !ok({ clubIds: [true] }) && !ok({ leagueIds: [""] }) && !ok({ leagueIds: [[]] }) && !ok({ clubId: null }), "null / boolean / empty-string / array ids are rejected, not coerced to 0");
  assert(!ok({ nationalityIds: ["1e3"] }) && !ok({ clubIds: [" 7"] }) && !ok({ leagueIds: ["0x10"] }), "non-decimal strings are rejected");
  assert(ok({ nationalityIds: ["14", 3], clubId: "2", playingStyle: "12" }), "digit strings are still read as ids (older callers)");
  {
    const parsed = playerListInput.safeParse({ nationalityIds: ["14", 3], clubId: "2" });
    assert(parsed.success && eq(parsed.data.nationalityIds ?? [], [14, 3]) && parsed.data.clubId === 2, "digit strings come out as numbers");
  }
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ helper tests passed");
