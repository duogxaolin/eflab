// playerRouter — implements list (11 filters + 60+ sort), byId (full card),
// search (fuzzy), and compare (2–4 cards aligned matrix).
import { prisma } from "@eflab/db";
import {
  BASE_STATS,
  POSITIONS,
  type BaseStat,
  type BoosterDTO,
  type CardType,
  type PlayerCardDTO,
  type PlayerListResult,
} from "@eflab/shared";
import { playerListInput, playerByIdInput, playerSearchInput, compareInput } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

// Helper: convert a list of stat keys into a DB column name.
const statDbColumn: Record<BaseStat, string> = {
  offensiveAwareness: "offensiveAwareness",
  ballControl: "ballControl",
  dribbling: "dribbling",
  tightPossession: "tightPossession",
  lowPass: "lowPass",
  loftedPass: "loftedPass",
  finishing: "finishing",
  heading: "heading",
  placeKicking: "placeKicking",
  curl: "curl",
  speed: "speed",
  acceleration: "acceleration",
  kickingPower: "kickingPower",
  jump: "jump",
  physicalContact: "physicalContact",
  balance: "balance",
  stamina: "stamina",
  defensiveAwareness: "defensiveAwareness",
  ballWinning: "ballWinning",
  defensiveEngagement: "defensiveEngagement",
  aggression: "aggression",
  gkAwareness: "gkAwareness",
  gkCatching: "gkCatching",
  gkParrying: "gkParrying",
  gkReflexes: "gkReflexes",
  gkReach: "gkReach",
};
const POS_APTITUDE_DB: Record<typeof POSITIONS[number], string> = {
  GK: "posGK", LB: "posLB", RB: "posRB", CB: "posCB", DMF: "posDMF",
  CMF: "posCMF", LMF: "posLMF", RMF: "posRMF", AMF: "posAMF", LWF: "posLWF",
  RWF: "posRWF", SS: "posSS", CF: "posCF",
};
const RATING_DB: Record<typeof POSITIONS[number], string> = {
  GK: "ratingGK", LB: "ratingLB", RB: "ratingRB", CB: "ratingCB", DMF: "ratingDMF",
  CMF: "ratingCMF", LMF: "ratingLMF", RMF: "ratingRMF", AMF: "ratingAMF", LWF: "ratingLWF",
  RWF: "ratingRWF", SS: "ratingSS", CF: "ratingCF",
};

// PosiTion index → canonical name
const POSITION_INDEX: readonly (typeof POSITIONS)[number][] = POSITIONS;
const STAT_KEYS: readonly BaseStat[] = BASE_STATS;

// Convert a DB player row to the wire DTO.
function toCardDTO(p: PlayerRowForDto): PlayerCardDTO {
  const baseStats: Partial<Record<BaseStat, number>> = {};
  for (const s of STAT_KEYS) {
    const v = (p as unknown as Record<string, unknown>)[statDbColumn[s]];
    baseStats[s] = Number(v);
  }
  const maxStats: Partial<Record<BaseStat, number>> = {};
  for (const s of STAT_KEYS) {
    const head = s[0] ?? "O";
    const col = `max${head.toUpperCase()}${s.slice(1)}` as const;
    const v = (p as unknown as Record<string, unknown>)[col];
    maxStats[s] = Number(v);
  }
  const positionAptitudes: Partial<Record<typeof POSITIONS[number], number>> = {};
  for (const pos of POSITION_INDEX) {
    positionAptitudes[pos] = Number((p as unknown as Record<string, unknown>)[POS_APTITUDE_DB[pos]] ?? 2);
  }
  const positionRatings: Partial<Record<typeof POSITIONS[number], number>> = {};
  for (const pos of POSITION_INDEX) {
    positionRatings[pos] = Number((p as unknown as Record<string, unknown>)[RATING_DB[pos]] ?? 40);
  }
  return {
    id: p.id.toString(),
    baseId: p.baseId.toString(),
    name: p.name,
    accentedName: p.accentedName ?? null,
    japName: p.japName ?? null,
    chineseName: p.chineseName ?? null,
    shirt: p.shirt ?? null,
    shirtNational: p.shirtNational ?? null,
    nationalityId: p.nationalityId,
    country2Id: p.country2Id ?? null,
    height: p.height,
    weight: p.weight,
    age: p.age,
    strongerFoot: p.strongerFoot,
    registeredPosition: p.registeredPosition,
    playingStyleAttack: p.playingStyleAttack,
    playingStyleDefense: p.playingStyleDefense,
    cardType: p.cardType as CardType,
    featuredPackId: p.featuredPackId ?? null,
    ovr: p.ovr,
    maxOvr: p.maxOvr,
    condition: p.condition,
    form: p.form,
    injuryResistance: p.injuryResistance,
    weakFootUsage: p.weakFootUsage,
    weakFootAccuracy: p.weakFootAccuracy,
    releaseDate: p.releaseDate ? new Date(p.releaseDate).toISOString() : null,
    datapackId: p.datapackId,
    stats: baseStats as Record<BaseStat, number>,
    maxStats: maxStats as Record<BaseStat, number>,
    positionAptitudes: positionAptitudes as Record<typeof POSITIONS[number], number>,
    positionRatings: positionRatings as Record<typeof POSITIONS[number], number>,
    physique: {
      neckLength: p.neckLength,
      neckSize: p.neckSize,
      shoulderHeight: p.shoulderHeight,
      shoulderWidth: p.shoulderWidth,
      chestMeasurement: p.chestMeasurement,
      waistSize: p.waistSize,
      armSize: p.armSize,
      armLength: p.armLength,
      thighSize: p.thighSize,
      calfSize: p.calfSize,
      legLength: p.legLength,
    },
    derived: {
      legCoverage: p.legCoverage,
      armCoverage: p.armCoverage,
      peakJumpHeight: p.peakJumpHeight,
      torsoCollisionWidth: p.torsoCollisionWidth,
      dribbleHeight: p.dribbleHeight,
    },
    tactics: {
      possessionGame: p.possessionGame,
      quickCounter: p.quickCounter,
      longBallCounter: p.longBallCounter,
      outWide: p.outWide,
      longBall: p.longBall,
    },
    playstyles: {
      trickster: p.trickster,
      mazingRun: p.mazingRun,
      speedingBullet: p.speedingBullet,
      incisiveRun: p.incisiveRun,
      longBallExpert: p.longBallExpert,
      earlyCross: p.earlyCross,
    },
    // populated at the call site (joined skill rows)
    skills: ((p as PlayerRowWithSkills).skills ?? []).map(ps => ps.skill?.slug ?? "").filter(Boolean),
    boosterId1: p.boosterId1,
    boosterId2: p.boosterId2,
    booster1: ((p as PlayerRowWithBoosters).booster1) ?? null,
    booster2: ((p as PlayerRowWithBoosters).booster2) ?? null,
    otherVersions: ((p as PlayerRowWithVersions).otherVersions ?? []).map(v => ({
      id: v.id.toString(), cardType: v.cardType as CardType, ovr: v.ovr, maxOvr: v.maxOvr,
      registeredPosition: v.registeredPosition,
    })),
    pack: ((p as PlayerRowWithPack).pack as PlayerRowWithPack["pack"]) ?? null,
    communityTier: p.communityTier ?? null,
    // R2 image URLs (optional, populated when caller joins Country for flag).
    flagUrl: ((p as PlayerRowWithFlag).flagUrl) ?? null,
    teamEmblemUrl: ((p as PlayerRowWithFlag).teamEmblemUrl) ?? null,
    // Display-name + emblem overlays (joined Team/Country/League in the procedure).
    countryName: ((p as PlayerRowWithExtras).countryName) ?? null,
    teamName: ((p as PlayerRowWithExtras).teamName) ?? null,
    leagueName: ((p as PlayerRowWithExtras).leagueName) ?? null,
    leagueEmblemUrl: ((p as PlayerRowWithExtras).leagueEmblemUrl) ?? null,
  };
}

// Batch-attach Country.flagUrl (R2 URL) to a list of players by their nationalityId.
// Callers that return PlayerCardDTO[] should run rows through this before toCardDTO.
async function attachFlagUrls<T extends PlayerRowForDto>(rows: T[]): Promise<T[]> {
  const distinctIds = Array.from(new Set(rows.map(r => r.nationalityId).filter(id => id > 0)));
  if (distinctIds.length === 0) return rows;
  const countries = await prisma.country.findMany({
    where: { id: { in: distinctIds } },
    select: { id: true, flagUrl: true },
  });
  const flagById = new Map<number, string | null>(countries.map(c => [c.id, c.flagUrl]));
  for (const r of rows) {
    if (r.nationalityId > 0) r.flagUrl = flagById.get(r.nationalityId) ?? null;
  }
  return rows;
}

// All Booster stat columns (matches BASE_STATS order — Booster table mirrors it).
const BOOSTER_STAT_COLUMNS = [
  "offensiveAwareness","ballControl","tightPossession","dribbling","lowPass","loftedPass",
  "finishing","placeKicking","curl","heading","defensiveAwareness","defensiveEngagement",
  "ballWinning","aggression","kickingPower","speed","acceleration","balance",
  "physicalContact","jump","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach",
  "stamina","weakFootAccuracy",
] as const;

// Convert a Booster row (from Prisma findMany) → BoosterDTO. Only non-zero stat
// magnitudes are carried (sparse), so the UI can render "+4 Low Pass" pills.
// Prisma returns Int? columns as `number | null`; we coerce null→0/undefined.
function boosterRowToDTO(b: {
  id: number; name: string; magnitude: number; tier: string;
  offensiveAwareness?: number | null; ballControl?: number | null; dribbling?: number | null; tightPossession?: number | null;
  lowPass?: number | null; loftedPass?: number | null; finishing?: number | null; placeKicking?: number | null; curl?: number | null;
  heading?: number | null; defensiveAwareness?: number | null; defensiveEngagement?: number | null; ballWinning?: number | null;
  aggression?: number | null; kickingPower?: number | null; speed?: number | null; acceleration?: number | null; balance?: number | null;
  physicalContact?: number | null; jump?: number | null; gkAwareness?: number | null; gkCatching?: number | null; gkParrying?: number | null;
  gkReflexes?: number | null; gkReach?: number | null; stamina?: number | null; weakFootAccuracy?: number | null;
}): BoosterDTO {
  const stats: Partial<Record<BaseStat, number>> = {};
  for (const col of BOOSTER_STAT_COLUMNS) {
    const v = (b as Record<string, unknown>)[col];
    if (typeof v === "number" && v !== 0) {
      stats[col as BaseStat] = v;
    }
  }
  return { id: b.id, name: b.name, magnitude: b.magnitude, tier: b.tier, stats };
}

// Batch-resolve Booster rows by the distinct boosterId1/boosterId2 across a list
// of players, then write the resolved objects back (mirrors attachFlagUrls).
// Cards reference booster IDs NOT in fixtures/boosters.json — seeder Phase 1c
// upserts them from the dump, so this lookup can resolve them to real names.
async function attachBoosters<T extends PlayerRowForDto>(rows: T[]): Promise<T[]> {
  const idSet = new Set<number>();
  for (const r of rows) {
    if (r.boosterId1 != null && r.boosterId1 > 0) idSet.add(r.boosterId1);
    if (r.boosterId2 != null && r.boosterId2 > 0) idSet.add(r.boosterId2);
  }
  if (idSet.size === 0) {
    for (const r of rows) { (r as PlayerRowWithBoosters).booster1 = null; (r as PlayerRowWithBoosters).booster2 = null; }
    return rows;
  }
  const boosters = await prisma.booster.findMany({ where: { id: { in: Array.from(idSet) } } });
  const byId = new Map<number, BoosterDTO>(boosters.map(b => [b.id, boosterRowToDTO(b)]));
  for (const r of rows) {
    const rb = r as PlayerRowWithBoosters;
    rb.booster1 = (r.boosterId1 != null && r.boosterId1 > 0) ? (byId.get(r.boosterId1) ?? null) : null;
    rb.booster2 = (r.boosterId2 != null && r.boosterId2 > 0) ? (byId.get(r.boosterId2) ?? null) : null;
  }
  return rows;
}

// Map sort field name → Prisma orderBy record. Only a subset is mapped to columns;
// some derive from synthetic computations (sumOfAbilities, averageAbility).
function orderByFor(sort: string, order: "asc" | "desc"): Record<string, "asc" | "desc"> {
  const direction = order;
  if (sort === "releaseDate" || sort === "recentlyAdded") return { releaseDate: direction };
  if (sort === "playerId") return { id: direction };
  if (sort === "name" || sort === "namePrint") return { name: direction };
  if (sort === "japName") return { japName: direction };
  if (sort === "chineseName") return { chineseName: direction };
  if (sort === "club") return { featuredPackId: direction };
  if (sort === "nationality") return { nationalityId: direction };
  if (sort === "ovr") return { ovr: direction };
  if (sort === "maxOvr" || sort === "maxLevel") return { maxOvr: direction };
  if (sort === "age") return { age: direction };
  if (sort === "height") return { height: direction };
  if (sort === "weight") return { weight: direction };
  if (sort === "playerValue" || sort === "marketValue") return { marketValue: direction };
  // base stats: sort is one of BASE_STATS keys.
  if ((statDbColumn as Record<string, string>)[sort]) {
    return { [statDbColumn[sort as BaseStat]]: direction };
  }
  // max stats: `max${Capitalized}`
  if (sort.startsWith("max")) {
    const letter = sort[3] ?? "O";
    const statKey = letter.toLowerCase() + sort.slice(4) as BaseStat;
    if ((statDbColumn as Record<string, string>)[statKey]) {
      return { [`max${letter}${sort.slice(4)}`]: direction } as Record<string, "asc" | "desc">;
    }
  }
  // position ratings: `rating${Position}`.
  if (sort.startsWith("rating")) {
    return { [`rating${sort.slice(6).toUpperCase()}`.replace("ratingCF","ratingCF")] : direction } as Record<string, "asc" | "desc">;
  }
  return { ovr: direction };
}

export const playerRouter = router({
  // Latest players: 18 card mới nhất theo releaseDate DESC (DISTINCT ON baseId
  // lấy version mới nhất của mỗi player). Tham chiếu efootbase "Latest Players" —
  // sort đơn giản theo ngày release, không ưu tiên artwork tier.
  trending: publicProcedure.query(async () => {
    const rows = await prisma.$queryRaw<
      Array<{
        id: bigint;
        baseId: bigint;
        name: string;
        cardType: string;
        ovr: number;
        maxOvr: number;
        registeredPosition: number;
        condition: string;
        playingStyleAttack: number;
        playingStyleDefense: number;
      }>
    >`
      SELECT id, "baseId", name, "cardType", ovr, "maxOvr", "registeredPosition", condition, "playingStyleAttack", "playingStyleDefense"
      FROM (
        SELECT DISTINCT ON ("baseId") id, "baseId", name, "cardType", ovr, "maxOvr", "registeredPosition", condition, "playingStyleAttack", "playingStyleDefense", "releaseDate"
        FROM "Player"
        ORDER BY "baseId", "releaseDate" DESC, "maxOvr" DESC
      ) sub
      ORDER BY "releaseDate" DESC, "maxOvr" DESC, ovr DESC
      LIMIT 18
    `;
    return rows.map((r) => ({
      id: r.id.toString(),
      baseId: r.baseId.toString(),
      name: r.name,
      cardType: r.cardType as CardType,
      ovr: r.ovr,
      maxOvr: r.maxOvr,
      registeredPosition: r.registeredPosition,
      condition: r.condition,
      playingStyleAttack: r.playingStyleAttack,
      playingStyleDefense: r.playingStyleDefense,
    }));
  }),

  // Paginated list with 11 filters + 60+ sort options.
  list: publicProcedure
    .input(playerListInput)
    .query(async ({ input }): Promise<PlayerListResult> => {
      const page = input.page;
      const limit = input.limit;
      const skip = (page - 1) * limit;
      const where: Record<string, unknown> = { AND: [] as unknown[] };
      const and = where.AND as unknown[];
      if (input.q) {
        (and as unknown[]).push({
          OR: [
            { name: { contains: input.q, mode: "insensitive" as const } },
            { accentedName: { contains: input.q, mode: "insensitive" as const } },
            { japName: { contains: input.q, mode: "insensitive" as const } },
            { chineseName: { contains: input.q, mode: "insensitive" as const } },
          ],
        });
      }
      if (input.cardType) (and as unknown[]).push({ cardType: input.cardType });
      if (input.cardTypeIn && input.cardTypeIn.length > 0) (and as unknown[]).push({ cardType: { in: input.cardTypeIn } });
      if (input.position) (and as unknown[]).push({ [POS_APTITUDE_DB[input.position]]: { in: [0, 1] } });
      if (input.playingStyle !== undefined) (and as unknown[]).push({ playingStyleAttack: input.playingStyle });
      if (input.defensiveStyle !== undefined) (and as unknown[]).push({ playingStyleDefense: input.defensiveStyle });
      if (input.ovrMin || input.ovrMax) {
        (and as unknown[]).push({ ovr: { gte: input.ovrMin ?? 40, lte: input.ovrMax ?? 99 } });
      }
      if (input.maxOvrMin || input.maxOvrMax) {
        (and as unknown[]).push({ maxOvr: { gte: input.maxOvrMin ?? 40, lte: input.maxOvrMax ?? 120 } });
      }
      if (input.weakFoot) (and as unknown[]).push({ weakFootAccuracy: { gte: Number(input.weakFoot) } });
      if (input.strongerFoot !== undefined) (and as unknown[]).push({ strongerFoot: input.strongerFoot });
      if (input.nationalityId !== undefined) (and as unknown[]).push({ nationalityId: input.nationalityId });
      if (input.clubId !== undefined) (and as unknown[]).push({ featuredPackId: String(input.clubId) });
      if (input.skillId !== undefined) (and as unknown[]).push({ skills: { some: { skillId: input.skillId } } });
      // Remove empty AND if no conditions
      if ((and as unknown[]).length === 0) delete where.AND;
      const orderBy = orderByFor(input.sort, input.order);
      const [total, rows] = await prisma.$transaction([
        prisma.player.count({ where }),
        prisma.player.findMany({
          where, orderBy, skip, take: limit,
          include: { skills: { include: { skill: { select: { slug: true } } } } },
        }),
      ]);
      const rowsWithFlag = await attachFlagUrls(rows as PlayerRowForDto[]);
      await attachBoosters(rowsWithFlag);
      return {
        items: rowsWithFlag.map(toCardDTO),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }),

  // Full card details by baseId + cardId path params.
  byId: publicProcedure.input(playerByIdInput).query(async ({ input }) => {
    const p = await prisma.player.findUnique({
      where: { id: input.cardId },
      include: {
        skills: { include: { skill: true } },
        packCards: { include: { pack: { select: { id: true, name: true } } } },
        team: { select: {
          id: true, name: true, emblemUrl: true,
          country: { select: { id: true, name: true } },
          league: { select: { id: true, name: true, emblemUrl: true } },
        } },
      },
    });
    if (!p) return null;
    // Fetch other versions sharing the same baseId (excluding self).
    const others = await prisma.player.findMany({
      where: { baseId: p.baseId, NOT: { id: p.id } },
      select: { id: true, cardType: true, ovr: true, maxOvr: true, registeredPosition: true },
      orderBy: { ovr: "desc" },
    });
    const packRel = (p as PlayerRowWithPack).packCards?.[0]?.pack ?? null;
    // Resolve the player's Country (for the flag + name). We have the team's
    // nested country from the include above, but Player.nationalityId is the
    // player's *nationality* which may differ from the team's country (e.g. a
    // Brazilian playing for a Spanish club) — so look up by nationalityId.
    let flagUrl: string | null = null;
    let countryName: string | null = null;
    if (p.nationalityId > 0) {
      const c = await prisma.country.findUnique({
        where: { id: p.nationalityId },
        select: { flagUrl: true, name: true },
      });
      flagUrl = c?.flagUrl ?? null;
      countryName = c?.name ?? null;
    }
    const team = (p as { team?: { id: number; name: string; emblemUrl: string | null; country: { id: number; name: string } | null; league: { id: number; name: string; emblemUrl: string | null } | null } }).team
      ?? null;
    const row: PlayerRowForDto = {
      ...(p as unknown as PlayerRowForDto),
      skills: (p as PlayerRowWithSkills).skills,
      otherVersions: others,
      pack: packRel,
      flagUrl,
      teamEmblemUrl: team?.emblemUrl ?? null,
      countryName,
      teamName: team?.name ?? null,
      leagueName: team?.league?.name ?? null,
      leagueEmblemUrl: team?.league?.emblemUrl ?? null,
    } as PlayerRowForDto;
    // Resolve Booster rows for boosterId1/boosterId2 (real names from the dump).
    await attachBoosters([row]);
    return toCardDTO(row);
  }),

  // Fuzzy search by name — returns top N matches.
  // Uses pg_trgm similarity (`%`) on name + accentedName + unaccent expression so
  // "schar" matches "Fabian Schär" across accents.
  search: publicProcedure.input(playerSearchInput).query(async ({ input }) => {
    const q = input.q.replace(/\s+/g, " ").trim();
    // Prisma can't express the `%` similarity operator directly; use $queryRaw with
    // parameter binding.
    //
    // Ranking (fixed 2026-10-08):
    //   tier 0 = exact substring match on name          ("Cristiano Ronaldo" ⊆ "Cristiano Ronaldo")
    //   tier 1 = exact substring match on accentedName
    //   tier 2 = unaccent-stripped substring match       (so "Schär" ⊆ "Fabian Schär")
    //   tier 3 = pg_trgm `similarity()` fuzzy            (catches "Schar" / "Schârrrr")
    // Within a tier, fall back to similarity() desc → ovr desc. This puts the real
    // CR7 / Bellingham on top instead of letting 1-word "Cristiano" / "Ronaldo"
    // / "Gillingham" drown the exact match — which broke /compare player pick
    // (limit 5 truncated the true match that ranked CASE=0 then DESC-sunk below
    // 0.4-fuzzy noise). See DB trace notes in session 2026-10-08.
    const rows: Array<Record<string, unknown>> = await prisma.$queryRaw`
      SELECT id::text, "baseId"::text, name, "accentedName", "japName", "chineseName",
             "cardType"::text, ovr, "maxOvr", "registeredPosition",
             "nationalityId", condition
      FROM "Player"
      WHERE name % ${q}
         OR "accentedName" % ${q}
         OR name ILIKE '%' || ${q} || '%'
         OR "accentedName" ILIKE '%' || ${q} || '%'
         OR unaccent(coalesce("accentedName", name)) ILIKE '%' || ${q} || '%'
      ORDER BY
        CASE
          WHEN name ILIKE '%' || ${q} || '%' THEN 0
          WHEN "accentedName" ILIKE '%' || ${q} || '%' THEN 1
          WHEN unaccent(coalesce("accentedName", name)) ILIKE '%' || ${q} || '%' THEN 2
          ELSE 3
        END ASC,
        similarity(coalesce("accentedName", name), ${q}) DESC,
        ovr DESC
      LIMIT ${input.limit}
    ` as Array<Record<string, unknown>>;
    return rows.map(r => ({
      id: r.id as string,
      baseId: r.baseId as string,
      name: r.name as string,
      accentedName: r.accentedName as string | null,
      japName: r.japName as string | null,
      chineseName: r.chineseName as string | null,
      cardType: r.cardType as CardType,
      ovr: r.ovr as number,
      maxOvr: r.maxOvr as number,
      registeredPosition: r.registeredPosition as number,
      nationalityId: r.nationalityId as number,
      condition: r.condition as string,
    }));
  }),

  // Compare 2–4 cards — returns aligned stat matrix.
  compare: publicProcedure.input(compareInput).query(async ({ input }) => {
    const rows = await prisma.player.findMany({
      where: { id: { in: input.cardIds } },
      include: {
        skills: { include: { skill: { select: { slug: true, name: true } } } },
        team: { select: {
          id: true, name: true, emblemUrl: true,
          country: { select: { id: true, name: true } },
          league: { select: { id: true, name: true, emblemUrl: true } },
        } },
      },
    });
    let rowsWithFlag = await attachFlagUrls(rows as PlayerRowForDto[]);
    // Attach team/league display names + emblems for the compare header.
    rowsWithFlag = rowsWithFlag.map((r) => {
      const team = (r as { team?: { name: string; emblemUrl: string | null; country: { name: string } | null; league: { name: string; emblemUrl: string | null } | null } }).team;
      return {
        ...r,
        teamEmblemUrl: team?.emblemUrl ?? null,
        countryName: null,
        teamName: team?.name ?? null,
        leagueName: team?.league?.name ?? null,
        leagueEmblemUrl: team?.league?.emblemUrl ?? null,
      };
    });
    await attachBoosters(rowsWithFlag);
    return rowsWithFlag.map(toCardDTO);
  }),

  // Return all countries for the Nationality filter
  countries: publicProcedure.query(async () => {
    return prisma.country.findMany({
      select: { id: true, name: true, flagUrl: true },
      orderBy: { name: "asc" },
    });
  }),
});

// ---- local type aliases (loose enough to bridge Prisma's generated types)
interface PlayerRowWithSkills {
  skills?: Array<{
    skill?: { slug: string; name?: string; id?: number };
    skillId?: number;
  }>;
}
interface PlayerRowWithVersions {
  otherVersions?: Array<{ id: bigint; cardType: string; ovr: number; maxOvr: number; registeredPosition: number }>;
}
interface PlayerRowWithPack {
  packCards?: Array<{ pack?: { id: string; name: string } }>;
  pack?: { id: string; name: string } | null;
}
// Optional image-URL overlay (set by the procedure after joining Country for the flag).
interface PlayerRowWithFlag {
  flagUrl?: string | null;
  teamEmblemUrl?: string | null;
}
// Optional display-name + emblem overlays (set by the procedure after joining the
// player's Team → League for the detail page's "Card Info" + 3-badge strip).
interface PlayerRowWithExtras {
  countryName?: string | null;
  teamName?: string | null;
  leagueName?: string | null;
  leagueEmblemUrl?: string | null;
}
// Optional resolved booster objects (set by attachBoosters before toCardDTO).
interface PlayerRowWithBoosters {
  booster1?: BoosterDTO | null;
  booster2?: BoosterDTO | null;
}
type PlayerRowForDto = Record<string, unknown> & PlayerRowWithSkills & PlayerRowWithVersions & PlayerRowWithPack & PlayerRowWithFlag & PlayerRowWithExtras & PlayerRowWithBoosters & {
  id: bigint;
  baseId: bigint;
  name: string;
  accentedName: string | null;
  japName: string | null;
  chineseName: string | null;
  shirt: string | null;
  shirtNational: string | null;
  nationalityId: number;
  country2Id: number | null;
  height: number;
  weight: number;
  age: number;
  strongerFoot: number;
  registeredPosition: number;
  playingStyleAttack: number;
  playingStyleDefense: number;
  cardType: string;
  featuredPackId: string | null;
  ovr: number;
  maxOvr: number;
  condition: string;
  form: number;
  injuryResistance: number;
  weakFootUsage: number;
  weakFootAccuracy: number;
  releaseDate: Date | null;
  datapackId: number;
  boosterId1: number | null;
  boosterId2: number | null;
  // physique
  neckLength: number; neckSize: number; shoulderHeight: number; shoulderWidth: number;
  chestMeasurement: number; waistSize: number; armSize: number; armLength: number;
  thighSize: number; calfSize: number; legLength: number;
  // derived
  legCoverage: number; armCoverage: number; peakJumpHeight: number; torsoCollisionWidth: number; dribbleHeight: number;
  // tactics
  possessionGame: number; quickCounter: number; longBallCounter: number; outWide: number; longBall: number;
  // playstyles
  trickster: boolean; mazingRun: boolean; speedingBullet: boolean; incisiveRun: boolean; longBallExpert: boolean; earlyCross: boolean;
  communityTier: string | null;
};
