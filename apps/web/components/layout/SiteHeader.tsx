"use client";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useId } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Menu, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CARD_TYPE_LABEL } from "@/lib/card-display";
import { EflabWordmark } from "./EflabWordmark";
import { useDebouncedValue, SEARCH_MIN_LENGTH } from "@/lib/use-debounced-value";

const NAV_LINKS = [
  { href: "/players", label: "Players" },
  { href: "/compare", label: "Compare" },
  { href: "/packs", label: "Packs" },
  { href: "/skills", label: "Skills" },
] as const;

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Element that had focus when the palette opened — focus returns to it on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const mobileMenuId = useId();
  const paletteTitleId = useId();
  const paletteInputId = useId();
  const paletteResultsId = useId();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Global ⌘K / Ctrl+K toggles the palette. Escape is handled by the native
  // <dialog> (cancel → close event) so it needs no window listener.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Sync React state with the native modal dialog: showModal() gives the focus
  // trap (everything outside becomes inert) and the top layer; close() fires
  // the `close` event, which restores focus to the opener.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (paletteOpen) {
      if (!dialog.open) {
        openerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      }
      inputRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [paletteOpen]);

  const handleDialogClose = useCallback(() => {
    setPaletteOpen(false);
    setSearchQuery("");
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && opener.isConnected) opener.focus();
  }, []);

  // Debounced query: one request per typing pause, nothing under 2 characters.
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), 250);
  const canSearch = debouncedQuery.length >= SEARCH_MIN_LENGTH;
  const searchResults = trpc.player.search.useQuery(
    { q: debouncedQuery, limit: 8 },
    { enabled: paletteOpen && canSearch },
  );
  const results = searchResults.data ?? [];
  const typedEnough = searchQuery.trim().length >= SEARCH_MIN_LENGTH;
  const waiting = typedEnough && (!canSearch || debouncedQuery !== searchQuery.trim() || searchResults.isLoading);

  const handleSelectPlayer = (baseId: string, cardId: string) => {
    closePalette();
    router.push(`/players/${baseId}/${cardId}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q.length >= SEARCH_MIN_LENGTH) {
      closePalette();
      router.push(`/players?search=${encodeURIComponent(q)}`);
    }
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && (pathname?.startsWith(href) ?? false));

  return (
    <>
      <header className="efb-navbar">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4" aria-label="Primary">
          {/* Mobile menu toggle */}
          <button
            type="button"
            className="button button--sm button--ghost md:hidden px-2"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls={mobileMenuId}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>

          {/* Logo */}
          <Link className="flex shrink-0 items-center text-white no-underline" href="/" aria-label="eFootLab home">
            <EflabWordmark height={26} />
          </Link>

          {/* Desktop nav links */}
          <ul className="ml-2 hidden list-none items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`efb-navbar__link ${isActive(link.href) ? "efb-navbar__link--active" : ""}`}
                  aria-current={isActive(link.href) ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Right action controls */}
          <div className="efb-navbar__actions">
            {/* Desktop search trigger */}
            <button
              type="button"
              onClick={openPalette}
              aria-label="Search players (Command K)"
              aria-haspopup="dialog"
              className="hidden h-8 w-52 cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white/60 transition-all hover:bg-white/10 hover:text-white md:flex"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="size-3.5 text-white/50" aria-hidden />
                <span>Search players</span>
              </span>
              <kbd className="efb-navbar-search-kbd pointer-events-none flex items-center gap-0.5" aria-hidden>
                <span className="text-[10px]">⌘</span>K
              </kbd>
            </button>

            {/* Mobile search button (hidden from md up — utility wins because
                .button lives in @layer components) */}
            <button
              type="button"
              onClick={openPalette}
              className="button button--sm button--ghost md:hidden px-2"
              aria-label="Search players"
              aria-haspopup="dialog"
              data-testid="mobile-search-button"
            >
              <Search className="size-4" aria-hidden />
            </button>
          </div>
        </nav>

        {/* Mobile dropdown menu */}
        <div
          id={mobileMenuId}
          hidden={!mobileMenuOpen}
          className="space-y-1 border-t border-[var(--color-line-separator)] bg-[var(--color-canvas)] px-4 py-3 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "bg-[var(--color-panel)] font-semibold text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-panel)] hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </header>

      {/* ⌘K search palette — native modal dialog: named, focus-trapped
          (showModal makes the page inert), Escape closes via `cancel`, focus
          returns to the opener in handleDialogClose. */}
      <dialog
        ref={dialogRef}
        className="efb-palette"
        aria-labelledby={paletteTitleId}
        onClose={handleDialogClose}
        onClick={(e) => {
          // A click on the dialog element itself (outside the panel) = backdrop.
          if (e.target === e.currentTarget) closePalette();
        }}
      >
        <div className="efb-palette__panel">
          <h2 id={paletteTitleId} className="sr-only">
            Search players
          </h2>
          <form onSubmit={handleSearchSubmit} role="search" className="relative border-b border-[var(--color-line)]">
            <label htmlFor={paletteInputId} className="sr-only">
              Player name
            </label>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-dim)]" aria-hidden />
            <input
              ref={inputRef}
              id={paletteInputId}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search players by name…"
              autoComplete="off"
              enterKeyHint="search"
              aria-controls={paletteResultsId}
              aria-describedby={`${paletteTitleId}-hint`}
              className="h-12 w-full bg-transparent pl-11 pr-24 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:outline-none"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
              {/* efootbase palette: an "Esc" chip; pressing it closes like the key. */}
              <button
                type="button"
                onClick={closePalette}
                aria-label="Close search (Escape)"
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-elevated)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-white"
              >
                Esc
              </button>
              <button
                type="button"
                onClick={closePalette}
                aria-label="Close search"
                className="rounded-md p-1 text-[var(--color-text-dim)] hover:bg-white/10 hover:text-white md:hidden"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </form>

          <div
            id={paletteResultsId}
            className="max-h-80 divide-y divide-[var(--color-line-separator)]/40 overflow-y-auto p-2"
          >
            {!typedEnough ? (
              <div className="py-8 text-center text-xs text-[var(--color-text-dim)]">
                Type at least {SEARCH_MIN_LENGTH} characters of a player name.
              </div>
            ) : waiting ? (
              <div className="animate-pulse py-8 text-center text-xs text-[var(--color-text-dim)]">
                Searching…
              </div>
            ) : searchResults.isError ? (
              <div className="py-8 text-center text-xs text-[var(--color-accent-danger)]">
                Search failed.{" "}
                <button
                  type="button"
                  onClick={() => searchResults.refetch()}
                  className="underline hover:text-white"
                >
                  Retry
                </button>
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--color-text-dim)]">
                No cards found matching &quot;{debouncedQuery}&quot;.
              </div>
            ) : (
              <ul className="m-0 list-none p-0">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectPlayer(p.baseId, p.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-elevated)] focus-visible:bg-[var(--color-elevated)] focus-visible:outline-none"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-text-dim)]">
                          {CARD_TYPE_LABEL[p.cardType] ?? p.cardType}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 font-mono text-xs font-bold text-[var(--color-accent)]">
                        {p.ovr} OVR
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            id={`${paletteTitleId}-hint`}
            className="flex items-center justify-between border-t border-[var(--color-line)] bg-[var(--color-canvas)]/40 px-4 py-2 font-mono text-[11px] text-[var(--color-text-dim)]"
          >
            <span>Esc to close</span>
            <span>Enter to see all results</span>
          </div>
        </div>
      </dialog>
    </>
  );
}
