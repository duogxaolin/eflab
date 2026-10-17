"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { Pagination } from "@/components/players/Pagination";
import { QueryErrorState, CardGridSkeleton } from "@/lib/query-state";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  CARD_TYPES,
  CARD_TYPE_LABELS,
  PLAYING_STYLES,
  POSITIONS,
  SORT_FIELDS,
  type CardType,
  type Position,
  type SortField,
} from "@eflab/shared";
import {
  Search,
  X,
  Check,
  LayoutGrid,
  Layers,
  Zap,
  ArrowLeftRight,
  TrendingUp,
  Globe,
  ArrowUpDown,
  RotateCcw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Playing styles (catalog-browsing-parity "Filters Use the Correct Identifiers")
// Ids are the efootbase `playing_style` codes shared by PLAYING_STYLES. Which
// ids can appear in each column was read from the live database on 2026-10-17
// (`SELECT "playingStyleAttack", count(*) … GROUP BY 1`, same for Defense):
//   attack  → 1–22 and 35 (High Line GK, 3 cards)
//   defence → 7, 8, 9, 16, 17, 24–30, 33
// A style listed under ATTACK sends `playingStyle` (Player.playingStyleAttack),
// one listed under DEFENCE sends `defensiveStyle` (Player.playingStyleDefense),
// so "Anchor Man" under Defence only returns cards whose *defensive* style is
// Anchor Man, and "Target Man" (22) never returns a Prolific Winger (4).
const ATTACK_STYLE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 35] as const;
const DEFENCE_STYLE_IDS = [7, 8, 9, 16, 17, 24, 25, 26, 27, 28, 29, 30, 33] as const;
const styleOption = (id: number) => ({ id, label: PLAYING_STYLES[id] ?? `Style #${id}` });
const ATTACK_STYLES = ATTACK_STYLE_IDS.map(styleOption);
const DEFENCE_STYLES = DEFENCE_STYLE_IDS.map(styleOption);

// Card-type scope (design decision 8). efootbase's /players default view is the
// special-art cards — its first page is 23 Epic + 1 Highlight sorted by max OVR
// (tmp/efootbase-ref/dom-efootbase-players.html, card_type 5/6) — so the no-query
// default is EPIC + HIGHLIGHT. A text search defaults to All so the result never
// silently drops a Trending/Standard card the search dropdown showed.
const DEFAULT_SCOPE: readonly CardType[] = ["EPIC", "HIGHLIGHT"];
const ALL_TYPES = "all";

const SORT_OPTIONS: ReadonlyArray<{ value: SortField; label: string }> = [
  { value: "maxOvr", label: "Max OVR" },
  { value: "ovr", label: "Base OVR" },
  { value: "releaseDate", label: "Release date" },
  { value: "name", label: "Name" },
  { value: "age", label: "Age" },
  { value: "height", label: "Height" },
  { value: "weight", label: "Weight" },
  { value: "playerValue", label: "Player value" },
  { value: "speed", label: "Speed" },
  { value: "acceleration", label: "Acceleration" },
  { value: "finishing", label: "Finishing" },
  { value: "dribbling", label: "Dribbling" },
  { value: "lowPass", label: "Low pass" },
  { value: "physicalContact", label: "Physical contact" },
  { value: "stamina", label: "Stamina" },
  { value: "defensiveAwareness", label: "Defensive awareness" },
];

const PAGE_SIZE = 24; // efootbase uses 24 cards per page

// ---------------------------------------------------------------------------
// URL ⇄ state (design decision 8: the URL is the single source of state).
interface PlayersState {
  q: string;
  /** `null` = All types; otherwise the selected card types. */
  types: CardType[] | null;
  /** True when `type` is spelled out in the URL (the user chose a scope);
   *  false when `types` is only the inferred default, which follows `q`. */
  typeExplicit: boolean;
  pos: Position | "";
  style: number | undefined;
  dstyle: number | undefined;
  nat: number | undefined;
  foot: 0 | 1 | undefined;
  ovrMin: number | undefined;
  maxOvrMin: number | undefined;
  maxOvrMax: number | undefined;
  sort: SortField;
  order: "asc" | "desc";
  page: number;
}

const isCardType = (s: string): s is CardType => (CARD_TYPES as readonly string[]).includes(s);
const isPosition = (s: string): s is Position => (POSITIONS as readonly string[]).includes(s);
const isSortField = (s: string): s is SortField => (SORT_FIELDS as readonly string[]).includes(s);

function intParam(v: string | null, min: number, max: number): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

function readState(sp: URLSearchParams): PlayersState {
  const q = (sp.get("q") ?? "").trim();
  const typeRaw = sp.get("type");
  let types: CardType[] | null;
  let typeExplicit = true;
  if (typeRaw === null) {
    types = inferredScope(q);
    typeExplicit = false;
  } else if (typeRaw === ALL_TYPES || typeRaw === "") {
    types = null;
  } else {
    const picked = typeRaw.split(",").filter(isCardType);
    types = picked.length > 0 && picked.length < CARD_TYPES.length ? picked : null;
  }
  const posRaw = sp.get("pos") ?? "";
  const footRaw = sp.get("foot");
  const sortRaw = sp.get("sort") ?? "";
  return {
    q,
    types,
    typeExplicit,
    pos: isPosition(posRaw) ? posRaw : "",
    style: intParam(sp.get("style"), 1, 99),
    dstyle: intParam(sp.get("dstyle"), 1, 99),
    nat: intParam(sp.get("nat"), 1, 2_147_483_647),
    foot: footRaw === "0" ? 0 : footRaw === "1" ? 1 : undefined,
    ovrMin: intParam(sp.get("ovrMin"), 1, 100),
    maxOvrMin: intParam(sp.get("maxOvrMin"), 1, 120),
    maxOvrMax: intParam(sp.get("maxOvrMax"), 1, 120),
    sort: isSortField(sortRaw) ? sortRaw : "maxOvr",
    order: sp.get("order") === "asc" ? "asc" : "desc",
    page: intParam(sp.get("page"), 1, 10_000) ?? 1,
  };
}

/** Scope used when the URL has no `type`: the special-art default without a
 *  query, All once the user searches by name. */
const inferredScope = (q: string): CardType[] | null => (q ? null : [...DEFAULT_SCOPE]);

function writeState(s: PlayersState): string {
  const sp = new URLSearchParams();
  if (s.q) sp.set("q", s.q);
  // `type` is written only when the user chose a scope, so the default view
  // keeps a clean /players URL and an inferred scope keeps following `q`.
  if (s.typeExplicit) sp.set("type", s.types === null ? ALL_TYPES : s.types.join(","));
  if (s.pos) sp.set("pos", s.pos);
  if (s.style !== undefined) sp.set("style", String(s.style));
  if (s.dstyle !== undefined) sp.set("dstyle", String(s.dstyle));
  if (s.nat !== undefined) sp.set("nat", String(s.nat));
  if (s.foot !== undefined) sp.set("foot", String(s.foot));
  if (s.ovrMin !== undefined) sp.set("ovrMin", String(s.ovrMin));
  if (s.maxOvrMin !== undefined) sp.set("maxOvrMin", String(s.maxOvrMin));
  if (s.maxOvrMax !== undefined) sp.set("maxOvrMax", String(s.maxOvrMax));
  if (s.sort !== "maxOvr") sp.set("sort", s.sort);
  if (s.order !== "desc") sp.set("order", s.order);
  if (s.page > 1) sp.set("page", String(s.page));
  return sp.toString();
}

// ---------------------------------------------------------------------------
// Filter popover: trigger with aria-expanded/aria-controls, Escape closes and
// returns focus to the trigger, outside click closes (site-quality-baseline
// "Keyboard and Screen-Reader Access").
function FilterPopover({
  id,
  open,
  onOpenChange,
  active,
  icon,
  label,
  align = "left",
  panelClassName = "",
  children,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: boolean;
  icon: ReactNode;
  label: ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Return focus to the trigger whenever the popover closes after being open.
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
        data-active={active}
        className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-full text-xs font-medium border transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
          active
            ? "bg-[var(--color-elevated)] border-[var(--color-accent)] text-white shadow-sm"
            : "bg-white/[0.06] border-white/10 text-white/90 hover:bg-white/[0.1] hover:text-white"
        }`}
      >
        <span className={active ? "text-[var(--color-accent)]" : "text-white/70"} aria-hidden>
          {icon}
        </span>
        {label}
      </button>
      {open && (
        <div
          id={`${id}-panel`}
          role="dialog"
          aria-labelledby={`${id}-trigger`}
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-2 z-50 rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl max-w-[calc(100vw-32px)] ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

const pill = (selected: boolean) =>
  `rounded-full text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
    selected ? "bg-[var(--color-accent)] text-black font-bold shadow-sm" : "bg-white/[0.06] hover:bg-white/[0.12] text-white/90"
  }`;

const numberInput =
  "h-8 w-20 px-2.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white placeholder-white/40 text-center focus:outline-none focus:border-[var(--color-accent)] font-mono";

// ---------------------------------------------------------------------------
export function PlayersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useMemo(() => readState(new URLSearchParams(searchParams.toString())), [searchParams]);

  // Replace the URL with a patched state. Any change other than the page
  // itself resets to page 1 (catalog-browsing-parity "Page State Lives in the URL").
  const update = useCallback(
    (patch: Partial<PlayersState>) => {
      const pageOnly = Object.keys(patch).every((k) => k === "page");
      const next: PlayersState = { ...state, ...patch, page: pageOnly ? (patch.page ?? 1) : 1 };
      // Choosing a scope pins it; otherwise the inferred scope follows the query
      // (typing a name from the default view searches all card types).
      if ("types" in patch) next.typeExplicit = true;
      else if (!next.typeExplicit) next.types = inferredScope(next.q);
      const qs = writeState(next);
      router.replace((qs ? `/players?${qs}` : "/players") as Route, { scroll: false });
    },
    [router, state],
  );

  // Search box: local text mirrors the URL and is debounced into it.
  const [qInput, setQInput] = useState(state.q);
  const debouncedQ = useDebouncedValue(qInput.trim(), 250);
  useEffect(() => {
    setQInput(state.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.q]);
  useEffect(() => {
    if (debouncedQ !== state.q) update({ q: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const [activePopover, setActivePopover] = useState<string | null>(null);
  const popoverProps = (id: string) => ({
    id,
    open: activePopover === id,
    onOpenChange: (open: boolean) => setActivePopover(open ? id : null),
  });

  const countriesQuery = trpc.player.countries.useQuery(undefined, { staleTime: 60 * 60_000 });
  const [nationSearch, setNationSearch] = useState("");
  const countries = countriesQuery.data ?? [];
  const filteredCountries = countries.filter((c) => c.name.toLowerCase().includes(nationSearch.toLowerCase().trim()));
  const nationLabel =
    state.nat === undefined
      ? "Nationality"
      : countries.find((c) => c.id === state.nat)?.name ?? `Nation #${state.nat}`;

  const listQuery = trpc.player.list.useQuery(
    {
      page: state.page,
      limit: PAGE_SIZE,
      sort: state.sort,
      order: state.order,
      q: state.q || undefined,
      cardTypeIn: state.types ?? undefined,
      position: state.pos || undefined,
      playingStyle: state.style,
      defensiveStyle: state.dstyle,
      nationalityId: state.nat,
      strongerFoot: state.foot,
      ovrMin: state.ovrMin,
      maxOvrMin: state.maxOvrMin,
      maxOvrMax: state.maxOvrMax,
    },
    { placeholderData: (prev) => prev },
  );

  const players = listQuery.data?.items ?? [];
  const totalPages = listQuery.data?.totalPages ?? 1;
  const total = listQuery.data?.total ?? 0;

  // Scroll back to the top of the grid when the page changes (not on first render).
  const gridTopRef = useRef<HTMLDivElement>(null);
  const lastPage = useRef(state.page);
  useEffect(() => {
    if (lastPage.current !== state.page) {
      lastPage.current = state.page;
      const top = gridTopRef.current?.getBoundingClientRect().top ?? 0;
      window.scrollTo({ top: Math.max(0, window.scrollY + top - 96), behavior: "smooth" });
    }
  }, [state.page]);

  const hasActiveFilters = Boolean(
    state.q ||
      state.pos ||
      state.style !== undefined ||
      state.dstyle !== undefined ||
      state.foot !== undefined ||
      state.ovrMin !== undefined ||
      state.maxOvrMin !== undefined ||
      state.maxOvrMax !== undefined ||
      state.nat !== undefined ||
      state.sort !== "maxOvr" ||
      state.order !== "desc",
  );

  const resetAll = () => {
    setQInput("");
    setNationSearch("");
    setActivePopover(null);
    router.replace("/players", { scroll: false });
  };

  // Scope chip label — labels always come from CARD_TYPE_LABELS, never the enum.
  const scopeLabel =
    state.types === null
      ? "All card types"
      : state.types.length <= 2
        ? state.types.map((t) => CARD_TYPE_LABELS[t]).join(" & ")
        : `${state.types.length} card types`;
  const scopeIsDefault = !state.typeExplicit && state.types !== null;
  const toggleType = (t: CardType) => {
    const current = state.types ?? [...CARD_TYPES];
    const next = current.includes(t) ? current.filter((x) => x !== t) : [...current, t];
    update({ types: next.length === 0 || next.length === CARD_TYPES.length ? null : CARD_TYPES.filter((x) => next.includes(x)) });
    setActivePopover(null);
  };

  const styleLabel =
    state.style !== undefined || state.dstyle !== undefined
      ? [state.style !== undefined ? PLAYING_STYLES[state.style] : null, state.dstyle !== undefined ? PLAYING_STYLES[state.dstyle] : null]
          .filter(Boolean)
          .join(" · ")
      : "Playing Style";

  const ovrLabel = (() => {
    const parts: string[] = [];
    if (state.ovrMin !== undefined) parts.push(`≥${state.ovrMin} OVR`);
    if (state.maxOvrMin !== undefined && state.maxOvrMax !== undefined) parts.push(`Max ${state.maxOvrMin}–${state.maxOvrMax}`);
    else if (state.maxOvrMin !== undefined) parts.push(`Max ≥${state.maxOvrMin}`);
    else if (state.maxOvrMax !== undefined) parts.push(`Max ≤${state.maxOvrMax}`);
    return parts.length ? parts.join(" · ") : "OVR";
  })();
  const ovrActive = state.ovrMin !== undefined || state.maxOvrMin !== undefined || state.maxOvrMax !== undefined;

  const numberChange = (key: "ovrMin" | "maxOvrMin" | "maxOvrMax", max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === "") return update({ [key]: undefined });
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= max) update({ [key]: n });
  };

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
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Field */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setActivePopover(null);
            if (qInput.trim() !== state.q) update({ q: qInput.trim() });
          }}
          className="relative w-48 sm:w-60"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/40 pointer-events-none" aria-hidden />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search players"
            aria-label="Search players by name"
            className="w-full h-8 pl-8 pr-7 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          {qInput && (
            <button
              type="button"
              onClick={() => {
                setQInput("");
                update({ q: "" });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </form>

        {/* Card-type scope — always visible, with an "All" option (design decision 8). */}
        <FilterPopover
          {...popoverProps("types")}
          active={state.types !== null}
          icon={<Layers className="size-3.5" />}
          label={<span className="truncate max-w-[150px]">{scopeLabel}</span>}
          panelClassName="p-3 w-56"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-semibold text-white">
            <span>Card types</span>
            {scopeIsDefault && <span className="text-[10px] font-normal text-white/50">default scope</span>}
          </div>
          <button
            type="button"
            onClick={() => {
              update({ types: null });
              setActivePopover(null);
            }}
            className={`w-full text-center py-1.5 px-3 mb-2 ${pill(state.types === null)}`}
          >
            All card types
          </button>
          <div className="space-y-1">
            {CARD_TYPES.map((t) => {
              const checked = state.types === null || state.types.includes(t);
              return (
                <label
                  key={t}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-white/90 hover:bg-white/[0.08] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(t)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span>{CARD_TYPE_LABELS[t]}</span>
                </label>
              );
            })}
          </div>
        </FilterPopover>

        {/* Position */}
        <FilterPopover
          {...popoverProps("position")}
          active={Boolean(state.pos)}
          icon={<LayoutGrid className="size-3.5" />}
          label={<span>{state.pos || "Position"}</span>}
          panelClassName="p-2.5"
        >
          <div className="grid grid-cols-4 gap-1.5 w-52">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={state.pos === p}
                onClick={() => {
                  update({ pos: state.pos === p ? "" : p });
                  setActivePopover(null);
                }}
                className={`h-7 px-3 font-semibold ${pill(state.pos === p)}`}
              >
                {p}
              </button>
            ))}
          </div>
        </FilterPopover>

        {/* Playing Style — attack column sends `playingStyle`, defence column `defensiveStyle`. */}
        <FilterPopover
          {...popoverProps("style")}
          active={state.style !== undefined || state.dstyle !== undefined}
          icon={<Zap className="size-3.5" />}
          label={<span className="truncate max-w-[150px]">{styleLabel}</span>}
          panelClassName="p-3 w-[480px]"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-semibold text-white">
            <span>Playing Style</span>
            {(state.style !== undefined || state.dstyle !== undefined) && (
              <button
                type="button"
                onClick={() => {
                  update({ style: undefined, dstyle: undefined });
                  setActivePopover(null);
                }}
                className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3.5 max-h-[360px] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-400 border-b border-white/5 pb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/playstyle_attack.svg" alt="" className="size-3.5" />
                <span>ATTACK ({ATTACK_STYLES.length})</span>
              </div>
              <div className="space-y-1">
                {ATTACK_STYLES.map((s) => {
                  const selected = state.style === s.id;
                  return (
                    <button
                      key={`a-${s.id}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        update({ style: selected ? undefined : s.id });
                        setActivePopover(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 truncate ${pill(selected)}`}
                      title={s.label}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-400 border-b border-white/5 pb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/playstyle_defence.svg" alt="" className="size-3.5" />
                <span>DEFENCE ({DEFENCE_STYLES.length})</span>
              </div>
              <div className="space-y-1">
                {DEFENCE_STYLES.map((s) => {
                  const selected = state.dstyle === s.id;
                  return (
                    <button
                      key={`d-${s.id}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        update({ dstyle: selected ? undefined : s.id });
                        setActivePopover(null);
                      }}
                      className={`w-full text-left px-3 py-1.5 truncate ${pill(selected)}`}
                      title={s.label}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </FilterPopover>

        {/* Strong Foot */}
        <FilterPopover
          {...popoverProps("foot")}
          active={state.foot !== undefined}
          icon={<ArrowLeftRight className="size-3.5" />}
          label={<span>{state.foot === 0 ? "Right Foot" : state.foot === 1 ? "Left Foot" : "Strong Foot"}</span>}
          panelClassName="p-1.5 flex items-center gap-1 !rounded-full"
        >
          {([
            ["All", undefined],
            ["Right", 0],
            ["Left", 1],
          ] as const).map(([label, value]) => (
            <button
              key={label}
              type="button"
              aria-pressed={state.foot === value}
              onClick={() => {
                update({ foot: value });
                setActivePopover(null);
              }}
              className={`px-3 py-1 ${pill(state.foot === value)}`}
            >
              {label}
            </button>
          ))}
        </FilterPopover>

        {/* OVR: base OVR minimum (home "90+ OVR" quick filter) + max OVR range */}
        <FilterPopover
          {...popoverProps("ovr")}
          active={ovrActive}
          icon={<TrendingUp className="size-3.5" />}
          label={<span className="truncate max-w-[160px]">{ovrLabel}</span>}
          panelClassName="p-3 space-y-2.5"
        >
          <label className="flex items-center justify-between gap-3 text-xs text-white/80">
            <span>Base OVR ≥</span>
            <input type="number" placeholder="e.g. 90" min={1} max={100} value={state.ovrMin ?? ""} onChange={numberChange("ovrMin", 100)} className={numberInput} />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-white/80">
            <span>Max OVR ≥</span>
            <input type="number" placeholder="Min" min={1} max={120} value={state.maxOvrMin ?? ""} onChange={numberChange("maxOvrMin", 120)} className={numberInput} />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-white/80">
            <span>Max OVR ≤</span>
            <input type="number" placeholder="Max" min={1} max={120} value={state.maxOvrMax ?? ""} onChange={numberChange("maxOvrMax", 120)} className={numberInput} />
          </label>
        </FilterPopover>

        {/* Nationality — real country ids from the API; skeleton while loading. */}
        <FilterPopover
          {...popoverProps("country")}
          active={state.nat !== undefined}
          icon={<Globe className="size-3.5" />}
          label={<span className="truncate max-w-[120px]">{nationLabel}</span>}
          panelClassName="p-3 w-56"
        >
          <label className="block text-xs font-semibold text-white/90 mb-1.5" htmlFor="players-nation-search">
            Nationality
          </label>
          <input
            id="players-nation-search"
            type="text"
            value={nationSearch}
            onChange={(e) => setNationSearch(e.target.value)}
            placeholder="e.g. Argentina"
            className="h-8 w-full px-3 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] mb-2"
            autoFocus
          />
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {state.nat !== undefined && (
              <button
                type="button"
                onClick={() => {
                  update({ nat: undefined });
                  setActivePopover(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-white/60 hover:bg-white/[0.08] hover:text-white cursor-pointer"
              >
                <span>All nations</span>
              </button>
            )}
            {countriesQuery.isLoading &&
              Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-7 rounded-lg bg-white/[0.06] animate-pulse" aria-hidden />
              ))}
            {countriesQuery.isError && (
              <button
                type="button"
                onClick={() => void countriesQuery.refetch()}
                className="w-full px-2.5 py-1.5 rounded-lg text-xs text-[var(--color-accent)] hover:bg-white/[0.08] cursor-pointer"
              >
                Could not load nations — retry
              </button>
            )}
            {filteredCountries.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  update({ nat: c.id });
                  setActivePopover(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  state.nat === c.id
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                    : "text-white/80 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <span>{c.name}</span>
                {state.nat === c.id && <Check className="size-3.5 text-[var(--color-accent)]" aria-hidden />}
              </button>
            ))}
            {countriesQuery.isSuccess && filteredCountries.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-white/50">No nations found.</div>
            )}
          </div>
        </FilterPopover>

        {/* Sort */}
        <FilterPopover
          {...popoverProps("sort")}
          active={false}
          icon={<ArrowUpDown className="size-3.5" />}
          label={<span>{SORT_OPTIONS.find((s) => s.value === state.sort)?.label ?? state.sort}</span>}
          align="right"
          panelClassName="p-3 w-56"
        >
          <label className="block text-xs font-semibold text-white/90 mb-1.5" htmlFor="players-sort">
            Sort by
          </label>
          <select
            id="players-sort"
            value={state.sort}
            onChange={(e) => {
              const v = e.target.value;
              if (isSortField(v)) update({ sort: v });
            }}
            className="h-8 w-full px-2.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-white focus:outline-none focus:border-[var(--color-accent)] cursor-pointer mb-2.5"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#18181b] text-white">
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/[0.04] border border-white/10" role="group" aria-label="Sort direction">
            {([
              ["desc", "High to low"],
              ["asc", "Low to high"],
            ] as const).map(([dir, label]) => (
              <button
                key={dir}
                type="button"
                aria-pressed={state.order === dir}
                onClick={() => update({ order: dir })}
                className={`flex-1 py-1 ${pill(state.order === dir)}`}
              >
                {label}
              </button>
            ))}
          </div>
        </FilterPopover>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetAll}
            className="h-8 inline-flex items-center gap-1 px-3 rounded-full text-xs font-medium text-white/60 hover:text-[var(--color-accent-danger)] hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            title="Reset all filters"
          >
            <RotateCcw className="size-3" aria-hidden />
            <span>Reset</span>
          </button>
        )}

        <span className="ml-auto text-xs text-[var(--color-text-secondary)] font-mono tabular-nums shrink-0" aria-live="polite">
          {listQuery.isError ? "—" : `${total.toLocaleString("en-US")} cards`}
        </span>
      </div>

      {/* Sub-counter */}
      <p ref={gridTopRef} className="text-muted text-xs tabular-nums text-[var(--color-text-secondary)]">
        {players.length} players · page {state.page} of {totalPages}
        {state.q && state.types !== null && (
          <>
            {" · "}searching {scopeLabel} only —{" "}
            <button type="button" onClick={() => update({ types: null })} className="text-[var(--color-accent)] hover:underline cursor-pointer">
              include all types
            </button>
          </>
        )}
      </p>

      {/* Card grid (efootbase layout: grid-cols-4 sm:5 md:6 lg:7 xl:8) */}
      {listQuery.isError ? (
        <QueryErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} title="Could not load players" />
      ) : listQuery.isPending ? (
        <CardGridSkeleton />
      ) : players.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] text-xs text-[var(--color-text-dim)] space-y-2">
          <p>No players match your search and filter criteria.</p>
          {state.types !== null && (
            <button type="button" onClick={() => update({ types: null })} className="text-[var(--color-accent)] hover:underline cursor-pointer">
              Search all card types
            </button>
          )}
        </div>
      ) : (
        <div
          className={`grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 ${listQuery.isPlaceholderData ? "opacity-60" : ""}`}
          aria-busy={listQuery.isPlaceholderData}
        >
          {players.map((p) => (
            <PlayerCard key={p.id} player={p} showName />
          ))}
        </div>
      )}

      <Pagination page={state.page} totalPages={totalPages} onChange={(p) => update({ page: p })} />
    </div>
  );
}
