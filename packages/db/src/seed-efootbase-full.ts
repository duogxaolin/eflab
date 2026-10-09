// Full seed from efootbase dump → Postgres.
// Reads dump/efootbase/players.jsonl (48.407 players × 176 cols, efootbase schema)
// and populates: Country, League, Team, Pack, Player (+ PlayerSkill + PackCard).
// Also seeds Manager (65) and Booster (full tier system) from the efootbase APK
// bundled JSONs (extracted to dump/efootbase/apk-data/{managers,boosters}.json).
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
//   - team_name → Team + Player.teamId
//   - league (int OID) → League (34 from /api/meta), Team.leagueId
//   - views/avgRating/ratingCount → Player community fields

import { createReadStream, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { prisma } from "./client.js";
import type { CardType, Prisma } from "./generated/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSONL_PATH = process.env.EFOOTBASE_DUMP_PATH
  ?? resolve(__dirname, "../../../dump/efootbase/players.jsonl");

// efootbase /api/packs dump → specialPlayerList (17 homepage featured bundles) + packs.
const PACKS_PATH = process.env.EFOOTBASE_PACKS_PATH
  ?? resolve(__dirname, "../../../dump/efootbase/packs.json");

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
  playing_style_2?: number;
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
  // efootbase nests the full booster object inline (with name/add/stats). Used by
  // Phase 1c to seed the Booster table from the dump (cards reference IDs that
  // don't exist in fixtures/boosters.json — see notes 2026-10-08).
  booster?: { name?: string; add?: number; stats?: Record<string, number> } | null;
  booster2?: { name?: string; add?: number; stats?: Record<string, number> } | null;
  league?: number;
  shirt_number?: number;
  dream_team?: number; // 1 = dream team (icon) card, 0 = normal
  views?: number;
  ratingCount?: number;
  avgRating?: number;
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
  // efootbase names this stat `tackling` (NOT `ball_winning` — that key never
  // appears in the dump). max_attributes also uses `tackling`, aliased below.
  tackling: "ballWinning",
  defensive_engagement: "defensiveEngagement",
  aggression: "aggression",
  gk_awareness: "gkAwareness",
  gk_catching: "gkCatching",
  gk_parrying: "gkParrying",
  gk_reflexes: "gkReflexes",
  gk_reach: "gkReach",
};

// max_attributes uses different aliases for 3 stats (jump→jumping,
// place_kicking→set_piece_taking, ballWinning→tackling). STAT_MAP already maps
// `jumping` is NOT a base key (base uses `jump`), so only these overrides land.
const MAX_STAT_MAP: Record<string, string> = {
  ...STAT_MAP,
  jumping: "maxJump",
  set_piece_taking: "maxPlaceKicking",
  // STAT_MAP already has tackling→ballWinning; override to the max column.
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

// Derived body-model floats (efootbase "Body Model" detail panel). efootbase dump
// exposes these directly; before 2026-10-08 they defaulted to 0 and the detail page
// showed wrong jump/arm/torso measurements.peakJumpHeight maps from `jump_height`
// (efootbase name) — not a Konami "max jump", it's the body-model derived float.
const DERIVED_MAP: Record<string, string> = {
  leg_coverage_radius: "legCoverage",
  arm_coverage_radius: "armCoverage",
  jump_height: "peakJumpHeight",
  torso_collision: "torsoCollisionWidth",
  dribble_height: "dribbleHeight",
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
  const teamName = new Map<string, { hash: string | null; nationality: string | null; league: number | null }>();
  const leagueEmblemHash = new Map<number, string>();
  const featuredPack = new Map<string, { time: number; type: string }>();
  // booster id → inline booster object from dump (Phase 1c seeds these).
  const boosterDump = new Map<number, { name?: string; add?: number; stats?: Record<string, number> }>();

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
        league: r.league ?? null,
      });
    }
    // collect league OID → emblem hash (first occurrence per league).
    const lid = r.league;
    if (lid != null && !leagueEmblemHash.has(lid)) {
      const h = basename(r.emblem_images?.league ?? null);
      if (h) leagueEmblemHash.set(lid, h);
    }
    const feat = r.featured ?? null;
    if (feat && feat !== "none" && !featuredPack.has(feat)) {
      const isSpecial = /strike arena|j\.league|selection/i.test(feat);
      featuredPack.set(feat, {
        time: r.time_added ?? 0,
        type: isSpecial ? "special_list" : "pack",
      });
    }
    // Collect distinct booster objects by ID (cards reference IDs that don't
    // exist in fixtures/boosters.json — dumped inline here). Phase 1c upserts
    // them into the Booster table so the player detail + compare pages can
    // render the real name + stat magnitudes instead of "Booster #{id}".
    for (const [bid, bobj] of [[r.booster_id, r.booster], [r.booster2_id, r.booster2]] as Array<[number | null | undefined, { name?: string; add?: number; stats?: Record<string, number> } | null | undefined]>) {
      if (bid == null || bobj == null) continue;
      if (!boosterDump.has(bid)) boosterDump.set(bid, bobj);
    }
  }
  console.log(`  rows: ${rows.length} | countries: ${nationalityName.size} | teams: ${teamName.size} | leagues: ${leagueEmblemHash.size} | packs: ${featuredPack.size} | boosters: ${boosterDump.size}`);

  // ── Phase 1b: wipe + upsert Country / League / Team / Pack / Manager / Booster ──
  console.log("phase 1b: wipe community/cascade-safe tables + upsert Country/League/Team/Pack/Manager/Booster…");
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
    prisma.league.deleteMany({}),
    prisma.country.deleteMany({}),
    prisma.booster.deleteMany({}),
    prisma.manager.deleteMany({}),
    prisma.featuredBundleCard.deleteMany({}),
    prisma.featuredBundle.deleteMany({}),
  ]);

  // League: seed 34 leagues from fixtures/leagues.json (from /api/meta) + R2 emblem.
  const leaguesFixture = JSON.parse(
    readFileSync(resolve(__dirname, "../fixtures/leagues.json"), "utf-8"),
  ) as { leagues: Record<string, { name: string; region: string }> };
  await prisma.league.createMany({
    data: Object.entries(leaguesFixture.leagues).map(([oid, info]) => {
      const id = Number(oid);
      const hash = leagueEmblemHash.get(id);
      return {
        id,
        name: info.name,
        region: info.region,
        emblemUrl: hash ? `${R2_BASE}/emblems/league/${hash}` : null,
      };
    }),
    skipDuplicates: true,
  });
  console.log(`  leagues upserted: ${Object.keys(leaguesFixture.leagues).length}`);

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
    data: [...teamName.entries()].map(([name, { hash, nationality, league }], i) => ({
      id: i + 1,
      name,
      national: nationality != null && nationality === name,
      emblemUrl: hash ? `${R2_BASE}/emblems/team/${hash}` : null,
      countryId: nationality ? (countryNameToId.get(nationality) ?? null) : null,
      leagueId: league ?? null,
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

  // Manager: seed 65 from efootbase APK bundled managers.json (committed as fixture).
  const managersPath = resolve(__dirname, "../fixtures/managers.json");
  if (existsSync(managersPath)) {
    const managers = JSON.parse(readFileSync(managersPath, "utf-8")) as Array<{
      id: string; name: string; rating?: number;
      booster_1?: string; booster_2?: string; image?: string;
    }>;
    await prisma.manager.createMany({
      data: managers.map((m) => ({
        id: BigInt(m.id),
        name: m.name,
        rating: m.rating ?? 0,
        booster1Stat: m.booster_1 ?? null,
        booster2Stat: m.booster_2 ?? null,
        imageUrl: m.image ? `${R2_BASE}/managers/${m.image}` : null,
      })),
      skipDuplicates: true,
    });
    console.log(`  managers upserted: ${managers.length}`);
  } else {
    console.log("  ⚠ fixtures/managers.json missing — skipping Manager seed");
  }

  // Booster: seed standard (21) + basic (30) from efootbase APK boosters.json (committed as fixture).
  // Map the 27-element `bonus[]` array (statKeys order) → sparse stat columns.
  const boostersPath = resolve(__dirname, "../fixtures/boosters.json");
  if (existsSync(boostersPath)) {
    const bdef = JSON.parse(readFileSync(boostersPath, "utf-8")) as {
      standard: Array<{ id: number; nameEn: string; nameJa?: string; bonus: number[] }>;
      basic: Array<{ id: number; nameEn: string; nameJa?: string; bonus: number[] }>;
    };
    // statKeys order → Prisma column (snake_case → camelCase, efootbase aliases normalized).
    const boosterStatColumns = [
      "offensiveAwareness","ballControl","tightPossession","dribbling","lowPass","loftedPass",
      "finishing","placeKicking","curl","heading","defensiveAwareness","defensiveEngagement",
      "ballWinning","aggression","kickingPower","speed","acceleration","balance",
      "physicalContact","jump","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach",
      "stamina","weakFootAccuracy",
    ] as const;
    const boosterRows: Prisma.BoosterUncheckedCreateInput[] = [];
    for (const tier of ["standard", "basic"] as const) {
      for (const b of bdef[tier]) {
        const entry: Prisma.BoosterUncheckedCreateInput = {
          id: b.id,
          name: b.nameEn,
          japName: b.nameJa ?? null,
          tier,
          magnitude: b.nameEn.includes("+1") ? 1 : b.nameEn.includes("+2") ? 2
            : b.nameEn.includes("+3") ? 3 : b.nameEn.includes("+4") ? 4 : 0,
        };
        // Spread bonus array → stat columns (only non-zero stored; defaults are 0).
        for (let i = 0; i < boosterStatColumns.length && i < b.bonus.length; i++) {
          const v = b.bonus[i]!;
          if (v !== 0) (entry as Record<string, unknown>)[boosterStatColumns[i]!] = v;
        }
        boosterRows.push(entry);
      }
    }
    await prisma.booster.createMany({ data: boosterRows, skipDuplicates: true });
    console.log(`  boosters upserted: ${boosterRows.length} (standard ${bdef.standard.length} + basic ${bdef.basic.length})`);
  } else {
    console.log("  ⚠ fixtures/boosters.json missing — skipping Booster seed");
  }

  // ── Phase 1c: upsert Booster rows from the dump (inline booster objects).
  // Cards reference boosterId1/2 IDs that are NOT in fixtures/boosters.json
  // (dump uses ids 12–516 + 112 distinct formulas; fixtures only 0–29). Without
  // this the UI shows "Booster #199". The dump's name is generic ("Booster +N"),
  // so we synthesize a readable stat-suffix name from the bumped stats. Upsert
  // so fixtures' prettier names ("Accuracy +1", "Aerial +1"…) win on id overlap.
  if (boosterDump.size > 0) {
    const boosterStatCols = [
      "offensiveAwareness","ballControl","tightPossession","dribbling","lowPass","loftedPass",
      "finishing","placeKicking","curl","heading","defensiveAwareness","defensiveEngagement",
      "ballWinning","aggression","kickingPower","speed","acceleration","balance",
      "physicalContact","jump","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach",
      "stamina","weakFootAccuracy",
    ] as const;
    // human-readable stat labels for the synthesized booster name.
    const statLabel: Record<string, string> = {
      offensive_awareness: "OAware", ball_control: "BControl", dribbling: "Dribble",
      tight_possession: "TightPoss", low_pass: "LowPass", lofted_pass: "LoftPass",
      finishing: "Finish", place_kicking: "SetPiece", curl: "Curl", heading: "Heading",
      defensive_awareness: "DAware", defensive_engagement: "DEngage", tackling: "Tackle",
      aggression: "Aggression", kicking_power: "KickPow", speed: "Speed",
      acceleration: "Accel", balance: "Balance", physical_contact: "PhysCont",
      jump: "Jump", stamina: "Stamina", gk_awareness: "GKAware", gk_catching: "GKCatch",
      gk_parrying: "GKParry", gk_reflexes: "GKReflex", gk_reach: "GKReach",
      weak_foot_accuracy: "WeakFoot",
    };
    let dumpBoosterCount = 0;
    for (const [bid, bobj] of boosterDump) {
      const add = bobj.add ?? 0;
      const stats = bobj.stats ?? {};
      const statEntries = Object.entries(stats)
        .filter(([, v]) => (v as number) !== 0)
        .sort((a, b) => (b[1] as number) - (a[1] as number));
      // synthesize readable name: "Booster +3 · Finish, KickPow, LowPass"
      // (omit the suffix entirely when the booster has no bumped stats — some
      // dump entries are "+1 magnitude, no specific stat", so render just
      // "Booster +1" rather than the ugly "Booster +1 · ".)
      const statNames = statEntries
        .map(([k]) => statLabel[k] ?? k)
        .slice(0, 4)
        .join(", ");
      const prettyName = statNames ? `Booster +${add} · ${statNames}` : `Booster +${add}`;
      const entry: Prisma.BoosterUncheckedCreateInput = {
        id: bid,
        name: prettyName,
        tier: "standard",
        magnitude: add,
      };
      for (const [snakeKey, v] of statEntries) {
        const col = STAT_MAP[snakeKey] ?? (snakeKey === "weak_foot_accuracy" ? "weakFootAccuracy" : null);
        if (col && boosterStatCols.includes(col as typeof boosterStatCols[number])) {
          (entry as Record<string, unknown>)[col] = v as number;
        }
      }
      await prisma.booster.upsert({
        where: { id: bid },
        create: entry,
        update: entry, // dump ids 12–516 don't collide with fixtures; but if they do, dump wins (cards reference dump ids)
      });
      dumpBoosterCount++;
    }
    console.log(`  boosters from dump upserted: ${dumpBoosterCount} (distinct ids behind cards)`);
  }

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
      const teamId = r.team_name ? (teamNameToId.get(r.team_name) ?? null) : null;

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

      // Derived body-model floats (efootbase "Body Model" detail panel).
      const derivedData: Record<string, number> = {};
      for (const [efbKey, dbKey] of Object.entries(DERIVED_MAP)) {
        const v = (r as unknown as Record<string, number | undefined>)[efbKey];
        derivedData[dbKey] = v != null ? Number(v) : 0;
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
        shirt: r.shirt_number != null ? String(r.shirt_number) : null,
        shirtNational: null,
        nationalityId,
        country2Id: null,
        height: r.height ?? 170,
        weight: r.weight ?? 70,
        age: r.age ?? 25,
        strongerFoot: r.foot ?? 0,
        registeredPosition: registeredPos,
        playingStyleAttack: r.playing_style ?? 0,
        // efootbase dump exposes the defensive playstyle as `playing_style_2`
        // (efootbase players_meta.json "playing_style_2" — Pass Disruptor, Basic,
        // etc.). Was hardcoded 0 which lost the defensive style shown on efootbase.
        playingStyleDefense: r.playing_style_2 ?? 0,
        cardType: CARD_TYPE_MAP[r.card_type ?? 0] ?? "STANDARD",
        featuredPackId,
        dreamTeam: r.dream_team === 1,
        teamId,
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
        views: r.views ?? 0,
        ratingCount: r.ratingCount ?? 0,
        avgRating: r.avgRating ?? null,
        ...statData,
        ...maxStatData,
        ...posData,
        ...ratingData,
        ...physiqueData,
        ...derivedData,
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

  // ── Phase 4: seed FeaturedBundle from efootbase /api/packs ──────────────
  // efootbase /packs page lists 24 bundles = 17 specialPlayerList (homepage
  // carousel) + 7 spotlight packs (individual player/manager spotlights: "Leo
  // Messi 2027", "Lamine Yamal 2027", "José Mourinho 11-22", …). Both arrays
  // share the same entry shape (name + time + ordered `list` of player IDs).
  // We seed specialPlayerList at position 0–16 then the 7 spotlights at
  // position 17–23, so featured.list returns all 24 in efootbase /packs order.
  if (existsSync(PACKS_PATH)) {
    console.log("phase 4: seeding FeaturedBundle from specialPlayerList + spotlights…");
    const packsDump = JSON.parse(readFileSync(PACKS_PATH, "utf-8")) as {
      data: {
        specialPlayerList: Array<{ name: string; time: number; list: number[] }>;
        packs: Array<{ name: string; time: number; list: number[] }>;
      };
    };
    const spl = packsDump.data?.specialPlayerList ?? [];
    const spotlights = packsDump.data?.packs ?? [];
    // Build a Set of all player ids in the dump for existence filtering.
    const playerIdSet = new Set(rows.map((r) => (r.id != null ? String(r.id) : "")));

    let bundleCount = 0;
    let bundleCardCount = 0;
    // Iterate both arrays in order; spotlights use a `spotlight-` slug prefix
    // so they can't collide with a same-named specialPlayerList bundle.
    type Entry = { name: string; time: number; list: number[]; slugPrefix: "" | "spotlight-" };
    const entries: Entry[] = [
      ...spl.map((s) => ({ name: s.name, time: s.time, list: s.list, slugPrefix: "" as const })),
      ...spotlights.map((s) => ({ name: s.name, time: s.time, list: s.list, slugPrefix: "spotlight-" as const })),
    ];
    for (let i = 0; i < entries.length; i++) {
      const s = entries[i]!;
      const slug = s.slugPrefix + slugify(s.name);
      const releaseDate = s.time > 0 ? new Date(s.time * 1000) : new Date();
      // Use upsert on slug so re-runs stay idempotent (slug is @unique).
      const bundle = await prisma.featuredBundle.upsert({
        where: { slug },
        create: { name: s.name, slug, releaseDate, position: i },
        update: { name: s.name, releaseDate, position: i },
      });
      bundleCount++;

      // Cards in efootbase `list` order; ordinal preserves that exact order.
      // Skip any player id not present in players.jsonl (defensive — efootbase
      // sometimes lists ids that the players endpoint omits).
      const cardRows: { bundleId: number; playerId: bigint; ordinal: number }[] = [];
      for (let j = 0; j < s.list.length; j++) {
        const pid = s.list[j];
        if (pid == null) continue;
        if (!playerIdSet.has(String(pid))) continue;
        cardRows.push({ bundleId: bundle.id, playerId: BigInt(pid), ordinal: j });
      }
      if (cardRows.length > 0) {
        await prisma.featuredBundleCard.createMany({
          data: cardRows,
          skipDuplicates: true,
        });
        bundleCardCount += cardRows.length;
      }
    }
    console.log(`  featuredBundles upserted: ${bundleCount} (${spl.length} featured + ${spotlights.length} spotlights) | cards: ${bundleCardCount}`);
  } else {
    console.log("  ⚠ dump/efootbase/packs.json missing — skipping FeaturedBundle seed");
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
