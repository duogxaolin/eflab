import type { PlayerCardDTO } from "@eflab/shared";
import { BODY_METRIC_ORDER, DERIVED_LABEL, PHYSIQUE_LABEL, PHYSIQUE_ORDER, physiqueTier, tierBgClass, tierTextClass } from "@/lib/card-display";

// "Body Model" section (efootbase): the 11 physique values (1–10) and the 5
// derived body metrics. Both live in the Player table for every card; the
// section renders them when the DTO carries them and otherwise says so —
// it never shows a placeholder number.
//
// Layout (efootbase-ui-redesign): the content-card style; the physique values
// as stat rows (#272727, 36 px, tier-coloured label, black value on the tier
// fill) in two columns filled top to bottom (one under 360 px, where two
// would split words like "Measurement"), the five metrics in a third
// column from `lg` (below it, under the physique). The metrics get no tier
// colour and no bar: there is no scale to rate them against.

export function BodyModel({ player: p }: { player: PlayerCardDTO }) {
  const physique = p.physique;
  const metrics = p.bodyMetrics;
  const physiqueRows = Math.ceil(PHYSIQUE_ORDER.length / 2);
  return (
    <section aria-labelledby="body-model-title" data-testid="body-model" className="efb-card space-y-3">
      <h2 id="body-model-title" className="efb-card__title">Body Model</h2>
      {!physique && !metrics ? (
        <p className="text-sm text-[var(--color-text-secondary)]" data-testid="body-model-unavailable">
          Body model values are stored for every card but the player API does not expose them yet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
          {physique && (
            <dl
              className="grid grid-cols-1 gap-x-3 gap-y-1 min-[360px]:grid-flow-col min-[360px]:grid-cols-2 lg:col-span-2 lg:gap-x-6"
              style={{ gridTemplateRows: `repeat(${physiqueRows}, auto)` }}
            >
              {PHYSIQUE_ORDER.map((k) => {
                const v = physique[k];
                const tier = physiqueTier(v);
                return (
                  <div key={k} className="efb-stat-row">
                    <dt className={`efb-stat-row__label ${tierTextClass(tier)}`}>{PHYSIQUE_LABEL[k]}</dt>
                    <dd className={`efb-stat-row__value ${tierBgClass(tier)}`}>{v}</dd>
                  </div>
                );
              })}
            </dl>
          )}
          {metrics && (
            <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-x-3 lg:grid-cols-1 lg:self-start">
              {BODY_METRIC_ORDER.map((k) => (
                <div key={k} className="efb-stat-row">
                  <dt className="efb-stat-row__label text-white">{DERIVED_LABEL[k]}</dt>
                  <dd className="shrink-0 text-sm font-bold tabular-nums text-white">{metrics[k].toFixed(1)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}
