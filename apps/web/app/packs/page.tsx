"use client";
import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import type { CardPreview } from "@eflab/shared";
import { Zap, Users, Package } from "lucide-react";

type PackType = "all" | "special_list" | "pack";

export default function PacksPage() {
  const [type, setType] = useState<PackType>("all");
  const packs = trpc.pack.list.useQuery({ type });
  const packList = packs.data ?? [];

  // Fetch real players for each pack (React Query auto-caches per id).
  // We render one PackSection per pack; each issues its own byId query.
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
          <span>📦</span> 24 packs
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
          <span>👥</span> 189 players
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-text-dim)] font-mono">
          <span>🕒</span> Last updated 2 days ago
        </span>
      </div>

      {/* Type Filter Pills (efootbase style) */}
      <div className="flex items-center gap-2 pt-1">
        {([
          { key: "all", label: "All", icon: Zap },
          { key: "special_list", label: "Special List", icon: Package },
          { key: "pack", label: "Packs", icon: Users },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setType(t.key)}
            className={`button button--sm transition-colors ${
              type === t.key
                ? "bg-[var(--color-accent)] text-black font-bold"
                : "button--secondary text-[var(--color-text-secondary)] hover:text-white"
            }`}
          >
            <t.icon className="size-3 mr-1.5" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Pack Rows (efootbase verbatim style: Pack Name left, Date right, 8-col grid of cards) */}
      {packs.isLoading ? (
        <div className="space-y-8 pt-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-[var(--color-panel)]/40 animate-pulse" />
          ))}
        </div>
      ) : packList.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">No packs match the selected filter.</p>
          <button
            onClick={() => setType("all")}
            className="mt-3 px-4 py-1.5 rounded-full bg-[var(--color-accent)] text-[var(--color-accent-foreground)] text-xs font-bold"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div className="space-y-10 pt-4">
          {packList.slice(0, 24).map((pack) => (
            <PackSection key={pack.id} packId={pack.id} packName={pack.name} releaseDate={pack.releaseDate} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One pack section: header (name + date) + 8-col grid of REAL players from that pack. */
function PackSection({
  packId,
  packName,
  releaseDate,
}: {
  packId: string;
  packName: string;
  releaseDate: string;
}) {
  const q = trpc.pack.byId.useQuery({ id: packId });
  const cards = q.data?.cards ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-xs border-b border-[var(--color-line)]/60 pb-2">
        <Link
          href={`/packs/${packId}`}
          className="font-bold text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
        >
          {packName}
        </Link>
        <span className="font-mono text-[var(--color-text-dim)] text-xs">
          {new Date(releaseDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </div>

      {/* 8-column Grid of REAL Cards inside this pack */}
      {q.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-[240/339] rounded-xl bg-[var(--color-panel)]/60 animate-pulse" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="text-xs text-[var(--color-text-dim)] py-4 text-center">No players in this pack.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {cards.map((p) => (
            <PlayerCard key={p.id} player={p as CardPreview} showName />
          ))}
        </div>
      )}
    </section>
  );
}
