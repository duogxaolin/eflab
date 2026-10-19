// The sync worker's run loop (openspec change admin-sync-worker, design decisions
// 2, 4 and 5; capability data-sync-worker "Run Queue And Exclusion", "Worker
// Liveness", "Sync Schedule").
//
// One tick (`tick`) = write the worker heartbeat → fail stale RUNNING runs
// ("worker restarted") → cancel queued runs whose cancel was requested → queue
// what the schedule makes due (`dueRuns` from @eflab/shared) → claim the oldest
// QUEUED run and execute it. Nothing here starts on import; main.ts owns the
// 30-second loop and the signals, tests call `tick` / `executeRun` directly with
// their own clock, handlers and limits.
//
// Exclusion is the database's job: claiming is a conditional UPDATE
// (QUEUED → RUNNING) and the partial unique index "SyncRun_one_running" rejects
// a second RUNNING row; that unique violation is read as "another run is
// executing", never as an error.
//
// Kind handlers are pluggable (`RunHandler`): CHECK in handlers/check.ts,
// INCREMENTAL in handlers/incremental.ts, FULL in handlers/full.ts.

import { Prisma, type PrismaClientType } from "@eflab/db";
import {
  LogTail,
  SYNC_LOG_TAIL_MAX_BYTES,
  blockedUntilAfter,
  dueRuns,
  isBlocked,
  isStaleRun,
  syncRunStatsSchema,
  type ScheduleConfig,
  type ScheduleRun,
  type SyncKind,
  type SyncRunStats,
  type SyncStatus,
  type SyncTrigger,
} from "@eflab/shared";
import { CHILD_KILL_GRACE_MS, runChild, type ChildResult } from "./child.js";
import type { WorkerEnv } from "./env.js";
import { CANCEL_POLL_MS, CATALOGUE_WRITE_WAIT_MS, RUN_HEARTBEAT_MS, SYNC_TIME_LIMITS_MS, WORKER_TICK_MS } from "./limits.js";

// ---- Limits and intervals (values in limits.ts) ----

export { CANCEL_POLL_MS, CATALOGUE_WRITE_WAIT_MS, RUN_HEARTBEAT_MS, SYNC_TIME_LIMITS_MS, WORKER_TICK_MS };
/** Stored error text bound (characters). */
const ERROR_MAX_CHARS = 4_000;

// ---- Handler contract ----

export interface ClaimedRun {
  id: number;
  kind: SyncKind;
  trigger: SyncTrigger;
  queuedAt: Date;
  startedAt: Date;
}

export type RunOutcome =
  | { status: "OK" }
  | { status: "FAILED"; error: string }
  /** The source refused (403 / 429 / HTML challenge): the run ends BLOCKED and
   *  SyncConfig.blockedUntil = now + 6 h. `reason` names what was seen. */
  | { status: "BLOCKED"; reason: string };

export interface RunContext {
  readonly run: ClaimedRun;
  readonly db: PrismaClientType;
  readonly env: WorkerEnv;
  readonly now: () => Date;
  /** Aborted on cancel, on the kind's time limit and on worker shutdown. Pass it to every fetch / child. */
  readonly signal: AbortSignal;
  /** Statistics stored on the run (validated with syncRunStatsSchema, `.strict()`). */
  stats: SyncRunStats;
  watermarkBefore: Date | null;
  watermarkAfter: Date | null;
  /** Appends one line to the run's log tail (redacted, ≤ 64 KB kept). */
  log(line: string): void;
  /**
   * Runs a write that commits catalogue rows (verify finding W3): refused once
   * the run's signal fired; while `fn` is in flight the runner never releases
   * the run (even after abandoning a handler that ignores its signal, it keeps
   * the run RUNNING and its heartbeat fresh until `fn` settled, at most
   * CATALOGUE_WRITE_WAIT_MS); when `fn` resolves the run counts as committed
   * and is never recorded CANCELLED (a cancel / time limit that lands after the
   * commit is noted in the log, the outcome stays the handler's). `fn` should
   * itself check `signal` before committing (throw → roll back). `waitMs`
   * replaces CATALOGUE_WRITE_WAIT_MS for a longer write (the seed child).
   */
  writeCatalogue<T>(what: string, fn: () => Promise<T>, opts?: { waitMs?: number }): Promise<T>;
  /** Records that catalogue rows were committed (inside a `writeCatalogue` that may still go on, e.g. the seed child). */
  markCommitted(what: string): void;
  /** Writes the current statistics (validated) and log tail to the RUNNING row now — e.g. pending image ids before a write. */
  checkpoint(): Promise<void>;
  /** Runs a child process bound to the run's signal, redactor and log. `onLine`
   *  also receives every (already redacted) line, e.g. to keep the last lines. */
  runChild(
    command: string,
    args: readonly string[],
    opts: { env: Record<string, string>; cwd?: string; timeoutMs?: number; abortable?: boolean; label?: string; onLine?: (stream: "stdout" | "stderr", line: string) => void },
  ): Promise<ChildResult>;
}

export type RunHandler = (ctx: RunContext) => Promise<RunOutcome>;
export type RunHandlers = Readonly<Record<SyncKind, RunHandler>>;

export interface WorkerDeps {
  db: PrismaClientType;
  env: WorkerEnv;
  handlers: RunHandlers;
  now?: () => Date;
  limits?: Partial<Record<SyncKind, number>>;
  runHeartbeatMs?: number;
  cancelPollMs?: number;
  killGraceMs?: number;
  /** Aborted when the worker stops (SIGINT / SIGTERM): the current run ends FAILED "worker stopped". */
  shutdown?: AbortSignal;
  /** The worker's own console output (never receives a secret: callers pass redacted text). */
  log?: (line: string) => void;
}

const nowOf = (d: WorkerDeps) => (d.now ?? (() => new Date()))();
const say = (d: WorkerDeps, line: string) => (d.log ?? ((l: string) => console.log(`[worker] ${l}`)))(d.env.redact(line));

function errorText(env: WorkerEnv, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const t = env.redact(msg);
  return t.length > ERROR_MAX_CHARS ? `${t.slice(0, ERROR_MAX_CHARS)}…` : t;
}

/** Unique violation (the "one RUNNING run" partial index) from Prisma, typed or raw. */
export function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return true;
    if (e.code === "P2010" && /23505|unique/i.test(JSON.stringify(e.meta ?? {}) + e.message)) return true;
  }
  return e instanceof Error && /SyncRun_one_running|23505/.test(e.message);
}

// ---- Heartbeat, recovery, cancel of queued runs ----

export async function writeWorkerHeartbeat(deps: WorkerDeps): Promise<void> {
  await deps.db.syncConfig.update({ where: { id: 1 }, data: { workerHeartbeatAt: nowOf(deps) } });
}

/** RUNNING runs with no heartbeat for 10 minutes → FAILED "worker restarted". Returns their ids. */
export async function recoverStaleRuns(deps: WorkerDeps): Promise<number[]> {
  const now = nowOf(deps);
  const running = await deps.db.syncRun.findMany({
    where: { status: "RUNNING" },
    select: { id: true, heartbeatAt: true, startedAt: true, queuedAt: true },
  });
  const recovered: number[] = [];
  for (const r of running) {
    if (!isStaleRun(r, now)) continue;
    // Conditional on the heartbeat we read: a run that just wrote one is left alone.
    const res = await deps.db.syncRun.updateMany({
      where: { id: r.id, status: "RUNNING", heartbeatAt: r.heartbeatAt },
      data: { status: "FAILED", error: "worker restarted", finishedAt: now },
    });
    if (res.count === 1) {
      recovered.push(r.id);
      say(deps, `run ${r.id}: no heartbeat for 10 minutes → FAILED (worker restarted)`);
    }
  }
  return recovered;
}

/** QUEUED runs whose cancel was requested → CANCELLED without running. */
export async function cancelRequestedQueuedRuns(deps: WorkerDeps): Promise<number> {
  const now = nowOf(deps);
  const res = await deps.db.syncRun.updateMany({
    where: { status: "QUEUED", cancelRequested: true },
    data: { status: "CANCELLED", finishedAt: now, error: "cancelled before it started" },
  });
  return res.count;
}

// ---- Schedule ----

/**
 * Queues what the schedule makes due, inside one transaction that first locks
 * the single SyncConfig row (`SELECT … FOR UPDATE`, released at commit — safe
 * with pooled connections, unlike a session advisory lock) so the decision and
 * the INSERT see the same queue. Every writer of QUEUED rows (the API's
 * `runs.queue` included) must take the same row lock first, otherwise two
 * writers could both pass the "nothing of this group is queued" test.
 */
export async function queueDueRuns(deps: WorkerDeps): Promise<SyncKind[]> {
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM "SyncConfig" WHERE id = 1 FOR UPDATE`;
    if (locked.length !== 1) throw new Error("SyncConfig row 1 is missing (the migration inserts it)");
    const cfg = await tx.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
    const config: ScheduleConfig = {
      enabled: cfg.enabled,
      incrementalIntervalMin: cfg.incrementalIntervalMin,
      fullWeekday: cfg.fullWeekday,
      fullHourUtc: cfg.fullHourUtc,
      blockedUntil: cfg.blockedUntil,
    };
    // Every active run plus the latest-started incremental and full run is all dueRuns reads.
    const runs = await tx.$queryRaw<ScheduleRun[]>`
      SELECT kind::text AS kind, status::text AS status, "queuedAt", "startedAt"
      FROM "SyncRun"
      WHERE status IN ('QUEUED', 'RUNNING')
         OR id IN (
           SELECT DISTINCT ON (kind) id FROM "SyncRun"
           WHERE kind IN ('INCREMENTAL', 'FULL')
           ORDER BY kind, COALESCE("startedAt", "queuedAt") DESC, id DESC
         )`;
    const due = dueRuns(config, runs, now);
    for (const kind of due) await tx.syncRun.create({ data: { kind, trigger: "SCHEDULE", queuedAt: now } });
    return due;
  });
}

// ---- Claim ----

/**
 * While the source is blocked, queued incremental / full runs are ended BLOCKED
 * without any request ("stop everything"); a check may still run (an admin may
 * test whether the block has lifted). Returns their ids.
 */
async function endQueuedSyncRunsWhileBlocked(deps: WorkerDeps): Promise<number[]> {
  const now = nowOf(deps);
  const cfg = await deps.db.syncConfig.findUnique({ where: { id: 1 }, select: { blockedUntil: true } });
  if (!cfg || !isBlocked(cfg.blockedUntil, now)) return [];
  const queued = await deps.db.syncRun.findMany({ where: { status: "QUEUED", kind: { in: ["INCREMENTAL", "FULL"] } }, select: { id: true } });
  const ids: number[] = [];
  for (const q of queued) {
    const res = await deps.db.syncRun.updateMany({
      where: { id: q.id, status: "QUEUED" },
      data: { status: "BLOCKED", finishedAt: now, error: `not started: the source blocked requests until ${cfg.blockedUntil!.toISOString()}` },
    });
    if (res.count === 1) ids.push(q.id);
  }
  return ids;
}

export type ClaimResult = { claimed: ClaimedRun } | { claimed: null; reason: "empty" | "busy" };

/**
 * The claim itself: a conditional `UPDATE … SET status = 'RUNNING' WHERE id = $1
 * AND status = 'QUEUED' AND NOT cancelRequested` (typed Prisma `updateMany`, so
 * no stored time depends on the session TimeZone). "claimed" when it changed the row,
 * "gone" when the row was no longer claimable, "busy" when the partial unique
 * index refused a second RUNNING run.
 */
export async function tryClaim(deps: WorkerDeps, id: number, startedAt: Date): Promise<"claimed" | "gone" | "busy"> {
  try {
    // Typed, not raw SQL (verify finding CR1): a raw Date parameter is a timestamptz that Postgres
    // converts into these `timestamp(3)` columns with the SESSION TimeZone — under America/New_York
    // startedAt was stored 4 h early (back-to-back incrementals, a FULL re-queued in its own window).
    const res = await deps.db.syncRun.updateMany({
      where: { id, status: "QUEUED", cancelRequested: false },
      data: { status: "RUNNING", startedAt, heartbeatAt: startedAt },
    });
    return res.count === 1 ? "claimed" : "gone";
  } catch (e) {
    if (isUniqueViolation(e)) return "busy";
    throw e;
  }
}

/**
 * Claims the oldest QUEUED run (queuedAt, id); "busy" = another run is RUNNING.
 * The RUNNING pre-check only avoids a pointless failing UPDATE on every busy
 * tick — the exclusion itself is the unique index behind `tryClaim`.
 */
export async function claimNextRun(deps: WorkerDeps): Promise<ClaimResult> {
  await endQueuedSyncRunsWhileBlocked(deps);
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await deps.db.syncRun.count({ where: { status: "RUNNING" } })) > 0) return { claimed: null, reason: "busy" };
    const next = await deps.db.syncRun.findFirst({
      where: { status: "QUEUED", cancelRequested: false },
      orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
      select: { id: true, kind: true, trigger: true, queuedAt: true },
    });
    if (!next) return { claimed: null, reason: "empty" };
    const startedAt = nowOf(deps);
    const r = await tryClaim(deps, next.id, startedAt);
    if (r === "claimed") return { claimed: { ...next, startedAt } };
    if (r === "busy") return { claimed: null, reason: "busy" };
    // Cancelled or taken between the read and the update → look again.
  }
  return { claimed: null, reason: "empty" };
}

// ---- Execute ----

function formatLimit(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} h`;
  if (ms % 60_000 === 0) return `${ms / 60_000} min`;
  return `${ms / 1000} s`;
}

export interface ExecutedRun {
  id: number;
  kind: SyncKind;
  status: Exclude<SyncStatus, "QUEUED" | "RUNNING">;
  error: string | null;
}

/** Executes one claimed run with its kind's handler and stores the final state. */
export async function executeRun(deps: WorkerDeps, run: ClaimedRun): Promise<ExecutedRun> {
  const { db, env } = deps;
  const limitMs = deps.limits?.[run.kind] ?? SYNC_TIME_LIMITS_MS[run.kind];
  const grace = deps.killGraceMs ?? CHILD_KILL_GRACE_MS;
  const tail = new LogTail(SYNC_LOG_TAIL_MAX_BYTES, env.redact);
  const stamp = () => nowOf(deps).toISOString();
  const cancel = new AbortController();
  const timeLimit = new AbortController();
  const signals = [cancel.signal, timeLimit.signal];
  if (deps.shutdown) signals.push(deps.shutdown);
  const signal = AbortSignal.any(signals);
  const limitTimer = setTimeout(() => timeLimit.abort(new Error("time limit")), limitMs);
  /** Catalogue writes in flight (writeCatalogue) with how long the runner may wait for each, and the ones that committed. */
  const writes = new Map<Promise<unknown>, number>();
  const committed: string[] = [];

  const ctx: RunContext = {
    run,
    db,
    env,
    now: () => nowOf(deps),
    signal,
    stats: {},
    watermarkBefore: null,
    watermarkAfter: null,
    log: (line) => tail.push(`${stamp()} ${line}`),
    writeCatalogue: async (what, fn, wopts) => {
      if (signal.aborted) throw new Error(`${what}: not started (run aborted)`);
      const p = fn();
      writes.set(p, wopts?.waitMs ?? CATALOGUE_WRITE_WAIT_MS);
      try {
        const v = await p;
        if (!committed.includes(what)) committed.push(what);
        return v;
      } finally {
        writes.delete(p);
      }
    },
    markCommitted: (what) => {
      if (!committed.includes(what)) committed.push(what);
    },
    checkpoint: async () => {
      const parsed = syncRunStatsSchema.safeParse(ctx.stats);
      if (!parsed.success) throw new Error(`internal error: run statistics did not validate at a checkpoint (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")})`);
      const res = await db.syncRun.updateMany({ where: { id: run.id, status: "RUNNING" }, data: { stats: parsed.data as Prisma.InputJsonObject, logTail: tail.toString() } });
      // third verify S4: nothing may go on (e.g. the seed) when the state could not be recorded
      if (res.count !== 1) throw new Error(`checkpoint: run ${run.id} is no longer RUNNING (${res.count} rows updated) — stopped before the next step`);
    },
    runChild: (command, args, opts) => {
      const label = opts.label ?? command.split("/").pop() ?? command;
      return runChild({
        command,
        args,
        env: opts.env,
        cwd: opts.cwd,
        signal,
        abortable: opts.abortable,
        timeoutMs: opts.timeoutMs,
        killGraceMs: grace,
        redact: env.redact,
        onLine: (stream, line) => {
          tail.push(`${stamp()} ${label}${stream === "stderr" ? "!" : ""} ${line}`);
          opts.onLine?.(stream, line);
        },
      });
    },
  };
  ctx.log(`run ${run.id} ${run.kind} (${run.trigger.toLowerCase()}) started; time limit ${formatLimit(limitMs)}`);
  say(deps, `run ${run.id} ${run.kind} started`);

  // While running: poll the cancel flag, keep both heartbeats and the log tail fresh.
  const heartbeatMs = deps.runHeartbeatMs ?? RUN_HEARTBEAT_MS;
  let lastBeat = Date.now();
  let polling = false;
  const poll = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const row = await db.syncRun.findUnique({ where: { id: run.id }, select: { cancelRequested: true, status: true } });
      if (!row || row.status !== "RUNNING" || row.cancelRequested) {
        if (!cancel.signal.aborted) {
          ctx.log(row?.cancelRequested ? "cancel requested by an admin — stopping" : "run is no longer marked running — stopping");
          cancel.abort(new Error("cancel"));
        }
      }
      if (Date.now() - lastBeat >= heartbeatMs) {
        lastBeat = Date.now();
        const at = nowOf(deps);
        await db.$transaction([
          db.syncConfig.update({ where: { id: 1 }, data: { workerHeartbeatAt: at } }),
          db.syncRun.updateMany({ where: { id: run.id, status: "RUNNING" }, data: { heartbeatAt: at, logTail: tail.toString() } }),
        ]);
      }
    } catch (e) {
      say(deps, `run ${run.id}: heartbeat / cancel poll failed: ${errorText(env, e)}`);
    } finally {
      polling = false;
    }
  }, deps.cancelPollMs ?? CANCEL_POLL_MS);

  // A handler that ignores its signal must not hold the run forever: once the
  // signal fires it gets the kill grace period (+5 s) to return — unless a
  // catalogue write is still in flight: then the run stays RUNNING (slot held,
  // heartbeat written by the poll above) until that write settled, at most
  // CATALOGUE_WRITE_WAIT_MS (longer than its transaction can live).
  let outcome: RunOutcome | null = null;
  let thrown: unknown = null;
  let settled = false;
  const handlerDone = (async () => {
    try {
      outcome = await deps.handlers[run.kind](ctx);
    } catch (e) {
      thrown = e;
    } finally {
      settled = true;
    }
  })();
  let abandonTimer: NodeJS.Timeout | undefined;
  const abandoned = new Promise<"abandoned">((res) => {
    const arm = () => (abandonTimer = setTimeout(() => res("abandoned"), grace + 5_000));
    if (signal.aborted) arm();
    else signal.addEventListener("abort", arm, { once: true });
  });
  let raced = await Promise.race([handlerDone.then(() => "done" as const), abandoned]);
  const writeWaitMs = Math.max(0, ...writes.values());
  if (raced === "abandoned" && writes.size > 0) {
    ctx.log(`the handler did not stop within the grace period; a catalogue write is still in flight — the run stays running until it ended (at most ${formatLimit(writeWaitMs)})`);
    let waitTimer: NodeJS.Timeout | undefined;
    const waited = new Promise<void>((r) => (waitTimer = setTimeout(r, writeWaitMs)));
    await Promise.race([Promise.allSettled([...writes.keys()]), waited]);
    // After its write the handler usually returns at once; give it a moment.
    await Promise.race([handlerDone, new Promise((r) => setTimeout(r, 1_000))]);
    clearTimeout(waitTimer);
    if (settled) raced = "done";
  }
  clearInterval(poll);
  clearTimeout(limitTimer);
  clearTimeout(abandonTimer);
  while (polling) await new Promise((r) => setTimeout(r, 20));

  // Final state. An abort decides over whatever the handler returned or threw —
  // except once catalogue rows were committed: such a run is never CANCELLED
  // (it ends with the handler's own outcome, the abort noted in the log).
  const finishedAt = nowOf(deps);
  let status: ExecutedRun["status"];
  let error: string | null = null;
  let blockedReason: string | null = null;
  const result = outcome as RunOutcome | null;
  const abortWhy = cancel.signal.aborted
    ? "cancel requested by an admin"
    : timeLimit.signal.aborted
      ? `time limit of ${formatLimit(limitMs)} exceeded`
      : deps.shutdown?.aborted
        ? "worker stopped"
        : null;
  if (committed.length > 0 && abortWhy !== null) {
    const what = `${abortWhy} after the database write had committed (${committed.join(", ")})`;
    if (writes.size > 0) {
      status = "FAILED";
      error = `${what}; a later catalogue write did not end within ${formatLimit(writeWaitMs)}`;
    } else if (raced === "done" && thrown === null && result?.status === "OK") {
      status = "OK";
      ctx.log(`${what} — the run is recorded with its real outcome (OK), not as cancelled`);
    } else {
      status = "FAILED";
      const rest = raced !== "done" ? "the handler did not stop" : thrown !== null ? errorText(env, thrown) : result === null ? "no outcome" : result.status === "FAILED" ? errorText(env, result.error) : env.redact(result.status === "BLOCKED" ? result.reason : "");
      error = `${what}; then: ${rest}`;
    }
  } else if (writes.size > 0) {
    // Abandoned with a write that outlived its wait (its transaction / child timeout should have ended it long before).
    status = "FAILED";
    error = `${abortWhy ?? "handler did not stop"}; a catalogue write did not end within ${formatLimit(writeWaitMs)}`;
  } else if (cancel.signal.aborted) {
    status = "CANCELLED";
    error = "cancelled by an admin";
  } else if (timeLimit.signal.aborted) {
    status = "FAILED";
    error = `time limit of ${formatLimit(limitMs)} exceeded`;
  } else if (deps.shutdown?.aborted) {
    status = "FAILED";
    error = "worker stopped while the run was executing";
  } else if (raced === "abandoned") {
    status = "FAILED";
    error = "handler did not stop";
  } else if (thrown !== null) {
    status = "FAILED";
    error = errorText(env, thrown);
  } else if (result === null) {
    status = "FAILED";
    error = "handler returned no outcome";
  } else if (result.status === "OK") {
    status = "OK";
  } else if (result.status === "BLOCKED") {
    status = "BLOCKED";
    blockedReason = env.redact(result.reason);
  } else {
    status = "FAILED";
    error = errorText(env, result.error);
  }

  let blockedUntil: Date | null = null;
  if (status === "BLOCKED") {
    blockedUntil = blockedUntilAfter(finishedAt);
    error = `${blockedReason} — the source blocked the request; no request until ${blockedUntil.toISOString()}`;
  }

  ctx.stats.durationMs = Math.max(0, finishedAt.getTime() - run.startedAt.getTime());
  let stats = syncRunStatsSchema.safeParse(ctx.stats);
  if (!stats.success) {
    const keys = stats.error.issues.map((i) => i.path.join(".") || i.message).join(", ");
    ctx.log(`internal error: run statistics did not validate (${keys}); stored without them`);
    if (status === "OK") {
      status = "FAILED";
      error = `internal error: invalid run statistics (${keys})`;
    }
    // Pending image ids survive an invalid statistic elsewhere (the next full run needs them).
    const pending = syncRunStatsSchema.shape.imagesPendingIds.safeParse(ctx.stats.imagesPendingIds);
    stats = syncRunStatsSchema.safeParse({ durationMs: ctx.stats.durationMs, ...(pending.success && pending.data ? { imagesPendingIds: pending.data } : {}) });
  }
  ctx.log(`run ${run.id} ended ${status}${error ? `: ${error}` : ""}`);

  const statsJson = (stats.success ? stats.data : {}) as Prisma.InputJsonObject;
  await db.$transaction(async (tx) => {
    await tx.syncRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: {
        status,
        finishedAt,
        heartbeatAt: finishedAt,
        error,
        logTail: tail.toString(),
        stats: statsJson,
        watermarkBefore: ctx.watermarkBefore,
        watermarkAfter: ctx.watermarkAfter,
      },
    });
    if (blockedUntil) {
      await tx.syncConfig.update({ where: { id: 1 }, data: { blockedUntil, blockedReason: blockedReason!.slice(0, 500) } });
    }
  });
  say(deps, `run ${run.id} ${run.kind} → ${status}${error ? ` (${error})` : ""}`);
  return { id: run.id, kind: run.kind, status, error };
}

// ---- Tick ----

export interface TickResult {
  recovered: number[];
  cancelledQueued: number;
  queued: SyncKind[];
  claim: "empty" | "busy" | "claimed";
  executed: ExecutedRun | null;
}

/** One pass of the worker loop (see the header). */
export async function tick(deps: WorkerDeps): Promise<TickResult> {
  await writeWorkerHeartbeat(deps);
  const recovered = await recoverStaleRuns(deps);
  const cancelledQueued = await cancelRequestedQueuedRuns(deps);
  const queued = await queueDueRuns(deps);
  for (const k of queued) say(deps, `schedule: queued a ${k} run`);
  // A stopping worker starts nothing new (third verify S6): the run stays QUEUED for the next worker.
  if (deps.shutdown?.aborted) return { recovered, cancelledQueued, queued, claim: "busy", executed: null };
  const claim = await claimNextRun(deps);
  if (!claim.claimed) return { recovered, cancelledQueued, queued, claim: claim.reason, executed: null };
  const executed = await executeRun(deps, claim.claimed);
  return { recovered, cancelledQueued, queued, claim: "claimed", executed };
}
