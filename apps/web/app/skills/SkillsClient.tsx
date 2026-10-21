"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleDashed, ListChecks, Search, Sparkles, X, Zap, type LucideIcon } from "lucide-react";
import { normalizeSearchQuery, type SkillDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { QueryErrorState } from "@/lib/query-state";
import { SectionHeader, type SectionTone } from "@/components/layout/SectionHeader";
import { SKILL_GROUP_LABELS, SKILL_GROUP_ORDER, compareSkills, skillDescription, skillGroup, skillLabel, type SkillSection } from "@/lib/skill-labels";

// Skills index (catalog-browsing-parity "Skills Grouping"; efootbase-ui-redesign
// design decision 12): tiles grouped Showtime / Classic / Other from the
// stored group, in the stored wiki order (`sortOrder`); the 5 unreleased
// skills never reach this page (the API hides them). Every number comes from
// the API — `playerCount` is the grouped PlayerSkill count. A search field
// filters the tiles by name (accent- and case-insensitive, the shared
// `normalizeSearchQuery`), a segmented control narrows to one group. The
// artwork, stat boosts, activation, share and top cards live on
// /skills/[slug]. Nothing is synthesised — no rarity, rank, leader or tier label.
const ALL = "ALL";

const GROUP_HEAD: Readonly<Record<SkillSection, { icon: LucideIcon; tone: SectionTone }>> = {
  showtime: { icon: Sparkles, tone: "gold" },
  classic: { icon: ListChecks, tone: "amber" },
  other: { icon: CircleDashed, tone: "neutral" },
};
/** Short group names for the segmented filter (section headings keep the long ones). */
const SEGMENT_LABELS: Readonly<Record<SkillSection, string>> = { showtime: "Showtime", classic: "Classic", other: "Other" };

function SkillTile({ skill, group }: { skill: SkillDTO; group: SkillSection }) {
  const label = skillLabel(skill);
  const count = skill.playerCount;
  const descId = `skill-desc-${skill.slug}`;
  return (
    <Link
      href={`/skills/${skill.slug}`}
      className="skill-tile"
      data-group={group}
      data-testid="skill-card"
      aria-label={`${label}, ${count.toLocaleString("en-US")} ${count === 1 ? "card" : "cards"}`}
      aria-describedby={descId}
    >
      <span className="skill-tile__name">{label}</span>
      <span id={descId} className="skill-tile__desc">
        {skillDescription(skill)}
      </span>
      <span className="skill-tile__footer">
        {/* Stored stat boosts only — never an invented one. */}
        {skill.effects.length > 0 && (
          <span className="skill-tile__chip skill-tile__chip--boost">
            <Zap className="size-3.5" aria-hidden />
            Stat boost
          </span>
        )}
        <span className="skill-tile__chip skill-tile__chip--count tabular-nums">
          {count.toLocaleString("en-US")} {count === 1 ? "card" : "cards"}
        </span>
      </span>
    </Link>
  );
}

export function SkillsClient() {
  const [activeGroup, setActiveGroup] = useState<SkillSection | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const skillsQuery = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });

  const needle = normalizeSearchQuery(query);
  // Showtime first, then Classic, both in the stored order; the entries
  // without a group (all with 0 holders) come last under "Other". The name
  // filter applies before grouping, so counts follow it.
  const groups = useMemo(() => {
    const sorted = [...(skillsQuery.data ?? [])].sort(compareSkills);
    const matching = needle ? sorted.filter((s) => normalizeSearchQuery(skillLabel(s)).includes(needle)) : sorted;
    return SKILL_GROUP_ORDER.map((group) => ({ group, skills: matching.filter((s) => skillGroup(s) === group) }));
  }, [skillsQuery.data, needle]);
  const nonEmpty = groups.filter((g) => g.skills.length > 0);
  const matchCount = nonEmpty.reduce((acc, g) => acc + g.skills.length, 0);
  const visibleGroups = activeGroup === ALL ? nonEmpty : nonEmpty.filter((g) => g.group === activeGroup);
  const visibleCount = visibleGroups.reduce((acc, g) => acc + g.skills.length, 0);
  // Groups present in the data at all (the segment keeps its items while a
  // search empties one of them, so the control does not jump around).
  const presentGroups = useMemo(
    () => SKILL_GROUP_ORDER.filter((group) => (skillsQuery.data ?? []).some((s) => skillGroup(s) === group)),
    [skillsQuery.data],
  );
  const countOf = (group: SkillSection) => groups.find((g) => g.group === group)?.skills.length ?? 0;

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
          Skills
        </li>
      </ol>

      <h1 className="efb-h1 text-[var(--color-text-primary)]">Skills</h1>
      <p className="efb-subtitle mt-2">
        Every eFootball skill in one place — Showtime and classic skills with the number of cards that carry each one. Open a skill for its artwork, stat boosts and top cards.
      </p>

      {skillsQuery.isError ? (
        <QueryErrorState error={skillsQuery.error} onRetry={() => void skillsQuery.refetch()} title="Could not load skills" className="mt-6" />
      ) : skillsQuery.isPending ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading skills">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-[var(--color-panel)]" />
          ))}
        </div>
      ) : (
        <>
          {/* Name search + group filter (one row from 768 px). */}
          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
            <form role="search" onSubmit={(e) => e.preventDefault()} className="min-w-0 flex-1">
              <div className="field field--lg field--outlined">
                <Search className="size-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search skills by name…"
                  aria-label="Search skills by name"
                  aria-controls="skills-results"
                  autoComplete="off"
                  className="field__input no-native-clear"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="hit-44 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-default)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </form>
            <div className="hide-scrollbar -mx-4 overflow-x-auto px-4 py-1.5 md:mx-0 md:px-0">
              <div role="group" aria-label="Skill group" className="segment p-1">
                <button type="button" aria-pressed={activeGroup === ALL} onClick={() => setActiveGroup(ALL)} className="segment__item hit-44">
                  All <span className="tabular-nums">{matchCount}</span>
                </button>
                {presentGroups.map((group) => (
                  <button key={group} type="button" aria-pressed={activeGroup === group} onClick={() => setActiveGroup(group)} className="segment__item hit-44">
                    {SEGMENT_LABELS[group]}{" "}
                    <span className="tabular-nums">{countOf(group)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="sr-only" role="status" aria-live="polite">
            {needle ? `${visibleCount} ${visibleCount === 1 ? "skill matches" : "skills match"} "${query.trim()}".` : ""}
          </p>

          <div id="skills-results" className="mt-7 space-y-7">
            {visibleGroups.length === 0 ? (
              <div className="rounded-2xl bg-[var(--color-panel)] p-8 text-center text-sm text-[var(--color-text-secondary)]">
                {needle ? (
                  <>
                    No skill name matches &quot;{query.trim()}&quot;
                    {activeGroup !== ALL ? ` in ${SKILL_GROUP_LABELS[activeGroup]}` : ""}.{" "}
                    <button type="button" onClick={() => setQuery("")} className="cursor-pointer text-[var(--color-accent)] hover:underline">
                      Clear search
                    </button>
                  </>
                ) : (
                  "No skills in this group."
                )}
              </div>
            ) : (
              visibleGroups.map(({ group, skills: list }) => (
                <section key={group} className="space-y-3" aria-labelledby={`skills-${group}`}>
                  <SectionHeader id={`skills-${group}`} title={SKILL_GROUP_LABELS[group]} icon={GROUP_HEAD[group].icon} tone={GROUP_HEAD[group].tone} size="lg" count={list.length} />
                  {group === "other" && (
                    <p className="max-w-3xl text-xs text-[var(--color-text-secondary)]">
                      Catalogue entries that are not part of the game&apos;s skill list (AI playing styles, motion styles and set-piece variants); no card carries them.
                    </p>
                  )}
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((s) => (
                      <SkillTile key={s.id} skill={s} group={group} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
