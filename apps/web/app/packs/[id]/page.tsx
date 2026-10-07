"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import type { CardPreview } from "@eflab/shared";

export default function PackDetailPage() {
  const params = useParams<{ id: string }>();
  const q = trpc.pack.byId.useQuery({ id: params.id });

  if (q.isLoading) {
    return (
      <div className="h-64 rounded-xl bg-[var(--color-panel)] animate-pulse flex items-center justify-center text-xs text-[var(--color-text-dim)]">
        Loading pack details…
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className="p-12 text-center rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] text-sm text-[var(--color-text-dim)]">
        Pack not found.
      </div>
    );
  }

  const p = q.data;

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
        <li className="breadcrumbs__item text-white text-xs font-medium">{p.name}</li>
      </ol>

      {/* Pack Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">{p.name}</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
          {p.playerCount} player cards · Released{" "}
          {new Date(p.releaseDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* 8-Column Card Grid */}
      <div className="grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
        {p.cards.map((c) => (
          <PlayerCard key={c.id} player={c as CardPreview} showName />
        ))}
      </div>
    </div>
  );
}
