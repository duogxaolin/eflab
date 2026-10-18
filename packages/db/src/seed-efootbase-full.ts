// Full seed from the efootbase dump → Postgres.
// Reads dump/efootbase/players.jsonl (50.691 players × 176 cols, efootbase schema),
// dump/efootbase/players_meta.json (field labels — card-type validation) and
// dump/efootbase/packs.json (featured bundles), plus the committed fixtures
// (skills, leagues, managers, boosters).
//
// Run:  pnpm db:seed            (seed only — keeps whatever the cross-fill wrote)
//       pnpm db:refresh         (seed, then pnpm db:crossfill — the documented refresh)
// Flags: --reset-users  also wipe User/Session/Account (never done by default;
//                       the user-content tables were dropped in change
//                       remove-dead-surface)
//        --prune        delete Player rows that are not in the dump (e.g. the 3
//                       eFHUB-only players the cross-fill inserts); default: keep + log
//
// Guarantees (openspec eflab-parity-fixes, efootbase-data-integrity):
//   · one interactive transaction — a failure leaves the previous catalogue intact;
//   · Player / Manager are upserted (INSERT … ON CONFLICT DO UPDATE) over a column
//     list generated from the Prisma model minus CROSSFILL_COLUMNS, so columns the
//     eFHUB cross-fill owns (reputation, overallPotential, gkClearing, maxGkClearing,
//     stars, communityTier, ratingGK…ratingCF) survive a re-seed;
//   · Country / League / Team / Pack / PackCard / Skill / PlayerSkill /
//     FeaturedBundle(+Card) are replaced inside the same transaction. None of their
//     foreign keys reach a user table (Team→Player is ON DELETE SET NULL and the
//     players are re-pointed in the same transaction), so user data is untouched;
//   · Booster is upserted by id, dump objects win over fixtures;
//   · the JSONL is streamed twice (lookups, then writes) instead of held in memory;
//   · every field is mapped from the key that actually exists in the dump — see
//     STAT_MAP (jumping, set_piece_taking, tackling), `pos`, `condition`,
//     `injury_resistance`, `player_value`, `leg_length_height`, `name_normalized`;
//   · unmatched `s_*` skill keys, card-type codes that disagree with
//     players_meta.json / pack names, and unknown booster stat keys abort the seed.

import { createReadStream, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CARD_TYPE_BY_EFOOTBASE_CODE,
  CARD_TYPE_LABELS,
  POSITIONS,
  type CardType,
} from "@eflab/shared";
import { prisma, Prisma } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = resolve(__dirname, "../../../dump/efootbase");
const JSONL_PATH = process.env.EFOOTBASE_DUMP_PATH ?? resolve(DUMP_DIR, "players.jsonl");
const META_PATH = process.env.EFOOTBASE_META_PATH ?? resolve(DUMP_DIR, "players_meta.json");
const PACKS_PATH = process.env.EFOOTBASE_PACKS_PATH ?? resolve(DUMP_DIR, "packs.json");
const FIXTURES_DIR = resolve(__dirname, "../fixtures");

const R2_BASE = process.env.R2_PUBLIC_BASE
  ?? process.env.NEXT_PUBLIC_R2_PUBLIC_BASE
  ?? "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";

const ARGS = new Set(process.argv.slice(2));
const RESET_USERS = ARGS.has("--reset-users");
const PRUNE = ARGS.has("--prune");

const BATCH_SIZE = 500;          // players per upsert statement (one jsonb parameter)
const LOG_EVERY = 5000;
const TX_TIMEOUT_MS = 60 * 60 * 1000; // the whole seed runs in one transaction

// ---- efootbase jsonl row shape (only fields we touch) ----
interface BoosterObj { name?: string; add?: number; stats?: Record<string, number> }
interface EfbRow {
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
const STAT_MAP: Readonly<Record<string, string>> = {
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
const maxColumn = (base: string): string => `max${base.charAt(0).toUpperCase()}${base.slice(1)}`;

// Booster `stats` keys: the 26 stat keys above plus weak_foot_accuracy.
const BOOSTER_STAT_MAP: Readonly<Record<string, string>> = {
  ...STAT_MAP,
  weak_foot_accuracy: "weakFootAccuracy",
};
// Short human-readable labels for the synthesized booster name ("Booster +4 · Jump, SetPiece").
const BOOSTER_STAT_LABEL: Readonly<Record<string, string>> = {
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
const BOOSTER_BONUS_COLUMNS = [
  "offensiveAwareness","ballControl","tightPossession","dribbling","lowPass","loftedPass",
  "finishing","placeKicking","curl","heading","defensiveAwareness","defensiveEngagement",
  "ballWinning","aggression","kickingPower","speed","acceleration","balance",
  "physicalContact","jump","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach",
  "stamina","weakFootAccuracy",
] as const;

const PHYSIQUE_MAP: Readonly<Record<string, string>> = {
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
const DERIVED_MAP: Readonly<Record<string, string>> = {
  leg_coverage_radius: "legCoverage",
  arm_coverage_radius: "armCoverage",
  jump_height: "peakJumpHeight",
  torso_collision: "torsoCollisionWidth",
  leg_length_height: "dribbleHeight",
};

const PLAYSTYLE_MAP: Readonly<Record<string, string>> = {
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
const APTITUDE_KEYS = POSITIONS.map((p) => p.toLowerCase());
const APTITUDE_COLUMNS = POSITIONS.map((p) => `pos${p}`);
const invertAptitude = (v: number): number => (v === 2 ? 0 : v === 0 ? 2 : 1);

// players_meta.json `condition.values` is [E, D, C, B, A]; the seeder asserts it.
const CONDITION_LETTERS = ["E", "D", "C", "B", "A"] as const;

// efootbase `s_*` keys whose kebab form is not the fixture slug.
const SKILL_KEY_ALIASES: Readonly<Record<string, string>> = {
  s_heading: "s-heading",
  s_phenomenal_pass: "phenomenal-passing",
  s_acrobatic_clearance: "acrobatic-clear",
  s_rising_shot: "rising-shots",
};

// Columns the eFHUB cross-fill owns (seed-efhub-crossfill.ts). Never written here:
// omitted from the INSERT column list (defaults apply on first insert) and from the
// ON CONFLICT update list (existing values survive a re-seed).
export const PLAYER_CROSSFILL_COLUMNS: ReadonlySet<string> = new Set([
  "reputation", "overallPotential", "gkClearing", "maxGkClearing", "stars", "communityTier",
  ...POSITIONS.map((p) => `rating${p}`),
]);
export const MANAGER_CROSSFILL_COLUMNS: ReadonlySet<string> = new Set([
  "age", "country", "adaptability", "affinity", "marketValue",
  "possessionGame", "quickCounter", "longBallCounter", "outWide", "longBall", "overload",
]);

// ---- Generic upsert over a model-derived column list ----

type ScalarField = { name: string; kind: string; type: string; isRequired: boolean; hasDefaultValue: boolean; default?: unknown };
type Tx = Prisma.TransactionClient;

function modelScalarFields(model: string): ScalarField[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  if (!m) throw new Error(`model ${model} not in Prisma DMMF`);
  return m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum") as ScalarField[];
}

/** Postgres type for a Prisma scalar — used in the jsonb_to_recordset column list. */
function pgType(f: ScalarField): string {
  if (f.kind === "enum") return `"${f.type}"`;
  switch (f.type) {
    case "BigInt": return "int8";
    case "Int": return "int4";
    case "Float": return "float8";
    case "Boolean": return "bool";
    case "String": return "text";
    case "DateTime": return "timestamp(3)";
    case "Json": return "jsonb";
    default: throw new Error(`unsupported scalar type ${f.type} on ${f.name}`);
  }
}

/** Value for a column the row did not set: the literal @default, else NULL for optional. */
function defaultFor(model: string, f: ScalarField): unknown {
  if (f.hasDefaultValue && f.default !== undefined && typeof f.default !== "object") return f.default;
  if (f.hasDefaultValue && typeof f.default === "object" && f.default !== null
      && (f.default as { name?: string }).name === "now") return new Date();
  if (!f.isRequired) return null;
  throw new Error(`${model}.${f.name} is required, has no literal default and the seeder did not set it`);
}

/**
 * INSERT … ON CONFLICT ("id") DO UPDATE for `rows`, over every scalar column of
 * `model` except `excludedColumns`. Rows go in as ONE bound jsonb parameter
 * (jsonb_to_recordset), so there is no string splicing and no bind-count limit.
 * Columns the row object does not set get the model default. Unknown keys abort.
 */
function makeUpserter(model: string, table: string, excludedColumns: ReadonlySet<string>) {
  const fields = modelScalarFields(model).filter((f) => !excludedColumns.has(f.name));
  const known = new Set(fields.map((f) => f.name));
  const colList = fields.map((f) => `"${f.name}"`).join(", ");
  const defList = fields.map((f) => `"${f.name}" ${pgType(f)}`).join(", ");
  const setList = fields.filter((f) => f.name !== "id").map((f) => `"${f.name}" = EXCLUDED."${f.name}"`).join(", ");
  const sql = `INSERT INTO "${table}" (${colList})
    SELECT ${colList} FROM jsonb_to_recordset($1::jsonb) AS t(${defList})
    ON CONFLICT ("id") DO UPDATE SET ${setList}`;
  const serialize = (_k: string, v: unknown): unknown => {
    if (typeof v === "bigint") {
      if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) {
        // JSON numbers must stay exact; Konami ids are 15 digits (< 2^53).
        throw new Error(`${model}: bigint ${v} exceeds JSON safe integer range`);
      }
      return Number(v);
    }
    return v;
  };
  return {
    columns: fields.map((f) => f.name),
    async run(tx: Tx, rows: Array<Record<string, unknown>>): Promise<void> {
      if (rows.length === 0) return;
      const complete = rows.map((row) => {
        for (const k of Object.keys(row)) {
          if (!known.has(k)) {
            throw new Error(excludedColumns.has(k)
              ? `${model}.${k} is cross-fill-owned; the seeder must not write it`
              : `${model}.${k} is not a scalar column of the model`);
          }
        }
        const out: Record<string, unknown> = {};
        for (const f of fields) {
          const v = row[f.name];
          out[f.name] = v === undefined ? defaultFor(model, f) : v;
        }
        return out;
      });
      await tx.$executeRawUnsafe(sql, JSON.stringify(complete, serialize));
    },
  };
}

// ---- helpers ----

/** Trailing `hash.png` of an efootbase CDN URL (flag / emblem file names are SHA256 hashes). */
function basename(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/([^/]+\.png)$/);
  return m && m[1] ? m[1] : null;
}

/** Slugify a pack / bundle name → stable, URL-safe, lowercase ASCII id. */
function slugify(s: string): string {
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
function bundleSlug(prefix: string, name: string, releaseDate: Date): string {
  return `${prefix}${slugify(name)}-${releaseDate.toISOString().slice(0, 10)}`;
}

function skillKeyToSlug(key: string): string {
  return SKILL_KEY_ALIASES[key] ?? key.replace(/^s_/, "").replace(/_/g, "-");
}

const asInt = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;

/** Pack-name family used to cross-check card-type codes against players_meta.json. */
function packFamily(featured: string | null | undefined): string | null {
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
const PACK_FAMILY_TYPES: Readonly<Record<string, readonly CardType[]>> = {
  "Big Time": ["EPIC"],
  "Strike Arena": ["STRIKE_ARENA"],
  "POT*": ["TRENDING"],
  "Show Time": ["HIGHLIGHT"],
  "Highlight": ["HIGHLIGHT"],
  "Selection": ["HIGHLIGHT", "SELECTION"],
};

async function* jsonlRows(path: string): AsyncGenerator<EfbRow> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as EfbRow;
  }
}

// ---- card-type map, validated against players_meta.json ----

interface PlayersMeta {
  card_type?: { values?: string[] };
  pos?: { values?: string[] };
  condition?: { values?: string[] };
}

/** Codes whose meta label is unusable and is resolved from pack names instead
 *  (see CARD_TYPE_LABELS in @eflab/shared). The expected meta text is asserted so a
 *  changed dump is noticed. */
const META_LABEL_OVERRIDES: Readonly<Record<number, string>> = { 4: "Legendary", 7: "" };

function buildCardTypeMap(meta: PlayersMeta): Map<number, CardType> {
  const values = meta.card_type?.values;
  if (!values) throw new Error(`${META_PATH}: card_type.values missing`);
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
    throw new Error(`card-type map disagrees with ${META_PATH}:\n  ${problems.join("\n  ")}`);
  }
  const posValues = meta.pos?.values;
  if (!posValues || posValues.join(",") !== POSITIONS.join(",")) {
    throw new Error(`${META_PATH}: pos.values ${JSON.stringify(posValues)} != POSITIONS ${JSON.stringify(POSITIONS)}`);
  }
  const condValues = meta.condition?.values;
  if (!condValues || condValues.join(",") !== CONDITION_LETTERS.join(",")) {
    throw new Error(`${META_PATH}: condition.values ${JSON.stringify(condValues)} != ${JSON.stringify(CONDITION_LETTERS)}`);
  }
  return map;
}

// ---- main ----

async function main(): Promise<void> {
  console.log(`seed-efootbase-full: reading ${JSONL_PATH}`);
  console.log(`  R2 base: ${R2_BASE}${RESET_USERS ? " | --reset-users" : ""}${PRUNE ? " | --prune" : ""}`);
  const t0 = Date.now();
  for (const p of [JSONL_PATH, META_PATH]) {
    if (!existsSync(p)) throw new Error(`missing ${p}`);
  }

  const meta = JSON.parse(readFileSync(META_PATH, "utf-8")) as PlayersMeta;
  const cardTypeByCode = buildCardTypeMap(meta);

  // ── Fixtures ───────────────────────────────────────────────────────────
  const skillsFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "skills.json"), "utf-8")) as {
    skills: Array<{ id: number; slug: string; name: string; description: string; category: string }>;
  };
  const slugToSkillId = new Map(skillsFixture.skills.map((s) => [s.slug, s.id]));
  const leaguesFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "leagues.json"), "utf-8")) as {
    leagues: Record<string, { name: string; region: string }>;
  };
  const managersFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "managers.json"), "utf-8")) as Array<{
    id: string; name: string; rating?: number; booster_1?: string; booster_2?: string; image?: string;
  }>;
  const boostersFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "boosters.json"), "utf-8")) as {
    standard: Array<{ id: number; nameEn: string; nameJa?: string; bonus: number[] }>;
    basic: Array<{ id: number; nameEn: string; nameJa?: string; bonus: number[] }>;
  };

  // ── Pass 1: stream the dump for lookups (no rows kept) ──────────────────
  console.log("pass 1: scanning dump for Country/Team/League/Pack/Booster/skill keys…");
  const nationalityName = new Map<string, { hash: string | null }>();
  const teamName = new Map<string, { hash: string | null; nationality: string | null; league: number | null }>();
  const leagueEmblemHash = new Map<number, string>();
  const featuredPack = new Map<string, { time: number; type: string }>();
  const boosterDump = new Map<number, BoosterObj>();
  const skillKeys = new Set<string>();
  const dumpIds = new Set<number>();
  const cardTypeCount = new Map<number, number>();
  const packFamilyDisagreements = new Map<string, number>();
  const bundleIdSet = new Set<string>();
  let rowCount = 0;

  for await (const r of jsonlRows(JSONL_PATH)) {
    if (typeof r.id !== "number" || !Number.isSafeInteger(r.id)) throw new Error(`row ${rowCount}: bad id ${String(r.id)}`);
    rowCount++;
    dumpIds.add(r.id);
    bundleIdSet.add(String(r.id));
    for (const k of Object.keys(r)) if (k.startsWith("s_")) skillKeys.add(k);

    if (r.nationality && !nationalityName.has(r.nationality)) {
      nationalityName.set(r.nationality, { hash: basename(r.emblem_images?.nationality ?? null) });
    }
    if (r.team_name && !teamName.has(r.team_name)) {
      teamName.set(r.team_name, {
        hash: basename(r.emblem_images?.team ?? null),
        nationality: r.nationality ?? null,
        league: r.league ?? null,
      });
    }
    if (r.league != null && !leagueEmblemHash.has(r.league)) {
      const h = basename(r.emblem_images?.league ?? null);
      if (h) leagueEmblemHash.set(r.league, h);
    }
    const feat = r.featured ?? null;
    if (feat && feat !== "none" && !featuredPack.has(feat)) {
      const isSpecial = /strike arena|j\.league|selection/i.test(feat);
      featuredPack.set(feat, { time: r.time_added ?? 0, type: isSpecial ? "special_list" : "pack" });
    }
    for (const [bid, bobj] of [[r.booster_id, r.booster], [r.booster2_id, r.booster2]] as Array<[number | null | undefined, BoosterObj | null | undefined]>) {
      if (bid == null || bobj == null) continue;
      if (!boosterDump.has(bid)) boosterDump.set(bid, bobj);
    }

    // Card-type code validation: known code + pack-name family agreement.
    const code = r.card_type ?? 0;
    const type = cardTypeByCode.get(code);
    if (!type) throw new Error(`row id=${r.id}: card_type ${code} has no CardType (CARD_TYPE_BY_EFOOTBASE_CODE)`);
    cardTypeCount.set(code, (cardTypeCount.get(code) ?? 0) + 1);
    const family = packFamily(feat);
    if (family && !PACK_FAMILY_TYPES[family]!.includes(type)) {
      const key = `${family} pack → ${type} (code ${code})`;
      packFamilyDisagreements.set(key, (packFamilyDisagreements.get(key) ?? 0) + 1);
    }
  }
  if (packFamilyDisagreements.size > 0) {
    throw new Error(`card-type map disagrees with pack names:\n  ${
      [...packFamilyDisagreements].map(([k, n]) => `${k}: ${n} cards`).join("\n  ")}`);
  }
  console.log(`  rows: ${rowCount} | countries: ${nationalityName.size} | teams: ${teamName.size} | leagues: ${leagueEmblemHash.size} | packs: ${featuredPack.size} | boosters: ${boosterDump.size} | s_* keys: ${skillKeys.size}`);
  console.log(`  card types: ${[...cardTypeCount].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${c}=${cardTypeByCode.get(c)}:${n}`).join(" ")}`);

  // s_* key → Skill id. Any unmatched key is a hard error (spec: no skill flag dropped).
  const skillKeyToId = new Map<string, number>();
  const unmatchedSkillKeys: string[] = [];
  for (const k of [...skillKeys].sort()) {
    const id = slugToSkillId.get(skillKeyToSlug(k));
    if (id == null) unmatchedSkillKeys.push(k);
    else skillKeyToId.set(k, id);
  }
  if (unmatchedSkillKeys.length > 0) {
    throw new Error(`${unmatchedSkillKeys.length} s_* keys match no slug in fixtures/skills.json: ${unmatchedSkillKeys.join(", ")}`);
  }
  console.log(`  skills matched: ${skillKeyToId.size}/${skillKeys.size} (fixture has ${skillsFixture.skills.length})`);

  // Lookup ids (sequential, in first-seen dump order → stable across runs).
  const countryNameToId = new Map([...nationalityName.keys()].map((n, i) => [n, i + 1]));
  const teamNameToId = new Map([...teamName.keys()].map((n, i) => [n, i + 1]));
  // Pack.id = slug of the pack name. A few distinct names share a slug (dash vs en
  // dash, apostrophes); the second gets a "-2" suffix instead of being dropped.
  const packNameToId = new Map<string, string>();
  const usedPackSlugs = new Set<string>();
  for (const name of featuredPack.keys()) {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; usedPackSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedPackSlugs.add(slug);
    packNameToId.set(name, slug);
  }

  // ── Booster rows: fixtures (standard first, basic fills gaps) then dump wins ──
  const boosterRows = new Map<number, Record<string, unknown>>();
  for (const tier of ["standard", "basic"] as const) {
    for (const b of boostersFixture[tier]) {
      if (boosterRows.has(b.id)) continue; // ids 0,16–26 appear in both fixture tiers; standard wins
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
      boosterRows.set(b.id, row);
    }
  }
  for (const [bid, bobj] of boosterDump) {
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
    boosterRows.set(bid, row); // dump wins over a fixture row with the same id
  }

  // ── Upserters (column lists derived from the Prisma model) ──────────────
  const playerUpsert = makeUpserter("Player", "Player", PLAYER_CROSSFILL_COLUMNS);
  const managerUpsert = makeUpserter("Manager", "Manager", MANAGER_CROSSFILL_COLUMNS);
  const boosterUpsert = makeUpserter("Booster", "Booster", new Set());
  console.log(`  Player upsert columns: ${playerUpsert.columns.length} (cross-fill-owned excluded: ${PLAYER_CROSSFILL_COLUMNS.size})`);

  // ── Transaction: everything below is atomic ─────────────────────────────
  const stats = { players: 0, playerSkills: 0, packCards: 0, bundles: 0, bundleCards: 0, aptitudeMismatch: [] as string[] };
  await prisma.$transaction(async (tx) => {
    if (RESET_USERS) {
      // Session and Account hang off User with ON DELETE CASCADE.
      const { count } = await tx.user.deleteMany({});
      console.log(`  --reset-users: deleted ${count} users (+ sessions, accounts)`);
    }

    // Replace the catalogue tables. Order respects foreign keys; Team→Player is
    // ON DELETE SET NULL and every player is re-pointed by the upsert below.
    console.log("phase 1: replacing Skill/Country/League/Team/Pack (+ join tables)…");
    await tx.playerSkill.deleteMany({});
    await tx.packCard.deleteMany({});
    await tx.featuredBundleCard.deleteMany({});
    await tx.pack.deleteMany({});
    await tx.skill.deleteMany({});
    await tx.team.deleteMany({});
    await tx.league.deleteMany({});
    await tx.country.deleteMany({});

    await tx.skill.createMany({
      data: skillsFixture.skills.map((s) => ({ id: s.id, slug: s.slug, name: s.name, description: s.description, category: s.category })),
    });
    await tx.league.createMany({
      data: Object.entries(leaguesFixture.leagues).map(([oid, info]) => {
        const id = Number(oid);
        const hash = leagueEmblemHash.get(id);
        return { id, name: info.name, region: info.region, emblemUrl: hash ? `${R2_BASE}/emblems/league/${hash}` : null };
      }),
    });
    await tx.country.createMany({
      data: [...nationalityName.entries()].map(([name, { hash }]) => ({
        id: countryNameToId.get(name)!,
        name,
        flagUrl: hash ? `${R2_BASE}/emblems/nationality/${hash}` : null,
      })),
    });
    await tx.team.createMany({
      data: [...teamName.entries()].map(([name, { hash, nationality, league }]) => ({
        id: teamNameToId.get(name)!,
        name,
        national: nationality != null && nationality === name,
        emblemUrl: hash ? `${R2_BASE}/emblems/team/${hash}` : null,
        countryId: nationality ? (countryNameToId.get(nationality) ?? null) : null,
        leagueId: league ?? null,
      })),
    });
    await tx.pack.createMany({
      data: [...featuredPack.entries()].map(([name, info]) => ({
        id: packNameToId.get(name)!,
        name,
        releaseDate: info.time > 0 ? new Date(info.time * 1000) : new Date(),
        type: info.type,
        playerCount: 0,
      })),
    });
    console.log(`  skills ${skillsFixture.skills.length} | leagues ${Object.keys(leaguesFixture.leagues).length} | countries ${countryNameToId.size} | teams ${teamNameToId.size} | packs ${packNameToId.size}`);

    // Manager (65 efootbase APK fixtures) — upsert; tactic columns stay cross-fill-owned.
    await managerUpsert.run(tx, managersFixture.map((m) => ({
      id: BigInt(m.id),
      name: m.name,
      rating: m.rating ?? 0,
      booster1Stat: m.booster_1 ?? null,
      booster2Stat: m.booster_2 ?? null,
      imageUrl: m.image ? `${R2_BASE}/managers/${m.image}` : null,
    })));
    // Booster — upsert by id, dump wins.
    await boosterUpsert.run(tx, [...boosterRows.values()]);
    console.log(`  managers upserted ${managersFixture.length} | boosters upserted ${boosterRows.size} (dump ${boosterDump.size})`);

    // ── Pass 2: stream players → upsert + PlayerSkill + PackCard ──────────
    console.log(`phase 2: upserting ${rowCount} players in batches of ${BATCH_SIZE}…`);
    let playerBatch: Array<Record<string, unknown>> = [];
    let skillBatch: Array<{ playerId: bigint; skillId: number }> = [];
    let packCardBatch: Array<{ packId: string; playerId: bigint }> = [];
    const flush = async (): Promise<void> => {
      await playerUpsert.run(tx, playerBatch);
      if (skillBatch.length > 0) await tx.playerSkill.createMany({ data: skillBatch, skipDuplicates: true });
      if (packCardBatch.length > 0) await tx.packCard.createMany({ data: packCardBatch, skipDuplicates: true });
      stats.players += playerBatch.length;
      stats.playerSkills += skillBatch.length;
      stats.packCards += packCardBatch.length;
      playerBatch = []; skillBatch = []; packCardBatch = [];
      if (stats.players % LOG_EVERY === 0 || stats.players === rowCount) {
        console.log(`  ${stats.players}/${rowCount} players | skills ${stats.playerSkills} | packCards ${stats.packCards} | ${(Date.now() - t0) / 1000 | 0}s`);
      }
    };

    for await (const r of jsonlRows(JSONL_PATH)) {
      const pid = BigInt(r.id);
      const row = buildPlayerRow(r, pid, cardTypeByCode, countryNameToId, teamNameToId, packNameToId, stats.aptitudeMismatch);
      playerBatch.push(row);
      for (const [key, skillId] of skillKeyToId) {
        if (r[key]) skillBatch.push({ playerId: pid, skillId });
      }
      if (row.featuredPackId) packCardBatch.push({ packId: row.featuredPackId as string, playerId: pid });
      if (playerBatch.length >= BATCH_SIZE) await flush();
    }
    if (playerBatch.length > 0) await flush();
    if (stats.aptitudeMismatch.length > 0) {
      throw new Error(`${stats.aptitudeMismatch.length} rows whose aptitude at \`pos\` is not "registered" (2): ${stats.aptitudeMismatch.slice(0, 5).join("; ")}`);
    }

    // Pack.playerCount from the PackCard rows just written.
    await tx.$executeRaw`UPDATE "Pack" p SET "playerCount" = c.n
      FROM (SELECT "packId", COUNT(*)::int AS n FROM "PackCard" GROUP BY "packId") c
      WHERE c."packId" = p.id`;

    // ── FeaturedBundle (efootbase /api/packs: 17 specialPlayerList + 7 spotlights) ──
    // Upsert by slug (name + release date) so ids stay stable; bundles no longer in
    // the dump are removed; cards are rewritten in efootbase `list` order.
    if (existsSync(PACKS_PATH)) {
      console.log("phase 3: FeaturedBundle from specialPlayerList + spotlights…");
      const packsDump = JSON.parse(readFileSync(PACKS_PATH, "utf-8")) as {
        data: {
          specialPlayerList: Array<{ name: string; time: number; list: number[] }>;
          packs: Array<{ name: string; time: number; list: number[] }>;
        };
      };
      const entries = [
        ...(packsDump.data?.specialPlayerList ?? []).map((s) => ({ ...s, prefix: "" })),
        ...(packsDump.data?.packs ?? []).map((s) => ({ ...s, prefix: "spotlight-" })),
      ];
      const keepSlugs: string[] = [];
      for (let i = 0; i < entries.length; i++) {
        const s = entries[i]!;
        const releaseDate = s.time > 0 ? new Date(s.time * 1000) : new Date(0);
        const slug = bundleSlug(s.prefix, s.name, releaseDate);
        keepSlugs.push(slug);
        const bundle = await tx.featuredBundle.upsert({
          where: { slug },
          create: { name: s.name, slug, releaseDate, position: i },
          update: { name: s.name, releaseDate, position: i },
        });
        const cardRows = s.list
          .map((pid, ordinal) => ({ pid, ordinal }))
          .filter(({ pid }) => pid != null && bundleIdSet.has(String(pid)))
          .map(({ pid, ordinal }) => ({ bundleId: bundle.id, playerId: BigInt(pid), ordinal }));
        if (cardRows.length > 0) {
          await tx.featuredBundleCard.createMany({ data: cardRows, skipDuplicates: true });
          stats.bundleCards += cardRows.length;
        }
        stats.bundles++;
      }
      const { count: removed } = await tx.featuredBundle.deleteMany({ where: { slug: { notIn: keepSlugs } } });
      console.log(`  bundles ${stats.bundles} | cards ${stats.bundleCards} | stale bundles removed ${removed}`);
    } else {
      console.log(`  ⚠ ${PACKS_PATH} missing — FeaturedBundle left as is`);
    }

    // ── Players not in the dump (e.g. the 3 eFHUB-only cards) ─────────────
    const extra = (await tx.player.findMany({ select: { id: true, name: true } }))
      .filter((p) => !dumpIds.has(Number(p.id)));
    if (extra.length > 0) {
      const sample = extra.slice(0, 5).map((p) => `${p.name} (${p.id})`).join(", ");
      if (PRUNE) {
        const { count } = await tx.player.deleteMany({ where: { id: { in: extra.map((p) => p.id) } } });
        console.log(`  --prune: deleted ${count} players not in the dump: ${sample}`);
      } else {
        console.log(`  kept ${extra.length} players not in the dump (pass --prune to delete): ${sample}`);
      }
    }
  }, { timeout: TX_TIMEOUT_MS, maxWait: 30_000 });

  console.log(`\nseed-efootbase-full: done in ${(Date.now() - t0) / 1000 | 0}s`);
  console.log(`  players ${stats.players} | playerSkills ${stats.playerSkills} | packCards ${stats.packCards} | bundles ${stats.bundles}`);
  console.log("  NOTE: db:seed does not refresh cross-fill data (manager tactics, reputation,");
  console.log("        overallPotential, gkClearing, stars, tier badges, per-position ratings,");
  console.log("        the 3 eFHUB-only players). Run `pnpm db:refresh` (seed + cross-fill).");
  await prisma.$disconnect();
}

/** Map one dump row to the Player columns the seeder owns. */
function buildPlayerRow(
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

main().catch((e) => {
  console.error("seed-efootbase-full: FAILED (transaction rolled back)", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
