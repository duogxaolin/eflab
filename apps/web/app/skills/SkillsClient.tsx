"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import { SKILL_GROUP_LABELS, SKILL_GROUP_ORDER, compareSkills, skillDescription, skillGroup, skillLabel, type SkillGroup } from "@/lib/skill-labels";
import type { SkillDTO } from "@eflab/shared";
import { Sparkles } from "lucide-react";

// Skills index (efootbase-parity-round2 "Skills Grouping"): every number comes
// from the API — `playerCount` is the grouped PlayerSkill count, share = count
// / all cards, and the "top cards" of the Showtime group are real holders
// (skill.players, ovr DESC). The grouping and the display labels are the
// web-only table in lib/skill-labels.ts (verified against efootbase's skill
// list); nothing is synthesised — no rarity, rank or stat boosts, and no
// invented tier label.
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

function SkillCard({ skill, total, showTopCards }: { skill: SkillDTO; total: number | undefined; showTopCards: boolean }) {
  const empty = skill.playerCount === 0;
  const label = skillLabel(skill);
  return (
    <article className="min-w-0 rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/50 p-4 space-y-3 flex flex-col justify-between hover:border-[var(--color-line-active)] transition-colors">
      <div className="space-y-2">
        <h3 className="font-bold text-sm text-[var(--color-text-primary)]">
          <Link href={`/skills/${skill.slug}`} className="hover:text-[var(--color-accent)] transition-colors">
            {label}
          </Link>
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)] leading-snug line-clamp-3">{skillDescription(skill)}</p>
        <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--color-text-dim)] tabular-nums">
          <span className={empty ? "text-[var(--color-text-dim)]" : "text-white"}>{skill.playerCount.toLocaleString("en-US")} cards</span>
          <span aria-hidden>·</span>
          <span>{shareOf(skill.playerCount, total)} of all cards</span>
        </div>
      </div>

      {showTopCards && (
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
  const [activeTab, setActiveTab] = useState<SkillGroup | typeof ALL>(ALL);
  const skillsQuery = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });
  const catalogue = trpc.player.list.useQuery({ page: 1, limit: 1 }, { staleTime: 60 * 60_000 });
  const totalCards = catalogue.data?.total;

  // Showtime first, then Classic, both in efootbase's order; the fixture
  // entries efootbase does not list (all with 0 holders) come last.
  const groups = useMemo(() => {
    const sorted = [...(skillsQuery.data ?? [])].sort(compareSkills);
    return SKILL_GROUP_ORDER.map((group) => ({ group, skills: sorted.filter((s) => skillGroup(s.slug) === group) })).filter((g) => g.skills.length > 0);
  }, [skillsQuery.data]);
  const skills = skillsQuery.data ?? [];
  const visibleGroups = activeTab === ALL ? groups : groups.filter((g) => g.group === activeTab);
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
          Every eFootball skill in one place — Showtime skills with the top cards that carry them, plus all classic skills.
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
          {/* Group tabs */}
          <div role="tablist" aria-label="Skill groups" className="flex flex-wrap items-center gap-2 pt-1">
            <button role="tab" type="button" aria-selected={activeTab === ALL} aria-controls="skills-panel" onClick={() => setActiveTab(ALL)} className={tabClass(activeTab === ALL)}>
              All ({skills.length})
            </button>
            {groups.map(({ group, skills: list }) => (
              <button
                key={group}
                role="tab"
                type="button"
                aria-selected={activeTab === group}
                aria-controls="skills-panel"
                onClick={() => setActiveTab(group)}
                className={tabClass(activeTab === group)}
              >
                {SKILL_GROUP_LABELS[group]} ({list.length})
              </button>
            ))}
          </div>

          <div id="skills-panel" role="tabpanel" className="space-y-10">
            {visibleGroups.map(({ group, skills: list }) => (
              <section key={group} className="space-y-4" aria-labelledby={`skills-${group}`}>
                <h2 id={`skills-${group}`} className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
                  {SKILL_GROUP_LABELS[group]} <span className="text-sm font-normal text-[var(--color-text-dim)]">({list.length})</span>
                </h2>
                {group === "other" && (
                  <p className="text-xs text-[var(--color-text-secondary)] max-w-3xl">
                    Catalogue entries that are not part of the game&apos;s skill list (AI playing styles, motion styles and set-piece variants); no card carries them.
                  </p>
                )}
                <div className={`grid gap-3 sm:grid-cols-2 ${group === "showtime" ? "lg:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-4"}`}>
                  {list.map((s) => (
                    <SkillCard key={s.id} skill={s} total={totalCards} showTopCards={group === "showtime"} />
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
