"use client";
import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
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
  let bestPos: Position = regPos;
  let bestRating = 0;
  for (const k of POSITIONS) {
    if (k === regPos) continue;
    const v = p.positionRatings[k] ?? 0;
    if (v > bestRating) { bestRating = v; bestPos = k; }
  }
  const atRegRating = p.positionRatings[regPos] ?? p.ovr;
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

      {/* Hero Header — real OVR (base) + position + playstyle */}
      <header className="efb-player-hero space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">{p.name}</h1>
          <span className="chip chip--accent chip--lg tabular-nums">
            <span className="chip__label">{p.ovr} OVR</span>
          </span>
          {p.maxOvr > p.ovr && (
            <span className="text-xs text-[var(--color-text-dim)] font-mono tabular-nums">
              Max {p.maxOvr}
            </span>
          )}
        </div>
        <div className="efb-player-hero__subtitle flex items-center gap-2 text-xs sm:text-sm text-[var(--color-text-secondary)] flex-wrap">
          <span className="font-bold text-white">{posLabel}</span>
          <span className="text-[var(--color-text-dim)]">·</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-semibold text-xs">
            <span>⛿</span>
            <span>{playstyleAtk}</span>
          </span>
          <span className="text-[var(--color-text-dim)]">·</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 font-semibold text-xs">
            <span>🛡</span>
            <span>{playstyleDef}</span>
          </span>
        </div>
      </header>

      {/* 2-Column Main Layout */}
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
        {/* ================= LEFT COLUMN ================= */}
        <aside className="space-y-4">
          {/* Card */}
          <div className="w-[200px] mx-auto">
            <PlayerCard player={p} size="full" showDetails />
          </div>

          {/* 3 Badges: nationality flag + team crest + league patch */}
          <div className="flex items-center justify-center gap-3 pt-1">
            <div
              className="size-8 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] overflow-hidden flex items-center justify-center shadow-md shrink-0"
              title={p.countryName ?? "—"}
            >
              {p.flagUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.flagUrl} alt={p.countryName ?? ""} className="size-full object-cover" />
              ) : (
                <span className="text-[10px] text-[var(--color-text-dim)]">?</span>
              )}
            </div>

            <div
              className="size-8 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] overflow-hidden flex items-center justify-center shadow-md shrink-0 p-1"
              title={p.teamName ?? "—"}
            >
              {p.teamEmblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.teamEmblemUrl} alt={p.teamName ?? ""} className="size-full object-contain" />
              ) : (
                <span className="text-[10px] text-[var(--color-text-dim)]">?</span>
              )}
            </div>

            <div
              className="h-8 px-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] flex items-center justify-center shadow-md shrink-0"
              title={p.leagueName ?? "—"}
            >
              {p.leagueEmblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.leagueEmblemUrl} alt={p.leagueName ?? ""} className="h-5 w-auto object-contain" />
              ) : (
                <span className="text-[9px] text-[var(--color-text-dim)] px-1">{p.leagueName ?? "—"}</span>
              )}
            </div>
          </div>

          {/* Progression Box */}
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Progression</h4>
                <div className="text-[11px] font-mono text-[var(--color-text-dim)] pt-0.5">
                  {totalPointsSpent} / {MAX_POINTS_AVAILABLE} pts
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMaxBuild}
                  className="button button--sm bg-[var(--color-accent)] text-black font-bold hover:opacity-90"
                >
                  Max OVR
                </button>
                <button
                  type="button"
                  onClick={handleResetBuild}
                  aria-label="Reset"
                  className="button button--sm button--ghost p-1 text-[var(--color-text-dim)] hover:text-white"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Select Manager Button */}
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-white/90 hover:text-white hover:bg-[var(--color-elevated)] transition-colors cursor-pointer"
            >
              <User className="size-3.5 text-[var(--color-text-dim)]" />
              <span>Select Manager</span>
            </button>

            <ManagerProficiencySlider value={managerProficiency} onChange={setManagerProficiency} />

            <div className="pt-2 border-t border-[var(--color-line-separator)] space-y-3">
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

          {/* Card Info Box */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px] mb-2">Card Info</h4>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Name</span>
              <span className="font-medium text-white">{p.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Featured</span>
              <span className="font-medium text-white text-right truncate max-w-[140px]" title={packTitle}>{packTitle}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Card Type</span>
              <span className="font-medium text-[var(--color-accent)]">{cardTypeDisplay(p.cardType)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Nationality</span>
              <span className="font-medium text-white">{p.countryName ?? "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Team</span>
              <span className="font-medium text-white truncate ml-2 max-w-[150px]" title={p.teamName ?? "—"}>{p.teamName ?? "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Position</span>
              <span className="font-mono text-white font-bold">{posLabel}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Age</span>
              <span className="font-mono text-white">{p.age}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Strong Foot</span>
              <span className="font-medium text-white">{strongerFootLabel(p.strongerFoot)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Height</span>
              <span className="font-mono text-white">{p.height} CM</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Weight</span>
              <span className="font-mono text-white">{p.weight} KG</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Condition</span>
              <span className="font-medium text-emerald-400">{conditionLabel(p.condition)}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[var(--color-line-separator)]">
              <span>Card ID</span>
              <button
                type="button"
                onClick={copyCardId}
                className="font-mono text-white hover:text-[var(--color-accent)] inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{p.id}</span>
                {copiedId ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              </button>
            </div>
            <div className="flex justify-between py-1">
              <span>Release Date</span>
              <span className="font-mono text-[var(--color-text-dim)]">{releaseDateLabel ?? "—"}</span>
            </div>
          </div>
        </aside>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="space-y-6 min-w-0">
          {/* Card 1: Overview & Attributes */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-6">
            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2 text-xs font-bold">
              <div className="flex items-center gap-6">
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

              <button
                type="button"
                className="text-[var(--color-text-dim)] hover:text-white p-1 rounded transition-colors"
                title="Share"
              >
                <Share2 className="size-4" />
              </button>
            </div>

            {/* Tab content */}
            {activeTab === "overview" && (
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                {p.name}'s "{packTitle}" card is rated {p.ovr}
                {p.maxOvr > p.ovr ? `, peaking at ${p.maxOvr} when trained` : ""}. He is a{" "}
                {p.height}cm ({Math.round(p.height / 2.54 / 12)}'{Math.round((p.height / 2.54) % 12)})" tall{" "}
                {posLabel} with {playstyleAtk} & {playstyleDef} playstyle
                {p.countryName ? `, from ${p.countryName}` : ""}
                {p.teamName ? `, playing in the ${p.teamName} team` : ""}.
                {" "}It features {skillNames.length} player skills
                {skillNames.length > 0 ? `: ${skillNames.slice(0, 6).join(", ")}` : ""}
                {skillNames.length > 6 ? ` and ${skillNames.length - 6} more.` : "."}
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

            {/* Vital Metrics Bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-secondary)] py-2 border-y border-[var(--color-line)]/60 font-mono">
              <span>↕ {p.height} CM</span>
              <span>·</span>
              <span>⚖ {p.weight} KG</span>
              <span>·</span>
              <span>📅 {p.age} years</span>
              <span>·</span>
              <span>👟 Strong Foot: {strongerFootLabel(p.strongerFoot)}</span>
              <span>·</span>
              <span>🎯 WF Accuracy {"★".repeat(Math.min(5, p.weakFootAccuracy))}</span>
              <span>·</span>
              <span>👟 WF Usage {"★".repeat(Math.min(5, p.weakFootUsage))}</span>
            </div>

            {/* Booster Pills Bar — render the resolved Booster objects (dump has
                the real name + stat magnitudes; was "Booster #{id}" before
                2026-10-08 because the Booster table wasn't seeded from dump). */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {[p.booster1, p.booster2].filter(Boolean).length === 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-[var(--color-text-dim)]">
                    <Sparkles className="size-3" />
                    No booster assigned
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {[p.booster1, p.booster2].filter(Boolean).map((b, i) => (
                      <div
                        key={`b-${i}-${b!.id}`}
                        className="inline-flex flex-col gap-1 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25"
                      >
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                          <Sparkles className="size-3" />
                          {b!.name}
                        </span>
                        {Object.keys(b!.stats).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(b!.stats).map(([k, v]) => (
                              <span
                                key={k}
                                className="px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-[10px] font-mono text-cyan-300"
                              >
                                +{v} {statLabel(k as BaseStat)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3 Stat Sections */}
            <div className="grid md:grid-cols-3 gap-6 pt-1">
              {/* Attacking */}
              <StatSection title="Attacking" stats={ATTACKING_STATS} dto={p} useMax />
              {/* Defending */}
              <StatSection title="Defending" stats={DEFENDING_STATS} dto={p} useMax />
              {/* Strength */}
              <StatSection title="Strength" stats={STRENGTH_STATS} dto={p} useMax />
            </div>

            {/* Skills */}
            <div className="pt-4 border-t border-[var(--color-line)] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {premiumSkills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-300"
                  >
                    <Sparkles className="size-3.5" />
                    <span>{s}</span>
                  </span>
                ))}
                {otherSkills.map((s) => (
                  <span
                    key={s}
                    className="px-2.5 py-1 rounded-md bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-white"
                  >
                    {s}
                  </span>
                ))}
                {skillNames.length === 0 && (
                  <span className="text-xs text-[var(--color-text-dim)]">No skills recorded.</span>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Body Model */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Body Model</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {PHYSIQUE_ORDER.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)]"
                >
                  <span className="text-[var(--color-text-secondary)]">{PHYSIQUE_LABEL[key]}</span>
                  <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-[var(--color-panel)]">
                    {p.physique[key]}
                  </span>
                </div>
              ))}
              {(["legCoverage", "armCoverage", "peakJumpHeight", "torsoCollisionWidth", "dribbleHeight"] as const).map((key) => {
                const v = p.derived[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)]"
                  >
                    <span className="text-[var(--color-text-secondary)]">{DERIVED_LABEL[key]}</span>
                    <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-[var(--color-panel)]">
                      {typeof v === "number" && v !== 0 ? v.toFixed(1) : v}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Position & Playstyle */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-5">
            <h3 className="text-sm font-bold text-white">Position & Playstyle</h3>

            {/* 3 KPI Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">Best Fit</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-white">{POSITION_LABEL[bestPos]}</span>
                  <span className="text-sm font-mono font-bold text-stat-tier-cyan">{bestRating}</span>
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

            {/* Pitch + Tactical details */}
            <div className="grid gap-5 lg:grid-cols-2 items-start">
              {/* Pitch grid */}
              <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-xs font-semibold text-white mb-3">Pitch Map</div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono font-bold">
                  {PITCH_SLOTS.map((posKey) => {
                    const apt = p.positionAptitudes[posKey];
                    const rating = p.positionRatings[posKey] ?? 0;
                    const isReg = posKey === regPos;
                    return (
                      <div
                        key={posKey}
                        className={`p-2.5 rounded ${aptitudeColor(apt)} ${isReg ? "ring-2 ring-[var(--color-accent)]" : ""}`}
                      >
                        <div>{posKey}</div>
                        <div className="text-[10px] opacity-80">{rating}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tactical details */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-bold text-xs">
                    <span>⛿</span>
                    <span>{playstyleAtk}</span>
                  </div>
                  {playstyleDesc && (
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{playstyleDesc}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {POSITIONS
                      .filter((k) => p.positionAptitudes[k] === 0)
                      .map((role) => (
                        <span key={role} className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono font-bold text-white">
                          {role}
                        </span>
                      ))}
                  </div>
                </div>

                {/* AI Playing Styles (the 6 playstyle flags the player has set). */}
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
                    {Object.values(p.playstyles).every(Boolean) === false &&
                      Object.values(p.playstyles).every((v) => !v) && (
                        <span className="text-xs text-[var(--color-text-dim)]">None.</span>
                      )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Other versions */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Other versions of {p.name}</h3>
            {p.otherVersions.length === 0 ? (
              <p className="text-xs text-[var(--color-text-dim)]">No other versions recorded.</p>
            ) : (
              <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {p.otherVersions.map((ver) => {
                  const vPos = positionOf(ver.registeredPosition);
                  const vPosLabel = vPos === "—" ? "—" : POSITION_LABEL[vPos];
                  return (
                    <Link
                      key={ver.id}
                      href={`/players/${p.baseId}/${ver.id}`}
                      className="w-28 shrink-0 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] p-2.5 text-center hover:border-[var(--color-accent)] transition-all no-underline block group"
                    >
                      <div className="font-mono text-base font-bold text-[var(--color-accent)]">{ver.ovr}</div>
                      <div className="text-[11px] font-mono text-white/70 uppercase">{vPosLabel}</div>
                      <div className="mt-2 text-[10px] text-[var(--color-text-dim)] truncate px-1 rounded bg-[var(--color-panel)] py-0.5">
                        {cardTypeDisplay(ver.cardType)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
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
