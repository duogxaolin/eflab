"use client";
// /admin/runs/[id] — one run (openspec change admin-sync-worker,
// data-sync-worker "Run Statistics And History" and "Overwritten Images
// Warning"): status, times, watermarks, error, statistics table (English
// labels with an explanation per row), the check result for a check, the
// information line of a run that raised the card-image version (openspec
// change auto-image-version, design D7 — never an instruction to raise it)
// and the redacted log tail (monospace, scrolls inside its own box — never
// the page). Refreshes every 3 s while the run is queued or running and the
// tab is visible.
//
// openspec change admin-sync-live-progress (design D6): a "Progress" block while
// the run is queued or running (phase, progress bar); while it runs the
// Statistics panel shows the counters of the latest progress write over the
// stored statistics (a checkpoint's snapshot), never "No statistics yet." once
// the worker has written its first counters; "What was downloaded"
// (components/admin/RunItems.tsx) below the statistics.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImageOff } from "lucide-react";
import type { SyncRunDTO, SyncRunStats } from "@eflab/shared";
import { isActiveSyncStatus } from "@eflab/shared/sync";
import { adminErrorMessage, adminTrpc, trpcErrorStatus } from "@/lib/admin-trpc";
import { AdminShell } from "@/components/admin/AdminShell";
import { ACTIVE_POLL_MS, Notice, Panel, StatusBadge, useDocumentVisible } from "@/components/admin/admin-ui";
import { CancelRunButton, useRunAnnouncer } from "@/components/admin/run-actions";
import { RunProgress } from "@/components/admin/RunProgress";
import { RunItems } from "@/components/admin/RunItems";
import {
  CHECK_ROWS,
  IMAGE_VERSION_NOTE,
  KIND_LABELS,
  STAT_ROWS,
  TRIGGER_LABELS,
  formatCheckValue,
  formatDuration,
  formatUtcDateTime,
  imageVersionRaisedText,
  runDurationMs,
} from "@/components/admin/run-display";

export function RunDetailClient({ id, rawId }: { id: number | null; rawId: string }) {
  return <AdminShell>{() => (id === null ? <BadId rawId={rawId} /> : <RunDetail id={id} />)}</AdminShell>;
}

function BackLink() {
  return (
    <Link
      href="/admin/runs"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Run history
    </Link>
  );
}

function BadId({ rawId }: { rawId: string }) {
  return (
    <div className="space-y-4">
      <BackLink />
      <p role="alert" className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-6 text-sm text-white [overflow-wrap:anywhere]">
        “{rawId}” is not a run number.
      </p>
    </div>
  );
}

function RunDetail({ id }: { id: number }) {
  const visible = useDocumentVisible();
  const run = adminTrpc.admin.runs.get.useQuery(
    { id },
    {
      refetchInterval: (q) => (visible && q.state.data && isActiveSyncStatus(q.state.data.status) ? ACTIVE_POLL_MS : false),
      refetchIntervalInBackground: false,
    },
  );
  const wasVisible = useRef(visible);
  const refetch = run.refetch;
  useEffect(() => {
    if (visible && !wasVisible.current) void refetch();
    wasVisible.current = visible;
  }, [visible, refetch]);
  const announcement = useRunAnnouncer([run.data], run.isSuccess);
  const [cancelMessage, setCancelMessage] = useState("");

  return (
    <div className="min-w-0 space-y-6">
      <BackLink />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {run.isPending ? (
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-panel)]/60" aria-busy="true" aria-label="Loading the run" />
      ) : run.data === undefined ? (
        <div role="alert" className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-6 text-sm text-white">
          <p>{trpcErrorStatus(run.error) === 404 ? `There is no run #${id}.` : adminErrorMessage(run.error)}</p>
          {trpcErrorStatus(run.error) !== 404 && (
            <button
              type="button"
              onClick={() => void run.refetch()}
              className="button button--sm button--secondary mt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        <>
          {run.isError && (
            <p role="alert" className="text-xs text-[var(--color-danger-soft-foreground)]">
              Could not refresh: {adminErrorMessage(run.error)} The values below are from the last successful update.
            </p>
          )}
          <RunBody run={run.data} cancelMessage={cancelMessage} onCancel={setCancelMessage} />
        </>
      )}
    </div>
  );
}

function RunBody({ run, cancelMessage, onCancel }: { run: SyncRunDTO; cancelMessage: string; onCancel: (m: string) => void }) {
  const active = isActiveSyncStatus(run.status);
  const duration = runDurationMs(run);
  const overwritten = run.stats.imagesOverwritten ?? 0;
  // A run that raised the stored card-image version says so (its stats carry the value); a run from
  // before the raise existed, or one that failed before its upload started, shows no such line.
  const raisedTo = run.stats.imageVersionRaisedTo ?? null;
  // While the run is active: the counters of the latest progress write over the stored statistics (a
  // checkpoint's snapshot — the full run writes one before its seed, the incremental before its write),
  // so the live image counts stay visible after a checkpoint; the final statistics replace them at the end.
  const liveCounters = active && run.progress && Object.keys(run.progress.counters).length > 0 ? run.progress.counters : null;
  const shown: SyncRunStats = liveCounters ? { ...run.stats, ...liveCounters } : run.stats;
  const statRows = STAT_ROWS.filter((r) => shown[r.key] !== undefined);
  const meta: Array<[string, string]> = [
    ["Trigger", `${TRIGGER_LABELS[run.trigger]}${run.requestedBy ? ` by ${run.requestedBy}` : ""}`],
    ["Queued", formatUtcDateTime(run.queuedAt)],
    ["Started", formatUtcDateTime(run.startedAt)],
    ["Finished", formatUtcDateTime(run.finishedAt)],
    ["Duration", run.finishedAt ? formatDuration(duration) : active && run.startedAt ? "running…" : "—"],
    ["Watermark before", formatUtcDateTime(run.watermarkBefore)],
    ["Watermark after", formatUtcDateTime(run.watermarkAfter)],
  ];
  if (run.cancelRequested) meta.push(["Cancel", run.status === "CANCELLED" ? "cancelled by an admin" : "requested"]);

  return (
    <div className="min-w-0 space-y-6" data-testid="run-detail" data-status={run.status}>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {KIND_LABELS[run.kind]} <span className="font-mono text-[var(--color-text-dim)]">#{run.id}</span>
        </h1>
        <StatusBadge status={run.status} />
      </div>

      {raisedTo && (
        <Notice tone="info" title="Card images replaced on R2" icon={<ImageOff className="size-4 text-[var(--color-accent-secondary)]" aria-hidden />} testId="image-version-raised">
          <p data-testid="image-version-raised-text">
            {imageVersionRaisedText(raisedTo)}
            {overwritten > 0 ? ` (${overwritten.toLocaleString("en-US")} existing card image${overwritten === 1 ? "" : "s"} replaced).` : "."}
          </p>
          <p>{IMAGE_VERSION_NOTE}</p>
        </Notice>
      )}

      {active && (
        <Panel title="Progress">
          <RunProgress run={run} counters={false} />
        </Panel>
      )}

      {run.error && (
        <section aria-labelledby="run-error" className="min-w-0 rounded-xl border border-[var(--color-accent-danger)]/50 bg-[var(--color-accent-danger)]/10 p-4">
          <h2 id="run-error" className="text-xs font-bold uppercase tracking-wider text-[var(--color-danger-soft-foreground)]">
            Error
          </h2>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-white [overflow-wrap:anywhere]">{run.error}</p>
        </section>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Run">
          <dl className="min-w-0 space-y-1.5">
            {meta.map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <dt className="text-xs text-[var(--color-text-secondary)]">{k}</dt>
                <dd className="text-xs font-medium text-white tabular-nums [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
          {active && (
            <div className="mt-4 max-w-xs space-y-1">
              <CancelRunButton run={run} onDone={onCancel} />
              <p role="status" aria-live="polite" className="text-[11px] text-[var(--color-accent)] empty:hidden">
                {cancelMessage}
              </p>
            </div>
          )}
        </Panel>

        <Panel title="Statistics">
          {run.statsInvalid ? (
            <p className="text-xs text-[var(--color-accent-warn)]">The stored statistics did not match the expected shape and are withheld.</p>
          ) : statRows.length === 0 && !run.stats.check ? (
            <p className="text-xs text-[var(--color-text-secondary)]">{active ? "No statistics yet." : "This run recorded no statistics."}</p>
          ) : (
            <div className="min-w-0 space-y-4">
              {statRows.length > 0 && (
                <table className="w-full table-fixed text-xs" data-testid="run-stats" data-live={liveCounters ? "true" : undefined}>
                  {liveCounters ? (
                    <caption className="mb-1 text-left text-[11px] text-[var(--color-text-dim)]">
                      So far — the counters of the worker&apos;s latest progress write ({formatUtcDateTime(run.progress!.updatedAt)}); the final statistics replace these when the run ends.
                    </caption>
                  ) : (
                    <caption className="sr-only">Run statistics</caption>
                  )}
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Statistic</th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line-separator)]">
                    {statRows.map((r) => {
                      const v = shown[r.key] as number;
                      return (
                        <tr key={r.key} title={r.help}>
                          <th scope="row" className="py-1.5 pr-3 text-left align-top font-normal">
                            <span className="block text-white">{r.label}</span>
                            <span className="block text-[11px] text-[var(--color-text-dim)]">{r.help}</span>
                          </th>
                          <td className="w-28 py-1.5 text-right align-top font-mono font-semibold text-white tabular-nums">
                            {r.format ? r.format(v) : v.toLocaleString("en-US")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {run.stats.check && (
                <table className="w-full table-fixed text-xs" data-testid="check-result">
                  <caption className="mb-1 text-left text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">Check result</caption>
                  <tbody className="divide-y divide-[var(--color-line-separator)]">
                    {CHECK_ROWS.map((r) => (
                      <tr key={r.key} title={r.help}>
                        <th scope="row" className="py-1.5 pr-3 text-left align-top font-normal">
                          <span className="block text-white">{r.label}</span>
                          <span className="block text-[11px] text-[var(--color-text-dim)]">{r.help}</span>
                        </th>
                        <td className="w-40 py-1.5 text-right align-top font-mono font-semibold text-white tabular-nums [overflow-wrap:anywhere] max-[380px]:w-28">
                          {formatCheckValue(r.key, run.stats.check!)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="What was downloaded">
        <RunItems run={run} />
      </Panel>

      <Panel title="Log tail">
        {run.logTail ? (
          <>
            <pre
              tabIndex={0}
              aria-label={`Log tail of run ${run.id}`}
              data-testid="log-tail"
              className="max-h-[28rem] w-full max-w-full overflow-auto whitespace-pre rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              {run.logTail}
            </pre>
            <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">The last 64 KB of the run&apos;s output; secret values are masked before they are stored.</p>
          </>
        ) : (
          <p className="text-xs text-[var(--color-text-secondary)]">{active ? "No output yet." : "This run stored no log output."}</p>
        )}
      </Panel>
    </div>
  );
}
