"use client";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { PlayerCardDTO } from "@eflab/shared";
import { TRAINING_CATEGORIES, type BaseStat } from "@eflab/shared";
import { StatGroup } from "@/components/players/StatGroup";
import { ATTACKING_STATS, DEFENDING_STATS, STRENGTH_STATS } from "@/lib/card-display";

export function BuildSimulator({ player, managerId }: { player: PlayerCardDTO; managerId?: string }) {
  const [level, setLevel] = useState(player.ovr === player.maxOvr ? 50 : Math.max(1, player.ovr - 50));
  const [maxLevel, setMaxLevel] = useState(player.maxOvr - player.ovr + 50);
  const [training, setTraining] = useState<Record<string, number>>(
    Object.fromEntries(TRAINING_CATEGORIES.map(c => [c, 0])),
  );
  const [boosters, setBoosters] = useState<[boolean, boolean]>([false, false]);

  const total = useMemo(() => Object.values(training).reduce((a, b) => a + b, 0), [training]);
  const available = Math.max(0, maxLevel - level + 1) * 5;
  const remaining = available - total;

  // tRPC server-side simulation — backed by packages/shared/progression.ts.
  const sim = trpc.community.simulate.useQuery({
    playerId: player.id,
    level,
    maxLevel,
    trainingPoints: training as Record<string, number>,
    boosters,
    ...(managerId ? { managerId } : {}),
  });

  const projected = (sim.data?.projectedStats ?? player.stats) as Record<BaseStat, number>;

  const adjust = (cat: string, delta: number) => {
    setTraining(prev => {
      const cur = prev[cat] ?? 0;
      const next = Math.max(0, Math.min(20, cur + delta));
      if (delta > 0 && (total + delta) > available) return prev;
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
            <label className="text-xs uppercase text-[var(--color-text-dim)]">Level</label>
            <input
              type="range" min={1} max={maxLevel} value={level}
              onChange={e => setLevel(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>1</span><span>{level}</span><span>{maxLevel}</span>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-[var(--color-text-dim)]">Max Level Cap</label>
            <input
              type="range" min={1} max={150} value={maxLevel}
              onChange={e => setMaxLevel(Number(e.target.value))}
              className="w-full accent-[var(--color-accent-secondary)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--color-text-dim)]">
              <span>1</span><span>{maxLevel}</span><span>150</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase text-[var(--color-text-dim)]">Training Points</div>
          {TRAINING_CATEGORIES.map(cat => (
            <div key={cat} className="flex items-center gap-2">
              <span className="text-xs w-24 text-[var(--color-text-secondary)]">{cat}</span>
              <button
                onClick={() => adjust(cat, -1)}
                className="w-6 h-6 rounded-md bg-[var(--color-elevated)] border border-[var(--color-line)] text-xs"
                aria-label={`decrement ${cat}`}>−</button>
              <div className="text-sm font-semibold w-6 text-center text-[var(--color-accent)]">{training[cat] ?? 0}</div>
              <button
                onClick={() => adjust(cat, +1)}
                className="w-6 h-6 rounded-md bg-[var(--color-elevated)] border border-[var(--color-line)] text-xs"
                aria-label={`increment ${cat}`}>+</button>
              <div className="flex-1" />
              <div className="h-1.5 w-20 bg-[var(--color-canvas)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-accent)]" style={{ width: `${((training[cat] ?? 0) / 20) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Booster toggles */}
      <div className="rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-4 flex gap-3 items-center">
        <span className="text-sm font-semibold">Boosters</span>
        {[player.boosterId1, player.boosterId2].map((b, i) => (
          <button
            key={i}
            onClick={() => setBoosters(prev => [i === 0 ? !prev[0] : prev[0], i === 1 ? !prev[1] : prev[1]] as [boolean, boolean])}
            className={`px-2.5 py-1 rounded-md text-xs border transition ${
              boosters[i]
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "border-[var(--color-line)] text-[var(--color-text-secondary)]"
            }`}
          >
            {b != null ? `Booster #${b}` : `Booster ${i+1}`} {boosters[i] ? "ON" : "off"}
          </button>
        ))}
      </div>

      <div className="text-xs text-[var(--color-text-secondary)]">
        Projected MAX OVR: <span className="text-[var(--color-accent)] font-bold">{sim.data?.projectedMaxOvr ?? "…"}</span>
      </div>

      <StatGroup title="Attacking" stats={ATTACKING_STATS} resolved={projected} />
      <StatGroup title="Defending" stats={DEFENDING_STATS} resolved={projected} />
      <StatGroup title="Strength" stats={STRENGTH_STATS} resolved={projected} />
    </section>
  );
}
