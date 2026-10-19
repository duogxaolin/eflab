"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PitchMap } from "@/components/players/PitchMap";
import { QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";
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
import {
  ProgressionPanel,
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
import { POSITION_LABEL, positionOf, playingStyleLabel } from "@/lib/card-display";

// Player detail page body (efootbase layout, efootbase-parity-round2):
//   header   name + ONE pill "{maxOvr} OVR" (the card's overall at its max
//            level from the dump — efootbase's pill), position · styles;
//   left     card (face shows the live build estimate, MAX badge = dump max),
//            Progression, Card Info, Other Versions;
//   main     overview text + specs line, ten-category readout, stat grid
//            (five tier colours, "+N" booster / "+1" manager chips,
//            click-to-highlight), skills (Showtime first), Body Model,
//            Position & Playstyle (Best Fit / At POS / "N Full · N Half",
//            pitch, style cards, WF / Form / Injury Resistance stars).
// The Progression state lives here because the stat grid, the card face and
// the Pitch Map render the engine's projection; it opens on the Max-OVR build
// with every usable booster on and no manager (defaultProgressionState).
// Best Fit, "At POS" and the 13 Pitch Map values come from the exact overall
// formula (`positionTiles`) on the stats shown — the build's when the card has
// a Progression panel, otherwise the stat grid's — never from the stored
// eFHUB ratings (change efootbase-exact-model-managers).

// Key stats shown on the attack / defence playing-style cards.
const ATTACK_KEY_STATS: readonly BaseStat[] = ["offensiveAwareness", "finishing", "dribbling", "lowPass"];
const DEFENCE_KEY_STATS: readonly BaseStat[] = ["defensiveAwareness", "ballWinning", "defensiveEngagement", "aggression"];

const WEAK_FOOT_MAX = 4;
/** Form / injury resistance are stored 0–2 and shown as value + 1 stars of 3 (efootbase). */
const THREE_STAR_MAX = 3;
const SKILLS_PREVIEW = 3;
const VERSIONS_PREVIEW = 8;

/** Which values the stat grid shows: the Progression build's projection, the
 *  dump's max-level stats (`max_attributes`, a different lift that includes
 *  the dump's own booster handling) or the level-1 base. Any change in the
 *  Progression panel switches back to "build", so the two "max" meanings
 *  never mix without the user choosing one. */
type StatView = "build" | "max" | "base";

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
  // Progression build (player-progression-simulator): max level, position,
  // stat points per category, booster toggles. Kept in React state, not the URL.
  const [build, setBuildState] = useState<ProgressionState>(() => defaultProgressionState(initialData));
  const setBuild = (next: ProgressionState) => {
    setBuildState(next);
    setStatView("build");
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
      <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] text-sm text-[var(--color-text-dim)] space-y-3">
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

  const orderedSkills = orderSkills(p.skills, skillBySlug);
  const skillLabels = orderedSkills.map((slug) => skillDisplayName(slug, skillBySlug.get(slug)));
  const showtimeCount = orderedSkills.filter((slug) => isShowtimeSkill(skillBySlug.get(slug))).length;

  const regPos: Position = POSITIONS[p.registeredPosition] ?? "GK";
  const fullPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 0);
  const halfPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 1);
  const proficiencyText = `${fullPositions.length} Full${halfPositions.length > 0 ? ` · ${halfPositions.length} Half` : ""}`;

  // Cards with a level cap of 1 have no training points — no panel for them.
  const hasProgression = p.levelCap > 1;
  const customBuild = hasProgression && isCustomBuild(build, buildDefaults, p);
  const view: StatView = hasProgression ? statView : statView === "build" ? "max" : statView;
  const stats = view === "build" ? buildResult.projectedStats : view === "max" ? p.maxStats : p.stats;
  const boosterDeltas = view === "build" ? buildResult.boosterDeltas : undefined;
  const trainingDeltas = view === "build" ? buildResult.trainingDeltas : undefined;
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
  // The card face prints the build's overall (efootbase prints its build
  // overall there); the MAX badge stays the dump's max overall and the pill
  // in the header is the same number, so the two are never confused.
  const cardPlayer = hasProgression ? { ...p, ovr: buildOvr } : p;
  const atkDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleAtk];
  const defDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleDef];
  const onHighlight = (next: TrainingCategory | null) => setHighlight(next);

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
  const shownVersions = allVersions ? versionPreviews : versionPreviews.slice(0, VERSIONS_PREVIEW);
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

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 list-none p-0 m-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/">Home</Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/players">Players</Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item text-[var(--color-text-secondary)] text-xs">
          {p.name}
          <span className="breadcrumbs__separator text-xs ml-1">›</span>
        </li>
        <li className="breadcrumbs__item text-white text-xs font-medium">{packTitle}</li>
      </ol>

      {/* ================= HEADER: name + one OVR pill ================= */}
      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{p.name}</h1>
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
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)] whitespace-nowrap" data-testid="ovr-pill-note">
            dump max · no proficiency bonus
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-secondary)]">
          <span className="font-bold text-white">{posLabel}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5 text-rose-300">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_attack.svg" alt="" width={12} height={12} className="size-3" />
            {playstyleAtk}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5 text-sky-300">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_defence.svg" alt="" width={12} height={12} className="size-3" />
            {playstyleDef}
          </span>
          <span className="font-mono text-[11px] text-[var(--color-text-dim)] sm:ml-auto">
            {CARD_TYPE_LABELS[p.cardType]}
            {p.pack ? ` · ${p.pack.name}` : ""}
          </span>
        </div>
      </header>

      {/* ================= TWO COLUMNS (DOM order = phone order) ================= */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start">
        {/* Card + emblems */}
        <div className="flex flex-col items-center gap-3 lg:col-start-1 lg:row-start-1">
          <div className="relative w-full max-w-[220px]">
            <PlayerCard player={cardPlayer} size="full" showDetails priority />
            {hasProgression && (
              <div
                data-testid="card-build-overall"
                className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded-md border border-[var(--color-accent)]/40 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-accent)]"
                title="The card face shows the overall of the current build"
              >
                <span className="sr-only">Overall of the current build: </span>
                {buildOvr} <span className="sr-only">at</span> {build.position}
                <span aria-hidden className="text-[8px] font-semibold text-[var(--color-text-dim)]"> BUILD</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-[var(--color-line)] bg-[var(--color-panel)]" title={p.countryName ?? "Nationality"}>
              {p.flagUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.flagUrl} alt={p.countryName ?? ""} width={28} height={28} loading="lazy" decoding="async" className="size-7 object-contain" />
              ) : (
                <span className="text-[9px] text-[var(--color-text-dim)]">—</span>
              )}
            </div>
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-1" title={p.teamName ?? "Team"}>
              {p.teamEmblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.teamEmblemUrl} alt={p.teamName ?? ""} width={28} height={28} loading="lazy" decoding="async" className="size-7 object-contain" />
              ) : (
                <span className="text-[9px] text-[var(--color-text-dim)]">—</span>
              )}
            </div>
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-1" title={p.leagueName ?? "League"}>
              {p.leagueEmblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.leagueEmblemUrl} alt={p.leagueName ?? ""} width={28} height={20} loading="lazy" decoding="async" className="h-5 w-auto object-contain" />
              ) : (
                <span className="text-[9px] text-[var(--color-text-dim)]">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Progression — hidden for level-cap-1 cards (no training points). */}
        <div className="lg:col-start-1 lg:row-start-2">
          {hasProgression ? (
            <ProgressionPanel player={p} state={build} result={buildResult} onChange={setBuild} highlight={highlight} onHighlight={onHighlight} />
          ) : (
            <p
              data-testid="progression-none"
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-3 text-xs text-[var(--color-text-secondary)] shadow-sm"
            >
              No Progression panel for this card: its max level is 1, so it has no training points to spend (and no build to choose a manager for).
            </p>
          )}
        </div>

        {/* ================= MAIN COLUMN ================= */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:row-span-4">
          {/* Overview + stats */}
          <section
            aria-labelledby="overview-title"
            className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-4 shadow-sm"
          >
            <h2 id="overview-title" className="text-xs font-bold text-white uppercase tracking-wider">Overview</h2>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--color-text-secondary)]" data-testid="spec-line">
              <span>{p.height} CM</span>
              <span aria-hidden>·</span>
              <span>{p.weight} KG</span>
              <span aria-hidden>·</span>
              <span>{p.age} years</span>
              <span aria-hidden>·</span>
              <span>Strong Foot: <span className="text-white">{p.strongerFoot === 1 ? "Left" : p.strongerFoot === 2 ? "Both" : "Right"}</span></span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5">
                WF Accuracy <StarRating filled={p.weakFootAccuracy} max={WEAK_FOOT_MAX} label="Weak foot accuracy" />
              </span>
              <span className="inline-flex items-center gap-1.5">
                WF Usage <StarRating filled={p.weakFootUsage} max={WEAK_FOOT_MAX} label="Weak foot usage" />
              </span>
            </div>

            {hasProgression && <CategoryRow allocation={build.trainingPoints} highlight={highlight} onHighlight={onHighlight} />}

            {/* Stat view: build projection (default) / dump max / base. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line-separator)] pt-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider" data-testid="stats-heading">{statsHeading}</h3>
              <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/[0.04] border border-white/10" role="group" aria-label="Stat view">
                {viewOptions.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    data-testid={`stat-view-${v}`}
                    onClick={() => setStatView(v)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                      view === v ? "bg-[var(--color-accent)] text-black font-bold" : "text-white/70 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {view === "build" && (
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Base stats + training + the Manager Proficiency bonus + active boosters + the manager&apos;s +1 (cyan chips are booster bumps, lime chips the manager; the training lift and the bonus are inside the value, a stat&apos;s tooltip splits it — &quot;Max&quot; shows the dump&apos;s own max-level values, without the bonus, instead).
                {highlight ? " Click the highlighted stat or category again to clear the highlight." : " Click a stat or a category to highlight the stats it trains."}
              </p>
            )}
            <StatGrid
              values={stats}
              boosterDeltas={boosterDeltas}
              trainingDeltas={trainingDeltas}
              proficiencyDeltas={proficiencyDeltas}
              managerDeltas={managerDeltas}
              highlight={highlight}
              onHighlight={onHighlight}
            />

            {/* Skills — Showtime first (gold), classic after; each chip opens a
                popover with the skill's artwork, description and boosts. */}
            <div className="space-y-2 border-t border-[var(--color-line-separator)] pt-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Skills <span className="font-normal normal-case text-[var(--color-text-dim)]">· {skillLabels.length}{showtimeCount ? ` · ${showtimeCount} Showtime` : ""}</span>
              </h3>
              {skillLabels.length === 0 ? (
                <p className="text-xs text-[var(--color-text-dim)]">No skills.</p>
              ) : skillsQ.isPending ? (
                // Same chip height while the skill list loads (it is cached for an hour).
                <ul className="flex flex-wrap gap-1.5" aria-busy="true" aria-label="Loading skills">
                  {orderedSkills.map((slug) => (
                    <li key={slug} className="h-[24px] w-24 rounded-md bg-[var(--color-elevated)] animate-pulse" />
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-wrap gap-1.5" aria-label="Skills" data-testid="skill-list">
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
          <section aria-labelledby="pos-title" className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-5 shadow-sm">
            <h2 id="pos-title" className="text-xs font-bold text-white uppercase tracking-wider">Position &amp; Playstyle</h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">Best Fit</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-white">{POSITION_LABEL[bestPos]}</span>
                  <span className="text-sm font-mono font-bold text-stat-tier-cyan" data-testid="best-fit-value">{tiles[bestPos]}</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">At {posLabel}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-white" data-testid="at-position-value">{tiles[regPos]}</span>
                  <span className="text-[11px] text-[var(--color-text-dim)]">{tilesSource}</span>
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">Proficiency</div>
                <div className="mt-1 text-2xl font-bold text-[var(--color-accent)]" data-testid="proficiency-text">
                  {proficiencyText}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[350px_minmax(0,1fr)] items-start pt-1">
              <div className="flex w-full flex-col items-center gap-2 mx-auto lg:mx-0">
                <PitchMap positionAptitudes={p.positionAptitudes} tiles={tiles} registeredPosition={regPos} />
                <p className="max-w-[350px] text-[11px] leading-relaxed text-[var(--color-text-dim)]" data-testid="pitch-note">
                  Overall at each position, computed with efootbase&apos;s formula from the {tilesSource}.
                  {hasProgression ? "" : " Matched efootbase's own tiles on the five measured cards; other cards are not checked tile by tile."}
                </p>
              </div>

              <div className="space-y-4">
                {/* Attack playing style — from the attacking data */}
                <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_attack.svg" alt="" width={16} height={16} className="size-4" />
                    <span className="font-bold text-sm text-white">{playstyleAtk}</span>
                    <span className="text-[10px] uppercase tracking-wider text-rose-300/80 ml-auto">Attack</span>
                  </div>
                  {atkDesc && <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{atkDesc}</p>}
                  <KeyStats statKeys={ATTACK_KEY_STATS} values={stats} boosterDeltas={boosterDeltas} />
                </div>

                {/* Defence playing style — from the defensive data */}
                <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_defence.svg" alt="" width={16} height={16} className="size-4" />
                    <span className="font-bold text-sm text-white">{playstyleDef}</span>
                    <span className="text-[10px] uppercase tracking-wider text-sky-300/80 ml-auto">Defence</span>
                  </div>
                  {playstyleDef === "Basic" ? (
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">No defensive playing style — the AI defends with the default behaviour.</p>
                  ) : (
                    defDesc && <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{defDesc}</p>
                  )}
                  <KeyStats statKeys={DEFENCE_KEY_STATS} values={stats} boosterDeltas={boosterDeltas} />
                </div>

                {/* Compatible positions (aptitude data) */}
                <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                  <div className="text-xs font-bold text-white">Compatible positions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fullPositions.map((role) => (
                      <span key={role} className="px-2 py-0.5 rounded bg-[#7DFF1FB3] text-[10px] font-mono font-bold text-black" title="Full proficiency">
                        {role}
                      </span>
                    ))}
                    {halfPositions.map((role) => (
                      <span key={role} className="px-2 py-0.5 rounded bg-[#7DFF1F4D] border border-[#7DFF1F]/30 text-[10px] font-mono font-bold text-white" title="Half proficiency">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI Playing Styles */}
                <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                  <div className="text-xs font-bold text-white">AI Playing Styles</div>
                  <div className="flex flex-wrap gap-1.5">
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
                        <span key={key} className="px-2.5 py-1 rounded-md bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-white">
                          {label}
                        </span>
                      ))}
                    {Object.values(p.playstyles).every((v) => !v) && <span className="text-xs text-[var(--color-text-dim)]">None.</span>}
                  </div>
                </div>

                {/* WF / Form / Injury Resistance (efootbase's star list) */}
                <dl className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-1.5 text-xs" data-testid="star-list">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">WF Usage</dt>
                    <dd><StarRating filled={p.weakFootUsage} max={WEAK_FOOT_MAX} label="Weak foot usage" /></dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">WF Accuracy</dt>
                    <dd><StarRating filled={p.weakFootAccuracy} max={WEAK_FOOT_MAX} label="Weak foot accuracy" /></dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">Form</dt>
                    <dd data-testid="form-stars">
                      {typeof p.form === "number" ? (
                        <StarRating filled={p.form + 1} max={THREE_STAR_MAX} label="Form" />
                      ) : (
                        <span className="text-[var(--color-text-dim)]" title="Stored for every card; the player API does not expose it yet">not exposed by the API yet</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">Injury Resistance</dt>
                    <dd data-testid="injury-stars">
                      {typeof p.injuryResistance === "number" ? (
                        <StarRating filled={p.injuryResistance + 1} max={THREE_STAR_MAX} label="Injury resistance" />
                      ) : (
                        <span className="text-[var(--color-text-dim)]" title="Stored for every card; the player API does not expose it yet">not exposed by the API yet</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </div>

        {/* Card Info (left column, after the main column on a phone) */}
        <div className="lg:col-start-1 lg:row-start-3">
          <CardInfo player={p} />
        </div>

        {/* Other Versions */}
        <section
          aria-labelledby="versions-title"
          data-testid="other-versions"
          className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 shadow-sm lg:col-start-1 lg:row-start-4"
        >
          <h2 id="versions-title" className="text-xs font-bold text-white uppercase tracking-wider">
            Other Versions <span className="font-normal normal-case text-[var(--color-text-dim)]">· {versionPreviews.length}</span>
          </h2>
          {versionPreviews.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">This is the only card of {p.name}.</p>
          ) : (
            <>
              <ul className="mt-3 grid grid-cols-4 gap-2">
                {shownVersions.map((v) => (
                  <li key={v.id} className="min-w-0">
                    <PlayerCard player={v} size="full" />
                  </li>
                ))}
              </ul>
              {hiddenVersions > 0 && (
                <button
                  type="button"
                  onClick={() => setAllVersions(true)}
                  className="button button--sm button--secondary mt-3 w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                >
                  +{hiddenVersions} more
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
