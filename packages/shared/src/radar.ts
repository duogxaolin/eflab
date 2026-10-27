// Compare radar axes (change efootbase-s4-measure, spec "Compare Radar From The
// Build"). Six integer axes of a build's shown stats, drawn on a 0–115 scale
// with rings at 30 / 60 / 90 / 115 — the reference's chart, measured on 7
// builds of 5 cards (surveys of 2026-10-23 and 2026-10-27, outside the
// repository; numbers-only oracle `__fixtures__/radar-oracle.json`).
//
// SHT, PAS, STR, SPD and DRI are the only formulas, within the searched
// family of weighted means of up to three stats, that reproduce every reading.
// DEF is NOT determined: three formulas agree on all 7 builds —
// ⌊(3·DA + 2·DE) / 5⌋, ⌊(DA + TAC + DE) / 3⌋ and ⌊(3·DA + TAC + 2·DE) / 6⌋ —
// and eFootLab uses the equal-weight one, by its own choice (documented in
// openspec/ui-dna.md and CLAUDE.md). A later reading that separates them
// changes DEF here and the oracle test shows it.
import type { BaseStat } from "./constants";

/** The six axes, in the chart's clockwise order from the top. */
export const RADAR_AXES = ["SHT", "PAS", "STR", "DEF", "SPD", "DRI"] as const;
export type RadarAxis = (typeof RADAR_AXES)[number];

/** The stats each axis averages (equal weights, floored). */
export const RADAR_AXIS_STATS: Readonly<Record<RadarAxis, readonly BaseStat[]>> = {
  SHT: ["finishing", "kickingPower"],
  PAS: ["lowPass", "loftedPass"],
  STR: ["physicalContact", "balance"],
  // Our choice among three formulas the readings cannot tell apart (see above).
  DEF: ["defensiveAwareness", "ballWinning", "defensiveEngagement"],
  SPD: ["speed", "acceleration"],
  DRI: ["ballControl", "dribbling", "tightPossession"],
};

/** Top of the scale: a value at or above it sits on the outer ring. */
export const RADAR_SCALE_MAX = 115;
/** Ring values (the outer ring is RADAR_SCALE_MAX). */
export const RADAR_RINGS = [30, 60, 90, 115] as const;

/** The six axis values of a stat vector: ⌊sum / n⌋ of each axis's stats.
 *  Integer stats only, so the floor of the division is exact. */
export function compareRadarAxes(stats: Readonly<Record<BaseStat, number>>): Record<RadarAxis, number> {
  const out = {} as Record<RadarAxis, number>;
  for (const axis of RADAR_AXES) {
    const keys = RADAR_AXIS_STATS[axis];
    let sum = 0;
    for (const k of keys) sum += Math.trunc(stats[k] ?? 0);
    out[axis] = Math.floor(sum / keys.length);
  }
  return out;
}

/** Share of the outer radius an axis value is drawn at: min(value, 115) / 115,
 *  never below 0 and with no minimum (a low value is drawn low). */
export function radarFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, RADAR_SCALE_MAX)) / RADAR_SCALE_MAX;
}
