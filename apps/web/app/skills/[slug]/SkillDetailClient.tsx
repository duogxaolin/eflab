"use client";
import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { Pagination } from "@/components/players/Pagination";
import { QueryErrorState, CardGridSkeleton } from "@/lib/query-state";
import type { SkillDTO } from "@eflab/shared";
import { SKILL_GROUP_LABELS, skillDescription, skillGroup, skillLabel } from "@/lib/skill-labels";

const PAGE_SIZE = 24;

export function SkillDetailClient({ slug, initialData }: { slug: string; initialData: SkillDTO }) {
  const detail = trpc.skill.byId.useQuery({ slug }, { initialData });
  const skill = detail.data ?? initialData;
  // Display label + Showtime/Classic group from the web-only table (lib/skill-labels.ts).
  const label = skillLabel(skill);
  const group = skillGroup(skill.slug);
  const [page, setPage] = useState(1);
  const holders = trpc.skill.players.useQuery({ slug, page, limit: PAGE_SIZE }, { placeholderData: (prev) => prev });
  const catalogue = trpc.player.list.useQuery({ page: 1, limit: 1 }, { staleTime: 60 * 60_000 });

  // The real holder count: `skill.players.total` once loaded, else the count the
  // server page already fetched with the skill.
  const total = holders.data?.total ?? skill.playerCount;
  const allCards = catalogue.data?.total;
  const share = allCards ? `${((total / allCards) * 100).toFixed(total / allCards < 0.1 ? 2 : 1)}%` : "—";

  return (
    <div className="space-y-8">
      {/* Breadcrumbs matching efootbase */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 list-none p-0 m-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/skills">
            Skills
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item text-white text-xs font-medium">{label}</li>
      </ol>

      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--color-text-primary)] tracking-tight">{label}</h1>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-3xl leading-relaxed">{skillDescription(skill)}</p>
        <div className="flex items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--color-panel)] border border-[var(--color-line)] text-xs font-semibold text-[var(--color-text-primary)]">
            {SKILL_GROUP_LABELS[group]}
          </span>
        </div>
      </div>

      {/* Metrics — all derived from PlayerSkill rows */}
      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-5 space-y-1">
          <dt className="text-xs text-[var(--color-text-secondary)]">Cards with this skill</dt>
          <dd className="text-2xl font-black text-[var(--color-text-primary)] font-mono tabular-nums">{total.toLocaleString("en-US")}</dd>
        </div>
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-5 space-y-1">
          <dt className="text-xs text-[var(--color-text-secondary)]">Share of all cards</dt>
          <dd className="text-2xl font-black text-[var(--color-text-primary)] font-mono tabular-nums">
            {share}
            {allCards !== undefined && (
              <span className="block text-[11px] font-normal text-[var(--color-text-dim)] font-sans">of {allCards.toLocaleString("en-US")} cards</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Holders — real cards that have the skill, best first */}
      <section className="space-y-4 pt-2" aria-labelledby="skill-top-cards">
        <h2 id="skill-top-cards" className="text-base font-bold text-[var(--color-text-primary)] tracking-tight">
          Top cards
        </h2>

        {holders.isError ? (
          <QueryErrorState error={holders.error} onRetry={() => void holders.refetch()} title="Could not load the cards with this skill" />
        ) : holders.isPending ? (
          <CardGridSkeleton count={16} className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3" />
        ) : total === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-[var(--color-text-dim)]">
            No cards have this skill.
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 ${holders.isPlaceholderData ? "opacity-60" : ""}`}
              aria-busy={holders.isPlaceholderData}
            >
              {holders.data.items.map((p) => (
                <PlayerCard key={p.id} player={p} showName />
              ))}
            </div>
            <Pagination page={page} totalPages={holders.data.totalPages} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
