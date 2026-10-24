"use client";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SEARCH_MAX_PAGE, SEARCH_MIN_LENGTH, liftWordStartRows, type CardPreview, type PlayerSearchResult } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/** Pause after the last keystroke before the result lists (search palette,
 *  compare picker, home search) query — the reference's ≈ 200 ms (survey
 *  2026-10-23 S3 §1.5 / §2: 203–233 ms on ten terms; intermediate prefixes
 *  were never requested). */
export const SEARCH_LIST_DEBOUNCE_MS = 200;

export interface PlayerSearchPages {
  /** The trimmed text the shown rows answer (the debounced query). */
  query: string;
  /** The current text has SEARCH_MIN_LENGTH (3) characters or more. */
  typedEnough: boolean;
  /** The rows belong to the current text (no debounce or first page pending). */
  current: boolean;
  /** The current text is long enough but its first page has not answered. */
  waiting: boolean;
  /** The first page of the current text failed. */
  failed: boolean;
  /** Every loaded page, each in the server order (max overall DESC, card id
   *  DESC) with its word-start rows lifted to its top (`liftWordStartRows`,
   *  page by page — never across pages). Empty unless `current`. */
  rows: CardPreview[];
  /** Number of loaded pages. */
  pageCount: number;
  /** A next page exists (and is within SEARCH_MAX_PAGE). */
  hasMore: boolean;
  loadingMore: boolean;
  /** The last next-page request failed (`loadMore` retries it). */
  loadMoreFailed: boolean;
  /** Fetch the next page unless one is in flight or none exists. */
  loadMore: () => void;
  /** Retry after a failed first page. */
  retry: () => void;
}

/**
 * One search rule for the result lists (change efootbase-function-parity
 * "Search Result Lists"): the trimmed text is sent `SEARCH_LIST_DEBOUNCE_MS`
 * after the last keystroke and only from SEARCH_MIN_LENGTH characters;
 * `player.search` answers pages of 12 with `hasMore`. Pages are an infinite
 * query keyed by the text, so a superseded text's request is aborted (its
 * `signal` reaches the tRPC client: TanStack cancels an in-flight query whose
 * observer moved to another key). `eagerPages` pages are fetched at once,
 * one after the other (the home list: 2), the rest on `loadMore` (the end of
 * the list scrolled into view — `useLoadMoreOnScroll`).
 */
export function usePlayerSearchPages(text: string, { enabled, eagerPages = 1 }: { enabled: boolean; eagerPages?: number }): PlayerSearchPages {
  const trimmed = text.trim();
  // The raw text is debounced (then trimmed): a space between two words
  // restarts the pause like any other key, so "cristiano ronaldo" typed in
  // one go never sends "cristiano" on its own.
  const debounced = useDebouncedValue(text, SEARCH_LIST_DEBOUNCE_MS).trim();
  const utils = trpc.useUtils();
  const active = enabled && debounced.length >= SEARCH_MIN_LENGTH;
  const pages = useInfiniteQuery({
    queryKey: ["player.search.pages", debounced],
    queryFn: ({ pageParam, signal }): Promise<PlayerSearchResult> => utils.client.player.search.query({ q: debounced, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last: PlayerSearchResult, _all: PlayerSearchResult[], lastPage: number) =>
      last.hasMore && lastPage < SEARCH_MAX_PAGE ? lastPage + 1 : undefined,
    enabled: active,
  });

  const typedEnough = trimmed.length >= SEARCH_MIN_LENGTH;
  const current = typedEnough && enabled && debounced === trimmed && pages.data !== undefined;
  const failed = typedEnough && enabled && debounced === trimmed && pages.data === undefined && pages.isError;
  const waiting = typedEnough && enabled && !current && !failed;

  const data = pages.data;
  const rows = useMemo(() => {
    if (!data) return [];
    // A card listed on two pages (the catalogue re-seeded between two page
    // requests) is kept once, where it was first shown.
    const seen = new Set<string>();
    const out: CardPreview[] = [];
    for (const page of data.pages) {
      for (const row of liftWordStartRows(page.rows, debounced)) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
    }
    return out;
  }, [data, debounced]);

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = pages;
  const pageCount = data?.pages.length ?? 0;
  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // The eager pages: page 2 right after page 1 answered (home), not on scroll.
  useEffect(() => {
    if (!current || pageCount >= eagerPages || isFetchNextPageError) return;
    loadMore();
  }, [current, pageCount, eagerPages, isFetchNextPageError, loadMore]);

  return {
    query: debounced,
    typedEnough,
    current,
    waiting,
    failed,
    rows: current ? rows : [],
    pageCount,
    hasMore: current && hasNextPage,
    loadingMore: current && isFetchingNextPage,
    loadMoreFailed: current && isFetchNextPageError,
    loadMore,
    retry: () => void refetch(),
  };
}

/**
 * Calls `onLoad` when `sentinel` (the "Loading more…" row at the end of a
 * result list) scrolls into view inside `root` (the list's scroll box). The
 * observer is re-created whenever `pageCount` changes: it only reports
 * changes, so a sentinel still in view after a page arrived would otherwise
 * never ask for the next one.
 */
export function useLoadMoreOnScroll(
  root: RefObject<HTMLElement | null>,
  sentinel: RefObject<HTMLElement | null>,
  enabled: boolean,
  pageCount: number,
  onLoad: () => void,
): void {
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);
  useEffect(() => {
    const rootEl = root.current;
    const el = sentinel.current;
    if (!enabled || !rootEl || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadRef.current();
      },
      // Start a little before the row is actually reached.
      { root: rootEl, rootMargin: "0px 0px 96px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root, sentinel, enabled, pageCount]);
}
