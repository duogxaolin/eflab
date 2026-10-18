"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { Pagination } from "@/components/players/Pagination";
import { QueryErrorState, CardGridSkeleton } from "@/lib/query-state";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  DEFAULT_PLAYERS_STATE,
  countActiveFilters,
  hasAnyState,
  readPlayersState,
  writePlayersState,
  type PlayersSort,
  type PlayersState,
} from "@/lib/filter-url";
import { FiltersPanel, type FilterDialogKind } from "@/components/filters/FiltersPanel";
import { Modal } from "@/components/filters/Modal";
import {
  SORT_FIELDS,
  SORT_PRESETS,
  SORT_PRESET_LABELS,
  isSortPreset,
  type BaseStat,
  type PhysiqueField,
  type SortField,
} from "@eflab/shared";
import { Search, X, RotateCcw, SlidersHorizontal } from "lucide-react";

// The seven filter dialogs are one on-demand chunk (they hold the 26 stat and
// 11 body-model ranges and the long pickers) — mounted only while open.
const FilterDialogs = dynamic(() => import("@/components/filters/FilterDialogs").then((m) => m.FilterDialogs), { ssr: false });

// Explicit field sorts kept next to the efootbase presets ("in addition to any
// existing field sorts"); each has a real column behind it (SORT_FIELDS).
const FIELD_SORT_OPTIONS: ReadonlyArray<{ value: SortField; label: string }> = [
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
const isSortField = (s: string): s is SortField => (SORT_FIELDS as readonly string[]).includes(s);

const PAGE_SIZE = 24; // efootbase uses 24 cards per page

// ---------------------------------------------------------------------------
export function PlayersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useMemo(() => readPlayersState(new URLSearchParams(searchParams.toString())), [searchParams]);

  // Replace the URL with a patched state. Any change other than the page
  // itself resets to page 1 (catalog-browsing-parity "Page State Lives in the URL").
  const update = useCallback(
    (patch: Partial<PlayersState>) => {
      const pageOnly = Object.keys(patch).every((k) => k === "page");
      const next: PlayersState = { ...state, ...patch, page: pageOnly ? (patch.page ?? 1) : 1 };
      const qs = writePlayersState(next);
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

  const [dialog, setDialog] = useState<FilterDialogKind | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);

  const statRanges = useMemo(
    () => Object.entries(state.stats).map(([stat, r]) => ({ stat: stat as BaseStat, min: r.min, max: r.max })),
    [state.stats],
  );
  const bodyRanges = useMemo(
    () => Object.entries(state.body).map(([field, r]) => ({ field: field as PhysiqueField, min: r.min, max: r.max })),
    [state.body],
  );

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
      aiStyles: state.ai.length ? state.ai : undefined,
      nationalityId: state.nat,
      leagueId: state.league,
      clubId: state.team,
      strongerFoot: state.foot,
      ovrMin: state.base?.min,
      ovrMax: state.base?.max,
      maxOvrMin: state.max?.min,
      maxOvrMax: state.max?.max,
      conditionIn: state.condition.length ? state.condition : undefined,
      // Stars (1-based, as shown) → stored levels (0-based).
      formIn: state.form.length ? state.form.map((n) => n - 1) : undefined,
      weakFootAccuracyIn: state.wfa.length ? state.wfa.map((n) => n - 1) : undefined,
      weakFootUsageIn: state.wfu.length ? state.wfu.map((n) => n - 1) : undefined,
      heightMin: state.height?.min,
      heightMax: state.height?.max,
      weightMin: state.weight?.min,
      weightMax: state.weight?.max,
      ageMin: state.age?.min,
      ageMax: state.age?.max,
      skillIds: state.skills.length ? state.skills : undefined,
      statRanges: statRanges.length ? statRanges : undefined,
      statsAtMax: statRanges.length && state.statsAtMax ? true : undefined,
      bodyRanges: bodyRanges.length ? bodyRanges : undefined,
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

  const activeFilters = countActiveFilters(state);
  const resetAll = () => {
    setQInput("");
    setDialog(null);
    setMobileFilters(false);
    router.replace("/players", { scroll: false });
  };

  const chooseSort = (sort: PlayersSort) => update({ sort, order: DEFAULT_PLAYERS_STATE.order });
  const fieldSortActive = !isSortPreset(state.sort);

  const sortControl = (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Sort"
        className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-0.5 hide-scrollbar"
      >
        {SORT_PRESETS.map((p) => {
          const checked = state.sort === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => chooseSort(p)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                checked ? "bg-white/[0.14] text-white shadow-sm" : "text-white/70 hover:text-white"
              }`}
            >
              {SORT_PRESET_LABELS[p]}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
        <span className="sr-only sm:not-sr-only">More</span>
        <select
          aria-label="Sort by field"
          value={fieldSortActive ? state.sort : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (isSortField(v)) chooseSort(v);
          }}
          className="h-7 max-w-[9rem] rounded-full border border-white/10 bg-white/[0.04] px-2 text-[11px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="" disabled className="bg-[#18181b]">
            Field…
          </option>
          {FIELD_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#18181b] text-white">
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {fieldSortActive && (
        <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5" role="group" aria-label="Sort direction">
          {([
            ["desc", "High to low"],
            ["asc", "Low to high"],
          ] as const).map(([dir, label]) => (
            <button
              key={dir}
              type="button"
              aria-pressed={state.order === dir}
              onClick={() => update({ order: dir })}
              className={`rounded-full px-2.5 py-1 text-[11px] ${state.order === dir ? "bg-white/[0.14] text-white" : "text-white/70 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const panel = <FiltersPanel state={state} update={update} openDialog={setDialog} />;

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

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-4">
          {/* Header: title + Sort (efootbase radiogroup) */}
          <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Players</h1>
              <p className="text-xs text-[var(--color-text-secondary)] sm:text-sm">Browse and search the eFootball player database.</p>
            </div>
            {sortControl}
          </header>

          {/* Search + mobile Filters button */}
          <div className="flex items-center gap-2">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (qInput.trim() !== state.q) update({ q: qInput.trim() });
              }}
              className="relative min-w-0 flex-1"
            >
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden />
              <input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search players by name…"
                aria-label="Search players by name…"
                className="h-10 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-9 text-sm text-white placeholder-white/40 transition-colors focus:border-[var(--color-accent)] focus:outline-none"
              />
              {qInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQInput("");
                    update({ q: "" });
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-white/40 transition-colors hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </form>
            <button
              type="button"
              onClick={() => setMobileFilters(true)}
              aria-haspopup="dialog"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-xs font-semibold text-white hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] lg:hidden"
            >
              <SlidersHorizontal className="size-4 text-[var(--color-accent)]" aria-hidden />
              Filters
              {activeFilters > 0 && (
                <span className="rounded-full bg-[var(--color-accent)] px-1.5 text-[10px] font-bold text-black" aria-label={`${activeFilters} active`}>
                  {activeFilters}
                </span>
              )}
            </button>
          </div>

          {/* Counter + reset. One unit ("cards") throughout; while a new query is
              in flight the grid still shows the previous result (placeholderData),
              so the counter says "Updating…" instead of a stale total. */}
          <p ref={gridTopRef} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-[var(--color-text-secondary)]">
            <span aria-live="polite" aria-busy={listQuery.isPlaceholderData || undefined}>
              {listQuery.isError
                ? "—"
                : listQuery.isPending
                  ? "Loading…"
                  : listQuery.isPlaceholderData
                    ? "Updating…"
                    : `${total.toLocaleString("en-US")} cards · page ${state.page.toLocaleString("en-US")} of ${totalPages.toLocaleString("en-US")}`}
            </span>
            {hasAnyState(state) && (
              <button
                type="button"
                onClick={resetAll}
                className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium text-white/60 transition-colors hover:border-white/10 hover:bg-white/[0.06] hover:text-[var(--color-accent-danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                title="Reset search, filters and sort"
              >
                <RotateCcw className="size-3" aria-hidden />
                <span>Reset</span>
              </button>
            )}
          </p>

          {/* Card grid */}
          {listQuery.isError ? (
            <QueryErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} title="Could not load players" />
          ) : listQuery.isPending ? (
            <CardGridSkeleton className="grid grid-cols-3 gap-3 px-1 py-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6" />
          ) : players.length === 0 ? (
            <div className="space-y-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-12 text-center text-xs text-[var(--color-text-dim)]">
              <p>No players match your search and filter criteria.</p>
              {activeFilters > 0 && (
                <button type="button" onClick={resetAll} className="cursor-pointer text-[var(--color-accent)] hover:underline">
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div
              className={`grid grid-cols-3 gap-3 px-1 py-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 ${listQuery.isPlaceholderData ? "opacity-60" : ""}`}
              aria-busy={listQuery.isPlaceholderData}
            >
              {players.map((p) => (
                <PlayerCard key={p.id} player={p} showName />
              ))}
            </div>
          )}

          <Pagination page={state.page} totalPages={totalPages} onChange={(p) => update({ page: p })} />
        </div>

        {/* Desktop sidebar (efootbase "Filters" panel) */}
        <aside
          aria-label="Filters"
          className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 lg:block"
        >
          <h2 className="mb-3 text-base font-semibold text-white">Filters</h2>
          {panel}
        </aside>
      </div>

      {/* Mobile: the same panel in a dialog */}
      <Modal open={mobileFilters} onClose={() => setMobileFilters(false)} title="Filters">
        {panel}
      </Modal>

      {dialog && <FilterDialogs dialog={dialog} onClose={() => setDialog(null)} state={state} update={update} />}
    </div>
  );
}
