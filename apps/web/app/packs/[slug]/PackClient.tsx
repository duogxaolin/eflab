"use client";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";
import type { FeaturedBundleDTO } from "@eflab/shared";

export function PackClient({ slug, initialData }: { slug: string; initialData: FeaturedBundleDTO }) {
  const q = trpc.featured.bySlug.useQuery({ slug }, { initialData });

  if (q.isError) {
    return <QueryErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load this pack" />;
  }
  const bundle = q.data ?? initialData;

  return (
    <div className="space-y-6">
      {/* Breadcrumbs matching efootbase */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 list-none p-0 m-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/packs">
            Packs
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item text-white text-xs font-medium">{bundle.name}</li>
      </ol>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">{bundle.name}</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
          {bundle.cards.length} player cards · Released{" "}
          <time dateTime={bundle.releaseDate}>{formatUtcDate(bundle.releaseDate)}</time>
        </p>
      </div>

      {bundle.cards.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-[var(--color-text-dim)]">
          This pack has no cards.
        </div>
      ) : (
        // Cards in efootbase display order (FeaturedBundleCard.ordinal).
        <div className="grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
          {bundle.cards.map((c) => (
            <PlayerCard key={c.id} player={c} showName />
          ))}
        </div>
      )}
    </div>
  );
}
