// Per-position overall-rating weights — GENERATED DATA, not hand-written code.
//
// Source:  eFHUB public SQLite (`dump/efhub/efhub_db.sqlite`, table
//          "player export", 44,103 cards) joined to the efootbase dump by
//          Konami id. Fitted 2026-10-18 by the read-only scratch script of the
//          `player-progression-simulator` change (ordinary least squares with
//          a 1e-6 ridge, three rounds of ±2.5 outlier trimming, 70/30 split).
// Target:  `overall<POS>` (the hub's level-1 overall at that position) on the
//          cards with full aptitude at POS. Outfield fits exclude the five GK
//          stats (their weights are exactly 0); the GK fit uses all 26 stats.
// Shape:   `w` follows BASE_STATS order (constants.ts); overall ≈ intercept +
//          Σ w[i] · stat[i], rounded to the nearest integer. The result is an
//          ESTIMATE — the game's exact formula is not public.
//
// Held-out fit quality (test cards never seen by the fit):
//   POS  train  test   R²     within ±1  exact
//   GK   3222   1382   0.9924  0.9327    0.4978   (lower confidence)
//   CB   6250   2679   0.9959  0.9858    0.6290
//   LB   3103   1330   0.9983  1.0000    0.8293
//   RB   3341   1433   0.9987  1.0000    0.8521
//   DMF  4711   2020   0.9974  0.9995    0.8114
//   CMF  7576   3247   0.9988  1.0000    0.8737
//   LMF  4895   2099   0.9982  0.9995    0.9319
//   RMF  4811   2063   0.9982  0.9995    0.9443
//   AMF  5395   2313   0.9982  0.9996    0.8642
//   LWF  5269   2259   0.9982  0.9996    0.8415
//   RWF  4912   2106   0.9988  1.0000    0.8319
//   SS   2809   1204   0.9973  0.9992    0.7301
//   CF   6144   2634   0.9971  0.9985    0.6784
//
// Cross-check against the second source: for the 10,073 cards whose efootbase
// `max_level` > 1, the formula on (hub max stats + Booster 1) is within ±1 of
// efootbase's `overall_at_max_level` for 94.7% (exact 59%, −1 32%).
//
// Proficiency penalty (OVR_PROFICIENCY_ADJUST, fitted 2026-10-18): the weights
// above describe the overall at FULL proficiency. The hub also lists the
// overall of every card at its half-proficiency and non-proficient positions,
// and that overall is an affine function of the full-proficiency estimate,
// floored at 40:  overall ≈ max(40, k · estimate + c). Fitted per level and
// position by least squares on cards whose line sits above the floor (70/30
// split by card, same seed for every position); GK at "none" is the constant
// 40 on every hub card, and no hub card has half proficiency at GK, so that
// cell falls back to the global half fit (k 0.9331, c −1.573).
//
// Held-out within ±1 (never seen by the fit):
//   half  21,387 obs  99.90 %  (CB 98.5 %, CF 98.9 %, the other 10: 100 %)
//   none 111,819 obs  99.72 %  outfield positions (CB 97.3 %, CF 99.7 %,
//                              DMF 99.9 %, the rest ≥ 99.98 %);
//         11,883 obs 100 %     at GK (constant 40)
// Without the penalty the full-proficiency estimate is within ±1 of the hub
// on 0 % (half) and 5.6 % (none) of those observations.
//
// Regeneration: the weights depend on the game version the hub reflects. Re-run
// the fit against a fresh hub dump (outside the repo) and replace both tables
// together with the oracle fixture `__fixtures__/progression-oracle.json`; the
// tests in progression.test.ts re-check every number above.
import { POSITIONS, type Position, type PositionProficiency } from "./constants";

export interface PositionOvrWeights {
  /** Intercept of the linear fit. */
  intercept: number;
  /** One weight per BaseStat, in BASE_STATS order. */
  w: readonly number[];
}

export const OVR_WEIGHTS: Readonly<Record<Position, PositionOvrWeights>> = {
  GK: { intercept: -28.9642, w: [0.001851, 0.064077, -0.003699, -0.011793, 0.054872, 0.034714, 0.000857, 0.035623, 0.003999, -0.012978, 0.02666, -0.009201, 0.043282, 0.068401, 0.159595, -0.021145, -0.011878, -0.002477, -0.006077, 0.019751, 0.005243, 0.260063, 0.215143, 0.162756, 0.159892, 0.278737] },
  CB: { intercept: -31.8463, w: [0.009405, 0.055417, 0.017115, 0.012518, 0.04105, 0.058952, 0.028103, 0.08387, 0.005717, 0.007997, 0.15508, 0.127745, 0.020273, 0.0846, 0.262877, -0.052219, 0.071081, 0.279316, 0.184645, 0.003388, 0.077523, 0, 0, 0, 0, 0] },
  LB: { intercept: -38.5945, w: [0.048909, 0.09909, 0.065144, 0.037188, 0.063517, 0.146744, 0.03386, 0.02563, 0.019316, 0.026686, 0.224831, 0.180389, 0.016518, 0.038116, 0.119204, -0.001264, 0.19998, 0.141217, 0.088018, 0.02204, 0.033925, 0, 0, 0, 0, 0] },
  RB: { intercept: -38.534, w: [0.059507, 0.094222, 0.064647, 0.038124, 0.062527, 0.146317, 0.023869, 0.034153, 0.023827, 0.024528, 0.226458, 0.174242, 0.020798, 0.033394, 0.118876, 0.008242, 0.192722, 0.148796, 0.07628, 0.020339, 0.038658, 0, 0, 0, 0, 0] },
  DMF: { intercept: -37.6795, w: [0.056859, 0.126841, 0.05204, 0.026175, 0.121549, 0.125954, 0.035933, 0.070933, 0.00764, 0.015253, 0.06637, 0.048391, 0.047864, 0.031405, 0.148251, -0.014549, 0.197979, 0.213043, 0.114347, 0.021403, 0.101173, 0, 0, 0, 0, 0] },
  CMF: { intercept: -39.5798, w: [0.095916, 0.17874, 0.103615, 0.052471, 0.205532, 0.159787, 0.072449, 0.027828, 0.007325, 0.015758, 0.061618, 0.080338, 0.072739, 0.010643, 0.06298, 0.006395, 0.202815, 0.081651, 0.083524, 0.023204, 0.037675, 0, 0, 0, 0, 0] },
  LMF: { intercept: -40.9446, w: [0.095506, 0.177425, 0.121915, 0.058364, 0.136099, 0.194921, 0.089736, 0.013451, 0.021703, 0.026639, 0.198431, 0.1594, 0.021564, 0.011904, 0.025234, 0.054101, 0.149458, 0.043456, 0.028555, 0.020852, 0.013314, 0, 0, 0, 0, 0] },
  RMF: { intercept: -40.8662, w: [0.098595, 0.172936, 0.112549, 0.070611, 0.13496, 0.195907, 0.085878, 0.014739, 0.021568, 0.027244, 0.198167, 0.158019, 0.023268, 0.01197, 0.026977, 0.053538, 0.147628, 0.046457, 0.024115, 0.023786, 0.012466, 0, 0, 0, 0, 0] },
  AMF: { intercept: -39.4452, w: [0.173852, 0.198938, 0.130043, 0.074768, 0.197126, 0.153751, 0.181289, 0.027486, 0.008752, 0.01872, 0.103192, 0.073894, 0.071174, 0.011932, 0.037541, 0.006873, 0.087801, 0.023759, 0.023042, 0.024978, 0.012978, 0, 0, 0, 0, 0] },
  LWF: { intercept: -38.629, w: [0.158668, 0.160965, 0.167939, 0.083315, 0.079636, 0.093873, 0.157062, 0.028452, 0.007477, 0.021017, 0.225714, 0.153432, 0.060465, 0.021804, 0.054029, 0.049482, 0.050324, 0.002073, 0.016929, 0.023206, 0.012651, 0, 0, 0, 0, 0] },
  RWF: { intercept: -38.7168, w: [0.157366, 0.160925, 0.167442, 0.084137, 0.077028, 0.097338, 0.15654, 0.027585, 0.009105, 0.020493, 0.22629, 0.152099, 0.058939, 0.024503, 0.054899, 0.049937, 0.051834, 0.004604, 0.014294, 0.024689, 0.009869, 0, 0, 0, 0, 0] },
  SS: { intercept: -37.6608, w: [0.172258, 0.211333, 0.138576, 0.086245, 0.102971, 0.072862, 0.280564, 0.028487, 0.007446, 0.01818, 0.096164, 0.076704, 0.096116, 0.035859, 0.058138, 0.047001, 0.057852, -0.005733, 0.013658, 0.00923, 0.01357, 0, 0, 0, 0, 0] },
  CF: { intercept: -34.8094, w: [0.202767, 0.131233, 0.074166, 0.031814, 0.04836, -0.002454, 0.354424, 0.072246, 0.009494, 0.020533, 0.117747, 0.098703, 0.118903, 0.053771, 0.125814, 0.047557, 0.041425, -0.007832, 0.018502, 0.012033, 0.007845, 0, 0, 0, 0, 0] },
};

/** Positions whose held-out fit is below 99% within ±1 (shown with a
 *  lower-confidence note in the UI). */
export const OVR_LOWER_CONFIDENCE_POSITIONS: readonly Position[] = ["GK", "CB"];

export interface ProficiencyAdjust {
  /** overall ≈ max(OVR_PROFICIENCY_FLOOR, k · fullEstimate + c). */
  k: number;
  c: number;
}

/** The hub never lists an overall below 40 at a penalised position. */
export const OVR_PROFICIENCY_FLOOR = 40;

/** Fitted penalty of the overall at half / non-proficient positions — GENERATED
 *  DATA (see the header). Held-out "within ±1 · exact" per cell in the comments. */
export const OVR_PROFICIENCY_ADJUST: Readonly<Record<Exclude<PositionProficiency, "full">, Readonly<Record<Position, ProficiencyAdjust>>>> = {
  half: {
    GK: { k: 0.9331, c: -1.573 }, // no hub card has half proficiency at GK → global half fit
    CB: { k: 0.9488, c: -2.057 }, // n=615  98.54 % · 58.7 %
    LB: { k: 0.9319, c: -1.153 }, // n=947  100 %   · 82.9 %
    RB: { k: 0.9396, c: -1.753 }, // n=763  100 %   · 79.0 %
    DMF: { k: 0.9454, c: -1.83 }, // n=1757 100 %   · 76.7 %
    CMF: { k: 0.9304, c: -1.316 }, // n=1431 100 %  · 81.8 %
    LMF: { k: 0.9339, c: -1.872 }, // n=2634 100 %  · 88.2 %
    RMF: { k: 0.9363, c: -1.973 }, // n=2616 100 %  · 89.0 %
    AMF: { k: 0.9343, c: -1.96 }, // n=2662 100 %   · 85.7 %
    LWF: { k: 0.931, c: -1.481 }, // n=1557 100 %   · 81.9 %
    RWF: { k: 0.9331, c: -1.606 }, // n=1737 100 %  · 81.0 %
    SS: { k: 0.9338, c: -1.659 }, // n=3626 100 %   · 76.5 %
    CF: { k: 0.9463, c: -2.466 }, // n=1042 98.85 % · 64.8 %
  },
  none: {
    GK: { k: 0, c: 40 }, // n=11883 100 % · 100 % — every outfield card is 40 at GK
    CB: { k: 0.8383, c: -5.879 }, // n=9908  97.27 % · 62.3 %
    LB: { k: 0.8249, c: -5.858 }, // n=10937 100 %   · 80.7 %
    RB: { k: 0.8261, c: -6.007 }, // n=10999 99.99 % · 79.8 %
    DMF: { k: 0.8347, c: -5.757 }, // n=9434 99.89 % · 78.0 %
    CMF: { k: 0.8181, c: -5.559 }, // n=8605 100 %   · 85.7 %
    LMF: { k: 0.821, c: -6.367 }, // n=8503  100 %   · 89.1 %
    RMF: { k: 0.823, c: -6.358 }, // n=8505  100 %   · 89.9 %
    AMF: { k: 0.819, c: -5.98 }, // n=8281   100 %   · 87.9 %
    LWF: { k: 0.8224, c: -5.764 }, // n=9404 100 %   · 83.4 %
    RWF: { k: 0.8222, c: -5.757 }, // n=9345 100 %   · 83.4 %
    SS: { k: 0.8231, c: -5.861 }, // n=8391  99.98 % · 82.8 %
    CF: { k: 0.8236, c: -5.861 }, // n=9507  99.66 % · 74.0 %
  },
};

/** Penalised cells whose held-out fit is below 99% within ±1. */
export const OVR_PROFICIENCY_LOWER_CONFIDENCE: Readonly<Record<Exclude<PositionProficiency, "full">, readonly Position[]>> = {
  half: ["GK", "CB", "CF"],
  none: ["CB"],
};

// Sanity guard: every position has exactly 26 weights (fails at import time
// if the table is regenerated with a different stat order/length).
for (const pos of POSITIONS) {
  if (OVR_WEIGHTS[pos].w.length !== 26) {
    throw new Error(`OVR_WEIGHTS.${pos} must have 26 weights, got ${OVR_WEIGHTS[pos].w.length}`);
  }
}
