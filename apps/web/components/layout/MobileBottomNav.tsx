"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, Layers, Swords, Sparkles, Home } from "lucide-react";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/players", label: "Players", icon: Trophy },
  { href: "/compare", label: "Compare", icon: Swords },
  { href: "/wiki/skills", label: "Skills", icon: Sparkles },
  { href: "/packs", label: "Packs", icon: Layers },
] as const;

/**
 * Floating tab bar below lg: 12 px from the bottom edge and the sides, at
 * most 480 px wide, 58 px tall (56 px row + border), radius 16, translucent
 * canvas with a 20 px blur. The body reserves its height (layout.tsx), so
 * nothing is hidden behind it. Hidden from lg, where the header links show.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="efb-tabbar lg:hidden" aria-label="Sections">
      <ul className="m-0 flex h-14 list-none items-stretch justify-around p-0 px-1">
        {LINKS.map((l) => {
          const active = pathname === l.href || (l.href !== "/" && (pathname?.startsWith(l.href) ?? false));
          return (
            <li key={l.href} className="flex min-w-0 flex-1">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`efb-tabbar__link ${active ? "efb-tabbar__link--active" : ""}`}
              >
                <l.icon className="size-5 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{l.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
