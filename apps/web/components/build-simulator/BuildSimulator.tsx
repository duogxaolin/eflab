"use client";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { PlayerCardDTO, Position, TrainingAllocation } from "@eflab/shared";
import {
  POSITIONS,
  TRAINING_CATEGORIES,
  TRAINING_CATEGORY_LABELS,
  allocationCost,
  emptyAllocation,
  nextStatPointCost,
  positionFromIndex,
  trainingPointsAvailable,
  type BaseStat,
} from "@eflab/shared";
import { StatGroup } from "@/components/players/StatGroup";
import { ATTACKING_STATS, DEFENDING_STATS, STRENGTH_STATS } from "@/lib/card-display";

// Headless-API variant of the progression sheet: runs `community.simulate`
// server-side with the shared engine. The detail page uses the client-side
// ProgressionPanel instead (same rules, no round trip); this component has no
// callers today and is kept compiling against the engine's types.
export function BuildSimulator({ player }: { player: PlayerCardDTO }) {
  const [maxLevel, setMaxLevel] = useState(Math.max(1, player.levelCap));
  const [position, setPosition] = useState<Position>(positionFromIndex(player.registeredPosition));
  const [training, setTraining] = useState<TrainingAllocation>(emptyAllocation);
  const [boosters, setBoosters] = useState<[boolean, boolean]>([true, false]);

  const available = trainingPointsAvailable(maxLevel);
  const used = useMemo(() => allocationCost(training), [training]);
  const remaining = available - used;

  const sim = trpc.community.simulate.useQuery({
    playerId: player.id,
    maxLevel,
    position,
    trainingPoints: training,
    boosters,
  });

  const projected = (sim.data?.projectedStats ?? player.stats) as Record<BaseStat, number>;

  const adjust = (cat: (typeof TRAINING_CATEGORIES)[number], delta: number) => {
    setTraining((prev) => {
      const cur = prev[cat];
      const next = Math.max(0, cur + delta);
      if (delta > 0 && nextStatPointCost(cur) > remaining) return prev;
      return { ...prev, [cat]: next };
    });
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Build Simulator</h3>
        <div className="text-xs text-[var(--color-text-secondary)]">
          Remaining: <span className="text-[var(--color-accent)] font-semibold">{remaining}</span>/{available}
        </div>
      </header>

      <div className="rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-4 grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div>
            <label htmlFor="build-sim-max-level" className="text-xs uppercase text-[var(--color-text-dim)]">Max level</label>
            <input
              id="build-sim-max-level"
              type="range" min={1} max={Math.max(1, player.levelCap)} value={maxLevel}
              onChange={(e) => {
                const next = Number(e.target.value);
                setMaxLevel(next);
                if (allocationCost(training) > trainingPointsAvailable(next)) setTraining(emptyAllocation());
              }}
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>1</span><span>{maxLevel}</span><span>{player.levelCap}</span>
            </div>
          </div>
          <div>
            <label htmlFor="build-sim-position" className="text-xs uppercase text-[var(--color-text-dim)]">Position</label>
            <select
              id="build-sim-position"
              value={position}
              onChange={(e) => setPosition(e.target.value as Position)}
              className="w-full h-8 rounded-md bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-white px-2"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase text-[var(--color-text-dim)]">Training points</div>
          {TRAINING_CATEGORIES.map((cat) => (
            <div key={cat} className="flex items-center gap-2">
              <span className="text-xs w-24 text-[var(--color-text-secondary)]">{TRAINING_CATEGORY_LABELS[cat]}</span>
              <button
                type="button"
                onClick={() => adjust(cat, -1)}
                className="w-6 h-6 rounded-md bg-[var(--color-elevated)] border border-[var(--color-line)] text-xs"
                aria-label={`Decrease ${TRAINING_CATEGORY_LABELS[cat]}`}>−</button>
              <div className="text-sm font-semibold w-6 text-center text-[var(--color-accent)]">{training[cat]}</div>
              <button
                type="button"
                onClick={() => adjust(cat, +1)}
                disabled={nextStatPointCost(training[cat]) > remaining}
                className="w-6 h-6 rounded-md bg-[var(--color-elevated)] border border-[var(--color-line)] text-xs disabled:opacity-40"
                aria-label={`Increase ${TRAINING_CATEGORY_LABELS[cat]}`}>+</button>
              <span className="text-[10px] text-[var(--color-text-dim)]">next {nextStatPointCost(training[cat])}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Booster toggles */}
      <div className="rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-4 flex gap-3 items-center">
        <span className="text-sm font-semibold">Boosters</span>
        {[player.booster1, player.booster2].map((b, i) => (
          <button
            key={i}
            type="button"
            disabled={!b}
            aria-pressed={boosters[i]}
            onClick={() => setBoosters((prev) => (i === 0 ? [!prev[0], prev[1]] : [prev[0], !prev[1]]))}
            className={`px-2.5 py-1 rounded-md text-xs border transition disabled:opacity-40 ${
              boosters[i]
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "border-[var(--color-line)] text-[var(--color-text-secondary)]"
            }`}
          >
            {b ? b.name : `Booster ${i + 1}: none`} {boosters[i] ? "ON" : "off"}
          </button>
        ))}
      </div>

      <div className="text-xs text-[var(--color-text-secondary)]">
        Estimated OVR at {position}: <span className="text-[var(--color-accent)] font-bold">{sim.data ? `~${sim.data.estimatedOvr}` : "…"}</span>
      </div>

      <StatGroup title="Attacking" stats={ATTACKING_STATS} resolved={projected} />
      <StatGroup title="Defending" stats={DEFENDING_STATS} resolved={projected} />
      <StatGroup title="Strength" stats={STRENGTH_STATS} resolved={projected} />
    </section>
  );
}
