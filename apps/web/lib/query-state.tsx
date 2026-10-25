"use client";
import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { browserOnline, trpcErrorStatus } from "@/lib/trpc";

/** Whether the browser is online (re-renders on the `online` / `offline`
 *  events, through TanStack Query's online manager); true on the server. */
export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(() => onChange()),
    browserOnline,
    () => true,
  );
}

/** The sentence under an error title: offline, no answer, a 5xx or a 4xx. */
export function queryErrorDetail(error: unknown, online: boolean): string {
  const status = trpcErrorStatus(error);
  if (status === undefined && !online) return "You appear to be offline. It loads again when the connection is back — or press Retry.";
  return status === undefined
    ? "The eflab API did not answer. Check your connection and try again."
    : status >= 500
      ? "The eflab API returned an error. Please try again."
      : `The request was rejected (HTTP ${status}).`;
}

/**
 * Explicit error state for a failed data query (site-quality-baseline
 * "Debounced Search and Error States"): message + Retry button. Rendered by
 * every data page from `isError` instead of an empty-result message. Offline
 * it says so (the query client fails offline requests at once instead of
 * pausing them, lib/trpc.tsx, and reloads them on reconnect).
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
  const online = useBrowserOnline();
  const detail = queryErrorDetail(error, online);
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

/**
 * Compact inline failure line for a secondary list a page can show without
 * (the skill details on the player page and in compare): what failed, the
 * offline note when it applies, and Retry. Polite, not an alert — the page's
 * main content is there.
 */
export function InlineQueryError({
  error,
  onRetry,
  what,
  className = "",
  "data-testid": testId,
}: {
  error?: unknown;
  onRetry: () => void;
  /** "Could not load <what>." */
  what: string;
  className?: string;
  "data-testid"?: string;
}) {
  const online = useBrowserOnline();
  const status = trpcErrorStatus(error);
  const note = status === undefined && !online ? " You appear to be offline." : "";
  return (
    <p role="status" className={`text-xs text-[var(--color-text-secondary)] ${className}`} data-testid={testId}>
      Could not load {what}.{note}{" "}
      <button type="button" onClick={onRetry} className="efb-inline-retry hit-44">
        Retry
      </button>
    </p>
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
