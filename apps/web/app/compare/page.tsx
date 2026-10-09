"use client";
import { useState, Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import type { PlayerCardDTO, BaseStat } from "@eflab/shared";
import { POSITIONS } from "@eflab/shared";
import type { Position } from "@eflab/shared";
import {
  ATTACKING_STATS,
  DEFENDING_STATS,
  STRENGTH_STATS,
  POSITION_BY_INDEX,
  statLabel,
  statTierClass,
} from "@/lib/card-display";
import {
  Plus,
  ArrowLeftRight,
  Link as LinkIcon,
  Search,
  X,
  Check,
  Sparkles,
} from "lucide-react";

// (Booster display reads the resolved `player.booster1`/`booster2` objects from
// the API — the Booster table is seeded from the efootbase dump with real names
// + stat magnitudes, so we render those instead of a `Booster #{id}` fallback.
// Added 2026-10-08; the old BOOSTER_LABELS guess table (7 hardcoded ids) is gone.)

// Pitch position grid (left→right, top→bottom) — 12 outfield slots + GK row.
const PITCH_SLOTS: Position[] = ["LWF", "SS", "RWF", "LMF", "AMF", "RMF", "CMF", "DMF", "LB", "CB", "RB", "GK"];


/** Hexagonal radar chart comparing SHT, PAS, STR, DEF, SPD, DRI */
function CompareRadar({ p1, p2 }: { p1?: PlayerCardDTO; p2?: PlayerCardDTO }) {
  const size = 260;
  const center = size / 2;
  const radius = 80;

  const axes = [
    { label: "SHT", angle: -Math.PI / 2, stat: "finishing" },
    { label: "PAS", angle: -Math.PI / 6, stat: "lowPass" },
    { label: "STR", angle: Math.PI / 6, stat: "physicalContact" },
    { label: "DEF", angle: Math.PI / 2, stat: "defensiveAwareness" },
    { label: "SPD", angle: (5 * Math.PI) / 6, stat: "speed" },
    { label: "DRI", angle: (-5 * Math.PI) / 6, stat: "dribbling" },
  ];

  const getPolygonPoints = (player: PlayerCardDTO) => {
    return axes
      .map((a) => {
        const val = player.stats[a.stat as BaseStat] ?? 70;
        const norm = Math.max(0.2, Math.min(1, val / 100));
        const r = radius * norm;
        const x = center + r * Math.cos(a.angle);
        const y = center + r * Math.sin(a.angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div className="flex flex-col items-center justify-center p-2">
      <svg width={size} height={size} className="overflow-visible">
        {/* Concentric Hexagons */}
        {[0.25, 0.5, 0.75, 1].map((scale, idx) => {
          const pts = axes
            .map((a) => {
              const r = radius * scale;
              const x = center + r * Math.cos(a.angle);
              const y = center + r * Math.sin(a.angle);
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polygon
              key={idx}
              points={pts}
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {axes.map((a, idx) => {
          const x2 = center + radius * Math.cos(a.angle);
          const y2 = center + radius * Math.sin(a.angle);
          const lx = center + (radius + 18) * Math.cos(a.angle);
          const ly = center + (radius + 18) * Math.sin(a.angle);
          return (
            <g key={idx}>
              <line
                x1={center}
                y1={center}
                x2={x2}
                y2={y2}
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth="1"
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fill="rgba(255, 255, 255, 0.6)"
                fontSize="11"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {a.label}
              </text>
            </g>
          );
        })}

        {/* Player 1 Polygon (Lime) */}
        {p1 && (
          <polygon
            points={getPolygonPoints(p1)}
            fill="rgba(172, 244, 26, 0.25)"
            stroke="#acf41a"
            strokeWidth="2"
          />
        )}

        {/* Player 2 Polygon (Cyan) */}
        {p2 && (
          <polygon
            points={getPolygonPoints(p2)}
            fill="rgba(6, 182, 212, 0.25)"
            stroke="#06b6d4"
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  );
}
function aptitudeDot(v: number | undefined): string {
  if (v === 0) return "bg-[var(--color-accent)]"; // full / registered
  if (v === 1) return "bg-[var(--color-accent-secondary)]";  // partial
  return "bg-[var(--color-line-active)]";               // none
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsParam = searchParams.get("ids") ?? "";
  const initialIds = idsParam.split(",").filter(Boolean);

  const [selected, setSelected] = useState<string[]>(initialIds);
  const [pickModalSlot, setPickModalSlot] = useState<number | null>(null);
  const [searchVal, setSearchVal] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selected.length > 0) {
      window.history.replaceState(null, "", `/compare?ids=${selected.join(",")}`);
    }
  }, [selected]);

  const search = trpc.player.search.useQuery(
    { q: searchVal, limit: 10 },
    { enabled: searchVal.trim().length > 0 }
  );

  // Compare fires as soon as ANY card is picked (≥1) so the chosen card renders
  // immediately — not gated on ≥2, which made single-card slots show the
  // Add Player placeholder again and swallow the second pick. The stat matrix
  // panel below remains gated on compareData.length >= 2. (Fix 2026-10-08.)
  const compareQ = trpc.player.compare.useQuery(
    { cardIds: selected },
    { enabled: selected.length >= 1 }
  );

  const swapPlayers = () => {
    if (selected.length >= 2) {
      setSelected([selected[1]!, selected[0]!, ...selected.slice(2)]);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectCardForSlot = (id: string) => {
    if (pickModalSlot !== null) {
      const next = [...selected];
      next[pickModalSlot] = id;
      setSelected(next.filter(Boolean));
      setPickModalSlot(null);
      setSearchVal("");
    }
  };

  const removeSlot = (slotIdx: number) => {
    setSelected((prev) => prev.filter((_, i) => i !== slotIdx));
  };

  const compareData = (compareQ.data ?? []) as PlayerCardDTO[];
  const attackingCols = ATTACKING_STATS as BaseStat[];
  const strengthCols = STRENGTH_STATS as BaseStat[];
  const defendingCols = DEFENDING_STATS as BaseStat[];

  return (
    <div className="space-y-6">
      {/* Breadcrumbs matching efootbase */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 list-none p-0 m-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item text-white text-xs font-medium">Compare</li>
      </ol>

      {/* Title & Actions Bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">Compare</h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Compare two eFootball player cards side by side — train both builds, then read stats, skills, and position proficiency.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selected.length >= 2 && (
            <button
              onClick={swapPlayers}
              className="p-2 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-elevated)] transition-colors"
              title="Swap players"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={copyLink}
            className="p-2 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-elevated)] transition-colors"
            title="Copy share link"
          >
            {copied ? <Check className="h-4 w-4 text-[var(--color-accent)]" /> : <LinkIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Comparison Console: Slot 1 (Left), Radar (Center), Slot 2 (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center justify-center gap-6 max-w-4xl mx-auto pt-4">
        {/* Slot 0 (Left) */}
        <div className="flex justify-center">
          {(() => {
            const cardId = selected[0];
            const player = compareData.find((p) => p.id === cardId);
            if (cardId && player) {
              return (
                <div className="flex flex-col items-center space-y-3">
                  <div className="relative group w-48">
                    <PlayerCard player={player} size="full" showDetails />
                    <button
                      onClick={() => removeSlot(0)}
                      className="absolute -top-2 -right-2 p-1.5 rounded-full bg-[var(--color-panel)] border border-[var(--color-line-active)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] shadow-md transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-sm text-white">{player.name}</h3>
                    <span className="text-xs text-[var(--color-text-dim)] font-mono">
                      {player.ovr} OVR · Max {player.maxOvr}
                    </span>
                  </div>
                </div>
              );
            }
            return (
              <button
                type="button"
                onClick={() => {
                  setPickModalSlot(0);
                  setSearchVal("");
                }}
                className="w-48 aspect-[240/339] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] hover:bg-[var(--color-elevated)] hover:border-[var(--color-line-active)] flex flex-col items-center justify-center p-4 text-center transition-all cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-full bg-[var(--color-elevated)] flex items-center justify-center text-[var(--color-text-secondary)] group-hover:text-white transition-colors shadow">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="font-bold text-sm text-white mt-3">Add Player</span>
                <span className="text-xs text-[var(--color-text-dim)] mt-1">Search and select a player</span>
              </button>
            );
          })()}
        </div>

        {/* Center: Hexagonal Radar Chart */}
        <div className="hidden md:flex flex-col items-center justify-center">
          <CompareRadar
            p1={compareData.find((p) => p.id === selected[0])}
            p2={compareData.find((p) => p.id === selected[1])}
          />
        </div>

        {/* Slot 1 (Right) */}
        <div className="flex justify-center">
          {(() => {
            const cardId = selected[1];
            const player = compareData.find((p) => p.id === cardId);
            if (cardId && player) {
              return (
                <div className="flex flex-col items-center space-y-3">
                  <div className="relative group w-48">
                    <PlayerCard player={player} size="full" showDetails />
                    <button
                      onClick={() => removeSlot(1)}
                      className="absolute -top-2 -right-2 p-1.5 rounded-full bg-[var(--color-panel)] border border-[var(--color-line-active)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] shadow-md transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-sm text-white">{player.name}</h3>
                    <span className="text-xs text-[var(--color-text-dim)] font-mono">
                      {player.ovr} OVR · Max {player.maxOvr}
                    </span>
                  </div>
                </div>
              );
            }
            return (
              <button
                type="button"
                onClick={() => {
                  setPickModalSlot(1);
                  setSearchVal("");
                }}
                className="w-48 aspect-[240/339] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] hover:bg-[var(--color-elevated)] hover:border-[var(--color-line-active)] flex flex-col items-center justify-center p-4 text-center transition-all cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-full bg-[var(--color-elevated)] flex items-center justify-center text-[var(--color-text-secondary)] group-hover:text-white transition-colors shadow">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="font-bold text-sm text-white mt-3">Add Player</span>
                <span className="text-xs text-[var(--color-text-dim)] mt-1">Search and select a player</span>
              </button>
            );
          })()}
        </div>
      </div>

      {/* Modal / Search Overlay for Selecting Player */}
      {pickModalSlot !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Select Player for Slot {pickModalSlot + 1}</h3>
              <button
                onClick={() => setPickModalSlot(null)}
                className="p-1 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-dim)]" />
              <input
                autoFocus
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Search player name (e.g. Messi, Haaland)..."
                className="w-full h-10 pl-9 pr-4 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-line-active)]"
              />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
              {(search.data ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectCardForSlot(p.id)}
                  className="w-full py-2.5 px-2 text-left hover:bg-[var(--color-panel)]/80 rounded-lg flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="font-bold text-[var(--color-text-primary)]">{p.name}</div>
                    <div className="text-[10px] text-[var(--color-text-dim)]">{p.cardType}</div>
                  </div>
                  <span className="font-bold font-mono text-[var(--color-accent)]">{p.ovr} OVR</span>
                </button>
              ))}
              {searchVal && (search.data ?? []).length === 0 && (
                <div className="py-6 text-center text-xs text-[var(--color-text-dim)]">No players found.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Stat Breakdown (efootbase & efhub diverging style) */}
      {compareData.length >= 2 && (
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-6 space-y-6 mt-8">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
            <span className="font-bold text-sm text-[var(--color-accent)]">{compareData[0]?.name}</span>
            <span className="text-xs font-mono text-[var(--color-text-dim)]">ATTRIBUTES COMPARISON</span>
            <span className="font-bold text-sm text-[var(--color-accent-secondary)]">{compareData[1]?.name}</span>
          </div>

          {[
            { title: "ATTACKING", stats: attackingCols },
            { title: "STRENGTH & ATHLETICISM", stats: strengthCols },
            { title: "DEFENDING & GOALKEEPING", stats: defendingCols },
          ].map((cat) => (
            <div key={cat.title} className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">
                {cat.title}
              </h4>
              <div className="space-y-1 font-mono text-xs">
                {cat.stats.map((st) => {
                  const valA = compareData[0]?.stats[st] ?? 0;
                  const valB = compareData[1]?.stats[st] ?? 0;
                  const isAWinner = valA > valB;
                  const isBWinner = valB > valA;

                  return (
                    <div
                      key={st}
                      className="grid grid-cols-[40px_1fr_160px_1fr_40px] items-center gap-3 py-1 px-2 rounded-lg hover:bg-[var(--color-elevated)]/30 transition-colors"
                    >
                      <span
                        className={`text-right font-bold ${
                          isAWinner ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {valA}
                      </span>

                      <div className="h-1.5 w-full bg-[var(--color-elevated)]/80 rounded-full overflow-hidden flex justify-end">
                        <div
                          className={`h-full ${isAWinner ? "bg-[var(--color-accent)]" : "bg-[var(--color-line-active)]"}`}
                          style={{ width: `${Math.min(100, (valA / 100) * 100)}%` }}
                        />
                      </div>

                      <span className="text-center font-sans text-[11px] text-[var(--color-text-secondary)] truncate">
                        {statLabel(st)}
                      </span>

                      <div className="h-1.5 w-full bg-[var(--color-elevated)]/80 rounded-full overflow-hidden flex justify-start">
                        <div
                          className={`h-full ${isBWinner ? "bg-[var(--color-accent-secondary)]" : "bg-[var(--color-line-active)]"}`}
                          style={{ width: `${Math.min(100, (valB / 100) * 100)}%` }}
                        />
                      </div>

                      <span
                        className={`text-left font-bold ${
                          isBWinner ? "text-[var(--color-accent-secondary)]" : "text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {valB}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Position Proficiency Pitch Block (efootbase §22.3 compare_position_proficiency_pitch_block) */}
      {compareData.length >= 2 && (
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">Position Proficiency</span>
            <span className="text-[10px] text-[var(--color-text-dim)]">● registered · ● partial · ● none</span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {compareData.slice(0, 2).map((p) => (
              <div key={p.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--color-text-primary)] truncate">{p.name}</span>
                  <span className="font-mono text-[var(--color-text-dim)]">{POSITION_BY_INDEX[p.registeredPosition] ?? "—"}</span>
                </div>
                {/* Mini pitch — 4 rows of 3 slots following PITCH_SLOTS order */}
                <div className="relative rounded-xl bg-gradient-to-b from-emerald-950/30 to-emerald-900/10 border border-emerald-900/40 px-3 py-3">
                  <div className="grid grid-cols-3 gap-y-3 gap-x-2">
                    {PITCH_SLOTS.map((pos) => {
                      const v = p.positionAptitudes[pos];
                      return (
                        <div key={pos} className="flex flex-col items-center gap-1">
                          <span className={`inline-block h-3 w-3 rounded-full ${aptitudeDot(v)} ring-1 ring-black/30`} />
                          <span className="text-[9px] font-mono text-[var(--color-text-secondary)]">{pos}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booster Pills Section (efootbase §22.3 compare_booster_pills_section) */}
      {compareData.length >= 2 && (
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">Boosters</span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {compareData.slice(0, 2).map((p) => {
              const boosters = [p.booster1, p.booster2].filter(Boolean);
              return (
                <div key={p.id} className="space-y-2">
                  <span className="font-bold text-[var(--color-text-primary)] text-sm truncate block">{p.name}</span>
                  <div className="flex flex-wrap gap-2">
                    {boosters.length === 0 && (
                      <span className="text-[11px] text-[var(--color-text-dim)] italic">No boosters assigned</span>
                    )}
                    {boosters.map((b, i) => (
                      <div
                        key={`b-${p.id}-${i}-${b!.id}`}
                        className="inline-flex flex-col gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--color-accent-secondary)]/30 bg-[var(--color-accent-secondary)]/10"
                      >
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-accent-secondary)]">
                          <Sparkles className="h-3 w-3" /> {b!.name}
                        </span>
                        {Object.keys(b!.stats).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(b!.stats).map(([k, v]) => (
                              <span
                                key={k}
                                className="px-1.5 py-0.5 rounded-md bg-[var(--color-accent-secondary)]/10 text-[10px] font-mono text-[var(--color-accent-secondary)]"
                              >
                                +{v} {statLabel(k as BaseStat)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 rounded-xl bg-[var(--color-panel)]/40 animate-pulse flex items-center justify-center text-xs text-[var(--color-text-dim)]">
          Loading comparison tool…
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
