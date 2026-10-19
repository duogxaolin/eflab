import type { BaseStat, CardType, PhysiqueField, Position, PositionProficiency, TrainingCategory } from "./constants";

// Serialized DTO shapes (what tRPC returns after SuperJSON). BigInt → string.
/** Everything a PlayerCard tile needs in a list/grid (player.list, trending,
 *  featured bundles, pack grids, skill holders): identity, card type, OVR/Max
 *  OVR, position, condition, nationality flag (R2) and the two playing-style
 *  ids for the "Attack / Defence" label. `player.list` returns exactly this
 *  shape (design decision 14); the detail and compare views get the full
 *  PlayerCardDTO. */
export interface CardPreview {
  id: string;
  baseId: string;
  name: string;
  cardType: CardType;
  ovr: number;
  maxOvr: number;
  registeredPosition: number;
  condition: string;
  /** Nationality flag URL (R2, rebased onto R2_PUBLIC_BASE by the API) for the
   *  nation overlay on detail-style cards. Producers that do not join Country
   *  (featured bundles, pack grids, skill holders) leave it undefined. */
  flagUrl?: string | null;
  nationalityId?: number;
  /** Playing-style ids (numeric, see PLAYING_STYLES). Optional for lightweight
   *  producers that do not select them. */
  playingStyleAttack?: number;
  playingStyleDefense?: number;
}

/** Full card for the detail page and the compare view. Fields the web app never
 *  rendered (shirt numbers, country2, form, datapack, physique, derived physics,
 *  tactic compat, alternate-script names) were dropped in eflab-parity-fixes
 *  (design decision 14); they still exist in the database. */
export interface PlayerCardDTO extends CardPreview {
  nationalityId: number;
  height: number;
  weight: number;
  age: number;
  strongerFoot: number;
  playingStyleAttack: number;
  playingStyleDefense: number;
  weakFootUsage: number;
  weakFootAccuracy: number;
  releaseDate: string | null;
  /** Real max level of the card (efootbase `level_cap`) — drives the MAX LEVEL badge. */
  levelCap: number;
  // 26 base stats
  stats: Record<BaseStat, number>;
  // 26 max stats
  maxStats: Record<BaseStat, number>;
  // 13 position aptitudes (0/1/2 = registered/secondary/none)
  positionAptitudes: Record<Position, number>;
  // 13 per-position OVR ratings from the eFHUB cross-fill; null when the player
  // is absent from eFHUB (the Pitch Map shows "n/a", never an invented 40).
  positionRatings: Record<Position, number | null>;
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
    registeredPosition: number;
  }>;
  pack: { id: string; name: string } | null;
  // R2 image URLs (populated from Team.emblemUrl / League.emblemUrl by the seeder,
  // rebased onto R2_PUBLIC_BASE by the API). efootbase uses SHA256 hash filenames
  // → not ID-derivable → must come from the DB. flagUrl is inherited from CardPreview.
  teamEmblemUrl: string | null;
  // Display-name overlays (joined Team/Country/League in the API procedure).
  countryName: string | null;
  teamName: string | null;
  leagueName: string | null;
  leagueEmblemUrl: string | null;
  // ---- Detail-only extras (efootbase-parity-round2). The columns exist in
  // the database (Player.form / injuryResistance / 11 physique Ints / 5 derived
  // Floats) and are optional here so the detail page can render the sections
  // as soon as player.byId carries them; a producer that does not select them
  // leaves them undefined and the UI shows an "not exposed" note, never a
  // substitute number.
  /** Form 0–2 — efootbase shows it as (value + 1) stars of 3. */
  form?: number;
  /** Injury resistance 0–2 — efootbase shows it as (value + 1) stars of 3. */
  injuryResistance?: number;
  /** 11 body-model values (1–10), keyed by PhysiqueField. */
  physique?: Record<PhysiqueField, number>;
  /** 5 derived body metrics (floats) — efootbase's "Leg Coverage Radius",
   *  "Arm Coverage Radius", "Jump Height", "Torso Collision", "Leg Length Height". */
  bodyMetrics?: {
    legCoverage: number;
    armCoverage: number;
    peakJumpHeight: number;
    torsoCollisionWidth: number;
    dribbleHeight: number;
  };
}

/** efootbase's two skill groups. Catalogue entries efootbase does not treat as
 *  skills have no group (`null`) and are listed under "Other". */
export type SkillGroup = "showtime" | "classic";

/** One stat boost of a skill, with the eFootLab stat name (efootbase `tackling`
 *  → `ballWinning`, `jumping` → `jump`, `setPieceTaking` → `placeKicking`). */
export interface SkillEffect {
  stat: BaseStat;
  value: number;
}

/** A public skill (skill.list / skill.byId). Name, description, group, icon,
 *  effects and activation come from the static efootbase snapshot when the seed
 *  had it (openspec efootbase-static-data); otherwise they are the fixture text
 *  and null / []. Unreleased skills are never returned. */
export interface SkillDTO {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  /** null = not an efootbase skill (the "Other" entries) or no snapshot. */
  group: SkillGroup | null;
  /** efootbase's wiki order (0-based); null for the "Other" entries. */
  sortOrder: number | null;
  /** Skill icon on R2 (rebased onto R2_PUBLIC_BASE), or null. */
  iconUrl: string | null;
  /** Stat boosts observed on efootbase; [] when none (most skills, and every
   *  skill whose boost was never seen on a loaded card). */
  effects: SkillEffect[];
  /** When the boost applies (efootbase text), or null. */
  activation: string | null;
  /** Always true in API responses (hidden skills are filtered out). */
  released: boolean;
  /** Number of cards that have this skill (grouped count of PlayerSkill). 0 for
   *  catalogue skills no dump card carries. */
  playerCount: number;
}

/** Paginated holders of one skill (skill.players). `items` is the slim card
 *  shape; `total` is the full holder count so the index can show "N cards" and
 *  a top-N call (small `limit`) still knows the real total. */
export interface SkillPlayersResult {
  items: CardPreview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

/** player.list result — slim card previews (design decision 14). */
export interface PlayerListResult {
  items: CardPreview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Build simulator types (player-progression-simulator). No manager field: no
// dataset ties a manager to a stat or overall change.
export interface BuildConfig {
  playerId: string;
  /** Selected max level, 1..levelCap — the budget is `maxLevel − 1` points. */
  maxLevel: number;
  /** Position the overall is estimated for (defaults to the registered one). */
  position: Position;
  /** Stat points bought per training category (ten categories). */
  trainingPoints: Record<TrainingCategory, number>;
  /** [Booster 1 active, Booster 2 active]. */
  boosters: [boolean, boolean];
  /** Manager Proficiency level 70–90 (efootbase's slider). Omitted → the
   *  engine default MANAGER_PROFICIENCY_DEFAULT (90, efootbase's default);
   *  70 gives no bonus. */
  managerProficiency?: number;
}

// Computed build result returned by the simulator.
export interface BuildResult {
  /** The config as applied (maxLevel clamped to the card's level cap,
   *  managerProficiency clamped to 70..90 / defaulted). */
  config: BuildConfig & { managerProficiency: number };
  base: Record<BaseStat, number>;
  trainingDeltas: Record<BaseStat, number>;
  /** Manager Proficiency bonus per stat (read off base + training, capped
   *  so that it never lifts a stat above 99). */
  proficiencyDeltas: Record<BaseStat, number>;
  boosterDeltas: Record<BaseStat, number>;
  /** base + training + proficiency bonus + active boosters; the boosters may
   *  take a stat above 99. */
  projectedStats: Record<BaseStat, number>;
  /** Training points at the selected max level (`maxLevel − 1`). */
  pointsAvailable: number;
  /** Cost of the allocation in points (multiples of 0.5). */
  pointsUsed: number;
  remainingPoints: number;
  withinBudget: boolean;
  /** Estimated overall at `config.position` (rounded) and its raw value
   *  (including the anchor when there is one). */
  estimatedOvr: number;
  estimatedOvrExact: number;
  /** Proficiency of the card at `config.position` that the estimate assumes
   *  ("full" when no aptitudes were given); half / none apply the fitted penalty. */
  proficiency: PositionProficiency;
  /** Anchor added to the estimate (card overall − formula on its base stats);
   *  null when the estimate is not anchored (another position than the
   *  registered one, or no card overall given). */
  ovrAnchor: number | null;
  /** True at Manager Proficiency 86, whose bonus rule is an unconfirmed exception. */
  managerProficiencyUnconfirmed: boolean;
}

// ---- Auth session (auth.getSession; consumed by apps/web/lib/auth.tsx) ----

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
