import type { SkillEffect } from "@eflab/shared";
import { effectLabel, effectSummary } from "@/lib/skill-labels";

// Stat boosts of a skill exactly as efootbase shows them (eFootLab stat names,
// mapped by the seed) plus the activation text. Renders nothing when the skill
// has neither — no boost is ever invented. `compact` collapses a long uniform
// list (Super-sub: +1 on 25 stats) into one line.
export function SkillEffects({
  effects,
  activation,
  compact = false,
  className = "",
}: {
  effects: readonly SkillEffect[];
  activation: string | null;
  compact?: boolean;
  className?: string;
}) {
  if (effects.length === 0 && !activation) return null;
  const summary = compact ? effectSummary(effects) : null;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {effects.length > 0 &&
        (summary ? (
          <p className="text-[11px] font-semibold text-[var(--color-accent)]">{summary}</p>
        ) : (
          <ul className="flex flex-wrap gap-1" aria-label="Stat boosts">
            {effects.map((e) => (
              <li
                key={e.stat}
                className="rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-accent)]"
              >
                {effectLabel(e)}
              </li>
            ))}
          </ul>
        ))}
      {activation && (
        <p className="text-[11px] leading-snug text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-text-primary)]">Activation: </span>
          {activation}
        </p>
      )}
    </div>
  );
}
