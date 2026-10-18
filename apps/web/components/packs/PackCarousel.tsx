"use client";
import { useRef, useEffect, useCallback, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
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

/** Auto-advance interval and step. */
const AUTO_ADVANCE_MS = 3200;
const AUTO_STEP_PX = 140;
const BUTTON_STEP_PX = 260; // ≈ 2 cards

export function PackCarousel({
  bundle,
  autoScroll = true,
  priorityCards = 0,
}: {
  bundle: PackBundleData;
  /** Auto-advance the row (pauses on hover/focus/touch, hidden tab, reduced
   *  motion, and via the explicit pause button). */
  autoScroll?: boolean;
  /** Number of leading cards to eager-load (above-the-fold carousels). */
  priorityCards?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [interacting, setInteracting] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const behavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";

  const scrollBy = useCallback(
    (direction: "left" | "right") => {
      scrollRef.current?.scrollBy({
        left: direction === "right" ? BUTTON_STEP_PX : -BUTTON_STEP_PX,
        behavior,
      });
    },
    [behavior],
  );

  // Pause while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const autoActive = autoScroll && !userPaused && !reducedMotion && !tabHidden && !interacting;

  useEffect(() => {
    if (!autoActive) return;
    const interval = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      if (scrollWidth <= clientWidth) return;
      if (scrollLeft + clientWidth >= scrollWidth - 10) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: AUTO_STEP_PX, behavior: "smooth" });
      }
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [autoActive]);

  const showPauseControl = autoScroll && !reducedMotion;
  const paused = !autoActive;

  return (
    <section
      className="min-w-0 space-y-2"
      aria-roledescription="carousel"
      aria-label={bundle.name}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInteracting(false);
      }}
      onTouchStart={() => setInteracting(true)}
      onTouchEnd={() => setInteracting(false)}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-[var(--color-line-separator)]/60 pb-2">
        <Link
          href={`/packs/${bundle.slug}`}
          className="min-w-0 truncate text-sm font-medium text-[var(--color-text-primary)] no-underline transition-colors hover:text-[var(--color-accent)]"
        >
          {bundle.name}
        </Link>

        <div className="flex shrink-0 items-center gap-2.5">
          <time dateTime={bundle.releaseDate} className="font-mono text-xs text-[var(--color-text-dim)]">
            {/* UTC so the calendar day never shifts with the viewer's timezone */}
            {formatUtcDate(bundle.releaseDate)}
          </time>

          <div className="flex items-center gap-1">
            {showPauseControl && (
              <button
                type="button"
                onClick={() => setUserPaused((v) => !v)}
                aria-pressed={userPaused}
                aria-label={userPaused ? `Resume auto-scroll of ${bundle.name}` : `Pause auto-scroll of ${bundle.name}`}
                className="pack-carousel__btn"
                data-testid="carousel-pause"
                data-paused={paused ? "true" : "false"}
              >
                {userPaused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
              </button>
            )}
            <button
              type="button"
              onClick={() => scrollBy("left")}
              aria-label={`Scroll ${bundle.name} left`}
              className="pack-carousel__btn"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scrollBy("right")}
              aria-label={`Scroll ${bundle.name} right`}
              className="pack-carousel__btn"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal scroll row. Each slot sets the width; the card fills it
          (size="full") so the art never overflows the slot on narrow screens. */}
      <div
        ref={scrollRef}
        className="hide-scrollbar flex gap-3 overflow-x-auto px-1 py-2"
        data-testid="carousel-track"
      >
        {bundle.cards.map((p, i) => (
          <div key={p.id} className="w-24 shrink-0 sm:w-28">
            <PlayerCard player={p} size="full" showName priority={i < priorityCards} />
          </div>
        ))}
      </div>
    </section>
  );
}
