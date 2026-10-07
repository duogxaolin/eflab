// Full seed from efootbase dump → Postgres.
// Reads dump/efootbase/players.jsonl (48.407 players × 176 cols, efootbase schema)
// and populates: Country, Team, Pack, Player (+ PlayerSkill + PackCard).
// Skills (67) must already exist (db:seed:mock seeds them, or run skill-only first).
//
// Run:  set -a; source .env; set +a
//       pnpm --filter @eflab/db exec tsx src/seed-efootbase-full.ts
//
// Field mapping efootbase jsonl → Prisma Player is documented in the plan file.
// Key transforms:
//   - id/base_id (int) → BigInt
//   - stats snake_case → camelCase (default 40 if MISSING)
//   - max_attributes object → 26 max stats (alias: jumping→maxJump,
//     set_piece_taking→maxPlaceKicking, tackling→maxBallWinning)
//   - card_type int → CardType enum (0,1,3,4,5,6,7)
//   - positions 0/1/2 → posGK..posCF (0=registered, 1=partial, 2=none)
//   - registeredPosition inferred from position value 0 (priority GK>CF>...)
//   - s_* skill bools → PlayerSkill join (slug-kebab match)
//   - p_* playstyle bools → trickster/mazingRun/...
//   - featured (pack name) → Pack + featuredPackId + PackCard

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { prisma } from "./client.js";
import type { CardType, Prisma } from "./generated/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSONL_PATH = process.env.EFOOTBASE_DUMP_PATH
  ?? resolve(__dirname, "../../../dump/efootbase/players.jsonl");

const R2_BASE = process.env.R2_PUBLIC_BASE
  ?? process.env.NEXT_PUBLIC_R2_PUBLIC_BASE
  ?? "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";

const BATCH_SIZE = 200; // players per upsert batch
const LOG_EVERY = 5000;

// ---- efootbase jsonl row shape (only fields we touch) ----
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
  playing_style?: number;
  card_type?: number;
  featured?: string | null;
  overall_rating?: number;
  overall_at_max_level?: number;
  condition?: number;
  form?: number;
  weak_foot_usage?: number;
  weak_foot_accuracy?: number;
  time_added?: number;
  max_level?: number;
  booster_id?: number | null;
  booster2_id?: number | null;
  emblem_images?: {
    nationality?: string | null;
    league?: string | null;
    team?: string | null;
  } | null;
  max_attributes?: Record<string, number> | null;
  // 13 position aptitude (0/1/2)
  gk?: number; cb?: number; lb?: number; rb?: number;
  dmf?: number; cmf?: number; lmf?: number; rmf?: number;
  amf?: number; lwf?: number; rwf?: number; ss?: number; cf?: number;
  // 23 base stats
  offensive_awareness?: number; ball_control?: number; dribbling?: number;
  tight_possession?: number; low_pass?: number; lofted_pass?: number;
  finishing?: number; heading?: number; place_kicking?: number;
  curl?: number; speed?: number; acceleration?: number; kicking_power?: number;
  jump?: number; physical_contact?: number; balance?: number; stamina?: number;
  defensive_awareness?: number; ball_winning?: number; defensive_engagement?: number;
  aggression?: number;
  gk_awareness?: number; gk_catching?: number; gk_parrying?: number;
  gk_reflexes?: number; gk_reach?: number;
  // 11 physique
  neck_length?: number; neck_size?: number; shoulder_height?: number;
  shoulder_width?: number; chest_measurement?: number; waist_size?: number;
  arm_size?: number; arm_length?: number; thigh_size?: number;
  calf_size?: number; leg_length?: number;
  // playstyle flags
  p_trickster?: number; p_mazing_run?: number; p_speeding_bullet?: number;
  p_incisive_run?: number; p_long_ball_expert?: number; p_long_ranger?: number;
  p_early_cross?: number;
  // skills (s_*) — 67 bool/int flags. Collected dynamically.
  [key: `s_${string}`]: number | undefined;
}

const CARD_TYPE_MAP: Record<number, CardType> = {
  0: "STANDARD",
  1: "TRENDING",
  3: "EPIC",
  4: "BIG_TIME",
  5: "HIGHLIGHT",
  6: "SHOW_TIME",
  7: "LEGENDARY",
};

// Position priority for registered position inference (GK first, then forwards...).
// Index matches POSITION_BY_INDEX in card-display.ts: GK=0,CB=1,LB=2,RB=3,DMF=4,CMF=5,
// LMF=6,RMF=7,AMF=8,LWF=9,RWF=10,SS=11,CF=12.
const POS_KEYS = ["gk","cf","ss","rwf","lwf","amf","rmf","lmf","cmf","dmf","rb","lb","cb"] as const;
const POS_DB = ["posGK","posCF","posSS","posRWF","posLWF","posAMF","posRMF","posLMF","posCMF","posDMF","posRB","posLB","posCB"] as const;
const RATING_DB = [
  "ratingGK","ratingCF","ratingSS","ratingRWF","ratingLWF","ratingAMF",
  "ratingRMF","ratingLMF","ratingCMF","ratingDMF","ratingRB","ratingLB","ratingCB",
] as const;

// 26 base stats: efootbase snake_case → prisma camelCase
const STAT_MAP: Record<string, string> = {
  offensive_awareness: "offensiveAwareness",
  ball_control: "ballControl",
  dribbling: "dribbling",
  tight_possession: "tightPossession",
  low_pass: "lowPass",
  lofted_pass: "loftedPass",
  finishing: "finishing",
  heading: "heading",
  place_kicking: "placeKicking",
  curl: "curl",
  speed: "speed",
  acceleration: "acceleration",
  kicking_power: "kickingPower",
  jump: "jump",
  physical_contact: "physicalContact",
  balance: "balance",
  stamina: "stamina",
  defensive_awareness: "defensiveAwareness",
  ball_winning: "ballWinning",
  defensive_engagement: "defensiveEngagement",
  aggression: "aggression",
  gk_awareness: "gkAwareness",
  gk_catching: "gkCatching",
  gk_parrying: "gkParrying",
  gk_reflexes: "gkReflexes",
  gk_reach: "gkReach",
};

// max_attributes uses different aliases for 3 stats
const MAX_STAT_MAP: Record<string, string> = {
  ...STAT_MAP,
  jumping: "maxJump",
  set_piece_taking: "maxPlaceKicking",
  tackling: "maxBallWinning",
};
// Strip the non-max key duplicates (jump/place_kicking/ball_winning already in STAT_MAP
// but max_attributes uses jumping/set_piece_taking/tackling — overwritten above).

const PHYSIQUE_MAP: Record<string, string> = {
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

const PLAYSTYLE_MAP: Record<string, string> = {
  p_trickster: "trickster",
  p_mazing_run: "mazingRun",
  p_speeding_bullet: "speedingBullet",
  p_incisive_run: "incisiveRun",
  p_long_ball_expert: "longBallExpert",
  p_early_cross: "earlyCross",
  // p_long_ranger has no dedicated boolean column in schema — skip.
};

/** Extract trailing filename (hash.png) from efootbase CDN URL. */
function basename(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/([^/]+\.png)$/);
  return m && m[1] ? m[1] : null;
}

/** Slugify a pack/featured name → stable Pack.id (URL-safe, lowercase, ascii). */
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

/** Map an efootbase `s_xxx` field name to a Skill slug (kebab-case). */
function skillFieldToSlug(field: string): string {
  return field.replace(/^s_/, "").replace(/_/g, "-");
}

async function main(): Promise<void> {
  console.log(`seed-efootbase-full: reading ${JSONL_PATH}`);
  console.log(`  R2 base: ${R2_BASE}`);
  const t0 = Date.now();

  // ── Load existing skills (re-seed from fixtures if empty) → s_field → skillId map ──
  let allSkills = await prisma.skill.findMany({ select: { id: true, slug: true } });
  if (allSkills.length === 0) {
    console.log("  skills table empty — seeding 67 skills from fixtures/skills.json…");
    const skillsFixture = JSON.parse(
      await import("node:fs").then((fs) => fs.readFileSync(resolve(__dirname, "../fixtures/skills.json"), "utf-8")),
    ) as { skills: Array<{ id: number; slug: string; name: string; description: string; category: string }> };
    await prisma.skill.createMany({
      data: skillsFixture.skills.map((s) => ({
        id: s.id, slug: s.slug, name: s.name, description: s.description, category: s.category,
      })),
      skipDuplicates: true,
    });
    allSkills = await prisma.skill.findMany({ select: { id: true, slug: true } });
  }
  const slugToId = new Map(allSkills.map((s) => [s.slug, s.id]));
  console.log(`  skills loaded: ${allSkills.length}`);

  // Discover the 67 s_* keys actually present in the first row.
  const firstLine = await firstNonEmptyLine(JSONL_PATH);
  const firstRow = JSON.parse(firstLine) as EfbRow;
  const skillFields = Object.keys(firstRow).filter((k) => k.startsWith("s_"));
  console.log(`  s_* skill fields in dump: ${skillFields.length}`);

  // s_field → skillId (resolved against slug map; log misses)
  const sFieldToSkillId = new Map<string, number>();
  let skillMisses = 0;
  for (const f of skillFields) {
    const slug = skillFieldToSlug(f);
    const id = slugToId.get(slug);
    if (id != null) {
      sFieldToSkillId.set(f, id);
    } else {
      // try a few common variations
      const singular = slug.replace(/s$/, "");
      const id2 = slugToId.get(singular) ?? slugToId.get(`${slug}s`);
      if (id2 != null) {
        sFieldToSkillId.set(f, id2);
      } else {
        skillMisses++;
      }
    }
  }
  if (skillMisses > 0) {
    console.log(`  ⚠ ${skillMisses} s_* fields did not match a Skill slug (skipped)`);
  }

  // ── Phase 1: scan whole dump, build name→id maps + collect rows ──────
  console.log("phase 1: scanning dump to build maps (Country/Team/Pack)…");
  const rows: EfbRow[] = [];
  const nationalityName = new Map<string, { hash: string | null }>();
  const teamName = new Map<string, { hash: string | null; nationality: string | null }>();
  const featuredPack = new Map<string, { time: number; type: string }>();

  const rl0 = createInterface({ input: createReadStream(JSONL_PATH), crlfDelay: Infinity });
  for await (const line of rl0) {
    if (!line.trim()) continue;
    let r: EfbRow;
    try { r = JSON.parse(line) as EfbRow; } catch { continue; }
    rows.push(r);

    if (r.nationality) {
      if (!nationalityName.has(r.nationality)) {
        nationalityName.set(r.nationality, { hash: basename(r.emblem_images?.nationality ?? null) });
      }
    }
    if (r.team_name && !teamName.has(r.team_name)) {
      teamName.set(r.team_name, {
        hash: basename(r.emblem_images?.team ?? null),
        nationality: r.nationality ?? null,
      });
    }
    const feat = r.featured ?? null;
    if (feat && feat !== "none" && !featuredPack.has(feat)) {
      const isSpecial = /strike arena|j\.league|selection/i.test(feat);
      featuredPack.set(feat, {
        time: r.time_added ?? 0,
        type: isSpecial ? "special_list" : "pack",
      });
    }
  }
  console.log(`  rows: ${rows.length} | countries: ${nationalityName.size} | teams: ${teamName.size} | packs: ${featuredPack.size}`);

  // ── Phase 1b: wipe + upsert Country / Team / Pack ────────────────────
  console.log("phase 1b: wipe community/cascade-safe tables + upsert Country/Team/Pack…");
  // Wipe only the data we own; keep User/Session/Skill (skills seeded separately).
  await prisma.$transaction([
    prisma.tierVote.deleteMany({}),
    prisma.review.deleteMany({}),
    prisma.build.deleteMany({}),
    prisma.packCard.deleteMany({}),
    prisma.playerSkill.deleteMany({}),
    prisma.pack.deleteMany({}),
    prisma.player.deleteMany({}),
    prisma.team.deleteMany({}),
    prisma.country.deleteMany({}),
  ]);

  // Country: assign sequential ids starting at 1 (efootbase has no numeric id).
  let countryId = 0;
  const countryNameToId = new Map<string, number>();
  for (const [name] of nationalityName) {
    countryId++;
    countryNameToId.set(name, countryId);
  }
  await prisma.country.createMany({
    data: [...nationalityName.entries()].map(([name, { hash }], i) => ({
      id: i + 1,
      name,
      flagUrl: hash ? `${R2_BASE}/emblems/nationality/${hash}` : null,
    })),
    skipDuplicates: true,
  });
  console.log(`  countries upserted: ${countryId}`);

  // Team: assign sequential ids starting at 1.
  let teamId = 0;
  const teamNameToId = new Map<string, number>();
  for (const [name] of teamName) {
    teamId++;
    teamNameToId.set(name, teamId);
  }
  await prisma.team.createMany({
    data: [...teamName.entries()].map(([name, { hash, nationality }], i) => ({
      id: i + 1,
      name,
      national: nationality != null && nationality === name,
      emblemUrl: hash ? `${R2_BASE}/emblems/team/${hash}` : null,
    })),
    skipDuplicates: true,
  });
  console.log(`  teams upserted: ${teamId}`);

  // Packs.
  const packNameToId = new Map<string, string>();
  const packRows: Prisma.PackUncheckedCreateInput[] = [];
  for (const [name, info] of featuredPack) {
    const id = slugify(name);
    packNameToId.set(name, id);
    packRows.push({
      id,
      name,
      releaseDate: info.time > 0 ? new Date(info.time * 1000) : new Date(),
      type: info.type,
      playerCount: 0,
    });
  }
  if (packRows.length > 0) {
    await prisma.pack.createMany({ data: packRows, skipDuplicates: true });
  }
  console.log(`  packs upserted: ${packRows.length}`);

  // ── Phase 2: stream upsert Player + PlayerSkill + PackCard ──────────
  console.log(`phase 2: upserting ${rows.length} players in batches of ${BATCH_SIZE}…`);
  let processed = 0;
  let packCardCount = 0;
  let playerSkillCount = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const playerCreates: Prisma.PlayerUncheckedCreateInput[] = [];
    const playerSkillCreates: { playerId: bigint; skillId: number }[] = [];
    const packCardCreates: { packId: string; playerId: bigint }[] = [];

    for (const r of batch) {
      if (r.id == null) continue;
      const pid = BigInt(r.id);
      const baseId = BigInt(r.base_id ?? r.id);

      // registeredPosition: first position with value 2 (efootbase "full/apt/registered")
      // in priority order. efootbase encodes aptitude as 2=full, 1=partial, 0=none
      // (OPPOSITE of the prisma schema where 0=registered, 1=partial, 2=none).
      // We invert 0↔2 when writing posGK..posCF below.
      let registeredPos = 0;
      for (let k = 0; k < POS_KEYS.length; k++) {
        const posKey = POS_KEYS[k]!;
        const v = r[posKey];
        if (v === 2) { registeredPos = posKeyToIndex(k); break; }
      }
      // If no 2 found (rare), fall back to 0 (GK).
      if (registeredPos < 0) registeredPos = 0;

      const nationalityId = r.nationality ? (countryNameToId.get(r.nationality) ?? 0) : 0;
      const featuredPackId = r.featured && r.featured !== "none"
        ? (packNameToId.get(r.featured) ?? null)
        : null;

      const ovr = r.overall_rating ?? 40;
      const maxOvr = r.overall_at_max_level ?? ovr;

      // Stats (default 40 if undefined).
      const statData: Record<string, number> = {};
      for (const [efbKey, dbKey] of Object.entries(STAT_MAP)) {
        statData[dbKey] = (r as unknown as Record<string, number | undefined>)[efbKey] ?? 40;
      }
      // Max stats (from max_attributes object, aliases handled).
      const maxAttrs = r.max_attributes ?? {};
      const maxStatData: Record<string, number> = {};
      for (const [efbKey, aliasOrKey] of Object.entries(MAX_STAT_MAP)) {
        // MAX_STAT_MAP values already include the "max" prefix correctly?
        // We built MAX_STAT_MAP with camelCase *base* names, so prepend "max".
        const dbMaxKey = aliasOrKey.startsWith("max") ? aliasOrKey : `max${aliasOrKey.charAt(0).toUpperCase()}${aliasOrKey.slice(1)}`;
        maxStatData[dbMaxKey] = maxAttrs[efbKey] ?? 40;
      }

      // Position aptitudes — efootbase encodes 2=full, 1=partial, 0=none;
      // prisma schema is 0=registered, 1=partial, 2=none. Invert 0↔2.
      const posData: Record<string, number> = {};
      for (let k = 0; k < POS_KEYS.length; k++) {
        const v = r[POS_KEYS[k]!] ?? 0;
        posData[POS_DB[k]!] = v === 2 ? 0 : v === 0 ? 2 : 1;
      }
      // Position OVR ratings: registered pos = ovr, rest 40.
      const ratingData: Record<string, number> = {};
      const ratingIdx = posKeyToRegisteredRatingIndex(registeredPos);
      for (let k = 0; k < POS_KEYS.length; k++) {
        ratingData[RATING_DB[k]!] = k === ratingIdx ? ovr : 40;
      }

      // Physique.
      const physiqueData: Record<string, number> = {};
      for (const [efbKey, dbKey] of Object.entries(PHYSIQUE_MAP)) {
        physiqueData[dbKey] = (r as unknown as Record<string, number | undefined>)[efbKey] ?? 5;
      }

      // Playstyle flags.
      const playstyleData: Record<string, boolean> = {};
      for (const [efbKey, dbKey] of Object.entries(PLAYSTYLE_MAP)) {
        playstyleData[dbKey] = Boolean((r as unknown as Record<string, number | undefined>)[efbKey]);
      }

      const playerCreate: Prisma.PlayerUncheckedCreateInput = {
        id: pid,
        baseId,
        name: r.name ?? "Unknown",
        accentedName: null,
        japName: r.name_ja ?? null,
        chineseName: r.name_zh ?? null,
        shirt: null,
        shirtNational: null,
        nationalityId,
        country2Id: null,
        height: r.height ?? 170,
        weight: r.weight ?? 70,
        age: r.age ?? 25,
        strongerFoot: r.foot ?? 0,
        registeredPosition: registeredPos,
        playingStyleAttack: r.playing_style ?? 0,
        playingStyleDefense: 0,
        cardType: CARD_TYPE_MAP[r.card_type ?? 0] ?? "STANDARD",
        featuredPackId,
        ovr,
        maxOvr,
        condition: "B",
        form: r.form ?? 1,
        injuryResistance: 1,
        weakFootUsage: r.weak_foot_usage ?? 0,
        weakFootAccuracy: r.weak_foot_accuracy ?? 0,
        releaseDate: r.time_added ? new Date(r.time_added * 1000) : null,
        datapackId: 20251204,
        levelCap: r.max_level ?? 50,
        cost: 0,
        variation: 0,
        stars: 0,
        marketValue: 0,
        boosterId1: r.booster_id ?? null,
        boosterId2: r.booster2_id ?? null,
        ...statData,
        ...maxStatData,
        ...posData,
        ...ratingData,
        ...physiqueData,
        ...playstyleData,
      };
      playerCreates.push(playerCreate);

      // Skills: each s_* flag that is true → PlayerSkill.
      for (const [field, skillId] of sFieldToSkillId) {
        if ((r as unknown as Record<string, number | undefined>)[field]) {
          playerSkillCreates.push({ playerId: pid, skillId });
        }
      }

      // PackCard: if featured pack exists.
      if (featuredPackId) {
        packCardCreates.push({ packId: featuredPackId, playerId: pid });
      }
    }

    // Batch upsert players (createMany skipDuplicates — idempotent re-run).
    if (playerCreates.length > 0) {
      await prisma.player.createMany({
        data: playerCreates as Prisma.PlayerCreateManyInput[],
        skipDuplicates: true,
      });
    }
    if (playerSkillCreates.length > 0) {
      await prisma.playerSkill.createMany({
        data: playerSkillCreates,
        skipDuplicates: true,
      });
      playerSkillCount += playerSkillCreates.length;
    }
    if (packCardCreates.length > 0) {
      await prisma.packCard.createMany({
        data: packCardCreates,
        skipDuplicates: true,
      });
      packCardCount += packCardCreates.length;
    }

    processed += batch.length;
    if (processed % LOG_EVERY < BATCH_SIZE) {
      console.log(`  ${processed}/${rows.length} players | skills ${playerSkillCount} | packCards ${packCardCount} | ${(Date.now() - t0) / 1000 | 0}s`);
    }
  }

  // Update Pack.playerCount from actual PackCard rows.
  console.log("phase 3: updating Pack.playerCount…");
  const packCounts = await prisma.packCard.groupBy({
    by: ["packId"],
    _count: { playerId: true },
  });
  for (const pc of packCounts) {
    await prisma.pack.update({
      where: { id: pc.packId },
      data: { playerCount: pc._count.playerId },
    });
  }

  console.log(`\nseed-efootbase-full: done in ${(Date.now() - t0) / 1000 | 0}s`);
  console.log(`  players: ${processed}`);
  console.log(`  playerSkills: ${playerSkillCount}`);
  console.log(`  packCards: ${packCardCount}`);
  console.log(`  packs: ${packRows.length}`);
  console.log(`  countries: ${countryId}`);
  console.log(`  teams: ${teamId}`);
  await prisma.$disconnect();
}

/** Convert POS_KEYS index → registeredPosition index (POSITION_BY_INDEX order):
 *  GK=0,CB=1,LB=2,RB=3,DMF=4,CMF=5,LMF=6,RMF=7,AMF=8,LWF=9,RWF=10,SS=11,CF=12. */
function posKeyToIndex(posKeysIdx: number): number {
  const key = POS_KEYS[posKeysIdx]!;
  const map: Record<string, number> = {
    gk: 0, cb: 1, lb: 2, rb: 3, dmf: 4, cmf: 5, lmf: 6, rmf: 7,
    amf: 8, lwf: 9, rwf: 10, ss: 11, cf: 12,
  };
  return map[key] ?? 0;
}

/** Given a registeredPosition index (POSITION_BY_INDEX order), return the
 *  index into RATING_DB (which uses POS_KEYS order) for that position. */
function posKeyToRegisteredRatingIndex(registeredPos: number): number {
  // RATING_DB is in POS_KEYS order; we need to find which POS_KEYS slot has
  // the registered position. registeredPos is in POSITION_BY_INDEX order.
  const positionByIndexToPosKey: Record<number, string> = {
    0: "gk", 1: "cb", 2: "lb", 3: "rb", 4: "dmf", 5: "cmf",
    6: "lmf", 7: "rmf", 8: "amf", 9: "lwf", 10: "rwf", 11: "ss", 12: "cf",
  };
  const key = positionByIndexToPosKey[registeredPos] ?? "gk";
  return POS_KEYS.indexOf(key as (typeof POS_KEYS)[number]);
}

function firstNonEmptyLine(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    let resolved = false;
    rl.on("line", (line) => {
      if (resolved) return;
      if (line.trim()) {
        resolved = true;
        rl.removeAllListeners();
        rl.close();
        resolve(line);
      }
    });
    rl.on("close", () => {
      if (!resolved) reject(new Error("empty file"));
    });
    rl.on("error", reject);
  });
}

main().catch((e) => {
  console.error("seed-efootbase-full: FAILED", e);
  prisma.$disconnect().finally(() => process.exit(1));
});
