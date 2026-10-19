"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { QueryErrorState } from "@/lib/query-state";
import { useDebouncedValue, SEARCH_MIN_LENGTH } from "@/lib/use-debounced-value";
import { CARD_TYPE_LABELS, INT8_MAX, positionTiles, type PlayerCardDTO, type BaseStat, type Position } from "@eflab/shared";
import { ATTACKING_STATS, DEFENDING_STATS, STRENGTH_STATS, POSITION_BY_INDEX, statLabel } from "@/lib/card-display";
import { Plus, ArrowLeftRight, Link as LinkIcon, Search, X, Check, Sparkles } from "lucide-react";

// Pitch position grid (left→right, top→bottom) — 12 outfield slots + GK.
const PITCH_SLOTS: Position[] = ["LWF", "SS", "RWF", "LMF", "AMF", "RMF", "CMF", "DMF", "LB", "CB", "RB", "GK"];
// Two slots, like efootbase's compare ("Compare two eFootball player cards side
// by side"): `?ids` is trimmed to the first two valid ids, so the API — which
// accepts up to four — never returns a card that has no tile on this page.
const MAX_SLOTS = 2;
const ID_PATTERN = /^\d{1,19}$/;
// A card id is a Postgres int8: 19 digits can still exceed INT8_MAX, and the
// API rejects the whole batch for one oversized id — drop it here instead.
const isValidId = (s: string): boolean => ID_PATTERN.test(s) && BigInt(s) <= INT8_MAX;

/** Hexagonal radar chart comparing SHT, PAS, STR, DEF, SPD, DRI. */
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
  ] as const;

  const polygon = (player: PlayerCardDTO) =>
    axes
      .map((a) => {
        const val = player.stats[a.stat as BaseStat] ?? 40;
        const norm = Math.max(0.2, Math.min(1, val / 100));
        const r = radius * norm;
        return `${center + r * Math.cos(a.angle)},${center + r * Math.sin(a.angle)}`;
      })
      .join(" ");

  return (
    <div className="flex flex-col items-center justify-center p-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible max-w-full" role="img" aria-label="Stat radar">
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon
            key={scale}
            points={axes.map((a) => `${center + radius * scale * Math.cos(a.angle)},${center + radius * scale * Math.sin(a.angle)}`).join(" ")}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="1"
          />
        ))}
        {axes.map((a) => (
          <g key={a.label}>
            <line x1={center} y1={center} x2={center + radius * Math.cos(a.angle)} y2={center + radius * Math.sin(a.angle)} stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1" />
            <text
              x={center + (radius + 18) * Math.cos(a.angle)}
              y={center + (radius + 18) * Math.sin(a.angle)}
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
        ))}
        {p1 && <polygon points={polygon(p1)} fill="rgba(172, 244, 26, 0.25)" stroke="#acf41a" strokeWidth="2" />}
        {p2 && <polygon points={polygon(p2)} fill="rgba(6, 182, 212, 0.25)" stroke="#06b6d4" strokeWidth="2" />}
      </svg>
    </div>
  );
}

function aptitudeDot(v: number | undefined): string {
  if (v === 0) return "bg-[var(--color-accent)]";
  if (v === 1) return "bg-[var(--color-accent-secondary)]";
  return "bg-[var(--color-line-active)]";
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const id of raw.split(",")) {
    const s = id.trim();
    if (isValidId(s) && !out.includes(s)) out.push(s);
    if (out.length === MAX_SLOTS) break;
  }
  return out;
}

export function CompareClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?ids` is the source of truth for the selection: every change (pick, remove,
  // swap) is written back with router.replace so the URL stays shareable.
  const rawIds = searchParams.get("ids");
  const selected = useMemo(() => parseIds(rawIds), [rawIds]);
  const setSelected = useCallback(
    (next: string[]) => {
      const ids = next.filter((id, i) => id && next.indexOf(id) === i).slice(0, MAX_SLOTS);
      router.replace((ids.length ? `/compare?ids=${ids.join(",")}` : "/compare") as Route, { scroll: false });
    },
    [router],
  );
  // A pasted link may carry more than MAX_SLOTS ids, duplicates or junk:
  // rewrite it to the canonical trimmed form so the share link and the tiles
  // agree (no-op when the URL is already canonical).
  useEffect(() => {
    if (rawIds !== null && rawIds !== selected.join(",")) setSelected(selected);
  }, [rawIds, selected, setSelected]);

  const [pickSlot, setPickSlot] = useState<number | null>(null);
  const [searchVal, setSearchVal] = useState("");
  const [copied, setCopied] = useState(false);

  // Compare fires as soon as ANY card is picked so the chosen card renders at
  // once; the matrix below is gated on two loaded slots.
  const compareQ = trpc.player.compare.useQuery({ cardIds: selected }, { enabled: selected.length >= 1, placeholderData: (prev) => prev });
  const compareData = useMemo(() => (selected.length >= 1 ? compareQ.data ?? [] : []), [compareQ.data, selected.length]);

  // Every panel reads its card by slot id — never by API row order — so the
  // left slot is always the left column and Swap reorders every panel together.
  const slots = useMemo(() => selected.map((id) => compareData.find((p) => p.id === id)), [selected, compareData]);
  const left = slots[0];
  const right = slots[1];
  const loadedSlots = slots.filter((p): p is PlayerCardDTO => p !== undefined);
  // Position tiles of each loaded card (exact formula on its level-1 stats).
  const tilesBySlot = loadedSlots.map((p) => positionTiles(p.stats, { height: p.height, weakFootAccuracy: p.weakFootAccuracy }, p.positionAptitudes));

  const swapPlayers = () => {
    if (selected.length === 2) setSelected([selected[1]!, selected[0]!]);
  };
  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const removeSlot = (slotIdx: number) => setSelected(selected.filter((_, i) => i !== slotIdx));
  const selectCardForSlot = (id: string) => {
    if (pickSlot === null) return;
    const next = [...selected];
    next[pickSlot] = id;
    setSelected(next.filter(Boolean));
    setPickSlot(null);
  };

  // ---- Picker dialog: native <dialog> (modal, focus trapped by the browser,
  // Escape closes via `cancel`), focus restored to the opener on close.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openPicker = (slot: number) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearchVal("");
    setPickSlot(slot);
  };
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pickSlot !== null) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pickSlot]);
  const onDialogClose = () => {
    setPickSlot(null);
    setSearchVal("");
    openerRef.current?.focus();
    openerRef.current = null;
  };

  const debouncedSearch = useDebouncedValue(searchVal.trim(), 250);
  const canSearch = debouncedSearch.length >= SEARCH_MIN_LENGTH;
  const search = trpc.player.search.useQuery({ q: debouncedSearch, limit: 10 }, { enabled: pickSlot !== null && canSearch });
  const searchResults = canSearch ? search.data ?? [] : [];

  const renderSlot = (slotIdx: number) => {
    const cardId = selected[slotIdx];
    const player = slots[slotIdx];
    if (cardId && player) {
      return (
        <div className="flex flex-col items-center space-y-3">
          <div className="relative group w-44 sm:w-48 max-w-full">
            <PlayerCard player={player} size="full" showDetails />
            <button
              type="button"
              onClick={() => removeSlot(slotIdx)}
              aria-label={`Remove ${player.name} from slot ${slotIdx + 1}`}
              className="absolute -top-2 -right-2 p-1.5 rounded-full bg-[var(--color-panel)] border border-[var(--color-line-active)] text-[var(--color-text-secondary)] hover:text-white shadow-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
          <div className="text-center">
            <h3 className="font-bold text-sm text-white">
              <Link href={`/players/${player.baseId}/${player.id}`} className="hover:text-[var(--color-accent)] transition-colors">
                {player.name}
              </Link>
            </h3>
            <span className="text-xs text-[var(--color-text-dim)] font-mono">
              {CARD_TYPE_LABELS[player.cardType]} · {player.ovr} OVR · Max {player.maxOvr}
            </span>
          </div>
        </div>
      );
    }
    if (cardId && compareQ.isError) {
      // Retry re-runs the batch; Remove drops this id so the other slot can load.
      return (
        <div className="flex w-44 sm:w-48 flex-col items-center gap-2">
          <QueryErrorState error={compareQ.error} onRetry={() => void compareQ.refetch()} title="Could not load this card" className="w-full !p-4" />
          <button
            type="button"
            onClick={() => removeSlot(slotIdx)}
            aria-label={`Remove card #${cardId} from slot ${slotIdx + 1}`}
            className="text-xs text-[var(--color-accent)] hover:underline cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Remove
          </button>
        </div>
      );
    }
    if (cardId && compareQ.isSuccess && !compareQ.isPlaceholderData) {
      // The API skipped this id: unknown card → drop it from the URL.
      return (
        <div className="w-44 sm:w-48 aspect-[240/339] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] flex flex-col items-center justify-center p-4 text-center text-xs text-[var(--color-text-dim)] space-y-2">
          <p>Card #{cardId} was not found.</p>
          <button type="button" onClick={() => removeSlot(slotIdx)} className="text-[var(--color-accent)] hover:underline cursor-pointer">
            Remove
          </button>
        </div>
      );
    }
    if (cardId) {
      return <div className="w-44 sm:w-48 aspect-[240/339] rounded-2xl bg-[var(--color-panel)] animate-pulse" aria-busy="true" aria-label="Loading card" />;
    }
    return (
      <button
        type="button"
        onClick={() => openPicker(slotIdx)}
        className="w-44 sm:w-48 aspect-[240/339] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] hover:bg-[var(--color-elevated)] hover:border-[var(--color-line-active)] flex flex-col items-center justify-center p-4 text-center transition-all cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <div className="h-10 w-10 rounded-full bg-[var(--color-elevated)] flex items-center justify-center text-[var(--color-text-secondary)] group-hover:text-white transition-colors shadow">
          <Plus className="h-5 w-5" aria-hidden />
        </div>
        <span className="font-bold text-sm text-white mt-3">Add Player</span>
        <span className="text-xs text-[var(--color-text-dim)] mt-1">Slot {slotIdx + 1} — search and select a player</span>
      </button>
    );
  };

  const attackingCols = ATTACKING_STATS as BaseStat[];
  const strengthCols = STRENGTH_STATS as BaseStat[];
  const defendingCols = DEFENDING_STATS as BaseStat[];
  const matrixReady = left !== undefined && right !== undefined;

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

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold sm:text-4xl text-white tracking-tight">Compare</h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Compare eFootball player cards side by side — stats, skills, position proficiency and boosters.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selected.length >= 2 && (
            <button
              type="button"
              onClick={swapPlayers}
              className="p-2 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-elevated)] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              title="Swap players"
              aria-label="Swap the two players"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="p-2 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-elevated)] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            title="Copy share link"
            aria-label={copied ? "Link copied" : "Copy share link"}
          >
            {copied ? <Check className="h-4 w-4 text-[var(--color-accent)]" aria-hidden /> : <LinkIcon className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Console: slot 1 · radar · slot 2 */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center justify-center gap-6 max-w-4xl mx-auto pt-4">
        <div className="flex justify-center">{renderSlot(0)}</div>
        <div className="hidden md:flex flex-col items-center justify-center">
          <CompareRadar p1={left} p2={right} />
        </div>
        <div className="flex justify-center">{renderSlot(1)}</div>
      </div>

      {/* Picker — named modal dialog */}
      <dialog
        ref={dialogRef}
        onClose={onDialogClose}
        // Chrome lets a non-empty <input type="search"> swallow the first Escape
        // (it clears the field) before the dialog's `cancel` fires — close on
        // the key itself so one Escape always dismisses the picker.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.close();
          }
        }}
        aria-labelledby="compare-picker-title"
        className="m-auto w-full max-w-md rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 shadow-2xl text-[var(--color-text-primary)] backdrop:bg-black/80 backdrop:backdrop-blur-sm"
      >
        {pickSlot !== null && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="compare-picker-title" className="font-bold text-sm text-[var(--color-text-primary)]">
                Select player for slot {pickSlot + 1}
              </h2>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="p-1 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-dim)]" aria-hidden />
              <input
                autoFocus
                type="search"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Search player name (e.g. Messi, Haaland)…"
                aria-label="Search player name"
                className="w-full h-10 pl-9 pr-4 rounded-xl bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-line-active)]"
              />
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60" aria-live="polite">
              {!canSearch ? (
                <div className="py-6 text-center text-xs text-[var(--color-text-dim)]">Type at least {SEARCH_MIN_LENGTH} characters.</div>
              ) : search.isError ? (
                <div className="py-6 text-center text-xs text-[var(--color-text-dim)]">
                  Search failed.{" "}
                  <button type="button" onClick={() => void search.refetch()} className="text-[var(--color-accent)] hover:underline cursor-pointer">
                    Retry
                  </button>
                </div>
              ) : search.isPending ? (
                <div className="py-6 text-center text-xs text-[var(--color-text-dim)]">Searching…</div>
              ) : searchResults.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--color-text-dim)]">No players found.</div>
              ) : (
                searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectCardForSlot(p.id)}
                    className="w-full py-2.5 px-2 text-left hover:bg-[var(--color-elevated)]/80 rounded-lg flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--color-text-primary)] truncate">{p.name}</div>
                      <div className="text-[10px] text-[var(--color-text-dim)]">
                        {CARD_TYPE_LABELS[p.cardType]} · {POSITION_BY_INDEX[p.registeredPosition] ?? "—"}
                      </div>
                    </div>
                    <span className="font-bold font-mono text-[var(--color-accent)] shrink-0">{p.ovr} OVR</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </dialog>

      {selected.length >= 1 && compareQ.isError && loadedSlots.length === 0 && (
        <QueryErrorState error={compareQ.error} onRetry={() => void compareQ.refetch()} title="Could not load the comparison" />
      )}

      {/* Stat matrix — left column = slot 1, right column = slot 2 */}
      {matrixReady && (
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-4 sm:p-6 space-y-6 mt-8 overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] pb-3">
            <span className="font-bold text-sm text-[var(--color-accent)] truncate">{left.name}</span>
            <span className="text-xs font-mono text-[var(--color-text-dim)] shrink-0">ATTRIBUTES</span>
            <span className="font-bold text-sm text-[var(--color-accent-secondary)] truncate text-right">{right.name}</span>
          </div>

          {[
            { title: "ATTACKING", stats: attackingCols },
            { title: "STRENGTH & ATHLETICISM", stats: strengthCols },
            { title: "DEFENDING & GOALKEEPING", stats: defendingCols },
          ].map((cat) => (
            <div key={cat.title} className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-dim)]">{cat.title}</h4>
              <div className="space-y-1 font-mono text-xs">
                {cat.stats.map((st) => {
                  const valA = left.stats[st] ?? 0;
                  const valB = right.stats[st] ?? 0;
                  const isAWinner = valA > valB;
                  const isBWinner = valB > valA;
                  return (
                    <div key={st} className="grid grid-cols-[32px_1fr_minmax(72px,160px)_1fr_32px] items-center gap-2 sm:gap-3 py-1 px-1 sm:px-2 rounded-lg hover:bg-[var(--color-elevated)]/30 transition-colors">
                      <span className={`text-right font-bold ${isAWinner ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`}>{valA}</span>
                      <div className="h-1.5 w-full bg-[var(--color-elevated)]/80 rounded-full overflow-hidden flex justify-end">
                        <div className={`h-full ${isAWinner ? "bg-[var(--color-accent)]" : "bg-[var(--color-line-active)]"}`} style={{ width: `${Math.min(100, valA)}%` }} />
                      </div>
                      <span className="text-center font-sans text-[11px] text-[var(--color-text-secondary)] truncate">{statLabel(st)}</span>
                      <div className="h-1.5 w-full bg-[var(--color-elevated)]/80 rounded-full overflow-hidden flex justify-start">
                        <div className={`h-full ${isBWinner ? "bg-[var(--color-accent-secondary)]" : "bg-[var(--color-line-active)]"}`} style={{ width: `${Math.min(100, valB)}%` }} />
                      </div>
                      <span className={`text-left font-bold ${isBWinner ? "text-[var(--color-accent-secondary)]" : "text-[var(--color-text-secondary)]"}`}>{valB}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Position proficiency — one column per slot, in slot order */}
      {matrixReady && (
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] pb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">Position Proficiency</span>
            <span className="text-[10px] text-[var(--color-text-dim)]">● registered · ● partial · ● none</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {loadedSlots.map((p, i) => (
              <div key={`${i}-${p.id}`} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--color-text-primary)] truncate">{p.name}</span>
                  <span className="font-mono text-[var(--color-text-dim)]">{POSITION_BY_INDEX[p.registeredPosition] ?? "—"}</span>
                </div>
                <div className="relative rounded-xl bg-gradient-to-b from-emerald-950/30 to-emerald-900/10 border border-emerald-900/40 px-3 py-3">
                  <div className="grid grid-cols-3 gap-y-3 gap-x-2">
                    {PITCH_SLOTS.map((pos) => {
                      const v = p.positionAptitudes[pos];
                      // Same exact formula as the detail page's Pitch Map, on the
                      // level-1 stats this page compares.
                      const r = tilesBySlot[i]![pos];
                      return (
                        <div key={pos} className="flex flex-col items-center gap-1" title={`${pos}: ${r} OVR at level 1`} data-testid={`compare-tile-${pos}`}>
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

      {/* Boosters — one column per slot, in slot order */}
      {matrixReady && (
        <div className="rounded-2xl border border-[var(--color-line)]/80 bg-[var(--color-panel)]/40 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-3">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden />
            <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">Boosters</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            {loadedSlots.map((p, i) => {
              const boosters = [p.booster1, p.booster2].filter((b): b is NonNullable<typeof b> => b !== null);
              return (
                <div key={`${i}-${p.id}`} className="space-y-2 min-w-0">
                  <span className="font-bold text-[var(--color-text-primary)] text-sm truncate block">{p.name}</span>
                  <div className="flex flex-wrap gap-2">
                    {boosters.length === 0 && <span className="text-[11px] text-[var(--color-text-dim)] italic">No boosters assigned</span>}
                    {boosters.map((b, j) => (
                      <div key={`b-${p.id}-${j}-${b.id}`} className="inline-flex flex-col gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--color-accent-secondary)]/30 bg-[var(--color-accent-secondary)]/10 max-w-full">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--color-accent-secondary)]">
                          <Sparkles className="h-3 w-3" aria-hidden /> {b.name}
                        </span>
                        {Object.keys(b.stats).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(b.stats).map(([k, v]) => (
                              <span key={k} className="px-1.5 py-0.5 rounded-md bg-[var(--color-accent-secondary)]/10 text-[10px] font-mono text-[var(--color-accent-secondary)]">
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
