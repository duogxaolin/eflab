// Tests for the shared helpers (feet/inch conversion, search normalisation,
// LIKE escaping). Same assert-style runner as progression.test.ts.
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/helpers.test.ts)
import {
  escapeLike,
  formatFeetInches,
  hasNonAscii,
  heightToFeetInches,
  normalizeSearchQuery,
} from "./helpers";
import { CARD_TYPES, CARD_TYPE_LABELS, CARD_TYPE_BY_EFOOTBASE_CODE, SORT_FIELDS } from "./constants";

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

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ helper tests passed");
