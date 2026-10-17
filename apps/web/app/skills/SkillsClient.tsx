"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import type { SkillDTO } from "@eflab/shared";
import { Sparkles } from "lucide-react";

// Skills index (design decision 13): every number comes from the API —
// `playerCount` is the grouped PlayerSkill count, share = count / all cards,
// and the "top cards" of the Premium group are real holders (skill.players,
// ovr DESC). Nothing is synthesised: no rarity, rank, stat-boost or
// "Showtime" heuristics — the only grouping is the stored `category`.
const PREMIUM_CATEGORY = "Premium";
const ALL = "ALL";

function shareOf(count: number, total: number | undefined): string {
  if (!total) return "—";
  const pct = (count / total) * 100;
  return `${pct < 10 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}

function SkillTopCards({ slug }: { slug: string }) {
  const q = trpc.skill.players.useQuery({ slug, page: 1, limit: 4 }, { staleTime: 60 * 60_000 });
  if (q.isError) {
    return (
      <button type="button" onClick={() => void q.refetch()} className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer">
        Could not load top cards — retry
      </button>
    );
  }
  const items = q.data?.items ?? [];
  // Four thumbnails that SHRINK with the column: each flex item (`flex-1
  // min-w-0`, capped at 64px) narrows when the column is tighter — a 320px
  // viewport leaves 256px inside the article — so this row never sets a
  // min-content width that pushes the skill grid past the viewport. The
  // wrapper div is the flex item because PlayerCard's outer element is its
  // block `<a class="card-link">`, which would otherwise size to its content.
  return (
    <div className="flex items-start gap-2" aria-busy={q.isPending}>
      {q.isPending
        ? [...Array(4)].map((_, i) => <div key={i} className="flex-1 min-w-0 max-w-16 aspect-[240/339] rounded-md bg-[var(--color-elevated)] animate-pulse" />)
        : items.map((card) => (
            <div key={card.id} className="flex-1 min-w-0 max-w-16">
              <PlayerCard player={card} size="full" />
            </div>
          ))}
    </div>
  );
}

function SkillCard({ skill, total, premium }: { skill: SkillDTO; total: number | undefined; premium: boolean }) {
  const empty = skill.playerCount === 0;
  return (
    <article className="min-w-0 rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/50 p-4 space-y-3 flex flex-col justify-between hover:border-[var(--color-line-active)] transition-colors">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-sm text-[var(--color-text-primary)]">
            <Link href={`/skills/${skill.slug}`} className="hover:text-[var(--color-accent)] transition-colors">
              {skill.name}
            </Link>
          </h3>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-line)] shrink-0">
            {skill.category}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] leading-snug line-clamp-3">{skill.description}</p>
        <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-dim)] tabular-nums">
          <span className={empty ? "text-[var(--color-text-dim)]" : "text-white"}>{skill.playerCount.toLocaleString("en-US")} cards</span>
          <span aria-hidden>·</span>
          <span>{shareOf(skill.playerCount, total)} of all cards</span>
        </div>
      </div>

      {premium && (
        <div className="pt-3 border-t border-[var(--color-line)]/60 space-y-2">
          <div className="text-[11px] font-medium text-[var(--color-text-dim)]">Top cards</div>
          {empty ? <p className="text-[11px] text-[var(--color-text-dim)] italic">No cards have this skill.</p> : <SkillTopCards slug={skill.slug} />}
        </div>
      )}

      <Link
        href={`/skills/${skill.slug}`}
        className="block w-full py-1.5 text-center text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg bg-[var(--color-elevated)]/40 hover:bg-[var(--color-elevated)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        {empty ? "Details" : `View all ${skill.playerCount.toLocaleString("en-US")} cards`}
      </Link>
    </article>
  );
}

export function SkillsClient() {
  const [activeTab, setActiveTab] = useState<string>(ALL);
  const skillsQuery = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });
  const catalogue = trpc.player.list.useQuery({ page: 1, limit: 1 }, { staleTime: 60 * 60_000 });
  const totalCards = catalogue.data?.total;

  const skills = useMemo(() => skillsQuery.data ?? [], [skillsQuery.data]);
  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of skills) seen.set(s.category, (seen.get(s.category) ?? 0) + 1);
    // Premium first (efootbase leads with its premium skills), then alphabetical.
    return Array.from(seen.entries()).sort(([a], [b]) =>
      a === PREMIUM_CATEGORY ? -1 : b === PREMIUM_CATEGORY ? 1 : a.localeCompare(b),
    );
  }, [skills]);
  const visibleCategories = activeTab === ALL ? categories : categories.filter(([c]) => c === activeTab);
  const totalHolders = skills.reduce((acc, s) => acc + s.playerCount, 0);

  const tabClass = (selected: boolean) =>
    `button button--sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
      selected ? "bg-[var(--color-accent)] text-black font-bold" : "button--secondary text-[var(--color-text-secondary)] hover:text-white"
    }`;

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
        <li className="breadcrumbs__item text-white text-xs font-medium">Skills</li>
      </ol>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">Skills</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] max-w-3xl leading-relaxed">
          Every eFootball skill in one place, with how many cards carry it and the top cards that have it.
        </p>
      </div>

      {skillsQuery.isSuccess && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium">
            <Sparkles className="size-3.5 text-[var(--color-accent)]" aria-hidden /> {skills.length} skills
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium tabular-nums">
            {totalHolders.toLocaleString("en-US")} card-skill assignments
          </span>
          {totalCards !== undefined && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-white font-medium tabular-nums">
              {totalCards.toLocaleString("en-US")} cards
            </span>
          )}
        </div>
      )}

      {skillsQuery.isError ? (
        <QueryErrorState error={skillsQuery.error} onRetry={() => void skillsQuery.refetch()} title="Could not load skills" />
      ) : skillsQuery.isPending ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" aria-busy="true" aria-label="Loading skills">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-[var(--color-panel)]/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Category tabs */}
          <div role="tablist" aria-label="Skill categories" className="flex flex-wrap items-center gap-2 pt-1">
            <button role="tab" type="button" aria-selected={activeTab === ALL} aria-controls="skills-panel" onClick={() => setActiveTab(ALL)} className={tabClass(activeTab === ALL)}>
              All ({skills.length})
            </button>
            {categories.map(([category, count]) => (
              <button
                key={category}
                role="tab"
                type="button"
                aria-selected={activeTab === category}
                aria-controls="skills-panel"
                onClick={() => setActiveTab(category)}
                className={tabClass(activeTab === category)}
              >
                {category} ({count})
              </button>
            ))}
          </div>

          <div id="skills-panel" role="tabpanel" className="space-y-10">
            {visibleCategories.map(([category, count]) => (
              <section key={category} className="space-y-4" aria-labelledby={`skills-${category}`}>
                <h2 id={`skills-${category}`} className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
                  {category} <span className="text-sm font-normal text-[var(--color-text-dim)]">({count})</span>
                </h2>
                <div className={`grid gap-3 sm:grid-cols-2 ${category === PREMIUM_CATEGORY ? "lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"}`}>
                  {skills
                    .filter((s) => s.category === category)
                    .map((s) => (
                      <SkillCard key={s.id} skill={s} total={totalCards} premium={category === PREMIUM_CATEGORY} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
