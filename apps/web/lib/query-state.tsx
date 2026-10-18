"use client";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { trpcErrorStatus } from "@/lib/trpc";

/**
 * Explicit error state for a failed data query (site-quality-baseline
 * "Debounced Search and Error States"): message + Retry button. Rendered by
 * every data page from `isError` instead of an empty-result message.
 */
export function QueryErrorState({
  error,
  onRetry,
  title = "Could not load this page",
  className = "",
}: {
  error?: unknown;
  onRetry: () => void;
  title?: string;
  className?: string;
}) {
  const status = trpcErrorStatus(error);
  const detail =
    status === undefined
      ? "The eflab API did not answer. Check your connection and try again."
      : status >= 500
        ? "The eflab API returned an error. Please try again."
        : `The request was rejected (HTTP ${status}).`;
  return (
    <div
      role="alert"
      className={`p-8 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] space-y-3 ${className}`}
    >
      <AlertTriangle className="size-6 mx-auto text-[var(--color-accent-danger,#ef4444)]" aria-hidden />
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-[var(--color-text-secondary)]">{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="button button--sm button--secondary inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Retry
      </button>
    </div>
  );
}

/** Card-grid skeleton used while a list loads. */
export function CardGridSkeleton({ count = 24, className = "" }: { count?: number; className?: string }) {
  return (
    <div
      className={
        className ||
        "grid grid-cols-4 gap-3 px-1 py-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
      }
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="aspect-[240/339] rounded-md bg-[var(--color-panel)] animate-pulse" />
      ))}
    </div>
  );
}
