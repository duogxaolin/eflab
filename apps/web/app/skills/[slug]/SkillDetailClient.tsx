"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { Pagination } from "@/components/players/Pagination";
import { QueryErrorState, CardGridSkeleton } from "@/lib/query-state";
import type { SkillDTO } from "@eflab/shared";
import { SKILL_GROUP_LABELS, skillDescription, skillGroup, skillLabel } from "@/lib/skill-labels";
import { SkillIcon } from "@/components/skills/SkillIcon";
import { SkillEffects } from "@/components/skills/SkillEffects";

const PAGE_SIZE = 24;
/** Highest page `skill.players` accepts (its input schema). */
const MAX_PAGE = 10000;
/** Holder grid — the pack grid (4 / 5 / 6 / 7 / 8 columns), name captions. */
const HOLDER_GRID = "grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8";

/** `?page=` as written (a positive integer), or null when absent / invalid. */
function parsePageParam(raw: string | null): number | null {
  if (raw === null || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

// One skill (not in the reference capture; restyled with the tokens): the
// artwork (letterboxed, never cropped), name, description, group, stored stat
// boosts and activation, the real holder count and share, and the holders
// best first. Label, group, artwork, boosts and activation are stored data.
export function SkillDetailClient({ slug, initialData }: { slug: string; initialData: SkillDTO }) {
  const detail = trpc.skill.byId.useQuery({ slug }, { initialData });
  const skill = detail.data ?? initialData;
  const label = skillLabel(skill);
  const group = skillGroup(skill);
  // The top-cards page lives in the URL (`?page=N`, page 1 omitted; efootbase-
  // behaviour-parity "Skills Search And URL State"). It is written with the
  // native history.replaceState, which Next keeps in sync with
  // useSearchParams, so turning a page re-renders this client page only
  // (router.replace would re-run the force-dynamic server page and its skill
  // fetch on every click).
  const searchParams = useSearchParams();
  const rawPage = searchParams.get("page");
  const requestedPage = parsePageParam(rawPage) ?? 1;
  const page = Math.min(requestedPage, MAX_PAGE);
  const setPage = useCallback((next: number) => {
    const url = new URL(window.location.href);
    if (next > 1) url.searchParams.set("page", String(next));
    else url.searchParams.delete("page");
    // `null` state: Next treats a state carrying its own internal markers as
    // its own call and would skip the useSearchParams sync.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  // "Page N does not exist — showing page M": set when a page past the end is
  // replaced by the last page, cleared by the next page turn.
  const [pageNotice, setPageNotice] = useState<{ requested: number; shown: number } | null>(null);
  const turnPage = (next: number) => {
    setPageNotice(null);
    setPage(next);
  };

  const holders = trpc.skill.players.useQuery({ slug, page, limit: PAGE_SIZE }, { placeholderData: (prev) => prev });
  const catalogue = trpc.player.list.useQuery({ page: 1, limit: 1 }, { staleTime: 60 * 60_000 });

  // A malformed `page` (or `page=1`) is rewritten to the canonical URL.
  useEffect(() => {
    if (rawPage !== null && (parsePageParam(rawPage) === null || parsePageParam(rawPage) === 1)) setPage(1);
  }, [rawPage, setPage]);

  // A page past the last one is replaced by the last page once the list has
  // answered for the current page (no skill holders → page 1).
  const settledLast = holders.data !== undefined && !holders.isPlaceholderData ? Math.max(1, holders.data.totalPages) : null;
  useEffect(() => {
    if (settledLast === null || requestedPage <= settledLast) return;
    setPage(settledLast);
    setPageNotice({ requested: requestedPage, shown: settledLast });
  }, [settledLast, requestedPage, setPage]);

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
        {/* Always mounted (polite live region); empty and room-less unless a
            page past the end was just replaced by the last page. */}
        <p role="status" className={pageNotice ? "text-xs text-[var(--color-accent-warn)]" : "sr-only"}>
          {pageNotice
            ? `Page ${pageNotice.requested.toLocaleString("en-US")} does not exist — showing page ${pageNotice.shown.toLocaleString("en-US")}.`
            : ""}
        </p>

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
            <Pagination page={page} totalPages={holders.data.totalPages} onChange={turnPage} />
          </>
        )}
      </section>
    </div>
  );
}
