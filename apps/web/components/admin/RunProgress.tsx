"use client";
// Live progress of a queued / running run (openspec change admin-sync-live-progress,
// design D6; data-sync-worker "Live Run Progress"): the phase, a progress bar and
// the counters known so far, from the run's `progress` (written by the worker with
// its 10-second heartbeat; the pages poll every 3 s). Used by the dashboard's
// active-run card and the run page.
//
// The bar is a `role="progressbar"` named by the phase line, with
// aria-valuemin 0, aria-valuemax = total, aria-valuenow = done and
// aria-valuetext "45 of 120 images"; with an unknown total it is indeterminate —
// no aria-valuenow, the text value names the phase — and its pulse stops under
// `prefers-reduced-motion` (motion-safe only). Fill = the accent, track = the line
// colour inside a line-active border (≥ 3:1 for the fill against the track).
import { useId } from "react";
import type { SyncRunSummaryDTO } from "@eflab/shared";
import { COUNTER_LABELS, COUNTER_ORDER, formatUtcDateTime, phaseUnit } from "./run-display";

export function RunProgress({
  run,
  waitingForWorker = false,
  compact = false,
  counters: showCounters = true,
}: {
  run: SyncRunSummaryDTO;
  waitingForWorker?: boolean;
  /** One line of counters instead of a grid (the dashboard card). */
  compact?: boolean;
  /** false: no counters here (the run page shows them where its final statistics will be). */
  counters?: boolean;
}) {
  const phaseId = useId();
  if (run.status !== "QUEUED" && run.status !== "RUNNING") return null;
  const p = run.progress;
  const phase = run.status === "QUEUED" ? (waitingForWorker ? "Queued — waiting for the worker to come online" : "Queued — waiting for the worker") : (p?.phase ?? "Starting");
  const determinate = run.status === "RUNNING" && p !== null && p.total !== null && p.total > 0;
  const done = determinate ? Math.min(p!.done, p!.total!) : 0;
  const total = determinate ? p!.total! : null;
  const pct = determinate ? Math.round((done / total!) * 100) : 0;
  const unit = phaseUnit(phase);
  const counters = p && showCounters ? COUNTER_ORDER.filter((k) => p.counters[k] !== undefined) : [];

  return (
    <div className="min-w-0 space-y-2" data-testid="run-progress" data-phase={phase} data-determinate={determinate ? "true" : "false"}>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p id={phaseId} className="text-xs font-semibold text-white [overflow-wrap:anywhere]">
          {phase}
        </p>
        <p className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
          {determinate ? `${done.toLocaleString("en-US")} of ${total!.toLocaleString("en-US")} ${unit} · ${pct} %` : run.status === "RUNNING" ? "total not known yet" : ""}
        </p>
      </div>
      <div
        role="progressbar"
        aria-labelledby={phaseId}
        aria-valuemin={0}
        aria-valuemax={determinate ? total! : 100}
        aria-valuenow={determinate ? done : undefined}
        aria-valuetext={determinate ? `${done} of ${total} ${unit}` : phase}
        data-testid="run-progressbar"
        className="h-2.5 w-full overflow-hidden rounded-full border border-[var(--color-line-active)] bg-[var(--color-line)]"
      >
        {determinate ? (
          <div className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-[var(--color-accent)]/70 motion-safe:animate-pulse" />
        )}
      </div>
      {!compact && run.status === "RUNNING" && counters.length > 0 && (
        <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3" data-testid="run-live-counters">
          {counters.map((k) => (
            <div key={k} className="flex min-w-0 items-baseline justify-between gap-2">
              <dt className="text-[11px] text-[var(--color-text-secondary)]">{COUNTER_LABELS[k]}</dt>
              <dd className="font-mono text-xs font-semibold text-white tabular-nums">{p!.counters[k]!.toLocaleString("en-US")}</dd>
            </div>
          ))}
        </dl>
      )}
      {compact && run.status === "RUNNING" && counters.length > 0 && (
        <p className="text-[11px] text-[var(--color-text-secondary)] [overflow-wrap:anywhere]" data-testid="run-live-counters">
          {counters.map((k) => `${COUNTER_LABELS[k]} ${p!.counters[k]!.toLocaleString("en-US")}`).join(" · ")}
        </p>
      )}
      {run.status === "RUNNING" && (
        <p className="text-[11px] text-[var(--color-text-dim)]">
          {p ? `Written by the worker at ${formatUtcDateTime(p.updatedAt)} — at most about 10 s old, refreshed here every 3 s.` : "The worker writes its progress with its next heartbeat (every 10 s)."}
        </p>
      )}
    </div>
  );
}
