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
  /** Max achievable OVR (base card's maxOvr). Used by the detail-page card render
   *  for the bottom-left "MAX NN" efootbase badge (efootbase dna §10 detail).
   *  Optional on CardPreview because some lightweight producers (featured bundle
   *  cards, pack cards, skill listings) don't select it — PlayerCardDTO always
   *  carries it. Added 2026-10-08 (was PlayerCardDTO-only — the detail-card
   *  render was missing efootbase's MAX badges). */
  maxOvr?: number;
  /** Nationality flag URL (R2) for the detail-card nation overlay. PlayerCardDTO
   *  always carries it (joined from Country.flagUrl in the API); CardPreview
   *  only needs it when rendered in the detail context (showDetails=true). Most
   *  grid producers don't join Country, so optional here. */
  flagUrl?: string | null;
  nationalityId?: number;
  /** Playing-style ids (numeric, see PLAYING_STYLES). When present, PlayerCard
   *  renders the 2-line "Attack: X / Defence: Y" label under the card name
   *  (matches efootbase grid/list cards). Optional — lightweight producers that
   *  don't select these just omit the label. Added 2026-10-09. */
  playingStyleAttack?: number;
  playingStyleDefense?: number;
}

export interface PlayerCardDTO extends CardPreview {
  accentedName: string | null;
  japName: string | null;
  chineseName: string | null;
  shirt: string | null;
  shirtNational: string | null;
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
  // resolved booster objects (joined from Booster table by boosterId1/2). When the
  // API batch-attaches these, the detail page + compare render the real name +
  // stat magnitudes instead of "Booster #199". Added 2026-10-08 — dump has 359
  // booster IDs not in fixtures/boosters.json; seeder Phase 1c upserts them.
  booster1: BoosterDTO | null;
  booster2: BoosterDTO | null;
  // relations
  otherVersions: Array<{
    id: string;
    cardType: CardType;
    ovr: number;
    maxOvr: number;
    /** registeredPosition — needed to render the position badge under each
     *  version in the "Other versions of <player>" carousel. Added 2026-10-08
     *  (was just {id,cardType,ovr,maxOvr} which forced a fallback position). */
    registeredPosition: number;
  }>;
  pack: { id: string; name: string } | null;
  // community tier (aggregated)
  communityTier: string | null;
  // R2 image URLs (populated from Country.flagUrl / Team.emblemUrl / League.emblemUrl
  // via seed-efootbase-full.ts). When present, the client renders these instead of
  // constructing efimg URLs from IDs. efootbase uses SHA256 hash filenames → not
  // ID-derivable → must come from DB.
  // (flagUrl is inherited from CardPreview — that's where the nation overlay on
  //  detail cards pulls it from. teamEmblemUrl stays here since the CardPreview
  //  lightweight card list doesn't need a club emblem.)
  teamEmblemUrl: string | null;
  // Display-name overlays (joined Team/Country/League in the API procedure).
  // Added 2026-10-08 so the player detail page can show the player's actual
  // club, nationality, and league without hardcoding Messi/FC Barcelona.
  countryName: string | null;
  teamName: string | null;
  leagueName: string | null;
  leagueEmblemUrl: string | null;
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

/** Resolved booster (joined by boosterId1/boosterId2 from the Booster table).
 *  `stats` carries only the bumped stats (sparse), matching the efootbase dump
 *  shape so the UI can render "+4 Low Pass · +4 Loft Pass" pills. */
export interface BoosterDTO {
  id: number;
  name: string;
  magnitude: number;
  tier: string;
  stats: Partial<Record<BaseStat, number>>;
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

/** efootbase homepage "Latest Packs" featured bundle (specialPlayerList entry).
 *  Cards are pre-ordered by `ordinal` (efootbase's exact display order — note
 *  this includes legend spotlights pulled from other packs, so OVR is not
 *  monotonic). `releaseDate` comes from efootbase's `time` field. */
export interface FeaturedBundleDTO {
  id: number;
  name: string;
  slug: string;
  releaseDate: string;
  position: number;
  cards: CardPreview[];
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
