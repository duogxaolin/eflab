"use client";
import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PitchMap } from "@/components/players/PitchMap";
import {
  POSITIONS,
  type BaseStat,
  type PhysiqueField,
  type Position,
  type PlayerCardDTO,
} from "@eflab/shared";
import {
  PLAYING_STYLE_DESCRIPTIONS,
} from "@eflab/shared";
import {
  RotateCcw,
  Plus,
  Minus,
  ArrowLeft,
  Copy,
  Check,
  User,
  Share2,
  Sparkles,
} from "lucide-react";
import {
  ATTACKING_STATS,
  DEFENDING_STATS,
  STRENGTH_STATS,
  POSITION_BY_INDEX,
  POSITION_LABEL,
  PHYSIQUE_ORDER,
  PHYSIQUE_LABEL,
  DERIVED_LABEL,
  CARD_TYPE_LABEL,
  positionOf,
  playingStyleLabel,
  statLabel,
  statTierClass,
  statTierBg,
  conditionLabel,
  strongerFootLabel,
} from "@/lib/card-display";

// Stat value tier → text/bg classes (matches efootbase colour stems: 90+ cyan,
// 80–89 green, 70–79 yellow, <70 red).
function getTierClasses(val: number) {
  if (val >= 90) return { text: "text-stat-tier-cyan", bg: "bg-stat-tier-cyan text-black font-bold" };
  if (val >= 80) return { text: "text-stat-tier-green", bg: "bg-stat-tier-green text-black font-bold" };
  if (val >= 70) return { text: "text-stat-tier-yellow", bg: "bg-stat-tier-yellow text-black font-bold" };
  return { text: "text-stat-tier-red", bg: "bg-stat-tier-red text-white font-bold" };
}

// 10 training categories (efootbase "Progression" panel verbatim). The shared
// TRAINING_CATEGORIES has 8 (no split GK); efootbase splits Goalkeeping into 3
// so we keep the local 10-row list the detail page needs.
const ALL_TRAINING_CATEGORIES = [
  { key: "Shooting", label: "Shooting", icon: "🎯" },
  { key: "Passing", label: "Passing", icon: "⚽" },
  { key: "Dribbling", label: "Dribbling", icon: "▲" },
  { key: "Dexterity", label: "Dexterity", icon: "⚡" },
  { key: "LowerBody", label: "Lower Body Strength", icon: "👟" },
  { key: "Aerial", label: "Aerial Strength", icon: "🥋" },
  { key: "Defending", label: "Defending", icon: "🛡" },
  { key: "Goalkeeping1", label: "Goalkeeper 1", icon: "🧤" },
  { key: "Goalkeeping2", label: "Goalkeeper 2", icon: "🧤" },
  { key: "Goalkeeping3", label: "Goalkeeper 3", icon: "🧤" },
];

// Default Max OVR build preset (efootbase's suggested allocation for each card).
// These are the caps used by efootbase's "Max OVR" button: shooting/passing get
// fewer points, dribbling/dexterity/lower-body get more for an attacker-tuned card.
const MAX_BUILD_PRESET: Record<string, number> = {
  Shooting: 4,
  Passing: 4,
  Dribbling: 8,
  Dexterity: 8,
  LowerBody: 8,
  Aerial: 2,
  Defending: 0,
  Goalkeeping1: 0,
  Goalkeeping2: 0,
  Goalkeeping3: 0,
};

const MAX_POINTS_AVAILABLE = 64;

function ProgressionSlider({
  label,
  value,
  max = 20,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-white truncate">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, value - 1))}
            disabled={value <= 0}
            className="size-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer transition-colors"
          >
            <Minus className="size-3" />
          </button>
          <span className="min-w-5 text-center text-xs font-bold font-mono text-white tabular-nums">
            {value}
          </span>
          <button
            type="button"
            onClick={() => onChange(Math.min(max, value + 1))}
            disabled={value >= max}
            className="size-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 cursor-pointer transition-colors"
          >
            <Plus className="size-3" />
          </button>
        </div>
      </div>

      {/* 16px pill track with drag slider matching efootbase */}
      <div className="relative w-full h-3.5 rounded-full bg-white/10 overflow-hidden cursor-pointer">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-75"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={`${label} level`}
        />
      </div>
    </div>
  );
}

function ManagerProficiencySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const min = 70;
  const max = 100;
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="flex flex-col gap-1.5 w-full pt-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-secondary)]">Manager Proficiency</span>
        <span className="font-mono font-bold text-cyan-400 tabular-nums">{value}</span>
      </div>
      <div className="relative w-full h-3.5 rounded-full bg-white/10 overflow-hidden cursor-pointer">
        <div
          className="h-full rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)] transition-all duration-75"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Manager Proficiency"
        />
      </div>
    </div>
  );
}

// Position aptitude: 0 = full, 1 = partial, 2 = none (efootbase grid colour).
function aptitudeColor(v: number): string {
  if (v === 0) return "bg-emerald-500 text-black";
  if (v === 1) return "bg-emerald-600/40 border border-emerald-500/50 text-white";
  return "bg-white/5 text-white/30";
}

// Position-rating colour (OVR at that position).
function ratingColor(r: number): string {
  if (r >= 90) return "bg-emerald-500 text-black";
  if (r >= 80) return "bg-emerald-600/50 text-white";
  if (r >= 70) return "bg-emerald-700/40 text-white";
  return "bg-white/5 text-white/30";
}

const PITCH_SLOTS: readonly Position[] = [
  "LWF", "SS", "RWF",
  "LMF", "AMF", "RMF",
  "CMF", "DMF",
  "LB", "CB", "RB",
  "GK",
];

// Format a player card type the way efootbase labels "Epic - Big Time" for
// HIGHLIGHT cards. efootbase uses "Epic - Big Time" for HIGHLIGHT, plain labels
// for the rest.
function cardTypeDisplay(cardType: PlayerCardDTO["cardType"]): string {
  if (cardType === "HIGHLIGHT") return "Epic · Big Time";
  return CARD_TYPE_LABEL[cardType] ?? cardType;
}

export default function PlayerDetailPage() {
  const params = useParams<{ baseId: string; cardId: string }>();
  const [activeTab, setActiveTab] = useState<"overview" | "insights" | "notes">("overview");
  const [copiedId, setCopiedId] = useState(false);
  const [managerProficiency, setManagerProficiency] = useState(90);

  // 10 training categories points — keyed by ALL_TRAINING_CATEGORIES.key.
  const [points, setPoints] = useState<Record<string, number>>(
    () => Object.fromEntries(ALL_TRAINING_CATEGORIES.map((c) => [c.key, 0]))
  );

  // Skill slug → display name (the player has slugs only in the DTO; the name
  // comes from the Skill table via the skill.list query).
  const skillsQ = trpc.skill.list.useQuery({}, {
    staleTime: 1000 * 60 * 60, // 1h — the 67-skill set never changes mid-session
  });
  const skillName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of skillsQ.data ?? []) map.set(s.slug, s.name);
    return map;
  }, [skillsQ.data]);

  const q = trpc.player.byId.useQuery({ baseId: params.baseId, cardId: params.cardId });

  const totalPointsSpent = useMemo(
    () => Object.values(points).reduce((acc, v) => acc + v, 0),
    [points]
  );

  if (q.isLoading) {
    return (
      <div className="h-96 rounded-2xl bg-[var(--color-panel)] animate-pulse flex items-center justify-center text-xs text-[var(--color-text-dim)]">
        Loading player card…
      </div>
    );
  }

  if (!q.data) {
    return (
      <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] text-sm text-[var(--color-text-dim)] space-y-3">
        <p>Player card not found.</p>
        <Link href="/players" className="button button--sm button--secondary">
          <ArrowLeft className="size-3.5 mr-1.5" />
          Back to Players
        </Link>
      </div>
    );
  }

  const p = q.data as PlayerCardDTO;
  const pos = positionOf(p.registeredPosition);
  const posLabel = pos === "—" ? "—" : POSITION_LABEL[pos];
  const playstyleAtk = playingStyleLabel(p.playingStyleAttack);
  const playstyleDef = playingStyleLabel(p.playingStyleDefense);
  const packTitle = p.pack?.name ?? "—";
  const condLetter = p.condition?.toUpperCase() ?? null;

  // Build preset keyed by category — cloned so the Max OVR button never mutates a
  // shared object. Player id is NOT special-cased (the old hardcoded Messi hack
  // is gone — every player now reads its own progression from state).
  const handleMaxBuild = () => {
    setPoints((prev) => ({ ...prev, ...MAX_BUILD_PRESET }));
  };
  const handleResetBuild = () => {
    setPoints(() => Object.fromEntries(ALL_TRAINING_CATEGORIES.map((c) => [c.key, 0])));
  };

  const copyCardId = () => {
    navigator.clipboard.writeText(p.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Resolve skill names from slugs.
  const skillNames = p.skills
    .map((slug) => skillName.get(slug) ?? slug)
    .filter(Boolean);
  // Premium/showtime skills we render with a gold accent (matches efootbase which
  // calls out Momentum Dribbling, Blitz Curler, etc. in gold).
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
  const premiumSkills = skillNames.filter((_, i) =>
    PREMIUM_SKILL_SLUGS.has(p.skills[i] ?? "")
  );
  const otherSkills = skillNames.filter((_, i) =>
    !PREMIUM_SKILL_SLUGS.has(p.skills[i] ?? "")
  );

  // Best-fit position (highest rating excluding the registered position, which
  // efootbase shows separately as "At X").
  const regPos: Position = POSITIONS[p.registeredPosition] ?? "GK";
  const atRegRating = p.positionRatings[regPos] ?? p.ovr;
  let bestPos: Position = regPos;
  let bestRating = atRegRating;
  for (const k of POSITIONS) {
    if (k === regPos) continue;
    const apt = p.positionAptitudes[k];
    if (apt === 0 || apt === 1) {
      const v = p.positionRatings[k] ?? 0;
      if (v > bestRating) {
        bestRating = v;
        bestPos = k;
      }
    }
  }
  // Proficiency: full aptitudes (0) + half aptitudes (1).
  const fullCount = POSITIONS.filter((k) => p.positionAptitudes[k] === 0).length;
  const halfCount = POSITIONS.filter((k) => p.positionAptitudes[k] === 1).length;

  const releaseDateLabel = p.releaseDate
    ? new Date(p.releaseDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" as const })
    : null;

  const playstyleDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleAtk];

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

      {/* ================= SECTION 1: HERO CLUSTER (EFHUB-ALIGNED) ================= */}
      {/* ================= SECTION 1: HERO TOP ROW ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
        {/* Col 1: Card Cluster (Badges + 195px PlayerCard + 5 Specs Chips + Boosters) */}
        <div className="flex flex-col gap-3 shrink-0 mx-auto lg:mx-0">
          <div className="grid grid-cols-[auto_195px_auto] items-stretch gap-2.5">
            {/* Sub-col 1: 4 vertical emblems/badges */}
            <div className="flex shrink-0 flex-col justify-between py-0.5">
              <div
                className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm"
                title={p.countryName ?? "Nationality"}
              >
                {p.flagUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.flagUrl} alt="" className="size-8 object-contain" />
                ) : (
                  <span className="text-xs text-[var(--color-text-dim)]">🌍</span>
                )}
              </div>

              <div
                className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm p-1"
                title={p.teamName ?? "Team"}
              >
                {p.teamEmblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.teamEmblemUrl} alt="" className="size-8 object-contain" />
                ) : (
                  <span className="text-xs text-[var(--color-text-dim)]">⚽</span>
                )}
              </div>

              <div
                className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm p-1"
                title={p.leagueName ?? "League"}
              >
                {p.leagueEmblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.leagueEmblemUrl} alt="" className="h-6 w-auto object-contain" />
                ) : (
                  <span className="text-[10px] text-[var(--color-text-dim)] font-bold">🏆</span>
                )}
              </div>

              <div
                className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-sm"
                title="Manager Proficiency"
              >
                <span className="font-mono text-base font-bold text-[var(--color-text-secondary)]">
                  {managerProficiency}
                </span>
              </div>
            </div>

            {/* Sub-col 2: Player Card with Cyan Glowing Frame */}
            <div className="w-[195px] shrink-0">
              <div className="relative w-full rounded-xl transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]">
                <PlayerCard player={p} size="full" showDetails />
              </div>
            </div>

            {/* Sub-col 3: 5 Compact Specs Chips (Height, Weight, Age, Foot, Condition) */}
            <div className="flex shrink-0 flex-col justify-between py-0.5">
              <div className="w-[78px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1.5 text-center shadow-sm">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Height</p>
                <p className="mt-0.5 font-mono text-xs font-bold text-white">{p.height}cm</p>
              </div>

              <div className="w-[78px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1.5 text-center shadow-sm">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Weight</p>
                <p className="mt-0.5 font-mono text-xs font-bold text-white">{p.weight}kg</p>
              </div>

              <div className="w-[78px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1.5 text-center shadow-sm">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Age</p>
                <p className="mt-0.5 font-mono text-xs font-bold text-white">{p.age}</p>
              </div>

              <div className="w-[78px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1.5 text-center shadow-sm">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Foot</p>
                <p className="mt-0.5 font-medium text-xs text-white">{strongerFootLabel(p.strongerFoot)}</p>
              </div>

              <div className="w-[78px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1.5 text-center shadow-sm">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Condition</p>
                <p className="mt-0.5 font-bold text-xs text-emerald-400">{condLetter ?? "B"}</p>
              </div>
            </div>
          </div>

          {/* Booster Selector Bar */}
          <div className="flex items-center gap-2">
            <div className="flex h-9 flex-1 items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 text-xs shadow-sm">
              <span className="font-semibold text-white/90 truncate">
                {p.booster1?.name ?? "Booster 1"}
              </span>
              {p.booster1 && (
                <span className="font-mono text-[10px] text-cyan-400 shrink-0 font-bold">
                  +{p.booster1.magnitude ?? 4}
                </span>
              )}
            </div>
            <div className="flex h-9 flex-1 items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 text-xs shadow-sm">
              <span className="font-semibold text-white/90 truncate">
                {p.booster2?.name ?? "Booster 2"}
              </span>
              {p.booster2 && (
                <span className="font-mono text-[10px] text-cyan-400 shrink-0 font-bold">
                  +{p.booster2.magnitude ?? 1}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Col 2: Player Identity, Tabs & Progression (Full Width on Right) */}
        <div className="flex flex-col gap-6 min-w-0 flex-1">
          {/* Identity & Tabs Card */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider">
                    {p.name}
                  </h1>
                  <span className="chip chip--accent chip--lg tabular-nums">
                    <span className="chip__label">{p.ovr} OVR</span>
                  </span>
                  {p.maxOvr > p.ovr && (
                    <span className="text-xs text-[var(--color-text-dim)] font-mono tabular-nums">
                      Max {p.maxOvr}
                    </span>
                  )}
                </div>

                {/* Playstyle badges */}
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-bold text-white px-2 py-0.5 rounded bg-[var(--color-canvas)] border border-[var(--color-line)]">
                    {posLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-semibold text-xs border border-rose-500/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_attack.svg" alt="" className="size-3" />
                    <span>{playstyleAtk}</span>
                  </span>
                  {playstyleDef !== "Basic" && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/15 text-sky-300 font-semibold text-xs border border-sky-500/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/playstyle_defence.svg" alt="" className="size-3" />
                      <span>{playstyleDef}</span>
                    </span>
                  )}
                  <span className="text-[var(--color-text-dim)] font-mono text-[11px] ml-auto">
                    {packTitle}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={copyCardId}
                className="text-[var(--color-text-dim)] hover:text-white p-1 rounded transition-colors shrink-0 cursor-pointer"
                title="Copy Card ID"
              >
                {copiedId ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
              </button>
            </div>

            {/* Tabs */}
            <div className="pt-2 border-t border-[var(--color-line-separator)]">
              <div className="flex items-center gap-6 border-b border-[var(--color-line)] pb-2 text-xs font-bold">
                {(["overview", "insights", "notes"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`pb-2 border-b-2 transition-colors cursor-pointer capitalize ${
                      activeTab === tab
                        ? "text-white border-[var(--color-accent)]"
                        : "text-[var(--color-text-dim)] border-transparent hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="pt-2.5">
                {activeTab === "overview" && (
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    {p.name}&apos;s &quot;{packTitle}&quot; card is rated {p.ovr}
                    {p.maxOvr > p.ovr ? `, peaking at ${p.maxOvr} when trained` : ""}. He is a{" "}
                    {p.height}cm ({Math.round(p.height / 2.54 / 12)}&apos;{Math.round((p.height / 2.54) % 12)}&quot;) tall{" "}
                    {posLabel} with {playstyleAtk} playstyle
                    {p.countryName ? `, from ${p.countryName}` : ""}
                    {p.teamName ? `, playing for ${p.teamName}` : ""}.
                    {" "}Features {skillNames.length} skills
                    {skillNames.length > 0 ? `: ${skillNames.slice(0, 5).join(", ")}...` : "."}
                  </p>
                )}

                {activeTab === "insights" && (
                  <p className="text-xs text-[var(--color-text-secondary)] py-2 leading-relaxed">
                    AI insights and trends — coming soon.
                  </p>
                )}

                {activeTab === "notes" && (
                  <p className="text-xs text-[var(--color-text-secondary)] py-2 leading-relaxed">
                    Community notes and tips — coming soon.
                  </p>
                )}
              </div>
            </div>

            {/* Quick metrics footer (WF accuracy / usage + stars) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-line-separator)] text-xs text-[var(--color-text-dim)] font-mono">
              <div className="flex items-center gap-3">
                <span>🎯 WF Accuracy: <span className="text-white">{"★".repeat(Math.min(5, p.weakFootAccuracy))}</span></span>
                <span>👟 WF Usage: <span className="text-white">{"★".repeat(Math.min(5, p.weakFootUsage))}</span></span>
              </div>
              <div className="text-[11px]">
                ID: <span className="font-mono text-white/80">{p.id}</span>
              </div>
            </div>
          </div>

          {/* Progression Box */}
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Progression</h4>
                <div className="text-[11px] font-mono text-[var(--color-text-dim)] pt-0.5">
                  {totalPointsSpent} / {MAX_POINTS_AVAILABLE} pts
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMaxBuild}
                  className="button button--sm bg-[var(--color-accent)] text-black font-bold hover:opacity-90 cursor-pointer px-3 py-1 rounded-lg text-xs"
                >
                  Max OVR
                </button>
                <button
                  type="button"
                  onClick={handleResetBuild}
                  aria-label="Reset"
                  className="button button--sm button--ghost p-1.5 rounded-lg text-[var(--color-text-dim)] hover:text-white cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
            </div>

            <ManagerProficiencySlider value={managerProficiency} onChange={setManagerProficiency} />

            <div className="pt-2 border-t border-[var(--color-line-separator)] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {ALL_TRAINING_CATEGORIES.map((cat) => (
                <ProgressionSlider
                  key={cat.key}
                  label={cat.label}
                  value={points[cat.key] ?? 0}
                  max={20}
                  onChange={(v) => setPoints((prev) => ({ ...prev, [cat.key]: v }))}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECTION 2: STATS SECTIONS ================= */}
      <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-6 shadow-sm">
        <div className="grid md:grid-cols-3 gap-6 pt-1">
          <StatSection title="Attacking" stats={ATTACKING_STATS} dto={p} useMax />
          <StatSection title="Defending" stats={DEFENDING_STATS} dto={p} useMax />
          <StatSection title="Strength" stats={STRENGTH_STATS} dto={p} useMax />
        </div>
      </div>

      {/* ================= SECTION 3: POSITION & PLAYSTYLE (EFOOTBASE EXACT LAYOUT) ================= */}
      <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-5 shadow-sm">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Position &amp; Playstyle</h3>

        {/* 3 KPI Cards on top */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
            <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">Best Fit</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{POSITION_LABEL[bestPos]}</span>
              <span className="text-sm font-mono font-bold text-stat-tier-cyan">{bestRating || p.ovr}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
            <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">At {posLabel}</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{atRegRating}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
            <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">Proficiency</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-[var(--color-accent)]">{fullCount} Full</span>
              <span className="text-xs text-[var(--color-text-dim)]">· {halfCount} Half</span>
            </div>
          </div>
        </div>

        {/* 2 Columns: Left Pitch Map (350px) + Right Tactical Playstyles */}
        <div className="grid gap-6 lg:grid-cols-[350px_minmax(0,1fr)] items-start pt-1">
          {/* Left: The Spacious Pitch Map */}
          <div className="flex justify-center mx-auto lg:mx-0">
            <PitchMap
              positionAptitudes={p.positionAptitudes}
              positionRatings={p.positionRatings}
              registeredPosition={regPos}
            />
          </div>

          {/* Right: Tactical Details matching efootbase screenshot */}
          <div className="space-y-4">
            {/* Attack Playstyle Card */}
            <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/playstyle_attack.svg" alt="" className="size-4" />
                <span className="font-bold text-sm text-white">{playstyleAtk}</span>
              </div>
              {playstyleDesc && (
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{playstyleDesc}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {POSITIONS
                  .filter((k) => p.positionAptitudes[k] === 0)
                  .map((role) => (
                    <span key={role} className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono font-bold text-white border border-white/5">
                      {role}
                    </span>
                  ))}
              </div>
            </div>

            {/* Defence Playstyle Card */}
            {playstyleDef !== "Basic" && (
              <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/playstyle_defence.svg" alt="" className="size-4" />
                  <span className="font-bold text-sm text-white">{playstyleDef}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {POSITIONS
                    .filter((k) => p.positionAptitudes[k] === 0)
                    .map((role) => (
                      <span key={role} className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono font-bold text-white border border-white/5">
                        {role}
                      </span>
                    ))}
                </div>
              </div>
            )}

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
                    <span
                      key={key}
                      className="px-2.5 py-1 rounded-md bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-white"
                    >
                      {label}
                    </span>
                  ))}
                {Object.values(p.playstyles).every((v) => !v) && (
                  <span className="text-xs text-[var(--color-text-dim)]">None.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stat section — renders base + max for each stat in the given list, with the
 *  efootbase tier colour. Uses max stats (the trained ceiling) since the detail
 *  page default view is "max trained". */
function StatSection({
  title,
  stats,
  dto,
  useMax,
}: {
  title: string;
  stats: readonly BaseStat[];
  dto: PlayerCardDTO;
  useMax?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[var(--color-line)] pb-1.5">
        {title}
      </h3>
      <div className="space-y-1">
        {stats.map((st) => {
          const val = useMax ? dto.maxStats[st] : dto.stats[st];
          const tier = getTierClasses(val);
          return (
            <div key={st} className="efb-stat-row">
              <span className={`efb-stat-row__label ${tier.text}`}>{statLabel(st)}</span>
              <span className={`efb-stat-row__value ${tier.bg}`}>{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
