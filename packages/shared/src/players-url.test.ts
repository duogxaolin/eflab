// Tests for the /players URL codec (players-url.ts; change
// efootbase-function-parity, task 5.1): the key order, the canonical forms of
// the spec scenarios, every older eFootLab form (it must ask the API for the
// same cards as its canonical form), legacy id resolution, Reset, the chips,
// the row badges, the picker orders, and a fuzz run (the reader never throws
// and its output is a fixed point of the writer).
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/players-url.test.ts)
import {
  DEFAULT_PLAYERS_STATE,
  PLAYERS_URL_KEYS,
  activeFilterKey,
  activeFilters,
  countActiveFilters,
  filterDialogCounts,
  groupTeamsForPicker,
  orderNationsForPicker,
  playersListQuery,
  readPlayersState,
  resetFilters,
  resolveLegacyIds,
  searchApplies,
  withoutDefaultPage,
  withoutFilter,
  writePlayersState,
  type LegacyIdLookups,
  type PlayersState,
} from "./players-url";
import { FIXED_FIRST_NATIONS, MAX_FILTER_IDS, MAX_FILTER_SKILLS } from "./constants";
import { playerListInput } from "./schemas";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Lookups standing in for the team and skill lists (team 12 is Portugal in
// the stored data; skill ids 8 / 23 are Rabona / Sombrero).
const TEAM_NAMES = new Map<number, string>([
  [12, "Portugal"],
  [33, "Arsenal FC"],
  [44, "Vissel Kobe"],
]);
const SKILL_KEYS = new Map<number, string | null>([
  [8, "s_rabona"],
  [23, "s_sombrero"],
  [9, null], // a catalogue entry without a key
]);
const LOOKUPS: LegacyIdLookups = { teamName: (id) => TEAM_NAMES.get(id), skillKey: (id) => SKILL_KEYS.get(id) };

const read = (qs: string) => readPlayersState(new URLSearchParams(qs));
/** The canonical query a link becomes on the next change (the lists loaded). */
const canonical = (qs: string) => writePlayersState(resolveLegacyIds(read(qs), LOOKUPS));
const listOf = (qs: string) => playersListQuery(resolveLegacyIds(read(qs), LOOKUPS), 72);

// 1. Key order: a state with every key writes them in PLAYERS_URL_KEYS order.
{
  const full: PlayersState = {
    q: "messi",
    types: ["LEGENDARY", "EPIC"],
    pos: ["CF", "GK"],
    styles: [22, 1],
    ai: ["trickster", "mazingRun"],
    nat: [14, 3],
    league: [26, 4],
    teams: ["Vissel Kobe", "Arsenal FC"],
    legacyTeamIds: [],
    foot: 1,
    base: { min: 87 },
    max: { min: 90, max: 105 },
    condition: ["A", "E"],
    form: [3, 1],
    wfa: [4],
    wfu: [2, 1],
    height: { min: 180 },
    weight: { max: 90 },
    age: { min: 18, max: 21 },
    skills: ["s_sombrero", "s_rabona"],
    legacySkillIds: [],
    stats: { speed: { min: 85 }, finishing: { min: 80 } },
    statsAtMax: true,
    body: { legLength: { min: 13 } },
    sort: "name",
    order: "desc",
    page: 3,
  };
  const qs = writePlayersState(full);
  const keys = Array.from(new Set(Array.from(new URLSearchParams(qs).keys())));
  assert(eq(keys, PLAYERS_URL_KEYS), `every key, in the spec order (${keys.join(", ")})`);
  assert(
    qs ===
      "search=messi&sort=name&pos=0&pos=12&card=1&card=5&base=87-&ovr=90-105&foot=1&condition=0&condition=4&form=0&form=2&wfa=3&wfu=0&wfu=1" +
        "&height=180-&weight=-90&age=18-21&playingStyle=1&playingStyle=22&playingStyle=p_mazing_run&playingStyle=p_trickster" +
        "&skill=s_rabona&skill=s_sombrero&nat=3&nat=14&league=4&league=26&team=Arsenal+FC&team=Vissel+Kobe" +
        "&stat=finishing%3A80-%2Cspeed%3A85-&smax=1&body=legLength%3A13-&order=desc&page=3",
    `full state → exact canonical query (${qs})`,
  );
  assert(writePlayersState(read(qs)) === qs, "full state: read → write is a fixed point");
  assert(eq(read(qs), { ...full, types: ["LEGENDARY", "EPIC"], pos: ["GK", "CF"], styles: [1, 22], ai: ["mazingRun", "trickster"], nat: [3, 14], league: [4, 26], teams: ["Arsenal FC", "Vissel Kobe"], condition: ["E", "A"], form: [1, 3], wfu: [1, 2], skills: ["s_rabona", "s_sombrero"], stats: { finishing: { min: 80 }, speed: { min: 85 } } }), "full state: read back equals the state (canonical order)");
  assert(writePlayersState(DEFAULT_PLAYERS_STATE) === "", "default state → empty query (/players)");
}

// 2. Spec scenarios (catalog-browsing-parity "Page State Lives in the URL").
{
  // Reference link: read, then after a change and its revert the canonical form.
  const ref = "card=5&search=messi&pos=10&foot=1&wfa=2&base=87-&sort=highest";
  const s = read(ref);
  assert(s.q === "messi" && eq(s.types, ["EPIC"]) && eq(s.pos, ["RWF"]) && s.foot === 1 && eq(s.wfa, [3]) && eq(s.base, { min: 87 }) && s.sort === "highest", "reference link → messi, Epic, RWF, left foot, WF accuracy 3★, base ≥ 87, High to low");
  const changed = writePlayersState({ ...s, foot: 0 });
  const reverted = writePlayersState({ ...readPlayersState(new URLSearchParams(changed)), foot: 1 });
  assert(reverted === "search=messi&sort=highest&pos=10&card=5&base=87-&foot=1&wfa=2", `reference link after change + revert (${reverted})`);

  assert(canonical("pos=12&pos=11&nat=14&nat=3") === "pos=11&pos=12&nat=3&nat=14", "pos=12&pos=11&nat=14&nat=3 → pos=11&pos=12&nat=3&nat=14");
  assert(eq(read("pos=12&pos=11&nat=14&nat=3").pos, ["SS", "CF"]), "… selects SS and CF");
  assert(canonical("pos=11&pos=12&nat=3&nat=14") === "pos=11&pos=12&nat=3&nat=14", "re-saving the canonical form leaves it unchanged");

  const old = read("condition=A,B&form=1,3&team=12");
  assert(eq(old.condition, ["B", "A"]) && eq(old.form, [1, 3]) && eq(old.legacyTeamIds, [12]) && old.teams.length === 0, "condition=A,B&form=1,3&team=12 → conditions A, B; 1★ and 3★; team id 12");
  assert(canonical("condition=A,B&form=1,3&team=12") === "condition=3&condition=4&form=0&form=2&team=Portugal", `… → condition=3&condition=4&form=0&form=2&team=Portugal (${canonical("condition=A,B&form=1,3&team=12")})`);
  assert(eq(read("form=2").form, [3]), "form=2 → 3★ (0-based single value)");
  assert(canonical("q=messi&type=EPIC") === "search=messi&card=5", "q=messi&type=EPIC → search=messi&card=5");

  // efootbase-ui-parity "URL contract kept".
  const contract = "pos=11&pos=12&card=5&nat=3";
  const withCb = writePlayersState({ ...read(contract), pos: [...read(contract).pos, "CB"] });
  assert(writePlayersState({ ...read(withCb), pos: read(withCb).pos.filter((p) => p !== "CB") }) === contract, "canonical contract URL: toggle CB on and off → unchanged");
  assert(canonical("card=5&pos=SS&pos=CF&nat=3") === contract, "older form card=5&pos=SS&pos=CF&nat=3 → canonical");
  // With page=2: any filter change goes back to page 1 (PlayersClient's
  // update()), so change + revert ends on the canonical form without `page`.
  const paged = read("pos=11&pos=12&card=5&nat=3&page=2");
  assert(paged.page === 2, "page=2 read");
  const step1 = read(writePlayersState({ ...paged, pos: [...paged.pos, "CB"], page: 1 }));
  const step2 = writePlayersState({ ...step1, pos: step1.pos.filter((p) => p !== "CB"), page: 1 });
  assert(step2 === contract, `…&page=2 changed and reverted → ${contract} (${step2})`);

  // Reset keeps the search and the sort.
  assert(writePlayersState(resetFilters(read("search=messi&sort=highest&card=5"))) === "search=messi&sort=highest", "Reset on search=messi&sort=highest&card=5 → search=messi&sort=highest");
  assert(writePlayersState(resetFilters(read("sort=name&order=desc&pos=0&page=4"))) === "sort=name&order=desc", "Reset keeps a field sort and its direction, drops the page");

  // Chip removal: Vissel Kobe only.
  const chipped = read("league=4&league=26&team=Arsenal+FC&team=Vissel+Kobe");
  const vissel = activeFilters(chipped).find((f) => f.kind === "team" && f.value === "Vissel Kobe");
  assert(vissel !== undefined, "Vissel Kobe chip exists");
  const after = withoutFilter(chipped, vissel!);
  assert(writePlayersState(after) === "league=4&league=26&team=Arsenal+FC", "removing the Vissel Kobe chip drops team=Vissel+Kobe only");
  assert(filterDialogCounts(after).league === 2 && filterDialogCounts(after).team === 1, "League badge stays 2, Team badge 1");
}

// 3. Older forms ask the API for exactly what their canonical form asks for.
{
  const pairs: Array<[string, string]> = [
    ["q=messi", "search=messi"],
    ["q=messi&type=EPIC", "search=messi&card=5"],
    ["type=EPIC,HIGHLIGHT", "card=5&card=6"],
    ["card=5,6", "card=5&card=6"],
    ["style=22", "playingStyle=22"],
    ["dstyle=24", "playingStyle=24"],
    ["playingStyle=1&ai=trickster,mazingRun", "playingStyle=1&playingStyle=p_mazing_run&playingStyle=p_trickster"],
    ["ovrMin=80&ovrMax=90", "base=80-90"],
    ["maxOvrMin=100", "ovr=100-"],
    ["maxOvrMin=99&maxOvrMax=101", "ovr=99-101"],
    ["pos=CF", "pos=12"],
    ["pos=SS,CF", "pos=11&pos=12"],
    ["pos=cb&pos=LB", "pos=1&pos=2"],
    ["condition=A", "condition=4"],
    ["condition=A,B", "condition=3&condition=4"],
    ["condition=e", "condition=0"],
    ["form=1,3", "form=0&form=2"],
    ["wfa=3,4", "wfa=2&wfa=3"],
    ["wfu=1,2", "wfu=0&wfu=1"],
    ["skill=8", "skill=s_rabona"],
    ["skill=8,23", "skill=s_rabona&skill=s_sombrero"],
    ["team=12", "team=Portugal"],
    ["team=33&team=44", "team=Arsenal+FC&team=Vissel+Kobe"],
    ["nat=14", "nat=14"],
    ["nat=3,14", "nat=3&nat=14"],
    ["league=26", "league=26"],
    ["sort=trending", ""],
    ["sort=new", ""],
    ["sort=top", "sort=highest"],
    ["sort=top&type=LEGENDARY", "sort=highest&card=1"],
    ["page=1", ""],
  ];
  for (const [legacy, canon] of pairs) {
    assert(canonical(legacy) === canon, `${legacy} → ${canon || "(empty)"} (got ${canonical(legacy) || "(empty)"})`);
    assert(eq(listOf(legacy), listOf(canon)), `${legacy}: same player.list input as ${canon || "(empty)"}`);
    assert(canonical(canon) === canon, `${canon || "(empty)"} is a fixed point`);
  }
  // Before the lists are known a legacy id stays an id and is still sent.
  const unresolved = read("team=12&skill=8");
  assert(eq(playersListQuery(unresolved, 72).clubIds, [12]) && eq(playersListQuery(unresolved, 72).skillIds, [8]), "unresolved legacy ids are sent as clubIds / skillIds");
  assert(writePlayersState(unresolved) === "skill=8&team=12", "unresolved legacy ids are written as the digits read (meaning kept)");
  const unknown = resolveLegacyIds(read("team=999&skill=9"), LOOKUPS);
  assert(eq(unknown.legacyTeamIds, [999]) && eq(unknown.legacySkillIds, [9]), "ids the lists do not know (or a key-less skill) stay ids");
  const same = read("team=Arsenal+FC");
  assert(resolveLegacyIds(same, LOOKUPS) === same, "nothing to resolve → the same object");
}

// 4. Reader rules.
{
  assert(eq(read("form=0&form=2").form, [1, 3]), "repeated 0-based form values");
  assert(eq(read("form=3").form, []), "form=3 is out of range (0-based) → dropped");
  assert(eq(read("wfa=3").wfa, [4]) && eq(read("wfu=0").wfu, [1]), "wfa=3 → 4★, wfu=0 → 1★");
  assert(eq(read("wfa=0,5,2").wfa, [2]), "old comma list: 0 and 5 dropped, 2 kept as 2★");
  assert(eq(read("condition=5&condition=x&condition=2").condition, ["C"]), "condition: 5 and x dropped, 2 = C");
  assert(eq(read("playingStyle=0&playingStyle=99&playingStyle=p_long_ranger&playingStyle=8").styles, [8]), "unknown style ids, Basic (0) and unknown AI keys are dropped");
  assert(eq(read("playingStyle=P_TRICKSTER").ai, ["trickster"]), "AI keys are case-insensitive");
  assert(eq(read("team=Arsenal FC,").teams, ["Arsenal FC,"]), "a team name is never split on commas");
  assert(eq(read("team=%20Arsenal%20FC%20").teams, ["Arsenal FC"]), "team names are trimmed");
  assert(read(`team=${"x".repeat(101)}`).teams.length === 0, "a team name over 100 characters is dropped");
  assert(eq(read("skill=s_rabona&skill=S_X&skill=s_rabona").skills, ["s_rabona"]), "skill keys: duplicates and invalid keys dropped");
  const manyTeams = Array.from({ length: 60 }, (_, i) => `team=T${String(i).padStart(2, "0")}`).join("&") + "&team=1";
  const mt = read(manyTeams);
  assert(mt.teams.length === MAX_FILTER_IDS && mt.legacyTeamIds.length === 0, "teams: at most 50 values, names first");
  const manySkills = Array.from({ length: 25 }, (_, i) => `skill=s_k${i}`).join("&");
  assert(read(manySkills).skills.length === MAX_FILTER_SKILLS, "skills: at most 20 values");
  assert(read("base=90-80").base === null, "an inverted range is dropped");
  assert(read(`search=${"a".repeat(200)}`).q.length === 120, "a search over 120 characters is cut to the list bound");
  assert(read("search=me").q === "me" && playersListQuery(read("search=me"), 72).q === undefined, "a 2-character search fills the field but is not sent");
  assert(playersListQuery(read("search=mes"), 72).q === "mes" && searchApplies("mes") && !searchApplies(" é "), "3 characters (after folding) are sent");
  assert(read("search=messi&q=ronaldo").q === "messi", "`search` wins over the old `q`");
  assert(read("sort=name").order === "asc" && read("sort=name&order=desc").order === "desc", "name sort: natural A → Z, explicit desc kept");
  assert(read("sort=bogus").sort === "new", "an unknown sort reads as the default");
  assert(withoutDefaultPage(new URLSearchParams("page=1&card=5")) === "card=5" && withoutDefaultPage(new URLSearchParams("page=2")) === null, "withoutDefaultPage drops page=1 only");
  // The API accepts every list query the reader can produce.
  for (const qs of ["", "card=5&search=messi&pos=10&foot=1&wfa=2&base=87-&sort=highest", "condition=A,B&form=1,3&team=12", manyTeams, manySkills, "stat=speed:90-&smax=1&body=legLength:13-"]) {
    const parsed = playerListInput.safeParse(playersListQuery(read(qs), 72));
    assert(parsed.success, `player.list accepts the input of "${qs.slice(0, 60)}"`);
  }
}

// 5. Counts, Reset, chips.
{
  const s = read("pos=1&pos=2&card=1&card=4&playingStyle=1&playingStyle=22&playingStyle=p_trickster&playingStyle=p_mazing_run&skill=s_rabona&skill=s_sombrero&nat=3&nat=14&league=26&team=Arsenal+FC&stat=speed:90-&smax=1&body=legLength:13-&form=2&search=messi&sort=highest");
  const c = filterDialogCounts(s);
  assert(eq(c, { stats: 2, body: 1, style: 4, skills: 2, nation: 2, league: 1, team: 1 }), `row badges ${JSON.stringify(c)}`);
  assert(filterDialogCounts(read("smax=1")).stats === 0, "the max switch alone is not counted (not written without a stat range)");
  // Phone Filters badge: OR lists once, AND lists per value (unchanged rule).
  assert(countActiveFilters(s) === 1 + 1 + 1 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 1, `phone Filters count ${countActiveFilters(s)}`);
  const chips = activeFilters(s);
  // Kinds in URL key order; inside the card types the Card Type toggles' order
  // (CARD_TYPE_FILTER_ORDER: Selection before Icons), not the code order.
  assert(chips.map(activeFilterKey).join(" ") === "pos:CB pos:LB card:SELECTION card:LEGENDARY form:3 style:1 style:22 ai:mazingRun ai:trickster skill:s_rabona skill:s_sombrero nat:3 nat:14 league:26 team:Arsenal FC stat:speed statsAtMax body:legLength", `chips in URL key order, card types in toggle order (${chips.map(activeFilterKey).join(" ")})`);
  assert(/(^|&)card=1&card=4(&|$)/.test(writePlayersState(s)), `… while the URL keeps card=1&card=4 (code order): ${writePlayersState(s)}`);
  // Removing each chip removes that value only.
  for (const chip of chips) {
    const next = withoutFilter(s, chip);
    const left = activeFilters(next).map(activeFilterKey);
    const expected = chips
      .map(activeFilterKey)
      .filter((k) => k !== activeFilterKey(chip) && !(activeFilterKey(chip) === "stat:speed" && k === "statsAtMax"));
    assert(eq(left, expected) && next.q === "messi" && next.sort === "highest" && next.page === 1, `removing ${activeFilterKey(chip)} removes that value only`);
  }
  const lastCard = withoutFilter(read("card=5"), { kind: "card", value: "EPIC" });
  assert(lastCard.types === null && writePlayersState(lastCard) === "", "removing the last card type → all types");
  const ranges = activeFilters(read("base=87-&ovr=99-&height=190-192&weight=90-&age=18-21&foot=0&condition=0&wfa=0&wfu=3"));
  assert(ranges.map(activeFilterKey).join(" ") === "base max foot:0 condition:E wfa:1 wfu:4 height weight age", `range chips (${ranges.map(activeFilterKey).join(" ")})`);
  assert(eq(resetFilters(s), { ...DEFAULT_PLAYERS_STATE, q: "messi", sort: "highest", order: "desc" }), "Reset: every filter gone, search and sort kept");
}

// 6. Picker orders.
{
  const names = ["Wales", "Belgium", "Côte d'Ivoire", "Argentina", "Brazil", "Japan", "England", "Portugal", "Netherlands", "Italy", "Germany", "Spain", "France", "Austria", "Czechia"];
  const ordered = orderNationsForPicker(names.map((name, id) => ({ id, name }))).map((r) => r.name);
  assert(eq(ordered.slice(0, 10), FIXED_FIRST_NATIONS), `the ten fixed nations first, in order (${ordered.slice(0, 10).join(", ")})`);
  assert(eq(ordered.slice(10), ["Austria", "Côte d'Ivoire", "Czechia", "Japan", "Wales"]), `then the rest A–Z (${ordered.slice(10).join(", ")})`);
  assert(new Set(ordered).size === names.length, "no nation twice");
  const missing = orderNationsForPicker([{ name: "Brazil" }, { name: "Albania" }, { name: "England" }]).map((r) => r.name);
  assert(eq(missing, ["England", "Brazil", "Albania"]), "fixed nations missing from the data are skipped");

  const leagues = [
    { id: 4, name: "English League" },
    { id: 26, name: "2026/27 MEIJI YASUDA J1 LEAGUE" },
    { id: 0, name: "Other" },
  ];
  const teams = [
    { id: 1, name: "Vissel Kobe", leagueId: 26 },
    { id: 2, name: "Arsenal FC", leagueId: 4 },
    { id: 3, name: "Portugal", leagueId: 0 },
    { id: 4, name: "Kashima Antlers", leagueId: 26 },
    { id: 5, name: "Free Club", leagueId: null },
    { id: 6, name: "Aston Villa", leagueId: 4 },
    { id: 7, name: "Lost Club", leagueId: 77 },
  ];
  const grouped = groupTeamsForPicker(teams, leagues).map((r) => `${r.league ?? "-"}/${r.team.name}`);
  assert(
    eq(grouped, [
      "2026/27 MEIJI YASUDA J1 LEAGUE/Kashima Antlers",
      "2026/27 MEIJI YASUDA J1 LEAGUE/Vissel Kobe",
      "English League/Arsenal FC",
      "English League/Aston Villa",
      "Other/Portugal",
      "-/Free Club",
      "-/Lost Club",
    ]),
    `teams grouped by league A–Z, teams A–Z, league 0 is a league, no league last (${grouped.join(" | ")})`,
  );
}

// 7. Fuzz: the reader never throws, the API accepts its list input, and
// write(read(x)) is a fixed point.
{
  const pool = [
    "search", "q", "sort", "order", "page", "pos", "card", "type", "base", "ovr", "ovrMin", "ovrMax", "maxOvrMin", "maxOvrMax",
    "foot", "condition", "form", "wfa", "wfu", "height", "weight", "age", "playingStyle", "style", "dstyle", "ai", "skill",
    "nat", "league", "team", "stat", "smax", "body", "rating", "nation", "speed", "maxed",
  ];
  const values = [
    "", "0", "1", "2", "3", "4", "5", "12", "-1", "1.5", "abc", "A", "b", "A,B", "1,3", "0,9", "90-", "-85", "80-90", "90-80",
    "p_trickster", "p_mazing_run", "s_rabona", "s_", "Arsenal FC", "12,14", "trending", "top", "highest", "name", "asc", "desc",
    "speed:85-", "legLength:13-,neckSize:-4", "%", "\u0000", "東京", "9".repeat(30), "x".repeat(130), " ", ",", ",,", "CF", "gk",
  ];
  let seed = 20261024;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  let failures = 0;
  for (let i = 0; i < 500; i++) {
    const sp = new URLSearchParams();
    const n = 1 + rnd(8);
    for (let j = 0; j < n; j++) sp.append(pool[rnd(pool.length)]!, values[rnd(values.length)]!);
    try {
      const s = readPlayersState(sp);
      const once = writePlayersState(s);
      const twice = writePlayersState(readPlayersState(new URLSearchParams(once)));
      const input = playerListInput.safeParse(playersListQuery(s, 72));
      if (once !== twice || !input.success) {
        failures++;
        if (failures <= 3) console.error("  fuzz case:", sp.toString(), "→", once, "→", twice, input.success ? "" : JSON.stringify(input.error.issues[0]));
      }
    } catch (e) {
      failures++;
      if (failures <= 3) console.error("  fuzz threw:", sp.toString(), e);
    }
  }
  assert(failures === 0, `500 random queries: no throw, API-valid input, write(read(x)) a fixed point (${failures} failures)`);
}
