"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  countActiveFilters,
  defaultSortOrder,
  hasActiveFilters,
  playersListQuery,
  readPlayersState,
  resetFilters,
  resolveLegacyIds,
  searchApplies,
  withoutDefaultPage,
  withoutFilter,
  writePlayersState,
  type ActiveFilter,
  type LegacyIdLookups,
  type PlayersSort,
  type PlayersState,
} from "@/lib/filter-url";
import { FiltersPanel, type FilterDialogKind } from "@/components/filters/FiltersPanel";
import { ActiveFilterChips } from "@/components/filters/ActiveFilterChips";
import { PLAYERS_GRID, PLAYERS_PAGE_SIZE } from "./players-grid";
import { Modal } from "@/components/filters/Modal";
import { SkipLink } from "@/components/layout/SkipLink";
import {
  LIST_SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  SORT_FIELDS,
  SORT_PRESETS,
  SORT_PRESET_LABELS,
  isSortPreset,
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

// Direction buttons of a field sort, in the order the sort starts with
// (defaultSortOrder): names read A → Z first, numbers high → low first.
const directionOptions = (sort: PlayersSort): ReadonlyArray<readonly ["asc" | "desc", string]> =>
  defaultSortOrder(sort) === "asc"
    ? [
        ["asc", "A to Z"],
        ["desc", "Z to A"],
      ]
    : [
        ["desc", "High to low"],
        ["asc", "Low to high"],
      ];

/** The search (card name or pack name) is sent only from SEARCH_MIN_LENGTH
 *  characters (3, the reference's rule); a shorter text stays in the field
 *  with a hint and the list is unchanged. Empty = no search. */
const searchable = (q: string) => q.length === 0 || searchApplies(q);

/** Search debounce of /players (the reference requests ≈ 500 ms after the
 *  last keystroke, survey 2026-10-23 S2 §4). */
const SEARCH_DEBOUNCE_MS = 500;
const LIST_STALE_MS = 60 * 60_000;
/** Targets of the page's skip links: the filter rail and the results line. */
const FILTERS_ID = "players-filters";
const RESULTS_ID = "players-results";

/** The sort row below 768 px scrolls sideways (one line, edge to edge): at
 *  320–390 px "Top rated" sat past the edge with no sign that the row goes on
 *  (browser QA 2026-10-25 (a)). This marks which ends hide content
 *  (`data-fade-start` / `data-fade-end`: a fading edge in CSS, only while the
 *  row actually scrolls) and keeps the chosen sort — or, for a field sort,
 *  its select — in view, on load and on each change (`scrollLeft` only: the
 *  page never moves vertically). */
function useSortRowCue(ref: RefObject<HTMLDivElement | null>, activeKey: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      const hiddenEnd = el.scrollWidth - el.clientWidth - el.scrollLeft;
      el.dataset.fadeStart = el.scrollLeft > 1 ? "true" : "false";
      el.dataset.fadeEnd = hiddenEnd > 1 ? "true" : "false";
    };
    mark();
    el.addEventListener("scroll", mark, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark);
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", mark);
      ro?.disconnect();
    };
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const active = el.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? el.querySelector<HTMLElement>("select");
    if (!active) return;
    const box = el.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    const edge = parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0;
    if (r.left < box.left + edge) el.scrollLeft += r.left - box.left - edge;
    else if (r.right > box.right - edge) el.scrollLeft += r.right - box.right + edge;
  }, [ref, activeKey]);
}

/** The rail's and the phone sheet's Reset (shown while a filter is active).
 *  It disappears with the filters, so focus first moves to the first filter
 *  row of the same rail / sheet (in view, unlike the search field above). */
function ResetFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.closest("aside, dialog")?.querySelector<HTMLElement>(".filter-row")?.focus();
        onClick();
      }}
      className="filter-reset hit-44"
      data-testid="filters-reset"
    >
      <RotateCcw className="size-3.5" aria-hidden />
      Reset
    </button>
  );
}

// ---------------------------------------------------------------------------
export function PlayersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQs = searchParams.toString();

  // The page state lives in the URL (catalog-browsing-parity "Page State
  // Lives in the URL") but is held here, so a change shows at once and the
  // next change builds on it (QA 2026-10-23 bug 1: with `router.replace` every
  // filter change was an RSC round trip and was derived from the search
  // params of the last render, so CF, Epic and Left pressed 250 ms apart at
  // 800 ms latency ended as `foot=1` alone, and no toggle looked pressed until
  // the server answered).
  //  - `update` derives the next state from `latest` (the newest intended
  //    state, also when two changes land before a re-render), renders it at
  //    once and writes its canonical query with `history.replaceState`, which
  //    Next's router adopts as the new URL (useSearchParams follows) without a
  //    server request — this page's server component reads no search params.
  //    A replace, as before: no history entry per change, Back / Forward and
  //    reload restore the state from the URL exactly as they did.
  //  - Every query this component writes is remembered until the router
  //    hands it back (`ownWrites`, oldest first). A search-params value that
  //    is one of them is our own echo — the newest, or an older one arriving
  //    late (two writes in one router transition) — and changes nothing. Any
  //    other value is a navigation and is adopted: Back / Forward, the header
  //    search or a "Players" link while on /players (`router.push` renders the
  //    new params before Next writes the history entry, so the address bar
  //    cannot be consulted during render — verify finding 2026-10-23), the
  //    U4 clean-up below. A navigation also bumps `navEpoch`, the range
  //    fields' `resetKey`, so their drafts — an unapplied "Min is above Max"
  //    included — show the new URL's values; nothing is remounted, so focus
  //    on a toggle, in an open dialog or in the phone sheet stays put.
  const [state, setState] = useState<PlayersState>(() => readPlayersState(new URLSearchParams(urlQs)));
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);
  const ownWrites = useRef<string[]>([]);
  const [navEpoch, setNavEpoch] = useState(0);
  // "Page N does not exist — showing page M": set when a page past the end is
  // replaced by the last page, cleared by the next change or navigation.
  const [pageNotice, setPageNotice] = useState<{ requested: number; shown: number } | null>(null);
  const [seenQs, setSeenQs] = useState(urlQs);
  if (seenQs !== urlQs) {
    setSeenQs(urlQs);
    if (!ownWrites.current.includes(urlQs)) {
      const fromUrl = readPlayersState(new URLSearchParams(urlQs));
      if (writePlayersState(fromUrl) !== writePlayersState(state)) setState(fromUrl);
      setNavEpoch((n) => n + 1);
      setPageNotice(null);
    }
  }
  // Forget the writes the router has handed back (up to the one just seen);
  // a navigation forgets them all.
  useEffect(() => {
    const i = ownWrites.current.indexOf(urlQs);
    ownWrites.current = i >= 0 ? ownWrites.current.slice(i + 1) : [];
  }, [urlQs]);

  const commit = useCallback((next: PlayersState) => {
    latest.current = next;
    setState(next);
    const qs = writePlayersState(next);
    ownWrites.current = [...ownWrites.current.slice(-31), qs];
    window.history.replaceState(null, "", qs ? `/players?${qs}` : "/players");
  }, []);

  // Patch the newest state. Any change other than the page itself resets to
  // page 1 (catalog-browsing-parity "Page State Lives in the URL").
  const update = useCallback(
    (patch: Partial<PlayersState>) => {
      const pageOnly = Object.keys(patch).every((k) => k === "page");
      setPageNotice(null);
      commit({ ...latest.current, ...patch, page: pageOnly ? (patch.page ?? 1) : 1 });
    },
    [commit],
  );

  // An older link's all-digit `team` values and skill ids become team names
  // and skill keys once those lists are known (resolveLegacyIds), in the
  // state only: the URL keeps the link's form until the next change, which
  // writes the canonical one (`team=12` → `team=Portugal`). Until then the
  // ids are sent as ids, so the list is right either way; an id the lists do
  // not know stays an id. Runs again after a navigation brings ids back.
  const teamList = trpc.player.teams.useQuery(undefined, { staleTime: LIST_STALE_MS, enabled: state.legacyTeamIds.length > 0 });
  const skillList = trpc.skill.list.useQuery({}, { staleTime: LIST_STALE_MS, enabled: state.legacySkillIds.length > 0 });
  useEffect(() => {
    const lookups: LegacyIdLookups = {};
    if (teamList.data) {
      const names = new Map(teamList.data.map((t) => [t.id, t.name]));
      lookups.teamName = (id) => names.get(id);
    }
    if (skillList.data) {
      const keys = new Map(skillList.data.map((s) => [s.id, s.key]));
      lookups.skillKey = (id) => keys.get(id);
    }
    const next = resolveLegacyIds(latest.current, lookups);
    if (next !== latest.current) {
      latest.current = next;
      setState(next);
    }
  }, [state, teamList.data, skillList.data]);

  // A `page` that is not a page number past 1 (`?page=0`, `?page=abc`,
  // `?page=1`) reads as page 1: drop it so the address is the clean one.
  // Only that parameter goes; legacy names elsewhere are rewritten on the
  // next change as before. Through the router, not history.replaceState:
  // this can run on the first render, before Next has patched the history.
  useEffect(() => {
    const cleaned = withoutDefaultPage(new URLSearchParams(urlQs));
    if (cleaned !== null) router.replace((cleaned ? `/players?${cleaned}` : "/players") as Route, { scroll: false });
  }, [router, urlQs]);

  // Search box: local text mirrors the URL and is debounced into it (500 ms).
  // A 1- or 2-character text is never written or sent: the field shows a hint
  // and the grid keeps the previous result (SEARCH_MIN_LENGTH, shared with the
  // palette and the home search); a 1- or 2-character `search` from a link
  // fills the field the same way without filtering.
  const searchHintId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [qInput, setQInput] = useState(state.q);
  const qTrimmed = qInput.trim();
  const debouncedQ = useDebouncedValue(qTrimmed, SEARCH_DEBOUNCE_MS);
  const qTooShort = !searchable(qTrimmed);
  // Follow the state's query (Back, Reset, a link) unless the field already
  // says it: the debounced write of "messi" must not strip the space just
  // typed after it.
  useEffect(() => {
    setQInput((cur) => (cur.trim() === state.q ? cur : state.q));
  }, [state.q]);
  useEffect(() => {
    if (debouncedQ !== state.q && searchable(debouncedQ)) update({ q: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const [dialog, setDialog] = useState<FilterDialogKind | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);

  // The list request for the state (playersListQuery: the page past
  // MAX_LIST_PAGE asked for as the bound, a short search left out, the
  // lists OR within and AND between — positions by registered position).
  const listInput = useMemo(() => playersListQuery(state, PLAYERS_PAGE_SIZE), [state]);
  const listQuery = trpc.player.list.useQuery(listInput, { placeholderData: (prev) => prev });

  const listData = listQuery.data;
  const players = listData?.items ?? [];
  const totalPages = listData?.totalPages ?? 1;
  const total = listData?.total ?? 0;
  // An empty page of a non-empty list = a page past the end: it is about to be
  // replaced by the last page, so it renders as loading, never as "No players".
  const pastEnd = listData !== undefined && listData.items.length === 0 && listData.total > 0;
  // No card matches (settled, not an error): the empty state stands alone —
  // no "0 cards · page 1 of 1" and no pagination beside "No results found."
  // (browser QA 2026-10-25 (h)); the count line still announces it.
  const noResults = !listQuery.isError && !listQuery.isPending && !listQuery.isPlaceholderData && listData !== undefined && listData.total === 0;

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

  // A page past the last one (`?page=99999`, an old link after the data
  // shrank) is replaced by the last page once the list has answered for the
  // current query, with a polite message naming both pages.
  const settledLast = listData !== undefined && !listQuery.isPlaceholderData ? listData.totalPages : null;
  useEffect(() => {
    if (settledLast === null || state.page <= settledLast) return;
    const requested = state.page;
    lastPage.current = settledLast; // a replacement, not a page turn: no scroll
    update({ page: settledLast });
    setPageNotice({ requested, shown: settledLast });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledLast, state.page]);

  // Phone Filters badge: each OR list once, the AND lists per value (rule
  // unchanged — the reference's total badge is a pending measurement).
  const activeFilterCount = countActiveFilters(state);
  const filtersActive = hasActiveFilters(state);
  // Reset (rail, sheet, chip row): every filter cleared, the search text and
  // the sort kept (survey 2026-10-23 S2 §7), page 1.
  const resetAll = useCallback(() => {
    setPageNotice(null);
    commit(resetFilters(latest.current));
  }, [commit]);
  // A removed chip removes only its value (back on page 1).
  const removeFilter = useCallback(
    (f: ActiveFilter) => {
      setPageNotice(null);
      commit(withoutFilter(latest.current, f));
    },
    [commit],
  );

  // A newly chosen sort starts in its natural direction (Name A → Z, numbers
  // high → low); the direction buttons change it afterwards.
  const chooseSort = (sort: PlayersSort) => update({ sort, order: defaultSortOrder(sort) });
  const fieldSortActive = !isSortPreset(state.sort);
  const sortRowRef = useRef<HTMLDivElement>(null);
  useSortRowCue(sortRowRef, `${state.sort}:${state.order}`);

  // Sort row: the presets — New cards (the default, no `sort` in the URL),
  // High to low and Low to high by max overall (change
  // efootbase-function-parity; the reference's Trending needs popularity data
  // eFootLab does not hold), and Top rated while its measured rule is set
  // (TOP_RATED in @eflab/shared, change efootbase-data-refresh-1024: at least
  // 10 votes, average DESC, card id DESC — measured 2026-10-24) — as a 32 px segmented radiogroup next to the
  // field-sort select (our addition: "More sorts…") and, while a field sort
  // is active, its direction. From 768 px the row sits right of the title and
  // wraps right-aligned when it does not fit (one line from 1280 px); below
  // 768 px it scrolls sideways edge to edge (-mx-4 matches the page gutter).
  // The vertical padding keeps the focus rings inside the scroller; `relative`
  // keeps any absolutely positioned descendant inside its clip. While it
  // scrolls, its hidden ends fade out (`.efb-sort-scroller`, useSortRowCue).
  const sortControl = (
    <div
      ref={sortRowRef}
      className="efb-sort-scroller relative -mx-4 -my-1 overflow-x-auto px-4 py-1 hide-scrollbar md:mx-0 md:min-w-0 md:overflow-visible md:px-0"
    >
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
            {directionOptions(state.sort).map(([dir, label]) => (
              <button key={dir} type="button" aria-pressed={state.order === dir} onClick={() => update({ order: dir })} className="segment__item hit-44">
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // `resetKey`: a navigation re-syncs the range fields' drafts; nothing is
  // remounted, so focus (a toggle, an open dialog or the phone sheet) stays.
  const panel = <FiltersPanel state={state} update={update} openDialog={setDialog} resetKey={navEpoch} />;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-6">
      <div className="relative min-w-0">
        {/* Skip links (browser QA 2026-10-25 W1): the filter rail follows the
            72 cards in the tab order (it sits right of the grid from 1024 px),
            so the page's first stops jump to it — or past the controls to the
            results. Below 1024 px the rail is a sheet whose Filters button
            already comes before the grid: only "Skip to results" there. */}
        <SkipLink targetId={FILTERS_ID} className="max-lg:hidden" data-testid="skip-to-filters">
          Skip to filters
        </SkipLink>
        <SkipLink targetId={RESULTS_ID} data-testid="skip-to-results">
          Skip to results
        </SkipLink>
        <nav aria-label="Breadcrumb">
          <ol data-slot="breadcrumbs" className="breadcrumbs -ml-0.5 m-0 list-none p-0">
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
        </nav>

        {/* Title (24/30) + sort row: side by side from 768 px (the title
            centred on the first 40 px line of the sort row), stacked below. */}
        <header className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="shrink-0 md:flex md:h-10 md:items-center">
            <h1 className="efb-h1 efb-h1--compact text-[var(--color-text-primary)]">Players</h1>
          </div>
          {sortControl}
        </header>

        {/* Search (44 px, radius 12) + the Filters button below 1024 px */}
        <div className="mt-4 flex items-start gap-2">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (qTrimmed !== state.q && searchable(qTrimmed)) update({ q: qTrimmed });
            }}
            className="min-w-0 flex-1"
          >
            <div className="field field--lg">
              <Search className="size-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                maxLength={LIST_SEARCH_MAX_LENGTH}
                placeholder="Search players by name…"
                aria-label="Search players by name…"
                aria-describedby={qTooShort ? searchHintId : undefined}
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
            {/* Always mounted (a polite live region); takes no room while empty. */}
            <p
              id={searchHintId}
              role="status"
              className={qTooShort ? "mt-1.5 px-1 text-xs text-[var(--color-text-secondary)]" : "sr-only"}
            >
              {qTooShort ? `Type at least ${SEARCH_MIN_LENGTH} characters` : ""}
            </p>
          </form>
          <button
            type="button"
            onClick={() => setMobileFilters(true)}
            aria-haspopup="dialog"
            className="button button--md button--secondary h-11 shrink-0 text-[var(--color-accent-soft-foreground)] lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters
            {activeFilterCount > 0 && (
              <span
                className="rounded-full bg-[var(--color-accent)] px-1.5 text-[10px] font-bold leading-4 text-[var(--color-accent-foreground)]"
                aria-label={`${activeFilterCount} active`}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Active-filter chips under the search at every width (a Reset chip
            ends the row below 1024 px). */}
        <ActiveFilterChips state={state} onRemove={removeFilter} onReset={resetAll} searchRef={searchRef} />

        {/* Counter (12 px muted). One unit ("cards") throughout; while a new
            query is in flight the grid still shows the previous result
            (placeholderData), so the counter says "Updating…" instead of a
            stale total. */}
        {/* Also the "Skip to results" target (always mounted, unlike the
            grid, which gives way to its skeleton, error or empty state). */}
        <div
          ref={gridTopRef}
          id={RESULTS_ID}
          className="efb-skip-target mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2 text-xs tabular-nums text-[var(--color-text-secondary)]"
        >
          <span className="mr-auto" aria-live="polite" aria-busy={listQuery.isPlaceholderData || undefined} data-testid="players-count">
            {listQuery.isError ? (
              "—"
            ) : listQuery.isPending || pastEnd ? (
              "Loading…"
            ) : listQuery.isPlaceholderData ? (
              "Updating…"
            ) : noResults ? (
              <span className="sr-only">No results found.</span>
            ) : (
              `${total.toLocaleString("en-US")} ${total === 1 ? "card" : "cards"} · page ${state.page.toLocaleString("en-US")} of ${totalPages.toLocaleString("en-US")}`
            )}
          </span>
        </div>
        {/* Always mounted (polite live region); empty and room-less unless a
            page past the end was just replaced by the last page. */}
        <p role="status" className={pageNotice ? "mt-1 text-xs text-[var(--color-accent-warn)]" : "sr-only"}>
          {pageNotice
            ? `Page ${pageNotice.requested.toLocaleString("en-US")} does not exist — showing page ${pageNotice.shown.toLocaleString("en-US")}.`
            : ""}
        </p>

        {/* Card grid: 4 columns, 6 from 768, 5 beside the rail from 1024, 6 from 1280 */}
        {listQuery.isError ? (
          <div className="mt-2">
            <QueryErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} title="Could not load players" />
          </div>
        ) : listQuery.isPending || pastEnd ? (
          <CardGridSkeleton count={PLAYERS_PAGE_SIZE} className={`mt-1 ${PLAYERS_GRID}`} />
        ) : players.length === 0 ? (
          // The reference's empty state (survey S2 §7): the grid gives way to
          // two lines; the rail and the chips stay, Reset is in both.
          <div className="mt-2 space-y-1 rounded-[var(--radius-panel)] bg-[var(--color-panel)] px-6 py-12 text-center" data-testid="players-empty">
            <p className="text-base font-semibold text-[var(--color-text-primary)]">No results found.</p>
            <p className="text-sm text-[var(--color-text-secondary)]">Try resetting or changing your filter options!</p>
          </div>
        ) : (
          <div className={`mt-1 ${PLAYERS_GRID} ${listQuery.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={listQuery.isPlaceholderData}>
            {players.map((p) => (
              <PlayerCard key={p.id} player={p} caption="styles" />
            ))}
          </div>
        )}

        {!pastEnd && !noResults && <Pagination className="mt-4" page={state.page} totalPages={totalPages} onChange={(p) => update({ page: p })} />}
      </div>

      {/* Desktop rail (≥ 1024): sticky, 280 px, #181818, radius 24, padding 16 */}
      <aside
        id={FILTERS_ID}
        aria-label="Filters"
        className="efb-skip-target filter-rail sticky top-24 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto lg:block"
      >
        {/* Title row with Reset while a filter is active (the reference's
            rail header). */}
        <div className="filter-rail__head">
          <h2 className="filter-rail__title">Filters</h2>
          {filtersActive && <ResetFiltersButton onClick={resetAll} />}
        </div>
        {panel}
      </aside>

      {/* Below 1024: the same panel in a bottom sheet, with its own Reset
          (the sheet stays open). */}
      <Modal
        variant="sheet"
        open={mobileFilters}
        onClose={() => setMobileFilters(false)}
        title="Filters"
        headerAction={filtersActive ? <ResetFiltersButton onClick={resetAll} /> : undefined}
      >
        {panel}
      </Modal>

      {dialog && <FilterDialogs dialog={dialog} onClose={() => setDialog(null)} state={state} update={update} resetKey={navEpoch} />}
    </div>
  );
}
