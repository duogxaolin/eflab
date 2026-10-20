"use client";
// Run actions shared by the dashboard and the run detail (openspec change
// admin-sync-worker): the Cancel button and the live-region announcer that
// reads status changes aloud ("Run #12, incremental sync: running").
import { useEffect, useRef, useState } from "react";
import { XCircle } from "lucide-react";
import type { SyncRunSummaryDTO, SyncStatus } from "@eflab/shared";
import { adminErrorMessage, adminTrpc } from "@/lib/admin-trpc";
import { ActionButton } from "./admin-ui";
import { KIND_LABELS, STATUS_LABELS } from "./run-display";

/** Why a run cannot be cancelled now, or null. */
export function cancelBlockedReason(run: SyncRunSummaryDTO | null | undefined): string | null {
  if (!run) return "Nothing to cancel: no run is queued or running.";
  if (run.status !== "QUEUED" && run.status !== "RUNNING") return `Run #${run.id} has finished (${STATUS_LABELS[run.status].toLowerCase()}).`;
  if (run.cancelRequested) return "Cancel requested — the worker stops the run's processes and marks it cancelled (within about 15 s).";
  return null;
}

export function CancelRunButton({
  run,
  onDone,
  label,
}: {
  run: SyncRunSummaryDTO | null | undefined;
  onDone?: (message: string) => void;
  label?: string;
}) {
  const utils = adminTrpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const cancel = adminTrpc.admin.runs.cancel.useMutation({
    onSuccess: (r) => {
      setError(null);
      onDone?.(
        r.status === "CANCELLED"
          ? `Run #${r.id} cancelled.`
          : `Cancel requested for run #${r.id}; the worker stops it within about 15 seconds.`,
      );
    },
    onError: (e) => setError(adminErrorMessage(e)),
    onSettled: () => {
      void utils.admin.dashboard.invalidate();
      void utils.admin.runs.invalidate();
    },
  });
  return (
    <div className="min-w-0 space-y-1">
      <ActionButton
        tone="danger"
        busy={cancel.isPending}
        disabledReason={cancelBlockedReason(run)}
        onClick={() => run && cancel.mutate({ id: run.id })}
      >
        <XCircle className="size-4" aria-hidden />
        {cancel.isPending ? "Cancelling…" : (label ?? (run ? `Cancel run #${run.id}` : "Cancel"))}
      </ActionButton>
      {error && (
        <p role="alert" className="text-[11px] text-[var(--color-accent-danger)] [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Text for a polite live region: announces each run whose status changed since
 * the previous data (and runs that appear while the page is open). The first
 * data only records the statuses — nothing is read on page load.
 */
export function useRunAnnouncer(runs: ReadonlyArray<SyncRunSummaryDTO | null | undefined>, ready: boolean): string {
  const prev = useRef<Map<number, SyncStatus> | null>(null);
  const [message, setMessage] = useState("");
  const key = runs.map((r) => (r ? `${r.id}:${r.status}` : "")).join(",");
  useEffect(() => {
    if (!ready) return;
    const current = new Map<number, SyncStatus>();
    for (const r of runs) if (r) current.set(r.id, r.status);
    const before = prev.current;
    prev.current = current;
    if (!before) return;
    const changes: string[] = [];
    for (const r of runs) {
      if (!r) continue;
      const was = before.get(r.id);
      if (was === r.status) continue;
      changes.push(`Run #${r.id}, ${KIND_LABELS[r.kind].toLowerCase()}: ${STATUS_LABELS[r.status].toLowerCase()}.`);
    }
    if (changes.length > 0) setMessage(changes.join(" "));
    // `key` captures every id/status pair; `runs` itself is a new array on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
  return message;
}
