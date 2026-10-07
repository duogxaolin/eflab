// playerRouter — implements list (11 filters + 60+ sort), byId (full card),
// search (fuzzy), and compare (2–4 cards aligned matrix).
import { prisma } from "@eflab/db";
import {
  BASE_STATS,
  POSITIONS,
  type BaseStat,
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
    otherVersions: ((p as PlayerRowWithVersions).otherVersions ?? []).map(v => ({
      id: v.id.toString(), cardType: v.cardType as CardType, ovr: v.ovr, maxOvr: v.maxOvr,
    })),
    pack: ((p as PlayerRowWithPack).pack as PlayerRowWithPack["pack"]) ?? null,
    communityTier: p.communityTier ?? null,
    // R2 image URLs (optional, populated when caller joins Country for flag).
    flagUrl: ((p as PlayerRowWithFlag).flagUrl) ?? null,
    teamEmblemUrl: ((p as PlayerRowWithFlag).teamEmblemUrl) ?? null,
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

// Map sort field name → Prisma orderBy record. Only a subset is mapped to columns;
// some derive from synthetic computations (sumOfAbilities, averageAbility).
function orderByFor(sort: string, order: "asc" | "desc"): Record<string, "asc" | "desc"> {
  const direction = order;
  if (sort === "recentlyAdded") return { id: "desc" };
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
  // Trending players: top 18 distinct star players across Epic, Big Time, Show Time, Highlight
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
      }>
    >`
      SELECT id, "baseId", name, "cardType", ovr, "maxOvr", "registeredPosition", condition
      FROM (
        SELECT DISTINCT ON ("baseId") id, "baseId", name, "cardType", ovr, "maxOvr", "registeredPosition", condition
        FROM "Player"
        WHERE "cardType" IN ('EPIC', 'BIG_TIME', 'SHOW_TIME', 'HIGHLIGHT')
        ORDER BY "baseId", "maxOvr" DESC
      ) sub
      ORDER BY "maxOvr" DESC, ovr DESC
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
      },
    });
    if (!p) return null;
    // Fetch other versions sharing the same baseId (excluding self).
    const others = await prisma.player.findMany({
      where: { baseId: p.baseId, NOT: { id: p.id } },
      select: { id: true, cardType: true, ovr: true, maxOvr: true },
      orderBy: { ovr: "desc" },
    });
    const packRel = (p as PlayerRowWithPack).packCards?.[0]?.pack ?? null;
    // Attach Country.flagUrl (R2) by looking up nationalityId.
    let flagUrl: string | null = null;
    if (p.nationalityId > 0) {
      const c = await prisma.country.findUnique({
        where: { id: p.nationalityId },
        select: { flagUrl: true },
      });
      flagUrl = c?.flagUrl ?? null;
    }
    return toCardDTO({
      ...(p as unknown as PlayerRowForDto), skills: (p as PlayerRowWithSkills).skills, otherVersions: others, pack: packRel, flagUrl,
    } as PlayerRowForDto);
  }),

  // Fuzzy search by name — returns top N matches.
  // Uses pg_trgm similarity (`%`) on name + accentedName + unaccent expression so
  // "schar" matches "Fabian Schär" across accents.
  search: publicProcedure.input(playerSearchInput).query(async ({ input }) => {
    const q = input.q.replace(/\s+/g, " ").trim();
    // Prisma can't express the `%` similarity operator directly; use $queryRaw with
    // parameter binding. Order first by similarity desc, then OVR desc as a tiebreak.
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
          ELSE similarity(coalesce("accentedName", name), ${q})
        END DESC,
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
      include: { skills: { include: { skill: { select: { slug: true, name: true } } } } },
    });
    const rowsWithFlag = await attachFlagUrls(rows as PlayerRowForDto[]);
    return rowsWithFlag.map(toCardDTO);
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
  otherVersions?: Array<{ id: bigint; cardType: string; ovr: number; maxOvr: number }>;
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
type PlayerRowForDto = Record<string, unknown> & PlayerRowWithSkills & PlayerRowWithVersions & PlayerRowWithPack & PlayerRowWithFlag & {
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
