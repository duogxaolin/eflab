"use client";
import { useMemo, type ReactNode } from "react";
import type { BaseStat, BuildResult, PlayerCardDTO, SkillDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { InlineQueryError } from "@/lib/query-state";
import { WeakFootStars } from "@/components/detail/StarRating";
import { SkillChip } from "@/components/detail/SkillChip";
import { orderSkills, skillDisplayName } from "@/components/detail/skill-display";
import {
  ATTACKING_STATS,
  DEFENDING_STATS,
  PHYSIQUE_LABEL,
  PHYSIQUE_ORDER,
  STRENGTH_STATS,
  cardLeagueOf,
  physiqueTier,
  statLabel,
  statTierBg,
  strongerFootLabel,
  tierBgClass,
} from "@/lib/card-display";

// The compare sections under the console (change efootbase-function-parity,
// spec "Two-Build Compare" and comparison-tool "Multi-Card Side-by-Side
// Comparison"), in the reference's order:
//   Stats      one row per stat with each side's value from its own build as
//              a tier-coloured pill;
//   Overview   height, weight and age (unfilled pills), strong foot (text),
//              weak-foot usage and accuracy (stars), the card's own league
//              (text — `cardLeagueOf`, change a11y-names-and-card-league);
//   Skills     each side's skills, linked to their skill pages through
//              SkillChip (so the links follow the skill route);
//   Body Model the 11 body values as tier-coloured pills (the five derived
//              metrics follow the build on the reference and are pending —
//              not shown).
// Every row with a number (all but Strong Foot) shows, when the two sides
// differ, the absolute difference next to BOTH values — marked positive on
// the higher side and negative on the lower one (colour, `data-sign`, and
// "higher" / "lower" for screen readers); equal rows show none. The
// reference does the same on its stat, Overview and Body Model rows (survey
// S3: two card pairs). Left column = the left slot, always.

export interface CompareColumn {
  card: PlayerCardDTO;
  result: BuildResult;
}

type Side = "left" | "right";

/** One value cell: the value, then (when both sides have a number and they
 *  differ) the difference — drawn on the outer edge (left of the value on the
 *  left side; DOM order value → difference, read "90, 9 higher"). */
function ValueCell({ side, value, other, children }: { side: Side; value?: number; other?: number; children: ReactNode }) {
  const sign = value === undefined || other === undefined ? null : value > other ? "positive" : value < other ? "negative" : null;
  const diff = value === undefined || other === undefined ? 0 : Math.abs(value - other);
  return (
    <td className={`efb-compare-cell efb-compare-cell--${side}`}>
      <span className="efb-compare-cell__inner">
        {children}
        {sign && (
          <span className="efb-compare-delta" data-sign={sign} data-testid="compare-delta">
            {diff}
            <span className="sr-only"> {sign === "positive" ? "higher" : "lower"}</span>
          </span>
        )}
      </span>
    </td>
  );
}

/** A row of the Overview / Body Model: `lv` / `rv` are the two numbers the
 *  difference is computed from (omitted for a text value). */
function CompareRow({ label, left, right, lv, rv }: { label: string; left: ReactNode; right: ReactNode; lv?: number; rv?: number }) {
  return (
    <tr data-row={label} data-left={lv} data-right={rv}>
      <ValueCell side="left" value={lv} other={rv}>
        {left}
      </ValueCell>
      <th scope="row" className="efb-compare-label">
        {label}
      </th>
      <ValueCell side="right" value={rv} other={lv}>
        {right}
      </ValueCell>
    </tr>
  );
}

const plainValue = (v: ReactNode) => <span className="efb-compare-value">{v}</span>;

/** A section card holding one three-column table (left value · label · right
 *  value). The column heads name the two cards (visible in the Stats table,
 *  for screen readers in the others). */
function CompareSectionTable({
  id,
  title,
  caption,
  left,
  right,
  visibleHead = false,
  testId,
  children,
}: {
  id: string;
  title: string;
  caption: string;
  left: PlayerCardDTO;
  right: PlayerCardDTO;
  visibleHead?: boolean;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="efb-card" aria-labelledby={id} data-testid={testId}>
      <h2 id={id} className="efb-card__title mb-3">
        {title}
      </h2>
      <table className="efb-compare-table">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="efb-compare-table__side" />
          <col />
          <col className="efb-compare-table__side" />
        </colgroup>
        <thead className={visibleHead ? undefined : "sr-only"}>
          <tr className="efb-compare-head">
            <th scope="col" className="text-[var(--color-accent)]">
              <span className="efb-compare-head__name">{left.name}</span>
            </th>
            <th scope="col" className="text-[var(--color-text-secondary)]">
              {visibleHead ? "Stat" : title}
            </th>
            <th scope="col" className="text-[var(--color-accent-secondary)]">
              <span className="efb-compare-head__name">{right.name}</span>
            </th>
          </tr>
        </thead>
        {children}
      </table>
    </section>
  );
}

const STAT_GROUPS: ReadonlyArray<[string, readonly BaseStat[]]> = [
  ["Attacking", ATTACKING_STATS],
  ["Defending & goalkeeping", DEFENDING_STATS],
  ["Strength & athleticism", STRENGTH_STATS],
];

function SkillList({ card, bySlug, loading }: { card: PlayerCardDTO; bySlug: ReadonlyMap<string, SkillDTO>; loading: boolean }) {
  const slugs = orderSkills(card.skills, bySlug);
  if (slugs.length === 0) return <p className="text-sm text-[var(--color-text-secondary)]">No skills.</p>;
  if (loading) {
    return (
      <ul className="flex flex-wrap gap-2" aria-busy="true" aria-label={`Loading the skills of ${card.name}`}>
        {slugs.map((slug) => (
          <li key={slug} className="h-[30px] w-24 animate-pulse rounded-lg bg-[var(--color-default)]" />
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label={`Skills of ${card.name}`}>
      {slugs.map((slug) => (
        <li key={slug} className="min-w-0 max-w-full">
          <SkillChip slug={slug} label={skillDisplayName(slug, bySlug.get(slug))} skill={bySlug.get(slug)} />
        </li>
      ))}
    </ul>
  );
}

export function CompareTable({ left, right }: { left: CompareColumn; right: CompareColumn }) {
  const skillsQ = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });
  const bySlug = useMemo(() => {
    const map = new Map<string, SkillDTO>();
    for (const s of skillsQ.data ?? []) map.set(s.slug, s);
    return map;
  }, [skillsQ.data]);
  const L = left.card;
  const R = right.card;
  const lStats = left.result.projectedStats;
  const rStats = right.result.projectedStats;
  const lLeague = cardLeagueOf(L);
  const rLeague = cardLeagueOf(R);

  return (
    <div className="mt-8 space-y-6">
      <CompareSectionTable
        id="compare-attributes"
        title="Stats"
        caption="Each stat of the two builds: the left slot's value, the stat, the right slot's value; when they differ, the difference is shown next to both values."
        left={L}
        right={R}
        visibleHead
        testId="compare-table"
      >
        {STAT_GROUPS.map(([title, stats]) => (
          <tbody key={title}>
            <tr className="efb-compare-section">
              <th colSpan={3} scope="colgroup">
                {title}
              </th>
            </tr>
            {stats.map((stat) => (
              <tr key={stat} data-stat={stat} data-left={lStats[stat]} data-right={rStats[stat]} data-testid="compare-stat-row">
                <ValueCell side="left" value={lStats[stat]} other={rStats[stat]}>
                  <span className={`efb-compare-pill ${statTierBg(lStats[stat])}`}>{lStats[stat]}</span>
                </ValueCell>
                <th scope="row" className="efb-compare-label">
                  {statLabel(stat)}
                </th>
                <ValueCell side="right" value={rStats[stat]} other={lStats[stat]}>
                  <span className={`efb-compare-pill ${statTierBg(rStats[stat])}`}>{rStats[stat]}</span>
                </ValueCell>
              </tr>
            ))}
          </tbody>
        ))}
      </CompareSectionTable>

      <CompareSectionTable
        id="compare-overview"
        title="Overview"
        caption="Overview of the two cards; when a number differs, the difference is shown next to both values."
        left={L}
        right={R}
        testId="compare-overview"
      >
        <tbody>
          <CompareRow label="Height" left={plainValue(`${L.height} cm`)} right={plainValue(`${R.height} cm`)} lv={L.height} rv={R.height} />
          <CompareRow label="Weight" left={plainValue(`${L.weight} kg`)} right={plainValue(`${R.weight} kg`)} lv={L.weight} rv={R.weight} />
          <CompareRow label="Strong Foot" left={plainValue(strongerFootLabel(L.strongerFoot))} right={plainValue(strongerFootLabel(R.strongerFoot))} />
          {/* Weak foot is stored 0-based (the /players filter's `wfu` / `wfa`
              codes, survey S2): stars = value + 1 (`WeakFootStars`, the
              player page's rule too) — an inference from those codes; the
              reference's compare draws stars, whose count was not read. The
              difference is the stored values' (it matches the reference's on
              two card pairs). */}
          <CompareRow
            label="WF Usage"
            left={<WeakFootStars level={L.weakFootUsage} label="Weak foot usage" />}
            right={<WeakFootStars level={R.weakFootUsage} label="Weak foot usage" />}
            lv={L.weakFootUsage}
            rv={R.weakFootUsage}
          />
          <CompareRow
            label="WF Accuracy"
            left={<WeakFootStars level={L.weakFootAccuracy} label="Weak foot accuracy" />}
            right={<WeakFootStars level={R.weakFootAccuracy} label="Weak foot accuracy" />}
            lv={L.weakFootAccuracy}
            rv={R.weakFootAccuracy}
          />
          <CompareRow label="Age" left={plainValue(L.age)} right={plainValue(R.age)} lv={L.age} rv={R.age} />
          {/* Each card's own league — the one the /players League filter
              matches — or its team's when it stores none (`cardLeagueOf`,
              change a11y-names-and-card-league); text, no difference. */}
          {(lLeague || rLeague) && <CompareRow label="League" left={plainValue(lLeague?.name ?? "—")} right={plainValue(rLeague?.name ?? "—")} />}
        </tbody>
      </CompareSectionTable>

      <section className="efb-card" aria-labelledby="compare-skills" data-testid="compare-skills">
        <h2 id="compare-skills" className="efb-card__title mb-3">
          Skills
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {[L, R].map((card, i) => (
            <div key={`${i}-${card.id}`} className="min-w-0 space-y-2">
              <h3 className={`truncate text-sm font-semibold ${i === 0 ? "text-[var(--color-accent)]" : "text-[var(--color-accent-secondary)]"}`}>{card.name}</h3>
              <SkillList card={card} bySlug={bySlug} loading={skillsQ.isPending} />
            </div>
          ))}
        </div>
        {/* The skill list failed (API error, offline): the chips keep their
            fallback names; this line says so and retries. */}
        {skillsQ.isError && (
          <InlineQueryError error={skillsQ.error} onRetry={() => void skillsQ.refetch()} what="the skill details" className="mt-3" data-testid="compare-skills-error" />
        )}
      </section>

      {L.physique && R.physique && (
        <CompareSectionTable
          id="compare-body-model"
          title="Body Model"
          caption="The body model values of the two cards; when they differ, the difference is shown next to both values."
          left={L}
          right={R}
          testId="compare-body-model"
        >
          <tbody>
            {PHYSIQUE_ORDER.map((k) => {
              const lv = L.physique![k];
              const rv = R.physique![k];
              return (
                <CompareRow
                  key={k}
                  label={PHYSIQUE_LABEL[k]}
                  left={<span className={`efb-compare-pill ${tierBgClass(physiqueTier(lv))}`}>{lv}</span>}
                  right={<span className={`efb-compare-pill ${tierBgClass(physiqueTier(rv))}`}>{rv}</span>}
                  lv={lv}
                  rv={rv}
                />
              );
            })}
          </tbody>
        </CompareSectionTable>
      )}
    </div>
  );
}
