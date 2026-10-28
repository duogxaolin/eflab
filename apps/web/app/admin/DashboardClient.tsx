"use client";
// /admin — sync dashboard (openspec change admin-sync-worker, data-sync-worker
// "Admin Dashboard Behaviour", design decision 10). Worker state, warnings
// (blocked by the source, worker offline), the run buttons, the queued /
// running runs with Cancel, the last run, the next scheduled runs, the newest
// card, the card-image version (read-only information — the worker raises it
// itself; openspec change auto-image-version, design D7) and the schedule form.
//
// Refresh: every 3 s while a run is queued or running, every 30 s otherwise —
// only while the tab is visible (a hidden tab polls nothing and refetches once
// when it becomes visible again). The API decides every refusal (409 already
// queued / running, 412 blocked, 403 CSRF); the buttons mirror those rules
// from the data they have and show why they are unusable.
//
// openspec change admin-sync-live-progress (design D6): every queued / running
// run shows its phase, progress bar and counters so far (RunProgress); after a
// run is queued the feedback links to its page; the schedule form has interval
// presets (15 min … 24 hours) that fill the minutes field (`aria-pressed` on the
// preset of the current value) — Save as before.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, Image as ImageIcon, Play, RefreshCw, Server, ShieldAlert, Zap } from "lucide-react";
import type { SyncConfigDTO, SyncConfigUpdateInput, SyncDashboardDTO, SyncKind } from "@eflab/shared";
import { SYNC_INTERVAL_MAX_MINUTES, SYNC_INTERVAL_MIN_MINUTES, isBlocked } from "@eflab/shared/sync";
import { syncConfigUpdateInput } from "@eflab/shared/schemas";
import { adminErrorMessage, adminTrpc } from "@/lib/admin-trpc";
import { Modal } from "@/components/filters/Modal";
import { AdminShell } from "@/components/admin/AdminShell";
import { ACTIVE_POLL_MS, ActionButton, Notice, Panel, useDocumentVisible } from "@/components/admin/admin-ui";
import { RunSummary, runHref } from "@/components/admin/RunSummary";
import { RunProgress } from "@/components/admin/RunProgress";
import { CancelRunButton, useRunAnnouncer } from "@/components/admin/run-actions";
import { SYNC_INTERVAL_PRESETS } from "@eflab/shared/sync-records";
import {
  IMAGE_VERSION_NOTE,
  KIND_LABELS,
  STATUS_LABELS,
  WEEKDAY_LABELS,
  formatRelative,
  formatUtcDateTime,
} from "@/components/admin/run-display";

const IDLE_POLL_MS = 30_000;

export function DashboardClient() {
  return <AdminShell>{() => <Dashboard />}</AdminShell>;
}

type Feedback = { tone: "ok" | "error"; text: string; runId?: number } | null;

function Dashboard() {
  const visible = useDocumentVisible();
  const dashboard = adminTrpc.admin.dashboard.useQuery(undefined, {
    refetchInterval: (q) => {
      if (!visible) return false;
      return (q.state.data?.activeRuns.length ?? 0) > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });

  // Back to a visible tab: refresh at once (nothing was polled while hidden).
  const wasVisible = useRef(visible);
  const refetch = dashboard.refetch;
  useEffect(() => {
    if (visible && !wasVisible.current) void refetch();
    wasVisible.current = visible;
  }, [visible, refetch]);

  const data = dashboard.data;
  const announcement = useRunAnnouncer(data ? [...data.activeRuns, data.lastRun] : [], Boolean(data));

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Sync dashboard</h1>
        <p className="text-xs text-[var(--color-text-secondary)] sm:text-sm">
          Keeps the catalogue current with efootbase: the worker checks the source and syncs new cards on the schedule below.
        </p>
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="run-announcer">
        {announcement}
      </p>
      {dashboard.isPending ? (
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-panel)]/60" aria-busy="true" aria-label="Loading the dashboard" />
      ) : data === undefined ? (
        <div role="alert" className="rounded-xl border border-[var(--color-accent-danger)]/50 bg-[var(--color-accent-danger)]/10 p-4 text-sm text-white">
          <p>{adminErrorMessage(dashboard.error)}</p>
          <button
            type="button"
            onClick={() => void dashboard.refetch()}
            className="button button--sm button--secondary mt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {dashboard.isError && (
            <p role="alert" className="text-xs text-[var(--color-danger-soft-foreground)]">
              Could not refresh: {adminErrorMessage(dashboard.error)} The values below are from the last successful update.
            </p>
          )}
          <DashboardBody data={data} updatedAt={dashboard.dataUpdatedAt} polling={visible} />
        </>
      )}
    </div>
  );
}

function DashboardBody({ data, updatedAt, polling }: { data: SyncDashboardDTO; updatedAt: number; polling: boolean }) {
  const now = updatedAt || Date.now();
  const { config } = data;
  const blocked = config.blockedUntil !== null && isBlocked(new Date(config.blockedUntil), new Date(now));
  const active = data.activeRuns;
  const activePolling = polling && active.length > 0;

  return (
    <div className="min-w-0 space-y-6">
      <p className="text-[11px] text-[var(--color-text-dim)]" data-testid="refresh-state">
        Updated {formatUtcDateTime(new Date(now).toISOString())} ·{" "}
        {!polling
          ? "refresh paused while this tab is hidden"
          : activePolling
            ? "refreshing every 3 s while a run is queued or running"
            : "refreshing every 30 s"}
      </p>

      {blocked && (
        <Notice tone="danger" title="efootbase blocked our requests" icon={<ShieldAlert className="size-4 text-[var(--color-danger-soft-foreground)]" aria-hidden />} testId="blocked-banner">
          <p>
            The source refused a request{config.blockedReason ? ` (${config.blockedReason})` : ""}. Until{" "}
            <strong className="text-white">{formatUtcDateTime(config.blockedUntil)}</strong> the worker sends nothing, the schedule
            queues nothing and incremental or full syncs are refused. A check can still be queued. The block is never bypassed.
          </p>
        </Notice>
      )}

      {!data.workerOnline && (
        <Notice tone="warn" title="The worker is offline" icon={<AlertTriangle className="size-4 text-[var(--color-accent-warn)]" aria-hidden />} testId="worker-offline">
          <p>
            {config.workerHeartbeatAt
              ? `No heartbeat for ${formatRelative(config.workerHeartbeatAt, now).replace(/ ago$/, "")} (last ${formatUtcDateTime(config.workerHeartbeatAt)}).`
              : "The worker has never written a heartbeat."}{" "}
            Queued runs wait until the worker runs again — start it on the worker host with{" "}
            <code className="font-mono text-white">pnpm worker:start</code>.
          </p>
        </Notice>
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkerPanel data={data} now={now} />
        <NextRunsPanel data={data} now={now} blocked={blocked} />
        <NewestCardPanel data={data} />
        <ImageVersionPanel data={data} />
      </div>

      <ActionsPanel data={data} blocked={blocked} />

      <Panel title={`Queued and running (${active.length})`}>
        {active.length === 0 ? (
          <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
            <p className="text-xs text-[var(--color-text-secondary)]">No run is queued or running.</p>
            <CancelRunButton run={null} label="Cancel" />
          </div>
        ) : (
          <ul className="min-w-0 divide-y divide-[var(--color-line-separator)]">
            {active.map((run) => (
              <li key={run.id} className="grid min-w-0 gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_14rem] sm:items-start">
                <div className="min-w-0 space-y-3" data-testid="active-run" data-run-id={run.id}>
                  <RunSummary run={run} waitingForWorker={!data.workerOnline} />
                  <RunProgress run={run} waitingForWorker={!data.workerOnline} compact />
                  <Link
                    href={runHref(run.id)}
                    className="inline-block text-xs font-medium text-[var(--color-text-secondary)] underline-offset-2 hover:text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    Open run #{run.id} — progress and what it downloads →
                  </Link>
                </div>
                <CancelRunButton run={run} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Last finished run"
        actions={
          <Link href="/admin/runs" className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
            Run history →
          </Link>
        }
      >
        {data.lastRun ? <RunSummary run={data.lastRun} /> : <p className="text-xs text-[var(--color-text-secondary)]">No run has finished yet.</p>}
      </Panel>

      <ScheduleForm config={config} />
    </div>
  );
}

function WorkerPanel({ data, now }: { data: SyncDashboardDTO; now: number }) {
  const hb = data.config.workerHeartbeatAt;
  return (
    <Panel title="Worker">
      <div className="space-y-2" data-testid="worker-state">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Server className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
          <span
            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
              data.workerOnline
                ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "border-[var(--color-accent-danger)]/50 bg-[var(--color-accent-danger)]/15 text-[var(--color-danger-soft-foreground)]"
            }`}
          >
            {data.workerOnline ? "Online" : "Offline"}
          </span>
        </p>
        <p className="text-xs text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
          Last heartbeat: {hb ? `${formatRelative(hb, now)} · ${formatUtcDateTime(hb)}` : "never"}
        </p>
        <p className="text-[11px] text-[var(--color-text-dim)]">Online while its heartbeat is younger than 2 minutes.</p>
      </div>
    </Panel>
  );
}

function NextRunsPanel({ data, now, blocked }: { data: SyncDashboardDTO; now: number; blocked: boolean }) {
  const { config, next } = data;
  const activeSync = data.activeRuns.find((r) => r.kind !== "CHECK");
  const line = (label: string, iso: string | null) => (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="text-xs font-medium text-white tabular-nums [overflow-wrap:anywhere]">
        {iso ? (
          <>
            {formatUtcDateTime(iso)} <span className="text-[var(--color-text-dim)]">({formatRelative(iso, now)})</span>
          </>
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
  return (
    <Panel title="Next scheduled runs">
      {!config.enabled ? (
        <p className="text-xs text-[var(--color-text-secondary)]" data-testid="next-runs">
          The schedule is off — only manual runs are made.
        </p>
      ) : (
        <div className="space-y-2" data-testid="next-runs">
          <dl className="space-y-1.5">
            {line("Incremental", next.incremental)}
            {line("Full", next.full)}
          </dl>
          {activeSync && <p className="text-[11px] text-[var(--color-text-dim)]">Once run #{activeSync.id} has finished.</p>}
          {blocked && <p className="text-[11px] text-[var(--color-accent-warn)]">Not before the block ends.</p>}
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Incremental every {config.incrementalIntervalMin} min; full on {WEEKDAY_LABELS[config.fullWeekday] ?? "?"}s from{" "}
            {String(config.fullHourUtc).padStart(2, "0")}:00 UTC.
          </p>
        </div>
      )}
    </Panel>
  );
}

function NewestCardPanel({ data }: { data: SyncDashboardDTO }) {
  const card = data.newestCard;
  return (
    <Panel title="Newest card in the database">
      {card ? (
        <div className="space-y-1.5" data-testid="newest-card">
          <Link
            href={`/players/${card.baseId}/${card.id}`}
            className="block text-sm font-semibold text-white hover:text-[var(--color-accent)] [overflow-wrap:anywhere]"
          >
            {card.name}
          </Link>
          <p className="text-xs text-[var(--color-text-secondary)]">Released {formatUtcDateTime(card.releaseAt)}</p>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            An incremental sync reads cards released since this time minus 7 days.
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-secondary)]" data-testid="newest-card">
          No card in the database has a release date.
        </p>
      )}
    </Panel>
  );
}

/**
 * The card-image version, read-only (openspec change auto-image-version,
 * design D7): the stored value, or "Default in use" while nothing is stored,
 * and the latest run that replaced card images as a plain information line —
 * no warning role, no instruction (the worker raised the version itself).
 */
function ImageVersionPanel({ data }: { data: SyncDashboardDTO }) {
  const { current, lastReplacingRun: last } = data.imageVersion;
  return (
    <Panel title="Card image version">
      <div className="space-y-2" data-testid="image-version" data-image-version={current ?? ""}>
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <ImageIcon className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
          {current ? (
            <code className="font-mono tabular-nums">{current}</code>
          ) : (
            <span>Default in use</span>
          )}
        </p>
        <p className="text-xs text-[var(--color-text-secondary)] [overflow-wrap:anywhere]" data-testid="image-version-last-run">
          {last ? (
            <>
              <Link href={runHref(last.runId)} className="font-semibold text-white underline-offset-2 hover:underline">
                Run #{last.runId}
              </Link>{" "}
              replaced <strong className="text-white tabular-nums">{last.count.toLocaleString("en-US")}</strong> card image{last.count === 1 ? "" : "s"} on R2
              {last.finishedAt ? ` (finished ${formatUtcDateTime(last.finishedAt)})` : ""}
              {last.raisedTo ? (
                <>
                  {" "}
                  and raised the version to <code className="font-mono tabular-nums text-white">{last.raisedTo}</code>.
                </>
              ) : (
                " — from before the version was raised automatically."
              )}
            </>
          ) : current ? (
            "No finished run has replaced a card image."
          ) : (
            "No version is stored yet: the web app uses its built-in default until a run replaces card images."
          )}
        </p>
        <p className="text-[11px] text-[var(--color-text-dim)]">{IMAGE_VERSION_NOTE}</p>
      </div>
    </Panel>
  );
}

function ActionsPanel({ data, blocked }: { data: SyncDashboardDTO; blocked: boolean }) {
  const utils = adminTrpc.useUtils();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const queue = adminTrpc.admin.runs.queue.useMutation({
    onSuccess: (run) =>
      setFeedback({
        tone: "ok",
        text: `${KIND_LABELS[run.kind]} queued as run #${run.id}${
          data.workerOnline ? "." : " — the worker is offline, so it waits until the worker runs again."
        }`,
        runId: run.id,
      }),
    onError: (e) => setFeedback({ tone: "error", text: adminErrorMessage(e) }),
    onSettled: () => {
      void utils.admin.dashboard.invalidate();
      void utils.admin.runs.list.invalidate();
    },
  });
  const pendingKind: SyncKind | null = queue.isPending ? (queue.variables?.kind ?? null) : null;
  const start = (kind: SyncKind) => {
    setFeedback(null);
    queue.mutate({ kind });
  };

  const activeCheck = data.activeRuns.find((r) => r.kind === "CHECK");
  const activeSync = data.activeRuns.find((r) => r.kind !== "CHECK");
  const busyReason = queue.isPending ? "Queuing a run…" : null;
  const syncBusy = activeSync
    ? `${KIND_LABELS[activeSync.kind]} #${activeSync.id} is ${STATUS_LABELS[activeSync.status].toLowerCase()} — one sync at a time.`
    : null;
  const blockedReason = blocked
    ? `Refused until ${formatUtcDateTime(data.config.blockedUntil)}: efootbase blocked our requests. Only a check can be queued.`
    : null;
  const checkReason = busyReason ?? (activeCheck ? `API check #${activeCheck.id} is already ${STATUS_LABELS[activeCheck.status].toLowerCase()}.` : null);
  const incrementalReason =
    busyReason ??
    syncBusy ??
    blockedReason ??
    (data.newestCardReleaseAt === null
      ? "No card in the database has a release date, so an incremental sync has no starting point — run a full sync."
      : null);
  const fullReason = busyReason ?? syncBusy ?? blockedReason;

  return (
    <Panel title="Run now">
      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <ActionButton
          onClick={() => start("CHECK")}
          disabledReason={checkReason}
          busy={pendingKind === "CHECK"}
          hint="One request to efootbase (newest card first); writes nothing."
        >
          <Activity className="size-4" aria-hidden />
          {pendingKind === "CHECK" ? "Queuing…" : "Check API"}
        </ActionButton>
        <ActionButton
          tone="primary"
          onClick={() => start("INCREMENTAL")}
          disabledReason={incrementalReason}
          busy={pendingKind === "INCREMENTAL"}
          hint="New cards since the newest one here (minus 7 days) and their images. Stat edits to older cards are only seen by a full sync."
        >
          <Zap className="size-4" aria-hidden />
          {pendingKind === "INCREMENTAL" ? "Queuing…" : "Incremental sync"}
        </ActionButton>
        <ActionButton
          onClick={() => setConfirmFull(true)}
          disabledReason={fullReason}
          busy={pendingKind === "FULL"}
          haspopup
          hint="Every card, the seed and changed images. Heavy — asks for confirmation."
        >
          <RefreshCw className="size-4" aria-hidden />
          {pendingKind === "FULL" ? "Queuing…" : "Full sync…"}
        </ActionButton>
      </div>
      <div
        role={feedback?.tone === "error" ? "alert" : "status"}
        aria-live="polite"
        data-testid="action-feedback"
        className={`mt-3 text-xs [overflow-wrap:anywhere] empty:hidden ${
          feedback?.tone === "error" ? "text-[var(--color-danger-soft-foreground)]" : "text-[var(--color-accent)]"
        }`}
      >
        {feedback?.text}
        {feedback?.runId !== undefined && (
          <>
            {" "}
            <Link
              href={runHref(feedback.runId)}
              data-testid="queued-run-link"
              className="font-semibold text-white underline underline-offset-2 hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Open run #{feedback.runId} to follow its progress
            </Link>
          </>
        )}
      </div>

      <Modal
        open={confirmFull}
        onClose={() => setConfirmFull(false)}
        title="Start a full sync?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmFull(false)}
              className="button button--sm button--secondary rounded-full px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmFull(false);
                start("FULL");
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-[var(--color-accent-foreground)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Play className="size-3.5" aria-hidden />
              Queue full sync
            </button>
          </>
        }
      >
        <div className="space-y-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          <p>A full sync is heavy. The worker:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>downloads every card from efootbase (about 50,000 rows over hundreds of pages, at most 4 requests at a time);</li>
            <li>runs the seed in one transaction that holds database locks for minutes;</li>
            <li>compares every changed card&apos;s image with the bucket and uploads new and changed images.</li>
          </ul>
          <p>It can take an hour or more. Take a database backup (pg_dump) before the first one. Nothing is queued until you confirm.</p>
        </div>
      </Modal>
    </Panel>
  );
}

// ---- Schedule form ----

type Draft = { enabled: boolean; interval: string; weekday: string; hour: string };
type FieldErrors = Partial<Record<"interval" | "weekday" | "hour", string>>;

const draftOf = (c: Pick<SyncConfigDTO, "enabled" | "incrementalIntervalMin" | "fullWeekday" | "fullHourUtc">): Draft => ({
  enabled: c.enabled,
  interval: String(c.incrementalIntervalMin),
  weekday: String(c.fullWeekday),
  hour: String(c.fullHourUtc),
});
const sameDraft = (a: Draft, b: Draft) =>
  a.enabled === b.enabled && a.interval.trim() === b.interval.trim() && a.weekday === b.weekday && a.hour === b.hour;

const INTERVAL_MESSAGE = `Enter a whole number of minutes from ${SYNC_INTERVAL_MIN_MINUTES} to ${SYNC_INTERVAL_MAX_MINUTES}.`;

/** Client validation with the API's own schema (`syncConfigUpdateInput`), messages per field. */
function parseDraft(d: Draft): { value: SyncConfigUpdateInput | null; errors: FieldErrors } {
  const interval = d.interval.trim();
  const toInt = (s: string) => (/^-?\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
  const parsed = syncConfigUpdateInput.safeParse({
    enabled: d.enabled,
    incrementalIntervalMin: toInt(interval),
    fullWeekday: toInt(d.weekday),
    fullHourUtc: toInt(d.hour),
  });
  if (parsed.success) return { value: parsed.data, errors: {} };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "incrementalIntervalMin") errors.interval = INTERVAL_MESSAGE;
    else if (field === "fullWeekday") errors.weekday = "Choose a weekday.";
    else if (field === "fullHourUtc") errors.hour = "Choose an hour from 00:00 to 23:00 UTC.";
  }
  return { value: null, errors };
}

function ScheduleForm({ config }: { config: SyncConfigDTO }) {
  const utils = adminTrpc.useUtils();
  const ids = { enabled: useId(), interval: useId(), weekday: useId(), hour: useId(), intervalHelp: useId() };
  const serverDraft = draftOf(config);
  const [draft, setDraft] = useState<Draft>(serverDraft);
  // The stored values the draft started from: a poll that brings new stored
  // values replaces the draft only while it is untouched (typing is never lost).
  const base = useRef<Draft>(serverDraft);
  const serverKey = JSON.stringify(serverDraft);
  useEffect(() => {
    const next = JSON.parse(serverKey) as Draft;
    setDraft((d) => (sameDraft(d, base.current) ? next : d));
    base.current = next;
  }, [serverKey]);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const intervalRef = useRef<HTMLInputElement>(null);

  const update = adminTrpc.admin.config.update.useMutation({
    onSuccess: (saved) => {
      const next = draftOf(saved);
      base.current = next;
      setDraft(next);
      setStatus({ tone: "ok", text: "Schedule saved." });
      void utils.admin.dashboard.invalidate();
    },
    onError: (e) => setStatus({ tone: "error", text: adminErrorMessage(e) }),
  });

  const dirty = !sameDraft(draft, serverDraft);
  const saveReason = update.isPending ? "Saving…" : !dirty ? "No changes to save." : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (update.isPending || !dirty) return;
    const { value, errors: found } = parseDraft(draft);
    setErrors(found);
    if (!value) {
      setStatus({ tone: "error", text: "Fix the highlighted field before saving." });
      if (found.interval) intervalRef.current?.focus();
      return;
    }
    setStatus(null);
    update.mutate(value);
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
    if (key !== "enabled") setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const inputClass =
    "h-10 w-full rounded-lg border bg-[var(--color-canvas)] px-3 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40";
  const border = (bad: boolean) => (bad ? "border-[var(--color-accent-danger)]" : "border-[var(--color-line)] focus:border-[var(--color-accent)]");
  const label = "text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]";

  return (
    <Panel title="Schedule">
      <form onSubmit={submit} noValidate className="min-w-0 space-y-4" data-testid="schedule-form">
        <div className="flex items-start gap-3">
          <input
            id={ids.enabled}
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
          />
          <label htmlFor={ids.enabled} className="min-w-0 text-sm text-white">
            Run the schedule
            <span className="block text-xs text-[var(--color-text-secondary)]">
              When off, nothing is queued automatically; the buttons above still work.
            </span>
          </label>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={ids.interval} className={label}>
              Incremental every (minutes)
            </label>
            <input
              ref={intervalRef}
              id={ids.interval}
              type="number"
              inputMode="numeric"
              min={SYNC_INTERVAL_MIN_MINUTES}
              max={SYNC_INTERVAL_MAX_MINUTES}
              step={1}
              value={draft.interval}
              onChange={(e) => set("interval", e.target.value)}
              aria-invalid={errors.interval ? true : undefined}
              aria-describedby={ids.intervalHelp}
              className={`${inputClass} ${border(Boolean(errors.interval))}`}
            />
            <p id={ids.intervalHelp} className={`text-[11px] ${errors.interval ? "text-[var(--color-danger-soft-foreground)]" : "text-[var(--color-text-dim)]"}`}>
              {errors.interval ?? `${SYNC_INTERVAL_MIN_MINUTES}–${SYNC_INTERVAL_MAX_MINUTES} (60 = hourly, the default).`}
            </p>
            <div role="group" aria-label="Interval presets" className="flex min-w-0 flex-wrap gap-1.5 pt-0.5" data-testid="interval-presets">
              {SYNC_INTERVAL_PRESETS.map((p) => {
                const pressed = draft.interval.trim() === String(p.minutes);
                return (
                  <button
                    key={p.minutes}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => set("interval", String(p.minutes))}
                    className={`button button--sm rounded-full px-2.5 text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                      pressed
                        ? "bg-[var(--color-accent)] font-bold text-[var(--color-accent-foreground)]"
                        : "button--secondary text-[var(--color-text-secondary)] hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={ids.weekday} className={label}>
              Full sync day (UTC)
            </label>
            <select
              id={ids.weekday}
              value={draft.weekday}
              onChange={(e) => set("weekday", e.target.value)}
              aria-invalid={errors.weekday ? true : undefined}
              className={`${inputClass} ${border(Boolean(errors.weekday))}`}
            >
              {WEEKDAY_LABELS.map((d, i) => (
                <option key={d} value={String(i)}>
                  {d}
                </option>
              ))}
            </select>
            {errors.weekday && <p className="text-[11px] text-[var(--color-danger-soft-foreground)]">{errors.weekday}</p>}
          </div>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={ids.hour} className={label}>
              Full sync hour (UTC)
            </label>
            <select
              id={ids.hour}
              value={draft.hour}
              onChange={(e) => set("hour", e.target.value)}
              aria-invalid={errors.hour ? true : undefined}
              className={`${inputClass} ${border(Boolean(errors.hour))}`}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
            {errors.hour && <p className="text-[11px] text-[var(--color-danger-soft-foreground)]">{errors.hour}</p>}
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-dim)]">
          The full sync is due once in the hour that starts at the chosen time each week.{" "}
          {config.updatedBy ? `Last changed ${formatUtcDateTime(config.updatedAt)} by ${config.updatedBy}.` : "Not changed since setup (defaults)."}
        </p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[12rem_1fr] sm:items-start">
          <SubmitButton reason={saveReason} />
          <div
            role={status?.tone === "error" ? "alert" : "status"}
            aria-live="polite"
            data-testid="schedule-status"
            className={`text-xs [overflow-wrap:anywhere] empty:hidden sm:pt-2.5 ${
              status?.tone === "error" ? "text-[var(--color-danger-soft-foreground)]" : "text-[var(--color-accent)]"
            }`}
          >
            {status?.text}
          </div>
        </div>
      </form>
    </Panel>
  );
}

function SubmitButton({ reason }: { reason: string | null }) {
  const noteId = useId();
  return (
    <div className="min-w-0 space-y-1">
      <button
        type="submit"
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? noteId : undefined}
        className="button button--md w-full bg-[var(--color-accent)] font-bold text-[var(--color-accent-foreground)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        Save schedule
      </button>
      {reason && (
        <p id={noteId} className="text-[11px] text-[var(--color-text-dim)]">
          {reason}
        </p>
      )}
    </div>
  );
}
