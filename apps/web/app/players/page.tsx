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
  ChevronDown,
  Check,
  LayoutGrid,
  Zap,
  ArrowLeftRight,
  TrendingUp,
  Globe,
  ArrowUpDown,
  RotateCcw,
} from "lucide-react";

const POSITIONS = [
  "GK", "CB", "LB", "RB", "DMF", "CMF", "LMF", "RMF", "AMF", "LWF", "RWF", "SS", "CF"
];

const ATTACK_STYLES = [
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
  { id: 21, label: "Deep-Lying Forward" },
];

const DEFENCE_STYLES = [
  { id: 12, label: "Anchor Man" },
  { id: 13, label: "The Destroyer" },
  { id: 14, label: "Orchestrator" },
  { id: 15, label: "Build Up" },
  { id: 16, label: "Extra Frontman" },
  { id: 17, label: "Offensive Fullback" },
  { id: 18, label: "Defensive Fullback" },
  { id: 19, label: "Offensive Goalkeeper" },
  { id: 20, label: "Defensive Goalkeeper" },
];

const ALL_PLAYING_STYLES = [...ATTACK_STYLES, ...DEFENCE_STYLES];

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
  const [nationSearch, setNationSearch] = useState("");
  const [maxOvrMin, setMaxOvrMin] = useState<number | undefined>();
  const [maxOvrMax, setMaxOvrMax] = useState<number | undefined>();
  const [strongerFoot, setStrongerFoot] = useState<"" | 0 | 1>("");

  const countriesQuery = trpc.player.countries.useQuery();
  const allCountries = countriesQuery.data ?? POPULAR_COUNTRIES;
  const filteredCountries = allCountries.filter((c) =>
    c.name.toLowerCase().includes(nationSearch.toLowerCase().trim())
  );

  // Default scope: chỉ special cards CÓ artwork (Epic/Big_Time/Show_Time) — match efootbase
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
    maxOvrMin,
    maxOvrMax,
    strongerFoot: strongerFoot !== "" ? strongerFoot : undefined,
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

  const hasActiveFilters = Boolean(
    q || position || playingStyle || strongerFoot !== "" || maxOvrMin || maxOvrMax || nationalityId || cardType
  );

  const resetAllFilters = useCallback(() => {
    setQ("");
    setPosition("");
    setPlayingStyle("");
    setStrongerFoot("");
    setMaxOvrMin(undefined);
    setMaxOvrMax(undefined);
    setNationalityId(undefined);
    setNationSearch("");
    setCardType("");
    setPage(1);
    setActivePopover(null);
  }, []);

  const filterBtnClass = (active: boolean) =>
    `h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
      active
        ? "bg-[var(--color-elevated)] border-[var(--color-accent)] text-white shadow-sm"
        : "bg-white/[0.06] border-white/10 text-white/90 hover:bg-white/[0.1] hover:text-white"
    }`;
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/40 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search players"
              className="w-full h-8 pl-8 pr-7 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer"
                aria-label="Clear search"
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
              className={filterBtnClass(Boolean(position))}
            >
              <LayoutGrid className={`size-3.5 ${position ? "text-[var(--color-accent)]" : "text-white/70"}`} />
              <span>{position || "Position"}</span>
            </button>

            {activePopover === "position" && (
              <div className="absolute left-0 top-full mt-2 z-50 p-2.5 rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl">
                <div className="grid grid-cols-4 gap-1.5 w-52">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPosition(position === p ? "" : p);
                        setPage(1);
                        setActivePopover(null);
                      }}
                      className={`h-7 px-3 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                        position === p
                          ? "bg-[var(--color-accent)] text-black font-bold shadow-sm"
                          : "bg-white/[0.08] hover:bg-white/[0.16] text-white/90"
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
              className={filterBtnClass(Boolean(playingStyle))}
            >
              <Zap className={`size-3.5 ${playingStyle ? "text-[var(--color-accent)]" : "text-white/70"}`} />
              <span className="truncate max-w-[130px]">
                {playingStyle
                  ? ALL_PLAYING_STYLES.find((s) => String(s.id) === playingStyle)?.label
                  : "Playing Style"}
              </span>
            </button>

            {activePopover === "style" && (
              <div className="absolute left-0 top-full mt-2 z-50 p-3 rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl w-[calc(100vw-32px)] sm:w-[480px]">
                {/* Header with title and Reset */}
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-white/10 text-xs font-semibold text-white">
                  <span>Playing Style</span>
                  {playingStyle && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlayingStyle("");
                        setPage(1);
                        setActivePopover(null);
                      }}
                      className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* 2 Parallel Columns */}
                <div className="grid grid-cols-2 gap-3.5 max-h-[360px] overflow-y-auto pr-1">
                  {/* Left Column: ATTACK */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-400 border-b border-white/5 pb-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/playstyle_attack.svg" alt="" className="size-3.5" />
                      <span>ATTACK ({ATTACK_STYLES.length})</span>
                    </div>
                    <div className="space-y-1">
                      {ATTACK_STYLES.map((s) => {
                        const isSelected = playingStyle === String(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setPlayingStyle(isSelected ? "" : String(s.id));
                              setPage(1);
                              setActivePopover(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer truncate ${
                              isSelected
                                ? "bg-[var(--color-accent)] text-black font-bold shadow-sm"
                                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/90"
                            }`}
                            title={s.label}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: DEFENCE */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-400 border-b border-white/5 pb-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/icons/playstyle_defence.svg" alt="" className="size-3.5" />
                      <span>DEFENCE ({DEFENCE_STYLES.length})</span>
                    </div>
                    <div className="space-y-1">
                      {DEFENCE_STYLES.map((s) => {
                        const isSelected = playingStyle === String(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setPlayingStyle(isSelected ? "" : String(s.id));
                              setPage(1);
                              setActivePopover(null);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer truncate ${
                              isSelected
                                ? "bg-[var(--color-accent)] text-black font-bold shadow-sm"
                                : "bg-white/[0.06] hover:bg-white/[0.12] text-white/90"
                            }`}
                            title={s.label}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Strong Foot Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "foot" ? null : "foot"))}
              data-active={strongerFoot !== ""}
              className={filterBtnClass(strongerFoot !== "")}
            >
              <ArrowLeftRight className={`size-3.5 ${strongerFoot !== "" ? "text-[var(--color-accent)]" : "text-white/70"}`} />
              <span>{strongerFoot === 0 ? "Right Foot" : strongerFoot === 1 ? "Left Foot" : "Strong Foot"}</span>
            </button>

            {activePopover === "foot" && (
              <div className="absolute left-0 top-full mt-2 z-50 p-1.5 rounded-full bg-[#18181b] border border-white/10 shadow-2xl flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setStrongerFoot("");
                    setPage(1);
                    setActivePopover(null);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    strongerFoot === ""
                      ? "bg-[var(--color-accent)] text-black font-bold"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStrongerFoot(0);
                    setPage(1);
                    setActivePopover(null);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    strongerFoot === 0
                      ? "bg-[var(--color-accent)] text-black font-bold"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  Right
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStrongerFoot(1);
                    setPage(1);
                    setActivePopover(null);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    strongerFoot === 1
                      ? "bg-[var(--color-accent)] text-black font-bold"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  Left
                </button>
              </div>
            )}
          </div>

          {/* Max OVR Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "ovr" ? null : "ovr"))}
              data-active={Boolean(maxOvrMin || maxOvrMax)}
              className={filterBtnClass(Boolean(maxOvrMin || maxOvrMax))}
            >
              <TrendingUp className={`size-3.5 ${maxOvrMin || maxOvrMax ? "text-[var(--color-accent)]" : "text-white/70"}`} />
              <span>
                {maxOvrMin && maxOvrMax
                  ? `${maxOvrMin}-${maxOvrMax} OVR`
                  : maxOvrMin
                  ? `≥${maxOvrMin} OVR`
                  : maxOvrMax
                  ? `≤${maxOvrMax} OVR`
                  : "Max OVR"}
              </span>
            </button>

            {activePopover === "ovr" && (
              <div className="absolute left-0 top-full mt-2 z-50 p-2.5 rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  min={40}
                  max={110}
                  value={maxOvrMin ?? ""}
                  onChange={(e) => {
                    setMaxOvrMin(e.target.value ? Number(e.target.value) : undefined);
                    setPage(1);
                  }}
                  className="h-8 w-20 px-2.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white placeholder-white/40 text-center focus:outline-none focus:border-[var(--color-accent)] font-mono"
                />
                <input
                  type="number"
                  placeholder="Max"
                  min={40}
                  max={110}
                  value={maxOvrMax ?? ""}
                  onChange={(e) => {
                    setMaxOvrMax(e.target.value ? Number(e.target.value) : undefined);
                    setPage(1);
                  }}
                  className="h-8 w-20 px-2.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white placeholder-white/40 text-center focus:outline-none focus:border-[var(--color-accent)] font-mono"
                />
              </div>
            )}
          </div>

          {/* Nationality Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "country" ? null : "country"))}
              data-active={Boolean(nationalityId)}
              className={filterBtnClass(Boolean(nationalityId))}
            >
              <Globe className={`size-3.5 ${nationalityId ? "text-[var(--color-accent)]" : "text-white/70"}`} />
              <span className="truncate max-w-[120px]">
                {nationalityId
                  ? allCountries.find((c) => c.id === nationalityId)?.name ?? `ID #${nationalityId}`
                  : "Nationality"}
              </span>
            </button>

            {activePopover === "country" && (
              <div className="absolute left-0 top-full mt-2 z-50 p-3 rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl w-56">
                <div className="text-xs font-semibold text-white/90 mb-1.5">Nationality</div>
                <input
                  type="text"
                  value={nationSearch}
                  onChange={(e) => setNationSearch(e.target.value)}
                  placeholder="e.g. Argentina*"
                  className="h-8 w-full px-3 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] mb-2"
                  autoFocus
                />
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                  {nationalityId && (
                    <button
                      type="button"
                      onClick={() => {
                        setNationalityId(undefined);
                        setPage(1);
                        setActivePopover(null);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-white/60 hover:bg-white/[0.08] hover:text-white cursor-pointer"
                    >
                      <span>All Nations</span>
                    </button>
                  )}
                  {filteredCountries.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setNationalityId(c.id);
                        setPage(1);
                        setActivePopover(null);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        nationalityId === c.id
                          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                          : "text-white/80 hover:bg-white/[0.08] hover:text-white"
                      }`}
                    >
                      <span>{c.name}</span>
                      {nationalityId === c.id && <Check className="size-3.5 text-[var(--color-accent)]" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sort Filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActivePopover((v) => (v === "sort" ? null : "sort"))}
              className={filterBtnClass(false)}
            >
              <ArrowUpDown className="size-3.5 text-white/70" />
              <span>{SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Sort"}</span>
            </button>

            {activePopover === "sort" && (
              <div className="absolute right-0 top-full mt-2 z-50 p-3 rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl w-56">
                <div className="text-xs font-semibold text-white/90 mb-1.5">Sort by</div>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 w-full px-2.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white focus:outline-none focus:border-[var(--color-accent)] cursor-pointer mb-2.5"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} className="bg-[#18181b] text-white">
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/[0.04] border border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setOrder("desc");
                      setPage(1);
                    }}
                    className={`flex-1 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      order === "desc"
                        ? "bg-[var(--color-accent)] text-black font-bold"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    High to low
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOrder("asc");
                      setPage(1);
                    }}
                    className={`flex-1 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      order === "asc"
                        ? "bg-[var(--color-accent)] text-black font-bold"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    Low to high
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reset All Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="h-8 inline-flex items-center gap-1 px-3 rounded-full text-xs font-medium text-white/60 hover:text-[var(--color-accent-danger)] hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="size-3" />
              <span>Reset</span>
            </button>
          )}

          {/* Result Counter (efootbase format: 24 players · page 1 of X) */}
          <span className="ml-auto text-xs text-[var(--color-text-secondary)] font-mono tabular-nums shrink-0">
            {(q_.data?.total ?? 0).toLocaleString()} cards
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
