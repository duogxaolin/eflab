import { z } from "zod";
import {
  BASE_STATS,
  CARD_TYPES,
  MANAGER_TACTICS,
  POSITIONS,
  SORT_FIELDS,
  TRAINING_CATEGORIES,
  type TrainingCategory,
} from "./constants";

// BigInt-friendly id transformer. SuperJSON handles bigint at the wire layer, but Zod
// parses the request (strings) so we coerce. Bounded to a Postgres int8
// (≤ 9223372036854775807) so an oversized id is a BAD_REQUEST from Zod, never a
// Prisma/Postgres error turned into a 500.
export const INT8_MAX = 9223372036854775807n;
export const bigIntString = z
  .string()
  .regex(/^\d{1,19}$/, "expected numeric id")
  .transform((v) => BigInt(v))
  .refine((v) => v <= INT8_MAX, { message: "id out of range" });

// Postgres int4 bound for integer filters (ids, style ids, foot) — anything larger
// is rejected by Zod instead of blowing up inside the query engine.
export const INT4_MAX = 2147483647;
const int4 = z.coerce.number().int().min(0).max(INT4_MAX);

// Player filter schema (card type scope, position, styles, ovr ranges, foot,
// nationality, club/league via Team, skill) + sort/paging.
export const playerListInput = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  sort: z.enum(SORT_FIELDS as unknown as [string, ...string[]]).default("ovr"),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(120).optional(),
  cardType: z.enum(CARD_TYPES).optional(),
  // Card-type scope ("All" = omitted). The /players page sends its visible scope
  // here; the home "Epic & Big Time" quick filter sends ["EPIC"] (Big Time cards
  // are stored under EPIC — see CARD_TYPE_LABELS).
  cardTypeIn: z.array(z.enum(CARD_TYPES)).max(CARD_TYPES.length).optional(),
  position: z.enum(POSITIONS).optional(),
  playingStyle: int4.optional(),
  defensiveStyle: int4.optional(),
  ovrMin: z.coerce.number().int().min(0).max(100).optional(),
  ovrMax: z.coerce.number().int().min(0).max(100).optional(),
  maxOvrMin: z.coerce.number().int().min(0).max(120).optional(),
  maxOvrMax: z.coerce.number().int().min(0).max(120).optional(),
  weakFoot: z.enum(["0", "1", "2", "3"]).optional(),
  strongerFoot: int4.optional(),
  nationalityId: int4.optional(),
  // clubId → Player.teamId; leagueId → Team.leagueId (implemented in the API).
  clubId: int4.optional(),
  leagueId: int4.optional(),
  skillId: int4.optional(),
});
export type PlayerListInput = z.infer<typeof playerListInput>;

export const playerByIdInput = z.object({
  // baseId + cardId path params (efootbase-style /players/[baseId]/[cardId])
  baseId: bigIntString,
  cardId: bigIntString,
});

// Name search (home palette, header, compare picker). Queries shorter than 2
// characters after normalisation return an empty list (design decision 6); the
// schema itself still accepts 1 character so a half-typed query is not a 400.
export const playerSearchInput = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Comparison: 1–4 cards. (min 1, not 2: the page renders each card as soon as
// it's picked, before the second card is selected. The stat matrix panel is
// gated client-side on compareData.length >= 2 — schema only needs to accept
// a single pick so the chosen card shows instead of a re-shown Add Player
// placeholder that swallows the next addition. See notes 2026-10-08.)
export const compareInput = z.object({
  cardIds: z.array(bigIntString).min(1).max(4),
});

export const managerListInput = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  sort: z.enum([...MANAGER_TACTICS, "name", "age"] as [string, ...string[]]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().trim().max(120).optional(),
  // filter by tactic minimum (e.g. quickCounter >= 88)
  tacticMin: z
    .object({
      possessionGame: int4.optional(),
      quickCounter: int4.optional(),
      longBallCounter: int4.optional(),
      outWide: int4.optional(),
      longBall: int4.optional(),
      overload: int4.optional(),
    })
    .optional(),
});

export const managerByIdInput = z.object({
  id: bigIntString,
});

export const managerCompatInput = z.object({
  managerId: bigIntString,
  playerId: bigIntString,
});

export const skillListInput = z.object({
  category: z.string().trim().max(64).optional(),
});

export const skillByIdInput = z.object({ slug: z.string().trim().min(1).max(120) });

// Holders of a skill, paginated. A small `limit` (e.g. 4) is the "top cards"
// call used by the skills index; the order is deterministic (ovr DESC, id DESC).
export const skillPlayersInput = z.object({
  slug: z.string().trim().min(1).max(120),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
});

export const packListInput = z.object({
  type: z.enum(["special_list", "pack", "all"]).default("all"),
});

export const packByIdInput = z.object({ id: z.string().trim().min(1).max(200) });

// Featured bundle (efootbase "Latest Packs") by its stable slug — name + release
// date, e.g. `spanish-league-midfielders-2026-10-05`, `spotlight-leo-messi-2027-…`.
export const featuredBySlugInput = z.object({ slug: z.string().trim().min(1).max(200) });

// Build simulator input (player-progression-simulator): stat points per
// training category + booster toggles + max level + position. No manager
// field (no verifiable data). The engine flags an over-budget allocation
// (`withinBudget`), so the per-category bound here is only a sanity limit —
// 99 stat points cost 1,250 training points, far beyond any level cap.
const MAX_STAT_POINTS_PER_CATEGORY = 99;
const trainingPointsShape = Object.fromEntries(
  TRAINING_CATEGORIES.map((cat) => [cat, z.number().int().min(0).max(MAX_STAT_POINTS_PER_CATEGORY).default(0)]),
) as Record<TrainingCategory, z.ZodDefault<z.ZodNumber>>;
export const trainingAllocationInput = z.object(trainingPointsShape);
// Level caps in the data top out at 77; 200 leaves room for new card types.
const MAX_LEVEL_LIMIT = 200;

export const buildSimulateInput = z.object({
  playerId: bigIntString,
  // Defaults (applied by the API): maxLevel → the card's level cap,
  // position → the card's registered position.
  maxLevel: z.number().int().min(1).max(MAX_LEVEL_LIMIT).optional(),
  position: z.enum(POSITIONS).optional(),
  trainingPoints: trainingAllocationInput.default({}),
  // Booster 1 is applied by default, Booster 2 only when toggled.
  boosters: z.tuple([z.boolean(), z.boolean()]).default([true, false]),
});
export type BuildSimulateInput = z.infer<typeof buildSimulateInput>;

export const buildSaveInput = z.object({
  playerId: bigIntString,
  maxLevel: z.number().int().min(1).max(MAX_LEVEL_LIMIT),
  position: z.enum(POSITIONS),
  trainingPoints: trainingAllocationInput,
  boosters: z.tuple([z.boolean(), z.boolean()]),
  note: z.string().trim().max(500).optional(),
  isPublic: z.boolean().default(true),
});

// Community: tier vote + review.
export const tierVoteInput = z.object({
  playerId: bigIntString,
  tier: z.enum(["S", "A", "B", "C", "D"]),
});

export const reviewInput = z.object({
  playerId: bigIntString,
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().trim().min(1).max(4000),
});

// ---- Phase 2: auth + profiles + feed + tier lists ----

// Email/password auth.
export const signUpInput = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_]+$/, "username may only contain letters, numbers, and underscores"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  region: z.string().trim().max(48).optional(),
  country: z.string().trim().max(48).optional(),
});

export const signInInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Username profile lookups.
export const byUsernameInput = z.object({ username: z.string().trim().min(1).max(64) });

// Follow / unfollow.
export const followInput = z.object({ username: z.string().trim().min(1).max(64) });

// User-scoped listings.
export const userBuildsInput = z.object({
  username: z.string().trim().min(1).max(64),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const userReviewsInput = userBuildsInput;
export const userTierVotesInput = userBuildsInput;

// Followers / following listings.
export const followListInput = z.object({
  username: z.string().trim().min(1).max(64),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Tier list creation / voting.
export const tierListCreateInput = z.object({
  name: z.string().trim().min(1).max(120),
  tiers: z.record(z.string(), z.array(bigIntString)).refine(
    (v) => Object.keys(v).every((k) => ["S", "A", "B", "C", "D"].includes(k)),
    { message: "tier keys must be one of S, A, B, C, D" },
  ),
  isPublic: z.boolean().default(true),
});

export const tierListByIdInput = z.object({ id: z.string().min(1) });

export const tierListVoteCardInput = z.object({
  playerId: bigIntString,
  tier: z.enum(["S", "A", "B", "C", "D"]),
});

// Feed post creation + likes + comments.
export const feedCreateInput = z.object({
  content: z.string().trim().max(4000),
  mediaUrls: z.array(z.string().url()).max(4).default([]),
  playerId: bigIntString.optional(),
});

export const feedListInput = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  region: z.string().trim().max(48).optional(),
  country: z.string().trim().max(48).optional(),
});

export const postByIdInput = z.object({ postId: z.string().min(1) });

export const commentInput = z.object({
  postId: z.string().min(1),
  content: z.string().trim().min(1).max(2000),
});

export const commentsListInput = z.object({
  postId: z.string().min(1),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Tournament leaderboard + new-players listings — no input for now.
export const leaderboardInput = z.object({}).optional();

// New-players: latest packs by release date.
export const newPlayersInput = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Sum-of-abilities / average for sort calc (server side).
export const sumOfAbilities = (stats: Record<string, number>): number =>
  BASE_STATS.reduce((sum, s) => sum + (stats[s] ?? 0), 0);

export const averageAbility = (stats: Record<string, number>): number =>
  Math.round(sumOfAbilities(stats) / BASE_STATS.length);
