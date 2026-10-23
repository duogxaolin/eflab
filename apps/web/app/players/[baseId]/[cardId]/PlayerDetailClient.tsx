"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, ChevronDown, Circle, CircleCheck, Footprints, MoveVertical, Sparkles, Swords, Weight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PitchMap } from "@/components/players/PitchMap";
import { QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";
import { conditionUrl } from "@/lib/r2-images";
import {
  CARD_TYPE_LABELS,
  PLAYING_STYLE_DESCRIPTIONS,
  POSITIONS,
  bestFitPosition,
  formatFeetInches,
  positionTiles,
  simulateBuild,
  type BaseStat,
  type CardPreview,
  type Position,
  type PlayerCardDTO,
  type SkillDTO,
  type TrainingCategory,
} from "@eflab/shared";
import { DeferredModal, prefetchModal } from "@/components/build-simulator/deferred";
import {
  BuildSettings,
  CategoryAdjust,
  ProgressionDock,
  ProgressionPanel,
  boosterSummary,
  defaultProgressionState,
  isCustomBuild,
  progressionIds,
  type ProgressionState,
} from "@/components/build-simulator/ProgressionPanel";
// Type only: the static copy is passed in by the server page (`notes`).
import type { BuildNotes } from "@/components/build-simulator/build-notes";
import { CardInfo } from "@/components/detail/CardInfo";
import { BodyModel } from "@/components/detail/BodyModel";
import { StarRating } from "@/components/detail/StarRating";
import { CategoryRow, KeyStats, STAT_CATEGORIES, StatGrid, useCategoryPreview, type StatHighlight } from "@/components/detail/StatGrid";
import { isShowtimeSkill, orderSkills, skillDisplayName } from "@/components/detail/skill-display";
import { SkillChip } from "@/components/detail/SkillChip";
import { PlaystyleTrigger } from "@/components/detail/PlaystyleTrigger";
import { Tooltip } from "@/components/ui/Tooltip";
import { POSITION_LABEL, conditionLabel, positionOf, playingStyleLabel, statTierClass } from "@/lib/card-display";

// Player detail page body (layout of change efootbase-ui-redesign, measured
// on the reference capture of 2026-10-20):
//   header   breadcrumb (14/20); H1 36/40 (30/36 below md) + ONE accent pill
//            "{maxOvr} OVR" (the dump's max-level overall) + a muted 12 px
//            "dump max · no proficiency bonus" note; a line with position ·
//            attack style · defence style · condition (12 px icons; the two
//            styles are description triggers, PlaystyleTrigger);
//   left     (280 px from lg) 180 px card face (condition letter, no MAX
//            badges; its OVR block prints the live build overall at the
//            selected position, with that position's label), three 28 px
//            round marks (nation, club, league), the Progression card
//            (pinned at 64 px: the face, marks and card sit in a flexible
//            wrapper that fills the column — as tall as the main column —
//            minus the Build settings card at its end, so the card stays in
//            view while the main column scrolls and never covers anything),
//            then the non-sticky Build settings card (Max Level, Position,
//            the overall there, "About this build") — efootbase-behaviour-
//            parity;
//   row      under both columns, full width: Card Info and Other Versions
//            (56 px thumbnails, "+N" tile), side by side from lg;
//   phone    (< lg) no panel in the column: a floating category strip and a
//            dock above the tab bar (ProgressionDock) — its proficiency chip
//            and avatar open a small non-modal manager / proficiency popover,
//            the strip, points and Progression button open the bottom sheet
//            holding the same panel and the Build settings, scrolled to the
//            category rows; one state source (`build`) for all;
//   main     one "Overview" content card — a Compare shortcut in its heading,
//            description (playstyle triggers, up to two skill links, "and
//            other N player skills"), spec line, category strip (build's
//            points per category), booster buttons (the only booster
//            toggles, `build.boosters`; readable stat names), stat view
//            switch, stat grid (3 columns from lg, 2 below; five tier
//            colours, filled "+N" booster / "+1" manager chips; a row opens
//            its Adjust popover with the category steppers and the
//            breakdown), skills (Showtime first, links with a preview) —
//            then Body Model and Position & Playstyle (Best Fit / At POS /
//            "N Full · N Half", pitch, style panel, WF / Form / Injury
//            Resistance stars).
// The root carries `data-card-tint` (the card type) for the backdrop's static
// tint (globals.css `.efb-backdrop__tint`).
// The Progression state lives here because the stat grid, the card face, the
// booster buttons and the Pitch Map render the engine's projection; it opens
// on the Max-OVR build with every usable booster on and no manager
// (defaultProgressionState). Best Fit, "At POS" and the 13 Pitch Map values
// come from the exact overall formula (`positionTiles`) on the stats shown —
// the build's when the card has a Progression panel, otherwise the stat
// grid's — never from the stored eFHUB ratings (change
// efootbase-exact-model-managers).

// Key stats shown on the attack / defence playing-style cards.
const ATTACK_KEY_STATS: readonly BaseStat[] = ["offensiveAwareness", "finishing", "dribbling", "lowPass"];
const DEFENCE_KEY_STATS: readonly BaseStat[] = ["defensiveAwareness", "ballWinning", "defensiveEngagement", "aggression"];

const WEAK_FOOT_MAX = 4;
/** Form / injury resistance are stored 0–2 and shown as value + 1 stars of 3 (efootbase). */
const THREE_STAR_MAX = 3;
/** Skills linked in the Overview paragraph (Showtime first), as the reference. */
const OVERVIEW_SKILL_LINKS = 2;
/** Other Versions slots before the "+N" tile (4 × 2 grid of 56 px cards). */
const VERSIONS_PREVIEW = 8;

/** Which values the stat grid shows: the Progression build's projection, the
 *  dump's max-level stats (`max_attributes`, a different lift that includes
 *  the dump's own booster handling) or the level-1 base. Any change in the
 *  Progression panel switches back to "build", so the two "max" meanings
 *  never mix without the user choosing one. */
type StatView = "build" | "max" | "base";

/** True from lg (1024 px), false below, null before the first client
 *  measurement (the server render and the first paint, where the CSS
 *  `hidden lg:block` / `lg:hidden` switches decide what is visible). After
 *  mount only one Progression panel instance exists: the column's from lg,
 *  the sheet's below. */
function useDesktopLayout(): boolean | null {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export function PlayerDetailClient({
  baseId,
  cardId,
  initialData,
  notes,
}: {
  baseId: string;
  cardId: string;
  initialData: PlayerCardDTO;
  /** Static explanatory copy of the Progression controls and the stat grid
   *  (build-notes.ts): sent with the server render, not in this bundle. */
  notes: BuildNotes;
}) {
  const hasProgressionInitial = initialData.levelCap > 1;
  const [statView, setStatView] = useState<StatView>(hasProgressionInitial ? "build" : "max");
  // Pinned category highlight (strip counter / panel label press) and the
  // transient hover / keyboard-focus preview of a category, which wins while
  // it lasts (owner feedback 2026-10-23).
  const [highlight, setHighlight] = useState<StatHighlight>(null);
  const categoryPreview = useCategoryPreview();
  const [allVersions, setAllVersions] = useState(false);
  // "+N" in Other Versions: index of the version link to focus once the rest
  // is shown, and the polite announcement of it.
  const versionsListRef = useRef<HTMLUListElement>(null);
  const focusVersionRef = useRef<number | null>(null);
  const [versionsNotice, setVersionsNotice] = useState("");
  useLayoutEffect(() => {
    const index = focusVersionRef.current;
    if (!allVersions || index === null) return;
    focusVersionRef.current = null;
    versionsListRef.current?.querySelectorAll<HTMLElement>("a.pcb-tile")[index]?.focus();
  }, [allVersions]);
  // Below lg the long "how the build stats are made" explanation is behind a
  // small disclosure, so the stat grid starts right under the stat view
  // (always shown from lg).
  const [statsHelpOpen, setStatsHelpOpen] = useState(false);
  const statsHelpId = useId();
  // Progression build (player-progression-simulator): max level, position,
  // stat points per category, booster toggles. Kept in React state, not the URL.
  const [build, setBuildState] = useState<ProgressionState>(() => defaultProgressionState(initialData));
  // Max Level reset notice of the last change (the panel shows and announces
  // it); every other change clears it.
  const [buildNotice, setBuildNotice] = useState<string | null>(null);
  const setBuild = (next: ProgressionState, notice: string | null = null) => {
    setBuildState(next);
    setBuildNotice(notice);
    setStatView("build");
  };
  // Ids shared by the Progression card and the Build settings card, and the
  // prefix of the stat-row Adjust steppers.
  const progressionIdBase = useId().replace(/:/g, "");
  const desktop = useDesktopLayout();
  // Crossing lg unmounts the column's panel (or the dock): a label hovered or
  // focused at that moment never reports its leave / blur, so the preview is
  // dropped with it.
  const clearCategoryPreview = categoryPreview.clear;
  useEffect(() => clearCategoryPreview(), [desktop, clearCategoryPreview]);
  // Mobile Progression sheet. It can only be open below lg: crossing to lg
  // closes it (the Modal's `open` turns false and its close event resets this).
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetShown = sheetOpen && desktop === false;
  // The dock opens the sheet scrolled to the category rows (the manager and
  // the proficiency have their own popover in the dock). Called by the
  // Modal once the dialog is shown and laid out (`onShown` — the sheet's
  // code is loaded on first use, components/build-simulator/deferred.tsx, so
  // an effect here could run before the dialog exists); the offset is taken
  // between two rects of the same translated panel, so the slide-in does not
  // skew it, and only the sheet's scrolling body moves (scrollIntoView could
  // also scroll the page behind).
  const scrollSheetToCategories = (dialog: HTMLDialogElement) => {
    const cats = document.getElementById(progressionIds(progressionIdBase).cats);
    const body = cats?.closest<HTMLElement>(".efb-modal__body");
    if (!cats || !body || !dialog.contains(body)) return;
    const padTop = parseFloat(getComputedStyle(body).paddingTop) || 0;
    body.scrollTop = Math.max(0, body.scrollTop + cats.getBoundingClientRect().top - body.getBoundingClientRect().top - padTop);
  };

  const q = trpc.player.byId.useQuery({ baseId, cardId }, { initialData });
  const p = q.data ?? initialData;

  const buildDefaults = useMemo(() => (p ? defaultProgressionState(p) : null), [p]);
  // Pure, client-side engine (packages/shared/src/progression.ts).
  const buildResult = useMemo(
    () =>
      p
        ? simulateBuild({
            base: p.stats,
            levelCap: p.levelCap,
            height: p.height,
            weakFootAccuracy: p.weakFootAccuracy,
            config: {
              playerId: p.id,
              maxLevel: build.maxLevel,
              position: build.position,
              trainingPoints: build.trainingPoints,
              boosters: build.boosters,
              managerProficiency: build.managerProficiency,
            },
            boosters: [p.booster1, p.booster2],
            positionAptitudes: p.positionAptitudes,
            manager: build.manager ? { stats: build.manager.pills } : null,
          })
        : null,
    [p, build],
  );

  // Skill slug → skill (the DTO carries slugs; name, group, artwork, description
  // and boosts live in skill.list).
  const skillsQ = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });
  const skillBySlug = useMemo(() => {
    const map = new Map<string, SkillDTO>();
    for (const s of skillsQ.data ?? []) map.set(s.slug, s);
    return map;
  }, [skillsQ.data]);

  if (q.isError) {
    return <QueryErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load this player" />;
  }
  if (!p || !buildResult || !buildDefaults) {
    // The server wrapper already 404s; this only happens if the card vanished
    // between the server render and a client refetch.
    return (
      <div className="efb-card space-y-3 p-12 text-center text-sm text-[var(--color-text-secondary)]">
        <p>Player card not found.</p>
        <Link href="/players" className="button button--sm button--secondary">
          Back to Players
        </Link>
      </div>
    );
  }

  const pos = positionOf(p.registeredPosition);
  const posLabel = pos === "—" ? "—" : POSITION_LABEL[pos];
  const playstyleAtk = playingStyleLabel(p.playingStyleAttack);
  const playstyleDef = playingStyleLabel(p.playingStyleDefense);
  const packTitle = p.pack?.name ?? CARD_TYPE_LABELS[p.cardType];
  const heightImperial = formatFeetInches(p.height);
  const condLetter = p.condition && /^[a-eA-E]$/.test(p.condition) ? p.condition.toUpperCase() : null;

  const orderedSkills = orderSkills(p.skills, skillBySlug);
  const skillLabels = orderedSkills.map((slug) => skillDisplayName(slug, skillBySlug.get(slug)));
  const showtimeCount = orderedSkills.filter((slug) => isShowtimeSkill(skillBySlug.get(slug))).length;
  // Overview paragraph: up to two skill links, Showtime first — only once the
  // skill list is loaded (before that the groups and names are unknown).
  const overviewSkills = skillsQ.data ? orderedSkills.slice(0, OVERVIEW_SKILL_LINKS) : [];
  const otherSkills = orderedSkills.length - overviewSkills.length;

  const regPos: Position = POSITIONS[p.registeredPosition] ?? "GK";
  const fullPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 0);
  const halfPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 1);

  // Cards with a level cap of 1 have no training points — no panel for them.
  const hasProgression = p.levelCap > 1;
  const customBuild = hasProgression && isCustomBuild(build, buildDefaults, p);
  const view: StatView = hasProgression ? statView : statView === "build" ? "max" : statView;
  const stats = view === "build" ? buildResult.projectedStats : view === "max" ? p.maxStats : p.stats;
  const boosterDeltas = view === "build" ? buildResult.boosterDeltas : undefined;
  const trainingDeltas = view === "build" ? buildResult.trainingDeltas : undefined;
  const capDeltas = view === "build" ? buildResult.capDeltas : undefined;
  const proficiencyDeltas = view === "build" ? buildResult.proficiencyDeltas : undefined;
  const managerDeltas = view === "build" ? buildResult.managerDeltas : undefined;
  const buildOvr = buildResult.overall;
  // Position tiles (exact formula): the build's when the panel exists (the
  // tile at the panel's position is the panel's overall), else the stats in
  // the grid. Best Fit = the highest tile (registered position on a tie).
  const tiles = hasProgression ? buildResult.tiles : positionTiles(stats, { height: p.height, weakFootAccuracy: p.weakFootAccuracy }, p.positionAptitudes);
  const bestPos = bestFitPosition(tiles, regPos);
  // The "At <POS>" tile reads the position the card face prints: the one
  // chosen in Build settings when the card has a panel, else the registered
  // one (QA 2026-10-23 U2 — it used to stay on the registered position while
  // the face followed the selection).
  const atPos: Position = hasProgression ? build.position : regPos;
  // Without a panel the card's level cap is 1: "Max" = base + Booster 1 (dump).
  const tilesSource = hasProgression ? "current build" : view === "max" ? "max-level stats (Booster 1 on)" : "level-1 stats";
  // The card face prints the build's overall at the selected position with
  // that position's label (as the reference prints "108 RWF" there; B2 —
  // the face and its accessible name name the same position); the header
  // pill is the dump's max overall with its visible "dump max · no
  // proficiency bonus" note, so the two are never confused.
  const cardPlayer = hasProgression ? { ...p, ovr: buildOvr, registeredPosition: POSITIONS.indexOf(build.position) } : p;
  const atkDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleAtk];
  const defDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleDef];
  const onHighlight = (next: TrainingCategory | null) => setHighlight(next);

  // Booster buttons of the Overview card — the only booster toggles since the
  // Progression panel dropped its own (efootbase-ui-redesign batch 5; they
  // carry its `progression-booster-N` test ids). They toggle `build.boosters`
  // through setBuild, so the stat view returns to "build" exactly as a
  // change in the panel does. A slot without stat data, or any slot of a
  // level-cap-1 card (its stats are the dump's, nothing to toggle), is a
  // static label.
  const boosterSlots = ([0, 1] as const).map((slot) => ({ slot, info: boosterSummary(p, slot) }));
  const showBoosters = boosterSlots.some(({ info }) => info.usable);
  const toggleBooster = (slot: 0 | 1) => {
    const boosters: [boolean, boolean] = [build.boosters[0], build.boosters[1]];
    boosters[slot] = !boosters[slot];
    setBuild({ ...build, boosters });
  };

  const versionPreviews: CardPreview[] = p.otherVersions.map((v) => ({
    id: v.id,
    baseId: p.baseId,
    name: p.name,
    cardType: v.cardType,
    ovr: v.ovr,
    maxOvr: v.maxOvr,
    registeredPosition: v.registeredPosition,
    condition: "",
  }));
  // Up to 8 slots; when there are more versions the 8th slot is a "+N" tile
  // that shows the rest.
  const collapsed = !allVersions && versionPreviews.length > VERSIONS_PREVIEW;
  const shownVersions = collapsed ? versionPreviews.slice(0, VERSIONS_PREVIEW - 1) : versionPreviews;
  const hiddenVersions = versionPreviews.length - shownVersions.length;

  const statsHeading =
    view === "build"
      ? `Stats · ${customBuild ? "custom build" : "Max-OVR build"} · level ${build.maxLevel} · ${
          build.manager ? `${build.manager.name} (${buildResult.config.managerProficiency})` : `proficiency ${buildResult.config.managerProficiency}`
        } · ${buildOvr} at ${build.position}`
      : view === "max"
        ? `Stats at max level ${p.levelCap} (dump)`
        : "Stats at level 1";

  const viewOptions: Array<[StatView, string]> = hasProgression
    ? [
        ["build", `Build (${buildOvr})`],
        ["max", `Max (${p.maxOvr})`],
        ["base", `Base (${p.ovr})`],
      ]
    : [
        ["max", `Max (${p.maxOvr})`],
        ["base", `Base (${p.ovr})`],
      ];

  const marks: Array<{ key: string; src: string | null | undefined; name: string | null | undefined; fallback: string; fill: boolean }> = [
    { key: "nation", src: p.flagUrl, name: p.countryName, fallback: "Nationality", fill: true },
    { key: "team", src: p.teamEmblemUrl, name: p.teamName, fallback: "Team", fill: false },
    { key: "league", src: p.leagueEmblemUrl, name: p.leagueName, fallback: "League", fill: false },
  ];

  return (
    <div data-card-tint={p.cardType}>
      {/* Breadcrumb */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 mb-3 list-none p-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link hit-44" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator" aria-hidden>
            ›
          </span>
        </li>
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link hit-44" href="/players">
            Players
          </Link>
          <span className="breadcrumbs__separator" aria-hidden>
            ›
          </span>
        </li>
        <li className="breadcrumbs__item breadcrumbs__item--muted">
          {p.name}
          <span className="breadcrumbs__separator" aria-hidden>
            ›
          </span>
        </li>
        <li className="breadcrumbs__item" aria-current="page">
          {packTitle}
        </li>
      </ol>

      {/* ================= HEADER: name + one OVR pill ================= */}
      <header className="mb-10 min-w-0 text-center lg:text-left">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
          <h1 className="text-display-sm md:text-display font-bold text-white">{p.name}</h1>
          <span
            className="chip chip--accent chip--lg tabular-nums"
            data-testid="ovr-pill"
            title={`Overall at max level ${p.levelCap} (dump, Booster 1 only, no Manager Proficiency bonus); the card shows the current build's estimate`}
          >
            <span className="chip__label">{p.maxOvr} OVR</span>
          </span>
          {/* Visible qualifier: the pill is the dump's max overall (Booster 1,
              no Manager Proficiency bonus), so it sits below the build estimate
              the card face prints at proficiency 90. */}
          {/* Header text sits on the aurora + card-type tint: the on-backdrop
              tone (≥ 4.8:1 there), not the muted token. */}
          <span className="text-caption whitespace-nowrap text-[var(--color-text-on-backdrop)]" data-testid="ovr-pill-note">
            dump max · no proficiency bonus
          </span>
        </div>
        {/* A <div>, not a <p>: the playstyle triggers render their tooltip
            and popover (<div>s) next to the button. */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-[var(--color-text-on-backdrop)] lg:justify-start" data-testid="hero-line">
          {/* Each item after the first carries its own "·", so a wrapped line
              never ends on a dangling separator. */}
          <span>{posLabel}</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_attack.svg" alt="" width={12} height={12} className="size-3" />
            <PlaystyleTrigger style={playstyleAtk} kind="attack" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_defence.svg" alt="" width={12} height={12} className="size-3" />
            <PlaystyleTrigger style={playstyleDef} kind="defence" />
          </span>
          {condLetter && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>·</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={conditionUrl(condLetter)} alt="" width={12} height={12} loading="lazy" decoding="async" className="size-3" />
              <span>
                <span className="sr-only">Condition: </span>
                {conditionLabel(condLetter)}
              </span>
            </span>
          )}
        </div>
      </header>

      {/* ======= TWO COLUMNS, then the full-width row (DOM order = phone order) ======= */}
      <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left column (from lg as tall as the main column): the flexible
            wrapper with the face, the marks and the pinned Progression card —
            the card's travel range — then the Build settings card at the
            column's end, outside that range, so the pinned card never covers
            it. */}
        <div className="flex flex-col gap-6 lg:col-start-1">
        <div className="flex flex-col gap-6 lg:flex-1">
        <div className="flex flex-col items-center gap-3">
          <div className="w-[180px]">
            <PlayerCard player={cardPlayer} size="full" caption="none" priority />
          </div>
          {hasProgression && (
            // The face's OVR block is the build's overall (no tag on the face).
            <p className="sr-only" data-testid="card-build-overall">
              The card shows the overall of the current build: {buildOvr} at {build.position}.
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            {marks.map((m) => (
              <span key={m.key} className={`efb-detail-mark ${m.src ? "" : "bg-[var(--color-default)]"}`} title={m.name ?? m.fallback}>
                {m.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.src}
                    alt={m.name ?? ""}
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    className={m.fill ? "size-full object-cover" : "size-full object-contain"}
                  />
                ) : (
                  <span className="text-[10px] text-[var(--color-text-secondary)]">
                    <span aria-hidden>—</span>
                    <span className="sr-only">{m.fallback} unknown</span>
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Progression — none for level-cap-1 cards (no training points).
            From lg: the card pinned at 64 px (it fits a 900 px viewport; a
            max height of the viewport below the header, scrolling inside, is
            only a safety net). Below lg it is not rendered here (the dock and
            the sheet below take over); before the first client measurement
            CSS hides it on a phone. */}
        {hasProgression ? (
          desktop !== false && (
            <div className="efb-progression-sticky hidden lg:block">
              <ProgressionPanel
                player={p}
                state={build}
                result={buildResult}
                onChange={setBuild}
                notice={buildNotice}
                idBase={progressionIdBase}
                highlight={highlight}
                onHighlight={onHighlight}
                preview={categoryPreview.bind}
                notes={notes}
              />
            </div>
          )
        ) : (
          <p data-testid="progression-none" className="efb-card text-sm text-[var(--color-text-secondary)]">
            No Progression panel for this card: its max level is 1, so it has no training points to spend (and no build to choose a manager for).
          </p>
        )}
        </div>
        {hasProgression && desktop !== false && (
          <div className="hidden lg:block">
            <BuildSettings player={p} state={build} result={buildResult} onChange={setBuild} idBase={progressionIdBase} notes={notes} />
          </div>
        )}
        </div>

        {/* ================= MAIN COLUMN ================= */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:self-start">
          {/* Overview */}
          <section aria-labelledby="overview-title" className="efb-card space-y-4">
            <div className="-mx-4 flex items-end justify-between gap-3 border-b border-[var(--color-line-separator)] px-4">
              <h2 id="overview-title" className="efb-card__title inline-block border-b-2 border-[var(--color-accent)] pb-1.5">
                Overview
              </h2>
              {/* Compare shortcut (the reference's 32 × 32 ghost icon link at
                  the right of its tab row): this card in the first slot. */}
              <Link
                href={`/compare?ids=${p.id}` as Route}
                aria-label={`Compare ${p.name}`}
                className="button button--sm button--ghost button--icon-only mb-1 shrink-0"
                data-testid="overview-compare"
              >
                <Swords className="size-4" aria-hidden />
              </Link>
            </div>
            {/* Description built from parts (a <div>, not a <p>: the inline
                triggers render their tooltip and popover <div>s next to them):
                the playing styles are description triggers, up to two skills
                (Showtime first) are skill links with the preview, then "and
                other N player skills". */}
            <div className="text-sm leading-6 text-white/85" data-testid="overview-text">
              {p.name}&apos;s {CARD_TYPE_LABELS[p.cardType]} card{p.pack ? ` from "${p.pack.name}"` : ""} is rated {p.ovr}
              {p.maxOvr > p.ovr ? `, peaking at ${p.maxOvr} at level ${p.levelCap}` : ""}. A {p.height} cm ({heightImperial}) {posLabel} with the{" "}
              <PlaystyleTrigger style={playstyleAtk} kind="attack" /> playing style
              {playstyleDef !== "Basic" && (
                <>
                  {" "}
                  and the <PlaystyleTrigger style={playstyleDef} kind="defence" /> defensive style
                </>
              )}
              {p.countryName ? `, from ${p.countryName}` : ""}
              {p.teamName ? `, playing for ${p.teamName}` : ""}.{p.releaseDate ? ` Released ${formatUtcDate(p.releaseDate)}.` : ""}{" "}
              {orderedSkills.length === 0 ? (
                "Has no skills."
              ) : overviewSkills.length === 0 ? (
                `Features ${orderedSkills.length} skill${orderedSkills.length === 1 ? "" : "s"}.`
              ) : (
                <>
                  Features{" "}
                  {overviewSkills.map((slug, i) => (
                    <span key={slug}>
                      {i > 0 && (otherSkills > 0 ? ", " : " and ")}
                      <SkillChip slug={slug} label={skillLabels[i]!} skill={skillBySlug.get(slug)} variant="inline" />
                    </span>
                  ))}
                  {otherSkills > 0 ? ` and other ${otherSkills} player skill${otherSkills === 1 ? "" : "s"}` : ""}.
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-white/85" data-testid="spec-line">
              <span className="inline-flex items-center gap-1.5">
                <MoveVertical className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                {p.height} CM
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Weight className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                {p.weight} KG
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                {p.age} years
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Footprints className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                Strong Foot: {p.strongerFoot === 1 ? "Left" : p.strongerFoot === 2 ? "Both" : "Right"}
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                WF Accuracy <StarRating filled={p.weakFootAccuracy} max={WEAK_FOOT_MAX} label="Weak foot accuracy" />
              </span>
              <span className="inline-flex items-center gap-1.5">
                WF Usage <StarRating filled={p.weakFootUsage} max={WEAK_FOOT_MAX} label="Weak foot usage" />
              </span>
            </div>

            {hasProgression && (
              <CategoryRow allocation={build.trainingPoints} highlight={highlight} onHighlight={onHighlight} preview={categoryPreview.bind} />
            )}

            {showBoosters && (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Boosters">
                {boosterSlots.map(({ slot, info }) => {
                  const on = hasProgression && info.usable && build.boosters[slot];
                  if (!hasProgression || !info.usable) {
                    // Static label (no toggle): a slot without stat data, or
                    // any slot of a level-cap-1 card, whose Booster 1 is
                    // already inside the dump's max-level stats (said in
                    // visible text, not only in a title).
                    return (
                      <div
                        key={slot}
                        className="efb-booster-button"
                        data-testid={`progression-booster-${slot + 1}`}
                        data-usable={info.usable ? "true" : "false"}
                      >
                        <Sparkles className="size-4 shrink-0" aria-hidden />
                        <span className="efb-booster-button__label efb-booster-button__label--wrap min-w-0 break-words">
                          <span className="sr-only">Booster {slot + 1}: </span>
                          {info.label}
                          {info.usable && slot === 0 && <span className="text-[var(--color-text-secondary)]"> (in the max-level stats)</span>}
                        </span>
                      </div>
                    );
                  }
                  // Toggle: the readable label ("+5 · Dribbling, Tight
                  // Possession, Speed, Balance"), truncated on a wide
                  // mouse layout with the full list in a tooltip (wrapped on
                  // phones and touch devices); on / off = a check / an empty
                  // circle icon plus the cyan colour, and aria-pressed.
                  const StateIcon = on ? CircleCheck : Circle;
                  return (
                    <Tooltip key={slot} content={<p className="text-sm text-white">Booster {slot + 1}: {info.label}</p>} className="efb-booster-tip">
                      {(tp) => (
                        <button
                          {...tp}
                          // The tooltip repeats the accessible name; do not announce it twice.
                          aria-describedby={undefined}
                          type="button"
                          aria-pressed={on}
                          onClick={(e) => {
                            tp.onClick(e);
                            toggleBooster(slot);
                          }}
                          className="efb-booster-button hit-44"
                          data-testid={`progression-booster-${slot + 1}`}
                          data-usable="true"
                        >
                          <StateIcon className="size-4 shrink-0" aria-hidden data-testid="booster-state-icon" data-state={on ? "on" : "off"} />
                          <span className="efb-booster-button__label min-w-0">
                            <span className="sr-only">Booster {slot + 1}: </span>
                            {info.label}
                          </span>
                        </button>
                      )}
                    </Tooltip>
                  );
                })}
              </div>
            )}

            {/* Stat view: build projection (default) / dump max / base. */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <h3 className="min-w-0 text-sm font-medium text-white" data-testid="stats-heading">
                {statsHeading}
              </h3>
              {/* Below 400 px the three items may not fit: the track scrolls
                  sideways there, with 6 px padding so the focus ring and the
                  44 px touch area stay inside the scroller. */}
              <div className="segment max-w-full max-[399px]:overflow-x-auto max-[399px]:overflow-y-hidden max-[399px]:p-1.5" role="group" aria-label="Stat view">
                {viewOptions.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    data-testid={`stat-view-${v}`}
                    onClick={() => setStatView(v)}
                    className="segment__item hit-44"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {view === "build" && (
              <button
                type="button"
                aria-expanded={statsHelpOpen}
                aria-controls={statsHelpId}
                onClick={() => setStatsHelpOpen((v) => !v)}
                className="efb-inline-disclosure hit-44 lg:hidden"
              >
                How these stats are built
                <ChevronDown className={`size-3.5 transition-transform motion-reduce:transition-none ${statsHelpOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
            )}
            {view === "build" && (
              <p id={statsHelpId} className={`text-xs text-[var(--color-text-secondary)] ${statsHelpOpen ? "" : "max-lg:hidden"}`}>
                {notes.statsHelp}
                {highlight
                  ? " click the pinned category again to clear the highlight."
                  : " hovering or focusing a category previews the stats it trains, a click pins it."}
              </p>
            )}
            <StatGrid
              values={stats}
              boosterDeltas={boosterDeltas}
              trainingDeltas={trainingDeltas}
              capDeltas={capDeltas}
              proficiencyDeltas={proficiencyDeltas}
              managerDeltas={managerDeltas}
              source={view}
              highlight={categoryPreview.preview ?? highlight}
              renderAdjust={
                hasProgression
                  ? (stat) => (
                      <CategoryAdjust cats={STAT_CATEGORIES[stat]} state={build} result={buildResult} onChange={setBuild} idBase={`${progressionIdBase}-adjust-${stat}`} />
                    )
                  : undefined
              }
              baseValues={hasProgression ? undefined : p.stats}
            />

            {/* Skills — Showtime first (gold), classic after; each chip links
                to the skill's page with a preview of its artwork,
                description and boosts (a popover with the link on touch). */}
            <div className="pt-1">
              <h3 className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
                Skills · {skillLabels.length}
                {showtimeCount ? ` · ${showtimeCount} Showtime` : ""}
              </h3>
              {skillLabels.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No skills.</p>
              ) : skillsQ.isPending ? (
                // Same chip height while the skill list loads (it is cached for an hour).
                <ul className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading skills">
                  {orderedSkills.map((slug) => (
                    <li key={slug} className="h-[30px] w-28 animate-pulse rounded-lg bg-[var(--color-default)]" />
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-label="Skills" data-testid="skill-list">
                  {orderedSkills.map((slug, i) => (
                    <li key={slug} className="min-w-0 max-w-full">
                      <SkillChip slug={slug} label={skillLabels[i]!} skill={skillBySlug.get(slug)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <BodyModel player={p} />

          {/* ================= POSITION & PLAYSTYLE ================= */}
          <section aria-labelledby="pos-title" className="efb-card space-y-3">
            <h2 id="pos-title" className="efb-card__title">
              Position &amp; Playstyle
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="efb-detail-tile min-h-[92px]">
                <div className="text-sm text-[var(--color-text-secondary)]">Best Fit</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{POSITION_LABEL[bestPos]}</span>
                  <span className={`text-sm font-semibold tabular-nums ${statTierClass(tiles[bestPos])}`} data-testid="best-fit-value">
                    {tiles[bestPos]}
                  </span>
                </div>
              </div>
              <div className="efb-detail-tile min-h-[92px]">
                <div className="text-sm text-[var(--color-text-secondary)]">At {POSITION_LABEL[atPos]}</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-2xl font-bold tabular-nums ${statTierClass(tiles[atPos])}`} data-testid="at-position-value">
                    {tiles[atPos]}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)]">{tilesSource}</span>
                </div>
              </div>
              <div className="efb-detail-tile min-h-[92px]">
                <div className="text-sm text-[var(--color-text-secondary)]">Proficiency</div>
                {/* textContent reads "N Full · N Half" (catalog-browsing-parity). */}
                <div className="mt-2 text-sm text-[var(--color-text-secondary)]" data-testid="proficiency-text">
                  <span className="text-2xl font-bold tabular-nums text-[var(--color-accent)]">{fullPositions.length}</span> Full
                  {halfPositions.length > 0 && (
                    <>
                      {" · "}
                      <span className="text-2xl font-bold tabular-nums text-white">{halfPositions.length}</span> Half
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 20 px between the pitch and the style panel from 768 px (the
                reference's gap: 382 + 20 + 382 in its 784 px card at 1440). */}
            <div className="grid items-start gap-3 md:grid-cols-2 md:gap-5">
              {/* The pitch box (#272727, radius 12, padding 16 — the
                  reference's 382 × 352 at 1440), then the legend and the note
                  under it, outside the box. */}
              <div className="flex min-w-0 flex-col items-center gap-3">
                <PitchMap positionAptitudes={p.positionAptitudes} tiles={tiles} registeredPosition={regPos} />
                <p className="w-full text-xs leading-relaxed text-[var(--color-text-secondary)]" data-testid="pitch-note">
                  Overall at each position, computed with the game&apos;s overall formula from the {tilesSource}.
                  {hasProgression ? "" : " The formula matched every measured tile on the five surveyed cards; other cards are checked in bulk only, not tile by tile."}
                </p>
              </div>

              <div className="divide-y divide-[var(--color-line-separator)] rounded-2xl bg-[var(--color-panel)] p-4 [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
                {/* Attack playing style — from the attacking data */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_attack.svg" alt="" width={20} height={20} className="size-5" />
                    <span className="text-xl font-semibold text-white">{playstyleAtk}</span>
                    <span className="ml-auto text-xs text-[var(--color-text-secondary)]">Attack</span>
                  </div>
                  {atkDesc && <p className="text-sm text-[var(--color-text-secondary)]">{atkDesc}</p>}
                  <KeyStats statKeys={ATTACK_KEY_STATS} values={stats} boosterDeltas={boosterDeltas} />
                </div>

                {/* Defence playing style — from the defensive data */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_defence.svg" alt="" width={20} height={20} className="size-5" />
                    <span className="text-xl font-semibold text-white">{playstyleDef}</span>
                    <span className="ml-auto text-xs text-[var(--color-text-secondary)]">Defence</span>
                  </div>
                  {playstyleDef === "Basic" ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">No defensive playing style — the AI defends with the default behaviour.</p>
                  ) : (
                    defDesc && <p className="text-sm text-[var(--color-text-secondary)]">{defDesc}</p>
                  )}
                  <KeyStats statKeys={DEFENCE_KEY_STATS} values={stats} boosterDeltas={boosterDeltas} />
                </div>

                {/* Compatible positions (aptitude data) */}
                <div className="space-y-2">
                  <div className="text-sm text-[var(--color-text-secondary)]">Compatible positions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fullPositions.map((role) => (
                      <span key={role} className="rounded-md bg-[#5cbf2a] px-2 py-0.5 text-sm font-semibold text-black">
                        {role}
                        <span className="sr-only"> (fully proficient)</span>
                      </span>
                    ))}
                    {halfPositions.map((role) => (
                      <span key={role} className="rounded-md bg-[#3d6b25] px-2 py-0.5 text-sm font-semibold text-white">
                        {role}
                        <span className="sr-only"> (half proficient)</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI Playing Styles */}
                <div className="space-y-2">
                  <div className="text-sm text-[var(--color-text-secondary)]">AI Playing Styles</div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["trickster", "Trickster"],
                        ["mazingRun", "Mazing Run"],
                        ["speedingBullet", "Speeding Bullet"],
                        ["incisiveRun", "Incisive Run"],
                        ["longBallExpert", "Long Ball Expert"],
                        ["earlyCross", "Early Crosser"], // efootbase's name, same as AI_PLAYING_STYLES / the filter
                      ] as const
                    )
                      .filter(([key]) => p.playstyles[key])
                      .map(([key, label]) => (
                        <span key={key} className="rounded-lg bg-[var(--color-default)] px-2.5 py-1 text-sm font-semibold text-white">
                          {label}
                        </span>
                      ))}
                    {Object.values(p.playstyles).every((v) => !v) && <span className="text-sm text-[var(--color-text-secondary)]">None.</span>}
                  </div>
                </div>

                {/* WF / Form / Injury Resistance (the reference's star list) */}
                <dl className="space-y-1.5 text-sm" data-testid="star-list">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">WF Usage</dt>
                    <dd>
                      <StarRating filled={p.weakFootUsage} max={WEAK_FOOT_MAX} label="Weak foot usage" />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">WF Accuracy</dt>
                    <dd>
                      <StarRating filled={p.weakFootAccuracy} max={WEAK_FOOT_MAX} label="Weak foot accuracy" />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">Form</dt>
                    <dd data-testid="form-stars">
                      {typeof p.form === "number" ? (
                        <StarRating filled={p.form + 1} max={THREE_STAR_MAX} label="Form" />
                      ) : (
                        <span className="text-[var(--color-text-secondary)]" title="Stored for every card; the player API does not expose it yet">
                          not exposed by the API yet
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">Injury Resistance</dt>
                    <dd data-testid="injury-stars">
                      {typeof p.injuryResistance === "number" ? (
                        <StarRating filled={p.injuryResistance + 1} max={THREE_STAR_MAX} label="Injury resistance" />
                      ) : (
                        <span className="text-[var(--color-text-secondary)]" title="Stored for every card; the player API does not expose it yet">
                          not exposed by the API yet
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Full-width row under both columns: Card Info and Other Versions,
          side by side from lg (after the main column on a phone, as before).
          The pinned Progression card ends above it, so it never covers them. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start" data-testid="detail-info-row">
        <CardInfo player={p} />

        {/* Other Versions: 56 px thumbnails from lg, four columns below. */}
        <section aria-labelledby="versions-title" data-testid="other-versions" className="efb-card">
          <h2 id="versions-title" className="efb-card__title">
            Other Versions <span className="text-[var(--color-text-secondary)]">· {versionPreviews.length}</span>
          </h2>
          {versionPreviews.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">This is the only card of {p.name}.</p>
          ) : (
            <ul ref={versionsListRef} className="mt-3 grid grid-cols-4 gap-2 lg:grid-cols-[repeat(auto-fill,56px)]">
              {shownVersions.map((v) => (
                <li key={v.id} className="min-w-0">
                  <PlayerCard player={v} size="full" caption="none" />
                </li>
              ))}
              {collapsed && (
                <li className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      // The button unmounts: focus moves to the first newly
                      // shown version (B5), announced politely.
                      focusVersionRef.current = shownVersions.length;
                      setVersionsNotice(`${hiddenVersions} more version${hiddenVersions === 1 ? "" : "s"} shown`);
                      setAllVersions(true);
                    }}
                    aria-label={`Show ${hiddenVersions} more versions`}
                    className="flex aspect-[240/339] w-full items-center justify-center rounded-lg bg-[var(--color-default)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-default-hover)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                  >
                    +{hiddenVersions}
                  </button>
                </li>
              )}
            </ul>
          )}
          {/* Always rendered (empty until "+N"), so the text is announced. */}
          <p role="status" aria-live="polite" className="sr-only">
            {versionsNotice}
          </p>
        </section>
      </div>
      </div>

      {/* Phone (< lg): category strip + dock above the tab bar, opening the
          bottom sheet with the full panel (same `build` state). */}
      {hasProgression && (
        <>
          {desktop !== true && (
            <ProgressionDock
              state={build}
              result={buildResult}
              onChange={setBuild}
              onOpen={() => setSheetOpen(true)}
              onOpenIntent={prefetchModal}
              expanded={sheetShown}
            />
          )}
          {/* Loaded and mounted on the first opening (deferred.tsx), then kept
              for the slide-out; its content exists only while open, so there
              is never a second panel instance next to the column's. */}
          <DeferredModal open={sheetShown} onClose={() => setSheetOpen(false)} title="Progression" variant="sheet" onShown={scrollSheetToCategories}>
            <ProgressionPanel
              player={p}
              state={build}
              result={buildResult}
              onChange={setBuild}
              notice={buildNotice}
              idBase={progressionIdBase}
              highlight={highlight}
              onHighlight={onHighlight}
              notes={notes}
              embedded
            />
          </DeferredModal>
        </>
      )}
    </div>
  );
}
