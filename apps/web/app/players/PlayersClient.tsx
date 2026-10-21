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
import { PLAYERS_GRID } from "./players-grid";
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
      // Multi-valued lists (OR within, AND between — multi-select-filters).
      positions: state.pos.length ? state.pos : undefined,
      playingStyle: state.style,
      aiStyles: state.ai.length ? state.ai : undefined,
      nationalityIds: state.nat.length ? state.nat : undefined,
      leagueIds: state.league.length ? state.league : undefined,
      clubIds: state.team.length ? state.team : undefined,
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

  // Sort row: the five presets as a 32 px segmented radiogroup next to the
  // field-sort select (our addition: "More sorts…") and, while a field sort
  // is active, its direction. From 768 px the row sits right of the title and
  // wraps right-aligned when it does not fit (one line from 1280 px); below
  // 768 px it scrolls sideways edge to edge (-mx-4 matches the page gutter).
  // The vertical padding keeps the focus rings inside the scroller; `relative`
  // keeps any absolutely positioned descendant inside its clip.
  const sortControl = (
    <div className="relative -mx-4 -my-1 overflow-x-auto px-4 py-1 hide-scrollbar md:mx-0 md:min-w-0 md:overflow-visible md:px-0">
      <div className="flex w-max items-center gap-2 md:w-auto md:flex-wrap md:justify-end">
        <div role="radiogroup" aria-label="Sort" className="segment shrink-0 p-1">
          {SORT_PRESETS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={state.sort === p} onClick={() => chooseSort(p)} className="segment__item hit-44">
              {SORT_PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <select
          aria-label="Sort by field"
          value={fieldSortActive ? state.sort : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (isSortField(v)) chooseSort(v);
          }}
          className={`h-10 w-36 shrink-0 cursor-pointer rounded-full border border-transparent bg-[var(--color-panel)] px-3 text-sm font-medium transition-colors hover:border-[var(--color-field-border-hover)] focus:border-[var(--color-field-border-focus)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${
            fieldSortActive ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"
          }`}
        >
          <option value="" disabled className="bg-[var(--color-panel)]">
            More sorts…
          </option>
          {FIELD_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[var(--color-panel)] text-[var(--color-text-primary)]">
              {o.label}
            </option>
          ))}
        </select>
        {fieldSortActive && (
          <div className="segment shrink-0 p-1" role="group" aria-label="Sort direction">
            {([
              ["desc", "High to low"],
              ["asc", "Low to high"],
            ] as const).map(([dir, label]) => (
              <button key={dir} type="button" aria-pressed={state.order === dir} onClick={() => update({ order: dir })} className="segment__item hit-44">
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const panel = <FiltersPanel state={state} update={update} openDialog={setDialog} />;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-6">
      <div className="min-w-0">
        <ol data-slot="breadcrumbs" aria-label="Breadcrumbs" className="breadcrumbs -ml-0.5 m-0 list-none p-0">
          <li className="breadcrumbs__item">
            <Link className="breadcrumbs__link hit-44" href="/">
              Home
            </Link>
            <span className="breadcrumbs__separator" aria-hidden>
              ›
            </span>
          </li>
          <li className="breadcrumbs__item" aria-current="page">
            Players
          </li>
        </ol>

        {/* Title (24/30) + sort row: side by side from 768 px (the title
            centred on the first 40 px line of the sort row), stacked below. */}
        <header className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="shrink-0 md:flex md:h-10 md:items-center">
            <h1 className="efb-h1 efb-h1--compact text-[var(--color-text-primary)]">Players</h1>
          </div>
          {sortControl}
        </header>

        {/* Search (44 px, radius 12) + the Filters button below 1024 px */}
        <div className="mt-4 flex items-center gap-2">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (qInput.trim() !== state.q) update({ q: qInput.trim() });
            }}
            className="min-w-0 flex-1"
          >
            <div className="field field--lg">
              <Search className="size-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
              <input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search players by name…"
                aria-label="Search players by name…"
                className="field__input no-native-clear"
              />
              {qInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQInput("");
                    update({ q: "" });
                  }}
                  className="hit-44 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-default)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </form>
          <button
            type="button"
            onClick={() => setMobileFilters(true)}
            aria-haspopup="dialog"
            className="button button--md button--secondary h-11 shrink-0 text-[var(--color-accent-soft-foreground)] lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters
            {activeFilters > 0 && (
              <span
                className="rounded-full bg-[var(--color-accent)] px-1.5 text-[10px] font-bold leading-4 text-[var(--color-accent-foreground)]"
                aria-label={`${activeFilters} active`}
              >
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Counter (12 px muted) + reset. One unit ("cards") throughout; while
            a new query is in flight the grid still shows the previous result
            (placeholderData), so the counter says "Updating…" instead of a
            stale total. */}
        <div ref={gridTopRef} className="mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2 text-xs tabular-nums text-[var(--color-text-secondary)]">
          <span className="mr-auto" aria-live="polite" aria-busy={listQuery.isPlaceholderData || undefined}>
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
              className="hit-44 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-default)] hover:text-[var(--color-text-primary)]"
              title="Reset search, filters and sort"
            >
              <RotateCcw className="size-3" aria-hidden />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Card grid: 4 columns, 6 from 768, 5 beside the rail from 1024, 6 from 1280 */}
        {listQuery.isError ? (
          <div className="mt-2">
            <QueryErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} title="Could not load players" />
          </div>
        ) : listQuery.isPending ? (
          <CardGridSkeleton className={`mt-1 ${PLAYERS_GRID}`} />
        ) : players.length === 0 ? (
          <div className="mt-2 space-y-2 rounded-[var(--radius-panel)] bg-[var(--color-panel)] p-12 text-center text-sm text-[var(--color-text-secondary)]">
            <p>No players match your search and filter criteria.</p>
            {activeFilters > 0 && (
              <button type="button" onClick={resetAll} className="hit-44 cursor-pointer font-medium text-[var(--color-accent)] hover:underline">
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          <div className={`mt-1 ${PLAYERS_GRID} ${listQuery.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={listQuery.isPlaceholderData}>
            {players.map((p) => (
              <PlayerCard key={p.id} player={p} caption="styles" />
            ))}
          </div>
        )}

        <Pagination className="mt-4" page={state.page} totalPages={totalPages} onChange={(p) => update({ page: p })} />
      </div>

      {/* Desktop rail (≥ 1024): sticky, 280 px, #181818, radius 24, padding 16 */}
      <aside aria-label="Filters" className="filter-rail sticky top-24 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto lg:block">
        <h2 className="filter-rail__title">Filters</h2>
        {panel}
      </aside>

      {/* Below 1024: the same panel in a bottom sheet */}
      <Modal variant="sheet" open={mobileFilters} onClose={() => setMobileFilters(false)} title="Filters">
        {panel}
      </Modal>

      {dialog && <FilterDialogs dialog={dialog} onClose={() => setDialog(null)} state={state} update={update} />}
    </div>
  );
}
