"use client";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useId } from "react";
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, type CardPreview } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PackCarousel } from "@/components/packs/PackCarousel";
import { PlayerSearchRow } from "@/components/search/PlayerSearchRow";
import { useLoadMoreOnScroll, usePlayerSearchPages } from "@/components/search/usePlayerSearchPages";
import { QueryErrorState, useBrowserOnline } from "@/lib/query-state";
import { Search, Sparkles, Package, X } from "lucide-react";
import { SectionHeader } from "@/components/layout/SectionHeader";

// Home (efootbase-ui-redesign, design decision 11): a 44 px search field with
// live results, "Latest Players" (12 cards) and "Latest Packs". No hero, no
// quick filters, no "Latest card" aside — the card-type and overall lists stay
// reachable from /players (`card=5`, `base=90-`, …).
//
// The search is an APG combobox (efootbase-behaviour-parity "Home Search
// Combobox", B7): DOM focus stays in the input, ArrowDown / ArrowUp move the
// active option (`aria-activedescendant` over `role="option"` rows, wrapping
// once every page is loaded; ArrowDown on the last loaded row asks for the
// next page), Enter opens the active card or, with none, the full list on
// /players; the first Escape closes the list and keeps the text, a second one
// clears it (the reference's "first Escape clears" was seen once — not
// copied, design D1). No row is active until an arrow key (the reference
// home list does not activate its first row).
//
// Results (change efootbase-function-parity "Search Result Lists", survey
// 2026-10-23 S3 §1.5): the result lists' rule (`usePlayerSearchPages`: 200 ms
// after the last keystroke, from 3 characters, name or pack / campaign name,
// max-overall order, word-start rows lifted inside each page of 12); the home
// list loads its first two pages at once and the next ones when its
// "Loading more…" row scrolls into view, under a "Players" header whose
// "Show all" opens `/players?search=<text>`; 1–2 characters show a hint.

/** Cards in the "Latest Players" grid (2 rows of 6, 4 rows of 3 below 768 px). */
const LATEST_COUNT = 12;
/** Bundles in "Latest Packs": the first three of the /packs order. */
const HOME_PACKS = 3;
/** Pages the home list loads at once (the reference: 1 + 2 right after it). */
const HOME_EAGER_PAGES = 2;

const playersSearchHref = (text: string) => `/players?search=${encodeURIComponent(text)}` as Route;

/** True when the keyboard event comes from a place where typing is expected. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function HomePage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Whether the results list may show (it also needs a non-empty query).
  const [listOpen, setListOpen] = useState(false);
  // The active option, by card id: an id that is no longer among the results
  // (a new query answered) simply reads as "no active option".
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLParagraphElement>(null);
  const listboxId = useId();
  const headingId = useId();
  const optionId = (p: CardPreview) => `${listboxId}-opt-${p.id}`;

  // `/` focuses the search box when the user is not already typing in a field
  // (and no modal, e.g. the ⌘K palette, is open).
  useEffect(() => {
    function onSlash(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setListOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Newest distinct base players by releaseDate DESC (newest card of each).
  const latest = trpc.player.trending.useQuery();
  // The featured bundles (each with its stored /packs position).
  const featuredBundles = trpc.featured.list.useQuery();

  const text = q.trim();
  const search = usePlayerSearchPages(q, { enabled: true, eagerPages: HOME_EAGER_PAGES });
  // "Search failed" says why when the browser is offline (the query client
  // fails offline requests at once and reloads them on reconnect).
  const online = useBrowserOnline();
  const searchFailedText = online ? "Search failed." : "Search failed — you appear to be offline.";
  const searchResults = search.rows;

  const latestCards = (latest.data ?? []).slice(0, LATEST_COUNT);
  const showDropdown = listOpen && text.length > 0;
  const activeIndex = showDropdown && activeId !== null ? searchResults.findIndex((p) => p.id === activeId) : -1;
  const activeDomId = activeIndex >= 0 ? optionId(searchResults[activeIndex]!) : undefined;
  const listed = showDropdown && searchResults.length > 0;

  // Keep the active option visible inside the scrolling list.
  useEffect(() => {
    if (activeDomId) document.getElementById(activeDomId)?.scrollIntoView({ block: "nearest" });
  }, [activeDomId]);
  // A new text starts at the top of its list.
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [search.query]);

  useLoadMoreOnScroll(listScrollRef, sentinelRef, listed && search.hasMore && !search.loadMoreFailed, search.pageCount, search.loadMore);

  const closeList = () => {
    setListOpen(false);
    setActiveId(null);
  };

  const openCard = (p: CardPreview) => {
    closeList();
    router.push(`/players/${p.baseId}/${p.id}`);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const active = activeIndex >= 0 ? searchResults[activeIndex] : undefined;
    if (active) {
      openCard(active);
      return;
    }
    closeList();
    if (text) router.push(playersSearchHref(text));
    else router.push("/players");
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Never act in the middle of an IME composition (CJK names).
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!showDropdown) {
        // A closed list with text opens again (no option active yet).
        if (text) {
          e.preventDefault();
          setListOpen(true);
        }
        return;
      }
      const n = searchResults.length;
      if (n === 0) return;
      e.preventDefault();
      if (e.key === "ArrowDown" && activeIndex === n - 1 && search.hasMore) {
        // The end of the loaded rows: ask for the next page, stay here.
        search.loadMore();
        return;
      }
      const next = e.key === "ArrowDown" ? (activeIndex + 1) % n : activeIndex <= 0 ? n - 1 : activeIndex - 1;
      setActiveId(searchResults[next]!.id);
      return;
    }
    if (e.key === "Escape") {
      // preventDefault also stops the native `type="search"` clear, which
      // would otherwise wipe the text on the first press.
      if (showDropdown) {
        e.preventDefault();
        closeList();
      } else if (q) {
        e.preventDefault();
        setQ("");
        setActiveId(null);
      }
    }
  };

  // The first three bundles of the /packs order (the stored position: the
  // current packs newest first, then the spotlights — change
  // efootbase-function-parity "Packs Order And Last Updated"), not the three
  // newest dates.
  const bundles = [...(featuredBundles.data?.bundles ?? [])].sort((a, b) => a.position - b.position).slice(0, HOME_PACKS);

  const status = !showDropdown
    ? ""
    : !search.typedEnough
      ? `Type at least ${SEARCH_MIN_LENGTH} characters to search.`
      : search.waiting
        ? "Searching…"
        : search.failed
          ? searchFailedText
          : searchResults.length === 0
            ? `No players found for "${search.query}".`
            : search.hasMore
              ? `${searchResults.length} players listed, more at the end of the list.`
              : `${searchResults.length} ${searchResults.length === 1 ? "player" : "players"} found.`;

  return (
    <div className="space-y-6">
      {/* The page's heading for assistive technology (the reference home has
          no visible title; the wordmark in the header names the site). */}
      <h1 className="sr-only">eFootLab — eFootball player database</h1>

      {/* Search: 44 px, radius 12, `/` chip; live results below it. */}
      <div
        ref={searchRef}
        className="relative"
        onKeyDown={(e) => {
          // Escape on a control inside the open list (Retry, "Show all"):
          // close it and return to the input. The input handles its own.
          if (e.key !== "Escape" || e.defaultPrevented || e.target === inputRef.current || !showDropdown) return;
          e.preventDefault();
          closeList();
          inputRef.current?.focus();
        }}
        onBlur={(e) => {
          // Tabbing out of the search closes the list (a click outside is
          // handled by the mousedown listener).
          if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) closeList();
        }}
      >
        <form onSubmit={submitSearch} role="search">
          <div className="field field--lg field--outlined">
            <Search className="size-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onFocus={() => setListOpen(true)}
              onChange={(e) => {
                setQ(e.target.value);
                setActiveId(null);
                setListOpen(true);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Search players by name…"
              aria-label="Search players"
              role="combobox"
              aria-expanded={listed}
              aria-controls={listed ? listboxId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={listed ? activeDomId : undefined}
              autoComplete="off"
              enterKeyHint="search"
              maxLength={SEARCH_MAX_LENGTH}
              className="field__input no-native-clear"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setActiveId(null);
                  inputRef.current?.focus();
                }}
                className="hit-44 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-default)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                aria-label="Clear search"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
            <kbd className="efb-kbd hidden shrink-0 sm:inline-flex" title="Press / to search" aria-label="Press slash to search">
              /
            </kbd>
          </div>

          {/* Live results */}
          {showDropdown && (
            <div className="efb-home-results">
              {!search.typedEnough ? (
                <p className="efb-home-results__note">Type at least {SEARCH_MIN_LENGTH} characters to search.</p>
              ) : search.waiting ? (
                <p className="efb-home-results__note animate-pulse">Searching…</p>
              ) : search.failed ? (
                <p className="efb-home-results__note">
                  {searchFailedText}{" "}
                  <button type="button" onClick={search.retry} className="cursor-pointer text-[var(--color-accent)] hover:underline">
                    Retry
                  </button>
                </p>
              ) : searchResults.length === 0 ? (
                <p className="efb-home-results__note">No players found matching &quot;{search.query}&quot;</p>
              ) : (
                <>
                  {/* "Players" header with "Show all" (the reference's list
                      header), outside the listbox: a link is not an option. */}
                  <div className="efb-home-results__header">
                    <span id={headingId}>Players</span>
                    <Link href={playersSearchHref(text)} onClick={closeList} className="efb-home-results__all hit-44">
                      Show all
                    </Link>
                  </div>
                  <div ref={listScrollRef} className="efb-home-results__scroll">
                    <div id={listboxId} role="listbox" aria-labelledby={headingId}>
                      {searchResults.map((p, i) => (
                        <PlayerSearchRow
                          key={p.id}
                          id={optionId(p)}
                          player={p}
                          role="option"
                          aria-selected={i === activeIndex}
                          // Options are not tab stops (focus stays in the input,
                          // aria-activedescendant points at them); a mouse press
                          // must not blur the input before the click opens the card.
                          tabIndex={-1}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => openCard(p)}
                        />
                      ))}
                    </div>
                    {search.loadMoreFailed ? (
                      <p className="efb-palette__more">
                        Could not load more players.{" "}
                        <button type="button" onClick={search.loadMore} className="efb-palette__link">
                          Retry
                        </button>
                      </p>
                    ) : search.hasMore ? (
                      <p ref={sentinelRef} className="efb-palette__more" aria-hidden>
                        Loading more…
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </form>
        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>
      </div>

      {/* 1. Latest Players (12 cards, releaseDate DESC, distinct base player).
          The reference calls its section "Trending Players", but that list
          mixes community signals we do not hold; ours is exactly the "New
          cards" sort of /players de-duplicated by base player, so it keeps
          the honest "Latest" label and links to that sort — /players itself,
          whose default sort is New cards (the canonical URL has no `sort`). */}
      <section className="space-y-3" aria-labelledby="home-latest-players">
        <SectionHeader id="home-latest-players" title="Latest Players" icon={Sparkles} tone="amber" showAllHref="/players" />

        {latest.isError ? (
          <QueryErrorState error={latest.error} onRetry={() => void latest.refetch()} title="Could not load the latest players" />
        ) : (
          <div className="grid grid-cols-3 gap-3 px-1 py-2 md:grid-cols-6" aria-busy={latest.isPending}>
            {latest.isPending
              ? [...Array(LATEST_COUNT)].map((_, i) => <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />)
              : latestCards.map((p) => <PlayerCard key={p.id} player={p} size="full" caption="name" />)}
          </div>
        )}
      </section>

      {/* 2. Latest Packs (featured bundles, newest 3) */}
      <section className="space-y-3" aria-labelledby="home-latest-packs">
        <SectionHeader id="home-latest-packs" title="Latest Packs" icon={Package} tone="blue" showAllHref="/packs" />

        {featuredBundles.isError ? (
          <QueryErrorState error={featuredBundles.error} onRetry={() => void featuredBundles.refetch()} title="Could not load the latest packs" />
        ) : (
          <div className="space-y-6">
            {bundles.map((bundle) => (
              <PackCarousel key={bundle.id} bundle={bundle} />
            ))}

            {featuredBundles.isPending &&
              [0, 1, 2].map((i) => (
                <div key={i} className="space-y-2" aria-hidden>
                  <div className="h-4 w-48 rounded bg-[var(--color-panel)] animate-pulse" />
                  <div className="hide-scrollbar flex gap-3 overflow-x-auto px-1 py-2">
                    {[...Array(6)].map((_, j) => (
                      <div key={j} className="aspect-[240/339] w-24 shrink-0 rounded-md bg-[var(--color-panel)] animate-pulse md:w-28" />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
