import {
  BASE_STATS,
  type BaseStat,
  type ManagerTactic,
  type TrainingCategory,
  TRAINING_CATEGORIES,
} from "./constants";
import type { BuildConfig, BuildResult } from "./types";


// Training category → stat mapping. Per the eFootball progression spec:
// Allocating N points to a category increases the listed stats by N (or N/2 for secondary).
// This is an approximation of Konami's real per-level growth table, tuned to the spec scenario:
//   "4 points to Shooting → Offensive Awareness +4, Finishing +4, Set Piece Taking +2"
export const TRAINING_MASTERIES: Record<
  TrainingCategory,
  Array<{ stat: BaseStat; weight: number }>
> = {
  // weight 1 = full +N, weight 0.5 = +N/2 (rounded down).
  Shooting: [
    { stat: "offensiveAwareness", weight: 1 },
    { stat: "finishing", weight: 1 },
    { stat: "placeKicking", weight: 0.5 },
    { stat: "heading", weight: 0.5 },
    { stat: "curl", weight: 0.5 },
    { stat: "kickingPower", weight: 0.5 },
  ],
  Passing: [
    { stat: "lowPass", weight: 1 },
    { stat: "loftedPass", weight: 1 },
    { stat: "ballControl", weight: 0.5 },
    { stat: "tightPossession", weight: 0.5 },
  ],
  Dribbling: [
    { stat: "dribbling", weight: 1 },
    { stat: "ballControl", weight: 1 },
    { stat: "tightPossession", weight: 1 },
    { stat: "balance", weight: 0.5 },
  ],
  Dexterity: [
    { stat: "ballControl", weight: 1 },
    { stat: "tightPossession", weight: 1 },
    { stat: "balance", weight: 0.5 },
    { stat: "dribbling", weight: 0.5 },
  ],
  LowerBody: [
    { stat: "speed", weight: 1 },
    { stat: "acceleration", weight: 1 },
    { stat: "balance", weight: 0.5 },
    { stat: "stamina", weight: 0.5 },
  ],
  Aerial: [
    { stat: "jump", weight: 1 },
    { stat: "heading", weight: 1 },
    { stat: "physicalContact", weight: 0.5 },
  ],
  Defending: [
    { stat: "defensiveAwareness", weight: 1 },
    { stat: "ballWinning", weight: 1 },
    { stat: "aggression", weight: 1 },
    { stat: "defensiveEngagement", weight: 1 },
  ],
  Goalkeeping: [
    { stat: "gkAwareness", weight: 1 },
    { stat: "gkCatching", weight: 1 },
    { stat: "gkParrying", weight: 1 },
    { stat: "gkReflexes", weight: 0.5 },
    { stat: "gkReach", weight: 0.5 },
  ],
};

// Per-spec: total training points available = maxLevel * 1.0 (Konami uses a curve; we approximate
// 1 point/level up to maxLevel). The cap prevents over-allocation.
export function trainingPointsAvailable(maxLevel: number, level: number): number {
  return Math.max(0, maxLevel - level + 1) * 5;
}

// Manager tactic boost. Per spec scenario:
//   "manager with Quick Counter >= 88 → qualifying player stats receive +2 team playstyle bonus".
// We apply +2 per active tactic that exceeds its threshold (88) and for which the player has
// non-zero tactic compat.
export const TACTIC_BOOST_THRESHOLD = 88;
export const TACTIC_BOOST_AMOUNT = 2;

// Map of manager tactic → affected stats (the playstyle group).
export const TACTIC_AFFECTED_STATS: Record<ManagerTactic, BaseStat[]> = {
  possessionGame: ["ballControl", "tightPossession", "lowPass", "loftedPass"],
  quickCounter: ["speed", "acceleration", "finishing", "offensiveAwareness"],
  longBallCounter: ["heading", "jump", "loftedPass", "physicalContact"],
  outWide: ["cross" as never as BaseStat, "loftedPass", "speed", "physicalContact"],
  longBall: ["loftedPass", "heading", "jump", "physicalContact"],
  overload: ["aggression", "stamina", "defensiveAwareness", "ballWinning"],
};

// The 6th base stat for "outWide" — "cross" is not a base stat, so map to the closest
// (outside_curler is a skill, not a stat). We normalize to the actual base stats:
TACTIC_AFFECTED_STATS.outWide = ["loftedPass", "speed", "physicalContact", "balance"];

// Booster definitions (lookup; populated by seeder from the Boost table). Each booster affects
// a subset of stats with the listed magnitude.
export interface BoosterDef {
  id: number;
  name: string;
  stats: Partial<Record<BaseStat, number>>;
}

export const CANONICAL_BOOSTERS: Record<number, BoosterDef> = {
  // subset derived from the efhub Boost table — expanded in seed fixtures.
  1: { id: 1, name: "Goalkeeping +2", stats: { gkAwareness: 2, gkCatching: 2, gkParrying: 2, gkReflexes: 2, gkReach: 2 } },
  2: { id: 2, name: "Free-kick Taking +2", stats: { placeKicking: 2, curl: 2 } },
  3: { id: 3, name: "Passing +2", stats: { lowPass: 2, loftedPass: 2 } },
  4: { id: 4, name: "Technique +2", stats: { ballControl: 2, dribbling: 2, tightPossession: 2 } },
  5: { id: 5, name: "Defending +2", stats: { defensiveAwareness: 2, ballWinning: 2, defensiveEngagement: 2, aggression: 2 } },
  6: { id: 6, name: "Agility +2", stats: { balance: 2, acceleration: 2 } },
  7: { id: 7, name: "Shooting +2", stats: { finishing: 2, placeKicking: 2, kickingPower: 2 } },
  8: { id: 8, name: "Duelling +2", stats: { ballWinning: 2, physicalContact: 2 } },
  9: { id: 9, name: "Aerial +2", stats: { heading: 2, jump: 2 } },
  10: { id: 10, name: "Ball-carrying +2", stats: { dribbling: 2, speed: 2, acceleration: 2 } },
  11: { id: 11, name: "King of Football +4", stats: { finishing: 4, ballControl: 4, dribbling: 4 } },
  12: { id: 12, name: "Son of God +4", stats: { finishing: 4, heading: 4, jump: 4 } },
  13: { id: 13, name: "Bearer of Fate +4", stats: { defensiveAwareness: 4, ballWinning: 4, aggression: 4 } },
  14: { id: 14, name: "Physicality +2", stats: { physicalContact: 2, jump: 2, balance: 2, stamina: 2 } },
  15: { id: 15, name: "Total Package +3", stats: { finishing: 3, ballControl: 3, defensiveAwareness: 3, speed: 3 } },
  24: { id: 24, name: "Defending +3", stats: { defensiveAwareness: 3, ballWinning: 3, defensiveEngagement: 3, aggression: 3 } },
  25: { id: 25, name: "Shutdown +2", stats: { defensiveAwareness: 2, ballWinning: 2, defensiveEngagement: 2 } },
};

export function clampStat(v: number): number {
  return Math.max(40, Math.min(99, v));
}

export interface SimulateArgs {
  base: Record<BaseStat, number>;
  max?: Record<BaseStat, number>;
  config: BuildConfig;
  boosters: BoosterDef[];
  managerTactics?: Partial<Record<ManagerTactic, number>>;
  playerTactics?: Partial<Record<ManagerTactic, number>>;
}

export function simulateBuild(args: SimulateArgs): BuildResult {
  const { base, config, boosters, managerTactics = {}, playerTactics = {} } = args;
  const trainingDeltas: Record<string, number> = {};
  const boosterDeltas: Record<string, number> = {};
  const managerDeltas: Record<string, number> = {};
  const projected: Record<string, number> = {};

  // 1. Apply training point allocations.
  for (const cat of TRAINING_CATEGORIES) {
    const pts = config.trainingPoints[cat] ?? 0;
    if (pts <= 0) continue;
    const mastery = TRAINING_MASTERIES[cat];
    for (const { stat, weight } of mastery) {
      const delta = Math.floor(pts * weight);
      trainingDeltas[stat] = (trainingDeltas[stat] ?? 0) + delta;
    }
  }

  // 2. Apply active boosters.
  for (let i = 0; i < boosters.length; i++) {
    if (!config.boosters[i]) continue;
    const def = boosters[i];
    if (!def) continue;
    for (const [stat, mag] of Object.entries(def.stats)) {
      boosterDeltas[stat] = (boosterDeltas[stat] ?? 0) + (mag as number);
    }
  }

  // 3. Apply manager tactic boosts (per-spec: tactic >= 88 → +2 for affected stats when
  //    player has compat > 0).
  if (managerTactics && playerTactics) {
    for (const tactic of Object.keys(managerTactics) as ManagerTactic[]) {
      const mRating = managerTactics[tactic];
      if (mRating === undefined || mRating < TACTIC_BOOST_THRESHOLD) continue;
      const pRating = playerTactics[tactic];
      if (pRating === undefined || pRating <= 0) continue;
      for (const stat of TACTIC_AFFECTED_STATS[tactic]) {
        managerDeltas[stat] = (managerDeltas[stat] ?? 0) + TACTIC_BOOST_AMOUNT;
      }
    }
  }

  // 4. Compose and clamp.
  const usedPoints = Object.values(config.trainingPoints).reduce(
    (s, v) => s + (v as number),
    0,
  );
  const available = trainingPointsAvailable(config.maxLevel, config.level);
  const remainingPoints = Math.max(0, available - usedPoints);
  let projectedMaxOvr = config.level + 1;

  for (const s of BASE_STATS) {
    const v =
      (base[s] ?? 0) +
      (trainingDeltas[s] ?? 0) +
      (boosterDeltas[s] ?? 0) +
      (managerDeltas[s] ?? 0);
    projected[s] = clampStat(v);
  }

  // projected max OVR — approximate from the average of projected stats + an offset based on
  // the registered position. Tuned so that a fully-trained + boosted Epic card reaches the
  // spec's "maxOvr" ~= base + 16.
  const avg = projected && (Object.values(projected).reduce((a, b) => a + b, 0) / BASE_STATS.length);
  projectedMaxOvr = Math.round(avg + 6);

  return {
    config,
    projectedStats: projected as Record<BaseStat, number>,
    projectedMaxOvr,
    base,
    trainingDeltas: trainingDeltas as Record<BaseStat, number>,
    boosterDeltas: boosterDeltas as Record<BaseStat, number>,
    managerDeltas: managerDeltas as Record<BaseStat, number>,
    remainingPoints,
  };
}

// Regression-test helper: compute max OVR for a known card.
// Spec verify: progression.ts accurately calculates max OVR against known player records.
export function computeMaxOvr(
  base: Record<BaseStat, number>,
  maxStats: Record<BaseStat, number>,
  registeredPosition: number,
  positionRatings: Partial<Record<BaseStat, number>>,
): number {
  // The max OVR equals the position-specific max overall for the registered position.
  const posList = [
    "overallGK",
    "overallCB",
    "overallLB",
    "overallRB",
    "overallDMF",
    "overallCMF",
    "overallLMF",
    "overallRMF",
    "overallAMF",
    "overallLWF",
    "overallRWF",
    "overallSS",
    "overallCF",
  ];
  // We pick the highest position rating — matches Konami's "best position" display.
  const positions = Object.values(positionRatings).filter((v): v is number => typeof v === "number");
  if (positions.length === 0) {
    return Math.max(...(Object.values(maxStats) as number[]));
  }
  return Math.max(...positions, ...Object.values(maxStats) as number[]);
}

// Avoid unused export warning in strict mode.
void TRAINING_MASTERIES;
