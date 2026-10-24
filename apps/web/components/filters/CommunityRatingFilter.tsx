"use client";
import { useId, type CSSProperties } from "react";
import { COMMUNITY_RATING_MAX, COMMUNITY_RATING_MIN } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { formatUtcDate } from "@/lib/format-date";

/** The dump date changes only when the catalogue is re-seeded. */
const META_STALE_MS = 60 * 60_000;

/**
 * The rail's "Community Rating" control (change efootbase-data-refresh-1024,
 * catalogue-data-refresh "Community Rating Filter"): one native range slider
 * 1–10 (`.efb-range`, the 16 px track of the Progression panel, with its 44 px
 * coarse-pointer box) whose 1 reads "All" (no filter); N ≥ 2 keeps the cards
 * whose stored average community rating is at least N, with no vote minimum.
 * Every step applies at once (arrow keys included) — `onChange` writes the
 * state, the URL `rating=N` and page 1.
 *
 * "Ratings as of <Mon D, YYYY>" (UTC) is the date of the dump the ratings come
 * from (`catalogue.meta`). While no seed has stored that date (or the request
 * fails) the line is left out — never a guessed date — and the control keeps
 * working on the stored ratings (design.md "As built").
 */
export function CommunityRatingFilter({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const id = useId();
  const dateId = `${id}-date`;
  const meta = trpc.catalogue.meta.useQuery(undefined, { staleTime: META_STALE_MS });
  const dumpedAt = meta.data?.playersDumpedAt ?? null;
  const all = value <= COMMUNITY_RATING_MIN;
  const fill = { "--range-p": (value - COMMUNITY_RATING_MIN) / (COMMUNITY_RATING_MAX - COMMUNITY_RATING_MIN) } as CSSProperties;
  return (
    <div className="space-y-2" data-testid="filter-community-rating">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="filter-label min-w-0">
          Community Rating
        </label>
        <span
          aria-hidden
          className={`shrink-0 text-xs font-semibold tabular-nums ${all ? "text-[var(--color-text-secondary)]" : "text-[var(--color-accent)]"}`}
        >
          {all ? "All" : `≥ ${value}`}
        </span>
      </div>
      <div className="py-1">
        <input
          id={id}
          type="range"
          min={COMMUNITY_RATING_MIN}
          max={COMMUNITY_RATING_MAX}
          step={1}
          value={value}
          aria-valuetext={all ? "All" : `At least ${value}`}
          aria-describedby={dumpedAt ? dateId : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          style={fill}
          className="efb-range"
          data-testid="filter-community-rating-slider"
        />
      </div>
      {dumpedAt && (
        <p id={dateId} className="text-xs text-[var(--color-text-secondary)]" data-testid="community-rating-date">
          Ratings as of {formatUtcDate(dumpedAt)}
        </p>
      )}
    </div>
  );
}
