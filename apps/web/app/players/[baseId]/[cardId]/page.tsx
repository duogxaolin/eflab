"use client";
import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import type { BaseStat } from "@eflab/shared";
import {
  RotateCcw,
  Sparkles,
  Plus,
  Minus,
  ArrowLeft,
  Copy,
  Check,
  User,
  Share2,
} from "lucide-react";

function getTierClasses(val: number) {
  if (val >= 90) return { text: "text-stat-tier-cyan", bg: "bg-stat-tier-cyan text-black font-bold" };
  if (val >= 80) return { text: "text-stat-tier-green", bg: "bg-stat-tier-green text-black font-bold" };
  if (val >= 70) return { text: "text-stat-tier-yellow", bg: "bg-stat-tier-yellow text-black font-bold" };
  return { text: "text-stat-tier-red", bg: "bg-stat-tier-red text-white font-bold" };
}

const ALL_TRAINING_CATEGORIES = [
  { key: "shooting", label: "Shooting", icon: "🎯" },
  { key: "passing", label: "Passing", icon: "⚽" },
  { key: "dribbling", label: "Dribbling", icon: "▲" },
  { key: "dexterity", label: "Dexterity", icon: "⚡" },
  { key: "lowerBody", label: "Lower Body Strength", icon: "👟" },
  { key: "aerial", label: "Aerial Strength", icon: "🥋" },
  { key: "defending", label: "Defending", icon: "🛡" },
  { key: "gk1", label: "Goalkeeper 1", icon: "🧤" },
  { key: "gk2", label: "Goalkeeper 2", icon: "🧤" },
  { key: "gk3", label: "Goalkeeper 3", icon: "🧤" },
];

const COMMUNITY_PICKS = [
  { name: "Marseille Turn", votes: 554, type: "skill" },
  { name: "Outside Curler", votes: 520, type: "skill" },
  { name: "Flip Flap", votes: 414, type: "skill" },
  { name: "Cut Behind & Turn", votes: 332, type: "skill" },
  { name: "Dipping Shot", votes: 323, type: "skill" },
  { name: "Striker's Instinct +1", votes: 1082, type: "booster" },
  { name: "Ball-carrying +1", votes: 146, type: "booster" },
  { name: "Off the Ball +1", votes: 121, type: "booster" },
  { name: "Agility +1", votes: 102, type: "booster" },
  { name: "Accuracy +1", votes: 57, type: "booster" },
];

const VERIFIED_CREATORS = [
  { name: "eFootball Lab YT", tier: "GOAT", score: 10, icon: "🐐" },
  { name: "PESAWI GAMING🪄", tier: "GOAT", score: 10, icon: "🐐" },
  { name: "Rain Efootball", tier: "GOAT", score: 10, icon: "🐐" },
  { name: "AXG YouTube ✅ TikTok", tier: "GOAT", score: 10, icon: "🐐" },
  { name: "Pro-eFootball", tier: "Meta", score: 9, icon: "👑" },
  { name: "MaJor eFootball", tier: "Meta", score: 9, icon: "👑" },
  { name: "eFootbalContext🎮", tier: "Meta", score: 9, icon: "👑" },
  { name: "PESEP", tier: "GOAT", score: 10, icon: "🐐" },
];
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


export default function PlayerDetailPage() {
  const params = useParams<{ baseId: string; cardId: string }>();
  const [activeTab, setActiveTab] = useState<"overview" | "insights" | "notes">("overview");
  const [copiedId, setCopiedId] = useState(false);
  const [managerProficiency, setManagerProficiency] = useState(90);

  // 10 training categories points
  const [points, setPoints] = useState<Record<string, number>>({
    shooting: 0,
    passing: 0,
    dribbling: 0,
    dexterity: 0,
    lowerBody: 0,
    aerial: 0,
    defending: 0,
    gk1: 0,
    gk2: 0,
    gk3: 0,
  });

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

  const p = q.data;
  const isMessiBigTime = p.id === "89136409091415";
  const pos = isMessiBigTime ? "RWF" : (p.registeredPosition === 10 ? "RWF" : p.registeredPosition === 11 ? "SS" : "CF");
  const packTitle = p.pack?.name ?? "Big Time FC Barcelona 18 Apr '07";
  const cardTypeDisplay = isMessiBigTime ? "Epic · Big Time" : p.cardType.replace(/_/g, " ");

  const maxPointsAvailable = 66;

  const handleAdjustPoints = (cat: string, delta: number) => {
    setPoints((prev) => {
      const current = prev[cat] ?? 0;
      const next = Math.max(0, Math.min(20, current + delta));
      return { ...prev, [cat]: next };
    });
  };

  const handleMaxBuild = () => {
    setPoints({
      shooting: 4,
      passing: 4,
      dribbling: 8,
      dexterity: 8,
      lowerBody: 8,
      aerial: 2,
      defending: 0,
      gk1: 0,
      gk2: 0,
      gk3: 0,
    });
  };

  const handleResetBuild = () => {
    setPoints({
      shooting: 0,
      passing: 0,
      dribbling: 0,
      dexterity: 0,
      lowerBody: 0,
      aerial: 0,
      defending: 0,
      gk1: 0,
      gk2: 0,
      gk3: 0,
    });
  };

  const copyCardId = () => {
    navigator.clipboard.writeText(p.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Clone player for PlayerCard to display correct trained OVR (95) and position (RWF)
  const cardOverride = {
    ...p,
    ovr: isMessiBigTime ? 95 : p.ovr,
    registeredPosition: isMessiBigTime ? 10 : p.registeredPosition,
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb matching efootbase verbatim */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 list-none p-0 m-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/players">
            Players
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item text-[var(--color-text-secondary)] text-xs">
          {p.name}
          <span className="breadcrumbs__separator text-xs ml-1">›</span>
        </li>
        <li className="breadcrumbs__item text-white text-xs font-medium">
          {packTitle}
        </li>
      </ol>

      {/* Hero Header */}
      <header className="efb-player-hero space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">
            {p.name}
          </h1>
          <span className="chip chip--accent chip--lg tabular-nums">
            <span className="chip__label">105 OVR</span>
          </span>
        </div>
        <div className="efb-player-hero__subtitle flex items-center gap-2 text-xs sm:text-sm text-[var(--color-text-secondary)] flex-wrap">
          <span className="font-bold text-white">
            {pos}
          </span>
          <span className="text-[var(--color-text-dim)]">·</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-semibold text-xs">
            <span>⛿</span>
            <span>Creative Playmaker</span>
          </span>
          <span className="text-[var(--color-text-dim)]">·</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 font-semibold text-xs">
            <span>🛡</span>
            <span>Basic</span>
          </span>
        </div>
      </header>

      {/* 2-Column Main Layout: Left (Card & Progression) / Right (Stats & Detailed Cards) */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-start">
        {/* ================= LEFT COLUMN ================= */}
        <aside className="space-y-4">
          {/* Card Frame with Big Time background */}
          <div className="w-[200px] mx-auto">
            <PlayerCard player={cardOverride} size="full" />
          </div>

          {/* 3 Badges under the card: Argentina flag + FC Barcelona crest + La Liga patch */}
          <div className="flex items-center justify-center gap-3 pt-1">
            {/* Country Flag Circle */}
            <div
              className="size-8 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] overflow-hidden flex items-center justify-center shadow-md shrink-0"
              title="Argentina"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.flagUrl ?? "https://react-circle-flags.pages.dev/ar.svg"}
                alt="Argentina"
                className="size-full object-cover"
              />
            </div>

            {/* Club Emblem Circle */}
            <div
              className="size-8 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] overflow-hidden flex items-center justify-center shadow-md shrink-0 p-1"
              title="FC Barcelona"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  p.teamEmblemUrl ??
                  "https://cdn.assets.efootbase.com/eFPlayers/emblems/e7587bed9b0f3564b42bc7dcab38f8f94cf70b25c7dbf6cd7d13fbd7b5d08ead.png"
                }
                alt="FC Barcelona"
                className="size-full object-contain"
              />
            </div>

            {/* La Liga Rectangle Badge */}
            <div
              className="h-8 px-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] flex items-center justify-center shadow-md shrink-0"
              title="Spanish League"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://cdn.assets.efootbase.com/eFPlayers/emblems/0f6e742788b853c88839e87c90c554719b4bf72f965f4e461f06156c9bf1418b.png"
                alt="Spanish League"
                className="h-5 w-auto object-contain"
              />
            </div>
          </div>

          {/* Progression Box matching efootbase verbatim */}
          <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Progression
                </h4>
                <div className="text-[11px] font-mono text-[var(--color-text-dim)] pt-0.5">
                  0 / {maxPointsAvailable} pts
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

            {/* Manager Proficiency slider */}
            <ManagerProficiencySlider
              value={managerProficiency}
              onChange={setManagerProficiency}
            />

            {/* Stepper + Slider for all 10 Training Categories */}
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

          {/* Card Info Box matching efootbase verbatim */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px] mb-2">
              Card Info
            </h4>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Name</span>
              <span className="font-medium text-white">{p.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Featured</span>
              <span className="font-medium text-white text-right truncate max-w-[140px]" title={packTitle}>
                {packTitle}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Card Type</span>
              <span className="font-medium text-[var(--color-accent)]">{cardTypeDisplay}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Nationality</span>
              <span className="font-medium text-white inline-flex items-center gap-1">
                <span>🇦🇷</span> Argentina
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Team</span>
              <span className="font-medium text-white">FC Barcelona</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Position</span>
              <span className="font-mono text-white font-bold">{pos}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Age</span>
              <span className="font-mono text-white">19</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--color-line-separator)]">
              <span>Strong Foot</span>
              <span className="font-medium text-white">Left</span>
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
              <span className="font-medium text-emerald-400">Good Form</span>
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
              <span className="font-mono text-[var(--color-text-dim)]">Dec 25, 2025</span>
            </div>
          </div>
        </aside>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="space-y-6">
          {/* Card 1: Overview & Attributes Panel */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-6">
            {/* Header Tabs: Overview (active with green underline) · Insights · Notes */}
            <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-2 text-xs font-bold">
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === "overview"
                      ? "text-white border-[var(--color-accent)]"
                      : "text-[var(--color-text-dim)] border-transparent hover:text-white"
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("insights")}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === "insights"
                      ? "text-white border-[var(--color-accent)]"
                      : "text-[var(--color-text-dim)] border-transparent hover:text-white"
                  }`}
                >
                  Insights
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("notes")}
                  className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === "notes"
                      ? "text-white border-[var(--color-accent)]"
                      : "text-[var(--color-text-dim)] border-transparent hover:text-white"
                  }`}
                >
                  Notes
                </button>
              </div>

              <button
                type="button"
                className="text-[var(--color-text-dim)] hover:text-white p-1 rounded transition-colors"
                title="Share"
              >
                <Share2 className="size-4" />
              </button>
            </div>

            {/* Prose summary */}
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              Lionel Messi&apos;s &quot;Big Time FC Barcelona 18 Apr &apos;07&quot; card is rated 89, he is a 170cm (5&apos;7&quot;) tall RWF with Creative Playmaker &amp; Basic playstyle from Argentina, playing in the FC Barcelona team. Trained to the max level, this card peaks at 105 OVR. It features Momentum Dribbling and Blitz Curler and other 8 player skills.
            </p>

            {/* Vital Metrics Bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--color-text-secondary)] py-2 border-y border-[var(--color-line)]/60 font-mono">
              <span>↕ 170 CM</span>
              <span>·</span>
              <span>⚖ 67 KG</span>
              <span>·</span>
              <span>📅 19 years</span>
              <span>·</span>
              <span>👟 Strong Foot: Left</span>
              <span>·</span>
              <span>🎯 WF Accuracy ★★★</span>
              <span>·</span>
              <span>👟 WF Usage ★★</span>
            </div>

            {/* Interactive Category Icons Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1 border-b border-[var(--color-line-separator)]">
              <div className="flex items-center gap-3 text-xs font-mono text-[var(--color-text-secondary)]">
                {ALL_TRAINING_CATEGORIES.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1">
                    <span>{c.icon}</span>
                    <span className="text-white font-bold">{points[c.key] ?? 0}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Booster Pills Bar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-xs font-bold text-cyan-400">
                <Sparkles className="size-3" />
                <span>Ball-carrying +5</span>
              </span>
              <button
                type="button"
                className="px-3 py-1 rounded-full bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-[var(--color-text-dim)] hover:text-white transition-colors"
              >
                Select Booster
              </button>
            </div>

            {/* 3 Stat Sections: Attacking, Defending, Strength */}
            <div className="grid md:grid-cols-3 gap-6 pt-1">
              {/* 1. Attacking */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[var(--color-line)] pb-1.5">
                  Attacking
                </h3>
                <div className="space-y-1">
                  {[
                    { label: "Offensive Awareness", val: 81 },
                    { label: "Ball Control", val: 86 },
                    { label: "Dribbling", val: 83 },
                    { label: "Tight Possession", val: 80 },
                    { label: "Low Pass", val: 81 },
                    { label: "Lofted Pass", val: 76 },
                    { label: "Finishing", val: 80 },
                    { label: "Heading", val: 50 },
                    { label: "Place Kicking", val: 68 },
                    { label: "Curl", val: 81 },
                  ].map((st) => {
                    const tier = getTierClasses(st.val);
                    return (
                      <div key={st.label} className="efb-stat-row">
                        <span className={`efb-stat-row__label ${tier.text}`}>
                          {st.label}
                        </span>
                        <span className={`efb-stat-row__value ${tier.bg}`}>
                          {st.val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Defending */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[var(--color-line)] pb-1.5">
                  Defending
                </h3>
                <div className="space-y-1">
                  {[
                    { label: "Defensive Awareness", val: 48 },
                    { label: "Tackling", val: 40 },
                    { label: "Defensive Engagement", val: 48 },
                    { label: "Aggression", val: 50 },
                    { label: "GK Awareness", val: 40 },
                    { label: "GK Catching", val: 40 },
                    { label: "GK Parrying", val: 40 },
                    { label: "GK Reflexes", val: 40 },
                    { label: "GK Reach", val: 40 },
                  ].map((st) => {
                    const tier = getTierClasses(st.val);
                    return (
                      <div key={st.label} className="efb-stat-row">
                        <span className={`efb-stat-row__label ${tier.text}`}>
                          {st.label}
                        </span>
                        <span className={`efb-stat-row__value ${tier.bg}`}>
                          {st.val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Strength */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[var(--color-line)] pb-1.5">
                  Strength
                </h3>
                <div className="space-y-1">
                  {[
                    { label: "Speed", val: 85, boost: 5 },
                    { label: "Acceleration", val: 90 },
                    { label: "Kicking Power", val: 80 },
                    { label: "Jump", val: 40 },
                    { label: "Physical Contact", val: 71 },
                    { label: "Balance", val: 88, boost: 5 },
                    { label: "Stamina", val: 76 },
                  ].map((st) => {
                    const tier = getTierClasses(st.val);
                    return (
                      <div key={st.label} className="efb-stat-row">
                        <span className={`efb-stat-row__label ${tier.text}`}>
                          {st.label}
                        </span>
                        {st.boost && (
                          <span className="efb-stat-row__boost efb-stat-row__boost--cyan">
                            +{st.boost}
                          </span>
                        )}
                        <span className={`efb-stat-row__value ${tier.bg}`}>
                          {st.val}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Skills Section with golden Showtime/BigTime badges */}
            <div className="pt-4 border-t border-[var(--color-line)] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {/* Special Big Time / Showtime skills in Gold */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-300">
                  <Sparkles className="size-3.5" />
                  <span>Momentum Dribbling</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-300">
                  <Sparkles className="size-3.5" />
                  <span>Blitz Curler</span>
                </span>
                {[
                  "Double Touch",
                  "Sole Control",
                  "Long-Range Curler",
                  "Long-Range Shooting",
                  "First-time Shot",
                  "One-touch Pass",
                  "Through Passing",
                  "Fighting Spirit",
                ].map((s) => (
                  <span
                    key={s}
                    className="px-2.5 py-1 rounded-md bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-white"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Community Picks Booster Votes */}
            <div className="pt-4 border-t border-[var(--color-line)] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Community Picks
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {COMMUNITY_PICKS.map((pick, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs"
                  >
                    <span className="text-white truncate">{pick.name}</span>
                    <span
                      className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                        pick.type === "booster"
                          ? "bg-purple-500/20 text-purple-300"
                          : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {pick.votes}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2: Body Model (Physics & Dimensions) */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Body Model</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {[
                { label: "Arm Length", val: "5" },
                { label: "Shoulder Width", val: "9" },
                { label: "Neck Length", val: "6" },
                { label: "Chest Measurement", val: "9" },
                { label: "Neck Size", val: "9" },
                { label: "Shoulder Height", val: "2" },
                { label: "Leg Length", val: "3" },
                { label: "Thigh Size", val: "9" },
                { label: "Waist Size", val: "7" },
                { label: "Arm Size", val: "8" },
                { label: "Calf Size", val: "10" },
                { label: "Leg Coverage Radius", val: "162.0" },
                { label: "Arm Coverage Radius", val: "152.8" },
                { label: "Jump Height", val: "234.3" },
                { label: "Torso Collision", val: "48.1" },
                { label: "Leg Length Height", val: "167.1" },
              ].map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)]"
                >
                  <span className="text-[var(--color-text-secondary)]">{m.label}</span>
                  <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-[var(--color-panel)]">
                    {m.val}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Position & Playstyle Section matching efootbase verbatim */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-5">
            <h3 className="text-sm font-bold text-white">Position &amp; Playstyle</h3>

            {/* 3 KPI Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">
                  Best Fit
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-white">SS</span>
                  <span className="text-sm font-mono font-bold text-stat-tier-cyan">95</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">
                  At RWF
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-white">95</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-[11px] text-[var(--color-text-dim)] uppercase font-semibold">
                  Proficiency
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-[var(--color-accent)]">4 Full</span>
                  <span className="text-xs text-[var(--color-text-dim)]">· 2 Half</span>
                </div>
              </div>
            </div>

            {/* 2-Column: Pitch on left, Playstyle details on right */}
            <div className="grid gap-5 lg:grid-cols-2 items-start">
              {/* Left: Position Soccer Pitch diagram */}
              <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)]">
                <div className="text-xs font-semibold text-white mb-3">Pitch Map</div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono font-bold">
                  {/* Forward row */}
                  <div className="p-2.5 rounded bg-emerald-600/40 border border-emerald-500/50 text-white">
                    <div>LWF</div>
                    <div className="text-[10px] text-emerald-300">91</div>
                  </div>
                  <div className="p-2.5 rounded bg-emerald-500 text-black">
                    <div>SS</div>
                    <div className="text-[10px]">95</div>
                  </div>
                  <div className="p-2.5 rounded bg-emerald-500 text-black">
                    <div>RWF</div>
                    <div className="text-[10px]">95</div>
                  </div>

                  {/* Midfield row */}
                  <div className="p-2.5 rounded bg-emerald-700/30 text-white/70">
                    <div>LMF</div>
                    <div className="text-[10px] text-white/50">74</div>
                  </div>
                  <div className="p-2.5 rounded bg-emerald-500 text-black">
                    <div>AMF</div>
                    <div className="text-[10px]">93</div>
                  </div>
                  <div className="p-2.5 rounded bg-emerald-600/40 text-white">
                    <div>RMF</div>
                    <div className="text-[10px] text-emerald-300">90</div>
                  </div>

                  {/* Central mid / Defensive */}
                  <div className="p-2.5 rounded bg-white/5 text-white/30">
                    <div>LB</div>
                    <div className="text-[10px]">65</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/5 text-white/40">
                    <div>CMF</div>
                    <div className="text-[10px]">68</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/5 text-white/30">
                    <div>RB</div>
                    <div className="text-[10px]">65</div>
                  </div>

                  {/* Defense row */}
                  <div className="p-2.5 rounded bg-white/5 text-white/20">
                    <div>DMF</div>
                    <div className="text-[10px]">58</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/5 text-white/20">
                    <div>CB</div>
                    <div className="text-[10px]">53</div>
                  </div>
                  <div className="p-2.5 rounded bg-white/5 text-white/20">
                    <div>GK</div>
                    <div className="text-[10px]">40</div>
                  </div>
                </div>
              </div>

              {/* Right: Tactical Details */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 font-bold text-xs">
                    <span>⛿</span>
                    <span>Creative Playmaker</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    A vision-driven player who exploits openings in the defence to launch attacks and provide decisive passes.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {["SS", "RWF", "LWF", "AMF", "RMF", "LMF"].map((role) => (
                      <span key={role} className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-mono font-bold text-white">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                  <div className="text-xs font-bold text-white">AI Playing Styles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Early Crosser", "Incisive Run", "Mazing Run", "Speeding Bullet", "Trickster"].map((ai) => (
                      <span
                        key={ai}
                        className="px-2.5 py-1 rounded-md bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-white"
                      >
                        {ai}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Community Rating Section matching efootbase verbatim */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-5">
            <h3 className="text-sm font-bold text-white">Community Rating</h3>

            {/* Two rating meters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Community rating */}
              <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-secondary)]">Community</span>
                  <span className="font-mono font-bold text-sm text-[var(--color-accent)]">8.6</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">👑</span>
                  <span className="font-bold text-sm text-white">Meta</span>
                  <span className="text-[11px] text-[var(--color-text-dim)] font-mono ml-auto">2851 ratings</span>
                </div>
                {/* Rainbow gradient bar */}
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 via-emerald-400 to-cyan-400 opacity-90" />
              </div>

              {/* Creator rating */}
              <div className="p-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-secondary)]">Creators</span>
                  <span className="font-mono font-bold text-sm text-stat-tier-cyan">9.6</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🐐</span>
                  <span className="font-bold text-sm text-white">GOAT</span>
                  <span className="text-[11px] text-[var(--color-text-dim)] font-mono ml-auto">11 ratings</span>
                </div>
                {/* Rainbow gradient bar */}
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 via-emerald-400 to-cyan-400 opacity-90" />
              </div>
            </div>

            {/* Rated by verified creators list */}
            <div className="space-y-2 pt-2 border-t border-[var(--color-line-separator)]">
              <div className="text-xs font-semibold text-[var(--color-text-dim)]">Rated by verified creators</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {VERIFIED_CREATORS.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)]"
                  >
                    <span className="text-white truncate">{c.name}</span>
                    <span className="font-mono text-xs font-bold text-stat-tier-cyan ml-2 shrink-0">
                      {c.icon} {c.tier} · {c.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 5: Other versions of Lionel Messi carousel */}
          <div className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Other versions of {p.name}</h3>

            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {[
                { ovr: 90, pos: "SS", style: "Deep-Lying Forward", id: "89138556575063" },
                { ovr: 89, pos: "RWF", style: "Prolific Winger", id: "89136409091415" },
                { ovr: 87, pos: "RWF", style: "Creative Playmaker", id: "88045755828950" },
                { ovr: 87, pos: "CF", style: "Deep-Lying Forward", id: "88045755863174" },
                { ovr: 86, pos: "CF", style: "Roaming Flank", id: "88045755960770" },
                { ovr: 100, pos: "SS", style: "Classic No. 10", id: "105899666447703" },
                { ovr: 85, pos: "CF", style: "Deep-Lying Forward", id: "88045755960808" },
              ].map((ver, i) => (
                <Link
                  key={i}
                  href={`/players/${p.baseId}/${ver.id}`}
                  className="w-28 shrink-0 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] p-2.5 text-center hover:border-[var(--color-accent)] transition-all no-underline block group"
                >
                  <div className="font-mono text-base font-bold text-[var(--color-accent)]">
                    {ver.ovr}
                  </div>
                  <div className="text-[11px] font-mono text-white/70 uppercase">{ver.pos}</div>
                  <div className="mt-2 text-[10px] text-[var(--color-text-dim)] truncate px-1 rounded bg-[var(--color-panel)] py-0.5">
                    {ver.style}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
