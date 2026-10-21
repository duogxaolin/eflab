"use client";
import Link from "next/link";
import { CalendarDays, Layers, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";
import type { FeaturedBundleDTO } from "@eflab/shared";
import { PACK_GRID } from "../pack-grid";

// One featured bundle (not in the reference capture): the /packs header and
// grid — H1 36/40, stat chips with our counts (cards, distinct players, the
// UTC release date), the 4 / 5 / 6 / 7 / 8 column grid with "styles" captions.
export function PackClient({ slug, initialData }: { slug: string; initialData: FeaturedBundleDTO }) {
  const q = trpc.featured.bySlug.useQuery({ slug }, { initialData });

  if (q.isError) {
    return <QueryErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load this pack" />;
  }
  const bundle = q.data ?? initialData;
  const players = new Set(bundle.cards.map((c) => c.baseId)).size;

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
          <Link className="breadcrumbs__link hit-44" href="/packs">
            Packs
          </Link>
          <span className="breadcrumbs__separator" aria-hidden>
            ›
          </span>
        </li>
        <li className="breadcrumbs__item" aria-current="page">
          {bundle.name}
        </li>
      </ol>

      <h1 className="efb-h1 text-[var(--color-text-primary)]">{bundle.name}</h1>
      <ul className="mt-3 flex list-none flex-wrap items-center gap-2 p-0" aria-label="Pack details">
        <li className="efb-stat-chip">
          <Layers className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
          {bundle.cards.length} {bundle.cards.length === 1 ? "card" : "cards"}
        </li>
        <li className="efb-stat-chip">
          <Users className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
          {players} {players === 1 ? "player" : "players"}
        </li>
        <li className="efb-stat-chip">
          <CalendarDays className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
          Released <time dateTime={bundle.releaseDate}>{formatUtcDate(bundle.releaseDate)}</time>
        </li>
      </ul>

      {bundle.cards.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-[var(--color-panel)] p-12 text-center text-xs text-[var(--color-text-secondary)]">This pack has no cards.</div>
      ) : (
        // Cards in the source's display order (FeaturedBundleCard.ordinal).
        <div className={`mt-6 ${PACK_GRID}`}>
          {bundle.cards.map((c) => (
            <PlayerCard key={c.id} player={c} caption="styles" />
          ))}
        </div>
      )}
    </div>
  );
}
