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
// the value (five tiers, ≥ 100 magenta — reached only through boosters or the
// manager, training stops at 99), a cyan "+N" chip for a booster bump, a lime
// "+1" chip for the selected manager, a tooltip that splits the value into
// base, training, the cut at 99, Manager Proficiency, booster and manager
// parts, and
// click-to-highlight — a stat row or a category chip selects the training
// category it belongs to and dims every other row.

/** Stat → the training categories that raise it, in TRAINING_CATEGORIES
 *  order. Every stat is in at least one; Jump is in two (Aerial Strength and
 *  Goalkeeper 1 — each lifts it, see TRAINING_STATS). */
export const STAT_CATEGORIES: Readonly<Record<BaseStat, readonly TrainingCategory[]>> = (() => {
  const m = {} as Record<BaseStat, TrainingCategory[]>;
  for (const cat of TRAINING_CATEGORIES) for (const s of TRAINING_STATS[cat]) (m[s] ??= []).push(cat);
  return m;
})();

export type StatHighlight = TrainingCategory | null;

/** Next highlight after clicking a stat row: a stat in several categories
 *  cycles through them (Jump: Aerial Strength → Goalkeeper 1 → clear), a
 *  stat in one toggles it. */
export function nextStatHighlight(stat: BaseStat, current: StatHighlight): StatHighlight {
  const cats = STAT_CATEGORIES[stat];
  const i = current === null ? -1 : cats.indexOf(current);
  if (i === -1) return cats[0] ?? null;
  return cats[i + 1] ?? null;
}

/** "+N" chip for a stat raised by an active booster (cyan) or by the selected
 *  manager (lime, "+1"). */
export function DeltaChip({ delta, title, kind = "booster" }: { delta: number | undefined; title?: string; kind?: "booster" | "manager" }) {
  if (!delta) return null;
  return (
    <span
      className={`efb-stat-row__boost ${kind === "manager" ? "efb-stat-row__boost--lime" : "efb-stat-row__boost--cyan"}`}
      data-testid={kind === "manager" ? "stat-manager-delta" : "stat-delta"}
      title={title}
    >
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
  /** Cut to 99 per stat, 0 or negative (tooltip only — inside the value). */
  capDeltas?: Record<BaseStat, number>;
  /** Manager Proficiency bonus per stat (tooltip only — inside the value too). */
  proficiencyDeltas?: Record<BaseStat, number>;
  /** +1 of the selected manager per stat (shown as the lime "+1" chip). */
  managerDeltas?: Record<BaseStat, number>;
  highlight: StatHighlight;
  onHighlight: (next: StatHighlight) => void;
}

function StatSection({ title, statKeys, values, boosterDeltas, trainingDeltas, capDeltas, proficiencyDeltas, managerDeltas, highlight, onHighlight }: SectionProps) {
  return (
    <div className="space-y-2 min-w-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[var(--color-line)] pb-1.5">{title}</h3>
      <div className="space-y-1">
        {statKeys.map((st) => {
          const val = values[st];
          const cats = STAT_CATEGORIES[st];
          const catLabels = cats.map((c) => PROGRESSION_CATEGORY_LABELS[c]).join(" / ");
          const hit = highlight !== null && cats.includes(highlight);
          const dim = highlight !== null && !hit;
          const lift = trainingDeltas?.[st] ?? 0;
          const cut = capDeltas?.[st] ?? 0;
          const bonus = proficiencyDeltas?.[st] ?? 0;
          const boost = boosterDeltas?.[st] ?? 0;
          const mgr = managerDeltas?.[st] ?? 0;
          const tipParts = [
            lift ? `+${lift} from ${catLabels} training` : null,
            cut ? `−${-cut} cut at 99 (training above 99 is not counted)` : null,
            bonus ? `+${bonus} Manager Proficiency` : null,
            boost ? `+${boost} booster` : null,
            mgr ? `+${mgr} manager` : null,
          ].filter(Boolean);
          const tip = tipParts.length > 0 ? `${statLabel(st)} ${val}: base ${val - lift - cut - bonus - boost - mgr}, ${tipParts.join(", ")}` : undefined;
          return (
            <button
              key={st}
              type="button"
              className="efb-stat-row cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
              data-stat={st}
              data-category={cats.join(" ")}
              data-hit={hit ? "true" : undefined}
              data-dim={dim ? "true" : undefined}
              aria-pressed={hit}
              aria-label={`${statLabel(st)} ${val} — highlight ${catLabels} stats`}
              title={tip}
              onClick={() => onHighlight(nextStatHighlight(st, highlight))}
            >
              <span className={`efb-stat-row__label ${statTierClass(val)}`} data-testid="stat-name">
                {statLabel(st)}
              </span>
              <DeltaChip delta={boosterDeltas?.[st]} title="Booster" />
              <DeltaChip delta={managerDeltas?.[st]} title="Manager" kind="manager" />
              <span className={`efb-stat-row__value ${statTierBg(val)} ${statTierForeground(val)}`}>{val}</span>
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
      <StatSection title="Attacking" statKeys={ATTACKING_STATS} {...props} />
      <StatSection title="Defending" statKeys={DEFENDING_STATS} {...props} />
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
