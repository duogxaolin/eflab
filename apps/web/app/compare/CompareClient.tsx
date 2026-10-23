"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { SearchPalette } from "@/components/search/SearchPalette";
import { QueryErrorState } from "@/lib/query-state";
import { CARD_TYPE_LABELS, INT8_MAX, positionTiles, type PlayerCardDTO, type BaseStat, type Position } from "@eflab/shared";
import { ATTACKING_STATS, DEFENDING_STATS, STRENGTH_STATS, POSITION_BY_INDEX, statLabel } from "@/lib/card-display";
import { Plus, ArrowLeftRight, Link as LinkIcon, X, Check, Sparkles } from "lucide-react";

// Pitch position grid (left→right, top→bottom) — 12 outfield slots + GK.
const PITCH_SLOTS: Position[] = ["LWF", "SS", "RWF", "LMF", "AMF", "RMF", "CMF", "DMF", "LB", "CB", "RB", "GK"];
// Two slots (a two-card tool): `?ids` is trimmed to the first two valid ids,
// so the API — which accepts up to four — never returns a card that has no
// tile on this page.
const MAX_SLOTS = 2;
const ID_PATTERN = /^\d{1,19}$/;
// A card id is a Postgres int8: 19 digits can still exceed INT8_MAX, and the
// API rejects the whole batch for one oversized id — drop it here instead.
const isValidId = (s: string): boolean => ID_PATTERN.test(s) && BigInt(s) <= INT8_MAX;

// Side colours: slot 1 = accent (lime), slot 2 = cyan — every panel.
const SIDE_A = "var(--color-accent)";
const SIDE_B = "var(--color-accent-secondary)";

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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="h-auto max-w-full overflow-visible" role="img" aria-label="Stat radar">
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
          {/* Axis labels 12 px muted (Inter, as the rest of the page). */}
          <text
            x={center + (radius + 18) * Math.cos(a.angle)}
            y={center + (radius + 18) * Math.sin(a.angle)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="12"
            style={{ fill: "var(--color-text-secondary)" }}
          >
            {a.label}
          </text>
        </g>
      ))}
      {p1 && <polygon points={polygon(p1)} strokeWidth="2" style={{ fill: `color-mix(in srgb, ${SIDE_A} 25%, transparent)`, stroke: SIDE_A }} />}
      {p2 && <polygon points={polygon(p2)} strokeWidth="2" style={{ fill: `color-mix(in srgb, ${SIDE_B} 25%, transparent)`, stroke: SIDE_B }} />}
    </svg>
  );
}

function aptitudeDot(v: number | undefined): string {
  if (v === 0) return "bg-[var(--color-accent)]";
  if (v === 1) return "bg-[var(--color-accent-secondary)]";
  return "bg-[var(--color-line-active)]";
}

/** The slot ids of `?ids` (valid, distinct, at most MAX_SLOTS) and how many
 *  malformed entries were dropped before the cut (empty entries — `1,,2` or a
 *  trailing comma — are not counted; duplicates and extra ids are trimmed
 *  silently). */
function parseIds(raw: string | null): { ids: string[]; malformed: number } {
  if (!raw) return { ids: [], malformed: 0 };
  const ids: string[] = [];
  let malformed = 0;
  for (const id of raw.split(",")) {
    if (ids.length === MAX_SLOTS) break;
    const s = id.trim();
    if (s === "") continue;
    if (!isValidId(s)) malformed++;
    else if (!ids.includes(s)) ids.push(s);
  }
  return { ids, malformed };
}

const MD_QUERY = "(min-width: 48rem)";
function subscribeMd(onChange: () => void): () => void {
  const mql = window.matchMedia(MD_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
/** True from md (768 px). The server render and the first paint read false
 *  (the plain face), so a phone never flashes the detail overlays. */
function useFromMd(): boolean {
  return useSyncExternalStore(
    subscribeMd,
    () => window.matchMedia(MD_QUERY).matches,
    () => false,
  );
}

export function CompareClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?ids` is the source of truth for the selection: every change (pick, remove,
  // swap) is written back with router.replace so the URL stays shareable.
  const rawIds = searchParams.get("ids");
  const parsed = useMemo(() => parseIds(rawIds), [rawIds]);
  const selected = parsed.ids;
  // Slot faces: the detail overlays (flag, MAX LVL, MAX OVR) only from md —
  // on the ~170 px phone slots they overlap; the line under the card carries
  // the same numbers.
  const fromMd = useFromMd();
  const setSelected = useCallback(
    (next: string[]) => {
      const ids = next.filter((id, i) => id && next.indexOf(id) === i).slice(0, MAX_SLOTS);
      router.replace((ids.length ? `/compare?ids=${ids.join(",")}` : "/compare") as Route, { scroll: false });
    },
    [router],
  );
  // Cards of the link that were dropped (efootbase-behaviour-parity "Compare
  // Guards"): malformed entries (dropped while parsing) and ids the API does
  // not know (dropped once the comparison answered). Shown in a polite status
  // line until the user changes the selection.
  const [droppedMalformed, setDroppedMalformed] = useState(0);
  const [droppedUnknown, setDroppedUnknown] = useState(0);
  const droppedCount = droppedMalformed + droppedUnknown;
  const clearDropped = () => {
    setDroppedMalformed(0);
    setDroppedUnknown(0);
  };

  // A pasted link may carry more than MAX_SLOTS ids, duplicates or junk:
  // rewrite it to the canonical trimmed form so the share link and the tiles
  // agree (no-op when the URL is already canonical).
  useEffect(() => {
    if (rawIds !== null && rawIds !== selected.join(",")) {
      if (parsed.malformed > 0) setDroppedMalformed(parsed.malformed);
      setSelected(selected);
    }
  }, [rawIds, selected, parsed.malformed, setSelected]);

  const [pickSlot, setPickSlot] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // Persistent slot wrappers: the picker returns focus here when the button
  // that opened it was replaced by the chosen card.
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastSlotRef = useRef<number>(0);
  // Slot just filled from the picker: focus waits on its wrapper and moves to
  // the card link once the card has loaded (the opener button is gone).
  const [focusSlot, setFocusSlot] = useState<number | null>(null);
  // The same slot for the palette's close handler (read synchronously, so it
  // does not depend on the render that state update triggers).
  const pendingFocusRef = useRef<number | null>(null);

  // Compare fires as soon as ANY card is picked so the chosen card renders at
  // once; the matrix below is gated on two loaded slots.
  const compareQ = trpc.player.compare.useQuery({ cardIds: selected }, { enabled: selected.length >= 1, placeholderData: (prev) => prev });
  const compareData = useMemo(() => (selected.length >= 1 ? compareQ.data ?? [] : []), [compareQ.data, selected.length]);

  // Every panel reads its card by slot id — never by API row order — so the
  // left slot is always the left column and Swap reorders every panel together.
  const slots = useMemo(() => selected.map((id) => compareData.find((p) => p.id === id)), [selected, compareData]);
  // Ids the API skipped (unknown cards): once the comparison has answered for
  // exactly this selection (not the previous selection's placeholder), drop
  // them from the URL.
  const settled = selected.length >= 1 && compareQ.isSuccess && !compareQ.isPlaceholderData;
  const missingCount = settled ? slots.filter((p) => p === undefined).length : 0;
  useEffect(() => {
    if (missingCount === 0) return;
    setDroppedUnknown(missingCount);
    setSelected(selected.filter((_, i) => slots[i] !== undefined));
  }, [missingCount, selected, slots, setSelected]);
  const left = slots[0];
  const right = slots[1];
  const loadedSlots = slots.filter((p): p is PlayerCardDTO => p !== undefined);
  // Position tiles of each loaded card (exact formula on its level-1 stats).
  const tilesBySlot = loadedSlots.map((p) => positionTiles(p.stats, { height: p.height, weakFootAccuracy: p.weakFootAccuracy }, p.positionAptitudes));

  const canSwap = selected.length === 2;
  const swapPlayers = () => {
    if (!canSwap) return;
    clearDropped();
    setSelected([selected[1]!, selected[0]!]);
  };
  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // Remove (B6): the button unmounts with its slot's card, so focus parks on
  // the slot's persistent wrapper at once and moves to the "Add Player"
  // button of the slot that became empty once it renders. `?ids` is a compact
  // list, so removing slot 1 of two moves the other card into slot 1 and the
  // empty slot is slot 2 — its "Add Player" gets focus.
  const [focusAddSlot, setFocusAddSlot] = useState<number | null>(null);
  const removeSlot = (slotIdx: number) => {
    const next = selected.filter((_, i) => i !== slotIdx);
    slotRefs.current[slotIdx]?.focus();
    setFocusAddSlot(next.length);
    clearDropped();
    setSelected(next);
  };
  useEffect(() => {
    if (focusAddSlot === null || selected.length !== focusAddSlot) return;
    const add = slotRefs.current[focusAddSlot]?.querySelector<HTMLElement>("[data-slot-add]");
    if (!add) return;
    const active = document.activeElement;
    // Only while focus is still parked on a slot wrapper or lost to the body.
    if (active === null || active === document.body || slotRefs.current.includes(active as HTMLDivElement)) add.focus();
    setFocusAddSlot(null);
  }, [focusAddSlot, selected.length]);
  // Picker rows that cannot be chosen: every card already in a slot (the
  // picker only opens on an empty slot), with its slot number.
  const pickerExclude = useMemo(() => Object.fromEntries(selected.map((id, i) => [id, `In slot ${i + 1}`])), [selected]);
  const openPicker = (slot: number) => {
    lastSlotRef.current = slot;
    setPickSlot(slot);
  };
  const selectCardForSlot = (id: string) => {
    // The palette never offers a card already in a slot (excludeIds); the
    // check stays as a guard for any other caller.
    if (pickSlot === null || selected.includes(id)) return;
    const next = [...selected];
    next[pickSlot] = id;
    const filtered = next.filter(Boolean);
    clearDropped();
    setSelected(filtered);
    // An empty slot 2 picked while slot 1 is empty becomes slot 1.
    pendingFocusRef.current = filtered.indexOf(id);
    setFocusSlot(filtered.indexOf(id));
  };
  // Once the picked card is on screen, hand focus from the wrapper to its link
  // (only if focus is still parked on the wrapper or lost to the body).
  const focusTarget = focusSlot !== null ? slots[focusSlot] : undefined;
  useEffect(() => {
    if (focusSlot === null || !focusTarget) return;
    const wrap = slotRefs.current[focusSlot];
    const active = document.activeElement;
    if (wrap && (active === wrap || active === document.body || active === null)) {
      wrap.querySelector<HTMLElement>("a.pcb-tile")?.focus();
    }
    setFocusSlot(null);
  }, [focusSlot, focusTarget]);

  const renderSlot = (slotIdx: number) => {
    const cardId = selected[slotIdx];
    const player = slots[slotIdx];
    if (cardId && player) {
      return (
        <div className="flex w-full md:max-w-40 flex-col items-center gap-3">
          <div className="relative w-full">
            {/* caption "none": the slot prints the name (a link) below the card. */}
            <PlayerCard player={player} size="full" caption="none" showDetails={fromMd} />
            {/* z-20: above the card tile, which rises to z 10 on hover / focus. */}
            <button
              type="button"
              onClick={() => removeSlot(slotIdx)}
              aria-label={`Remove ${player.name} from slot ${slotIdx + 1}`}
              className="button button--sm button--icon-only button--secondary absolute -right-2 -top-2 z-20 shadow-md"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          <div className="min-w-0 text-center">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {/* hit-44: the 17 px tall name gets a 44 px tall tap area on touch screens. inline-block (the
                  only, centred content of the h2, so it looks the same) keeps one box when a long name
                  wraps, so the area is not split across the two line fragments. */}
              <Link href={`/players/${player.baseId}/${player.id}`} className="hit-44 inline-block transition-colors hover:text-[var(--color-accent)]">
                {player.name}
              </Link>
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] tabular-nums">
              {CARD_TYPE_LABELS[player.cardType]} · {player.ovr} OVR · Max {player.maxOvr}
              {/* Below md the face has no MAX LVL badge: the level is here. */}
              {!fromMd && player.levelCap != null && player.levelCap > 0 ? ` · Max Lv ${player.levelCap}` : ""}
            </p>
          </div>
        </div>
      );
    }
    if (cardId && compareQ.isError) {
      // Retry re-runs the batch; Remove drops this id so the other slot can load.
      return (
        <div className="flex w-full md:max-w-40 flex-col items-center gap-2">
          <QueryErrorState error={compareQ.error} onRetry={() => void compareQ.refetch()} title="Could not load this card" className="w-full !p-4" />
          <button
            type="button"
            onClick={() => removeSlot(slotIdx)}
            aria-label={`Remove card #${cardId} from slot ${slotIdx + 1}`}
            className="button button--sm button--ghost text-[var(--color-accent)]"
          >
            Remove
          </button>
        </div>
      );
    }
    // A card the API skipped is dropped from the URL by the effect above (with
    // the status message); until then the slot reads as loading.
    if (cardId) {
      return <div className="efb-compare-slot animate-pulse" aria-busy="true" aria-label="Loading card" />;
    }
    return (
      <button type="button" onClick={() => openPicker(slotIdx)} aria-haspopup="dialog" data-slot-add="" aria-label={`Add Player to slot ${slotIdx + 1}: search and select a player`} className="efb-compare-slot">
        <span className="efb-compare-slot__plus" aria-hidden>
          <Plus className="size-5" />
        </span>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">Add Player</span>
        <span className="text-xs text-[var(--color-text-secondary)]">Search and select a player</span>
      </button>
    );
  };

  const attackingCols = ATTACKING_STATS as BaseStat[];
  const strengthCols = STRENGTH_STATS as BaseStat[];
  const defendingCols = DEFENDING_STATS as BaseStat[];
  const matrixReady = left !== undefined && right !== undefined;

  return (
    <div>
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 mb-3 list-none p-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link hit-44" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator" aria-hidden>
            ›
          </span>
        </li>
        <li className="breadcrumbs__item" aria-current="page">
          Compare
        </li>
      </ol>

      {/* Title row: H1 36/40 (30/36 below 768) + the 36 × 36 ghost swap and
          copy-link buttons at the right. */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="efb-h1 text-[var(--color-text-primary)]">Compare</h1>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={swapPlayers}
            aria-disabled={!canSwap}
            className="button button--md button--icon-only button--ghost"
            title={canSwap ? "Swap players" : "Pick two players to swap them"}
            aria-label="Swap the two players"
          >
            <ArrowLeftRight className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="button button--md button--icon-only button--ghost"
            title="Copy share link"
            aria-label={copied ? "Link copied" : "Copy share link"}
          >
            {copied ? <Check className="size-5 text-[var(--color-accent)]" aria-hidden /> : <LinkIcon className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      <p className="efb-subtitle mt-3">
        Compare two eFootball player cards side by side — stats, skills, position proficiency and boosters.
      </p>
      {/* Always mounted (polite live region); empty and room-less unless a
          card of the opened link was dropped. */}
      <p role="status" className={droppedCount > 0 ? "mt-2 text-xs text-[var(--color-accent-warn)]" : "sr-only"} data-testid="compare-dropped">
        {droppedCount === 0 ? "" : droppedCount === 1 ? "A card in the link was not found." : `${droppedCount} cards in the link were not found.`}
      </p>

      {/* Console: slot 1 · radar · slot 2 — 260 / flexible / 260 from 768 px;
          below, the two slots side by side and the radar under them. */}
      <div className="efb-compare-console mt-6">
        <div ref={(el) => void (slotRefs.current[0] = el)} tabIndex={-1} className="efb-compare-console__slot outline-none">
          {renderSlot(0)}
        </div>
        <div className="efb-compare-console__radar">
          <CompareRadar p1={left} p2={right} />
        </div>
        <div ref={(el) => void (slotRefs.current[1] = el)} tabIndex={-1} className="efb-compare-console__slot outline-none">
          {renderSlot(1)}
        </div>
      </div>

      {/* Picker = the shared search palette (named modal dialog, focus trap,
          Escape, focus return). Enter picks the first result. */}
      <SearchPalette
        open={pickSlot !== null}
        onClose={() => setPickSlot(null)}
        title={`Select player for slot ${(pickSlot ?? lastSlotRef.current) + 1}`}
        onSelect={(p) => selectCardForSlot(p.id)}
        // The cards already in a slot cannot be picked again ("In slot N").
        excludeIds={pickerExclude}
        // After a pick: the slot's wrapper (the effect above then moves focus
        // to the card link); after Escape / backdrop: the opener (null).
        returnFocusTo={() => {
          const slot = pendingFocusRef.current;
          pendingFocusRef.current = null;
          return slot !== null ? slotRefs.current[slot] ?? null : null;
        }}
      />

      {selected.length >= 1 && compareQ.isError && loadedSlots.length === 0 && (
        <QueryErrorState error={compareQ.error} onRetry={() => void compareQ.refetch()} title="Could not load the comparison" className="mt-6" />
      )}

      {/* Stat matrix — left column = slot 1, right column = slot 2 */}
      {matrixReady && (
        <div className="mt-8 space-y-6">
          <section className="efb-card space-y-5 overflow-hidden" aria-labelledby="compare-attributes">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line-separator)] pb-3">
              <span className="truncate text-sm font-semibold text-[var(--color-accent)]">{left.name}</span>
              <h2 id="compare-attributes" className="efb-card__title shrink-0 text-[var(--color-text-secondary)]">
                Attributes
              </h2>
              <span className="truncate text-right text-sm font-semibold text-[var(--color-accent-secondary)]">{right.name}</span>
            </div>

            {[
              { title: "Attacking", stats: attackingCols },
              { title: "Strength & athleticism", stats: strengthCols },
              { title: "Defending & goalkeeping", stats: defendingCols },
            ].map((cat) => (
              <div key={cat.title} className="space-y-2">
                <h3 className="text-xs font-medium text-[var(--color-text-secondary)]">{cat.title}</h3>
                <div className="space-y-1 text-sm tabular-nums">
                  {cat.stats.map((st) => {
                    const valA = left.stats[st] ?? 0;
                    const valB = right.stats[st] ?? 0;
                    const isAWinner = valA > valB;
                    const isBWinner = valB > valA;
                    return (
                      <div
                        key={st}
                        className="grid grid-cols-[32px_1fr_minmax(72px,160px)_1fr_32px] items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-[var(--color-default)] sm:gap-3 sm:px-2"
                      >
                        <span className={`text-right font-bold ${isAWinner ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`}>{valA}</span>
                        <div className="flex h-1.5 w-full justify-end overflow-hidden rounded-full bg-[var(--color-default)]">
                          <div className={`h-full ${isAWinner ? "bg-[var(--color-accent)]" : "bg-[var(--color-line-active)]"}`} style={{ width: `${Math.min(100, valA)}%` }} />
                        </div>
                        <span className="truncate text-center text-xs text-[var(--color-text-secondary)]">{statLabel(st)}</span>
                        <div className="flex h-1.5 w-full justify-start overflow-hidden rounded-full bg-[var(--color-default)]">
                          <div className={`h-full ${isBWinner ? "bg-[var(--color-accent-secondary)]" : "bg-[var(--color-line-active)]"}`} style={{ width: `${Math.min(100, valB)}%` }} />
                        </div>
                        <span className={`text-left font-bold ${isBWinner ? "text-[var(--color-accent-secondary)]" : "text-[var(--color-text-secondary)]"}`}>{valB}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          {/* Position proficiency — one column per slot, in slot order */}
          <section className="efb-card space-y-4" aria-labelledby="compare-proficiency">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line-separator)] pb-3">
              <h2 id="compare-proficiency" className="efb-card__title">
                Position proficiency
              </h2>
              <span className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-[var(--color-accent)]" aria-hidden /> registered
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-[var(--color-accent-secondary)]" aria-hidden /> partial
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-[var(--color-line-active)]" aria-hidden /> none
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {loadedSlots.map((p, i) => (
                <div key={`${i}-${p.id}`} className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-[var(--color-text-primary)]">{p.name}</span>
                    <span className="text-[var(--color-text-secondary)]">{POSITION_BY_INDEX[p.registeredPosition] ?? "—"}</span>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-panel)] px-3 py-3">
                    <div className="grid grid-cols-3 gap-x-2 gap-y-3">
                      {PITCH_SLOTS.map((pos) => {
                        const v = p.positionAptitudes[pos];
                        // Same exact formula as the detail page's Pitch Map, on the
                        // level-1 stats this page compares.
                        const r = tilesBySlot[i]![pos];
                        return (
                          <div key={pos} className="flex flex-col items-center gap-1" title={`${pos}: ${r} OVR at level 1`} data-testid={`compare-tile-${pos}`}>
                            <span className={`inline-block size-3 rounded-full ${aptitudeDot(v)} ring-1 ring-black/30`} />
                            <span className="text-[11px] text-[var(--color-text-secondary)]">{pos}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Boosters — one column per slot, in slot order */}
          <section className="efb-card space-y-4" aria-labelledby="compare-boosters">
            <div className="flex items-center gap-2 border-b border-[var(--color-line-separator)] pb-3">
              <Sparkles className="size-4 text-[var(--color-skill-boost)]" aria-hidden />
              <h2 id="compare-boosters" className="efb-card__title">
                Boosters
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {loadedSlots.map((p, i) => {
                const boosters = [p.booster1, p.booster2].filter((b): b is NonNullable<typeof b> => b !== null);
                return (
                  <div key={`${i}-${p.id}`} className="min-w-0 space-y-2">
                    <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{p.name}</span>
                    <div className="flex flex-wrap gap-2">
                      {boosters.length === 0 && <span className="text-xs text-[var(--color-text-secondary)]">No boosters assigned</span>}
                      {boosters.map((b, j) => (
                        <div key={`b-${p.id}-${j}-${b.id}`} className="inline-flex max-w-full flex-col gap-1 rounded-xl bg-[var(--color-default)] px-2.5 py-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-skill-boost)]">
                            <Sparkles className="size-3" aria-hidden /> {b.name}
                          </span>
                          {Object.keys(b.stats).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(b.stats).map(([k, v]) => (
                                <span key={k} className="rounded-md bg-[var(--color-panel)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--color-text-primary)]">
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
          </section>
        </div>
      )}
    </div>
  );
}
