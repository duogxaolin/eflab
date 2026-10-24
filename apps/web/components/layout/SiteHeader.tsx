"use client";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { EflabWordmark } from "./EflabWordmark";
import { SearchPalette } from "@/components/search/SearchPalette";

const NAV_LINKS = [
  { href: "/players", label: "Players" },
  { href: "/compare", label: "Compare" },
  { href: "/packs", label: "Packs" },
  // The skills wiki (/skills answers 308 here); active on its skill pages too.
  { href: "/wiki/skills", label: "Skills" },
] as const;

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteOpenRef = useRef(false);
  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Global ⌘K / Ctrl+K toggles the palette. Escape is handled by the palette
  // dialog itself. While another modal dialog is open (the compare picker, a
  // filter dialog) ⌘K does nothing, so no second palette stacks over it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!paletteOpenRef.current && document.querySelector("dialog[open]")) return;
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && (pathname?.startsWith(href) ?? false));

  return (
    <>
      {/* Header: 64 px bar + 1 px edge. Section links from lg; below lg the
          floating tab bar (MobileBottomNav) carries them — no hamburger. */}
      <header className="efb-navbar">
        <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4" aria-label="Primary">
          {/* Logo */}
          <Link className="flex shrink-0 items-center text-white no-underline" href="/" aria-label="eFootLab home">
            <EflabWordmark height={32} />
          </Link>

          {/* Section links (lg and up) */}
          <ul className="ml-2 hidden list-none items-center gap-1 lg:flex">
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
            {/* Search trigger, lg and up: 208 × 32 with the ⌘K chip */}
            <button
              type="button"
              onClick={openPalette}
              aria-label="Search players (Command K)"
              aria-haspopup="dialog"
              className="efb-navbar-search-trigger hidden lg:flex"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="truncate">Search players</span>
              </span>
              <kbd className="efb-navbar-search-kbd pointer-events-none" aria-hidden>
                <span>⌘</span>K
              </kbd>
            </button>

            {/* Search icon button below lg (36 × 36; 44 × 44 hit area on touch) */}
            <button
              type="button"
              onClick={openPalette}
              className="button button--md button--icon-only button--ghost lg:hidden"
              aria-label="Search players"
              aria-haspopup="dialog"
              data-testid="mobile-search-button"
            >
              <Search className="size-5" aria-hidden />
            </button>
          </div>
        </nav>
      </header>

      {/* ⌘K search palette (shared with the compare picker): a row — or
          Enter on the active row, the first one while typing — opens that
          card's page (change efootbase-function-parity; Enter never runs a
          list search here — the home search's Enter does). */}
      <SearchPalette
        open={paletteOpen}
        onClose={closePalette}
        title="Search players"
        onSelect={(p) => router.push(`/players/${p.baseId}/${p.id}`)}
      />
    </>
  );
}
