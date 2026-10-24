"use client";
import Link from "next/link";
import { Clock, Layers, Package, Users } from "lucide-react";
import { releaseAgeLabel, type FeaturedListDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";
import { PACK_GRID } from "./pack-grid";

// /packs — flat listing of the featured bundles (24 in the 2026-10 data:
// specialPlayerList + spotlight packs), FeaturedBundle table seeded from the
// dump's packs.json. No filter UI: a plain-text header with stat chips (no
// emoji) + one section per bundle, each title linking to its bundle page by
// slug.
//
// Order (change efootbase-function-parity "Packs Order And Last Updated",
// survey 2026-10-23 S3 §3): the stored `position` — the current packs newest
// first, then the manager and player spotlights newest first (two groups, so
// "Worldwide Sep '26" sits above "Jürgen Klopp"), never one date sort.
//
// Chips: "packs"; "players" counts distinct base players across all bundles (a
// player featured in two bundles, or with two cards, counts once); "cards"
// counts card rows — never relabelled as players (eFootLab's honest counts,
// owner decision); then "Last updated <age>", the age of the newest card
// release in whole UTC days from `todayUtc` — the request's UTC day, passed
// by the server page so server and client print the same text.

export function PacksClient({ todayUtc, initialData }: { todayUtc: string; initialData?: FeaturedListDTO }) {
  const bundlesQuery = trpc.featured.list.useQuery(undefined, { initialData });
  const list = [...(bundlesQuery.data?.bundles ?? [])].sort((a, b) => a.position - b.position);
  const totalCards = list.reduce((acc, b) => acc + b.cards.length, 0);
  const totalPlayers = new Set(list.flatMap((b) => b.cards.map((c) => c.baseId))).size;
  const newestRelease = bundlesQuery.data?.newestCardRelease ?? null;
  const updatedAge = newestRelease ? releaseAgeLabel(todayUtc, newestRelease) : null;

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
        <li className="breadcrumbs__item" aria-current="page">
          Packs
        </li>
      </ol>

      <h1 className="efb-h1 text-[var(--color-text-primary)]">Packs</h1>
      <p className="efb-subtitle mt-3">Explore the latest player packs in eFootball.</p>

      {bundlesQuery.isSuccess && (
        <ul className="mt-3 flex list-none flex-wrap items-center gap-2 p-0" aria-label="Pack totals">
          <li className="efb-stat-chip">
            <Package className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
            {list.length} packs
          </li>
          <li className="efb-stat-chip">
            <Users className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
            {totalPlayers} players
          </li>
          <li className="efb-stat-chip">
            <Layers className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
            {totalCards} cards
          </li>
          {newestRelease && updatedAge && (
            <li className="efb-stat-chip">
              <Clock className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
              <span>
                Last updated <time dateTime={newestRelease}>{updatedAge}</time>
              </span>
            </li>
          )}
        </ul>
      )}

      {bundlesQuery.isError ? (
        <QueryErrorState error={bundlesQuery.error} onRetry={() => void bundlesQuery.refetch()} title="Could not load packs" className="mt-8" />
      ) : bundlesQuery.isPending ? (
        <div className="mt-8 space-y-6" aria-busy="true" aria-label="Loading packs">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-[var(--color-panel)]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-[var(--color-panel)] p-12 text-center text-xs text-[var(--color-text-secondary)]">No packs have been published yet.</div>
      ) : (
        <div className="mt-8 space-y-6">
          {list.map((bundle) => (
            <section key={bundle.id} aria-labelledby={`bundle-${bundle.id}`}>
              {/* Baseline header: title 14/500 (a link to the pack page) and
                  the 12 px muted date at the right, 8 px above the grid. */}
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="efb-pack-title min-w-0">
                  <Link id={`bundle-${bundle.id}`} href={`/packs/${bundle.slug}`} className="efb-pack-title__link hit-44">
                    <span className="efb-pack-title__text">{bundle.name}</span>
                  </Link>
                </h2>
                <time dateTime={bundle.releaseDate} className="shrink-0 text-xs text-[var(--color-text-secondary)]">
                  {formatUtcDate(bundle.releaseDate)}
                </time>
              </div>

              <div className={PACK_GRID}>
                {bundle.cards.map((p) => (
                  <PlayerCard key={p.id} player={p} caption="styles" />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
