"use client";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/**
 * Page numbers to show for `current` of `total` (catalog-browsing-parity
 * "Pagination Controls Reach Every Page"): a window of `radius` pages on each
 * side of the current page, always including page 1 and the last page, with
 * `null` where pages are skipped (rendered as an ellipsis).
 */
export function pageWindow(current: number, total: number, radius = 2): Array<number | null> {
  if (total <= 1) return [1];
  const pages = new Set<number>([1, total]);
  for (let p = current - radius; p <= current + radius; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  className = "",
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  // The URL's page is shown as-is: while the list is still loading (or the
  // page is past the end) the window extends to it instead of snapping to 1.
  const current = Math.max(1, page);
  const total = Math.max(1, totalPages, current);
  const go = (p: number) => {
    const next = Math.min(Math.max(1, p), total);
    if (next !== current) onChange(next);
  };
  // 36 px pills (.pagination__btn on the secondary button); the current page
  // is the accent. First / last are icon-only; previous / next show their
  // word from 640 px.
  const btn = "button button--secondary pagination__btn";
  const iconBtn = `${btn} button--icon-only`;
  // Below 640 px previous / next are icon-only squares too.
  const stepBtn = `${btn} max-sm:w-9 max-sm:px-0`;

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line-separator)] pt-6 text-xs text-[var(--color-text-secondary)] ${className}`}
    >
      <span className="tabular-nums">
        Page {current.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex max-w-full flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => go(1)} disabled={current <= 1} className={iconBtn} aria-label="First page">
          <ChevronsLeft className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => go(current - 1)} disabled={current <= 1} className={stepBtn} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {pageWindow(current, total).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-[var(--color-text-secondary)]" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => go(p)}
              aria-current={p === current ? "page" : undefined}
              aria-label={`Page ${p}`}
              className={btn}
            >
              {p}
            </button>
          ),
        )}

        <button type="button" onClick={() => go(current + 1)} disabled={current >= total} className={stepBtn} aria-label="Next page">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => go(total)} disabled={current >= total} className={iconBtn} aria-label="Last page">
          <ChevronsRight className="size-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
