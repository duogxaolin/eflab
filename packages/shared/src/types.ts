import type { z } from "zod";
import type {
  BaseStat,
  CardType,
  ManagerTactic,
  PhysiqueField,
  Position,
  DerivedField,
} from "./constants";

// BigInt helpers — IDs serialize as strings via SuperJSON but are BigInt in TS.
export type PlayerId = bigint;
export type ManagerId = bigint;

// Serialized DTO shapes (what tRPC returns after SuperJSON). BigInt → string.
/** Minimal fields needed to render a PlayerCard in a list/grid (trending, pack grid, etc.).
 *  Full PlayerCardDTO is for the detail page. Pack.byId returns this lighter shape. */
export interface CardPreview {
  id: string;
  baseId: string;
  name: string;
  cardType: CardType;
  ovr: number;
  registeredPosition: number;
  condition: string;
}

export interface PlayerCardDTO extends CardPreview {
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
  cardType: CardType;
  featuredPackId: string | null;
  ovr: number;
  maxOvr: number;
  condition: string;
  form: number;
  injuryResistance: number;
  weakFootUsage: number;
  weakFootAccuracy: number;
  releaseDate: string | null;
  datapackId: number;
  // 26 base stats
  stats: Record<BaseStat, number>;
  // 26 max stats
  maxStats: Record<BaseStat, number>;
  // 13 position aptitudes (0/1/2 = registered/secondary/none)
  positionAptitudes: Record<Position, number>;
  // 13 position OVR ratings
  positionRatings: Record<Position, number>;
  // 11 physique
  physique: Record<PhysiqueField, number>;
  // 5 derived
  derived: Pick<Record<DerivedField, number>, "legCoverage" | "armCoverage" | "peakJumpHeight" | "torsoCollisionWidth" | "dribbleHeight">;
  // 5 player tactic compat
  tactics: Pick<Record<ManagerTactic, number>, "possessionGame" | "quickCounter" | "longBallCounter" | "outWide" | "longBall">;
  // AI playstyle flags
  playstyles: {
    trickster: boolean;
    mazingRun: boolean;
    speedingBullet: boolean;
    incisiveRun: boolean;
    longBallExpert: boolean;
    earlyCross: boolean;
  };
  // skills (list of slugs)
  skills: string[];
  // booster ids
  boosterId1: number | null;
  boosterId2: number | null;
  // relations
  otherVersions: Array<{ id: string; cardType: CardType; ovr: number; maxOvr: number }>;
  pack: { id: string; name: string } | null;
  // community tier (aggregated)
  communityTier: string | null;
  // R2 image URLs (populated from Country.flagUrl / Team.emblemUrl via seed-efootbase-full.ts).
  // When present, the client renders these instead of constructing efimg URLs from IDs.
  // efootbase uses SHA256 hash filenames → not ID-derivable → must come from DB.
  flagUrl: string | null;
  teamEmblemUrl: string | null;
}

export interface ManagerDTO {
  id: string;
  name: string;
  accentedName: string | null;
  japName: string | null;
  chineseName: string | null;
  age: number;
  adaptability: number;
  affinity: number;
  tactics: Record<ManagerTactic, number>;
  boosts: number[];
}

export interface PackDTO {
  id: string;
  name: string;
  releaseDate: string;
  type: string;
  playerCount: number;
}

export interface SkillDTO {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
}

export type SortDirection = "asc" | "desc";

export interface PlayerListResult {
  items: PlayerCardDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Build simulator types
export interface BuildConfig {
  playerId: string;
  level: number;
  maxLevel: number;
  trainingPoints: Record<string, number>; // category → points allocated
  boosters: boolean[]; // [booster1Active, booster2Active]
  managerId: string | null;
}

// Computed build result returned by the simulator.
export interface BuildResult {
  config: BuildConfig;
  // projected stats after training + boosters + manager tactic
  projectedStats: Record<BaseStat, number>;
  projectedMaxOvr: number;
  // breakdown of contributions
  base: Record<BaseStat, number>;
  trainingDeltas: Record<BaseStat, number>;
  boosterDeltas: Record<BaseStat, number>;
  managerDeltas: Record<BaseStat, number>;
  remainingPoints: number;
}

// ---- Phase 2: community + profiles + feed + tier lists ----

export interface SessionUserDTO {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  region: string | null;
  country: string | null;
  isPro: boolean;
  proUntil: string | null;
  role: "USER" | "MODERATOR" | "ADMIN";
}

export interface UserDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  region: string | null;
  country: string | null;
  followersCount: number;
  followingCount: number;
  isPro: boolean;
  isFollowing: boolean;
}

export interface UserBuildDTO {
  id: string;
  playerId: string;
  level: number;
  note: string | null;
  isPro: boolean;
  isPublic: boolean;
  createdAt: string;
  player: { id: string; baseId: string; name: string; cardType: string; ovr: number };
}

export interface UserReviewDTO {
  id: string;
  playerId: string;
  rating: number;
  content: string;
  createdAt: string;
  player: { id: string; baseId: string; name: string; cardType: string; ovr: number };
}

export interface UserTierVoteDTO {
  playerId: string;
  tier: string;
  player: { id: string; baseId: string; name: string; cardType: string; ovr: number };
}

export interface FollowDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface TierListItemDTO {
  id: string;
  authorId: string;
  authorName: string;
  name: string;
  tiers: Record<string, string[]>;
  isPublic: boolean;
  submissions: number;
  createdAt: string;
}

export interface FeedPostDTO {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  mediaUrls: string[];
  playerId: string | null;
  playerCard: { id: string; baseId: string; name: string; cardType: string; ovr: number; registeredPosition: number } | null;
  region: string | null;
  country: string | null;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface FeedCommentDTO {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  createdAt: string;
}

export interface NewPlayerPackDTO {
  id: string;
  name: string;
  releaseDate: string;
  type: string;
  playerCount: number;
  players: Array<{ id: string; baseId: string; name: string; cardType: string; ovr: number; maxOvr: number; registeredPosition: number; condition: string }>;
}

export interface LeaderboardTeamDTO {
  id: number;
  name: string;
  country: string;
  points: number;
  rank: number;
}

// Diagnostic type so backend router files can share the inferred input types.
export type RouterInput<T extends { _def: { input: z.ZodTypeAny } }> =
  z.infer<T["_def"]["input"]>;

export const isStringId = (v: unknown): v is string =>
  typeof v === "string" && /^\d{6,20}$/.test(v);
