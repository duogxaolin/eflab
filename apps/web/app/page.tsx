"use client";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useId } from "react";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PackCarousel } from "@/components/packs/PackCarousel";
import { QueryErrorState } from "@/lib/query-state";
import { useDebouncedValue, SEARCH_MIN_LENGTH } from "@/lib/use-debounced-value";
import { CARD_TYPE_BY_EFOOTBASE_CODE, CARD_TYPE_LABELS } from "@eflab/shared";
import { Search, Sparkles, Link2, X } from "lucide-react";
import { CARD_TYPE_COLOR_VAR, positionOf, statTierClass } from "@/lib/card-display";
import { playerCardUrl } from "@/lib/r2-images";

// Home quick filters (catalog-browsing-parity "Home Quick Filters Do What They
// Say"). Card-type scope goes through the /players `card=<efootbase code>`
// parameter (0 Standard · 1 Legendary · 5 Epic · 6 Highlight, see
// CARD_TYPE_BY_EFOOTBASE_CODE); labels follow efootbase's own naming: Big Time
// cards are stored under EPIC and Show Time cards under HIGHLIGHT (see
// CARD_TYPE_LABELS), so "Epic & Big Time" is exactly the EPIC type. The
// players page itself defaults to all card types, so no `type=all` is needed;
// "90+ OVR" sends efootbase's `base=90-` (Base Overall Rating ≥ 90).
const cardParam = (t: keyof typeof CARD_TYPE_LABELS) =>
  `/players?card=${Object.entries(CARD_TYPE_BY_EFOOTBASE_CODE).find(([, v]) => v === t)?.[0]}`;
const QUICK_FILTERS: ReadonlyArray<{ label: string; href: string }> = [
  { label: `${CARD_TYPE_LABELS.EPIC} & Big Time`, href: cardParam("EPIC") },
  { label: `${CARD_TYPE_LABELS.HIGHLIGHT} & Show Time`, href: cardParam("HIGHLIGHT") },
  { label: CARD_TYPE_LABELS.LEGENDARY, href: cardParam("LEGENDARY") },
  { label: "90+ OVR", href: "/players?base=90-" },
  { label: "Packs", href: "/packs" },
  { label: "Compare", href: "/compare" },
];

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
  const [isFocused, setIsFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // efootbase home: `/` focuses the search box when the user is not already
  // typing in a field (and no modal, e.g. the ⌘K palette, is open).
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
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFocused(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Latest 18 distinct base players by releaseDate DESC (newest card of each).
  const latest = trpc.player.trending.useQuery();
  // Catalogue size for the hero tagline — one cheap count, no rows.
  const catalogue = trpc.player.list.useQuery({ page: 1, limit: 1 }, { staleTime: 60 * 60_000 });
  // efootbase homepage "Latest Packs" — the featured bundles, newest first.
  const featuredBundles = trpc.featured.list.useQuery();

  const debouncedQ = useDebouncedValue(q.trim(), 250);
  const canSearch = debouncedQ.length >= SEARCH_MIN_LENGTH;
  const search = trpc.player.search.useQuery({ q: debouncedQ, limit: 8 }, { enabled: canSearch });

  const latestCards = latest.data ?? [];
  const searchResults = canSearch ? (search.data ?? []).slice(0, 6) : [];
  const showDropdown = isFocused && q.trim().length > 0;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsFocused(false);
    if (q.trim()) router.push(`/players?search=${encodeURIComponent(q.trim())}`);
    else router.push("/players");
  };

  const bundles = [...(featuredBundles.data ?? [])]
    .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime() || a.position - b.position)
    .slice(0, 3);

  return (
    <div className="space-y-8">
      {/* ================= HERO SEARCH BANNER ================= */}
      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono font-semibold uppercase tracking-wider text-[var(--color-accent)] text-[11px]">
                eFootball™ 2027
              </span>
              <span className="text-[var(--color-line)]" aria-hidden>/</span>
              <span className="text-[var(--color-text-secondary)]">
                {catalogue.data ? `${catalogue.data.total.toLocaleString("en-US")} player cards` : "Player database"}
              </span>
            </div>

            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              eFootball Player Database
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[var(--color-text-secondary)]">
              Search player cards, compare stats side by side, and discover the latest packs.
            </p>

            {/* Search Combobox Form */}
            <div ref={searchRef} className="relative mt-4">
              <form onSubmit={submitSearch} className="relative" role="search">
                <div className="relative flex items-center">
                  <Search className="absolute left-3.5 size-4 text-[var(--color-text-dim)] pointer-events-none" aria-hidden />
                  <input
                    ref={inputRef}
                    type="search"
                    value={q}
                    onFocus={() => setIsFocused(true)}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setIsFocused(true);
                    }}
                    placeholder="Search players by name…"
                    aria-label="Search players"
                    role="combobox"
                    aria-expanded={showDropdown}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    className="h-11 w-full rounded-lg bg-[var(--color-canvas)] border border-[var(--color-line)] pl-10 pr-24 text-sm text-white placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />

                  <div className="absolute right-2.5 flex items-center gap-1.5">
                    {q && (
                      <button
                        type="button"
                        onClick={() => setQ("")}
                        className="flex size-6 items-center justify-center rounded text-[var(--color-text-dim)] hover:text-white transition-colors cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    )}
                    <kbd
                      className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-text-dim)] bg-[var(--color-panel)] border border-[var(--color-line)]"
                      title="Press / to search"
                      aria-label="Press slash to search"
                    >
                      /
                    </kbd>
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded-md bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-accent-foreground)] hover:brightness-110 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {/* Autocomplete Dropdown */}
                {showDropdown && (
                  <div
                    id={listboxId}
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl divide-y divide-[var(--color-line-separator)]"
                  >
                    <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] font-mono text-[var(--color-text-dim)] bg-[var(--color-canvas)]/50" aria-live="polite">
                      <span>
                        {!canSearch
                          ? `Type at least ${SEARCH_MIN_LENGTH} characters`
                          : search.isPending
                            ? "Searching…"
                            : `${searchResults.length} players found`}
                      </span>
                      <span>Press Enter to view all</span>
                    </div>

                    {search.isError ? (
                      <div className="px-4 py-3 text-center text-xs text-[var(--color-text-dim)]">
                        Search failed.{" "}
                        <button type="button" onClick={() => void search.refetch()} className="text-[var(--color-accent)] hover:underline cursor-pointer">
                          Retry
                        </button>
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-line-separator)]/60" role="listbox" aria-label="Search results">
                        {searchResults.map((p) => {
                          const pos = positionOf(p.registeredPosition);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              role="option"
                              aria-selected={false}
                              onClick={() => {
                                setIsFocused(false);
                                router.push(`/players/${p.baseId}/${p.id}`);
                              }}
                              className="group flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-[var(--color-elevated)] transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="size-8 shrink-0 overflow-hidden rounded bg-[var(--color-canvas)] border border-[var(--color-line)] flex items-center justify-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={playerCardUrl(p.id)}
                                    alt=""
                                    width={32}
                                    height={32}
                                    loading="lazy"
                                    decoding="async"
                                    className="size-full object-contain"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = "none";
                                    }}
                                  />
                                </div>
                                <div className="min-w-0 truncate">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-white group-hover:text-[var(--color-accent)] transition-colors truncate">
                                      {p.name}
                                    </span>
                                    <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded bg-[var(--color-elevated)] border border-[var(--color-line)] text-[var(--color-text-secondary)] shrink-0">
                                      {pos}
                                    </span>
                                  </div>
                                  <div className="text-xs text-[var(--color-text-dim)] truncate mt-0.5">
                                    <span style={{ color: CARD_TYPE_COLOR_VAR[p.cardType] }}>{CARD_TYPE_LABELS[p.cardType]}</span>
                                    <span className="mx-1.5" aria-hidden>•</span>
                                    <span className="font-mono">Max {p.maxOvr}</span>
                                  </div>
                                </div>
                              </div>
                              <span className={`font-mono text-xs font-bold shrink-0 ${statTierClass(p.ovr)}`}>{p.ovr} OVR</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : canSearch && search.isSuccess ? (
                      <div className="px-4 py-4 text-center text-xs text-[var(--color-text-dim)]">
                        No players found matching &quot;{q.trim()}&quot;
                      </div>
                    ) : null}

                    {searchResults.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsFocused(false);
                          router.push(`/players?search=${encodeURIComponent(q.trim())}`);
                        }}
                        className="flex w-full items-center justify-center py-2 text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-elevated)] transition-colors cursor-pointer"
                      >
                        View all results for &quot;{q.trim()}&quot; →
                      </button>
                    )}
                  </div>
                )}
              </form>

              {/* Quick Filters */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[var(--color-text-dim)] text-[11px] font-medium mr-1">Quick filters:</span>
                {QUICK_FILTERS.map((f) => (
                  <Link
                    key={f.href}
                    href={f.href as Route}
                    className="px-2.5 py-1 rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-line-active)] transition-colors no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    {f.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop spotlight: the newest card */}
          {latestCards[0] && (
            <div className="hidden lg:flex flex-col items-center justify-center shrink-0 pl-6 border-l border-[var(--color-line)] min-w-[120px]">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-dim)] mb-2">Latest Card</span>
              <div className="w-24">
                <PlayerCard player={latestCards[0]} size="sm" showName />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 1. Latest Players (18 cards, releaseDate DESC, distinct base player).
          efootbase calls its section "Trending Players", but that list mixes
          community signals we do not hold; ours is exactly the "New cards"
          sort of /players de-duplicated by base player, so it keeps the
          honest "Latest" label and links to that sort. */}
      <section className="space-y-3" aria-labelledby="home-latest-players">
        <header className="flex items-center justify-between gap-3">
          <h2 id="home-latest-players" className="flex items-center gap-2 text-lg font-semibold text-white">
            <Sparkles className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
            <span>Latest Players</span>
          </h2>
          <Link href={"/players?sort=new" as Route} className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]" aria-label="Show all: Latest Players">
            Show all
          </Link>
        </header>

        {latest.isError ? (
          <QueryErrorState error={latest.error} onRetry={() => void latest.refetch()} title="Could not load the latest players" />
        ) : (
          <div className="grid grid-cols-3 gap-3 px-1 py-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6" aria-busy={latest.isPending}>
            {latest.isPending
              ? [...Array(18)].map((_, i) => <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />)
              : latestCards.map((p) => <PlayerCard key={p.id} player={p} size="full" showName />)}
          </div>
        )}
      </section>

      {/* 2. Latest Packs (featured bundles, newest 3) */}
      <section className="space-y-3" aria-labelledby="home-latest-packs">
        <h2 id="home-latest-packs" className="flex items-center gap-2 text-lg font-semibold text-white">
          <Link2 className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
          <span>Latest Packs</span>
        </h2>

        {featuredBundles.isError ? (
          <QueryErrorState error={featuredBundles.error} onRetry={() => void featuredBundles.refetch()} title="Could not load the latest packs" />
        ) : (
          <div className="space-y-6">
            {bundles.map((bundle) => (
              <PackCarousel key={bundle.id} bundle={bundle} autoScroll={true} />
            ))}

            {featuredBundles.isPending &&
              [0, 1, 2].map((i) => (
                <div key={i} className="space-y-2" aria-hidden>
                  <div className="h-4 w-48 rounded bg-[var(--color-panel)] animate-pulse" />
                  <div className="flex gap-3 px-1 py-2 overflow-x-auto hide-scrollbar">
                    {[...Array(6)].map((_, j) => (
                      <div key={j} className="w-24 shrink-0 sm:w-28 aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        <Link
          href="/packs"
          className="button button--secondary button--sm w-fit no-underline inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-elevated)] transition-colors"
        >
          Show all packs
        </Link>
      </section>
    </div>
  );
}
