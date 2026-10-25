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
//   · static efootbase snapshot (openspec efootbase-static-data, optional, git-ignored
//     dump/efootbase/static/ — docs/efootbase-static-snapshot.md): skills.json adds
//     name, description, group, order, icon key, stat effects and activation to the
//     fixture skills (the fixture slug stays the join key); managers.json marks the
//     picker managers. Both are parsed and validated BEFORE the transaction opens —
//     an unknown effect / pill stat, an unmapped skill key or a manager that
//     disagrees with fixtures/managers.json aborts with the database unchanged. A
//     missing file is a warning, not an error.
//   · the row mapping (field maps, card-type map, skill keys, booster rows, URL
//     helpers, cross-fill column sets) lives in efootbase-map.ts and the upsert in
//     upsert.ts, shared with the sync worker (openspec admin-sync-worker): one
//     mapping for every efootbase write path. The four location variables below
//     (EFOOTBASE_DUMP_PATH / _META_PATH / _PACKS_PATH / _STATIC_DIR) let a staging
//     directory be seeded; nothing is written there.
//   · openspec efootbase-data-refresh-1024: every card stores its own league
//     (`leagueId` = dump `league` when it is one of the fixture leagues this seed
//     writes, else NULL); the picker managers get their 0-based snapshot position
//     (`pickerOrder`, the same UPDATE as `inPicker`); the single CatalogueMeta row
//     gets the dump's date from the `manifest.json` next to the dump
//     (`dumpedAt`, the date of the community ratings — a manifest without a strict
//     UTC date keeps the stored one, with a notice) and the seed's commit time.

import { createReadStream, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { type BaseStat } from "@eflab/shared";
import { prisma, Prisma } from "./client.js";
import {
  MANAGER_CROSSFILL_COLUMNS,
  MANAGER_STATIC_COLUMNS,
  PACK_FAMILY_TYPES,
  PLAYER_CROSSFILL_COLUMNS,
  assignPackSlugs,
  basename,
  boosterRowFromDump,
  boosterRowFromFixture,
  bundleSlug,
  buildCardTypeMap,
  buildPlayerRow,
  emblemUrl,
  mapEfootbaseStat,
  packFamily,
  parseDumpedAt,
  rowBoosters,
  skillKeyToSlug,
  type BoosterObj,
  type EfbRow,
  type FixtureBooster,
  type PlayersMeta,
} from "./efootbase-map.js";
import { makeUpserter } from "./upsert.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = resolve(__dirname, "../../../dump/efootbase");
const JSONL_PATH = process.env.EFOOTBASE_DUMP_PATH ?? resolve(DUMP_DIR, "players.jsonl");
const META_PATH = process.env.EFOOTBASE_META_PATH ?? resolve(DUMP_DIR, "players_meta.json");
const PACKS_PATH = process.env.EFOOTBASE_PACKS_PATH ?? resolve(DUMP_DIR, "packs.json");
// The dump script's manifest sits next to players.jsonl (also in a staging
// directory and in the sync worker's full-run staging); only `dumpedAt` is read.
const MANIFEST_PATH = resolve(dirname(JSONL_PATH), "manifest.json");
const STATIC_DIR = process.env.EFOOTBASE_STATIC_DIR ?? resolve(DUMP_DIR, "static");
const STATIC_SKILLS_PATH = resolve(STATIC_DIR, "skills.json");
const STATIC_MANAGERS_PATH = resolve(STATIC_DIR, "managers.json");
const STATIC_SKILL_ICONS_DIR = resolve(STATIC_DIR, "skill-icons");
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

// ---- Static efootbase snapshot (dump/efootbase/static/) ----

interface FixtureSkill { id: number; slug: string; name: string; description: string; category: string; released?: boolean }
interface FixtureManager { id: string; name: string; rating?: number; booster_1?: string | null; booster_2?: string | null; image?: string }

/** Snapshot skills.json entry (only the keys the seed reads; see docs/efootbase-static-snapshot.md). */
interface StaticSkill {
  key: string;
  order: number;
  name: string;
  group: string;
  on_wiki_list: boolean;
  description: string;
  icon_file: string | null;
  boost: { effects?: Array<{ kind: string; attributeKey: string; value: number }>; activation?: string | null } | null;
}
interface StaticManager { id: string; name: string; rating: number; booster_1: string | null; booster_2: string | null }

export interface SkillEffect { stat: BaseStat; value: number }
interface SkillMeta {
  efbKey: string;
  name: string;
  description: string;
  group: "SHOWTIME" | "CLASSIC";
  sortOrder: number;
  iconKey: string | null;
  effects: SkillEffect[];
  activation: string | null;
}

/**
 * Parse + validate dump/efootbase/static/skills.json against the fixture. Returns
 * slug → metadata, or null (with a warning) when the file is missing. Any
 * inconsistency throws — this runs before the transaction, so nothing is written.
 */
function loadStaticSkills(fixtureBySlug: ReadonlyMap<string, FixtureSkill>): Map<string, SkillMeta> | null {
  if (!existsSync(STATIC_SKILLS_PATH)) {
    console.log(`  ⚠ ${STATIC_SKILLS_PATH} missing — skills keep their fixture name/description, no group, icon, effects or activation (docs/efootbase-static-snapshot.md)`);
    return null;
  }
  const raw = JSON.parse(readFileSync(STATIC_SKILLS_PATH, "utf-8")) as unknown;
  if (!Array.isArray(raw)) throw new Error(`${STATIC_SKILLS_PATH}: expected an array of skills`);
  const out = new Map<string, SkillMeta>();
  const seenKeys = new Set<string>();
  const missingIcons: string[] = [];
  for (const s of raw as StaticSkill[]) {
    const where = `${STATIC_SKILLS_PATH} ${JSON.stringify(s?.key)}`;
    if (typeof s?.key !== "string" || !/^s_[a-z0-9_]+$/.test(s.key)) throw new Error(`${where}: bad skill key`);
    if (seenKeys.has(s.key)) throw new Error(`${where}: duplicate skill key`);
    seenKeys.add(s.key);
    const slug = skillKeyToSlug(s.key);
    const fx = fixtureBySlug.get(slug);
    if (!fx) throw new Error(`${where}: maps to slug "${slug}", which is not in fixtures/skills.json (add a fact-only row or an alias)`);
    if (typeof s.name !== "string" || s.name.trim() === "") throw new Error(`${where}: empty name`);
    if (typeof s.order !== "number" || !Number.isInteger(s.order)) throw new Error(`${where}: order is not an integer`);
    const group = s.group === "showtime" ? "SHOWTIME" : s.group === "classic" ? "CLASSIC" : null;
    if (!group) throw new Error(`${where}: unknown group ${JSON.stringify(s.group)}`);
    const released = fx.released ?? true;
    if (released !== (s.on_wiki_list === true)) {
      throw new Error(`${where}: fixture released=${released} but efootbase on_wiki_list=${String(s.on_wiki_list)} — update fixtures/skills.json`);
    }
    // Icon: the R2 key is skills/<icon_file>; set only when the snapshot carries
    // the file (the 5 unreleased skills name a file efootbase does not serve).
    let iconKey: string | null = null;
    if (s.icon_file && /^Skill_[A-Za-z0-9]+\.webp$/.test(s.icon_file) && existsSync(resolve(STATIC_SKILL_ICONS_DIR, s.icon_file))) {
      iconKey = `skills/${s.icon_file}`;
    } else if (released) {
      missingIcons.push(s.key);
    }
    const effects: SkillEffect[] = [];
    for (const e of s.boost?.effects ?? []) {
      if (e?.kind !== "flat") throw new Error(`${where}: effect kind ${JSON.stringify(e?.kind)} is not "flat"`);
      const stat = mapEfootbaseStat(e.attributeKey, where);
      if (typeof e.value !== "number" || !Number.isInteger(e.value)) throw new Error(`${where}: effect ${e.attributeKey} value ${String(e.value)} is not an integer`);
      if (effects.some((x) => x.stat === stat)) throw new Error(`${where}: stat ${stat} appears twice in the effects`);
      effects.push({ stat, value: e.value });
    }
    const activation = typeof s.boost?.activation === "string" && s.boost.activation.trim() !== "" ? s.boost.activation.trim() : null;
    out.set(slug, {
      efbKey: s.key,
      name: s.name.trim(),
      description: typeof s.description === "string" ? s.description.trim() : "",
      group,
      sortOrder: s.order,
      iconKey,
      effects,
      activation,
    });
  }
  if (missingIcons.length > 0) console.log(`  ⚠ released skills without an icon file in ${STATIC_SKILL_ICONS_DIR}: ${missingIcons.join(", ")}`);
  return out;
}

/**
 * Parse + validate dump/efootbase/static/managers.json: every picker manager must be
 * a fixture manager with the same name, rating and pills (fixtures/managers.json is
 * the committed, fact-only source). Returns the picker ids IN SNAPSHOT ORDER (the
 * array index is the stored `pickerOrder` — the reference's drawer order inside a
 * rating, openspec efootbase-data-refresh-1024), or null when missing.
 */
function loadStaticManagers(fixture: readonly FixtureManager[]): bigint[] | null {
  if (!existsSync(STATIC_MANAGERS_PATH)) {
    console.log(`  ⚠ ${STATIC_MANAGERS_PATH} missing — Manager.inPicker left unchanged (docs/efootbase-static-snapshot.md)`);
    return null;
  }
  const raw = JSON.parse(readFileSync(STATIC_MANAGERS_PATH, "utf-8")) as unknown;
  if (!Array.isArray(raw)) throw new Error(`${STATIC_MANAGERS_PATH}: expected an array of managers`);
  const byId = new Map(fixture.map((m) => [m.id, m]));
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const m of raw as StaticManager[]) {
    const where = `manager ${JSON.stringify(m?.id)}`;
    if (typeof m?.id !== "string" || !/^\d{1,16}$/.test(m.id)) throw new Error(`${STATIC_MANAGERS_PATH} ${where}: bad id`);
    if (ids.has(m.id)) throw new Error(`${STATIC_MANAGERS_PATH} ${where}: duplicate id`);
    ids.add(m.id);
    for (const pill of [m.booster_1, m.booster_2]) if (pill != null) mapEfootbaseStat(pill, `${STATIC_MANAGERS_PATH} ${where}`);
    const fx = byId.get(m.id);
    if (!fx) { problems.push(`${where} (${m.name}) is not in fixtures/managers.json`); continue; }
    if (fx.name !== m.name) problems.push(`${where}: name ${JSON.stringify(fx.name)} in fixtures, ${JSON.stringify(m.name)} in the snapshot`);
    if ((fx.rating ?? 0) !== m.rating) problems.push(`${where}: rating ${fx.rating} in fixtures, ${m.rating} in the snapshot`);
    if ((fx.booster_1 ?? null) !== (m.booster_1 ?? null) || (fx.booster_2 ?? null) !== (m.booster_2 ?? null)) {
      problems.push(`${where}: pills ${fx.booster_1}/${fx.booster_2} in fixtures, ${m.booster_1}/${m.booster_2} in the snapshot`);
    }
  }
  if (problems.length > 0) throw new Error(`${STATIC_MANAGERS_PATH} disagrees with fixtures/managers.json:\n  ${problems.join("\n  ")}`);
  // A Set keeps insertion order: the snapshot's own order (never re-sorted).
  return [...ids].map((id) => BigInt(id));
}

/**
 * The time the seeded dump was taken (its manifest's `dumpedAt`), or null with a
 * notice — no manifest, unreadable, no `dumpedAt`, "manual" (the dump script's
 * value without --dumped-at) or not a strict UTC ISO time: the stored
 * CatalogueMeta.playersDumpedAt is then kept. Read before the transaction.
 */
function loadDumpedAt(): Date | null {
  if (!existsSync(MANIFEST_PATH)) {
    console.log(`  ⚠ ${MANIFEST_PATH} missing — the stored dump date (CatalogueMeta.playersDumpedAt) is kept`);
    return null;
  }
  let raw: unknown;
  try {
    raw = (JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as { dumpedAt?: unknown } | null)?.dumpedAt;
  } catch (e) {
    console.log(`  ⚠ ${MANIFEST_PATH} is not valid JSON (${(e as Error).message}) — the stored dump date is kept`);
    return null;
  }
  const at = parseDumpedAt(raw);
  if (!at) {
    console.log(`  ⚠ ${MANIFEST_PATH} dumpedAt ${JSON.stringify(raw) ?? "absent"} is not a UTC ISO time (e.g. 2026-10-24T09:00:00Z) — the stored dump date is kept`);
    return null;
  }
  console.log(`  dump taken at ${at.toISOString()} (manifest dumpedAt)`);
  return at;
}

// ---- helpers ----

async function* jsonlRows(path: string): AsyncGenerator<EfbRow> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield JSON.parse(line) as EfbRow;
  }
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
  const cardTypeByCode = buildCardTypeMap(meta, META_PATH);

  // ── Fixtures ───────────────────────────────────────────────────────────
  const skillsFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "skills.json"), "utf-8")) as {
    skills: FixtureSkill[];
  };
  const slugToSkillId = new Map(skillsFixture.skills.map((s) => [s.slug, s.id]));
  const skillReleasedById = new Map(skillsFixture.skills.map((s) => [s.id, s.released ?? true]));
  const leaguesFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "leagues.json"), "utf-8")) as {
    leagues: Record<string, { name: string; region: string }>;
  };
  const managersFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "managers.json"), "utf-8")) as FixtureManager[];
  // Manager pills → eFootLab stat names (same table as the skill effects); unknown aborts.
  const managerRows = managersFixture.map((m) => ({
    id: BigInt(m.id),
    name: m.name,
    rating: m.rating ?? 0,
    booster1Stat: m.booster_1 ? mapEfootbaseStat(m.booster_1, `fixtures/managers.json ${m.id}`) : null,
    booster2Stat: m.booster_2 ? mapEfootbaseStat(m.booster_2, `fixtures/managers.json ${m.id}`) : null,
    imageUrl: m.image ? `${R2_BASE}/managers/${m.image}` : null,
  }));

  // ── Static efootbase snapshot — validated before anything is written ────
  console.log(`static snapshot: ${STATIC_DIR}`);
  const skillMeta = loadStaticSkills(new Map(skillsFixture.skills.map((s) => [s.slug, s])));
  const pickerIds = loadStaticManagers(managersFixture);
  if (skillMeta) {
    const metas = [...skillMeta.values()];
    console.log(`  skills: ${skillMeta.size} attached (${metas.filter((m) => m.group === "SHOWTIME").length} Showtime, ${metas.filter((m) => m.group === "CLASSIC").length} Classic, ${metas.filter((m) => m.iconKey).length} with icon, ${metas.filter((m) => m.effects.length > 0).length} with effects)`);
  }
  if (pickerIds) console.log(`  picker managers: ${pickerIds.length}`);
  const dumpedAt = loadDumpedAt();
  const boostersFixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, "boosters.json"), "utf-8")) as {
    standard: FixtureBooster[];
    basic: FixtureBooster[];
  };

  // ── Pass 1: stream the dump for lookups (no rows kept) ──────────────────
  console.log("pass 1: scanning dump for Country/Team/League/Pack/Booster/skill keys…");
  const nationalityName = new Map<string, { hash: string | null }>();
  const teamName = new Map<string, { hash: string | null; nationality: string | null; league: number | null }>();
  const leagueEmblemHash = new Map<number, string>();
  const featuredPack = new Map<string, { time: number; type: string }>();
  const boosterDump = new Map<number, BoosterObj>();
  const skillKeys = new Set<string>();
  const skillHolders = new Map<string, number>(); // s_* key → cards with the flag set
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
    for (const k of Object.keys(r)) {
      if (!k.startsWith("s_")) continue;
      skillKeys.add(k);
      if (r[k]) skillHolders.set(k, (skillHolders.get(k) ?? 0) + 1);
    }

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
    for (const [bid, bobj] of rowBoosters(r)) {
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
  // A hidden (released: false) skill that cards carry would hide real data.
  const heldButHidden = [...skillKeyToId].filter(([k, id]) => skillReleasedById.get(id) === false && (skillHolders.get(k) ?? 0) > 0);
  if (heldButHidden.length > 0) {
    throw new Error(`skills marked released:false in fixtures/skills.json are carried by cards: ${
      heldButHidden.map(([k]) => `${k} (${skillHolders.get(k)})`).join(", ")} — set released to true`);
  }
  console.log(`  skills matched: ${skillKeyToId.size}/${skillKeys.size} (fixture has ${skillsFixture.skills.length})`);

  // The League ids this seed writes (fixtures/leagues.json, replaced inside the
  // transaction below) — a card's own league is stored only when it is one of them.
  const knownLeagueIds: ReadonlySet<number> = new Set(Object.keys(leaguesFixture.leagues).map(Number));
  // Lookup ids (sequential, in first-seen dump order → stable across runs).
  const countryNameToId = new Map([...nationalityName.keys()].map((n, i) => [n, i + 1]));
  const teamNameToId = new Map([...teamName.keys()].map((n, i) => [n, i + 1]));
  // Pack.id = slug of the pack name ("-2" suffix on a slug collision, see assignPackSlugs).
  const packNameToId = assignPackSlugs(featuredPack.keys());

  // ── Booster rows: fixtures (standard first, basic fills gaps) then dump wins ──
  const boosterRows = new Map<number, Record<string, unknown>>();
  for (const tier of ["standard", "basic"] as const) {
    for (const b of boostersFixture[tier]) {
      if (boosterRows.has(b.id)) continue; // ids 0,16–26 appear in both fixture tiers; standard wins
      boosterRows.set(b.id, boosterRowFromFixture(b, tier));
    }
  }
  for (const [bid, bobj] of boosterDump) {
    boosterRows.set(bid, boosterRowFromDump(bid, bobj)); // dump wins over a fixture row with the same id
  }

  // ── Upserters (column lists derived from the Prisma model) ──────────────
  const playerUpsert = makeUpserter("Player", "Player", PLAYER_CROSSFILL_COLUMNS);
  const managerUpsert = makeUpserter("Manager", "Manager", new Set([...MANAGER_CROSSFILL_COLUMNS, ...MANAGER_STATIC_COLUMNS]));
  const boosterUpsert = makeUpserter("Booster", "Booster", new Set());
  console.log(`  Player upsert columns: ${playerUpsert.columns.length} (cross-fill-owned excluded: ${PLAYER_CROSSFILL_COLUMNS.size})`);

  // ── Transaction: everything below is atomic ─────────────────────────────
  const stats = { players: 0, playerSkills: 0, packCards: 0, bundles: 0, bundleCards: 0, noLeague: 0, aptitudeMismatch: [] as string[] };
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

    // Fixture rows (id, slug = join key, released) + the efootbase snapshot's
    // name / description / group / order / icon / effects / activation where the
    // skill is in it. The 17 non-skill fixture entries keep their fixture text
    // and no group ("Other").
    await tx.skill.createMany({
      data: skillsFixture.skills.map((s) => {
        const meta = skillMeta?.get(s.slug);
        return {
          id: s.id,
          slug: s.slug,
          name: meta?.name ?? s.name,
          description: meta?.description || s.description,
          category: s.category,
          released: s.released ?? true,
          efbKey: meta?.efbKey ?? null,
          group: meta?.group ?? null,
          sortOrder: meta?.sortOrder ?? null,
          iconKey: meta?.iconKey ?? null,
          effects: (meta?.effects ?? []) as unknown as Prisma.InputJsonValue,
          activation: meta?.activation ?? null,
        };
      }),
    });
    await tx.league.createMany({
      data: Object.entries(leaguesFixture.leagues).map(([oid, info]) => {
        const id = Number(oid);
        const hash = leagueEmblemHash.get(id);
        return { id, name: info.name, region: info.region, emblemUrl: hash ? emblemUrl(R2_BASE, "league", hash) : null };
      }),
    });
    await tx.country.createMany({
      data: [...nationalityName.entries()].map(([name, { hash }]) => ({
        id: countryNameToId.get(name)!,
        name,
        flagUrl: hash ? emblemUrl(R2_BASE, "nationality", hash) : null,
      })),
    });
    await tx.team.createMany({
      data: [...teamName.entries()].map(([name, { hash, nationality, league }]) => ({
        id: teamNameToId.get(name)!,
        name,
        national: nationality != null && nationality === name,
        emblemUrl: hash ? emblemUrl(R2_BASE, "team", hash) : null,
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

    // Manager (the fact-only fixtures — 70 since the 2026-10-24 snapshot: id,
    // name, rating, pills as eFootLab stat names, R2 art) — upsert; tactic
    // columns stay cross-fill-owned.
    await managerUpsert.run(tx, managerRows);
    // Picker flag and order: exactly the snapshot ids, each with its 0-based
    // position in the snapshot (array_position is 1-based; NULL outside the
    // picker). Only rows whose flag or order changes are written.
    if (pickerIds) {
      const flipped = await tx.$executeRaw`UPDATE "Manager"
        SET "inPicker" = (array_position(${pickerIds}::int8[], "id") IS NOT NULL),
            "pickerOrder" = array_position(${pickerIds}::int8[], "id") - 1
        WHERE "inPicker" IS DISTINCT FROM (array_position(${pickerIds}::int8[], "id") IS NOT NULL)
           OR "pickerOrder" IS DISTINCT FROM array_position(${pickerIds}::int8[], "id") - 1`;
      const [check] = await tx.$queryRaw<Array<{ flagged: number; orders: number; lo: number | null; hi: number | null; stray: number }>>`
        SELECT count(*) FILTER (WHERE "inPicker")::int AS flagged,
               count(DISTINCT "pickerOrder") FILTER (WHERE "inPicker")::int AS orders,
               min("pickerOrder") FILTER (WHERE "inPicker") AS lo,
               max("pickerOrder") FILTER (WHERE "inPicker") AS hi,
               count(*) FILTER (WHERE NOT "inPicker" AND "pickerOrder" IS NOT NULL)::int AS stray
        FROM "Manager"`;
      const n = pickerIds.length;
      if (!check || check.flagged !== n || check.orders !== n || (n > 0 && (check.lo !== 0 || check.hi !== n - 1)) || check.stray !== 0) {
        throw new Error(`picker managers: ${JSON.stringify(check)} — expected ${n} flagged with the distinct orders 0…${n - 1} and no order outside the picker`);
      }
      console.log(`  picker managers flagged: ${check.flagged}, picker order 0…${n - 1} (${flipped} rows changed)`);
    }
    // Booster — upsert by id, dump wins.
    await boosterUpsert.run(tx, [...boosterRows.values()]);
    console.log(`  managers upserted ${managerRows.length} | boosters upserted ${boosterRows.size} (dump ${boosterDump.size})`);

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
      const row = buildPlayerRow(r, pid, cardTypeByCode, countryNameToId, teamNameToId, packNameToId, knownLeagueIds, stats.aptitudeMismatch);
      if (row.leagueId === null) stats.noLeague++;
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
    console.log(`  card league: ${rowCount - stats.noLeague} cards with their own league, ${stats.noLeague} without (dump \`league\` missing or not in fixtures/leagues.json)`);

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

    // ── CatalogueMeta (single row, id 1): the dump's date and this seed's time ──
    // Typed Prisma writes (UTC whatever the session TimeZone — never a raw Date
    // parameter). Without a usable manifest date the stored dump date stays.
    const seededAt = new Date();
    await tx.catalogueMeta.upsert({
      where: { id: 1 },
      create: { id: 1, playersDumpedAt: dumpedAt, seededAt },
      update: dumpedAt ? { playersDumpedAt: dumpedAt, seededAt } : { seededAt },
    });
    const catalogueMeta = await tx.catalogueMeta.findUniqueOrThrow({ where: { id: 1 } });
    console.log(`  catalogue meta: dump taken ${catalogueMeta.playersDumpedAt?.toISOString() ?? "unknown"}${dumpedAt ? "" : " (kept)"}, seeded ${seededAt.toISOString()}`);
  }, { timeout: TX_TIMEOUT_MS, maxWait: 30_000 });

  console.log(`\nseed-efootbase-full: done in ${(Date.now() - t0) / 1000 | 0}s`);
  console.log(`  players ${stats.players} | playerSkills ${stats.playerSkills} | packCards ${stats.packCards} | bundles ${stats.bundles}`);
  console.log("  NOTE: db:seed does not refresh cross-fill data (manager tactics, reputation,");
  console.log("        overallPotential, gkClearing, stars, tier badges, per-position ratings,");
  console.log("        the 3 eFHUB-only players). Run `pnpm db:refresh` (seed + cross-fill).");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("seed-efootbase-full: FAILED (nothing committed — validation runs before the transaction, which rolls back on error)", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
