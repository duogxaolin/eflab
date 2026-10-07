import type { BaseStat } from "@eflab/shared";
import { statLabel, statTierClass } from "@/lib/card-display";

// A labelled group of projected stats rendered as labeled bars with tier-colored values.
// Used by the build simulator (progression projection). Token-based, theme-agnostic.

export function StatGroup({
  title,
  stats,
  resolved,
}: {
  title: string;
  stats: readonly BaseStat[];
  resolved: Partial<Record<BaseStat, number>>;
}) {
  return (
    <section className="rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">{title}</h4>
      <div className="space-y-2">
        {stats.map((stat) => {
          const v = resolved[stat];
          return (
            <div key={stat} className="flex items-center gap-3">
              <div className="w-36 text-xs text-[var(--color-text-secondary)] text-right">{statLabel(stat)}</div>
              <div className="flex-1 h-2 rounded-full bg-[var(--color-canvas)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{ width: `${Math.min(100, ((v ?? 0) / 99) * 100)}%` }}
                />
              </div>
              <div className={`w-8 text-xs font-mono font-bold text-right ${statTierClass(v ?? 0)}`}>
                {v ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
