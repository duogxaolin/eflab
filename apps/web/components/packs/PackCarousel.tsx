"use client";
import { useRef, useEffect, useCallback, useId, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { usePrefersReducedMotion } from "@/components/cards/usePrefersReducedMotion";
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

/** One arrow press scrolls a "page": the visible width minus about one card,
 *  so the last card in view stays in view as context. */
const KEEP_IN_VIEW_PX = 128;
const MIN_STEP_PX = 120;
/** Slack for sub-pixel scroll positions when testing the ends. */
const END_SLACK_PX = 2;

type Ends = { overflow: boolean; atStart: boolean; atEnd: boolean };

/**
 * One pack row on the home page (efootbase-behaviour-parity, design decision
 * 8): the title (link to `/packs/[slug]`) and date, then a horizontal row of
 * cards that never scrolls by itself — the reference row has no auto-advance,
 * and without one there is nothing to pause (WCAG 2.2.2; the old pause
 * control and its stuck-after-Resume bug B3 are gone). Previous / next 28 px
 * arrows sit over the row's edges: shown on hover and while focus is inside
 * the row, always shown on devices without hover, `aria-disabled` at either
 * end, and rendered only when the row overflows. The row also scrolls with
 * the trackpad, Shift + wheel, touch and Tab through its cards.
 */
export function PackCarousel({
  bundle,
  priorityCards = 0,
}: {
  bundle: PackBundleData;
  /** Number of leading cards to eager-load (above-the-fold carousels). */
  priorityCards?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackId = useId();
  const [ends, setEnds] = useState<Ends>({ overflow: false, atStart: true, atEnd: true });
  const reducedMotion = usePrefersReducedMotion();
  const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";

  // Which ends the row is at, from its scroll position (on scroll and on
  // every size change of the row — a breakpoint changes the card width).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next: Ends = {
        overflow: max > END_SLACK_PX,
        atStart: el.scrollLeft <= END_SLACK_PX,
        atEnd: el.scrollLeft >= max - END_SLACK_PX,
      };
      setEnds((prev) => (prev.overflow === next.overflow && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [bundle.cards.length]);

  const scrollBy = useCallback(
    (direction: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      if (direction === "left" ? ends.atStart : ends.atEnd) return; // aria-disabled
      const step = Math.max(MIN_STEP_PX, el.clientWidth - KEEP_IN_VIEW_PX);
      el.scrollBy({ left: direction === "right" ? step : -step, behavior });
    },
    [behavior, ends.atStart, ends.atEnd],
  );

  return (
    <section className="min-w-0 space-y-2" aria-roledescription="carousel" aria-label={bundle.name}>
      {/* Row header (reference): title 14/20 500 at 90 % white on the left,
          12/16 muted date on the right, baseline-aligned. */}
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        {/* Same title look as /packs (14/500 at 90 % white); the ellipsis is
            on the inner span so the link's touch area is not clipped. */}
        <h3 className="efb-pack-title min-w-0">
          <Link href={`/packs/${bundle.slug}`} className="efb-pack-title__link hit-44">
            <span className="efb-pack-title__text">{bundle.name}</span>
          </Link>
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
          the scroller's clip. The arrows come first in the Tab order, so the
          row can be paged without tabbing through every card; an arrow at its
          end (`aria-disabled`) leaves the Tab order (tabIndex -1) so the first
          stop is never a dead control (QA 2026-10-23 U6), yet keeps focus
          when it turns disabled under it — focus is never dropped at the ends. */}
      <div className="pack-row">
        {ends.overflow && (
          <>
            <button
              type="button"
              onClick={() => scrollBy("left")}
              aria-label={`Scroll ${bundle.name} left`}
              aria-controls={trackId}
              aria-disabled={ends.atStart}
              tabIndex={ends.atStart ? -1 : undefined}
              className="pack-row__arrow pack-row__arrow--prev hit-44"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scrollBy("right")}
              aria-label={`Scroll ${bundle.name} right`}
              aria-controls={trackId}
              aria-disabled={ends.atEnd}
              tabIndex={ends.atEnd ? -1 : undefined}
              className="pack-row__arrow pack-row__arrow--next hit-44"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </>
        )}
        <div id={trackId} ref={scrollRef} className="hide-scrollbar flex gap-3 overflow-x-auto px-1 py-2" data-testid="carousel-track">
          {bundle.cards.map((p, i) => (
            <div key={p.id} className="w-24 shrink-0 md:w-28">
              <PlayerCard player={p} size="full" caption="name" priority={i < priorityCards} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
