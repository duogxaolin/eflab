"use client";
// /admin/runs — run history, newest first (openspec change admin-sync-worker,
// data-sync-worker "Run Statistics And History"). Cursor pages of 20
// (`admin.runs.list`, id DESC; the next page starts below the last id shown,
// so a page never repeats a run even when new runs arrive) behind "Load more".
// Refreshes every 3 s while a listed run is queued or running and the tab is
// visible.
import { useEffect, useMemo, useRef } from "react";
import { ChevronDown } from "lucide-react";
import type { SyncRunSummaryDTO } from "@eflab/shared";
import { isActiveSyncStatus } from "@eflab/shared/sync";
import { adminErrorMessage, adminTrpc } from "@/lib/admin-trpc";
import { AdminShell } from "@/components/admin/AdminShell";
import { ACTIVE_POLL_MS, useDocumentVisible } from "@/components/admin/admin-ui";
import { RunSummary } from "@/components/admin/RunSummary";
import { useRunAnnouncer } from "@/components/admin/run-actions";

const PAGE_SIZE = 20;

export function RunsClient() {
  return <AdminShell>{() => <RunHistory />}</AdminShell>;
}

function RunHistory() {
  const visible = useDocumentVisible();
  const runs = adminTrpc.admin.runs.list.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      refetchInterval: (q) =>
        visible && (q.state.data?.pages ?? []).some((p) => p.items.some((r) => isActiveSyncStatus(r.status))) ? ACTIVE_POLL_MS : false,
      refetchIntervalInBackground: false,
    },
  );

  const wasVisible = useRef(visible);
  const refetch = runs.refetch;
  useEffect(() => {
    if (visible && !wasVisible.current) void refetch();
    wasVisible.current = visible;
  }, [visible, refetch]);

  // Flattened in page order; an id seen on an earlier page is skipped (a safety
  // net — the cursor already guarantees disjoint pages).
  const items = useMemo(() => {
    const seen = new Set<number>();
    const out: SyncRunSummaryDTO[] = [];
    for (const page of runs.data?.pages ?? []) {
      for (const r of page.items) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
      }
    }
    return out;
  }, [runs.data]);

  const announcement = useRunAnnouncer(items, runs.isSuccess);

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Run history</h1>
        <p className="text-xs text-[var(--color-text-secondary)] sm:text-sm">Every check and sync, newest first. Open a run for its statistics and log.</p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {runs.isPending ? (
        <div className="h-48 animate-pulse rounded-xl bg-[var(--color-panel)]/60" aria-busy="true" aria-label="Loading the run history" />
      ) : runs.data === undefined ? (
        <div role="alert" className="rounded-xl border border-[var(--color-accent-danger)]/50 bg-[var(--color-accent-danger)]/10 p-4 text-sm text-white">
          <p>{adminErrorMessage(runs.error)}</p>
          <button
            type="button"
            onClick={() => void runs.refetch()}
            className="button button--sm button--secondary mt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-8 text-center text-xs text-[var(--color-text-secondary)]">
          No run yet. Queue a check from the dashboard.
        </p>
      ) : (
        <section aria-label="Runs" className="min-w-0 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]">
          <ol className="min-w-0 divide-y divide-[var(--color-line-separator)]" data-testid="run-list">
            {items.map((run) => (
              <li key={run.id} className="min-w-0 px-4 py-3">
                <RunSummary run={run} />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] px-4 py-3">
            <p className="text-xs text-[var(--color-text-secondary)] tabular-nums" aria-live="polite" data-testid="run-count">
              {items.length} run{items.length === 1 ? "" : "s"} shown{runs.hasNextPage ? "" : " · all runs"}
            </p>
            {runs.hasNextPage && (
              <button
                type="button"
                onClick={() => {
                  if (!runs.isFetchingNextPage) void runs.fetchNextPage();
                }}
                aria-disabled={runs.isFetchingNextPage || undefined}
                className="button button--sm button--secondary gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] aria-disabled:opacity-60"
              >
                <ChevronDown className="size-3.5" aria-hidden />
                {runs.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
          {runs.isFetchNextPageError && (
            <p role="alert" className="px-4 pb-3 text-xs text-[var(--color-danger-soft-foreground)]">
              {adminErrorMessage(runs.error)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
