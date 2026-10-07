import { z } from "zod";
import {
  BASE_STATS,
  CARD_TYPES,
  MANAGER_TACTICS,
  POSITIONS,
  SORT_FIELDS,
  TRAINING_CATEGORIES,
} from "./constants";

// BigInt-friendly id transformer. SuperJSON handles bigint at the wire layer, but Zod
// parses the request (strings) so we coerce.
export const bigIntString = z
  .string()
  .regex(/^\d{1,20}$/, "expected numeric id")
  .transform((v) => BigInt(v));

// 11-dimension player filter schema.
export const playerListInput = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  sort: z.enum(SORT_FIELDS as [string, ...string[]]).default("ovr"),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(120).optional(),
  cardType: z.enum(CARD_TYPES).optional(),
  position: z.enum(POSITIONS).optional(),
  playingStyle: z.coerce.number().int().optional(),
  defensiveStyle: z.coerce.number().int().optional(),
  ovrMin: z.coerce.number().int().min(40).max(99).optional(),
  ovrMax: z.coerce.number().int().min(40).max(99).optional(),
  maxOvrMin: z.coerce.number().int().min(40).max(120).optional(),
  maxOvrMax: z.coerce.number().int().min(40).max(120).optional(),
  weakFoot: z.enum(["0", "1", "2", "3"]).optional(),
  nationalityId: z.coerce.number().int().optional(),
  clubId: z.coerce.number().int().optional(),
  leagueId: z.coerce.number().int().optional(),
  skillId: z.coerce.number().int().optional(),
  cardTypeIn: z.array(z.enum(CARD_TYPES)).optional(),
});
export type PlayerListInput = z.infer<typeof playerListInput>;

export const playerByIdInput = z.object({
  // baseId + cardId path params (efootbase-style /players/[baseId]/[cardId])
  baseId: bigIntString,
  cardId: bigIntString,
});

export const playerSearchInput = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Comparison: 2–4 cards.
export const compareInput = z.object({
  cardIds: z.array(bigIntString).min(2).max(4),
});

export const managerListInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  sort: z.enum([...MANAGER_TACTICS, "name", "age"] as [string, ...string[]]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().trim().max(120).optional(),
  // filter by tactic minimum (e.g. quickCounter >= 88)
  tacticMin: z
    .object({
      possessionGame: z.coerce.number().int().optional(),
      quickCounter: z.coerce.number().int().optional(),
      longBallCounter: z.coerce.number().int().optional(),
      outWide: z.coerce.number().int().optional(),
      longBall: z.coerce.number().int().optional(),
      overload: z.coerce.number().int().optional(),
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
  category: z.string().optional(),
});

export const skillByIdInput = z.object({ slug: z.string() });

export const skillPlayersInput = z.object({
  slug: z.string(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
});

export const packListInput = z.object({
  type: z.enum(["special_list", "pack", "all"]).default("all"),
});

export const packByIdInput = z.object({ id: z.string() });

// Build simulator input — point allocations + boosters + manager.
const trainingPointsShape = Object.fromEntries(
  TRAINING_CATEGORIES.map((cat) => [cat, z.number().int().min(0).max(20).default(0)]),
) as Record<string, z.ZodDefault<z.ZodNumber>>;

export const buildSimulateInput = z.object({
  playerId: bigIntString,
  level: z.number().int().min(1).max(100).default(1),
  maxLevel: z.number().int().min(1).max(100).default(100),
  trainingPoints: z.object(trainingPointsShape).default(Object.fromEntries(TRAINING_CATEGORIES.map((c) => [c, 0]))),
  boosters: z.array(z.boolean()).length(2).default([false, false]),
  managerId: bigIntString.optional(),
});
export type BuildSimulateInput = z.infer<typeof buildSimulateInput>;

export const buildSaveInput = z.object({
  playerId: bigIntString,
  managerId: bigIntString.optional(),
  level: z.number().int().min(1),
  trainingPoints: z.object(trainingPointsShape),
  boosters: z.array(z.boolean()).length(2),
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
