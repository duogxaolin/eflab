"use client";
import { useId } from "react";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { formatUtcDate } from "@/lib/format-date";
import type { CardPreview } from "@eflab/shared";

export interface PackBundleData {
  id: number;
  name: string;
  /** Stable bundle slug (name + release date) — the `/packs/[slug]` route key. */
  slug: string;
  releaseDate: string;
  cards: CardPreview[];
}

/**
 * One pack row on the home page (change efootbase-function-parity, survey
 * 2026-10-23 S3 §1.3): the title as plain text (not a link — the bundle
 * pages stay reachable from `/packs`, where the titles link) and the date,
 * then a horizontal row of cards that never scrolls by itself and has no
 * previous / next buttons, as on the reference. The row scrolls with touch,
 * the trackpad or a horizontal wheel, and by moving keyboard focus through
 * its card links: each focused card is scrolled fully into view (the
 * browser's own focus scrolling, made explicit with `nearest` so it never
 * jumps further than needed; `scroll-px-1` keeps the 4 px padding that
 * leaves room for the 1.05 hover / focus scale).
 */
export function PackCarousel({
  bundle,
  priorityCards = 0,
}: {
  bundle: PackBundleData;
  /** Number of leading cards to eager-load (above-the-fold rows). */
  priorityCards?: number;
}) {
  const titleId = useId();
  return (
    <section className="min-w-0 space-y-2" aria-labelledby={titleId}>
      {/* Row header (reference): title 14/20 500 at 90 % white on the left,
          12/16 muted date on the right, baseline-aligned. */}
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h3 id={titleId} className="efb-pack-title min-w-0">
          <span className="efb-pack-title__text">{bundle.name}</span>
        </h3>

        <time dateTime={bundle.releaseDate} className="shrink-0 text-xs text-[var(--color-text-secondary)]">
          {/* UTC so the calendar day never shifts with the viewer's timezone */}
          {formatUtcDate(bundle.releaseDate)}
        </time>
      </div>

      {/* Horizontal scroll row. Each slot sets the width — 96 px below 768,
          112 px from 768 (reference w-24 / w-28); the card fills it
          (size="full") so the art never overflows the slot on narrow screens.
          The px-1 / py-2 padding leaves room for the 1.05 hover scale inside
          the scroller's clip. */}
      <div
        className="hide-scrollbar flex scroll-px-1 gap-3 overflow-x-auto px-1 py-2"
        data-testid="carousel-track"
        onFocus={(e) => {
          if (e.target instanceof HTMLElement && e.target !== e.currentTarget) e.target.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}
      >
        {bundle.cards.map((p, i) => (
          <div key={p.id} className="w-24 shrink-0 md:w-28">
            <PlayerCard player={p} size="full" caption="name" priority={i < priorityCards} />
          </div>
        ))}
      </div>
    </section>
  );
}
