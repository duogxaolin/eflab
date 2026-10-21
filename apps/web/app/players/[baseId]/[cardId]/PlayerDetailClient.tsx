"use client";
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, Footprints, MoveVertical, Sparkles, Weight } from "lucide-react";
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
import { Modal } from "@/components/filters/Modal";
import {
  ProgressionDock,
  ProgressionPanel,
  boosterSummary,
  defaultProgressionState,
  isCustomBuild,
  type ProgressionState,
} from "@/components/build-simulator/ProgressionPanel";
import { CardInfo } from "@/components/detail/CardInfo";
import { BodyModel } from "@/components/detail/BodyModel";
import { StarRating } from "@/components/detail/StarRating";
import { CategoryRow, KeyStats, StatGrid, type StatHighlight } from "@/components/detail/StatGrid";
import { isShowtimeSkill, orderSkills, skillDisplayName } from "@/components/detail/skill-display";
import { SkillChip } from "@/components/detail/SkillChip";
import { POSITION_LABEL, conditionLabel, positionOf, playingStyleLabel, statTierClass } from "@/lib/card-display";

// Player detail page body (layout of change efootbase-ui-redesign, measured
// on the reference capture of 2026-10-20):
//   header   breadcrumb (14/20); H1 36/40 (30/36 below md) + ONE accent pill
//            "{maxOvr} OVR" (the dump's max-level overall) + a muted 12 px
//            "dump max · no proficiency bonus" note; a line with position ·
//            attack style · defence style · condition (12 px icons);
//   left     (280 px from lg) 180 px card face (condition letter, no MAX
//            badges; its OVR block prints the live build overall), three
//            28 px round marks (nation, club, league), Progression (sticky:
//            the face, marks and panel sit in the grid's flexible first row,
//            which grows to the main column's height minus Card Info and
//            Other Versions, so the panel stays in view while the main column
//            scrolls and never covers the two cards below it), Card Info,
//            Other Versions (56 px thumbnails, "+N" tile);
//   phone    (< lg) no panel in the column: a floating category strip and a
//            dock above the tab bar (ProgressionDock) open the bottom sheet
//            holding the same panel; one state source (`build`) for both;
//   main     one "Overview" content card — description, spec line, category
//            strip (build's points per category), booster buttons (the only
//            booster toggles, `build.boosters`), stat view switch, stat
//            grid (3 columns from lg, 2 below; five tier colours, filled "+N"
//            booster / "+1" manager chips, click-to-highlight), skills
//            (Showtime first) — then Body Model and Position & Playstyle
//            (Best Fit / At POS / "N Full · N Half", pitch, style panel, WF /
//            Form / Injury Resistance stars).
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
const SKILLS_PREVIEW = 3;
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
}: {
  baseId: string;
  cardId: string;
  initialData: PlayerCardDTO;
}) {
  const hasProgressionInitial = initialData.levelCap > 1;
  const [statView, setStatView] = useState<StatView>(hasProgressionInitial ? "build" : "max");
  const [highlight, setHighlight] = useState<StatHighlight>(null);
  const [allVersions, setAllVersions] = useState(false);
  // Below lg the long "how the build stats are made" explanation is behind a
  // small disclosure, so the stat grid starts right under the stat view
  // (always shown from lg).
  const [statsHelpOpen, setStatsHelpOpen] = useState(false);
  const statsHelpId = useId();
  // Progression build (player-progression-simulator): max level, position,
  // stat points per category, booster toggles. Kept in React state, not the URL.
  const [build, setBuildState] = useState<ProgressionState>(() => defaultProgressionState(initialData));
  const setBuild = (next: ProgressionState) => {
    setBuildState(next);
    setStatView("build");
  };
  const desktop = useDesktopLayout();
  // Mobile Progression sheet. It can only be open below lg: crossing to lg
  // closes it (the Modal's `open` turns false and its close event resets this).
  const [sheetOpen, setSheetOpen] = useState(false);

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
  // Without a panel the card's level cap is 1: "Max" = base + Booster 1 (dump).
  const tilesSource = hasProgression ? "current build" : view === "max" ? "max-level stats (Booster 1 on)" : "level-1 stats";
  // The card face prints the build's overall (as the reference prints its
  // build overall there); the header pill is the dump's max overall with its
  // visible "dump max · no proficiency bonus" note, so the two are never
  // confused.
  const cardPlayer = hasProgression ? { ...p, ovr: buildOvr } : p;
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
        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-[var(--color-text-on-backdrop)] lg:justify-start">
          {/* Each item after the first carries its own "·", so a wrapped line
              never ends on a dangling separator. */}
          <span>{posLabel}</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_attack.svg" alt="" width={12} height={12} className="size-3" />
            <span>
              <span className="sr-only">Attack style: </span>
              {playstyleAtk}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_defence.svg" alt="" width={12} height={12} className="size-3" />
            <span>
              <span className="sr-only">Defence style: </span>
              {playstyleDef}
            </span>
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
        </p>
      </header>

      {/* ================= TWO COLUMNS (DOM order = phone order) ================= */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[1fr_auto_auto]">
        {/* Card face + marks + Progression. From lg this block fills the
            grid's flexible first row (stretched to the row height), which is
            the sticky panel's travel range. */}
        <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
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
            From lg: the sticky card (max height = the viewport below the
            sticky header, scrolling inside). Below lg it is not rendered here
            (the dock and the sheet below take over); before the first client
            measurement CSS hides it on a phone. */}
        {hasProgression ? (
          desktop !== false && (
            <div className="efb-progression-sticky hidden lg:block">
              <ProgressionPanel player={p} state={build} result={buildResult} onChange={setBuild} highlight={highlight} onHighlight={onHighlight} />
            </div>
          )
        ) : (
          <p data-testid="progression-none" className="efb-card text-sm text-[var(--color-text-secondary)]">
            No Progression panel for this card: its max level is 1, so it has no training points to spend (and no build to choose a manager for).
          </p>
        )}
        </div>

        {/* ================= MAIN COLUMN ================= */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
          {/* Overview */}
          <section aria-labelledby="overview-title" className="efb-card space-y-4">
            <div className="-mx-4 border-b border-[var(--color-line-separator)] px-4">
              <h2 id="overview-title" className="efb-card__title inline-block border-b-2 border-[var(--color-accent)] pb-1.5">
                Overview
              </h2>
            </div>
            <p className="text-sm leading-6 text-white/85">
              {p.name}&apos;s {CARD_TYPE_LABELS[p.cardType]} card{p.pack ? ` from "${p.pack.name}"` : ""} is rated {p.ovr}
              {p.maxOvr > p.ovr ? `, peaking at ${p.maxOvr} at level ${p.levelCap}` : ""}. A {p.height} cm ({heightImperial}) {posLabel} with the{" "}
              {playstyleAtk} playing style
              {p.countryName ? `, from ${p.countryName}` : ""}
              {p.teamName ? `, playing for ${p.teamName}` : ""}.
              {skillLabels.length > 0
                ? ` Features ${skillLabels.length} skill${skillLabels.length === 1 ? "" : "s"}: ${skillLabels.slice(0, SKILLS_PREVIEW).join(", ")}${
                    skillLabels.length > SKILLS_PREVIEW ? ` and ${skillLabels.length - SKILLS_PREVIEW} more` : ""
                  }.`
                : " Has no skills."}
              {p.releaseDate ? ` Released ${formatUtcDate(p.releaseDate)}.` : ""}
            </p>
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

            {hasProgression && <CategoryRow allocation={build.trainingPoints} highlight={highlight} onHighlight={onHighlight} />}

            {showBoosters && (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Boosters">
                {boosterSlots.map(({ slot, info }) => {
                  const on = hasProgression && info.usable && build.boosters[slot];
                  if (!hasProgression || !info.usable) {
                    return (
                      <div
                        key={slot}
                        className="efb-booster-button"
                        data-testid={`progression-booster-${slot + 1}`}
                        data-usable={info.usable ? "true" : "false"}
                        title={
                          info.usable
                            ? `Booster ${slot + 1}: ${info.label}${slot === 0 ? " (inside the dump's max-level stats)" : ""}`
                            : `Booster ${slot + 1}: ${info.label}`
                        }
                      >
                        <Sparkles className="size-4 shrink-0" aria-hidden />
                        <span className="efb-booster-button__label min-w-0 break-words">
                          <span className="sr-only">Booster {slot + 1}: </span>
                          {info.label}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={slot}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleBooster(slot)}
                      className="efb-booster-button hit-44"
                      data-testid={`progression-booster-${slot + 1}`}
                      data-usable="true"
                      title={`Booster ${slot + 1}: ${info.label} — ${on ? "on, click to turn it off" : "off, click to turn it on"}`}
                    >
                      <Sparkles className="size-4 shrink-0" aria-hidden />
                      <span className="efb-booster-button__label min-w-0 break-words">
                        <span className="sr-only">Booster {slot + 1}: </span>
                        {/* The stored names read "Booster +5 · Dribble, …"; the
                            button drops the repeated word (full name in the
                            title and the accessible name). */}
                        <span className="sr-only">Booster </span>
                        {info.label.replace(/^Booster\s+/, "")}
                      </span>
                      <span aria-hidden className={`shrink-0 text-xs ${on ? "" : "text-[var(--color-text-secondary)]"}`}>
                        {on ? "On" : "Off"}
                      </span>
                    </button>
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
                Base stats + training + the Manager Proficiency bonus, limited to 99, then active boosters + the manager&apos;s +1 (cyan chips are booster bumps, lime chips the manager; the training lift and the bonus are inside the value, a stat&apos;s tooltip splits it — &quot;Max&quot; shows the dump&apos;s own max-level values, without the bonus, instead).
                {highlight ? " Click the highlighted stat or category again to clear the highlight." : " Click a stat or a category to highlight the stats it trains."}
              </p>
            )}
            <StatGrid
              values={stats}
              boosterDeltas={boosterDeltas}
              trainingDeltas={trainingDeltas}
              capDeltas={capDeltas}
              proficiencyDeltas={proficiencyDeltas}
              managerDeltas={managerDeltas}
              highlight={highlight}
              onHighlight={onHighlight}
            />

            {/* Skills — Showtime first (gold), classic after; each chip opens a
                popover with the skill's artwork, description and boosts. */}
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
                <div className="text-sm text-[var(--color-text-secondary)]">At {posLabel}</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-2xl font-bold tabular-nums ${statTierClass(tiles[regPos])}`} data-testid="at-position-value">
                    {tiles[regPos]}
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

            <div className="grid items-start gap-3 md:grid-cols-2">
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--color-panel)] p-4">
                <PitchMap positionAptitudes={p.positionAptitudes} tiles={tiles} registeredPosition={regPos} />
                <p className="max-w-[350px] text-xs leading-relaxed text-[var(--color-text-secondary)]" data-testid="pitch-note">
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
                      <span key={role} className="rounded-md bg-[#5cbf2a] px-2 py-0.5 text-sm font-semibold text-black" title="Full proficiency">
                        {role}
                      </span>
                    ))}
                    {halfPositions.map((role) => (
                      <span key={role} className="rounded-md bg-[#3d6b25] px-2 py-0.5 text-sm font-semibold text-white" title="Half proficiency">
                        {role}
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

        {/* Card Info (left column, after the main column on a phone) */}
        <div className="lg:col-start-1 lg:row-start-2">
          <CardInfo player={p} />
        </div>

        {/* Other Versions */}
        <section aria-labelledby="versions-title" data-testid="other-versions" className="efb-card lg:col-start-1 lg:row-start-3 lg:self-start">
          <h2 id="versions-title" className="efb-card__title">
            Other Versions <span className="text-[var(--color-text-secondary)]">· {versionPreviews.length}</span>
          </h2>
          {versionPreviews.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">This is the only card of {p.name}.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {shownVersions.map((v) => (
                <li key={v.id} className="min-w-0">
                  <PlayerCard player={v} size="full" caption="none" />
                </li>
              ))}
              {collapsed && (
                <li className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setAllVersions(true)}
                    aria-label={`Show ${hiddenVersions} more versions`}
                    className="flex aspect-[240/339] w-full items-center justify-center rounded-lg bg-[var(--color-default)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-default-hover)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                  >
                    +{hiddenVersions}
                  </button>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {/* Phone (< lg): category strip + dock above the tab bar, opening the
          bottom sheet with the full panel (same `build` state). */}
      {hasProgression && (
        <>
          {desktop !== true && <ProgressionDock state={build} result={buildResult} onChange={setBuild} onOpen={() => setSheetOpen(true)} />}
          {/* Mounted whenever the card has a panel; its content exists only
              while open, so there is never a second panel instance next to
              the column's. */}
          <Modal open={sheetOpen && desktop === false} onClose={() => setSheetOpen(false)} title="Progression" variant="sheet">
            <ProgressionPanel player={p} state={build} result={buildResult} onChange={setBuild} highlight={highlight} onHighlight={onHighlight} embedded />
          </Modal>
        </>
      )}
    </div>
  );
}
