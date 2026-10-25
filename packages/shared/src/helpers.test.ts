// Tests for the shared helpers (feet/inch conversion, search normalisation,
// LIKE escaping). Same assert-style runner as progression.test.ts.
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/helpers.test.ts)
import {
  escapeLike,
  formatFeetInches,
  formatRangeParam,
  hasNonAscii,
  heightToFeetInches,
  isBundleSlug,
  isSkillSlug,
  labelSearchKey,
  liftWordStartRows,
  nameHasWordStart,
  normalizeSearchQuery,
  parseIntListParams,
  parsePositionParams,
  parseRangeParam,
  releaseAgeLabel,
  secondBoosterSlug,
  skillKeyFromPublicSlug,
  skillPublicSlug,
  skillRarityRank,
  sortIds,
  sortPositions,
  utcDayKey,
  weakFootStars,
} from "./helpers";
import {
  BASE_STATS,
  BUNDLE_SLUG_MAX_LENGTH,
  CARD_TYPES,
  CARD_TYPE_DUMP_LABELS,
  CARD_TYPE_FILTER_ORDER,
  CARD_TYPE_LABELS,
  EFOOTBASE_STAT_MAP,
  CARD_TYPE_BY_EFOOTBASE_CODE,
  DEFAULT_SORT_PRESET,
  FIXED_FIRST_NATIONS,
  FORM_STARS,
  MAX_FILTER_IDS,
  MAX_FILTER_SKILLS,
  SEARCH_MIN_LENGTH,
  SKILL_SLUG_MAX_LENGTH,
  resolveLegacySort,
  PLAYING_STYLES,
  PLAYING_STYLES_UNAVAILABLE,
  PLAYING_STYLE_GROUPS,
  POSITIONS,
  SORT_FIELDS,
  SORT_PRESETS,
  SORT_PRESET_LABELS,
  WEAK_FOOT_STARS,
  isSortPreset,
  playingStyleName,
} from "./constants";
import { featuredBySlugInput, playerListInput, playerSearchInput, skillByIdInput, skillPlayersInput } from "./schemas";

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

// 2b. labelSearchKey — the picker / skills list search (QA 2026-10-23 bug 3:
// the /players pickers only lower-cased, so "cote" missed "Côte d'Ivoire").
{
  const matches = (query: string, label: string) => labelSearchKey(label).includes(labelSearchKey(query));
  // The old picker rule (lower-case substring) misses all four; the shared key finds them.
  const lowerCaseOnly = (query: string, label: string) => label.toLowerCase().includes(query.trim().toLowerCase());
  const cases: Array<[string, string]> = [
    ["cote", "Côte d'Ivoire"],
    ["sao paulo", "São Paulo F.C."],
    ["saint etienne", "AS Saint-Étienne"],
    ["one touch", "One-touch Pass"],
  ];
  for (const [q, label] of cases) {
    assert(matches(q, label), `labelSearchKey: "${q}" finds "${label}"`);
    assert(!lowerCaseOnly(q, label), `the lower-case-only rule misses "${q}" → "${label}" (regression guard)`);
  }
  assert(matches("ONE–TOUCH", "One-touch Pass"), "en dash and capitals in the query");
  assert(matches("one_touch", "One-touch Pass") && matches("one/touch", "One-touch Pass"), "underscore and slash read as spaces");
  assert(matches("  saint   étienne ", "AS Saint-Étienne"), "extra spaces and accents in the query");
  assert(!matches("cotes", "Côte d'Ivoire"), "still a substring test, not fuzzy");
  assert(labelSearchKey("Côte d'Ivoire") === "cote d'ivoire", "apostrophes are kept");
  assert(labelSearchKey("") === "", "empty stays empty");
  // Typographic apostrophes read as ' (verify S1 of change efootbase-function-parity:
  // "Striker’s" typed on a phone missed Striker's Instinct in the second-booster drawer).
  for (const typed of ["striker’s", "striker‘s", "strikerʼs", "STRIKER’S INST"]) {
    assert(matches(typed, "Striker's Instinct +1"), `labelSearchKey: "${typed}" finds "Striker's Instinct +1"`);
  }
  assert(matches("cote d'ivoire", "Côte d’Ivoire"), "a typographic apostrophe in the label matches the ASCII one in the query");
  assert(labelSearchKey("Striker’s Instinct +1") === "striker's instinct +1", "’ → ' in the key");
  assert(!matches("strikers", "Striker's Instinct +1"), "the apostrophe is folded, not dropped");
  // The player search keeps its exact rule: normalizeSearchQuery does not fold
  // apostrophes (the API compares it with the stored nameNormalized and with the
  // pack names, and a non-ASCII query also searches the CJK names).
  assert(normalizeSearchQuery("N’Golo") === "n’golo", "normalizeSearchQuery keeps ’ (player search unchanged)");
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
  // Display table vs dump table (D14, owner decision 2026-10-24): they differ for
  // LEGENDARY ("Icons") and EPIC ("Epic - Big Time") only; the dump table holds
  // exactly the dump's players_meta labels the seed checks against.
  const differ = CARD_TYPES.filter((t) => CARD_TYPE_LABELS[t] !== CARD_TYPE_DUMP_LABELS[t]);
  assert(differ.join(",") === "LEGENDARY,EPIC", `the display and dump tables differ only for LEGENDARY and EPIC (got ${differ.join(",")})`);
  assert(CARD_TYPE_LABELS.LEGENDARY === "Icons" && CARD_TYPE_LABELS.EPIC === "Epic - Big Time", "display labels: LEGENDARY → Icons, EPIC → Epic - Big Time");
  assert(
    CARD_TYPES.map((t) => CARD_TYPE_DUMP_LABELS[t]).join("|") === "Standard|Legendary|Trending|Selection|Epic|Highlight|Strike Arena",
    "dump labels: Standard, Legendary, Trending, Selection, Epic, Highlight, Strike Arena",
  );
  assert(Object.keys(CARD_TYPE_DUMP_LABELS).length === CARD_TYPES.length && Object.keys(CARD_TYPE_LABELS).length === CARD_TYPES.length, "both tables have exactly one label per card type");
  // Filter toggle order: a permutation of CARD_TYPES in efootbase's order, Strike Arena last.
  assert(CARD_TYPE_FILTER_ORDER.length === CARD_TYPES.length && new Set(CARD_TYPE_FILTER_ORDER).size === CARD_TYPES.length && CARD_TYPES.every((t) => CARD_TYPE_FILTER_ORDER.includes(t)), "CARD_TYPE_FILTER_ORDER lists every card type once");
  assert(
    CARD_TYPE_FILTER_ORDER.map((t) => CARD_TYPE_LABELS[t]).join("|") === "Standard|Selection|Icons|Trending|Highlight|Epic - Big Time|Strike Arena",
    "toggle order: Standard, Selection, Icons, Trending, Highlight, Epic - Big Time, Strike Arena",
  );
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
  assert(
    JSON.stringify(SORT_PRESETS) === JSON.stringify(["new", "highest", "lowest", "top"]) && DEFAULT_SORT_PRESET === "new",
    "presets are New cards (default), High to low, Low to high, Top rated (measured 2026-10-24, TOP_RATED)",
  );
  assert(
    SORT_PRESET_LABELS.new === "New cards" && SORT_PRESET_LABELS.highest === "High to low" && SORT_PRESET_LABELS.lowest === "Low to high" && SORT_PRESET_LABELS.top === "Top rated",
    "preset labels",
  );
  assert(!isSortPreset("trending") && isSortPreset("top") && !isSortPreset("ovr"), "Trending is no longer a preset, Top rated is one; presets are distinct from field sorts");
  // Legacy values (change efootbase-function-parity): accepted, read as the current presets.
  // `top` is Top rated itself since task 6.3 of efootbase-data-refresh-1024 (no longer High to low).
  assert(resolveLegacySort("trending") === "new" && resolveLegacySort("top") === "top" && resolveLegacySort("speed") === "speed", "resolveLegacySort: trending → new, top stays Top rated, others unchanged");
  {
    const sortOf = (v: unknown) => {
      const r = playerListInput.safeParse({ sort: v });
      return r.success ? r.data.sort : "400";
    };
    assert(sortOf("trending") === "new" && sortOf("top") === "top", "player.list sort=trending is read as new, sort=top is Top rated (no 400)");
    assert(sortOf("highest") === "highest" && sortOf("lowest") === "lowest" && sortOf("name") === "name" && sortOf(undefined) === "ovr", "other sorts unchanged; the API default stays ovr");
    assert(sortOf("bogus") === "400" && sortOf("hasOwnProperty") === "400" && sortOf("toString") === "400", "an unknown sort is a 400 (no prototype key slips through)");
  }
  for (const s of SORT_PRESETS) assert(!(SORT_FIELDS as readonly string[]).includes(s), `preset ${s} does not collide with a field sort`);
  for (const group of ["attack", "defence"] as const) {
    for (const id of PLAYING_STYLE_GROUPS[group]) assert(typeof PLAYING_STYLES[id] === "string", `${group} style ${id} has a label`);
    for (const name of PLAYING_STYLES_UNAVAILABLE[group]) {
      assert(!Object.values(PLAYING_STYLES).includes(name), `unavailable style "${name}" has no invented id`);
    }
  }
  assert(PLAYING_STYLE_GROUPS.attack.length === 21 && PLAYING_STYLE_GROUPS.defence.length === 16, "21 attack + 16 defence styles are available in the data");
  // The four styles of the 2026-10 re-dump (efootbase English UI strings).
  const added: Array<[number, string, "attack" | "defence"]> = [
    [23, "Press Back", "defence"],
    [31, "Tough Marker", "defence"],
    [32, "Deep Defender", "defence"],
    [34, "Build-up GK", "attack"],
  ];
  for (const [id, name, group] of added) {
    assert(playingStyleName(id) === name, `playingStyleName(${id}) → ${name} (got ${playingStyleName(id)})`);
    assert(PLAYING_STYLE_GROUPS[group].includes(id), `style ${id} (${name}) is offered under ${group}`);
  }
  assert(
    Array.from({ length: 36 }, (_, id) => id).every((id) => typeof PLAYING_STYLES[id] === "string" && PLAYING_STYLES[id]!.length > 0),
    "every playing-style id 0–35 has a label",
  );
  const names = Object.values(PLAYING_STYLES);
  assert(new Set(names).size === names.length && names.length === 36, "36 distinct playing-style names");
  assert(playingStyleName(0) === "Basic" && playingStyleName(null) === "Basic" && playingStyleName(99) === "Basic", "0 / null / unknown id → Basic");
  assert(PLAYING_STYLES_UNAVAILABLE.attack.length === 0 && PLAYING_STYLES_UNAVAILABLE.defence.length === 0, "no efootbase style is left without an id");
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

// EFOOTBASE_STAT_MAP (efootbase-static-data): the one table the seeder uses for
// skill effects (camelCase) and manager pills (snake_case).
{
  const statSet = new Set<string>(BASE_STATS);
  const targets = Object.values(EFOOTBASE_STAT_MAP);
  assert(targets.every((t) => statSet.has(t)), "every EFOOTBASE_STAT_MAP target is a BaseStat");
  assert(BASE_STATS.every((s) => targets.includes(s)), "every BaseStat is reachable from an efootbase key");
  const snake = Object.keys(EFOOTBASE_STAT_MAP).filter((k) => /^[a-z]+(_[a-z]+)*$/.test(k) && (k.includes("_") || !/[A-Z]/.test(k)));
  assert(new Set(snake.map((k) => EFOOTBASE_STAT_MAP[k])).size === BASE_STATS.length, "the snake_case keys cover all 26 stats once");
  for (const [k, v] of [
    ["tackling", "ballWinning"], ["jumping", "jump"], ["set_piece_taking", "placeKicking"],
    ["setPieceTaking", "placeKicking"], ["gk_parrying", "gkParrying"], ["gkParrying", "gkParrying"],
    ["lofted_pass", "loftedPass"], ["tightPossession", "tightPossession"], ["defensive_engagement", "defensiveEngagement"],
  ] as const) {
    assert(EFOOTBASE_STAT_MAP[k] === v, `efootbase "${k}" → ${v}`);
  }
  for (const unknown of ["Tackling", "set-piece-taking", "weak_foot_accuracy", "stamina_", "defensiveIQ"]) {
    assert(EFOOTBASE_STAT_MAP[unknown] === undefined, `"${unknown}" is not mapped (the seed aborts on it)`);
  }
  // Super-sub's 25 camelCase effect keys (efootbase capture 2026-10-18) map to
  // 25 distinct stats — every stat except Stamina.
  const superSub = ["offensiveAwareness", "ballControl", "dribbling", "tightPossession", "lowPass", "loftedPass",
    "finishing", "heading", "setPieceTaking", "curl", "defensiveAwareness", "tackling", "aggression",
    "defensiveEngagement", "speed", "acceleration", "kickingPower", "jumping", "physicalContact", "balance",
    "gkAwareness", "gkCatching", "gkParrying", "gkReflexes", "gkReach"];
  const mapped = new Set(superSub.map((k) => EFOOTBASE_STAT_MAP[k]));
  assert(!mapped.has(undefined) && mapped.size === 25 && !mapped.has("stamina"), "Super-sub's 25 effect keys → 25 stats, all but Stamina");
}

// 9. change efootbase-function-parity — search input, slugs, word-start lift,
//    the fixed first nations.
{
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  // player.search: 3..100 characters after trimming, page 1..50, no limit.
  const search = (v: unknown) => playerSearchInput.safeParse(v);
  assert(SEARCH_MIN_LENGTH === 3, "the shared search minimum is 3 characters");
  assert(!search({ q: "me" }).success && !search({ q: "  me  " }).success && !search({ q: "" }).success, "a 2-character (or blank-padded) term is rejected (400)");
  {
    const r = search({ q: " mes " });
    assert(r.success && r.data.q === "mes" && r.data.page === 1, "a 3-character term is accepted (trimmed), page defaults to 1");
  }
  assert(search({ q: "x".repeat(100), page: 50 }).success && !search({ q: "x".repeat(101) }).success && !search({ q: "mes", page: 51 }).success && !search({ q: "mes", page: 0 }).success, "100 characters and page 50 accepted; 101 characters, page 51 and page 0 rejected");
  {
    const r = search({ q: "messi", limit: 8 });
    assert(r.success && !("limit" in r.data), "an older client's limit is accepted and dropped");
  }
  // skill.players: page / limit accepted and ignored.
  assert(skillPlayersInput.safeParse({ slug: "fortress" }).success && skillPlayersInput.safeParse({ slug: "fortress", page: 3, limit: 24 }).success, "skill.players accepts the old page / limit");
  // New list inputs and their bounds.
  const list = (v: unknown) => playerListInput.safeParse(v).success;
  assert(list({ playingStyles: [1, 22, 24], teamNames: ["Arsenal FC", "Vissel Kobe"], skillKeys: ["s_rabona", "s_sombrero"] }), "playingStyles / teamNames / skillKeys parse");
  assert(!list({ playingStyles: Array.from({ length: MAX_FILTER_IDS + 1 }, (_, i) => i) }) && !list({ playingStyles: [-1] }) && !list({ playingStyles: [null] }), `more than ${MAX_FILTER_IDS} styles / a negative / a null style are rejected`);
  assert(!list({ teamNames: [""] }) && !list({ teamNames: ["x".repeat(101)] }) && list({ teamNames: ["x".repeat(100)] }) && !list({ teamNames: Array.from({ length: MAX_FILTER_IDS + 1 }, (_, i) => `T${i}`) }), "team names: 1–100 characters, at most 50");
  assert(!list({ skillKeys: ["rabona"] }) && !list({ skillKeys: ["s_Rabona"] }) && !list({ skillKeys: ["s_"] }) && !list({ skillKeys: Array.from({ length: MAX_FILTER_SKILLS + 1 }, (_, i) => `s_k${i}`) }), "skill keys: ^s_[a-z0-9_]+$, at most 20");

  // secondBoosterSlug — the reference's one observed slug, and the rule.
  assert(secondBoosterSlug("Striker's Instinct +1") === "strikers-instinct1", "Striker's Instinct +1 → strikers-instinct1");
  assert(secondBoosterSlug("Ball-carrying +1") === "ball-carrying1" && secondBoosterSlug("Free-kick Taking +1") === "free-kick-taking1", "hyphens kept as single hyphens");
  assert(secondBoosterSlug("Off the Ball +1") === "off-the-ball1" && secondBoosterSlug("Aerial Block +1") === "aerial-block1", "spaces → hyphens");
  assert(secondBoosterSlug("Striker’s Instinct +1") === "strikers-instinct1", "a typographic apostrophe is removed too");

  // skillPublicSlug — key without s_, _ → -; the stored slug without a key.
  const pub = (slug: string, efbKey: string | null) => skillPublicSlug({ slug, efbKey });
  assert(pub("phenomenal-passing", "s_phenomenal_pass") === "phenomenal-pass" && pub("s-heading", "s_heading") === "heading", "phenomenal-pass, heading (the stored slugs differ)");
  assert(pub("rising-shots", "s_rising_shot") === "rising-shot" && pub("acrobatic-clear", "s_acrobatic_clearance") === "acrobatic-clearance", "rising-shot, acrobatic-clearance");
  assert(pub("long-reach-tackle", "s_long_reach_tackle") === "long-reach-tackle" && pub("fortress", "s_fortress") === "fortress", "usual keys give the stored slug");
  assert(pub("some-other-entry", null) === "some-other-entry", "no key → the stored slug");
  assert(skillKeyFromPublicSlug("phenomenal-pass") === "s_phenomenal_pass" && skillKeyFromPublicSlug("Bad Slug") === null && skillKeyFromPublicSlug("a--b") === null, "public slug → key (or null)");
  for (const key of ["s_fortress", "s_phenomenal_pass", "s_one_touch_pass", "s_gk_long_throw"]) {
    assert(skillKeyFromPublicSlug(pub("x", key)) === key, `key round trip ${key}`);
  }

  // liftWordStartRows — stable partition by "a word starts with the query".
  {
    const m = (i: number) => ({ name: "Lionel Messi", id: `m${i}` });
    const james = { name: "James Rodríguez", id: "jr" };
    const page = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), james, m(8), m(9), m(10), m(11)];
    const lifted = liftWordStartRows(page, "mes");
    assert(lifted.length === 12 && lifted[11] === james, "\"mes\": James Rodríguez (8th in the server order) moves to the end of the page (12th)");
    assert(eq(lifted.slice(0, 11).map((r) => r.id), Array.from({ length: 11 }, (_, i) => `m${i + 1}`)), "the eleven Messi rows keep their server order");
    const same = [m(1), m(2)];
    assert(eq(liftWordStartRows(same, "messi"), same), "every row matching at a word start → order unchanged");
    const reece = { name: "Reece James", id: "rj" };
    const kroos = { name: "Toni Kroos", id: "tk" };
    assert(eq(liftWordStartRows([kroos, reece, m(1)], "mes").map((r) => r.id), ["m1", "tk", "rj"]), "only word-start rows are lifted; the others keep their order");
  }
  assert(nameHasWordStart("Lionel Messi", "MES") && nameHasWordStart("Mesut Özil", "mes") && !nameHasWordStart("James Rodríguez", "mes"), "word start is case-insensitive; inside a word does not count");
  assert(nameHasWordStart("N'Golo Kanté", "golo") && nameHasWordStart("Jean-Pierre Papin", "pierre") && nameHasWordStart("Thomas Müller", "mull"), "after an apostrophe / hyphen; accents folded");
  assert(nameHasWordStart("Lionel Messi", "lionel mes") && !nameHasWordStart("Lionel Messi", "messi lionel"), "a multi-word query is matched as one contiguous run");
  assert(!nameHasWordStart("Messi", "") && !nameHasWordStart("Messi", "   "), "an empty query lifts nothing");

  // FIXED_FIRST_NATIONS — the reference's ten, in its order.
  assert(
    eq(FIXED_FIRST_NATIONS, ["England", "France", "Spain", "Brazil", "Argentina", "Germany", "Italy", "Netherlands", "Portugal", "Belgium"]),
    "FIXED_FIRST_NATIONS: England, France, Spain, Brazil, Argentina, Germany, Italy, Netherlands, Portugal, Belgium",
  );
}

// /packs "Last updated" (efootbase-function-parity "Packs Order And Last
// Updated"): whole UTC days between the request's UTC day and the newest card
// release, with a fixed "today" — the same text on the server and the client.
{
  assert(releaseAgeLabel("2026-10-20", "2026-10-15T00:00:00.000Z") === "5 days ago", "today 2026-10-20, newest release 2026-10-15 → \"5 days ago\" (the spec scenario)");
  assert(releaseAgeLabel("2026-10-15", "2026-10-15T00:00:00.000Z") === "today", "same UTC day → \"today\"");
  assert(releaseAgeLabel("2026-10-23", "2026-10-22T23:30:00.000Z") === "yesterday", "a 23:30Z release one UTC day earlier → \"yesterday\" (whole calendar days, not 24-hour periods)");
  assert(releaseAgeLabel("2026-10-23", "2026-10-22T00:00:00.000Z") === "yesterday", "one day → \"yesterday\"");
  assert(releaseAgeLabel("2026-10-23", "2026-10-21T00:00:00.000Z") === "2 days ago", "two days → \"2 days ago\"");
  assert(releaseAgeLabel("2026-10-20", "2026-10-25T00:00:00.000Z") === "today", "a release after today is clamped to \"today\"");
  assert(releaseAgeLabel("2026-03-01", "2026-02-28T12:00:00.000Z") === "yesterday" && releaseAgeLabel("2027-01-01", "2026-12-31T00:00:00.000Z") === "yesterday", "month and year boundaries");
  assert(releaseAgeLabel("2026-10-20", "not a date") === null && releaseAgeLabel("20 Oct 2026", "2026-10-15T00:00:00.000Z") === null && releaseAgeLabel("2026-02-31", "2026-02-01T00:00:00.000Z") === null, "unreadable input → null (no chip)");
  assert(utcDayKey(new Date("2026-10-23T23:59:59.999Z")) === "2026-10-23" && utcDayKey(new Date("2026-10-24T00:00:00.000Z")) === "2026-10-24", "utcDayKey = the UTC calendar day");
}

// Weak-foot stars (task 12.1): the stored 0-based level + 1 of 4 — one rule
// for the player page and compare. Ricardo Quaresma stores usage 0 and
// accuracy 2 → 1★ and 3★.
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
{
  assert(WEAK_FOOT_STARS === 4 && FORM_STARS === 3, "weak foot is out of 4 stars, form out of 3");
  assert(eq([0, 1, 2, 3].map(weakFootStars), [1, 2, 3, 4]), "stored 0 / 1 / 2 / 3 → 1★ / 2★ / 3★ / 4★");
  assert(weakFootStars(0) === 1 && weakFootStars(2) === 3, "Quaresma: usage 0 → 1★, accuracy 2 → 3★");
  assert(weakFootStars(-1) === 1 && weakFootStars(7) === 4 && weakFootStars(Number.NaN) === 0, "out of range held to 1–4; not a number → 0");
}

// Rarity rank (spec "Skill Leader, Rarity Rank And Top Cards"): over the
// listed (grouped) skills, 1 + the number with fewer holders; ties share.
{
  const skills = [
    { slug: "fortress", group: "showtime", playerCount: 121 },
    { slug: "long-reach-tackle", group: "showtime", playerCount: 118 },
    { slug: "one-touch-pass", group: "classic", playerCount: 9125 },
    { slug: "fighting-spirit", group: "classic", playerCount: 9125 },
    { slug: "rare", group: "showtime", playerCount: 2 },
    { slug: "acceleration-burst", group: "showtime", playerCount: 97 },
    { slug: "blitz-curler", group: "showtime", playerCount: 97 },
    { slug: "other-entry", group: null, playerCount: 0 },
  ];
  const r = (slug: string) => skillRarityRank(skills, slug);
  assert(eq(r("rare"), { rank: 1, total: 7 }), "the fewest holders → #1; T counts the listed (grouped) skills only");
  assert(eq(r("fortress"), { rank: 5, total: 7 }) && eq(r("long-reach-tackle"), { rank: 4, total: 7 }), "rank = 1 + listed skills with fewer holders (an ungrouped entry with 0 holders does not count)");
  assert(eq(r("one-touch-pass"), r("fighting-spirit")) && r("one-touch-pass")?.rank === 6, "One-touch Pass and Fighting Spirit (9,125 each) share #6");
  assert(eq(r("acceleration-burst"), r("blitz-curler")) && r("acceleration-burst")?.rank === 2, "a tie lower down shares its rank too, and the next count starts after both (Long Reach Tackle #4)");
  assert(r("other-entry") === null && r("unknown") === null, "an entry without a group (or an unknown slug) has no rank");
}

// Slug pre-checks of the web pages against the API inputs (task 13.1): the
// pre-check and its input share one bound, so a well-formed slug passes both
// or neither — a long slug is a 404 on the page (no request), never an API
// 400 that the server page turns into a 500.
{
  assert(SKILL_SLUG_MAX_LENGTH === 120 && BUNDLE_SLUG_MAX_LENGTH === 200, "skill slugs are bounded at 120 characters, bundle slugs at 200");
  const skillIn = (slug: string) => skillByIdInput.safeParse({ slug }).success && skillPlayersInput.safeParse({ slug }).success;
  const bundleIn = (slug: string) => featuredBySlugInput.safeParse({ slug }).success;
  const lengths = [1, 2, 119, 120, 121, 150, 199, 200, 201, 500];
  const shapes = (n: number) => ["a".repeat(n), ("a" + "-b".repeat(n)).slice(0, n), "9".repeat(n), "A".repeat(n)];
  let total = 0;
  let skillAgree = 0;
  let bundleAgree = 0;
  for (const n of lengths) {
    for (const s of shapes(n)) {
      total++;
      if (isSkillSlug(s) === skillIn(s)) skillAgree++;
      if (isBundleSlug(s) === bundleIn(s)) bundleAgree++;
    }
  }
  assert(skillAgree === total && bundleAgree === total, `pre-check and API input agree on every well-formed slug of ${lengths.join(" / ")} characters (skill ${skillAgree}/${total}, bundle ${bundleAgree}/${total})`);
  assert(
    isSkillSlug("a".repeat(120)) && !isSkillSlug("a".repeat(121)) && !isSkillSlug("a".repeat(150)) && !isSkillSlug("a".repeat(200)) && !isSkillSlug("a".repeat(201)),
    "isSkillSlug: 120 characters pass; 121, 150, 200 and 201 fail (404 on /skills/<slug> and /wiki/skills/<slug>)",
  );
  assert(!skillIn("a".repeat(121)) && skillIn("a".repeat(120)), "skill.byId / skill.players refuse 121 characters and accept 120");
  assert(isBundleSlug("a".repeat(200)) && !isBundleSlug("a".repeat(201)) && bundleIn("a".repeat(200)) && !bundleIn("a".repeat(201)), "bundle slugs: 200 characters pass the pre-check and featured.bySlug, 201 neither");
  assert(isSkillSlug("phenomenal-pass") && isSkillSlug("s-heading") && isBundleSlug("spanish-league-midfielders-2026-10-19"), "real skill and bundle slugs pass");
  assert(!isSkillSlug("") && !isSkillSlug("-fortress") && !isSkillSlug("Bad_Slug!") && !isSkillSlug("a b") && !isBundleSlug("") && !isBundleSlug("x/y"), "empty, leading-hyphen, underscore / punctuation / space / slash segments fail");
  // Malformed segments too: whatever a pre-check lets through, its input takes.
  const odd = ["-", "a-", "a--b", "A-B", "0", " a", "a ", "ä", "a.b", `${"a".repeat(120)} `, `${"a".repeat(200)} `];
  assert(odd.every((s) => !isSkillSlug(s) || skillIn(s)) && odd.every((s) => !isBundleSlug(s) || bundleIn(s)), "every segment a pre-check accepts is accepted by its API input");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ helper tests passed");
