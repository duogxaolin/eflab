"use client";
import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { Pagination } from "@/components/players/Pagination";
import { QueryErrorState, CardGridSkeleton } from "@/lib/query-state";
import type { SkillDTO } from "@eflab/shared";
import { SKILL_GROUP_LABELS, skillDescription, skillGroup, skillLabel } from "@/lib/skill-labels";
import { SkillIcon } from "@/components/skills/SkillIcon";
import { SkillEffects } from "@/components/skills/SkillEffects";

const PAGE_SIZE = 24;
/** Holder grid — the pack grid (4 / 5 / 6 / 7 / 8 columns), name captions. */
const HOLDER_GRID = "grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";

// One skill (not in the reference capture; restyled with the tokens): the
// artwork (letterboxed, never cropped), name, description, group, stored stat
// boosts and activation, the real holder count and share, and the holders
// best first. Label, group, artwork, boosts and activation are stored data.
export function SkillDetailClient({ slug, initialData }: { slug: string; initialData: SkillDTO }) {
  const detail = trpc.skill.byId.useQuery({ slug }, { initialData });
  const skill = detail.data ?? initialData;
  const label = skillLabel(skill);
  const group = skillGroup(skill);
  const [page, setPage] = useState(1);
  const holders = trpc.skill.players.useQuery({ slug, page, limit: PAGE_SIZE }, { placeholderData: (prev) => prev });
  const catalogue = trpc.player.list.useQuery({ page: 1, limit: 1 }, { staleTime: 60 * 60_000 });

  // The real holder count: `skill.players.total` once loaded, else the count the
  // server page already fetched with the skill.
  const total = holders.data?.total ?? skill.playerCount;
  const allCards = catalogue.data?.total;
  const share = allCards ? `${((total / allCards) * 100).toFixed(total / allCards < 0.1 ? 2 : 1)}%` : "—";

  return (
    <div>
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 mb-3 list-none p-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link hit-44" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator" aria-hidden>
            ›
          </span>
        </li>
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link hit-44" href="/skills">
            Skills
          </Link>
          <span className="breadcrumbs__separator" aria-hidden>
            ›
          </span>
        </li>
        <li className="breadcrumbs__item" aria-current="page">
          {label}
        </li>
      </ol>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {skill.iconUrl && (
          <div className="w-full max-w-sm shrink-0 sm:w-72">
            <SkillIcon src={skill.iconUrl} width="fluid" className="rounded-2xl" />
          </div>
        )}
        <div className="min-w-0 space-y-3">
          <h1 className={`efb-h1 ${group === "showtime" ? "text-[var(--color-showtime)]" : "text-[var(--color-text-primary)]"}`}>{label}</h1>
          <p className="efb-subtitle">{skillDescription(skill)}</p>
          <div className="flex items-center gap-2">
            <span className={`chip chip--lg chip--default ${group === "showtime" ? "text-[var(--color-showtime)]" : ""}`}>{SKILL_GROUP_LABELS[group]}</span>
          </div>
          {(skill.effects.length > 0 || skill.activation) && (
            <section aria-labelledby="skill-effects" className="efb-card space-y-2" data-testid="skill-effects">
              <h2 id="skill-effects" className="efb-card__title">
                Stat boost
              </h2>
              <SkillEffects effects={skill.effects} activation={skill.activation} />
            </section>
          )}
        </div>
      </div>

      {/* Metrics — all derived from PlayerSkill rows */}
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="space-y-1 rounded-2xl bg-[var(--color-panel)] p-4">
          <dt className="text-sm text-[var(--color-text-secondary)]">Cards with this skill</dt>
          <dd className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">{total.toLocaleString("en-US")}</dd>
        </div>
        <div className="space-y-1 rounded-2xl bg-[var(--color-panel)] p-4">
          <dt className="text-sm text-[var(--color-text-secondary)]">Share of all cards</dt>
          <dd className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
            {share}
            {allCards !== undefined && <span className="block text-xs font-normal text-[var(--color-text-secondary)]">of {allCards.toLocaleString("en-US")} cards</span>}
          </dd>
        </div>
      </dl>

      {/* Holders — real cards that have the skill, best first */}
      <section className="mt-8 space-y-3" aria-labelledby="skill-top-cards">
        <h2 id="skill-top-cards" className="efb-h2 text-[var(--color-text-primary)]">
          Top cards
        </h2>

        {holders.isError ? (
          <QueryErrorState error={holders.error} onRetry={() => void holders.refetch()} title="Could not load the cards with this skill" />
        ) : holders.isPending ? (
          <CardGridSkeleton count={16} className={HOLDER_GRID} />
        ) : total === 0 ? (
          <div className="rounded-2xl bg-[var(--color-panel)] p-12 text-center text-xs text-[var(--color-text-secondary)]">No cards have this skill.</div>
        ) : (
          <>
            <div className={`${HOLDER_GRID} ${holders.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={holders.isPlaceholderData}>
              {holders.data.items.map((p) => (
                <PlayerCard key={p.id} player={p} caption="name" />
              ))}
            </div>
            <Pagination page={page} totalPages={holders.data.totalPages} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
