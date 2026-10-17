"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PitchMap } from "@/components/players/PitchMap";
import { QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";
import {
  BASE_STATS,
  CARD_TYPE_LABELS,
  PLAYING_STYLE_DESCRIPTIONS,
  POSITIONS,
  formatFeetInches,
  positionFromIndex,
  simulateBuild,
  type BaseStat,
  type Position,
  type PlayerCardDTO,
} from "@eflab/shared";
import {
  ProgressionPanel,
  defaultProgressionState,
  isCustomBuild,
  type ProgressionState,
} from "@/components/build-simulator/ProgressionPanel";
import { Copy, Check, Star } from "lucide-react";
import {
  ATTACKING_STATS,
  DEFENDING_STATS,
  STRENGTH_STATS,
  POSITION_LABEL,
  positionOf,
  playingStyleLabel,
  statLabel,
  conditionLabel,
  strongerFootLabel,
  statTierClass,
  statTierBg,
} from "@/lib/card-display";

// Stat value tier → text/bg classes from the shared `--color-tier-*` tokens
// (statTierClass / statTierBg in lib/card-display.ts — 90+ elite, 80–89 high,
// 70–79 mid, <70 low). Dark text on the bright tiers, white on the red one.
function getTierClasses(val: number) {
  return {
    text: statTierClass(val),
    bg: `${statTierBg(val)} ${val >= 70 ? "text-black" : "text-white"} font-bold`,
  };
}

// Premium skills (efootbase calls them out in gold).
const PREMIUM_SKILL_SLUGS = new Set([
  "momentum-dribbling",
  "acceleration-burst",
  "phenomenal-finishing",
  "phenomenal-passing",
  "edged-crossing",
  "game-changing-pass",
  "visionary-pass",
  "fortress",
  "bullet-header",
]);

// Key stats shown on the attack / defence playing-style cards.
const ATTACK_KEY_STATS: readonly BaseStat[] = ["offensiveAwareness", "finishing", "dribbling", "lowPass"];
const DEFENCE_KEY_STATS: readonly BaseStat[] = ["defensiveAwareness", "ballWinning", "defensiveEngagement", "aggression"];

const WEAK_FOOT_MAX = 4;
const SKILLS_PREVIEW = 5;

/** 1–4 weak-foot level rendered as that many filled stars out of four. */
function WeakFootStars({ level, label }: { level: number; label: string }) {
  const filled = Math.min(WEAK_FOOT_MAX, Math.max(0, Math.round(level)));
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${filled} of ${WEAK_FOOT_MAX}`}>
      {Array.from({ length: WEAK_FOOT_MAX }, (_, i) => (
        <Star
          key={i}
          className={`size-3 ${i < filled ? "fill-[var(--color-accent)] text-[var(--color-accent)]" : "text-white/25"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "versions", label: "Other versions" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function PlayerDetailClient({
  baseId,
  cardId,
  initialData,
}: {
  baseId: string;
  cardId: string;
  initialData: PlayerCardDTO;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [copiedId, setCopiedId] = useState(false);
  // Stat view without a custom build: the dump's trained ceiling
  // (max_attributes) or the base values. While the Progression panel holds a
  // custom build the sections show the engine's projection instead and this
  // toggle is disabled, so the two "max" meanings never mix.
  const [statView, setStatView] = useState<"max" | "base">("max");
  // Progression build (player-progression-simulator): max level, position,
  // stat points per category, booster toggles. Kept in React state, not the URL.
  const [build, setBuild] = useState<ProgressionState>(() => defaultProgressionState(initialData));

  const q = trpc.player.byId.useQuery({ baseId, cardId }, { initialData });
  const p = q.data ?? initialData;

  const buildDefaults = useMemo(() => (p ? defaultProgressionState(p) : null), [p]);
  // Pure, client-side engine — the same rules as community.simulate.
  const buildResult = useMemo(
    () =>
      p
        ? simulateBuild({
            base: p.stats,
            levelCap: p.levelCap,
            registeredPosition: positionFromIndex(p.registeredPosition),
            config: { playerId: p.id, ...build },
            boosters: [p.booster1, p.booster2],
            positionAptitudes: p.positionAptitudes,
          })
        : null,
    [p, build],
  );

  // Skill slug → display name (the DTO carries slugs; names live in skill.list).
  const skillsQ = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });
  const skillName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of skillsQ.data ?? []) map.set(s.slug, s.name);
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
  const condLetter = p.condition && /^[a-eA-E]$/.test(p.condition) ? p.condition.toUpperCase() : null;
  const heightImperial = formatFeetInches(p.height);

  const copyCardId = () => {
    void navigator.clipboard.writeText(p.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const skillNames = p.skills.map((slug) => skillName.get(slug) ?? slug);
  const premiumSkills = p.skills.filter((slug) => PREMIUM_SKILL_SLUGS.has(slug));
  const moreSkills = skillNames.length > SKILLS_PREVIEW;

  // Best Fit: highest *known* rating over every position (null ratings are
  // skipped, never treated as 0); falls back to the registered position when
  // the eFHUB cross-fill has no ratings for this card.
  const regPos: Position = POSITIONS[p.registeredPosition] ?? "GK";
  const atRegRating = p.positionRatings[regPos];
  let bestPos: Position = regPos;
  let bestRating: number | null = typeof atRegRating === "number" ? atRegRating : null;
  for (const k of POSITIONS) {
    const v = p.positionRatings[k];
    if (typeof v !== "number") continue;
    if (bestRating === null || v > bestRating) {
      bestRating = v;
      bestPos = k;
    }
  }
  const fullPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 0);
  const halfPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 1);

  // Cards with a level cap of 1 have no training points — no panel for them.
  const hasProgression = p.levelCap > 1;
  const customBuild = hasProgression && isCustomBuild(build, buildDefaults, p);
  const stats = customBuild ? buildResult.projectedStats : statView === "max" ? p.maxStats : p.stats;
  // Training + booster deltas per stat (highlighted in the stat sections).
  const statDeltas = customBuild
    ? (Object.fromEntries(BASE_STATS.map((s) => [s, buildResult.trainingDeltas[s] + buildResult.boosterDeltas[s]])) as Record<BaseStat, number>)
    : undefined;
  const jumpNotProjected = customBuild && buildResult.jumpNotProjected;
  const estimatedOvr = buildResult.estimatedOvr;
  // The card overlay carries the estimate in its MAX badge while a build is
  // active (marked "~" by the pill on the wrapper); the OVR block stays the
  // card's real level-1 rating.
  const cardPlayer = customBuild ? { ...p, maxOvr: estimatedOvr } : p;
  const atkDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleAtk];
  const defDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleDef];

  const tabButton = (key: TabKey, label: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      id={`player-tab-${key}`}
      aria-selected={activeTab === key}
      aria-controls={`player-panel-${key}`}
      tabIndex={activeTab === key ? 0 : -1}
      onClick={() => setActiveTab(key)}
      className={`pb-2 border-b-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
        activeTab === key ? "text-white border-[var(--color-accent)]" : "text-[var(--color-text-dim)] border-transparent hover:text-white"
      }`}
    >
      {label}
    </button>
  );

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

      {/* ================= SECTION 1: HERO ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
        {/* Card cluster: emblems + card + specs + boosters */}
        <div className="flex flex-col gap-3 shrink-0 mx-auto lg:mx-0 max-w-full">
          <div className="grid grid-cols-[auto_minmax(0,195px)_auto] items-stretch gap-2.5">
            <div className="flex shrink-0 flex-col justify-between py-0.5">
              <div className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm" title={p.countryName ?? "Nationality"}>
                {p.flagUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.flagUrl} alt={p.countryName ?? ""} width={32} height={32} loading="lazy" decoding="async" className="size-8 object-contain" />
                ) : (
                  <span className="text-xs text-[var(--color-text-dim)]" aria-hidden>🌍</span>
                )}
              </div>
              <div className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm p-1" title={p.teamName ?? "Team"}>
                {p.teamEmblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.teamEmblemUrl} alt={p.teamName ?? ""} width={32} height={32} loading="lazy" decoding="async" className="size-8 object-contain" />
                ) : (
                  <span className="text-xs text-[var(--color-text-dim)]" aria-hidden>⚽</span>
                )}
              </div>
              <div className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm p-1" title={p.leagueName ?? "League"}>
                {p.leagueEmblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.leagueEmblemUrl} alt={p.leagueName ?? ""} width={32} height={24} loading="lazy" decoding="async" className="h-6 w-auto object-contain" />
                ) : (
                  <span className="text-[10px] text-[var(--color-text-dim)] font-bold" aria-hidden>🏆</span>
                )}
              </div>
              <div className="flex size-11 flex-col items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm" title={`Max level ${p.levelCap}`}>
                <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Lv</span>
                <span className="font-mono text-sm font-bold text-[var(--color-text-secondary)] leading-none">{p.levelCap}</span>
              </div>
            </div>

            {/* The card — full DTO (carries levelCap for the MAX LEVEL badge). */}
            <div className="w-full max-w-[195px] shrink-0">
              <div className="relative w-full rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]">
                <PlayerCard player={cardPlayer} size="full" showDetails />
                {customBuild && (
                  <div
                    data-testid="card-estimate"
                    className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded-md border border-[var(--color-accent)]/40 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-accent)]"
                  >
                    <span aria-hidden>~</span>
                    <span className="sr-only">Estimated overall about </span>
                    {estimatedOvr} <span className="sr-only">at {build.position}</span>
                    <span aria-hidden className="text-[8px] font-semibold text-[var(--color-text-dim)]"> EST</span>
                  </div>
                )}
              </div>
            </div>

            <dl className="flex shrink-0 flex-col justify-between py-0.5">
              {(
                [
                  ["Height", `${p.height} cm`, heightImperial],
                  ["Weight", `${p.weight} kg`, null],
                  ["Age", String(p.age), null],
                  ["Foot", strongerFootLabel(p.strongerFoot), null],
                  ["Condition", condLetter ?? "—", condLetter ? conditionLabel(condLetter) : null],
                ] as const
              ).map(([label, value, sub]) => (
                <div key={label} className="w-[78px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1.5 text-center shadow-sm">
                  <dt className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">{label}</dt>
                  <dd className="mt-0.5 font-mono text-xs font-bold text-white">
                    {value}
                    {sub && <span className="block text-[9px] font-normal text-[var(--color-text-dim)]">{sub}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Boosters */}
          <div className="flex items-center gap-2">
            {[p.booster1, p.booster2].map((b, i) => (
              <div key={i} className="flex h-9 flex-1 min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 text-xs shadow-sm">
                <span className={`truncate ${b ? "font-semibold text-white/90" : "text-[var(--color-text-dim)]"}`}>{b?.name ?? `Booster ${i + 1}: none`}</span>
                {b && <span className="font-mono text-[10px] text-cyan-400 shrink-0 font-bold">+{b.magnitude}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Identity & tabs */}
        <div className="flex flex-col gap-6 min-w-0 flex-1">
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">{p.name}</h1>
                  <span className="chip chip--accent chip--lg tabular-nums">
                    <span className="chip__label">{p.ovr} OVR</span>
                  </span>
                  {p.maxOvr > p.ovr && (
                    <span className="text-xs text-[var(--color-text-dim)] font-mono tabular-nums">Max {p.maxOvr}</span>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-bold text-white px-2 py-0.5 rounded bg-[var(--color-canvas)] border border-[var(--color-line)]">{posLabel}</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-semibold text-xs border border-rose-500/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_attack.svg" alt="" width={12} height={12} className="size-3" />
                    <span>{playstyleAtk}</span>
                  </span>
                  {playstyleDef !== "Basic" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/15 text-sky-300 font-semibold text-xs border border-sky-500/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/playstyle_defence.svg" alt="" width={12} height={12} className="size-3" />
                      <span>{playstyleDef}</span>
                    </span>
                  )}
                  <span className="text-[var(--color-text-dim)] font-mono text-[11px] ml-auto">
                    {CARD_TYPE_LABELS[p.cardType]}
                    {p.pack ? ` · ${p.pack.name}` : ""}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={copyCardId}
                className="text-[var(--color-text-dim)] hover:text-white p-1 rounded transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                title="Copy Card ID"
                aria-label={copiedId ? "Card ID copied" : "Copy card ID"}
              >
                {copiedId ? <Check className="size-4 text-emerald-400" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              </button>
            </div>

            {/* Tabs */}
            <div className="pt-2 border-t border-[var(--color-line-separator)]">
              <div role="tablist" aria-label="Player details" className="flex items-center gap-6 border-b border-[var(--color-line)] pb-2 text-xs font-bold">
                {TABS.map((t) => tabButton(t.key, t.label))}
              </div>

              <div className="pt-2.5">
                {activeTab === "overview" && (
                  <div id="player-panel-overview" role="tabpanel" aria-labelledby="player-tab-overview" className="space-y-2">
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      {p.name}&apos;s {CARD_TYPE_LABELS[p.cardType]} card{p.pack ? ` from "${p.pack.name}"` : ""} is rated {p.ovr}
                      {p.maxOvr > p.ovr ? `, peaking at ${p.maxOvr} at level ${p.levelCap}` : ""}. A {p.height} cm ({heightImperial}) {posLabel} with the{" "}
                      {playstyleAtk} playing style
                      {p.countryName ? `, from ${p.countryName}` : ""}
                      {p.teamName ? `, playing for ${p.teamName}` : ""}.
                      {skillNames.length > 0
                        ? ` Features ${skillNames.length} skill${skillNames.length === 1 ? "" : "s"}: ${skillNames.slice(0, SKILLS_PREVIEW).join(", ")}${moreSkills ? "…" : "."}`
                        : " Has no skills."}
                      {p.releaseDate ? ` Released ${formatUtcDate(p.releaseDate)}.` : ""}
                    </p>
                    {skillNames.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Skills">
                        {p.skills.map((slug, i) => (
                          <li key={slug}>
                            <Link
                              href={`/skills/${slug}`}
                              className={`px-2 py-0.5 rounded-md border text-[11px] no-underline transition-colors ${
                                premiumSkills.includes(slug)
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                  : "bg-[var(--color-canvas)] border-[var(--color-line)] text-white/90 hover:border-[var(--color-line-active)]"
                              }`}
                            >
                              {skillNames[i]}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activeTab === "versions" && (
                  <div id="player-panel-versions" role="tabpanel" aria-labelledby="player-tab-versions">
                    {p.otherVersions.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-secondary)] py-2">This is the only card of {p.name}.</p>
                    ) : (
                      <ul className="divide-y divide-[var(--color-line-separator)]/60 text-xs">
                        {p.otherVersions.map((v) => (
                          <li key={v.id}>
                            <Link
                              href={`/players/${p.baseId}/${v.id}`}
                              className="flex items-center justify-between gap-3 py-1.5 no-underline text-white/90 hover:text-[var(--color-accent)] transition-colors"
                            >
                              <span>
                                {CARD_TYPE_LABELS[v.cardType]} · {positionOf(v.registeredPosition)}
                              </span>
                              <span className="font-mono tabular-nums text-[var(--color-text-secondary)]">
                                {v.ovr} OVR · Max {v.maxOvr}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Weak foot (1–4 scale) + card id */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-line-separator)] text-xs text-[var(--color-text-dim)] font-mono">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  WF Accuracy <WeakFootStars level={p.weakFootAccuracy} label="Weak foot accuracy" />
                </span>
                <span className="inline-flex items-center gap-1.5">
                  WF Usage <WeakFootStars level={p.weakFootUsage} label="Weak foot usage" />
                </span>
              </div>
              <div className="text-[11px]">
                ID: <span className="font-mono text-white/80">{p.id}</span>
              </div>
            </div>
          </div>

          {/* Progression — hidden for level-cap-1 cards (no training points). */}
          {hasProgression ? (
            <ProgressionPanel player={p} state={build} result={buildResult} onChange={setBuild} />
          ) : (
            <p
              data-testid="progression-none"
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-3 text-xs text-[var(--color-text-secondary)] shadow-sm"
            >
              No progression: this card&apos;s max level is 1, so it has no training points to spend.
            </p>
          )}

          {/* Stats — base vs max level (the dump's `max_attributes`), or the
              custom build's projection while the Progression panel is in use. */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider" data-testid="stats-heading">
                {customBuild
                  ? `Stats · custom build · level ${build.maxLevel} · ~${estimatedOvr} at ${build.position}`
                  : `Stats ${statView === "max" ? `at max level ${p.levelCap}` : "at level 1"}`}
              </h2>
              <div
                className={`flex items-center gap-1 p-0.5 rounded-full bg-white/[0.04] border border-white/10 ${customBuild ? "opacity-50" : ""}`}
                role="group"
                aria-label="Stat view"
                title={customBuild ? "Reset the Progression build to switch between the dump's max-level and base stats" : undefined}
              >
                {(
                  [
                    ["max", `Max (${p.maxOvr})`],
                    ["base", `Base (${p.ovr})`],
                  ] as const
                ).map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={!customBuild && statView === view}
                    disabled={customBuild}
                    onClick={() => setStatView(view)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                      !customBuild && statView === view ? "bg-[var(--color-accent)] text-black font-bold" : "text-white/70 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {customBuild && (
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Projected from the base stats + training + active boosters (engine estimate, not the dump&apos;s max-level values).
                {jumpNotProjected ? " Goalkeeper Jump is card-specific and not projected." : ""}
              </p>
            )}
            <div className="grid md:grid-cols-3 gap-6">
              <StatSection title="Attacking" statKeys={ATTACKING_STATS} values={stats} deltas={statDeltas} />
              <StatSection title="Defending" statKeys={DEFENDING_STATS} values={stats} deltas={statDeltas} />
              <StatSection title="Strength" statKeys={STRENGTH_STATS} values={stats} deltas={statDeltas} jumpNotProjected={jumpNotProjected} />
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECTION 2: POSITION & PLAYSTYLE ================= */}
      <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-5 shadow-sm">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Position &amp; Playstyle</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
            <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">Best Fit</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{POSITION_LABEL[bestPos]}</span>
              <span className="text-sm font-mono font-bold text-stat-tier-cyan">{bestRating ?? "n/a"}</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
            <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">At {posLabel}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{typeof atRegRating === "number" ? atRegRating : "n/a"}</span>
              {typeof atRegRating !== "number" && (
                <span className="text-[11px] text-[var(--color-text-dim)]">no position rating for this card</span>
              )}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
            <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">Proficiency</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[var(--color-accent)]">{fullPositions.length} Full</span>
              <span className="text-xs text-[var(--color-text-dim)]">· {halfPositions.length} Half</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[350px_minmax(0,1fr)] items-start pt-1">
          <div className="flex justify-center w-full mx-auto lg:mx-0">
            <PitchMap positionAptitudes={p.positionAptitudes} positionRatings={p.positionRatings} registeredPosition={regPos} />
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
              <KeyStats statKeys={ATTACK_KEY_STATS} values={stats} deltas={statDeltas} />
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
              <KeyStats statKeys={DEFENCE_KEY_STATS} values={stats} deltas={statDeltas} />
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
                    ["earlyCross", "Early Cross"],
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
          </div>
        </div>
      </div>
    </div>
  );
}

/** "+N" chip for a stat raised by training / boosters in the custom build. */
function DeltaChip({ delta }: { delta: number | undefined }) {
  if (!delta) return null;
  return (
    <span className="efb-stat-row__boost efb-stat-row__boost--cyan" data-testid="stat-delta">
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function KeyStats({
  statKeys,
  values,
  deltas,
}: {
  statKeys: readonly BaseStat[];
  values: Record<BaseStat, number>;
  deltas?: Record<BaseStat, number>;
}) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
      {statKeys.map((st) => {
        const v = values[st];
        return (
          <div key={st} className="rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] px-2 py-1.5">
            <dt className="text-[10px] text-[var(--color-text-dim)] truncate">{statLabel(st)}</dt>
            <dd className={`flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${getTierClasses(v).text}`}>
              {v}
              <DeltaChip delta={deltas?.[st]} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Stat section — one row per stat with the efootbase tier colour. With
 *  `deltas` (custom build) each raised stat carries a "+N" chip; a goalkeeper's
 *  Jump reads "n/a (card-specific)" because the rules cannot project it. */
function StatSection({
  title,
  statKeys,
  values,
  deltas,
  jumpNotProjected = false,
}: {
  title: string;
  statKeys: readonly BaseStat[];
  values: Record<BaseStat, number>;
  deltas?: Record<BaseStat, number>;
  jumpNotProjected?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[var(--color-line)] pb-1.5">{title}</h3>
      <div className="space-y-1">
        {statKeys.map((st) => {
          const val = values[st];
          const tier = getTierClasses(val);
          const na = jumpNotProjected && st === "jump";
          return (
            <div key={st} className="efb-stat-row" data-stat={st}>
              <span className={`efb-stat-row__label ${tier.text}`}>{statLabel(st)}</span>
              {!na && <DeltaChip delta={deltas?.[st]} />}
              {na ? (
                <span className="efb-stat-row__value !w-auto px-1.5 !text-[10px] bg-[var(--color-elevated)] !text-[var(--color-text-secondary)]" title="Goalkeeper Jump carries a card-specific offset the rules cannot reproduce">
                  n/a (card-specific)
                </span>
              ) : (
                <span className={`efb-stat-row__value ${tier.bg}`}>{val}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
