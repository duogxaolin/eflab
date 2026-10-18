"use client";
import {
  PROGRESSION_CATEGORY_LABELS,
  TRAINING_CATEGORIES,
  TRAINING_STATS,
  type BaseStat,
  type TrainingAllocation,
  type TrainingCategory,
} from "@eflab/shared";
import {
  ATTACKING_STATS,
  DEFENDING_STATS,
  STRENGTH_STATS,
  statLabel,
  statTierBg,
  statTierClass,
  statTierForeground,
} from "@/lib/card-display";

// Three-column stat grid of the player detail page (efootbase layout):
// Attacking / Defending / Strength, one row per stat with the tier colour of
// the value (five tiers, ≥ 100 magenta), a cyan "+N" chip for a booster bump
// and click-to-highlight — a stat row or a category chip selects the training
// category it belongs to and dims every other row.

/** Stat → its training category (every one of the 26 stats is in exactly one). */
export const STAT_CATEGORY: Readonly<Record<BaseStat, TrainingCategory>> = Object.fromEntries(
  TRAINING_CATEGORIES.flatMap((cat) => TRAINING_STATS[cat].map((s) => [s, cat])),
) as Record<BaseStat, TrainingCategory>;

export type StatHighlight = TrainingCategory | null;

/** "+N" chip for a stat raised by an active booster. */
export function DeltaChip({ delta, title }: { delta: number | undefined; title?: string }) {
  if (!delta) return null;
  return (
    <span className="efb-stat-row__boost efb-stat-row__boost--cyan" data-testid="stat-delta" title={title}>
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

interface SectionProps {
  title: string;
  statKeys: readonly BaseStat[];
  values: Record<BaseStat, number>;
  /** Booster bump per stat (shown as the "+N" chip). */
  boosterDeltas?: Record<BaseStat, number>;
  /** Training lift per stat (tooltip only — it is already inside the value). */
  trainingDeltas?: Record<BaseStat, number>;
  highlight: StatHighlight;
  onHighlight: (next: StatHighlight) => void;
  jumpNotProjected?: boolean;
}

function StatSection({ title, statKeys, values, boosterDeltas, trainingDeltas, highlight, onHighlight, jumpNotProjected = false }: SectionProps) {
  return (
    <div className="space-y-2 min-w-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[var(--color-line)] pb-1.5">{title}</h3>
      <div className="space-y-1">
        {statKeys.map((st) => {
          const val = values[st];
          const cat = STAT_CATEGORY[st];
          const hit = highlight === cat;
          const dim = highlight !== null && !hit;
          const na = jumpNotProjected && st === "jump";
          const lift = trainingDeltas?.[st] ?? 0;
          const tip = lift ? `${statLabel(st)}: +${lift} from ${PROGRESSION_CATEGORY_LABELS[cat]} training` : undefined;
          return (
            <button
              key={st}
              type="button"
              className="efb-stat-row cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
              data-stat={st}
              data-category={cat}
              data-hit={hit ? "true" : undefined}
              data-dim={dim ? "true" : undefined}
              aria-pressed={hit}
              aria-label={`${statLabel(st)} ${na ? "not projected" : val} — highlight ${PROGRESSION_CATEGORY_LABELS[cat]} stats`}
              title={tip}
              onClick={() => onHighlight(hit ? null : cat)}
            >
              <span className={`efb-stat-row__label ${statTierClass(val)}`} data-testid="stat-name">
                {statLabel(st)}
              </span>
              {!na && <DeltaChip delta={boosterDeltas?.[st]} title="Booster" />}
              {na ? (
                <span
                  className="efb-stat-row__value !w-auto px-1.5 !text-[10px] bg-[var(--color-elevated)] !text-[var(--color-text-secondary)]"
                  title="Goalkeeper Jump carries a card-specific offset the rules cannot reproduce"
                >
                  n/a (card-specific)
                </span>
              ) : (
                <span className={`efb-stat-row__value ${statTierBg(val)} ${statTierForeground(val)}`}>{val}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StatGrid(props: Omit<SectionProps, "title" | "statKeys">) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3" data-testid="stat-grid">
      <StatSection title="Attacking" statKeys={ATTACKING_STATS} {...props} jumpNotProjected={false} />
      <StatSection title="Defending" statKeys={DEFENDING_STATS} {...props} jumpNotProjected={false} />
      <StatSection title="Strength" statKeys={STRENGTH_STATS} {...props} />
    </div>
  );
}

/** Compact readout of the ten training categories ("Shooting 8" …). Each chip
 *  highlights the stats its category raises; it is a readout, the steppers in
 *  the Progression panel change the values. */
export function CategoryRow({
  allocation,
  highlight,
  onHighlight,
}: {
  allocation: TrainingAllocation;
  highlight: StatHighlight;
  onHighlight: (next: StatHighlight) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Training categories of the current build" data-testid="category-row">
      {TRAINING_CATEGORIES.map((cat) => {
        const v = allocation[cat];
        const hit = highlight === cat;
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={hit}
            data-testid={`category-chip-${cat}`}
            onClick={() => onHighlight(hit ? null : cat)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
              hit
                ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/15 text-white"
                : v > 0
                  ? "border-[var(--color-line)] bg-[var(--color-canvas)] text-white hover:border-[var(--color-line-active)]"
                  : "border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-dim)] hover:border-[var(--color-line-active)]"
            }`}
          >
            <span>{PROGRESSION_CATEGORY_LABELS[cat]}</span>
            <span className={`font-mono tabular-nums ${v > 0 ? "text-[var(--color-accent)]" : ""}`}>{v}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Key stats under the playing-style cards. */
export function KeyStats({
  statKeys,
  values,
  boosterDeltas,
}: {
  statKeys: readonly BaseStat[];
  values: Record<BaseStat, number>;
  boosterDeltas?: Record<BaseStat, number>;
}) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
      {statKeys.map((st) => {
        const v = values[st];
        return (
          <div key={st} className="min-w-0 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] px-2 py-1.5">
            <dt className="text-[10px] leading-tight text-[var(--color-text-dim)]" data-testid="stat-name">{statLabel(st)}</dt>
            <dd className={`flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${statTierClass(v)}`}>
              {v}
              <DeltaChip delta={boosterDeltas?.[st]} title="Booster" />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
