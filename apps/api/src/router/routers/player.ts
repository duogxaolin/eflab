// playerRouter — trending (newest cards), list (filters + sort, slim previews),
// byId (full card), search (normalised substring + trigram) and compare
// (full cards in the caller's order).
import { prisma, Prisma } from "@eflab/db";
import {
  BASE_STATS,
  PHYSIQUE_FIELDS,
  POSITIONS,
  escapeLike,
  hasNonAscii,
  isSortPreset,
  normalizeSearchQuery,
  type BaseStat,
  type PhysiqueField,
  type BoosterDTO,
  type CardPreview,
  type CardType,
  type PlayerCardDTO,
  type PlayerListResult,
  type Position,
} from "@eflab/shared";
import { playerListInput, playerByIdInput, playerSearchInput, compareInput } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";
import { rebaseR2Url } from "../../env.js";

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
const POS_APTITUDE_DB: Record<Position, string> = {
  GK: "posGK", LB: "posLB", RB: "posRB", CB: "posCB", DMF: "posDMF",
  CMF: "posCMF", LMF: "posLMF", RMF: "posRMF", AMF: "posAMF", LWF: "posLWF",
  RWF: "posRWF", SS: "posSS", CF: "posCF",
};
const RATING_DB: Record<Position, string> = {
  GK: "ratingGK", LB: "ratingLB", RB: "ratingRB", CB: "ratingCB", DMF: "ratingDMF",
  CMF: "ratingCMF", LMF: "ratingLMF", RMF: "ratingRMF", AMF: "ratingAMF", LWF: "ratingLWF",
  RWF: "ratingRWF", SS: "ratingSS", CF: "ratingCF",
};
// Sort name (`ratingGk`, `ratingCf`) → real column (`ratingGK`, `ratingCF`).
const RATING_SORT_COLUMN: Record<string, string> = Object.fromEntries(
  POSITIONS.map((p) => [`rating${p[0]}${p.slice(1).toLowerCase()}`, RATING_DB[p]]),
);

const STAT_KEYS: readonly BaseStat[] = BASE_STATS;

// Columns every card preview needs (player.list, trending, compare picker…).
const previewSelect = {
  id: true,
  baseId: true,
  name: true,
  cardType: true,
  ovr: true,
  maxOvr: true,
  registeredPosition: true,
  condition: true,
  nationalityId: true,
  playingStyleAttack: true,
  playingStyleDefense: true,
} as const;

type PreviewRow = {
  id: bigint;
  baseId: bigint;
  name: string;
  cardType: string;
  ovr: number;
  maxOvr: number;
  registeredPosition: number;
  condition: string;
  nationalityId: number;
  playingStyleAttack: number;
  playingStyleDefense: number;
};

function toPreview(p: PreviewRow, flagUrl: string | null | undefined): CardPreview {
  return {
    id: p.id.toString(),
    baseId: p.baseId.toString(),
    name: p.name,
    cardType: p.cardType as CardType,
    ovr: p.ovr,
    maxOvr: p.maxOvr,
    registeredPosition: p.registeredPosition,
    condition: p.condition,
    nationalityId: p.nationalityId,
    flagUrl: flagUrl ?? null,
    playingStyleAttack: p.playingStyleAttack,
    playingStyleDefense: p.playingStyleDefense,
  };
}

// Country.flagUrl (R2, rebased) for a set of nationality ids — one query per batch.
async function flagUrlsFor(nationalityIds: Iterable<number>): Promise<Map<number, string | null>> {
  const ids = Array.from(new Set(Array.from(nationalityIds).filter((id) => id > 0)));
  if (ids.length === 0) return new Map();
  const countries = await prisma.country.findMany({
    where: { id: { in: ids } },
    select: { id: true, flagUrl: true },
  });
  return new Map(countries.map((c) => [c.id, rebaseR2Url(c.flagUrl)]));
}

// Convert a full DB player row (+ joined extras) to the wire DTO.
function toCardDTO(p: PlayerRowForDto): PlayerCardDTO {
  const raw = p as unknown as Record<string, unknown>;
  const baseStats: Partial<Record<BaseStat, number>> = {};
  for (const s of STAT_KEYS) baseStats[s] = Number(raw[statDbColumn[s]]);
  const maxStats: Partial<Record<BaseStat, number>> = {};
  for (const s of STAT_KEYS) {
    const head = s[0] ?? "O";
    maxStats[s] = Number(raw[`max${head.toUpperCase()}${s.slice(1)}`]);
  }
  const positionAptitudes: Partial<Record<Position, number>> = {};
  for (const pos of POSITIONS) positionAptitudes[pos] = Number(raw[POS_APTITUDE_DB[pos]] ?? 2);
  // Per-position ratings are cross-fill-owned and nullable: null stays null
  // (the Pitch Map renders "n/a"), never an invented 40.
  const positionRatings: Partial<Record<Position, number | null>> = {};
  for (const pos of POSITIONS) {
    const v = raw[RATING_DB[pos]];
    positionRatings[pos] = typeof v === "number" ? v : null;
  }
  return {
    id: p.id.toString(),
    baseId: p.baseId.toString(),
    name: p.name,
    nationalityId: p.nationalityId,
    height: p.height,
    weight: p.weight,
    age: p.age,
    strongerFoot: p.strongerFoot,
    registeredPosition: p.registeredPosition,
    playingStyleAttack: p.playingStyleAttack,
    playingStyleDefense: p.playingStyleDefense,
    cardType: p.cardType as CardType,
    ovr: p.ovr,
    maxOvr: p.maxOvr,
    condition: p.condition,
    weakFootUsage: p.weakFootUsage,
    weakFootAccuracy: p.weakFootAccuracy,
    releaseDate: p.releaseDate ? new Date(p.releaseDate).toISOString() : null,
    levelCap: p.levelCap,
    stats: baseStats as Record<BaseStat, number>,
    maxStats: maxStats as Record<BaseStat, number>,
    positionAptitudes: positionAptitudes as Record<Position, number>,
    positionRatings: positionRatings as Record<Position, number | null>,
    playstyles: {
      trickster: p.trickster,
      mazingRun: p.mazingRun,
      speedingBullet: p.speedingBullet,
      incisiveRun: p.incisiveRun,
      longBallExpert: p.longBallExpert,
      earlyCross: p.earlyCross,
    },
    skills: (p.skills ?? []).map((ps) => ps.skill?.slug ?? "").filter(Boolean),
    boosterId1: p.boosterId1,
    boosterId2: p.boosterId2,
    booster1: p.booster1 ?? null,
    booster2: p.booster2 ?? null,
    otherVersions: (p.otherVersions ?? []).map((v) => ({
      id: v.id.toString(), cardType: v.cardType as CardType, ovr: v.ovr, maxOvr: v.maxOvr,
      registeredPosition: v.registeredPosition,
    })),
    pack: p.pack ?? null,
    // R2 URLs, rebased onto R2_PUBLIC_BASE when set.
    flagUrl: rebaseR2Url(p.flagUrl),
    teamEmblemUrl: rebaseR2Url(p.teamEmblemUrl),
    countryName: p.countryName ?? null,
    teamName: p.teamName ?? null,
    leagueName: p.leagueName ?? null,
    leagueEmblemUrl: rebaseR2Url(p.leagueEmblemUrl),
    // Detail-only extras (efootbase-parity-round2): the Player row carries
    // form, injury resistance, the 11 physique Ints and the 5 derived Floats;
    // byId and compare load the full row, so they are always present here.
    form: p.form,
    injuryResistance: p.injuryResistance,
    physique: Object.fromEntries(PHYSIQUE_FIELDS.map((f) => [f, Number(raw[f])])) as Record<PhysiqueField, number>,
    bodyMetrics: {
      legCoverage: Number(raw.legCoverage),
      armCoverage: Number(raw.armCoverage),
      peakJumpHeight: Number(raw.peakJumpHeight),
      torsoCollisionWidth: Number(raw.torsoCollisionWidth),
      dribbleHeight: Number(raw.dribbleHeight),
    },
  };
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
function boosterRowToDTO(b: { id: number; name: string; magnitude: number; tier: string } & Record<string, unknown>): BoosterDTO {
  const stats: Partial<Record<BaseStat, number>> = {};
  for (const col of BOOSTER_STAT_COLUMNS) {
    const v = b[col];
    if (typeof v === "number" && v !== 0) stats[col as BaseStat] = v;
  }
  return { id: b.id, name: b.name, magnitude: b.magnitude, tier: b.tier, stats };
}

// Batch-resolve Booster rows by the distinct boosterId1/boosterId2 across a list
// of players, then write the resolved objects back. Cards reference booster IDs
// NOT in fixtures/boosters.json — seeder Phase 1c upserts them from the dump.
async function attachBoosters(rows: PlayerRowForDto[]): Promise<void> {
  const idSet = new Set<number>();
  for (const r of rows) {
    if (r.boosterId1 != null && r.boosterId1 > 0) idSet.add(r.boosterId1);
    if (r.boosterId2 != null && r.boosterId2 > 0) idSet.add(r.boosterId2);
  }
  const byId = new Map<number, BoosterDTO>();
  if (idSet.size > 0) {
    const boosters = await prisma.booster.findMany({ where: { id: { in: Array.from(idSet) } } });
    for (const b of boosters) byId.set(b.id, boosterRowToDTO(b as typeof b & Record<string, unknown>));
  }
  for (const r of rows) {
    r.booster1 = (r.boosterId1 != null && r.boosterId1 > 0) ? (byId.get(r.boosterId1) ?? null) : null;
    r.booster2 = (r.boosterId2 != null && r.boosterId2 > 0) ? (byId.get(r.boosterId2) ?? null) : null;
  }
}

// Joined Team → Country/League shape used by byId and compare.
const teamInclude = {
  team: {
    select: {
      id: true, name: true, emblemUrl: true,
      country: { select: { id: true, name: true } },
      league: { select: { id: true, name: true, emblemUrl: true } },
    },
  },
} as const;
type TeamJoin = {
  team?: {
    id: number; name: string; emblemUrl: string | null;
    country: { id: number; name: string } | null;
    league: { id: number; name: string; emblemUrl: string | null } | null;
  } | null;
};

type Dir = "asc" | "desc";
type OrderBy = Prisma.PlayerOrderByWithRelationInput;

// Map a SORT_FIELDS entry → Prisma orderBy. Nullable columns (releaseDate, the
// per-position ratings) sort NULLs last in both directions so a missing value
// never floats to page 1 of a DESC sort.
function primaryOrder(sort: string, direction: Dir): OrderBy {
  const nullsLast = { sort: direction, nulls: "last" } as const;
  if (sort === "releaseDate" || sort === "recentlyAdded") return { releaseDate: nullsLast };
  if (sort === "playerId") return { id: direction };
  if (sort === "name" || sort === "namePrint") return { name: direction };
  if (sort === "japName") return { japName: nullsLast };
  if (sort === "chineseName") return { chineseName: nullsLast };
  if (sort === "nationality") return { nationalityId: direction };
  if (sort === "ovr") return { ovr: direction };
  if (sort === "maxOvr") return { maxOvr: direction };
  if (sort === "maxLevel") return { levelCap: direction };
  if (sort === "age") return { age: direction };
  if (sort === "height") return { height: direction };
  if (sort === "weight") return { weight: direction };
  if (sort === "playerValue") return { marketValue: direction };
  // 26 base stats
  if ((statDbColumn as Record<string, string>)[sort]) {
    return { [statDbColumn[sort as BaseStat]]: direction } as OrderBy;
  }
  // 26 max stats: `max${Capitalized}`
  if (sort.startsWith("max")) {
    const letter = sort[3] ?? "O";
    const statKey = (letter.toLowerCase() + sort.slice(4)) as BaseStat;
    if ((statDbColumn as Record<string, string>)[statKey]) {
      return { [`max${letter}${sort.slice(4)}`]: direction } as OrderBy;
    }
  }
  // 13 per-position ratings: `ratingGk` … `ratingCf` (nullable, cross-fill-owned)
  const ratingCol = RATING_SORT_COLUMN[sort];
  if (ratingCol) return { [ratingCol]: nullsLast } as OrderBy;
  return { ovr: direction };
}

// Every list query orders by [{sort}, {id}] — the unique id tiebreaker is what
// makes pagination deterministic (design decision 7). The composite indexes
// (maxOvr,id), (ovr,id), (releaseDate,id) serve the common sorts directly.
// The efootbase-style presets (SORT_PRESETS in @eflab/shared) carry their own
// direction and ignore `order`.
function orderByFor(sort: string, direction: Dir): OrderBy[] {
  if (isSortPreset(sort)) {
    const newestFirst = { releaseDate: { sort: "desc", nulls: "last" } } as const;
    switch (sort) {
      case "trending":
        return [newestFirst, { maxOvr: "desc" }, { id: "desc" }];
      case "new":
        return [newestFirst, { id: "desc" }];
      case "top":
        return [{ maxOvr: "desc" }, { id: "desc" }];
      case "highest":
        return [{ ovr: "desc" }, { id: "desc" }];
      case "lowest":
        return [{ ovr: "asc" }, { id: "asc" }];
    }
  }
  return [primaryOrder(sort, direction), { id: direction }];
}

// `{ column: { gte, lte } }` for an optional min/max pair; null when both are
// absent so an empty range adds no predicate.
function rangeWhere(column: string, min: number | undefined, max: number | undefined): Prisma.PlayerWhereInput | null {
  if (min === undefined && max === undefined) return null;
  const bounds: { gte?: number; lte?: number } = {};
  if (min !== undefined) bounds.gte = min;
  if (max !== undefined) bounds.lte = max;
  return { [column]: bounds } as Prisma.PlayerWhereInput;
}

// Physique columns share the PhysiqueField names (schema.prisma "11 physique").
const PHYSIQUE_DB: ReadonlySet<string> = new Set([
  "neckLength", "neckSize", "shoulderHeight", "shoulderWidth", "chestMeasurement", "waistSize",
  "armSize", "armLength", "thighSize", "calfSize", "legLength",
]);
// AI playing-style flags (boolean columns).
const AI_STYLE_DB: ReadonlySet<string> = new Set(["earlyCross", "incisiveRun", "longBallExpert", "mazingRun", "speedingBullet", "trickster"]);

// Name predicate for player.list `q` (design decision 6): the query is
// normalised in application code and matched as a substring of the lower-case
// ASCII `nameNormalized` column with LIKE (served by the trigram GIN index).
// Japanese/Chinese names are matched case-insensitively on their own columns
// only when the query still contains non-ASCII characters after normalisation
// (so "Schär" → "schar" never touches them, "三笘" does).
//
// `%`, `_` and `\` must match literally. Prisma's `contains` does NOT escape
// them (verified: `contains: "%"` matched all 48,410 rows), so:
//   · a query without wildcard characters goes through Prisma `contains`
//     (emitted as `LIKE '%q%'`, literal by construction, index-served, and the
//     predicate stays inside the one count/page query);
//   · a query that contains a wildcard character is resolved by raw SQL with
//     `LIKE … ESCAPE '\'` into a (tiny) id list — no real name contains these
//     characters, and a `WHERE id IN (…)` with tens of thousands of ids would
//     exceed the 32,767 bind-variable limit of a prepared statement.
const LIKE_WILDCARDS = /[\\%_]/;

async function nameFilter(q: string): Promise<Prisma.PlayerWhereInput | null> {
  const normalized = normalizeSearchQuery(q);
  const cjk = hasNonAscii(normalized);
  const raw = q.trim();
  if (normalized.length === 0) return null;
  if (!LIKE_WILDCARDS.test(normalized) && !LIKE_WILDCARDS.test(raw)) {
    const or: Prisma.PlayerWhereInput[] = [{ nameNormalized: { contains: normalized } }];
    if (cjk) {
      or.push(
        { japName: { contains: raw, mode: "insensitive" } },
        { chineseName: { contains: raw, mode: "insensitive" } },
      );
    }
    return { OR: or };
  }
  const like = `%${escapeLike(normalized)}%`;
  const rawLike = `%${escapeLike(raw)}%`;
  const cjkWhere = cjk
    ? Prisma.sql`OR "japName" ILIKE ${rawLike} ESCAPE '\\' OR "chineseName" ILIKE ${rawLike} ESCAPE '\\'`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT id FROM "Player" WHERE "nameNormalized" LIKE ${like} ESCAPE '\\' ${cjkWhere} LIMIT 10000
  `);
  return rows.length > 0 ? { id: { in: rows.map((r) => r.id) } } : null;
}

export const playerRouter = router({
  // Latest players: the 18 newest distinct base players, newest card first
  // (design decision 14). Walks the (releaseDate, id) index in a window of 200
  // rows, de-duplicates by baseId in application code and widens the window ×4
  // (up to 12 800 rows) until 18 distinct bases are found — no full-table
  // DISTINCT ON scan per request.
  trending: publicProcedure.query(async (): Promise<CardPreview[]> => {
    const WANT = 18;
    const MAX_WINDOW = 12_800;
    const picked: CardPreview[] = [];
    const seenBase = new Set<string>();
    for (let window = 200; ; window *= 4) {
      const rows = await prisma.player.findMany({
        where: { releaseDate: { not: null } },
        orderBy: [{ releaseDate: "desc" }, { id: "desc" }],
        take: window,
        select: previewSelect,
      });
      picked.length = 0;
      seenBase.clear();
      for (const r of rows) {
        const base = r.baseId.toString();
        if (seenBase.has(base)) continue;
        seenBase.add(base);
        picked.push(toPreview(r, undefined));
        if (picked.length === WANT) break;
      }
      if (picked.length === WANT || rows.length < window || window >= MAX_WINDOW) break;
    }
    const flags = await flagUrlsFor(picked.map((p) => p.nationalityId ?? 0));
    for (const p of picked) p.flagUrl = flags.get(p.nationalityId ?? 0) ?? null;
    return picked;
  }),

  // Paginated list — filters + sort, returns slim card previews.
  list: publicProcedure
    .input(playerListInput)
    .query(async ({ input }): Promise<PlayerListResult> => {
      const page = input.page;
      const limit = input.limit;
      const skip = (page - 1) * limit;
      const and: Prisma.PlayerWhereInput[] = [];
      if (input.q) {
        const nameWhere = await nameFilter(input.q);
        if (!nameWhere) return { items: [], total: 0, page, limit, totalPages: 1 };
        and.push(nameWhere);
      }
      if (input.cardType) and.push({ cardType: input.cardType });
      if (input.cardTypeIn && input.cardTypeIn.length > 0) and.push({ cardType: { in: input.cardTypeIn } });
      if (input.position) and.push({ [POS_APTITUDE_DB[input.position]]: { in: [0, 1] } });
      // A playing style matches in either slot (efootbase groups and filters by
      // style, not by slot — PLAYING_STYLE_GROUPS in @eflab/shared); the
      // defence-only variant stays for callers that want the defence slot.
      if (input.playingStyle !== undefined) {
        and.push({ OR: [{ playingStyleAttack: input.playingStyle }, { playingStyleDefense: input.playingStyle }] });
      }
      if (input.defensiveStyle !== undefined) and.push({ playingStyleDefense: input.defensiveStyle });
      for (const flag of input.aiStyles ?? []) {
        if (AI_STYLE_DB.has(flag)) and.push({ [flag]: true } as Prisma.PlayerWhereInput);
      }
      const ovrRange = rangeWhere("ovr", input.ovrMin, input.ovrMax);
      if (ovrRange) and.push(ovrRange);
      const maxOvrRange = rangeWhere("maxOvr", input.maxOvrMin, input.maxOvrMax);
      if (maxOvrRange) and.push(maxOvrRange);
      if (input.weakFoot) and.push({ weakFootAccuracy: { gte: Number(input.weakFoot) } });
      if (input.strongerFoot !== undefined) and.push({ strongerFoot: input.strongerFoot });
      if (input.nationalityId !== undefined) and.push({ nationalityId: input.nationalityId });
      // clubId → the card's Team; leagueId → the Team's League.
      if (input.clubId !== undefined) and.push({ teamId: input.clubId });
      if (input.leagueId !== undefined) and.push({ team: { is: { leagueId: input.leagueId } } });
      if (input.skillId !== undefined) and.push({ skills: { some: { skillId: input.skillId } } });
      // Skills: every selected skill must be present (one EXISTS per skill).
      for (const skillId of new Set(input.skillIds ?? [])) and.push({ skills: { some: { skillId } } });
      if (input.conditionIn && input.conditionIn.length > 0) and.push({ condition: { in: input.conditionIn } });
      if (input.formIn && input.formIn.length > 0) and.push({ form: { in: input.formIn } });
      if (input.weakFootAccuracyIn && input.weakFootAccuracyIn.length > 0) and.push({ weakFootAccuracy: { in: input.weakFootAccuracyIn } });
      if (input.weakFootUsageIn && input.weakFootUsageIn.length > 0) and.push({ weakFootUsage: { in: input.weakFootUsageIn } });
      for (const r of [
        rangeWhere("height", input.heightMin, input.heightMax),
        rangeWhere("weight", input.weightMin, input.weightMax),
        rangeWhere("age", input.ageMin, input.ageMax),
      ]) if (r) and.push(r);
      // Stat ranges — base columns, or the max* columns with `statsAtMax`.
      for (const sr of input.statRanges ?? []) {
        const base = statDbColumn[sr.stat];
        const column = input.statsAtMax ? `max${(base[0] ?? "o").toUpperCase()}${base.slice(1)}` : base;
        const r = rangeWhere(column, sr.min, sr.max);
        if (r) and.push(r);
      }
      for (const br of input.bodyRanges ?? []) {
        if (!PHYSIQUE_DB.has(br.field)) continue;
        const r = rangeWhere(br.field, br.min, br.max);
        if (r) and.push(r);
      }
      const where: Prisma.PlayerWhereInput = and.length > 0 ? { AND: and } : {};
      const orderBy = orderByFor(input.sort, input.order);
      const [total, rows] = await prisma.$transaction([
        prisma.player.count({ where }),
        prisma.player.findMany({ where, orderBy, skip, take: limit, select: previewSelect }),
      ]);
      const flags = await flagUrlsFor(rows.map((r) => r.nationalityId));
      return {
        items: rows.map((r) => toPreview(r, flags.get(r.nationalityId))),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }),

  // Full card details by baseId + cardId path params. Returns null when the card
  // does not exist OR when `baseId` is not the card's base (so a mismatched URL
  // is a 404 on the web, not another player's page).
  byId: publicProcedure.input(playerByIdInput).query(async ({ input }): Promise<PlayerCardDTO | null> => {
    const p = await prisma.player.findUnique({
      where: { id: input.cardId },
      include: {
        skills: { include: { skill: { select: { slug: true } } } },
        packCards: { include: { pack: { select: { id: true, name: true } } } },
        ...teamInclude,
      },
    });
    if (!p || p.baseId !== input.baseId) return null;
    // Other versions sharing the same baseId (excluding self), best first.
    const others = await prisma.player.findMany({
      where: { baseId: p.baseId, NOT: { id: p.id } },
      select: { id: true, cardType: true, ovr: true, maxOvr: true, registeredPosition: true },
      orderBy: [{ ovr: "desc" }, { id: "desc" }],
    });
    // Player.nationalityId is the player's nationality, which may differ from
    // the team's country (a Brazilian at a Spanish club) — look it up directly.
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
    const team = (p as TeamJoin).team ?? null;
    const row: PlayerRowForDto = {
      ...(p as unknown as PlayerRowForDto),
      skills: p.skills,
      otherVersions: others,
      pack: p.packCards[0]?.pack ?? null,
      flagUrl,
      teamEmblemUrl: team?.emblemUrl ?? null,
      countryName,
      teamName: team?.name ?? null,
      leagueName: team?.league?.name ?? null,
      leagueEmblemUrl: team?.league?.emblemUrl ?? null,
    };
    await attachBoosters([row]);
    return toCardDTO(row);
  }),

  // Name search for the home palette, header and compare picker.
  // Tiers (design decision 6):
  //   0 = substring of the normalised name   ("schar" ⊆ "fabian schar")
  //   1 = substring of the Japanese/Chinese name (non-ASCII queries only)
  //   2 = pg_trgm fuzzy match on the normalised name ("scharr", "mbapp")
  // Inside a tier: similarity DESC, ovr DESC, id DESC. Both the LIKE and the `%`
  // predicates use the GIN trigram index on nameNormalized. Wildcards in the
  // query are escaped so "%" only matches a literal percent sign.
  search: publicProcedure.input(playerSearchInput).query(async ({ input }): Promise<CardPreview[]> => {
    const normalized = normalizeSearchQuery(input.q);
    if (normalized.length < 2) return [];
    const like = `%${escapeLike(normalized)}%`;
    // CJK columns only when the *normalised* query is still non-ASCII ("Schär"
    // normalises to ASCII and must not pay for two extra ILIKE scans).
    const cjk = hasNonAscii(normalized);
    const rawLike = `%${escapeLike(input.q.trim())}%`;
    const cjkWhere = cjk
      ? Prisma.sql`OR "japName" ILIKE ${rawLike} ESCAPE '\\' OR "chineseName" ILIKE ${rawLike} ESCAPE '\\'`
      : Prisma.empty;
    const cjkTier = cjk
      ? Prisma.sql`WHEN "japName" ILIKE ${rawLike} ESCAPE '\\' OR "chineseName" ILIKE ${rawLike} ESCAPE '\\' THEN 1`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<PreviewRow[]>(Prisma.sql`
      SELECT id, "baseId", name, "cardType"::text AS "cardType", ovr, "maxOvr",
             "registeredPosition", condition, "nationalityId",
             "playingStyleAttack", "playingStyleDefense"
      FROM "Player"
      WHERE "nameNormalized" LIKE ${like} ESCAPE '\\'
         OR "nameNormalized" % ${normalized}
         ${cjkWhere}
      ORDER BY
        CASE
          WHEN "nameNormalized" LIKE ${like} ESCAPE '\\' THEN 0
          ${cjkTier}
          ELSE 2
        END ASC,
        similarity("nameNormalized", ${normalized}) DESC,
        ovr DESC,
        id DESC
      LIMIT ${input.limit}
    `);
    const flags = await flagUrlsFor(rows.map((r) => r.nationalityId));
    return rows.map((r) => toPreview(r, flags.get(r.nationalityId)));
  }),

  // Compare 1–4 cards — full DTOs in the caller's `cardIds` order (duplicates
  // collapsed, unknown ids skipped) so the left slot is always the left column.
  compare: publicProcedure.input(compareInput).query(async ({ input }): Promise<PlayerCardDTO[]> => {
    const ids = Array.from(new Set(input.cardIds.map((id) => id.toString()))).map((s) => BigInt(s));
    const rows = await prisma.player.findMany({
      where: { id: { in: ids } },
      include: {
        skills: { include: { skill: { select: { slug: true } } } },
        ...teamInclude,
      },
    });
    const flags = await flagUrlsFor(rows.map((r) => r.nationalityId));
    const byId = new Map<string, PlayerRowForDto>();
    for (const r of rows) {
      const team = (r as TeamJoin).team ?? null;
      byId.set(r.id.toString(), {
        ...(r as unknown as PlayerRowForDto),
        skills: r.skills,
        flagUrl: flags.get(r.nationalityId) ?? null,
        teamEmblemUrl: team?.emblemUrl ?? null,
        countryName: null,
        teamName: team?.name ?? null,
        leagueName: team?.league?.name ?? null,
        leagueEmblemUrl: team?.league?.emblemUrl ?? null,
      });
    }
    const ordered = ids.map((id) => byId.get(id.toString())).filter((r): r is PlayerRowForDto => r !== undefined);
    await attachBoosters(ordered);
    return ordered.map(toCardDTO);
  }),

  // All countries for the Nation filter (flag URLs rebased onto R2_PUBLIC_BASE).
  countries: publicProcedure.query(async () => {
    const rows = await prisma.country.findMany({
      select: { id: true, name: true, flagUrl: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((c) => ({ id: c.id, name: c.name, flagUrl: rebaseR2Url(c.flagUrl) }));
  }),

  // All leagues for the League filter (34 rows; `leagueId` on player.list).
  leagues: publicProcedure.query(async () => {
    return prisma.league.findMany({
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }),

  // All teams for the Team filter (707 rows; `clubId` on player.list). The
  // leagueId lets the picker narrow the list to the chosen league.
  teams: publicProcedure.query(async () => {
    return prisma.team.findMany({
      select: { id: true, name: true, leagueId: true, national: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }),
});

// ---- local row type for the full DTO (bridges Prisma's generated types + the
// joined extras the procedures attach before toCardDTO).
type PlayerRowForDto = Record<string, unknown> & {
  id: bigint;
  baseId: bigint;
  name: string;
  nationalityId: number;
  height: number;
  weight: number;
  age: number;
  strongerFoot: number;
  registeredPosition: number;
  playingStyleAttack: number;
  playingStyleDefense: number;
  cardType: string;
  ovr: number;
  maxOvr: number;
  condition: string;
  form: number;
  injuryResistance: number;
  weakFootUsage: number;
  weakFootAccuracy: number;
  releaseDate: Date | null;
  levelCap: number;
  boosterId1: number | null;
  boosterId2: number | null;
  // playstyles
  trickster: boolean; mazingRun: boolean; speedingBullet: boolean; incisiveRun: boolean; longBallExpert: boolean; earlyCross: boolean;
  // joined / attached by the procedure
  skills?: Array<{ skill?: { slug: string } | null }>;
  otherVersions?: Array<{ id: bigint; cardType: string; ovr: number; maxOvr: number; registeredPosition: number }>;
  pack?: { id: string; name: string } | null;
  flagUrl?: string | null;
  teamEmblemUrl?: string | null;
  countryName?: string | null;
  teamName?: string | null;
  leagueName?: string | null;
  leagueEmblemUrl?: string | null;
  booster1?: BoosterDTO | null;
  booster2?: BoosterDTO | null;
};
