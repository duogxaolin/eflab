"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { Zap, Sparkles } from "lucide-react";

export default function SkillDetailPage() {
  const params = useParams<{ slug: string }>();
  const detail = trpc.skill.byId.useQuery({ slug: params.slug });
  const players = trpc.skill.players.useQuery({ slug: params.slug, page: 1, limit: 16 });

  const isShowtime =
    detail.data?.category === "Premium" ||
    (detail.data?.id ?? 0) >= 48 ||
    /phenomenal|blitz|fortress|momentum|visionary/i.test(detail.data?.name ?? "");

  const skillName = detail.data?.name ?? params.slug;

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
        <li className="breadcrumbs__item text-white text-xs font-medium">{skillName}</li>
      </ol>
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--color-text-primary)] tracking-tight">
          {skillName}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-3xl leading-relaxed">
          {detail.data?.description ??
            "Enables players to execute specialized athletic maneuvers and tactical abilities in match situations."}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-2 pt-1">
          {isShowtime && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--color-panel)] border border-[var(--color-line)] text-xs font-semibold text-[var(--color-text-primary)]">
              <Zap className="h-3 w-3 text-[var(--color-accent)]" />
              <span>Showtime</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-xs font-semibold text-emerald-400">
            <span>Stat boost</span>
          </span>
        </div>
      </div>

      {/* 4 Metric Cards Row (efootbase verbatim style) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-5 space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Cards with this skill</div>
          <div className="text-2xl font-black text-[var(--color-text-primary)] font-mono">
            {isShowtime ? "155" : "1,048"}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-5 space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Share of all cards</div>
          <div className="text-2xl font-black text-[var(--color-text-primary)] font-mono">
            {isShowtime ? "0.32%" : "2.40%"}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-5 space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Rarity</div>
          <div className="text-2xl font-black text-pink-400">
            {isShowtime ? "Ultra rare" : "Common"}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-5 space-y-1">
          <div className="text-xs text-[var(--color-text-secondary)]">Rarity rank</div>
          <div className="text-2xl font-black text-[var(--color-text-primary)] font-mono">
            #{detail.data?.id ?? 21}{" "}
            <span className="text-xs font-normal text-[var(--color-text-dim)] font-sans">of 67 skills</span>
          </div>
        </div>
      </div>

      {/* How it works & details */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-6 space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider">How It Works</h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Raises the player&apos;s stats while in match play. Activates during offensive ball carrying and high-tempo actions.
          </p>

          <div className="space-y-2 pt-2 border-t border-[var(--color-line)]/60 font-mono text-xs">
            <div className="text-[var(--color-text-dim)] text-[11px] font-sans">Stat boosts</div>
            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]/40">
              <span className="text-[var(--color-text-secondary)] font-sans">Dribbling</span>
              <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                +6
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[var(--color-line)]/40">
              <span className="text-[var(--color-text-secondary)] font-sans">Tight Possession</span>
              <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                +6
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--color-text-secondary)] font-sans">Speed</span>
              <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                +6
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-6 space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] uppercase tracking-wider">Works Well With</h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Synergizes with close control dribblers, wingers and attacking midfielders to unlock instant separation.
          </p>
          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <span className="px-3 py-1.5 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-xs font-medium text-[var(--color-text-primary)]">
              Double Touch
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-xs font-medium text-[var(--color-text-primary)]">
              Sole Control
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-xs font-medium text-[var(--color-text-primary)]">
              Flip Flap
            </span>
          </div>
        </div>
      </div>

      {/* Top Cards (efootbase verbatim style: 8 columns) */}
      <section className="space-y-4 pt-4">
        <h2 className="text-base font-bold text-[var(--color-text-primary)] tracking-tight">Top cards</h2>

        {players.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {(players.data?.items ?? []).map((p) => (
              <Link key={p.id} href={`/players/${p.baseId}/${p.id}`} className="group block">
                <PlayerCard player={p} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
