"use client";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";

// /packs — efootbase-aligned flat listing of the featured bundles (24 in the
// 2026-10 data: 17 specialPlayerList + 7 spotlight packs). Source: FeaturedBundle
// table seeded from dump/efootbase/packs.json. efootbase /packs has NO filter
// UI — a header ("24 packs · 189 players") + one section per bundle in
// releaseDate DESC order, each linking to its bundle page by slug.
export function PacksClient() {
  const bundlesQuery = trpc.featured.list.useQuery();
  const list = [...(bundlesQuery.data ?? [])].sort(
    (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime() || a.position - b.position,
  );
  const totalPlayers = list.reduce((acc, b) => acc + b.cards.length, 0);

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
        <li className="breadcrumbs__item text-white text-xs font-medium">Packs</li>
      </ol>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">Packs</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
          Explore the latest player packs in eFootball.
        </p>
      </div>

      {bundlesQuery.isSuccess && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
            <span aria-hidden>📦</span> {list.length} packs
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
            <span aria-hidden>👥</span> {totalPlayers} players
          </span>
        </div>
      )}

      {bundlesQuery.isError ? (
        <QueryErrorState error={bundlesQuery.error} onRetry={() => void bundlesQuery.refetch()} title="Could not load packs" />
      ) : bundlesQuery.isPending ? (
        <div className="space-y-8 pt-4" aria-busy="true" aria-label="Loading packs">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-[var(--color-panel)]/40 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-[var(--color-text-dim)]">
          No packs have been published yet.
        </div>
      ) : (
        <div className="space-y-10 pt-4">
          {list.map((bundle) => (
            <section key={bundle.id} className="space-y-3" aria-labelledby={`bundle-${bundle.id}`}>
              <div className="flex items-center justify-between gap-3 text-xs border-b border-[var(--color-line)]/60 pb-2">
                <Link
                  id={`bundle-${bundle.id}`}
                  href={`/packs/${bundle.slug}`}
                  className="font-bold text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors truncate"
                >
                  {bundle.name}
                </Link>
                <span className="font-mono text-[var(--color-text-dim)] text-xs shrink-0">
                  <time dateTime={bundle.releaseDate}>{formatUtcDate(bundle.releaseDate)}</time>
                  {" · "}
                  {bundle.cards.length} cards
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {bundle.cards.map((p) => (
                  <PlayerCard key={p.id} player={p} showName />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
