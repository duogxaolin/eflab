import type { PlayerCardDTO } from "@eflab/shared";
import { BODY_METRIC_ORDER, DERIVED_LABEL, PHYSIQUE_LABEL, PHYSIQUE_ORDER, physiqueTier, tierBgClass, tierTextClass } from "@/lib/card-display";

// "Body Model" section (efootbase): the 11 physique values (1–10) and the 5
// derived body metrics. Both live in the Player table for every card; the
// section renders them when the DTO carries them and otherwise says so —
// it never shows a placeholder number.

export function BodyModel({ player: p }: { player: PlayerCardDTO }) {
  const physique = p.physique;
  const metrics = p.bodyMetrics;
  return (
    <section
      aria-labelledby="body-model-title"
      data-testid="body-model"
      className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-4 shadow-sm"
    >
      <h2 id="body-model-title" className="text-xs font-bold text-white uppercase tracking-wider">Body Model</h2>
      {!physique && !metrics ? (
        <p className="text-xs text-[var(--color-text-secondary)]" data-testid="body-model-unavailable">
          Body model values are stored for every card but the player API does not expose them yet.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {physique && (
            <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {PHYSIQUE_ORDER.map((k) => {
                const v = physique[k];
                const tier = physiqueTier(v);
                return (
                  <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-transparent bg-[var(--color-canvas)] px-2.5 py-1.5">
                    <dt className={`text-sm font-medium ${tierTextClass(tier)}`}>{PHYSIQUE_LABEL[k]}</dt>
                    <dd className={`w-9 shrink-0 rounded-md py-0.5 text-center font-mono text-sm font-bold tabular-nums ${tierBgClass(tier)} ${tier === "low" ? "text-white" : "text-[var(--color-accent-foreground)]"}`}>
                      {v}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
          {metrics && (
            <dl className="grid grid-cols-1 gap-1.5">
              {BODY_METRIC_ORDER.map((k) => (
                <div key={k} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-canvas)] px-2.5 py-1.5">
                  <dt className="text-sm font-medium text-white/90">{DERIVED_LABEL[k]}</dt>
                  <dd className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--color-accent)]">{metrics[k].toFixed(1)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
