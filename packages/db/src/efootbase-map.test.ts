// Tests for the shared efootbase row mapping (openspec admin-sync-worker,
// capability efootbase-data-integrity "One Row Mapping For Every efootbase Write
// Path"). Pure: a synthetic dump row (made-up values, no efootbase content) is
// mapped and the columns are checked against the documented field rules. The
// seed-equivalence proof on a database copy is recorded in the change's tasks.
// Run: pnpm --filter @eflab/db test   (or: tsx packages/db/src/efootbase-map.test.ts)
import { POSITIONS, type CardType } from "@eflab/shared";
import {
  APTITUDE_KEYS,
  MANAGER_CROSSFILL_COLUMNS,
  MANAGER_STATIC_COLUMNS,
  PLAYER_CROSSFILL_COLUMNS,
  STAT_MAP,
  assignPackSlugs,
  basename,
  boosterRowFromDump,
  boosterRowFromFixture,
  bundleSlug,
  buildCardTypeMap,
  buildPlayerRow,
  cardLeagueId,
  emblemUrl,
  invertAptitude,
  parseDumpedAt,
  rowBoosters,
  skillKeyToSlug,
  type EfbRow,
} from "./efootbase-map.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const throws = (fn: () => unknown): boolean => {
  try { fn(); return false; } catch { return true; }
};

const meta = {
  // CARD_TYPE_DUMP_LABELS per code; code 4 repeats "Legendary" and code 7 is blank in the real meta.
  card_type: { values: ["Standard", "Legendary", "", "Trending", "Legendary", "Epic", "Highlight", ""] },
  pos: { values: [...POSITIONS] },
  condition: { values: ["E", "D", "C", "B", "A"] },
};

// 1. Card-type map validated against players_meta.json.
{
  let map: Map<number, CardType> | null = null;
  const ok = !throws(() => { map = buildCardTypeMap(meta, "meta.json"); });
  if (!ok) {
    // The labels above must match CARD_TYPE_DUMP_LABELS; print why if they do not.
    try { buildCardTypeMap(meta, "meta.json"); } catch (e) { console.error(String(e)); }
  }
  assert(ok && map!.get(5) === "EPIC" && map!.get(6) === "HIGHLIGHT" && map!.get(0) === "STANDARD", "card-type codes map (5 EPIC, 6 HIGHLIGHT, 0 STANDARD)");
  assert(throws(() => buildCardTypeMap({ ...meta, card_type: { values: ["Standard"] } }, "meta.json")), "a meta label that disagrees aborts");
  // The display table (CARD_TYPE_LABELS: "Icons", "Epic - Big Time") is never what the
  // seed accepts: a meta carrying a display label for a code still aborts (D14).
  const withLabel = (code: number, label: string) => ({ ...meta, card_type: { values: meta.card_type.values.map((v, i) => (i === code ? label : v)) } });
  assert(throws(() => buildCardTypeMap(withLabel(1, "Icons"), "meta.json")), "a meta with the display label \"Icons\" for code 1 aborts");
  assert(throws(() => buildCardTypeMap(withLabel(5, "Epic - Big Time"), "meta.json")), "a meta with the display label \"Epic - Big Time\" for code 5 aborts");
  assert(throws(() => buildCardTypeMap(withLabel(3, "Legendary"), "meta.json")), "a meta with another dump label for a code aborts");
  assert(throws(() => buildCardTypeMap({ ...meta, condition: { values: ["A", "B", "C", "D", "E"] } }, "meta.json")), "a changed condition order aborts");
  assert(throws(() => buildCardTypeMap({ ...meta, pos: { values: ["GK"] } }, "meta.json")), "a changed position order aborts");
}

// 2. One synthetic row → Player columns.
{
  const cardTypes = buildCardTypeMap(meta, "meta.json");
  const r: EfbRow = {
    id: 900000000000001, base_id: 900000000000000, name: "Test Player", name_normalized: "test player",
    nationality: "Testland", team_name: "Test FC", height: 181, weight: 77, age: 29, foot: 1,
    pos: 12, playing_style: 5, playing_style_2: null, card_type: 5, featured: "Test Pack", overall_rating: 88,
    overall_at_max_level: 97, condition: 3, injury_resistance: 2, player_value: 1234, form: 0,
    weak_foot_usage: 2, weak_foot_accuracy: 3, time_added: 1_791_417_600, max_level: 30,
    booster_id: 7, booster2_id: null, booster: { add: 2, stats: { jumping: 2, set_piece_taking: 2, speed: 0 } },
    dream_team: 1, views: null, avgRating: 4.5, ratingCount: 12, shirt_number: 9, league: 26,
    jumping: 80, set_piece_taking: 70, tackling: 60, max_attributes: { jumping: 88, tackling: 61 },
    leg_length_height: 0.75, jump_height: 0.4, p_trickster: 1, p_early_cross: 0,
  };
  for (const [i, k] of APTITUDE_KEYS.entries()) r[k] = i === 12 ? 2 : i === 11 ? 1 : 0;
  const mismatch: string[] = [];
  const leagues = new Set([4, 26, 30]);
  const row = buildPlayerRow(r, BigInt(r.id), cardTypes, new Map([["Testland", 14]]), new Map([["Test FC", 3]]), new Map([["Test Pack", "test-pack"]]), leagues, mismatch);
  assert(mismatch.length === 0, "registered-position aptitude 2 → no mismatch");
  assert(row.jump === 80 && row.placeKicking === 70 && row.ballWinning === 60, "jumping→jump, set_piece_taking→placeKicking, tackling→ballWinning");
  assert(row.maxJump === 88 && row.maxBallWinning === 61 && row.maxPlaceKicking === 40, "max_attributes mapped, missing max → 40");
  assert(row.offensiveAwareness === 40, "a missing stat key → 40");
  assert(row.posCF === 0 && row.posSS === 1 && row.posGK === 2 && invertAptitude(2) === 0 && invertAptitude(0) === 2 && invertAptitude(1) === 1, "aptitude inverted (dump 2/1/0 → db 0/1/2)");
  assert(row.condition === "B" && row.registeredPosition === 12 && row.cardType === "EPIC", "condition index 3 → B, pos, card type");
  assert(row.nationalityId === 14 && row.teamId === 3 && row.featuredPackId === "test-pack", "lookups by name");
  assert(row.marketValue === 1234 && row.injuryResistance === 2 && row.form === 0 && row.levelCap === 30, "player_value, injury_resistance, form, max_level");
  assert((row.releaseDate as Date).toISOString() === "2026-10-08T00:00:00.000Z", "time_added (epoch s) → releaseDate");
  assert(row.dribbleHeight === 0.75 && row.peakJumpHeight === 0.4 && row.legCoverage === 0, "derived floats (leg_length_height → dribbleHeight), missing → 0");
  assert(row.trickster === true && row.earlyCross === false && row.dreamTeam === true, "playstyle flags and dream_team");
  assert(row.views === 0 && row.avgRating === 4.5 && row.ratingCount === 12 && row.shirt === "9" && row.boosterId1 === 7 && row.boosterId2 === null, "views null → 0, avgRating / ratingCount from the dump fields of the same names, shirt string, booster ids");
  assert(row.nameNormalized === "test player" && row.baseId === 900000000000000n, "name_normalized and base_id");
  assert(Object.keys(row).every((k) => !PLAYER_CROSSFILL_COLUMNS.has(k)), "no cross-fill-owned column is produced by the mapping");
  assert(Object.keys(STAT_MAP).length === 26, "26 stat keys");
  // same input → same output (the seed and the worker call this one function)
  const again = buildPlayerRow(r, BigInt(r.id), cardTypes, new Map([["Testland", 14]]), new Map([["Test FC", 3]]), new Map([["Test Pack", "test-pack"]]), new Set(leagues), []);
  assert(JSON.stringify(again, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) === JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), "deterministic: identical input → identical columns");
  const bad: EfbRow = { ...r, condition: 7 };
  assert(throws(() => buildPlayerRow(bad, 1n, cardTypes, new Map(), new Map(), new Map(), leagues, [])), "condition out of range aborts");
  const mm: string[] = [];
  buildPlayerRow({ ...r, cf: 1 }, 1n, cardTypes, new Map(), new Map(), new Map(), leagues, mm);
  assert(mm.length === 1, "registered aptitude other than 2 is reported");

  // The card's own league (catalogue-data-refresh "Card League"): stored only
  // when the League table holds it; the team's league plays no part.
  const league = (patch: Partial<EfbRow>, known: ReadonlySet<number> = leagues) =>
    buildPlayerRow({ ...r, ...patch }, 1n, cardTypes, new Map(), new Map([["Test FC", 3]]), new Map(), known, []).leagueId;
  assert(row.leagueId === 26, "league 26 (known) → leagueId 26");
  assert(league({ league: 30 }) === 30 && league({ league: 4 }) === 4, "each card keeps its own league (30, 4) whatever its team");
  assert(league({ league: 999 }) === null, "a league the League table does not hold → null");
  assert(league({ league: undefined }) === null, "no `league` field → null");
  assert(league({ league: null as unknown as number }) === null, "league null → null");
  for (const odd of [26.5, "26", Number.NaN, -0.5, true]) {
    assert(league({ league: odd as unknown as number }) === null, `league ${typeof odd === "string" ? JSON.stringify(odd) : String(odd)} (not an integer) → null`);
  }
  assert(league({ league: 26 }, new Set()) === null, "no known league (empty League table) → null");
  assert(league({ league: 0 }, new Set([0])) === 0, "league 0 (\"Other\") is a real league when known");
  // Seed and incremental sync call the same function: equal known sets → equal leagueId.
  const seedSide = buildPlayerRow(r, 1n, cardTypes, new Map(), new Map(), new Map(), new Set([26]), []).leagueId;
  const syncSide = buildPlayerRow(r, 1n, cardTypes, new Map(), new Map(), new Map(), new Set([26, 4]), []).leagueId;
  assert(seedSide === 26 && syncSide === 26 && cardLeagueId(r, new Set([26])) === 26, "seed and incremental sync store the same league id for one row");
}

// 2b. Manager columns: picker flag and order are written only from the static snapshot.
{
  assert(MANAGER_STATIC_COLUMNS.has("inPicker") && MANAGER_STATIC_COLUMNS.has("pickerOrder"), "inPicker and pickerOrder are static-snapshot columns (never written by the fixture upsert)");
  assert(![...MANAGER_STATIC_COLUMNS].some((c) => MANAGER_CROSSFILL_COLUMNS.has(c)), "static and cross-fill manager columns do not overlap");
}

// 2c. The manifest's dumpedAt → the stored dump date (or null: keep the stored one).
{
  const iso = (v: unknown) => parseDumpedAt(v)?.toISOString() ?? null;
  assert(iso("2026-10-18T16:00:00Z") === "2026-10-18T16:00:00.000Z", "dumpedAt 2026-10-18T16:00:00Z → that instant");
  assert(iso("2026-10-24T09:05:07.123Z") === "2026-10-24T09:05:07.123Z" && iso("2026-10-24T09:05:07.5Z") === "2026-10-24T09:05:07.500Z", "milliseconds kept (the worker's --dumped-at is toISOString())");
  assert(iso("2026-10-24T09:05Z") === "2026-10-24T09:05:00.000Z", "seconds optional");
  for (const v of ["manual", "", "2026-10-24", "2026-10-24T09:05:07+07:00", "2026-10-24 09:05:07Z", "2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-10-24T24:00:00Z", "2026-10-24T09:05:07.1234Z", null, undefined, 1792000000, {}]) {
    assert(parseDumpedAt(v) === null, `dumpedAt ${JSON.stringify(v) ?? "undefined"} → null (stored value kept)`);
  }
}

// 3. Boosters, skill keys, pack slugs, URL helpers.
{
  const b = boosterRowFromDump(7, { add: 2, stats: { jumping: 2, set_piece_taking: 2, speed: 0 } });
  assert(b.name === "Booster +2 · Jump, SetPiece" && b.jump === 2 && b.placeKicking === 2 && b.speed === 0 && b.tier === "standard" && b.magnitude === 2, "dump booster row (name, magnitudes, zero stats)");
  assert(throws(() => boosterRowFromDump(8, { add: 1, stats: { long_ranger: 1 } })), "an unknown booster stat key aborts");
  const f = boosterRowFromFixture({ id: 3, nameEn: "Booster +1 Speed", bonus: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] }, "basic");
  assert(f.speed === 1 && f.magnitude === 1 && f.tier === "basic", "fixture booster row (bonus[] order)");
  assert(rowBoosters({ id: 1, booster_id: 4, booster: { add: 1 }, booster2_id: 5, booster2: null }).length === 1, "rowBoosters skips an absent object");
  assert(skillKeyToSlug("s_one_touch_pass") === "one-touch-pass" && skillKeyToSlug("s_heading") === "s-heading" && skillKeyToSlug("s_rising_shot") === "rising-shots", "s_* key → fixture slug (with aliases)");
  const slugs = assignPackSlugs(["Big Time – Test", "Big Time - Test", "Pack’s Name"]);
  assert(slugs.get("Big Time – Test") === "big-time-test" && slugs.get("Big Time - Test") === "big-time-test-2" && slugs.get("Pack’s Name") === "packs-name", "pack slugs: first-seen order, -2 on a collision, apostrophes dropped");
  assert(bundleSlug("spotlight-", "Jürgen Test", new Date("2026-10-15T12:00:00Z")) === "spotlight-jurgen-test-2026-10-15", "bundle slug strips accents and appends the UTC date");
  assert(basename("https://cdn.example/emblems/abc123.png") === "abc123.png" && basename("https://cdn.example/x.webp") === null && basename(null) === null, "emblem basename");
  assert(emblemUrl("https://r2.example", "team", "h.png") === "https://r2.example/emblems/team/h.png", "stored emblem URL");
  // Unsafe file names never reach a stored URL (verify finding C1): traversal, encoded separators,
  // query / fragment characters, backslashes, spaces, a leading dot.
  const hostile = ["a%2F..%2Fx.png", "%2e%2e.png", "x?y=..png", "x#..png", "a\\..\\b.png", "a b.png", ".hidden.png", "-x.png", "é.png"];
  const accepted = hostile.filter((n) => basename(`https://cdn.example/emblems/team/${n}`) !== null);
  assert(accepted.length === 0, `emblem basename refuses unsafe file names (accepted: ${accepted.join(", ") || "none"})`);
  assert(basename("https://cdn.example/emblems/team/A1b2_c-3.d4.png") === "A1b2_c-3.d4.png", "emblem basename keeps a safe name with . _ -");
  // The name comes from the URL's path: a query or fragment never names the file (second verify).
  assert(basename("https://cdn.example/e/a.png?x=/b.png") === "a.png" && basename("https://cdn.example/e/a.png#/b.png") === "a.png", "emblem basename ignores the query and the fragment");
  assert(basename("https://cdn.example/e/x.png?v=1") === "x.png" && basename("not a url/x.png") === null, "emblem basename: a query after the name is fine; a non-URL is null");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ efootbase-map tests passed");
