// efootbase-map.ts — the pure efootbase → Postgres row mapping (openspec change
// admin-sync-worker, capability efootbase-data-integrity "One Row Mapping For
// Every efootbase Write Path"). Moved out of seed-efootbase-full.ts unchanged so
// the seed and the sync worker build identical rows from identical input.
//
// Rules for this module: no I/O, no process.env, no database access, no side
// effect at import time other than the consistency guard below (which throws on
// a programming error). Anything that depends on configuration (the R2 base URL,
// file paths) is a parameter.

import {
  BASE_STATS,
  CARD_TYPE_BY_EFOOTBASE_CODE,
  CARD_TYPE_LABELS,
  EFOOTBASE_STAT_MAP,
  POSITIONS,
  type BaseStat,
  type CardType,
} from "@eflab/shared";

// ---- efootbase jsonl row shape (only fields we touch) ----
export interface BoosterObj { name?: string; add?: number; stats?: Record<string, number> }
export interface EfbRow {
  id: number;
  base_id?: number;
  name?: string;
  name_ja?: string | null;
  name_zh?: string | null;
  name_normalized?: string | null;
  nationality?: string | null;
  team_name?: string | null;
  height?: number;
  weight?: number;
  age?: number;
  foot?: number;
  pos?: number;                 // registered position, same index order as POSITIONS
  playing_style?: number;
  playing_style_2?: number | null;
  card_type?: number;
  featured?: string | null;
  overall_rating?: number;
  overall_at_max_level?: number;
  condition?: number;           // index into players_meta condition.values [E,D,C,B,A]
  injury_resistance?: number;
  player_value?: number;
  form?: number;
  weak_foot_usage?: number;
  weak_foot_accuracy?: number;
  time_added?: number;
  max_level?: number;
  booster_id?: number | null;
  booster2_id?: number | null;
  booster?: BoosterObj | null;
  booster2?: BoosterObj | null;
  league?: number;
  shirt_number?: number;
  dream_team?: number;
  views?: number | null;
  ratingCount?: number | null;
  avgRating?: number | null;
  emblem_images?: { nationality?: string | null; league?: string | null; team?: string | null } | null;
  max_attributes?: Record<string, number> | null;
  leg_length_height?: number;
  [key: string]: unknown;
}

// ---- Field maps (efootbase key → Prisma column) ----

// 26 base stats. efootbase names three stats differently from Konami's UI:
// `jumping` (Jump), `set_piece_taking` (Set Piece Taking / placeKicking) and
// `tackling` (Ball Winning). The same keys are used in `max_attributes` and in the
// inline booster `stats` objects, so one map serves all three.
export const STAT_MAP: Readonly<Record<string, string>> = {
  offensive_awareness: "offensiveAwareness",
  ball_control: "ballControl",
  dribbling: "dribbling",
  tight_possession: "tightPossession",
  low_pass: "lowPass",
  lofted_pass: "loftedPass",
  finishing: "finishing",
  heading: "heading",
  set_piece_taking: "placeKicking",
  curl: "curl",
  speed: "speed",
  acceleration: "acceleration",
  kicking_power: "kickingPower",
  jumping: "jump",
  physical_contact: "physicalContact",
  balance: "balance",
  stamina: "stamina",
  defensive_awareness: "defensiveAwareness",
  tackling: "ballWinning",
  defensive_engagement: "defensiveEngagement",
  aggression: "aggression",
  gk_awareness: "gkAwareness",
  gk_catching: "gkCatching",
  gk_parrying: "gkParrying",
  gk_reflexes: "gkReflexes",
  gk_reach: "gkReach",
};
export const maxColumn = (base: string): string => `max${base.charAt(0).toUpperCase()}${base.slice(1)}`;

// The static snapshot's stat names (skill effects: camelCase, manager pills:
// snake_case) go through EFOOTBASE_STAT_MAP from @eflab/shared — one explicit
// table, unknown keys abort. Guard: it agrees with STAT_MAP, every target is a stat.
for (const [key, col] of Object.entries(STAT_MAP)) {
  if (EFOOTBASE_STAT_MAP[key] !== col) throw new Error(`EFOOTBASE_STAT_MAP.${key} disagrees with STAT_MAP (${col})`);
}
for (const v of Object.values(EFOOTBASE_STAT_MAP)) {
  if (!(BASE_STATS as readonly string[]).includes(v)) throw new Error(`EFOOTBASE_STAT_MAP target ${v} is not in BASE_STATS`);
}

// Booster `stats` keys: the 26 stat keys above plus weak_foot_accuracy.
export const BOOSTER_STAT_MAP: Readonly<Record<string, string>> = {
  ...STAT_MAP,
  weak_foot_accuracy: "weakFootAccuracy",
};
// Short human-readable labels for the synthesized booster name ("Booster +4 · Jump, SetPiece").
export const BOOSTER_STAT_LABEL: Readonly<Record<string, string>> = {
  offensive_awareness: "OAware", ball_control: "BControl", dribbling: "Dribble",
  tight_possession: "TightPoss", low_pass: "LowPass", lofted_pass: "LoftPass",
  finishing: "Finish", set_piece_taking: "SetPiece", curl: "Curl", heading: "Heading",
  defensive_awareness: "DAware", defensive_engagement: "DEngage", tackling: "Tackle",
  aggression: "Aggression", kicking_power: "KickPow", speed: "Speed",
  acceleration: "Accel", balance: "Balance", physical_contact: "PhysCont",
  jumping: "Jump", stamina: "Stamina", gk_awareness: "GKAware", gk_catching: "GKCatch",
  gk_parrying: "GKParry", gk_reflexes: "GKReflex", gk_reach: "GKReach",
  weak_foot_accuracy: "WeakFoot",
};
// fixtures/boosters.json `bonus[]` order (27 entries, efootbase statKeys order).
export const BOOSTER_BONUS_COLUMNS = [
  "offensiveAwareness","ballControl","tightPossession","dribbling","lowPass","loftedPass",
  "finishing","placeKicking","curl","heading","defensiveAwareness","defensiveEngagement",
  "ballWinning","aggression","kickingPower","speed","acceleration","balance",
  "physicalContact","jump","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach",
  "stamina","weakFootAccuracy",
] as const;

export const PHYSIQUE_MAP: Readonly<Record<string, string>> = {
  neck_length: "neckLength",
  neck_size: "neckSize",
  shoulder_height: "shoulderHeight",
  shoulder_width: "shoulderWidth",
  chest_measurement: "chestMeasurement",
  waist_size: "waistSize",
  arm_size: "armSize",
  arm_length: "armLength",
  thigh_size: "thighSize",
  calf_size: "calfSize",
  leg_length: "legLength",
};

// Derived body-model floats (efootbase "Body Model" panel). `jump_height` is the
// body-model peak jump height, not a Konami stat. The dump has no `dribble_height`
// key at all — the value efootbase shows as dribble height is `leg_length_height`.
export const DERIVED_MAP: Readonly<Record<string, string>> = {
  leg_coverage_radius: "legCoverage",
  arm_coverage_radius: "armCoverage",
  jump_height: "peakJumpHeight",
  torso_collision: "torsoCollisionWidth",
  leg_length_height: "dribbleHeight",
};

export const PLAYSTYLE_MAP: Readonly<Record<string, string>> = {
  p_trickster: "trickster",
  p_mazing_run: "mazingRun",
  p_speeding_bullet: "speedingBullet",
  p_incisive_run: "incisiveRun",
  p_long_ball_expert: "longBallExpert",
  p_early_cross: "earlyCross",
  // p_long_ranger has no column in the schema.
};

// Position aptitude keys in POSITIONS order (GK, CB, LB, RB, DMF, CMF, LMF, RMF,
// AMF, LWF, RWF, SS, CF). efootbase encodes 2=registered/full, 1=partial, 0=none;
// the schema's posXX columns use 0=registered, 1=partial, 2=none → invert 0↔2.
export const APTITUDE_KEYS = POSITIONS.map((p) => p.toLowerCase());
export const APTITUDE_COLUMNS = POSITIONS.map((p) => `pos${p}`);
export const invertAptitude = (v: number): number => (v === 2 ? 0 : v === 0 ? 2 : 1);

// players_meta.json `condition.values` is [E, D, C, B, A]; the seeder asserts it.
export const CONDITION_LETTERS = ["E", "D", "C", "B", "A"] as const;

// efootbase `s_*` keys whose kebab form is not the fixture slug.
export const SKILL_KEY_ALIASES: Readonly<Record<string, string>> = {
  s_heading: "s-heading",
  s_phenomenal_pass: "phenomenal-passing",
  s_acrobatic_clearance: "acrobatic-clear",
  s_rising_shot: "rising-shots",
};

// Columns the eFHUB cross-fill owns (seed-efhub-crossfill.ts). Never written by an
// efootbase write path (seed or sync): omitted from the INSERT column list
// (defaults apply on first insert) and from the ON CONFLICT update list (existing
// values survive a re-seed).
export const PLAYER_CROSSFILL_COLUMNS: ReadonlySet<string> = new Set([
  "reputation", "overallPotential", "gkClearing", "maxGkClearing", "stars", "communityTier",
  ...POSITIONS.map((p) => `rating${p}`),
]);
export const MANAGER_CROSSFILL_COLUMNS: ReadonlySet<string> = new Set([
  "age", "country", "adaptability", "affinity", "marketValue",
  "possessionGame", "quickCounter", "longBallCounter", "outWide", "longBall", "overload",
]);
// Written only from the static snapshot (a dedicated UPDATE), never by the fixture
// upsert — so a seed without dump/efootbase/static/managers.json leaves it as is.
export const MANAGER_STATIC_COLUMNS: ReadonlySet<string> = new Set(["inPicker"]);

/** efootbase stat name (either spelling) → eFootLab stat; unknown → throws. */
export function mapEfootbaseStat(key: string, where: string): BaseStat {
  const stat = EFOOTBASE_STAT_MAP[key];
  if (!stat) throw new Error(`${where}: unknown efootbase stat "${key}" — add it to EFOOTBASE_STAT_MAP (never guessed)`);
  return stat;
}

// ---- helpers ----

/** Trailing `hash.png` of an efootbase CDN URL (flag / emblem file names are SHA256 hashes). */
export function basename(url: string | null | undefined): string | null {
  // printable ASCII, no backslash (WHATWG would turn "a\..\b.png" into a path ending in "b.png")
  if (!url || !/^[\x21-\x7e]+$/.test(url) || url.includes("\\")) return null;
  // Only a safe file name (verify findings C1 / suggestion of admin-sync-worker): it becomes part of a
  // stored URL (`emblemUrl`) and of an object key — never "..", "%2e", "?", "#", "\" or a space. Taken
  // from the URL's PATH (a query or fragment like "a.png?x=/b.png" never names the file), like the dump
  // script. Every emblem URL of the 2026-10-18 dump matches, so legitimate data maps as before.
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = path.match(/\/([A-Za-z0-9][A-Za-z0-9._-]*\.png)$/);
  return m && m[1] ? m[1] : null;
}

/** Stored absolute URL of a mirrored flag / emblem object (`<base>/emblems/<kind>/<hash>`). */
export function emblemUrl(r2Base: string, kind: "nationality" | "league" | "team", hash: string): string {
  return `${r2Base}/emblems/${kind}/${hash}`;
}

/** Slugify a pack / bundle name → stable, URL-safe, lowercase ASCII id. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "pack";
}

/** FeaturedBundle slug = name + release date (UTC), never the autoincrement id. */
export function bundleSlug(prefix: string, name: string, releaseDate: Date): string {
  return `${prefix}${slugify(name)}-${releaseDate.toISOString().slice(0, 10)}`;
}

/**
 * Pack.id for every pack name, in the given (first-seen dump) order: the slug of
 * the name. A few distinct names share a slug (dash vs en dash, apostrophes); the
 * second gets a "-2" suffix instead of being dropped.
 */
export function assignPackSlugs(names: Iterable<string>): Map<string, string> {
  const packNameToId = new Map<string, string>();
  const usedPackSlugs = new Set<string>();
  for (const name of names) {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; usedPackSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedPackSlugs.add(slug);
    packNameToId.set(name, slug);
  }
  return packNameToId;
}

/** efootbase `s_*` skill flag → fixture slug (packages/db/fixtures/skills.json). */
export function skillKeyToSlug(key: string): string {
  return SKILL_KEY_ALIASES[key] ?? key.replace(/^s_/, "").replace(/_/g, "-");
}

export const asInt = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;

/** Pack-name family used to cross-check card-type codes against players_meta.json. */
export function packFamily(featured: string | null | undefined): string | null {
  if (!featured || featured === "none") return null;
  if (/big time/i.test(featured)) return "Big Time";
  if (/strike arena/i.test(featured)) return "Strike Arena";
  if (/\bPOT[WDS]\b/i.test(featured)) return "POT*";
  if (/show time/i.test(featured)) return "Show Time";
  if (/highlight/i.test(featured)) return "Highlight";
  if (/selection/i.test(featured)) return "Selection";
  return null;
}
// Which card types a pack family may carry (efootbase's own classification).
export const PACK_FAMILY_TYPES: Readonly<Record<string, readonly CardType[]>> = {
  "Big Time": ["EPIC"],
  "Strike Arena": ["STRIKE_ARENA"],
  "POT*": ["TRENDING"],
  "Show Time": ["HIGHLIGHT"],
  "Highlight": ["HIGHLIGHT"],
  "Selection": ["HIGHLIGHT", "SELECTION"],
};

// ---- card-type map, validated against players_meta.json ----

export interface PlayersMeta {
  card_type?: { values?: string[] };
  pos?: { values?: string[] };
  condition?: { values?: string[] };
}

/** Codes whose meta label is unusable and is resolved from pack names instead
 *  (see CARD_TYPE_LABELS in @eflab/shared). The expected meta text is asserted so a
 *  changed dump is noticed. */
export const META_LABEL_OVERRIDES: Readonly<Record<number, string>> = { 4: "Legendary", 7: "" };

/** efootbase `card_type` code → CardType, after checking players_meta.json agrees
 *  (card-type labels, position order, condition letters). `metaPath` only names
 *  the file in error messages. Any disagreement throws. */
export function buildCardTypeMap(meta: PlayersMeta, metaPath: string): Map<number, CardType> {
  const values = meta.card_type?.values;
  if (!values) throw new Error(`${metaPath}: card_type.values missing`);
  const map = new Map<number, CardType>();
  const problems: string[] = [];
  for (const [codeStr, type] of Object.entries(CARD_TYPE_BY_EFOOTBASE_CODE)) {
    const code = Number(codeStr);
    const metaLabel = values[code];
    const expected = code in META_LABEL_OVERRIDES ? META_LABEL_OVERRIDES[code] : CARD_TYPE_LABELS[type];
    if (metaLabel !== expected) {
      problems.push(`code ${code}: players_meta says ${JSON.stringify(metaLabel)}, expected ${JSON.stringify(expected)} (${type})`);
    }
    map.set(code, type);
  }
  if (problems.length > 0) {
    throw new Error(`card-type map disagrees with ${metaPath}:\n  ${problems.join("\n  ")}`);
  }
  const posValues = meta.pos?.values;
  if (!posValues || posValues.join(",") !== POSITIONS.join(",")) {
    throw new Error(`${metaPath}: pos.values ${JSON.stringify(posValues)} != POSITIONS ${JSON.stringify(POSITIONS)}`);
  }
  const condValues = meta.condition?.values;
  if (!condValues || condValues.join(",") !== CONDITION_LETTERS.join(",")) {
    throw new Error(`${metaPath}: condition.values ${JSON.stringify(condValues)} != ${JSON.stringify(CONDITION_LETTERS)}`);
  }
  return map;
}

// ---- Booster rows ----

/** packages/db/fixtures/boosters.json entry. */
export interface FixtureBooster { id: number; nameEn: string; nameJa?: string; bonus: number[] }

/** Booster row from a fixture entry (`tier` = the fixture list it came from). */
export function boosterRowFromFixture(b: FixtureBooster, tier: "standard" | "basic"): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: b.id,
    name: b.nameEn,
    japName: b.nameJa ?? null,
    tier,
    magnitude: b.nameEn.includes("+1") ? 1 : b.nameEn.includes("+2") ? 2
      : b.nameEn.includes("+3") ? 3 : b.nameEn.includes("+4") ? 4 : 0,
  };
  for (let i = 0; i < BOOSTER_BONUS_COLUMNS.length && i < b.bonus.length; i++) {
    row[BOOSTER_BONUS_COLUMNS[i]!] = b.bonus[i] ?? 0;
  }
  return row;
}

/** Booster row from an inline dump booster object; an unknown stat key throws. */
export function boosterRowFromDump(bid: number, bobj: BoosterObj): Record<string, unknown> {
  const add = asInt(bobj.add, 0);
  const statEntries = Object.entries(bobj.stats ?? {})
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .sort((a, b) => b[1] - a[1]);
  const row: Record<string, unknown> = {
    id: bid,
    // "Booster +4 · Jump, SetPiece, Finish, KickPow" — first four stats by
    // magnitude, "+N" for the rest (all-round boosters bump 20+ stats).
    name: statEntries.length > 0
      ? `Booster +${add} · ${statEntries.slice(0, 4).map(([k]) => BOOSTER_STAT_LABEL[k] ?? k).join(", ")}${
        statEntries.length > 4 ? ` +${statEntries.length - 4}` : ""}`
      : `Booster +${add}`,
    japName: null,
    tier: "standard",
    magnitude: add,
  };
  for (const col of BOOSTER_BONUS_COLUMNS) row[col] = 0;
  for (const [key, v] of statEntries) {
    const col = BOOSTER_STAT_MAP[key];
    if (!col) throw new Error(`booster ${bid}: unknown stat key "${key}" (add it to STAT_MAP / BOOSTER_STAT_LABEL)`);
    row[col] = v;
  }
  return row;
}

/** The two booster objects a dump row carries, as [id, object] pairs (absent ones skipped). */
export function rowBoosters(r: EfbRow): Array<[number, BoosterObj]> {
  const out: Array<[number, BoosterObj]> = [];
  for (const [bid, bobj] of [[r.booster_id, r.booster], [r.booster2_id, r.booster2]] as Array<[number | null | undefined, BoosterObj | null | undefined]>) {
    if (bid == null || bobj == null) continue;
    out.push([bid, bobj]);
  }
  return out;
}

// ---- Player row ----

/** Map one dump row to the Player columns the seeder owns. A registered-position
 *  aptitude that is not "registered" (2) is appended to `aptitudeMismatch` (the
 *  caller aborts on any); a bad `pos` or `condition` throws. */
export function buildPlayerRow(
  r: EfbRow,
  pid: bigint,
  cardTypeByCode: Map<number, CardType>,
  countryNameToId: Map<string, number>,
  teamNameToId: Map<string, number>,
  packNameToId: Map<string, string>,
  aptitudeMismatch: string[],
): Record<string, unknown> {
  const pos = r.pos;
  if (typeof pos !== "number" || pos < 0 || pos >= POSITIONS.length) {
    throw new Error(`row id=${r.id}: pos ${String(pos)} out of range`);
  }
  if (r[APTITUDE_KEYS[pos]!] !== 2) aptitudeMismatch.push(`id=${r.id} pos=${pos} ${APTITUDE_KEYS[pos]}=${String(r[APTITUDE_KEYS[pos]!])}`);

  const condIdx = r.condition;
  const condition = typeof condIdx === "number" ? CONDITION_LETTERS[condIdx] : undefined;
  if (!condition) throw new Error(`row id=${r.id}: condition ${String(condIdx)} not in [0..4]`);

  const ovr = asInt(r.overall_rating, 40);
  const maxAttrs = r.max_attributes ?? {};
  const row: Record<string, unknown> = {
    id: pid,
    baseId: BigInt(r.base_id ?? r.id),
    name: r.name ?? "Unknown",
    nameNormalized: r.name_normalized ?? null,
    accentedName: null,
    japName: r.name_ja ?? null,
    chineseName: r.name_zh ?? null,
    shirt: r.shirt_number != null ? String(r.shirt_number) : null,
    shirtNational: null,
    nationalityId: r.nationality ? (countryNameToId.get(r.nationality) ?? 0) : 0,
    country2Id: null,
    height: asInt(r.height, 170),
    weight: asInt(r.weight, 70),
    age: asInt(r.age, 25),
    strongerFoot: asInt(r.foot, 0),
    registeredPosition: pos,
    playingStyleAttack: asInt(r.playing_style, 0),
    playingStyleDefense: asInt(r.playing_style_2, 0),
    cardType: cardTypeByCode.get(r.card_type ?? 0)!,
    featuredPackId: r.featured && r.featured !== "none" ? (packNameToId.get(r.featured) ?? null) : null,
    dreamTeam: r.dream_team === 1,
    teamId: r.team_name ? (teamNameToId.get(r.team_name) ?? null) : null,
    ovr,
    maxOvr: asInt(r.overall_at_max_level, ovr),
    condition,
    form: asInt(r.form, 1),
    injuryResistance: asInt(r.injury_resistance, 1),
    weakFootUsage: asInt(r.weak_foot_usage, 0),
    weakFootAccuracy: asInt(r.weak_foot_accuracy, 0),
    releaseDate: r.time_added ? new Date(r.time_added * 1000) : null,
    datapackId: 20251204,
    levelCap: asInt(r.max_level, 50),
    cost: 0,
    variation: 0,
    marketValue: asInt(r.player_value, 0),
    boosterId1: r.booster_id ?? null,
    boosterId2: r.booster2_id ?? null,
    views: asInt(r.views, 0),
    ratingCount: asInt(r.ratingCount, 0),
    avgRating: typeof r.avgRating === "number" ? r.avgRating : null,
  };
  for (const [key, col] of Object.entries(STAT_MAP)) {
    row[col] = asInt(r[key], 40);
    row[maxColumn(col)] = asInt(maxAttrs[key], 40);
  }
  for (let k = 0; k < POSITIONS.length; k++) {
    row[APTITUDE_COLUMNS[k]!] = invertAptitude(asInt(r[APTITUDE_KEYS[k]!], 0));
  }
  for (const [key, col] of Object.entries(PHYSIQUE_MAP)) row[col] = asInt(r[key], 5);
  for (const [key, col] of Object.entries(DERIVED_MAP)) {
    const v = r[key];
    row[col] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  for (const [key, col] of Object.entries(PLAYSTYLE_MAP)) row[col] = Boolean(r[key]);
  return row;
}
