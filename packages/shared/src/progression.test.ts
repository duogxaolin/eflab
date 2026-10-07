// Regression tests for the progression engine — per build-simulator spec scenario.
// Run: tsx packages/shared/src/progression.test.ts
import { simulateBuild, trainingPointsAvailable, TACTIC_BOOST_THRESHOLD } from "./progression";
import { BASE_STATS, TRAINING_CATEGORIES } from "./constants";
import type { BaseStat } from "./constants";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

// 1. Spec scenario: 4 points to Shooting → Offensive Awareness +4, Finishing +4, Set Piece Taking +2.
{
  const base: Record<BaseStat, number> = Object.fromEntries(
    BASE_STATS.map((s) => [s, 60]),
  ) as Record<BaseStat, number>;
  const result = simulateBuild({
    base,
    config: {
      playerId: "1",
      level: 50,
      maxLevel: 50,
      trainingPoints: Object.fromEntries(
        TRAINING_CATEGORIES.map((c) => [c, c === "Shooting" ? 4 : 0]),
      ) as Record<string, number>,
      boosters: [false, false],
      managerId: null,
    },
    boosters: [],
  });
  assert(result.trainingDeltas.offensiveAwareness === 4, `Shooting → Offensive Awareness +4 (got ${result.trainingDeltas.offensiveAwareness})`);
  assert(result.trainingDeltas.finishing === 4, `Shooting → Finishing +4 (got ${result.trainingDeltas.finishing})`);
  // Set Piece Taking gets weight 0.5 → Math.floor(4 * 0.5) = 2
  assert(result.trainingDeltas.placeKicking === 2, `Shooting → Set Piece Taking +2 (got ${result.trainingDeltas.placeKicking})`);
  assert(result.remainingPoints >= 0, "remaining points non-negative");
}

// 2. Manager tactic boost: Quick Counter >= 88 → +2 to qualifying stats.
{
  const base: Record<BaseStat, number> = Object.fromEntries(
    BASE_STATS.map((s) => [s, 60]),
  ) as Record<BaseStat, number>;
  const result = simulateBuild({
    base,
    config: {
      playerId: "1",
      level: 1,
      maxLevel: 100,
      trainingPoints: Object.fromEntries(TRAINING_CATEGORIES.map((c) => [c, 0])) as Record<string, number>,
      boosters: [false, false],
      managerId: "1",
    },
    boosters: [],
    managerTactics: { quickCounter: 90 },
    playerTactics: { quickCounter: 80 },
  });
  assert((result.managerDeltas.speed ?? 0) === 2, `Quick Counter >= 88 → Speed +2 (got ${result.managerDeltas.speed ?? 0})`);
  assert((result.managerDeltas.finishing ?? 0) === 2, `Quick Counter >= 88 → Finishing +2`);
}

// 3. Booster toggle: "Defending +2" (booster id 5) → +2 to all 4 defending stats.
{
  const base: Record<BaseStat, number> = Object.fromEntries(
    BASE_STATS.map((s) => [s, 60]),
  ) as Record<BaseStat, number>;
  const result = simulateBuild({
    base,
    config: {
      playerId: "1",
      level: 1,
      maxLevel: 50,
      trainingPoints: Object.fromEntries(TRAINING_CATEGORIES.map((c) => [c, 0])) as Record<string, number>,
      boosters: [true, false],
      managerId: null,
    },
    boosters: [
      {
        id: 5, name: "Defending +2",
        stats: { defensiveAwareness: 2, ballWinning: 2, defensiveEngagement: 2, aggression: 2 },
      },
    ],
  });
  assert(result.boosterDeltas.defensiveAwareness === 2, `Booster Defending → Defensive Awareness +2`);
  assert(result.boosterDeltas.ballWinning === 2, `Booster Defending → Ball Winning +2`);
  assert(result.boosterDeltas.aggression === 2, `Booster Defending → Aggression +2`);
  assert(result.boosterDeltas.defensiveEngagement === 2, `Booster Defending → Defensive Engagement +2`);
}

// 4. trainingPointsAvailable is monotonic in (maxLevel, level).
assert(trainingPointsAvailable(100, 1) > trainingPointsAvailable(100, 50), "training points available decreases with level");
assert(TACTIC_BOOST_THRESHOLD === 88, "tactic boost threshold is 88 (per spec)");

// 5. Stats clamp to [40, 99].
{
  const base: Record<BaseStat, number> = Object.fromEntries(
    BASE_STATS.map((s) => [s, 98]),
  ) as Record<BaseStat, number>;
  const result = simulateBuild({
    base,
    config: {
      playerId: "1", level: 50, maxLevel: 50,
      trainingPoints: Object.fromEntries(TRAINING_CATEGORIES.map((c) => [c, 10])) as Record<string, number>,
      boosters: [true, true], managerId: null,
    },
    boosters: [
      { id: 5, name: "Defending +2", stats: { defensiveAwareness: 2, ballWinning: 2, defensiveEngagement: 2, aggression: 2 } },
      { id: 7, name: "Shooting +2", stats: { finishing: 2, placeKicking: 2, kickingPower: 2 } },
    ],
    managerTactics: { possessionGame: 90 },
    playerTactics: { possessionGame: 90 },
  });
  for (const s of BASE_STATS) {
    assert(result.projectedStats[s]! <= 99 && result.projectedStats[s]! >= 40, `${s} within [40, 99] (=${result.projectedStats[s]})`);
  }
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ progression tests passed");
