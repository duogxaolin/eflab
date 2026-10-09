"use client";
import { useState, useCallback, Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import type { CardType } from "@eflab/shared";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  SlidersHorizontal,
  ChevronDown,
  Check,
} from "lucide-react";

const POSITIONS = [
  "GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF"
];

const PLAYING_STYLES: Array<{ id: number; label: string }> = [
  { id: 1, label: "Goal Poacher" },
  { id: 2, label: "Dummy Runner" },
  { id: 3, label: "Fox in the Box" },
  { id: 4, label: "Target Man" },
  { id: 5, label: "Creative Playmaker" },
  { id: 6, label: "Prolific Winger" },
  { id: 7, label: "Roaming Flank" },
  { id: 8, label: "Cross Specialist" },
  { id: 9, label: "Classic No. 10" },
  { id: 10, label: "Hole Player" },
  { id: 11, label: "Box-to-Box" },
  { id: 12, label: "Anchor Man" },
  { id: 13, label: "The Destroyer" },
  { id: 14, label: "Orchestrator" },
  { id: 15, label: "Build Up" },
  { id: 16, label: "Extra Frontman" },
  { id: 17, label: "Offensive Fullback" },
  { id: 18, label: "Defensive Fullback" },
  { id: 19, label: "Offensive Goalkeeper" },
  { id: 20, label: "Defensive Goalkeeper" },
  { id: 21, label: "Deep-Lying Forward" },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ovr", label: "OVR Rating" },
  { value: "maxOvr", label: "Max OVR" },
  { value: "age", label: "Age" },
  { value: "height", label: "Height" },
  { value: "speed", label: "Speed" },
  { value: "acceleration", label: "Acceleration" },
  { value: "finishing", label: "Finishing" },
  { value: "dribbling", label: "Dribbling" },
  { value: "stamina", label: "Stamina" },
];

const POPULAR_COUNTRIES = [
  { id: 1, name: "Argentina" },
  { id: 2, name: "Brazil" },
  { id: 3, name: "France" },
  { id: 4, name: "England" },
  { id: 5, name: "Spain" },
  { id: 6, name: "Germany" },
  { id: 7, name: "Italy" },
  { id: 8, name: "Portugal" },
  { id: 9, name: "Netherlands" },
  { id: 10, name: "Japan" },
];

function PlayersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQ = searchParams.get("q") ?? "";
  const initialType = (searchParams.get("cardType") as CardType) ?? "";

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("maxOvr");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [q, setQ] = useState(initialQ);
  const [cardType, setCardType] = useState<CardType | "">(initialType);
  const [position, setPosition] = useState<string>("");
  const [playingStyle, setPlayingStyle] = useState<string>("");
  const [nationalityId, setNationalityId] = useState<number | undefined>();
  const [ovrMin, setOvrMin] = useState<number | undefined>();
  const [weakFoot, setWeakFoot] = useState<"" | "0" | "1" | "2" | "3">("");

  // Default scope: chỉ special cards CÓ artwork (Epic/Big_Time/Show_Time) — match efootbase
  // /players top 12 chỉ có 3 loại này (8 Big_Time + 3 Epic + 1 Show_Time, 0 HIGHLIGHT).
  // HIGHLIGHT có maxOvr boosted 104-105 (cao nhất) nhưng không có frame/bg trên R2 → render
  // gradient trần — sort maxOvr DESC sẽ đẩy HIGHLIGHT lên top, che mất card đẹp. Bỏ HIGHLIGHT
  // khỏi scope default để /players luôn showcase card có artwork 4-layer như efootbase.
  // Khi user chọn 1 cardType cụ thể thì scope này bị override (xem cardTypeIn bên dưới).
  // TODO: khi thêm UI filter cardType, HIGHLIGHT có thể expose qua 1 option riêng.
  const SPECIAL_CARD_TYPES: CardType[] = ["EPIC", "BIG_TIME", "SHOW_TIME"];

  // Active popover tracker: null | "position" | "style" | "foot" | "ovr" | "country" | "sort"
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (initialQ) setQ(initialQ);
    if (initialType) setCardType(initialType);
  }, [initialQ, initialType]);

  const q_ = trpc.player.list.useQuery({
    page,
    limit: 24, // efootbase uses 24 cards per page
    sort,
    order,
    q: q || undefined,
    cardType: cardType || undefined,
    cardTypeIn: cardType ? undefined : SPECIAL_CARD_TYPES,
    position: (position as never) || undefined,
    playingStyle: playingStyle ? Number(playingStyle) : undefined,
    nationalityId,
    ovrMin,
    weakFoot: weakFoot || undefined,
  });

  const onSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setPage(1);
      setActivePopover(null);
      q_.refetch();
    },
    [q_]
  );

  const players = q_.data?.items ?? [];
  const totalPages = q_.data?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      {/* Breadcrumbs matching efootbase */}
      <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 list-none p-0 m-0">
        <li className="breadcrumbs__item">
          <Link className="breadcrumbs__link text-xs" href="/">
            Home
          </Link>
          <span className="breadcrumbs__separator text-xs">›</span>
        </li>
        <li className="breadcrumbs__item text-white text-xs font-medium">Players</li>
      </ol>

      {/* Hero Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold sm:text-4xl tracking-tight text-white">Players</h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
          Browse and search the eFootball player database.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="relative" ref={popoverRef}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Field */}
          <form onSubmit={onSearch} className="relative w-48 sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search players"
              className="w-full h-8 pl-8 pr-7 rounded-lg bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-white placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-line-active)] transition-colors"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </form>

          {/* Position Filter Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "position" ? null : "position"))}
              data-active={Boolean(position)}
              className="button button--sm button--secondary efb-filter-trigger"
            >
              <span className="text-[var(--color-text-dim)]">⊞</span>
              <span>{position || "Position"}</span>
              <ChevronDown className="size-3 text-[var(--color-text-dim)]" />
            </button>

            {activePopover === "position" && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-56 p-2 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-line)] text-xs font-semibold text-white">
                  <span>Select Position</span>
                  {position && (
                    <button
                      type="button"
                      onClick={() => {
                        setPosition("");
                        setPage(1);
                      }}
                      className="text-[10px] text-[var(--color-accent)] hover:underline"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPosition(position === p ? "" : p);
                        setPage(1);
                        setActivePopover(null);
                      }}
                      className={`h-7 rounded-md text-xs font-bold transition-colors ${
                        position === p
                          ? "bg-[var(--color-accent)] text-black"
                          : "bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-elevated)]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Playing Style Filter Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "style" ? null : "style"))}
              data-active={Boolean(playingStyle)}
              className="button button--sm button--secondary efb-filter-trigger"
            >
              <span className="text-[var(--color-text-dim)]">⚡</span>
              <span>
                {playingStyle
                  ? PLAYING_STYLES.find((s) => String(s.id) === playingStyle)?.label
                  : "Playing Style"}
              </span>
              <ChevronDown className="size-3 text-[var(--color-text-dim)]" />
            </button>

            {activePopover === "style" && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-64 max-h-72 overflow-y-auto p-1.5 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setPlayingStyle("");
                    setPage(1);
                    setActivePopover(null);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white text-left"
                >
                  <span>All Styles</span>
                  {!playingStyle && <Check className="size-3 text-[var(--color-accent)]" />}
                </button>
                {PLAYING_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setPlayingStyle(String(s.id));
                      setPage(1);
                      setActivePopover(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      playingStyle === String(s.id)
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white"
                    }`}
                  >
                    <span>{s.label}</span>
                    {playingStyle === String(s.id) && <Check className="size-3 text-[var(--color-accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Strong Foot Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "foot" ? null : "foot"))}
              data-active={Boolean(weakFoot)}
              className="button button--sm button--secondary efb-filter-trigger"
            >
              <span className="text-[var(--color-text-dim)]">⇄</span>
              <span>{weakFoot ? `Weak Foot ≥ ${weakFoot}` : "Strong Foot"}</span>
              <ChevronDown className="size-3 text-[var(--color-text-dim)]" />
            </button>

            {activePopover === "foot" && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-48 p-1.5 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl space-y-0.5">
                {[
                  { val: "", label: "Any Foot" },
                  { val: "1", label: "Weak Foot ≥ 1" },
                  { val: "2", label: "Weak Foot ≥ 2" },
                  { val: "3", label: "Weak Foot = 3 (Both)" },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => {
                      setWeakFoot(item.val as "" | "1" | "2" | "3");
                      setPage(1);
                      setActivePopover(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left ${
                      weakFoot === item.val
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    {weakFoot === item.val && <Check className="size-3 text-[var(--color-accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Max OVR Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "ovr" ? null : "ovr"))}
              data-active={Boolean(ovrMin)}
              className="button button--sm button--secondary efb-filter-trigger"
            >
              <span className="text-[var(--color-text-dim)]">📈</span>
              <span>{ovrMin ? `${ovrMin}+ OVR` : "Max OVR"}</span>
              <ChevronDown className="size-3 text-[var(--color-text-dim)]" />
            </button>

            {activePopover === "ovr" && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-44 p-1.5 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl space-y-0.5">
                {[
                  { val: undefined, label: "Any Rating" },
                  { val: 95, label: "95+ OVR" },
                  { val: 90, label: "90+ OVR" },
                  { val: 85, label: "85+ OVR" },
                  { val: 80, label: "80+ OVR" },
                  { val: 75, label: "75+ OVR" },
                ].map((item) => (
                  <button
                    key={String(item.val)}
                    type="button"
                    onClick={() => {
                      setOvrMin(item.val);
                      setPage(1);
                      setActivePopover(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left ${
                      ovrMin === item.val
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    {ovrMin === item.val && <Check className="size-3 text-[var(--color-accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Nationality Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "country" ? null : "country"))}
              data-active={Boolean(nationalityId)}
              className="button button--sm button--secondary efb-filter-trigger"
            >
              <span className="text-[var(--color-text-dim)]">🌍</span>
              <span>
                {nationalityId
                  ? POPULAR_COUNTRIES.find((c) => c.id === nationalityId)?.name ?? `ID #${nationalityId}`
                  : "Nationality"}
              </span>
              <ChevronDown className="size-3 text-[var(--color-text-dim)]" />
            </button>

            {activePopover === "country" && (
              <div className="absolute left-0 top-full mt-1.5 z-50 w-52 max-h-64 overflow-y-auto p-1.5 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setNationalityId(undefined);
                    setPage(1);
                    setActivePopover(null);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white text-left"
                >
                  <span>All Nations</span>
                  {!nationalityId && <Check className="size-3 text-[var(--color-accent)]" />}
                </button>
                {POPULAR_COUNTRIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setNationalityId(c.id);
                      setPage(1);
                      setActivePopover(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left ${
                      nationalityId === c.id
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white"
                    }`}
                  >
                    <span>{c.name}</span>
                    {nationalityId === c.id && <Check className="size-3 text-[var(--color-accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "sort" ? null : "sort"))}
              className="button button--sm button--secondary efb-filter-trigger"
            >
              <span className="text-[var(--color-text-dim)]">⇅</span>
              <span>{SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Sort"}</span>
              <ChevronDown className="size-3 text-[var(--color-text-dim)]" />
            </button>

            {activePopover === "sort" && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-48 p-1.5 rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl space-y-0.5">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setSort(o.value);
                      setPage(1);
                      setActivePopover(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left ${
                      sort === o.value
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white"
                    }`}
                  >
                    <span>{o.label}</span>
                    {sort === o.value && <Check className="size-3 text-[var(--color-accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Result Counter (efootbase format: 24 players · page 1 of X) */}
          <span className="ml-auto text-xs text-[var(--color-text-secondary)] tabular-nums">
            {q_.data?.total ?? 0} cards
          </span>
        </div>
      </div>

      {/* Sub-counter */}
      <p className="text-muted text-xs tabular-nums text-[var(--color-text-secondary)]">
        {players.length} players · page {page} of {totalPages}
      </p>

      {/* 8-Column Card Grid (efootbase layout: grid-cols-4 sm:5 md:6 lg:7 xl:8) */}
      {q_.isLoading ? (
        <div className="grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
          {[...Array(24)].map((_, i) => (
            <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-[var(--color-text-dim)]">
          No players match your search and filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
          {players.map((p) => (
            <PlayerCard key={p.id} player={p} showName />
          ))}
        </div>
      )}

      {/* Pagination (efootbase styled pill pagination) */}
      <div className="flex items-center justify-between pt-6 border-t border-[var(--color-line)] text-xs text-[var(--color-text-secondary)]">
        <span className="tabular-nums">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="button button--sm button--secondary disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5 mr-1" />
            Previous
          </button>

          {/* Page numbers: current ± 1 */}
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const pageNum = i + 1;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => setPage(pageNum)}
                className={`size-8 rounded-lg text-xs font-bold transition-colors ${
                  page === pageNum
                    ? "bg-[var(--color-accent)] text-black"
                    : "bg-[var(--color-panel)] text-[var(--color-text-secondary)] hover:bg-[var(--color-elevated)] hover:text-white"
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="button button--sm button--secondary disabled:opacity-40"
          >
            Next
            <ChevronRight className="size-3.5 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlayersPage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
          {[...Array(24)].map((_, i) => (
            <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
          ))}
        </div>
      }
    >
      <PlayersContent />
    </Suspense>
  );
}
