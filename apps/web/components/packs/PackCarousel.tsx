"use client";
import { useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PlayerCard } from "@/components/cards/PlayerCard";
import type { CardPreview } from "@eflab/shared";

export interface PackBundleData {
  id: number;
  name: string;
  releaseDate: string;
  cards: CardPreview[];
}

export function PackCarousel({
  bundle,
  autoScroll = true,
}: {
  bundle: PackBundleData;
  autoScroll?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInteracting = useRef(false);

  const scroll = useCallback((direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 260; // approx 2 cards
    scrollRef.current.scrollBy({
      left: direction === "right" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  }, []);

  // Auto-scroll effect with pause on hover/interaction
  useEffect(() => {
    if (!autoScroll) return;

    const interval = setInterval(() => {
      if (isInteracting.current || !scrollRef.current) return;
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      // Loop back smoothly if reached the end
      if (scrollLeft + clientWidth >= scrollWidth - 10) {
        scrollRef.current.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        scrollRef.current.scrollBy({ left: 140, behavior: "smooth" });
      }
    }, 3200);

    return () => clearInterval(interval);
  }, [autoScroll]);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-line-separator)]/60 pb-2">
        <Link
          href={`/packs/${bundle.id}`}
          className="font-medium text-sm text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors no-underline truncate"
        >
          {bundle.name}
        </Link>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="font-mono text-[var(--color-text-dim)] text-xs">
            {new Date(bundle.releaseDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>

          {/* Prev / Next navigation buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scroll("left")}
              aria-label={`Scroll ${bundle.name} left`}
              className="size-6 rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/[0.14] hover:border-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              aria-label={`Scroll ${bundle.name} right`}
              className="size-6 rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/[0.14] hover:border-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scroll / Slide Row */}
      <div
        ref={scrollRef}
        onMouseEnter={() => {
          isInteracting.current = true;
        }}
        onMouseLeave={() => {
          isInteracting.current = false;
        }}
        onTouchStart={() => {
          isInteracting.current = true;
        }}
        onTouchEnd={() => {
          isInteracting.current = false;
        }}
        className="flex gap-3 px-1 py-2 overflow-x-auto hide-scrollbar scroll-smooth"
      >
        {bundle.cards.map((p) => (
          <div key={p.id} className="w-24 shrink-0 sm:w-28">
            <PlayerCard player={p} size="md" showName />
          </div>
        ))}
      </div>
    </section>
  );
}
