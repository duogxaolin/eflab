"use client";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Menu, X, ChevronDown, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";

const NAV_LINKS = [
  { href: "/players", label: "Players" },
  { href: "/compare", label: "Compare" },
  { href: "/packs", label: "Packs" },
];

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const modalInputRef = useRef<HTMLInputElement>(null);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchModalOpen((v) => !v);
      } else if (e.key === "Escape") {
        setSearchModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-focus input when search modal opens
  useEffect(() => {
    if (searchModalOpen) {
      setTimeout(() => modalInputRef.current?.focus(), 50);
    } else {
      setSearchQuery("");
    }
  }, [searchModalOpen]);

  // Live search query for modal
  const searchResults = trpc.player.search.useQuery(
    { q: searchQuery, limit: 8 },
    { enabled: searchQuery.trim().length > 0 }
  );

  const handleSelectPlayer = (baseId: string, cardId: string) => {
    setSearchModalOpen(false);
    router.push(`/players/${baseId}/${cardId}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchModalOpen(false);
      router.push(`/players?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      <nav className="efb-navbar">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            className="md:!hidden flex items-center justify-center p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Menu"
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          {/* Logo */}
          <Link
            className="text-foreground flex items-center gap-2 text-lg font-bold no-underline"
            href="/"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/efbase_icon.webp"
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-lg"
              aria-hidden="true"
            />
            <span className="tracking-tight text-white font-bold">
              eFoot<span className="text-[var(--color-accent)]">Base</span>
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <ul className="ml-2 hidden items-center gap-1 md:flex list-none">
            {NAV_LINKS.map((link) => {
              const active =
                pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`efb-navbar__link ${active ? "efb-navbar__link--active" : ""}`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Right Action Controls */}
          <div className="efb-navbar__actions">
            {/* Desktop Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              aria-label="Search players"
              className="hidden md:flex items-center justify-between h-8 w-52 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 text-xs text-white/60 hover:text-white transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="size-3.5 text-white/50" />
                <span>Search players</span>
              </span>
              <kbd className="efb-navbar-search-kbd flex items-center gap-0.5 pointer-events-none">
                <span className="text-[10px]">⌘</span>K
              </kbd>
            </button>

            {/* Mobile Search Button */}
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="button button--sm button--ghost md:hidden px-2"
              aria-label="Search"
            >
              <Search className="size-4" />
            </button>

            {/* Divider */}
            <div className="efb-navbar__divider hidden sm:block" aria-hidden="true" />

            {/* Language Switcher Mock */}
            <button
              type="button"
              className="button button--sm button--ghost gap-1.5 px-2 text-xs"
              title="Language"
            >
              <span className="text-sm">🇬🇧</span>
              <ChevronDown className="size-3 text-white/50" />
            </button>

            {/* Divider */}
            <div className="efb-navbar__divider hidden lg:block" aria-hidden="true" />

            {/* App Store / Google Play Icons */}
            <div className="hidden lg:flex items-center gap-2 text-white/60">
              <a
                href="https://apps.apple.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="App Store"
                className="hover:text-white transition-colors p-1"
                title="iOS App"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.54c.64-.78 1.08-1.86.96-2.95-1 .04-2.13.67-2.78 1.44-.58.67-1.1 1.77-.96 2.83 1.12.09 2.14-.54 2.78-1.32z" />
                </svg>
              </a>
              <a
                href="https://play.google.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Google Play"
                className="hover:text-white transition-colors p-1"
                title="Android App"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a1.94 1.94 0 0 1-.61-1.447V3.261c0-.568.225-1.096.609-1.447zm11.242 11.245l2.49 2.49-11.75 6.78 9.26-9.27zm0-2.118L5.591 1.671l11.75 6.78-2.49 2.49zM18.84 10.87l2.84 1.64c.73.42.73 1.1 0 1.52l-2.84 1.64-2.15-2.15 2.15-2.65z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--color-line-separator)] bg-[var(--color-canvas)] px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => {
              const active =
                pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-[var(--color-panel)] text-[var(--color-accent)] font-semibold"
                      : "text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-panel)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* ⌘K Global Search Palette Modal */}
      {searchModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
          onClick={() => setSearchModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSearchSubmit} className="relative border-b border-[var(--color-line)]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[var(--color-text-dim)]" />
              <input
                ref={modalInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players (e.g. Messi, Haaland, Mbappe)…"
                className="w-full h-12 pl-11 pr-12 text-sm bg-transparent text-[var(--color-text-primary)] placeholder-[var(--color-text-dim)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchModalOpen(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--color-text-dim)] hover:text-white hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </form>

            <div className="max-h-80 overflow-y-auto p-2 divide-y divide-[var(--color-line-separator)]/40">
              {searchQuery.trim().length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--color-text-dim)]">
                  Type a player name or keyword to search across 48,000+ cards.
                </div>
              ) : searchResults.isLoading ? (
                <div className="py-8 text-center text-xs text-[var(--color-text-dim)] animate-pulse">
                  Searching database…
                </div>
              ) : (searchResults.data ?? []).length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--color-text-dim)]">
                  No cards found matching &quot;{searchQuery}&quot;.
                </div>
              ) : (
                (searchResults.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPlayer(p.baseId, p.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--color-elevated)] transition-colors text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-[var(--color-text-dim)] truncate">
                        {p.cardType.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-bold text-[var(--color-accent)] px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10">
                        {p.ovr} OVR
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="px-4 py-2 border-t border-[var(--color-line)] bg-[var(--color-canvas)]/40 flex items-center justify-between text-[11px] text-[var(--color-text-dim)] font-mono">
              <span>Press ESC to close</span>
              <span>Press ENTER to see all results</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
