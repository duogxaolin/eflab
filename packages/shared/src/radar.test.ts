// Oracle tests for the compare radar axes (change efootbase-s4-measure, spec
// "Compare Radar From The Build").
// Run: tsx packages/shared/src/radar.test.ts  (pnpm --filter @eflab/shared test)
//
// Fixture `__fixtures__/radar-oracle.json`, numbers only: 7 builds of 5
// anonymous cards (r1 ×3, r2 … r5 — Epic and Highlight; RWF, CB and GK), read
// on the reference's compare page on 2026-10-23 (5 builds) and 2026-10-27 (2
// builds), outside the repository: for each build the 26 stats its compare
// rows showed (BASE_STATS order; boosters on, no proficiency bonus without a
// manager, a manager's +1 on one build) and the six axis values its polygon
// was drawn at (SHT, PAS, STR, DEF, SPD, DRI — integers on the 0–115 scale).
import { readFileSync } from "node:fs";
import { BASE_STATS, type BaseStat } from "./constants";
import { RADAR_AXES, RADAR_AXIS_STATS, RADAR_RINGS, RADAR_SCALE_MAX, compareRadarAxes, radarFraction, type RadarAxis } from "./radar";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

interface RadarBuild {
  card: string;
  stats: number[];
  axes: number[];
}
const raw = readFileSync(new URL("./__fixtures__/radar-oracle.json", import.meta.url), "utf8");
const oracle = JSON.parse(raw) as { builds: RadarBuild[] };
const builds = oracle.builds;
const toStats = (arr: number[]): Record<BaseStat, number> => Object.fromEntries(BASE_STATS.map((s, i) => [s, arr[i] ?? 0])) as Record<BaseStat, number>;
const axesOf = (b: RadarBuild): Record<RadarAxis, number> => Object.fromEntries(RADAR_AXES.map((a, i) => [a, b.axes[i]!])) as Record<RadarAxis, number>;

// ---------------------------------------------------------------- 1. fixture shape (numbers only)
{
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(oracle);
  assert(strings.every((s) => /^r[1-9]$/.test(s)), `radar fixture holds no text besides anonymous card ids (${strings.filter((s) => !/^r[1-9]$/.test(s)).slice(0, 3).join("; ") || "ok"})`);
  assert(builds.length === 7 && new Set(builds.map((b) => b.card)).size === 5, `7 measured builds of 5 cards (${builds.length} builds, ${new Set(builds.map((b) => b.card)).size} cards)`);
  assert(builds.every((b) => b.stats.length === 26 && b.axes.length === 6 && [...b.stats, ...b.axes].every(Number.isInteger)), "each build: 26 integer stats and 6 integer axis values");
}

// ---------------------------------------------------------------- 2. every measured build
{
  const per: Record<RadarAxis, number> = { SHT: 0, PAS: 0, STR: 0, DEF: 0, SPD: 0, DRI: 0 };
  const miss: string[] = [];
  for (const b of builds) {
    const got = compareRadarAxes(toStats(b.stats));
    const want = axesOf(b);
    for (const a of RADAR_AXES) {
      if (got[a] === want[a]) per[a]++;
      else miss.push(`${b.card} ${a} ${got[a]} vs ${want[a]}`);
    }
  }
  for (const a of ["SHT", "PAS", "STR", "SPD", "DRI"] as const) assert(per[a] === builds.length, `${a} = ⌊mean(${RADAR_AXIS_STATS[a].join(", ")})⌋ on every measured build (${per[a]}/${builds.length})`);
  assert(per.DEF === builds.length, `DEF = the equal-weight ⌊(DA + TAC + DE) / 3⌋ on every measured build (${per.DEF}/${builds.length})${miss.length ? ` — ${miss.join("; ")}` : ""}`);
  // DEF is our choice: the two other surviving formulas agree with every reading too.
  const s = (b: RadarBuild) => toStats(b.stats);
  const alt1 = builds.every((b) => Math.floor((3 * s(b).defensiveAwareness + 2 * s(b).defensiveEngagement) / 5) === b.axes[3]);
  const alt2 = builds.every((b) => Math.floor((3 * s(b).defensiveAwareness + s(b).ballWinning + 2 * s(b).defensiveEngagement) / 6) === b.axes[3]);
  assert(alt1 && alt2, "DEF is not determined: ⌊(3·DA + 2·DE) / 5⌋ and ⌊(3·DA + TAC + 2·DE) / 6⌋ reproduce every reading as well (eFootLab's equal-weight choice is documented)");
  // The measured builds cannot tell the three apart, so they cannot pin our
  // choice either: a synthetic build where they split does. eFootLab uses the
  // equal-weight ⌊(DA + TAC + DE) / 3⌋ — OUR choice among three formulas the
  // readings leave indistinguishable, not a measured rule. DA 99, TAC 40,
  // DE 40: equal weight 59; ⌊(3·DA + 2·DE) / 5⌋ = 75; ⌊(3·DA + TAC + 2·DE) / 6⌋ = 69.
  const split = toStats(new Array(26).fill(60));
  Object.assign(split, { defensiveAwareness: 99, ballWinning: 40, defensiveEngagement: 40 });
  const def = compareRadarAxes(split).DEF;
  const w5 = Math.floor((3 * 99 + 2 * 40) / 5);
  const w6 = Math.floor((3 * 99 + 40 + 2 * 40) / 6);
  assert(def === 59 && w5 === 75 && w6 === 69, `DEF is the equal-weight formula where the three split: DA 99, TAC 40, DE 40 → ${def} (59; the other two would give ${w5} and ${w6})`);
}

// ---------------------------------------------------------------- 3. spec scenarios and synthetic cases
{
  // "Measured build, left side" (the reference's readings of that build).
  const st = toStats(new Array(26).fill(40));
  Object.assign(st, {
    finishing: 65, kickingPower: 82, lowPass: 82, loftedPass: 80, physicalContact: 90, balance: 72, defensiveAwareness: 99, ballWinning: 96,
    defensiveEngagement: 91, speed: 81, acceleration: 75, ballControl: 72, dribbling: 71, tightPossession: 79,
  });
  const ax = compareRadarAxes(st);
  assert(ax.SHT === 73 && ax.PAS === 81 && ax.STR === 81 && ax.DEF === 95 && ax.SPD === 78 && ax.DRI === 74, `spec scenario: SHT 73, PAS 81, STR 81, DEF 95, SPD 78, DRI 74 (${RADAR_AXES.map((a) => `${a} ${ax[a]}`).join(", ")})`);
  const all40 = compareRadarAxes(toStats(new Array(26).fill(40)));
  assert(RADAR_AXES.every((a) => all40[a] === 40), "all stats 40 → every axis 40");
  // Floor, never round: 65 + 82 = 147 → 73 (not 74); 98 + 100 + 97 = 295 → 98.
  assert(compareRadarAxes({ ...st, finishing: 65, kickingPower: 82 }).SHT === 73 && compareRadarAxes({ ...st, ballControl: 98, dribbling: 100, tightPossession: 97 }).DRI === 98, "axes are floored (147 / 2 → 73, 295 / 3 → 98)");
  // The goalkeeper stats (and every stat outside the axes) are ignored.
  const gk = { ...st, gkAwareness: 99, gkCatching: 99, gkParrying: 99, gkReflexes: 99, gkReach: 99, offensiveAwareness: 99, heading: 99, stamina: 99, jump: 99, aggression: 99, placeKicking: 99, curl: 99 };
  const axGk = compareRadarAxes(gk);
  assert(RADAR_AXES.every((a) => axGk[a] === ax[a]), "GK stats and the stats outside the axes do not move the radar");
  const used = new Set(Object.values(RADAR_AXIS_STATS).flat());
  assert(used.size === 14 && !used.has("gkAwareness") && !used.has("heading"), `the six axes read 14 distinct stats (${used.size})`);
  // A build above 115 (boosters and a manager) is drawn on the outer ring.
  const hi = compareRadarAxes({ ...st, finishing: 120, kickingPower: 118 });
  assert(hi.SHT === 119 && radarFraction(hi.SHT) === 1 && radarFraction(RADAR_SCALE_MAX) === 1, "a value of 115 or more sits on the outer ring (119 → 1)");
  assert(RADAR_RINGS.length === 4 && RADAR_RINGS[0] === 30 && RADAR_RINGS[3] === RADAR_SCALE_MAX && radarFraction(30) === 30 / 115, "rings at 30 / 60 / 90 / 115; 30 sits on the first ring (30 / 115 of the radius)");
  assert(radarFraction(0) === 0 && radarFraction(-5) === 0 && radarFraction(Number.NaN) === 0 && radarFraction(20) === 20 / 115, "no minimum radius (the old 0.2 floor is gone): 20 → 20 / 115, 0 and invalid → 0");
}

// ---------------------------------------------------------------- 4. tamper cases (the oracle notices a changed formula)
{
  type AxisFn = (s: Record<BaseStat, number>) => number;
  const ok = (axis: RadarAxis, fn: AxisFn) => builds.filter((b) => fn(toStats(b.stats)) === b.axes[RADAR_AXES.indexOf(axis)]).length;
  const tampers: Array<[string, RadarAxis, AxisFn]> = [
    ["SHT rounded up instead of floored", "SHT", (s) => Math.ceil((s.finishing + s.kickingPower) / 2)],
    ["SPD rounded half up instead of floored", "SPD", (s) => Math.round((s.speed + s.acceleration) / 2)],
    ["SHT reads Place Kicking instead of Kicking Power (one stat changed)", "SHT", (s) => Math.floor((s.finishing + s.placeKicking) / 2)],
    ["DRI without Tight Possession", "DRI", (s) => Math.floor((s.ballControl + s.dribbling) / 2)],
    ["STR = Physical Contact only (the former base-stat radar)", "STR", (s) => s.physicalContact],
    ["PAS = Low Pass only", "PAS", (s) => s.lowPass],
    ["DEF = Defensive Awareness only", "DEF", (s) => s.defensiveAwareness],
  ];
  for (const [label, axis, fn] of tampers) {
    const n = ok(axis, fn);
    assert(n < builds.length, `tamper "${label}" is detected (${builds.length - n} of ${builds.length} builds fail)`);
  }
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ radar tests passed");
