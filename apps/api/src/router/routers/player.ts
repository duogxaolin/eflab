// playerRouter — trending (newest cards), list (filters + sort, slim previews),
// byId (full card), search (name or pack name, max overall order, pages of 12)
// and compare (full cards in the caller's order).
import { prisma, Prisma } from "@eflab/db";
import { TRPCError } from "@trpc/server";
import {
  BASE_STATS,
  MAX_FILTER_IDS,
  MAX_FILTER_SKILLS,
  PHYSIQUE_FIELDS,
  POSITIONS,
  SEARCH_MIN_LENGTH,
  SEARCH_PAGE_SIZE,
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
  type PlayerSearchResult,
  type Position,
} from "@eflab/shared";
import { playerListInput, playerByIdInput, playerSearchInput, compareInput } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";
import { ttlCache } from "../ttl-cache.js";
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
  // Name: the accent-free lower-case ASCII column (dump `name_normalized`), so
  // "Ödegaard" sorts with the O's and case never splits the list; `id` is the
  // tiebreaker added by orderByFor. `namePrint` keeps the printed name.
  if (sort === "name") return { nameNormalized: nullsLast };
  if (sort === "namePrint") return { name: direction };
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
// direction and ignore `order`; High to low / Low to high sort by the max
// overall (the reference's rule, survey 2026-10-23 S2 §2). The former
// `trending` / `top` arrive here already read as `new` / `highest` (Zod).
function orderByFor(sort: string, direction: Dir): OrderBy[] {
  if (isSortPreset(sort)) {
    switch (sort) {
      case "new":
        return [{ releaseDate: { sort: "desc", nulls: "last" } }, { id: "desc" }];
      case "highest":
        return [{ maxOvr: "desc" }, { id: "desc" }];
      case "lowest":
        return [{ maxOvr: "asc" }, { id: "asc" }];
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

// Multi-valued filters (change multi-select-filters): the list field and the
// older single-value field of the same filter are merged into one
// de-duplicated set. Zod already bounds each list on its own; the merged set is
// bounded again here so `clubIds` of 50 plus a different `clubId` is a 400
// (BAD_REQUEST, the same status Zod produces), never a 51-way IN.
function mergeFilterValues<T>(list: readonly T[] | undefined, single: T | undefined, limit: number, what: string): T[] {
  const set = new Set<T>(list ?? []);
  if (single !== undefined) set.add(single);
  if (set.size > limit) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${what}: at most ${limit} distinct values` });
  }
  return Array.from(set);
}

// Physique columns share the PhysiqueField names (schema.prisma "11 physique").
const PHYSIQUE_DB: ReadonlySet<string> = new Set([
  "neckLength", "neckSize", "shoulderHeight", "shoulderWidth", "chestMeasurement", "waistSize",
  "armSize", "armLength", "thighSize", "calfSize", "legLength",
]);
// AI playing-style flags (boolean columns).
const AI_STYLE_DB: ReadonlySet<string> = new Set(["earlyCross", "incisiveRun", "longBallExpert", "mazingRun", "speedingBullet", "trickster"]);

// ---- One search rule for player.search and player.list `q` (change
// efootbase-function-parity, design decision D8; reference survey 2026-10-23
// S2 §4, S3 §1.5 / §2): the normalised query (accents and case folded,
// spaces collapsed — normalizeSearchQuery) is a contiguous substring of the
// card's normalised name OR of the name of the pack / campaign the card
// belongs to (PackCard), and — for a query that is still non-ASCII after
// normalisation — of the Japanese or Chinese name. From SEARCH_MIN_LENGTH (3)
// characters; no fuzzy (trigram-similarity) tier and no word-order matching
// ("messi lionel" finds nothing).
//
// Pack names are folded here in TypeScript with the same normalizeSearchQuery
// as the query (never SQL `unaccent`, whose folding differs), from a 60-second
// in-memory cache of (pack id, folded name) — packs change only when the
// catalogue is re-seeded. The pack part then uses the PackCard primary key
// (packId, playerId), the name part the trigram GIN index on nameNormalized.
const PACK_NAME_TTL_MS = 60_000;
const packNames = ttlCache(PACK_NAME_TTL_MS, async () => {
  const packs = await prisma.pack.findMany({ select: { id: true, name: true } });
  return packs.map((p) => ({ id: p.id, folded: normalizeSearchQuery(p.name) }));
});

interface SearchTerm {
  /** The folded query (normalizeSearchQuery). */
  normalized: string;
  /** The trimmed query as typed (for the CJK columns). */
  raw: string;
  /** LIKE patterns, wildcards escaped (`ESCAPE '\'`). */
  like: string;
  rawLike: string;
  /** Also match the Japanese / Chinese names (non-ASCII after folding: "三笘" yes, "Schär" → "schar" no). */
  cjk: boolean;
  /** Packs whose folded name contains the folded query. */
  packIds: string[];
}

/** The search term of a query, or null when it is shorter than SEARCH_MIN_LENGTH after folding. */
async function searchTerm(q: string): Promise<SearchTerm | null> {
  const normalized = normalizeSearchQuery(q);
  if (normalized.length < SEARCH_MIN_LENGTH) return null;
  const raw = q.trim();
  const packIds = (await packNames()).filter((p) => p.folded.includes(normalized)).map((p) => p.id);
  return {
    normalized,
    raw,
    like: `%${escapeLike(normalized)}%`,
    rawLike: `%${escapeLike(raw)}%`,
    cjk: hasNonAscii(normalized),
    packIds,
  };
}

/** The matched card ids of a term as one SQL fragment (`m` of design D8):
 *  name LIKE (GIN trigram) ∪ PackCard by pack id (PK) [∪ CJK names]. */
function matchedIdsSql(term: SearchTerm): Prisma.Sql {
  const cjk = term.cjk
    ? Prisma.sql`UNION SELECT id FROM "Player" WHERE "japName" ILIKE ${term.rawLike} ESCAPE '\\' OR "chineseName" ILIKE ${term.rawLike} ESCAPE '\\'`
    : Prisma.empty;
  return Prisma.sql`
    SELECT id FROM "Player" WHERE "nameNormalized" LIKE ${term.like} ESCAPE '\\'
    UNION SELECT "playerId" FROM "PackCard" WHERE "packId" = ANY(${term.packIds}::text[])
    ${cjk}`;
}

// The same rule as a Prisma predicate for player.list (its count and page
// queries are Prisma queries with every other filter).
//
// `%`, `_` and `\` must match literally. Prisma's `contains` does NOT escape
// them (verified: `contains: "%"` matched all 50,694 rows), so:
//   · a query without wildcard characters goes through Prisma `contains`
//     (emitted as `LIKE '%q%'`, literal by construction, index-served, and the
//     predicate stays inside the one count/page query);
//   · a query that contains a wildcard character is resolved by raw SQL with
//     `LIKE … ESCAPE '\'` into a (tiny) id list — no real name contains these
//     characters.
// The pack part is resolved into the member card ids (one PackCard query) and
// OR-ed as `id IN (…)`, which Postgres serves with a BitmapOr of the trigram
// index and the primary key (read-only EXPLAIN ANALYZE: "messi", 113 cards,
// 0.6 ms). A `packCards: { some }` relation filter would turn the OR into a
// sequential scan (44 ms, 546 ms with JIT) — kept only as the fallback above
// PACK_MEMBER_INLINE_MAX ids, so a statement never nears the bind-variable limit.
const LIKE_WILDCARDS = /[\\%_]/;
const PACK_MEMBER_INLINE_MAX = 10_000;

/** player.list's `q` predicate, or null when nothing can match. */
async function searchWhere(term: SearchTerm): Promise<Prisma.PlayerWhereInput | null> {
  const or: Prisma.PlayerWhereInput[] = [];
  if (!LIKE_WILDCARDS.test(term.normalized) && !LIKE_WILDCARDS.test(term.raw)) {
    or.push({ nameNormalized: { contains: term.normalized } });
    if (term.cjk) {
      or.push(
        { japName: { contains: term.raw, mode: "insensitive" } },
        { chineseName: { contains: term.raw, mode: "insensitive" } },
      );
    }
  } else {
    const cjkWhere = term.cjk
      ? Prisma.sql`OR "japName" ILIKE ${term.rawLike} ESCAPE '\\' OR "chineseName" ILIKE ${term.rawLike} ESCAPE '\\'`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id FROM "Player" WHERE "nameNormalized" LIKE ${term.like} ESCAPE '\\' ${cjkWhere} LIMIT 10000
    `);
    if (rows.length > 0) or.push({ id: { in: rows.map((r) => r.id) } });
  }
  if (term.packIds.length > 0) {
    const members = await prisma.$queryRaw<Array<{ playerId: bigint }>>(Prisma.sql`
      SELECT "playerId" FROM "PackCard" WHERE "packId" = ANY(${term.packIds}::text[])
    `);
    if (members.length > PACK_MEMBER_INLINE_MAX) or.push({ packCards: { some: { packId: { in: term.packIds } } } });
    else if (members.length > 0) or.push({ id: { in: members.map((m) => m.playerId) } });
  }
  return or.length > 0 ? { OR: or } : null;
}

export const playerRouter = router({
  // Latest players: the 18 newest distinct base players, newest card first
  // (design decision 14). Walks the (releaseDate, id) index in a window of 200
  // rows, de-duplicates by baseId in application code and widens the window ×4
  // (up to 12 800 rows) until 18 distinct bases are found — no full-table
  // DISTINCT ON scan per request. Each row carries its pack / campaign name
  // (`packName`, as in player.search — the search palette's "Latest Players"
  // rows show the same pack chip as its result rows; change
  // efootbase-function-parity): one primary-key lookup of the picked rows'
  // `featuredPackId`s.
  trending: publicProcedure.query(async (): Promise<CardPreview[]> => {
    const WANT = 18;
    const MAX_WINDOW = 12_800;
    const picked: CardPreview[] = [];
    const packIdOf = new Map<string, string | null>();
    const seenBase = new Set<string>();
    for (let window = 200; ; window *= 4) {
      const rows = await prisma.player.findMany({
        where: { releaseDate: { not: null } },
        orderBy: [{ releaseDate: "desc" }, { id: "desc" }],
        take: window,
        select: { ...previewSelect, featuredPackId: true },
      });
      picked.length = 0;
      packIdOf.clear();
      seenBase.clear();
      for (const r of rows) {
        const base = r.baseId.toString();
        if (seenBase.has(base)) continue;
        seenBase.add(base);
        const preview = toPreview(r, undefined);
        picked.push(preview);
        packIdOf.set(preview.id, r.featuredPackId);
        if (picked.length === WANT) break;
      }
      if (picked.length === WANT || rows.length < window || window >= MAX_WINDOW) break;
    }
    const packIds = Array.from(new Set(Array.from(packIdOf.values()).filter((id): id is string => id !== null)));
    const [flags, packs] = await Promise.all([
      flagUrlsFor(picked.map((p) => p.nationalityId ?? 0)),
      packIds.length > 0 ? prisma.pack.findMany({ where: { id: { in: packIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const packName = new Map(packs.map((p) => [p.id, p.name]));
    for (const p of picked) {
      p.flagUrl = flags.get(p.nationalityId ?? 0) ?? null;
      const packId = packIdOf.get(p.id);
      p.packName = packId ? packName.get(packId) ?? null : null;
    }
    return picked;
  }),

  // Paginated list — filters + sort, returns slim card previews.
  list: publicProcedure
    .input(playerListInput)
    .query(async ({ input }): Promise<PlayerListResult> => {
      const page = input.page;
      const limit = input.limit;
      const skip = (page - 1) * limit;
      const empty: PlayerListResult = { items: [], total: 0, page, limit, totalPages: 1 };
      const and: Prisma.PlayerWhereInput[] = [];
      // Every bound first (a 400 never depends on the data), then the lookups.
      const positions = mergeFilterValues(input.positions, input.position, POSITIONS.length, "positions");
      const styles = mergeFilterValues(input.playingStyles, input.playingStyle, MAX_FILTER_IDS, "playingStyles");
      const nations = mergeFilterValues(input.nationalityIds, input.nationalityId, MAX_FILTER_IDS, "nationalityIds");
      const clubs = mergeFilterValues(input.clubIds, input.clubId, MAX_FILTER_IDS, "clubIds");
      const teamNames = Array.from(new Set(input.teamNames ?? []));
      if (clubs.length + teamNames.length > MAX_FILTER_IDS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `teams (clubIds + teamNames): at most ${MAX_FILTER_IDS} distinct values` });
      }
      const leagues = mergeFilterValues(input.leagueIds, input.leagueId, MAX_FILTER_IDS, "leagueIds");
      const skillIds = mergeFilterValues(input.skillIds, input.skillId, MAX_FILTER_SKILLS, "skillIds");
      const skillKeys = Array.from(new Set(input.skillKeys ?? []));
      if (skillIds.length + skillKeys.length > MAX_FILTER_SKILLS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `skills (skillIds + skillKeys): at most ${MAX_FILTER_SKILLS} distinct values` });
      }
      // Name or pack name (searchTerm / searchWhere); a query shorter than
      // SEARCH_MIN_LENGTH after folding is ignored, as on the reference.
      if (input.q) {
        const term = await searchTerm(input.q);
        if (term) {
          const nameWhere = await searchWhere(term);
          if (!nameWhere) return empty;
          and.push(nameWhere);
        }
      }
      if (input.cardType) and.push({ cardType: input.cardType });
      if (input.cardTypeIn && input.cardTypeIn.length > 0) and.push({ cardType: { in: input.cardTypeIn } });
      // Position: the card's registered position (the reference's rule, survey
      // 2026-10-23 S2 §5 — the aptitude is not used). Several positions are
      // OR-ed; the single `position` field is merged into the list.
      if (positions.length > 0) and.push({ registeredPosition: { in: positions.map((p) => POSITIONS.indexOf(p)) } });
      // Main playing styles: OR-ed, each in either slot (efootbase groups and
      // filters by style, not by slot — PLAYING_STYLE_GROUPS in @eflab/shared);
      // the AI styles below are AND-ed with each other and with this group.
      // The defence-only variant stays for callers that want the defence slot.
      if (styles.length > 0) {
        and.push({ OR: [{ playingStyleAttack: { in: styles } }, { playingStyleDefense: { in: styles } }] });
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
      // Nation / Team / League: OR within the list (`IN`), AND with everything
      // else. clubIds and teamNames (Team.name, unique) → one set of the
      // card's Team; leagueIds → the Team's League. Names that match no team
      // add nothing; a team filter left with no team matches no card.
      if (nations.length > 0) and.push({ nationalityId: { in: nations } });
      if (clubs.length + teamNames.length > 0) {
        const named = teamNames.length > 0
          ? (await prisma.team.findMany({ where: { name: { in: teamNames } }, select: { id: true } })).map((t) => t.id)
          : [];
        const teams = Array.from(new Set([...clubs, ...named]));
        if (teams.length === 0) return empty;
        and.push({ teamId: { in: teams } });
      }
      if (leagues.length > 0) and.push({ team: { is: { leagueId: { in: leagues } } } });
      // Skills: every selected skill must be present (one EXISTS per skill);
      // skillKeys go through Skill.efbKey, and a key that is no stored skill
      // matches no card.
      const skillSet = new Set(skillIds);
      if (skillKeys.length > 0) {
        const keyed = await prisma.skill.findMany({ where: { efbKey: { in: skillKeys } }, select: { id: true } });
        if (keyed.length < skillKeys.length) return empty;
        for (const s of keyed) skillSet.add(s.id);
      }
      for (const skillId of skillSet) and.push({ skills: { some: { skillId } } });
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

  // Player search for the ⌘K palette, the home search and the compare picker
  // (change efootbase-function-parity, design decision D8): the name-or-pack
  // rule above (searchTerm / matchedIdsSql), ordered by max overall DESC,
  // then card id DESC — no relevance tiers, no fuzzy tier — in pages of
  // SEARCH_PAGE_SIZE (12) with `hasMore` (one row more is read). The result
  // lists lift the word-start rows inside each page themselves
  // (liftWordStartRows). Each row carries its pack / campaign name
  // (Player.featuredPackId → Pack, the PackCard pair of the card).
  search: publicProcedure.input(playerSearchInput).query(async ({ input }): Promise<PlayerSearchResult> => {
    const term = await searchTerm(input.q);
    if (!term) return { rows: [], hasMore: false };
    const offset = (input.page - 1) * SEARCH_PAGE_SIZE;
    const rows = await prisma.$queryRaw<Array<PreviewRow & { packName: string | null }>>(Prisma.sql`
      WITH m AS (${matchedIdsSql(term)})
      SELECT p.id, p."baseId", p.name, p."cardType"::text AS "cardType", p.ovr, p."maxOvr",
             p."registeredPosition", p.condition, p."nationalityId",
             p."playingStyleAttack", p."playingStyleDefense", pk.name AS "packName"
      FROM "Player" p
      JOIN m USING (id)
      LEFT JOIN "Pack" pk ON pk.id = p."featuredPackId"
      ORDER BY p."maxOvr" DESC, p.id DESC
      LIMIT ${SEARCH_PAGE_SIZE + 1} OFFSET ${offset}
    `);
    const page = rows.slice(0, SEARCH_PAGE_SIZE);
    const flags = await flagUrlsFor(page.map((r) => r.nationalityId));
    return {
      rows: page.map((r) => ({ ...toPreview(r, flags.get(r.nationalityId)), packName: r.packName ?? null })),
      hasMore: rows.length > SEARCH_PAGE_SIZE,
    };
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

  // All countries for the Nation filter and its chips (flag URLs rebased onto
  // R2_PUBLIC_BASE), A–Z. The Nation dialog puts the reference's fixed ten
  // first (FIXED_FIRST_NATIONS, matched by name). No card count: the former
  // per-nation `playerCount` fed the dialog's "Popular" group and was removed
  // with it (owner decision 2026-10-24, change efootbase-function-parity).
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

  // All teams for the Team filter (736 rows; `teamNames` / `clubIds` on
  // player.list). The leagueId puts each team under its league heading in
  // the picker (the list is not narrowed by a League selection).
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
