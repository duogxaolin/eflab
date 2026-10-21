import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";

/** Tone of the icon tile (`.section-header__icon--*` in globals.css). */
export type SectionTone = "amber" | "blue" | "lime" | "gold" | "neutral";

/**
 * Shared section header (home and list sections): an 18/22.5 bold H2 with a
 * tinted icon tile before the text — 28 px (`size="md"`, home) or 32 px
 * (`size="lg"`, the skills sections) — an optional muted 14 px `count` after
 * the title and, where a full list exists, a "Show all" pill on the right
 * that links to it. The pill's accessible name is "Show all: <title>"
 * (aria-label; it starts with the visible text), so several pills on one page
 * stay distinguishable. `id` names the H2 for the section's `aria-labelledby`.
 */
export function SectionHeader({
  id,
  title,
  icon: Icon,
  tone = "lime",
  size = "md",
  count,
  showAllHref,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  tone?: SectionTone;
  size?: "md" | "lg";
  count?: number;
  showAllHref?: Route;
}) {
  return (
    <header className="section-header">
      <h2 id={id} className="section-header__title">
        <span className={`section-header__icon section-header__icon--${tone} ${size === "lg" ? "section-header__icon--lg" : ""}`} aria-hidden>
          <Icon className="size-4" />
        </span>
        <span className="section-header__text">{title}</span>
        {count !== undefined && <span className="section-header__count">{count.toLocaleString("en-US")}</span>}
      </h2>
      {showAllHref && (
        <Link href={showAllHref} className="section-header__more hit-44" aria-label={`Show all: ${title}`}>
          Show all
        </Link>
      )}
    </header>
  );
}
