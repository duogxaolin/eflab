// eFootball domain constants — derived from the efhub SQLite schema (259 cols)
// and the verified field surveys (2026-09-28).

// 26 base stats (value 40–99). camelCase is the internal standardized name.
// Aliases from providers documented below each.
export const BASE_STATS = [
  "offensiveAwareness",
  "ballControl",
  "dribbling",
  "tightPossession",
  "lowPass",
  "loftedPass",
  "finishing",
  "heading",
  "placeKicking",
  "curl",
  "speed",
  "acceleration",
  "kickingPower",
  "jump",
  "physicalContact",
  "balance",
  "stamina",
  "defensiveAwareness",
  "ballWinning", // efhub name; pesdb/efootbase call it "tackling"
  "defensiveEngagement",
  "aggression",
  "gkAwareness",
  "gkCatching",
  "gkParrying", // efhub calls it "GKClearing"; pesdb/efootbase "gk_parrying"
  "gkReflexes",
  "gkReach",
] as const;

export type BaseStat = (typeof BASE_STATS)[number];

// Alias map: external provider name → standardized internal name.
// per spec: GKClearing → gkParrying, BallWinning → tackling (internal uses tackling? No —
// we standardize to efhub-style camelCase with parrying normalized).
export const STAT_ALIAS_MAP: Record<string, BaseStat> = {
  OffensiveAwareness: "offensiveAwareness",
  BallControl: "ballControl",
  Dribbling: "dribbling",
  TightPossession: "tightPossession",
  LowPass: "lowPass",
  LoftedPass: "loftedPass",
  Finishing: "finishing",
  Heading: "heading",
  PlaceKicking: "placeKicking",
  Curl: "curl",
  Speed: "speed",
  Acceleration: "acceleration",
  KickingPower: "kickingPower",
  Jump: "jump",
  PhysicalContact: "physicalContact",
  Balance: "balance",
  Stamina: "stamina",
  DefensiveAwareness: "defensiveAwareness",
  BallWinning: "ballWinning", // efhub
  Tackling: "ballWinning", // pesdb/efootbase alias
  DefensiveEngagement: "defensiveEngagement",
  Aggression: "aggression",
  GKAwareness: "gkAwareness",
  GKCatching: "gkCatching",
  GKClearing: "gkParrying", // explicit normalization per spec
  gk_parrying: "gkParrying",
  GKParrying: "gkParrying",
  GKReflexes: "gkReflexes",
  GKReach: "gkReach",
};

// The 6 macro dimensions used by the comparison radar (SHT, PAS, PHY, DEF, DRI, SPD).
export const RADAR_AXES = ["SHT", "PAS", "PHY", "DEF", "DRI", "SPD"] as const;
export type RadarAxis = (typeof RADAR_AXES)[number];

// Map each radar axis to its constituent base stats (averaged for the radar value).
export const RADAR_STAT_MAP: Record<RadarAxis, BaseStat[]> = {
  SHT: ["finishing", "heading", "placeKicking", "curl", "kickingPower"],
  PAS: ["lowPass", "loftedPass"],
  PHY: ["physicalContact", "balance", "stamina", "jump"],
  DEF: ["defensiveAwareness", "ballWinning", "defensiveEngagement", "aggression"],
  DRI: ["ballControl", "dribbling", "tightPossession"],
  SPD: ["speed", "acceleration"],
};

// 11 physique / body-model fields (PlayerAppearance table).
export const PHYSIQUE_FIELDS = [
  "neckLength",
  "neckSize",
  "shoulderHeight",
  "shoulderWidth",
  "chestMeasurement",
  "waistSize",
  "armSize",
  "armLength",
  "thighSize",
  "calfSize",
  "legLength",
] as const;
export type PhysiqueField = (typeof PHYSIQUE_FIELDS)[number];

// 5 derived physics metrics (computed from physique + height).
export const DERIVED_FIELDS = [
  "legCoverage",
  "armCoverage",
  "peakJumpHeight",
  "torsoCollisionWidth",
  "dribbleHeight",
] as const;
export type DerivedField = (typeof DERIVED_FIELDS)[number];

// 13 play positions used in the position aptitude / heatmap matrix.
export const POSITIONS = [
  "GK",
  "CB",
  "LB",
  "RB",
  "DMF",
  "CMF",
  "LMF",
  "RMF",
  "AMF",
  "LWF",
  "RWF",
  "SS",
  "CF",
] as const;
export type Position = (typeof POSITIONS)[number];

// 12-position familiarity heatmap (excludes the registered position from the "grid" slots;
// efootbase shows 12 markers on the pitch). We surface all 13 aptitudes but visually present 12
// on the pitch diagram (GK is usually separate). For the heatmap we use the 12 outfield slots.
export const HEATMAP_POSITIONS: readonly Position[] = POSITIONS;

// Card types / player tiers.
export const CARD_TYPES = [
  "STANDARD",
  "TRENDING",
  "EPIC",
  "BIG_TIME",
  "HIGHLIGHT",
  "SHOW_TIME",
  "STRIKE_ARENA",
  "LEGENDARY",
] as const;
export type CardType = (typeof CARD_TYPES)[number];

// 67 skills (canonical eFootball skill set — matches efootbase's 67 skill pages).
// Ordered by category. Each has a slug derived from its name.
export const SKILL_IDS = [
  // Passing
  "OneTouchPass",
  "ThroughPassing",
  "WeightedPass",
  "PinpointCrossing",
  "LowLoftedPass",
  "OutsideCurler",
  "NoLookPass",
  "Rabona",
  // Shooting
  "LongRange",
  "LongRangeShooting",
  "LongRangeDrive",
  "AcrobaticFinishing",
  "FirstTimeShot",
  "HellTrick",
  "ChipShotControl",
  "KnuckleShot",
  "DippingShot",
  "RisingShots",
  "PenaltySpecialist",
  // Dribbling / ball control
  "ScissorsFeint",
  "DoubleTouch",
  "FlipFlap",
  "MarseilleTurn",
  "Sombrero",
  "CrossOverTurn",
  "CutBehindTurn",
  "ScotchMove",
  "StepOnSkillControl",
  "MazingRun",
  "DribbleMotion",
  // GK
  "GKLowPunt",
  "GKHighPunt",
  "GKLongThrow",
  "GKPenaltySaver",
  // Defending
  "ManMarking",
  "Interception",
  "TrackBack",
  "Blocker",
  "AerialSuperiority",
  "SlidingTackle",
  "AcrobaticClear",
  "Captaincy",
  "SuperSub",
  "FightingSpirit",
  "Gamesmanship",
  "LongReachTackle",
  // Set pieces / movement
  "LongThrow",
  "CornerKick",
  "FreeKick",
  "PenaltyKick",
  "EarlyCross",
  "LongBallExpert",
  "incisiveRun",
  "SpeedingBullet",
  "Trickster",
  // Heading variants
  "sHeading", // slot heading skill
  // Running motions
  "DribblingHunching",
  "DribblingArmMovement",
  "RunningHunching",
  "RunningArmMovement",
  // Phenomenal / Showtime skills (newer)
  "momentumDribbling",
  "PhenomenalFinishing",
  "PhenomenalPassing",
  "edgedCrossing",
  "gameChangingPass",
  "visionaryPass",
  "fortress",
  "accelerationBurst",
  "bulletHeader",
  "BlitzCurler",
  "LowScreamer",
  "AerialForte",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

// 8 training categories for the build simulator progression engine.
export const TRAINING_CATEGORIES = [
  "Shooting",
  "Passing",
  "Dribbling",
  "Dexterity",
  "LowerBody",
  "Aerial",
  "Defending",
  "Goalkeeping",
] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

// 6 manager tactic masteries.
export const MANAGER_TACTICS = [
  "possessionGame",
  "quickCounter",
  "longBallCounter",
  "outWide",
  "longBall",
  "overload",
] as const;
export type ManagerTactic = (typeof MANAGER_TACTICS)[number];

// 5 player tactic-compat fields (subset of the 6 manager tactics — no overload).
export const PLAYER_TACTICS: readonly ManagerTactic[] = [
  "possessionGame",
  "quickCounter",
  "longBallCounter",
  "outWide",
  "longBall",
] as const;

// Booster slot count.
export const BOOSTER_SLOT_COUNT = 2;

// 11 filter dimensions for /players.
export const PLAYER_FILTER_DIMENSIONS = [
  "cardType",
  "position",
  "playingStyle",
  "defensiveStyle",
  "ovr",
  "weakFoot",
  "physicality",
  "nationality",
  "club",
  "league",
  "skills",
] as const;

// Stat color tiers (matches spec: 90+ purple/red, 80-89 orange, 70-79 blue).
export function statTierColor(value: number): {
  tier: "elite" | "high" | "mid" | "low";
  color: string;
} {
  if (value >= 90) return { tier: "elite", color: "#f472b6" }; // pink/red accent
  if (value >= 80) return { tier: "high", color: "#fb923c" }; // orange
  if (value >= 70) return { tier: "mid", color: "#06b6d4" }; // cyan
  return { tier: "low", color: "#64748b" }; // slate
}

// 60+ sort fields exposed to the directory (matches pesdb's sort list).
export type SortField =
  | "recentlyAdded"
  | "playerId"
  | "name"
  | "namePrint"
  | "japName"
  | "chineseName"
  | "squadNumber"
  | "nationalShirtNumber"
  | "club"
  | "nationality"
  | "ovr"
  | "maxOvr"
  | "age"
  | "height"
  | "weight"
  | "maxLevel"
  | "playerValue"
  | "sumOfAbilities"
  | "averageAbility"
  | BaseStat
  | `max${Capitalize<BaseStat>}`
  | "physicalContact"
  | "legCoverage"
  | "armCoverage"
  | "peakJumpHeight"
  | "torsoCollisionWidth"
  | `rating${Capitalize<Position>}`;

export const SORT_FIELDS: readonly string[] = [
  "recentlyAdded",
  "playerId",
  "name",
  "namePrint",
  "japName",
  "chineseName",
  "squadNumber",
  "nationalShirtNumber",
  "club",
  "nationality",
  "ovr",
  "maxOvr",
  "age",
  "height",
  "weight",
  "maxLevel",
  "playerValue",
  "sumOfAbilities",
  "averageAbility",
  ...BASE_STATS,
  ...BASE_STATS.map((s) => `max${(s[0] ?? "o").toUpperCase()}${s.slice(1)}`),
  "legCoverage",
  "armCoverage",
  "peakJumpHeight",
  "torsoCollisionWidth",
  ...POSITIONS.map((p) => `rating${p[0]}${p.slice(1).toLowerCase()}`),
];

// Helper for type-level capitalize.
type Capitalize<S extends string> = S extends `${infer H}${infer T}`
  ? `${Uppercase<H>}${T}`
  : S;
