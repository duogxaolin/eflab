"use client";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ListChecks, Search, Sparkles, X, Zap, type LucideIcon } from "lucide-react";
import { labelSearchKey, type SkillDTO, type SkillGroup } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { QueryErrorState } from "@/lib/query-state";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { playerCardDynamicUrl } from "@/lib/r2-images";
import { useImageVersion } from "@/lib/image-version";
import { SectionHeader, type SectionTone } from "@/components/layout/SectionHeader";
import { SKILL_GROUP_LABELS, compareSkills, skillDescription, skillLabel } from "@/lib/skill-labels";

// Skills index at /wiki/skills (catalog-browsing-parity "Skills Grouping";
// change efootbase-function-parity, design D12 — /skills answers 308 here):
// the Showtime and Classic tiles from the stored group, in the stored wiki
// order (`sortOrder`). Catalogue entries without a group (no card carries
// them) are not listed — their page still opens by direct link — and the 5
// unreleased skills never reach this page (the API hides them). Every number
// comes from the API: `playerCount` is the grouped PlayerSkill count and
// `leader` the holder with the highest max overall (ties: the higher card
// id). A search field filters the tiles by name (accent-, case- and
// separator-insensitive, see `skillSearchKey`), a segmented control narrows
// to one group; both live in the URL (`group`, `q`; written with replace, the
// defaults omitted, an unknown or the former `group=other` dropped) and come
// back on reload (efootbase-behaviour-parity "Skills Search And URL State").
// From 1024 px a wiki rail holds the page ("Skills") and the in-page links
// "Showtime Skills" (#showtime) / "Classic Skills" (#classic). The artwork,
// stat boosts, rarity rank and top cards live on /wiki/skills/<slug>.
const ALL = "ALL";
/** The groups the index lists, in page order. */
const INDEX_GROUPS: readonly SkillGroup[] = ["showtime", "classic"];
type GroupFilter = SkillGroup | typeof ALL;

/** `?group=` value → the segment (anything else, `other` included = All). */
function parseGroup(raw: string | null): GroupFilter {
  return raw !== null && (INDEX_GROUPS as readonly string[]).includes(raw) ? (raw as SkillGroup) : ALL;
}

/** Hyphens, dashes, slashes and underscores read as spaces, so "one touch"
 *  finds "One-touch Pass"; accents and case are folded. The same key is built
 *  for the query and for each name — the shared `labelSearchKey`, also used by
 *  the `/players` picker dialogs. */
const skillSearchKey = labelSearchKey;

const GROUP_HEAD: Readonly<Record<SkillGroup, { icon: LucideIcon; tone: SectionTone }>> = {
  showtime: { icon: Sparkles, tone: "gold" },
  classic: { icon: ListChecks, tone: "amber" },
};
/** Short group names for the segmented filter (section headings keep the long ones). */
const SEGMENT_LABELS: Readonly<Record<SkillGroup, string>> = { showtime: "Showtime", classic: "Classic" };

/** Wiki rail (from 1024 px, sticky): the page itself and its two sections.
 *  `onSection` (the loaded page) handles a section that the group filter or
 *  the search has hidden; without it (the loading fallback) the links are
 *  plain in-page links. */
export function SkillsRail({ onSection }: { onSection?: (group: SkillGroup, e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <nav aria-label="Wiki" className="wiki-rail" data-testid="wiki-rail">
      <p className="wiki-rail__label">Wiki</p>
      <ul className="wiki-rail__list">
        <li>
          <Link href="/wiki/skills" className="wiki-rail__link" aria-current="page">
            <span className="wiki-rail__icon wiki-rail__icon--current" aria-hidden>
              <Sparkles className="size-4" />
            </span>
            Skills
          </Link>
        </li>
      </ul>
      <p className="wiki-rail__label">Skills</p>
      <ul className="wiki-rail__list">
        {INDEX_GROUPS.map((group) => {
          const Icon = GROUP_HEAD[group].icon;
          return (
            <li key={group}>
              <a href={`#${group}`} className="wiki-rail__link" onClick={onSection ? (e) => onSection(group, e) : undefined}>
                <span className={`wiki-rail__icon wiki-rail__icon--${group}`} aria-hidden>
                  <Icon className="size-4" />
                </span>
                {SKILL_GROUP_LABELS[group]}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Breadcrumbs, H1 and intro — also the server-rendered fallback while the
 *  URL state is read (`app/wiki/skills/page.tsx`). */
export function SkillsIntro() {
  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol data-slot="breadcrumbs" className="breadcrumbs -ml-0.5 mb-3 list-none p-0">
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
      </nav>

      <h1 className="efb-h1 text-[var(--color-text-primary)]">Skills</h1>
      <p className="efb-subtitle mt-2">
        Every eFootball skill in one place — Showtime and classic skills with the number of cards that carry each one and the best card for it. Open a skill for its artwork, stat boosts, rarity and top cards.
      </p>
    </>
  );
}

/** The loading grid (also the Suspense fallback's body). */
export function SkillsSkeleton() {
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading skills">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-[var(--color-panel)]" />
      ))}
    </div>
  );
}

/** The page frame: the wiki rail beside the content from 1024 px. */
export function SkillsFrame({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className="wiki-layout">
      <div className="max-lg:hidden">{rail}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SkillTile({ skill, group }: { skill: SkillDTO; group: SkillGroup }) {
  const label = skillLabel(skill);
  const count = skill.playerCount;
  const countText = `${count.toLocaleString("en-US")} ${count === 1 ? "card" : "cards"}`;
  const leader = skill.leader;
  const imageVersion = useImageVersion();
  // Named by its content, in the order shown (WCAG 2.5.3 Label in Name,
  // change a11y-names-and-card-league): "Momentum Dribbling Stat boost
  // Allows players … Top card: Lionel Messi 160 cards" — the skill name, the
  // boost chip, the description, the leader (after a visually hidden "Top
  // card:") and the count. An aria-label could not say "top card" before the
  // leader's visible name without breaking the visible text's order.
  return (
    <Link href={`/wiki/skills/${skill.publicSlug}`} className="skill-tile" data-group={group} data-testid="skill-card" data-skill={skill.publicSlug}>
      <span className="skill-tile__head">
        <span className="skill-tile__name">{label}</span>
        {/* Stored stat boosts only — never an invented one. */}
        {skill.effects.length > 0 && (
          <span className="skill-tile__chip skill-tile__chip--boost">
            <Zap className="size-3.5" aria-hidden />
            Stat boost
          </span>
        )}
      </span>
      <span className="skill-tile__desc">{skillDescription(skill)}</span>
      <span className="skill-tile__footer">
        {/* Leader chip: the top holder's card face and name (inside the tile
            link — no nested link). */}
        {leader && (
          <span className="skill-tile__leader" data-testid="skill-leader" data-card-id={leader.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={playerCardDynamicUrl(leader.id, imageVersion)}
              alt=""
              width={16}
              height={22}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="skill-tile__leader-face"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            <span className="sr-only">Top card:</span>
            <span className="skill-tile__leader-name">{leader.name}</span>
          </span>
        )}
        <span className="skill-tile__chip skill-tile__chip--count tabular-nums">{countText}</span>
      </span>
    </Link>
  );
}

export function SkillsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawGroup = searchParams.get("group");
  const urlGroup = parseGroup(rawGroup);
  const urlQ = (searchParams.get("q") ?? "").trim();

  // Local state answers at once; the URL follows with replace (the search
  // text debounced). An outside URL change (a link to /wiki/skills?group=…)
  // is copied back into the state.
  const [activeGroup, setActiveGroup] = useState<GroupFilter>(urlGroup);
  const [query, setQuery] = useState(urlQ);
  const lastWritten = useRef<{ group: GroupFilter; q: string }>({ group: urlGroup, q: urlQ });
  // A rail link whose section was hidden: shown again, then focused.
  const [pendingSection, setPendingSection] = useState<SkillGroup | null>(null);

  const writeUrl = (group: GroupFilter, q: string) => {
    lastWritten.current = { group, q };
    const sp = new URLSearchParams();
    if (group !== ALL) sp.set("group", group);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    router.replace(qs ? `/wiki/skills?${qs}` : "/wiki/skills", { scroll: false });
  };

  useEffect(() => {
    if (urlGroup !== lastWritten.current.group) {
      lastWritten.current.group = urlGroup;
      setActiveGroup(urlGroup);
    }
    if (urlQ !== lastWritten.current.q) {
      lastWritten.current.q = urlQ;
      setQuery(urlQ);
    }
  }, [urlGroup, urlQ]);

  // An unknown `group` value (the former `other` included) reads as All:
  // rewrite the link without it.
  useEffect(() => {
    if (rawGroup !== null && urlGroup === ALL) writeUrl(ALL, urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawGroup, urlGroup]);

  const debouncedQ = useDebouncedValue(query.trim(), 250);
  useEffect(() => {
    if (debouncedQ !== lastWritten.current.q) writeUrl(activeGroup, debouncedQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const chooseGroup = (group: GroupFilter) => {
    setActiveGroup(group);
    writeUrl(group, query.trim());
  };
  const clearQuery = () => {
    setQuery("");
    writeUrl(activeGroup, "");
  };

  const skillsQuery = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });

  const needle = skillSearchKey(query);
  // Showtime first, then Classic, both in the stored order. The name filter
  // applies before grouping, so counts follow it.
  const groups = useMemo(() => {
    const sorted = [...(skillsQuery.data ?? [])].sort(compareSkills);
    const matching = needle ? sorted.filter((s) => skillSearchKey(skillLabel(s)).includes(needle)) : sorted;
    return INDEX_GROUPS.map((group) => ({ group, skills: matching.filter((s) => s.group === group) }));
  }, [skillsQuery.data, needle]);
  const nonEmpty = groups.filter((g) => g.skills.length > 0);
  const matchCount = nonEmpty.reduce((acc, g) => acc + g.skills.length, 0);
  const visibleGroups = activeGroup === ALL ? nonEmpty : nonEmpty.filter((g) => g.group === activeGroup);
  const visibleCount = visibleGroups.reduce((acc, g) => acc + g.skills.length, 0);
  // Groups present in the data at all (the segment keeps its items while a
  // search empties one of them, so the control does not jump around).
  const presentGroups = useMemo(
    () => INDEX_GROUPS.filter((group) => (skillsQuery.data ?? []).some((s) => s.group === group)),
    [skillsQuery.data],
  );
  const countOf = (group: SkillGroup) => groups.find((g) => g.group === group)?.skills.length ?? 0;

  // Rail link to a section the group filter or the search has hidden: show
  // every skill again (group All, search cleared), then move focus to the
  // section (which scrolls it into view, clear of the sticky header). A
  // visible section is left to the browser's own in-page link.
  const onSection = (group: SkillGroup, e: MouseEvent<HTMLAnchorElement>) => {
    if (visibleGroups.some((g) => g.group === group)) return;
    e.preventDefault();
    setQuery("");
    setActiveGroup(ALL);
    writeUrl(ALL, "");
    setPendingSection(group);
  };
  useEffect(() => {
    if (pendingSection === null) return;
    const section = document.getElementById(pendingSection);
    if (!section) return;
    section.focus();
    setPendingSection(null);
  }, [pendingSection, visibleGroups]);

  return (
    <SkillsFrame rail={<SkillsRail onSection={onSection} />}>
      <SkillsIntro />

      {skillsQuery.isError ? (
        <QueryErrorState error={skillsQuery.error} onRetry={() => void skillsQuery.refetch()} title="Could not load skills" className="mt-6" />
      ) : skillsQuery.isPending ? (
        <SkillsSkeleton />
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
                    onClick={clearQuery}
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
                <button type="button" aria-pressed={activeGroup === ALL} onClick={() => chooseGroup(ALL)} className="segment__item hit-44">
                  All <span className="tabular-nums">{matchCount}</span>
                </button>
                {presentGroups.map((group) => (
                  <button key={group} type="button" aria-pressed={activeGroup === group} onClick={() => chooseGroup(group)} className="segment__item hit-44">
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
                    <button type="button" onClick={clearQuery} className="cursor-pointer text-[var(--color-accent)] hover:underline">
                      Clear search
                    </button>
                  </>
                ) : (
                  "No skills in this group."
                )}
              </div>
            ) : (
              visibleGroups.map(({ group, skills: list }) => (
                // id = the rail's in-page target (#showtime / #classic); the
                // scroll margin keeps the heading clear of the sticky header;
                // tabIndex -1 lets a rail link that had to reveal the section
                // move focus onto it.
                <section key={group} id={group} tabIndex={-1} className="scroll-mt-20 space-y-3 focus:outline-none" aria-labelledby={`skills-${group}`}>
                  <SectionHeader id={`skills-${group}`} title={SKILL_GROUP_LABELS[group]} icon={GROUP_HEAD[group].icon} tone={GROUP_HEAD[group].tone} size="lg" count={list.length} />
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
    </SkillsFrame>
  );
}
