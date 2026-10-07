"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, Users, Layers, Swords, Sparkles, Home } from "lucide-react";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/players", label: "Players", icon: Trophy },
  { href: "/compare", label: "Compare", icon: Swords },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/packs", label: "Packs", icon: Layers },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-canvas)]/95 border-t border-[var(--color-line-separator)] backdrop-blur-lg flex justify-around px-1 py-1">
      {LINKS.map((l) => {
        const active = pathname === l.href || (l.href !== "/" && pathname?.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[10px] min-h-[50px] transition-colors ${
              active ? "text-[var(--color-accent)] font-semibold" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <l.icon className={`h-4.5 w-4.5 ${active ? "text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"}`} />
            <span>{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
