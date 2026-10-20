"use client";
// One run as a compact block: kind, id, status, trigger, times, duration, error
// line and — for a check — the check result in one line. Used by the dashboard
// and the run history (openspec change admin-sync-worker).
import Link from "next/link";
import type { Route } from "next";
import type { SyncRunSummaryDTO } from "@eflab/shared";
import { StatusBadge } from "./admin-ui";
import { KIND_LABELS, TRIGGER_LABELS, checkSummary, formatDuration, formatUtcDateTime, runDurationMs } from "./run-display";

export function runHref(id: number): Route {
  return `/admin/runs/${id}` as Route;
}

export function RunSummary({
  run,
  waitingForWorker = false,
  headingLevel = "h3",
}: {
  run: SyncRunSummaryDTO;
  /** Queued while the worker is offline: say the run waits. */
  waitingForWorker?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const duration = runDurationMs(run);
  return (
    <div className="min-w-0 space-y-1.5" data-testid="run-summary" data-run-id={run.id} data-status={run.status}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Heading className="min-w-0 text-sm font-semibold text-white">
          <Link
            href={runHref(run.id)}
            className="hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            {KIND_LABELS[run.kind]} <span className="font-mono text-[var(--color-text-dim)]">#{run.id}</span>
          </Link>
        </Heading>
        <StatusBadge status={run.status} />
        {run.cancelRequested && run.status === "RUNNING" && (
          <span className="text-[11px] font-medium text-[var(--color-accent-warn)]">cancel requested</span>
        )}
      </div>
      <p className="text-xs text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
        {TRIGGER_LABELS[run.trigger]}
        {run.requestedBy ? ` by ${run.requestedBy}` : ""} · queued {formatUtcDateTime(run.queuedAt)}
        {run.startedAt ? ` · started ${formatUtcDateTime(run.startedAt)}` : ""}
        {run.finishedAt ? ` · finished ${formatUtcDateTime(run.finishedAt)}` : ""}
        {duration !== null && run.finishedAt ? ` · ${formatDuration(duration)}` : ""}
      </p>
      {waitingForWorker && run.status === "QUEUED" && (
        <p className="text-xs text-[var(--color-accent-warn)]">Waiting — the worker is offline and takes this run once it runs again.</p>
      )}
      {run.stats.check && <p className="text-xs text-[var(--color-text-secondary)]">Result: {checkSummary(run.stats.check)}</p>}
      {((run.stats.imagesFailed ?? 0) > 0 || (run.stats.imagesPending ?? 0) > 0) && (
        // an OK run may still have failed / owed images (third verify W1): visible without opening the run
        <p className="text-xs text-[var(--color-accent-warn)]" data-testid="run-images-warning">
          {(run.stats.imagesFailed ?? 0) > 0 ? `${run.stats.imagesFailed} images failed or skipped` : ""}
          {(run.stats.imagesFailed ?? 0) > 0 && (run.stats.imagesPending ?? 0) > 0 ? " · " : ""}
          {(run.stats.imagesPending ?? 0) > 0 ? `${run.stats.imagesPending} cards' images left to check — the next run tries them again` : ""}
        </p>
      )}
      {run.statsInvalid && (
        <p className="text-xs text-[var(--color-accent-warn)]">The stored statistics did not match the expected shape and are withheld.</p>
      )}
      {run.error && (
        <p className="line-clamp-3 text-xs text-[var(--color-accent-danger)] [overflow-wrap:anywhere]">Error: {run.error}</p>
      )}
    </div>
  );
}
