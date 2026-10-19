// Time limits and intervals of the sync worker (openspec change admin-sync-worker,
// design decisions 4 and 5). Kept free of database imports so tests can pin the
// values without loading @eflab/db.

import type { SyncKind } from "@eflab/shared";

/** Wall-clock limit per run kind (design decision 5). */
export const SYNC_TIME_LIMITS_MS: Readonly<Record<SyncKind, number>> = {
  CHECK: 30_000,
  INCREMENTAL: 30 * 60_000,
  FULL: 6 * 60 * 60_000,
};
/** Idle tick period (design decision 4); ticks start this often. */
export const WORKER_TICK_MS = 30_000;
/** While a run executes: both heartbeats + the log tail are written this often (< 30 s). */
export const RUN_HEARTBEAT_MS = 10_000;
/** While a run executes: `cancelRequested` is read this often (cancel → children end ≤ ~12 s). */
export const CANCEL_POLL_MS = 2_000;
/** Interactive transaction limits of the incremental run's catalogue write (Prisma rolls it back past them). */
export const CATALOGUE_WRITE_TX_TIMEOUT_MS = 10 * 60_000;
export const CATALOGUE_WRITE_TX_MAX_WAIT_MS = 30_000;
/**
 * How long the runner keeps an abandoned run RUNNING (its slot held, heartbeat
 * written) while a catalogue write is still in flight (verify finding W3).
 * Longer than the transaction can live (max wait + timeout), so the slot is
 * released only once the database work really ended.
 */
export const CATALOGUE_WRITE_WAIT_MS = CATALOGUE_WRITE_TX_MAX_WAIT_MS + CATALOGUE_WRITE_TX_TIMEOUT_MS + 60_000;
/**
 * The full run's seed child is never stopped by a cancel / time limit / worker
 * stop once it started (verify finding W-d: killing it half-way gave CANCELLED
 * or an unknown commit); it ends on its own or after this limit (the seed's own
 * transaction timeout is 60 min). The runner holds the run that long at most.
 */
export const SEED_CHILD_TIMEOUT_MS = 70 * 60_000;
export const SEED_WRITE_WAIT_MS = SEED_CHILD_TIMEOUT_MS + 10_000 + 60_000;
