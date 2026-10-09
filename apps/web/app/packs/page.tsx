"use client";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";

// /packs page — efootbase-aligned flat listing of the 24 featured bundles
// (17 specialPlayerList + 7 spotlight packs). Source: FeaturedBundle table,
// seeded from dump/efootbase/packs.json. efootbase /packs has NO filter UI —
// just a header ("24 packs · 189 players · last updated") + 24 sections in
// releaseDate DESC order. Each section: bundle name + date + ordered card grid.
export default function PacksPage() {
  const { data: bundles, isLoading } = trpc.featured.list.useQuery();
  const list = bundles ?? [];

  // Aggregate player/pack counts for the meta chips (matches efootbase header).
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

      {/* Title & Subtitle */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">Packs</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
          Explore the latest player packs in eFootball.
        </p>
      </div>

      {/* Meta Chips matching efootbase */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
          <span>📦</span> {list.length} packs
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
          <span>👥</span> {totalPlayers} players
        </span>
      </div>

      {/* Bundle sections (efootbase order: releaseDate DESC, position ASC) */}
      {isLoading ? (
        <div className="space-y-8 pt-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-[var(--color-panel)]/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-10 pt-4">
          {list.map((bundle) => (
            <section key={bundle.id} className="space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-[var(--color-line)]/60 pb-2">
                <span className="font-bold text-sm text-[var(--color-text-primary)]">
                  {bundle.name}
                </span>
                <span className="font-mono text-[var(--color-text-dim)] text-xs">
                  {new Date(bundle.releaseDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
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
