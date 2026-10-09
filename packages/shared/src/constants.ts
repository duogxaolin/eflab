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

// 32 eFootball playing styles (attacking + defensive, single enum shared by both
// `playingStyleAttack` and `playingStyleDefense`). Numeric IDs from efootbase
// `players_meta.json` → `playing_style.values`. eflab seeds `playingStyleAttack`
// from efootbase `playing_style` and `playingStyleDefense` from `playing_style_2`.
// 0 = Basic (no style) for both slots; efootbase shows "Basic" for unstyled cards.
export const PLAYING_STYLES: Readonly<Record<number, string>> = {
  0: "Basic",
  1: "Goal Poacher",
  2: "Dummy Runner",
  3: "Fox in the Box",
  4: "Prolific Winger",
  5: "Classic No. 10",
  6: "Hole Player",
  7: "Box-to-Box",
  8: "Anchor Man",
  9: "The Destroyer",
  10: "Extra Frontman",
  11: "Attacking Full-back",
  12: "Defensive Full-back",
  13: "Deep-Lying Forward",
  14: "Creative Playmaker",
  15: "Build Up",
  16: "Attacking GK",
  17: "Defensive GK",
  18: "Roaming Flank",
  19: "Cross Specialist",
  20: "Orchestrator",
  21: "Full-back Finisher",
  22: "Target Man",
  24: "Front Line Pressure",
  25: "Front Line Poacher",
  26: "Attack Outlet",
  27: "All-action Defender",
  28: "Pass Disruptor",
  29: "Covering Role",
  30: "High Line Master",
  33: "Sweeper GK",
  35: "High Line GK",
};

/** Resolve a playing-style id to its display name, defaulting to "Basic". */
export function playingStyleName(id: number | null | undefined): string {
  if (id == null) return "Basic";
  return PLAYING_STYLES[id] ?? "Basic";
}

// efootbase playing-style id → short description (from efootbase player detail page).
// Used on the player detail page tactical box. Keys without a known description are
// omitted (the UI falls back to just the style name). Sourced from efootbase
// /players/{baseId}/{playerId} verbatim 2026-10-08.
export const PLAYING_STYLE_DESCRIPTIONS: Partial<Record<string, string>> = {
  "Classic No. 10":
    "A traditional playmaker who operates near the penalty area, creating and finishing chances, while conserving stamina by avoiding unnecessary sprints.",
  "Goal Poacher":
    "A predatory striker who lurks in the penalty area, pouncing on any loose ball to score.",
  "Dummy Runner":
    "A forward who draws defenders away with intelligent off-the-ball runs to create space for teammates.",
  "Fox in the Box":
    "A penalty-box predator who waits inside the area for the slightest sniff of goal.",
  "Prolific Winger":
    "A wide attacker who uses pace and dribbling to beat defenders and deliver crosses or cut inside to shoot.",
  "Hole Player":
    "An attacking midfielder who drifts into pockets of space between the lines to receive and create.",
  "Box-to-Box":
    "A tireless midfielder who contributes at both ends of the pitch, supporting attacks and tracking back to defend.",
  "Anchor Man":
    "A defensive midfielder who shields the backline and stays deep to break up opposition attacks.",
  "The Destroyer":
    "An aggressive ball-winner who hunts the ball and breaks up play with tough tackling.",
  "Extra Frontman":
    "A defender who ventures forward to add weight to attacks, almost becoming an extra striker.",
  "Attacking Full-back":
    "A full-back who bombs forward to support the attack, overlapping and delivering crosses.",
  "Defensive Full-back":
    "A conservative full-back who prioritises defensive duties and rarely ventures forward.",
  "Deep-Lying Forward":
    "A forward who drops deep to link play, drawing defenders out and creating space for teammates.",
  "Creative Playmaker":
    "A vision-driven player who exploits openings in the defence to launch attacks and provide decisive passes.",
  "Build Up":
    "A defender or midfielder who orchestrates play from deep, distributing the ball to start attacks.",
  "Roaming Flank":
    "A wide player who drifts across the pitch to find space and influence play in multiple zones.",
  "Cross Specialist":
    "A wide player who specialises in delivering accurate crosses into the box.",
  "Orchestrator":
    "A deep-lying playmaker who controls the tempo and dictates play from midfield.",
  "Full-back Finisher":
    "A full-back who makes attacking runs inside to get into scoring positions.",
  "Target Man":
    "A tall, physical striker who holds up the ball and wins aerial duels to bring others into play.",
  "Front Line Pressure":
    "A forward who presses the opposition backline to force turnovers high up the pitch.",
  "Attack Outlet":
    "A player who provides a reliable outlet for forward passes, holding up play and bringing others in.",
  "All-action Defender":
    "A defender who contributes across the pitch, defending solidly and joining the attack when possible.",
  "Pass Disruptor":
    "Defends by actively blocking the opponent's passing lanes.",
  "Covering Role":
    "A defender who provides cover for teammates, sweeping up behind the defensive line.",
  "High Line Master":
    "A defender who plays a high line, pushing the defensive line up to compress play.",
  "Sweeper GK":
    "A goalkeeper who sweeps up behind the defensive line, acting as a last-man defender.",
  "High Line GK":
    "A goalkeeper who plays a high line, ready to sweep up behind a pushed-up defence.",
  "Attacking GK":
    "A goalkeeper who is proactive in starting attacks with quick distribution.",
  "Defensive GK":
    "A conservative goalkeeper who prioritises shot-stopping and staying on the line.",
  "Front Line Poacher":
    "A forward who poaches goals by lurking on the edge of the defensive line.",
};

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
  | "releaseDate"
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
  "releaseDate",
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
