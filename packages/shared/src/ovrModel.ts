// Exact overall model — DATA ONLY: integer weights, integer band tables and
// stat names. The arithmetic that uses them lives in progression.ts.
//
// Provenance (change `efootbase-exact-model-managers`, 2026-10-19):
//   · The weight table, the three position scale factors, the offsets and the
//     proficiency band table were recovered from efootbase's public web client
//     (the JavaScript its player pages load) during a browser survey kept
//     outside this repository. No efootbase code, JSON, text or image is
//     committed: only the integers below, re-keyed by position and by
//     eFootLab stat name so that no index table of the source is needed.
//   · The owner accepted the terms risk of using constants recovered from
//     another site's public client code. See docs/efootbase-exact-model.md.
//   · Verified against efootbase's own displayed figures on five cards (stats,
//     overalls, all 13 position tiles, manager effects) — the numbers are in
//     docs/efootbase-exact-model.md and the numbers-only oracle fixture
//     `__fixtures__/exact-model-oracle.json` pins them in the tests.
//
// Regeneration: when efootbase changes its constants, re-derive this file
// (same shapes, same names), regenerate the oracle fixture from a new survey
// and run `pnpm --filter @eflab/shared test` — the oracle and tamper tests fail
// loudly on any drift. The procedure is in docs/efootbase-exact-model.md.
import type { BaseStat, Position, PositionProficiency } from "./constants";

/** The 28 terms of the overall, in the order the weighted sum is accumulated
 *  (height, 25 stats, weak-foot accuracy, defensive engagement). The order
 *  matters: the weak-foot term is not an integer, so the floating-point sum is
 *  reproduced bit for bit only when it is accumulated in this order. */
export const OVR_TERMS = [
  "height",
  "offensiveAwareness",
  "ballControl",
  "dribbling",
  "tightPossession",
  "lowPass",
  "loftedPass",
  "finishing",
  "placeKicking",
  "curl",
  "heading",
  "defensiveAwareness",
  "ballWinning",
  "aggression",
  "kickingPower",
  "speed",
  "acceleration",
  "physicalContact",
  "balance",
  "jump",
  "gkAwareness",
  "gkReach",
  "gkCatching",
  "gkParrying",
  "gkReflexes",
  "stamina",
  "weakFootAccuracy",
  "defensiveEngagement",
] as const satisfies ReadonlyArray<BaseStat | "height" | "weakFootAccuracy">;
export type OvrTerm = (typeof OVR_TERMS)[number];

/** Integer weight of every term at every position (13 × 28). The overall is
 *  floor((Σ weight × term + SUM_BIAS) / SUM_DIVISOR); see `exactOvr`. */
export const OVR_WEIGHTS: Readonly<Record<Position, Readonly<Record<OvrTerm, number>>>> = {
  GK: { height: 186, offensiveAwareness: 0, ballControl: 13, dribbling: 0, tightPossession: 0, lowPass: 27, loftedPass: 40, finishing: 0, placeKicking: 0, curl: 0, heading: 0, defensiveAwareness: 13, ballWinning: 0, aggression: 0, kickingPower: 53, speed: 13, acceleration: 40, physicalContact: 80, balance: 0, jump: 133, gkAwareness: 279, gkReach: 226, gkCatching: 226, gkParrying: 173, gkReflexes: 173, stamina: 0, weakFootAccuracy: 4, defensiveEngagement: 0 },
  CB: { height: 136, offensiveAwareness: 14, ballControl: 27, dribbling: 14, tightPossession: 0, lowPass: 41, loftedPass: 68, finishing: 27, placeKicking: 14, curl: 14, heading: 55, defensiveAwareness: 286, ballWinning: 191, aggression: 82, kickingPower: 27, speed: 136, acceleration: 150, physicalContact: 204, balance: 0, jump: 109, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 68, weakFootAccuracy: 4, defensiveEngagement: 14 },
  LB: { height: 49, offensiveAwareness: 61, ballControl: 86, dribbling: 61, tightPossession: 37, lowPass: 61, loftedPass: 147, finishing: 24, placeKicking: 24, curl: 24, heading: 24, defensiveAwareness: 147, ballWinning: 86, aggression: 37, kickingPower: 24, speed: 220, acceleration: 184, physicalContact: 98, balance: 24, jump: 37, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 196, weakFootAccuracy: 4, defensiveEngagement: 24 },
  RB: { height: 49, offensiveAwareness: 61, ballControl: 86, dribbling: 61, tightPossession: 37, lowPass: 61, loftedPass: 147, finishing: 24, placeKicking: 24, curl: 24, heading: 24, defensiveAwareness: 147, ballWinning: 86, aggression: 37, kickingPower: 24, speed: 220, acceleration: 184, physicalContact: 98, balance: 24, jump: 37, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 196, weakFootAccuracy: 4, defensiveEngagement: 24 },
  DMF: { height: 61, offensiveAwareness: 61, ballControl: 122, dribbling: 37, tightPossession: 24, lowPass: 122, loftedPass: 122, finishing: 37, placeKicking: 12, curl: 12, heading: 61, defensiveAwareness: 220, ballWinning: 122, aggression: 98, kickingPower: 49, speed: 61, acceleration: 61, physicalContact: 122, balance: 12, jump: 37, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 196, weakFootAccuracy: 4, defensiveEngagement: 24 },
  CMF: { height: 37, offensiveAwareness: 98, ballControl: 171, dribbling: 98, tightPossession: 49, lowPass: 208, loftedPass: 159, finishing: 73, placeKicking: 12, curl: 12, heading: 24, defensiveAwareness: 86, ballWinning: 86, aggression: 37, kickingPower: 73, speed: 61, acceleration: 86, physicalContact: 49, balance: 24, jump: 12, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 196, weakFootAccuracy: 4, defensiveEngagement: 24 },
  LMF: { height: 12, offensiveAwareness: 98, ballControl: 171, dribbling: 122, tightPossession: 61, lowPass: 135, loftedPass: 196, finishing: 86, placeKicking: 24, curl: 24, heading: 12, defensiveAwareness: 49, ballWinning: 24, aggression: 12, kickingPower: 24, speed: 196, acceleration: 159, physicalContact: 24, balance: 61, jump: 12, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 147, weakFootAccuracy: 4, defensiveEngagement: 24 },
  RMF: { height: 12, offensiveAwareness: 98, ballControl: 171, dribbling: 110, tightPossession: 73, lowPass: 135, loftedPass: 196, finishing: 86, placeKicking: 24, curl: 24, heading: 12, defensiveAwareness: 49, ballWinning: 24, aggression: 12, kickingPower: 24, speed: 196, acceleration: 159, physicalContact: 24, balance: 61, jump: 12, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 147, weakFootAccuracy: 4, defensiveEngagement: 24 },
  AMF: { height: 37, offensiveAwareness: 171, ballControl: 196, dribbling: 122, tightPossession: 73, lowPass: 196, loftedPass: 159, finishing: 184, placeKicking: 12, curl: 12, heading: 24, defensiveAwareness: 24, ballWinning: 24, aggression: 12, kickingPower: 73, speed: 98, acceleration: 86, physicalContact: 24, balance: 24, jump: 12, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 86, weakFootAccuracy: 4, defensiveEngagement: 24 },
  LWF: { height: 49, offensiveAwareness: 159, ballControl: 159, dribbling: 159, tightPossession: 86, lowPass: 73, loftedPass: 98, finishing: 159, placeKicking: 12, curl: 12, heading: 24, defensiveAwareness: 12, ballWinning: 12, aggression: 12, kickingPower: 61, speed: 220, acceleration: 159, physicalContact: 37, balance: 73, jump: 24, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 49, weakFootAccuracy: 4, defensiveEngagement: 24 },
  RWF: { height: 49, offensiveAwareness: 159, ballControl: 159, dribbling: 159, tightPossession: 86, lowPass: 73, loftedPass: 98, finishing: 159, placeKicking: 12, curl: 12, heading: 24, defensiveAwareness: 12, ballWinning: 12, aggression: 12, kickingPower: 61, speed: 220, acceleration: 159, physicalContact: 37, balance: 73, jump: 24, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 49, weakFootAccuracy: 4, defensiveEngagement: 24 },
  SS: { height: 62, offensiveAwareness: 173, ballControl: 210, dribbling: 123, tightPossession: 86, lowPass: 99, loftedPass: 74, finishing: 284, placeKicking: 12, curl: 12, heading: 25, defensiveAwareness: 0, ballWinning: 12, aggression: 12, kickingPower: 99, speed: 86, acceleration: 99, physicalContact: 37, balance: 74, jump: 37, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 49, weakFootAccuracy: 4, defensiveEngagement: 12 },
  CF: { height: 99, offensiveAwareness: 210, ballControl: 123, dribbling: 62, tightPossession: 37, lowPass: 37, loftedPass: 12, finishing: 358, placeKicking: 12, curl: 12, heading: 62, defensiveAwareness: 0, ballWinning: 12, aggression: 12, kickingPower: 123, speed: 99, acceleration: 123, physicalContact: 86, balance: 86, jump: 62, gkAwareness: 0, gkReach: 0, gkCatching: 0, gkParrying: 0, gkReflexes: 0, stamina: 37, weakFootAccuracy: 4, defensiveEngagement: 12 },
};

/** Every arithmetic constant of the overall in one object, so the tests can
 *  hand a tampered copy to the engine (progression.ts takes it as an
 *  optional argument). */
export interface OvrModel {
  weights: Readonly<Record<Position, Readonly<Record<OvrTerm, number>>>>;
  /** Stat scale factor by the card's proficiency at the position. */
  scale: Readonly<Record<PositionProficiency, number>>;
  /** Added before flooring a scaled stat (0.5 = round half up). */
  scaleRoundBias: number;
  /** A scaled stat is limited to 0..scaleMax. */
  scaleMax: number;
  /** Every stat and the weak-foot term enter as max(0, value − termOffset). */
  termOffset: number;
  /** Height enters as max(0, height − heightOffset − termOffset). */
  heightOffset: number;
  /** Weak-foot term = wfSlope × accuracy / wfDivisor + wfBase (0–3 → 40–99). */
  wfSlope: number;
  wfDivisor: number;
  wfBase: number;
  /** overall = floor((sum + sumBias) / sumDivisor), limited to min..max. */
  sumBias: number;
  sumDivisor: number;
  min: number;
  max: number;
}

export const OVR_MODEL: OvrModel = {
  weights: OVR_WEIGHTS,
  scale: { full: 1, half: 0.97, none: 0.85 },
  scaleRoundBias: 0.5,
  scaleMax: 255,
  termOffset: 25,
  heightOffset: 111,
  wfSlope: 59,
  wfDivisor: 3,
  wfBase: 40,
  sumBias: 499,
  sumDivisor: 1000,
  min: 40,
  max: 127,
};

/** One bonus band of the Manager Proficiency table: a trained stat s with
 *  min ≤ s ≤ max gains `bonus`. */
export interface ProficiencyBand {
  min: number;
  max: number;
  bonus: number;
}

/** Manager Proficiency bonus bands per level. Levels 70–76 have no band (no
 *  bonus at all); a stat below the first band, or at 99 and above, gains 0. */
export const PROFICIENCY_BANDS: Readonly<Record<number, readonly ProficiencyBand[]>> = {
  70: [], 71: [], 72: [], 73: [], 74: [], 75: [], 76: [],
  77: [{ min: 48, max: 94, bonus: 1 }, { min: 95, max: 98, bonus: 2 }],
  78: [{ min: 44, max: 87, bonus: 1 }, { min: 88, max: 98, bonus: 2 }],
  79: [{ min: 40, max: 76, bonus: 1 }, { min: 77, max: 98, bonus: 2 }],
  80: [{ min: 40, max: 76, bonus: 1 }, { min: 77, max: 98, bonus: 2 }],
  81: [{ min: 40, max: 69, bonus: 1 }, { min: 70, max: 98, bonus: 2 }],
  82: [{ min: 40, max: 69, bonus: 1 }, { min: 70, max: 98, bonus: 2 }],
  83: [{ min: 40, max: 66, bonus: 1 }, { min: 67, max: 98, bonus: 2 }],
  84: [{ min: 40, max: 61, bonus: 1 }, { min: 62, max: 92, bonus: 2 }, { min: 93, max: 98, bonus: 3 }],
  85: [{ min: 40, max: 61, bonus: 1 }, { min: 62, max: 92, bonus: 2 }, { min: 93, max: 98, bonus: 3 }],
  86: [{ min: 40, max: 57, bonus: 1 }, { min: 58, max: 89, bonus: 2 }, { min: 90, max: 98, bonus: 3 }],
  87: [{ min: 40, max: 58, bonus: 1 }, { min: 59, max: 87, bonus: 2 }, { min: 88, max: 98, bonus: 3 }],
  88: [{ min: 40, max: 56, bonus: 1 }, { min: 57, max: 84, bonus: 2 }, { min: 85, max: 98, bonus: 3 }],
  89: [{ min: 40, max: 55, bonus: 1 }, { min: 56, max: 83, bonus: 2 }, { min: 84, max: 98, bonus: 3 }],
  90: [{ min: 40, max: 55, bonus: 1 }, { min: 56, max: 82, bonus: 2 }, { min: 83, max: 98, bonus: 3 }],
};

/** Limit of a stat before the boosters: base + training + proficiency bonus is
 *  cut to this value (efootbase's client: min(99, …)), so the bonus never
 *  lifts a stat past it, a stat already there gains nothing, and a stat
 *  trained above it reads 99. Only the boosters and a manager's +1 go higher. */
export const PROFICIENCY_STAT_CAP = 99;

/** What a selected manager adds to each of its pill stats, after the boosters. */
export const MANAGER_PILL_BONUS = 1;
