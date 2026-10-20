// adminRouter — the private admin area's API (openspec change admin-sync-worker,
// capabilities admin-access and data-sync-worker). Separate from the visitor
// `auth` router: own table (Admin / AdminSession), own cookie (`eflab_admin`),
// own guard (adminProcedure: 401 without an admin session, CSRF guard on every
// mutation, `Cache-Control: no-store`).
//
//   signIn / signOut / me            the admin session
//   config.get / config.update       the single SyncConfig row (schedule)
//   runs.queue / runs.cancel         the SyncRun queue (the worker executes runs)
//   runs.list / runs.get             run history (cursor pages, newest first) and one run
//   dashboard                        worker state, last / active / next runs, newest card
//
// Sign-in failure is always UNAUTHORIZED "Wrong user name or password" — unknown
// name, wrong password, locked account and disabled account alike — and every
// path runs one full scrypt (the dummy hash for an unknown name). Responses
// never carry the hash, the token or its digest: every query below uses an
// explicit `select`, and a relation to Admin selects `username` only.
//
// The API never runs a sync and holds no efootbase or R2 secret: it only writes
// QUEUED rows and cancel requests; apps/worker executes them.
import { TRPCError } from "@trpc/server";
import { prisma, Prisma } from "@eflab/db";
import {
  adminSessionDigest,
  generateAdminSessionToken,
  verifyAdminPassword,
  verifyAgainstDummyHash,
  warmUpAdminAuth,
} from "@eflab/db/admin-auth";
import {
  ACTIVE_SYNC_STATUSES,
  SYNC_KINDS,
  adminSignInInput,
  isBlocked,
  isWorkerOnline,
  nextScheduledRuns,
  publicRunStats,
  syncConfigUpdateInput,
  syncKindGroup,
  syncQueueInput,
  syncRunIdInput,
  syncRunStatsSchema,
  syncRunsListInput,
  type AdminMeDTO,
  type ScheduleRun,
  type SyncConfigDTO,
  type SyncDashboardDTO,
  type SyncKind,
  type SyncRunDTO,
  type SyncRunStats,
  type SyncRunSummaryDTO,
  type SyncRunsPageDTO,
  type SyncStatus,
} from "@eflab/shared";
import { router, adminProcedure, adminPublicProcedure } from "../trpc.js";
import {
  ADMIN_ABSOLUTE_MS,
  ADMIN_IDLE_MS,
  ADMIN_LOCK_MS,
  ADMIN_LOCK_THRESHOLD,
  ADMIN_SIGN_IN_FAILED,
  AddressLimiter,
  clearAdminCookie,
  setAdminCookie,
} from "../../auth/admin.js";

// Built ahead of the first sign-in so an unknown name costs the same as a known one from the start.
void warmUpAdminAuth();

const addressLimiter = new AddressLimiter();

const signInFailed = () => new TRPCError({ code: "UNAUTHORIZED", message: ADMIN_SIGN_IN_FAILED });

function toMe(a: { id: number; username: string; createdAt: Date; lastLoginAt: Date | null }): AdminMeDTO {
  return {
    id: a.id,
    username: a.username,
    createdAt: a.createdAt.toISOString(),
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
  };
}

// ---- Schedule and runs ----

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const ACTIVE: SyncStatus[] = [...ACTIVE_SYNC_STATUSES];
const KIND_LABEL: Record<SyncKind, string> = { CHECK: "A check", INCREMENTAL: "An incremental sync", FULL: "A full sync" };

type Warn = (runId: number, message: string) => void;

const missingConfig = () =>
  new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "The SyncConfig row (id 1) is missing — apply migration 20261019230000_admin_sync_worker",
  });

const configSelect = {
  enabled: true,
  incrementalIntervalMin: true,
  fullWeekday: true,
  fullHourUtc: true,
  blockedUntil: true,
  blockedReason: true,
  workerHeartbeatAt: true,
  updatedAt: true,
  updatedBy: { select: { username: true } },
} satisfies Prisma.SyncConfigSelect;
type ConfigRow = Prisma.SyncConfigGetPayload<{ select: typeof configSelect }>;

function toConfig(c: ConfigRow): SyncConfigDTO {
  return {
    enabled: c.enabled,
    incrementalIntervalMin: c.incrementalIntervalMin,
    fullWeekday: c.fullWeekday,
    fullHourUtc: c.fullHourUtc,
    blockedUntil: iso(c.blockedUntil),
    blockedReason: c.blockedReason,
    workerHeartbeatAt: iso(c.workerHeartbeatAt),
    updatedAt: c.updatedAt.toISOString(),
    updatedBy: c.updatedBy?.username ?? null,
  };
}

async function readConfig(): Promise<ConfigRow> {
  const row = await prisma.syncConfig.findUnique({ where: { id: 1 }, select: configSelect });
  if (!row) throw missingConfig();
  return row;
}

const runSummarySelect = {
  id: true,
  kind: true,
  trigger: true,
  status: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  cancelRequested: true,
  error: true,
  stats: true,
  watermarkBefore: true,
  watermarkAfter: true,
  requestedBy: { select: { username: true } },
} satisfies Prisma.SyncRunSelect;
const runDetailSelect = { ...runSummarySelect, logTail: true } satisfies Prisma.SyncRunSelect;
type RunSummaryRow = Prisma.SyncRunGetPayload<{ select: typeof runSummarySelect }>;
type RunDetailRow = Prisma.SyncRunGetPayload<{ select: typeof runDetailSelect }>;

/**
 * The stored statistics, validated with the strict shared schema. A value that
 * fails it (an unlisted key, a negative count…) is withheld as `{}` with
 * `statsInvalid: true` and logged — never passed through, never repaired.
 */
function statsOf(runId: number, raw: Prisma.JsonValue, warn: Warn): { stats: SyncRunStats; statsInvalid: boolean } {
  const parsed = syncRunStatsSchema.safeParse(raw);
  // The worker's pending image ids stay in the database; the API sends their number only.
  if (parsed.success) return { stats: publicRunStats(parsed.data), statsInvalid: false };
  warn(runId, "stored SyncRun.stats do not match syncRunStatsSchema — withheld from the admin API");
  return { stats: {}, statsInvalid: true };
}

function toRunSummary(r: RunSummaryRow, warn: Warn): SyncRunSummaryDTO {
  return {
    id: r.id,
    kind: r.kind,
    trigger: r.trigger,
    status: r.status,
    requestedBy: r.requestedBy?.username ?? null,
    queuedAt: r.queuedAt.toISOString(),
    startedAt: iso(r.startedAt),
    finishedAt: iso(r.finishedAt),
    cancelRequested: r.cancelRequested,
    error: r.error,
    ...statsOf(r.id, r.stats, warn),
    watermarkBefore: iso(r.watermarkBefore),
    watermarkAfter: iso(r.watermarkAfter),
  };
}

function toRunDetail(r: RunDetailRow, warn: Warn): SyncRunDTO {
  return { ...toRunSummary(r, warn), logTail: r.logTail };
}

/** Fastify's request logger, bound to the run id (no stats content is logged). */
function warnerFor(log: { warn: (obj: object, msg: string) => void }): Warn {
  return (runId, message) => log.warn({ runId }, message);
}

const configRouter = router({
  get: adminProcedure.query(async (): Promise<SyncConfigDTO> => toConfig(await readConfig())),

  // Schedule only: blockedUntil / blockedReason / workerHeartbeatAt belong to the
  // worker (unknown keys are stripped by the schema). Invalid values are a 400
  // from the input schema before anything is written; the migration's CHECK
  // constraints hold the same bounds.
  update: adminProcedure.input(syncConfigUpdateInput).mutation(async ({ input, ctx }): Promise<SyncConfigDTO> => {
    try {
      const row = await prisma.syncConfig.update({
        where: { id: 1 },
        data: {
          enabled: input.enabled,
          incrementalIntervalMin: input.incrementalIntervalMin,
          fullWeekday: input.fullWeekday,
          fullHourUtc: input.fullHourUtc,
          updatedAt: new Date(),
          updatedById: ctx.admin.id,
        },
        select: configSelect,
      });
      return toConfig(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw missingConfig();
      throw err;
    }
  }),
});

const runsRouter = router({
  /**
   * Queue a manual run. Inside one transaction that first locks the SyncConfig
   * row (`FOR UPDATE` — the queue's mutex, so two concurrent requests cannot both
   * pass the exclusion check):
   *  · while "blocked until" is in the future, anything but a check is refused
   *    (PRECONDITION_FAILED, the message names the time in UTC);
   *  · 409 CONFLICT when a run of the same queue group is QUEUED or RUNNING —
   *    incremental and full share one group, a check only conflicts with a check.
   */
  queue: adminProcedure.input(syncQueueInput).mutation(async ({ input, ctx }): Promise<SyncRunSummaryDTO> => {
    const kind = input.kind;
    const groupKinds = SYNC_KINDS.filter((k) => syncKindGroup(k) === syncKindGroup(kind));
    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ blockedUntil: Date | null }>>`
        SELECT "blockedUntil" FROM "SyncConfig" WHERE "id" = 1 FOR UPDATE`;
      if (locked.length === 0) throw missingConfig();
      const now = new Date();
      const blockedUntil = locked[0]!.blockedUntil;
      if (kind !== "CHECK" && blockedUntil && isBlocked(blockedUntil, now)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `efootbase refused our requests — sync runs are refused until ${blockedUntil.toISOString()} (UTC); a check can still be queued`,
        });
      }
      const active = await tx.syncRun.findFirst({
        where: { kind: { in: groupKinds }, status: { in: ACTIVE } },
        orderBy: { id: "asc" },
        select: { id: true, kind: true, status: true },
      });
      if (active) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${KIND_LABEL[active.kind]} (run #${active.id}) is already ${active.status.toLowerCase()}`,
        });
      }
      return tx.syncRun.create({
        data: { kind, trigger: "MANUAL", status: "QUEUED", requestedById: ctx.admin.id, queuedAt: now },
        select: runSummarySelect,
      });
    });
    return toRunSummary(row, warnerFor(ctx.req.log));
  }),

  /**
   * Cancel a run. QUEUED → CANCELLED at once (a conditional update, so a run the
   * worker claims at the same moment falls through to the RUNNING case);
   * RUNNING → `cancelRequested` (the worker stops its children and marks it
   * CANCELLED). A finished run is a 409, an unknown id a 404.
   */
  cancel: adminProcedure.input(syncRunIdInput).mutation(async ({ input, ctx }): Promise<SyncRunSummaryDTO> => {
    const now = new Date();
    const queued = await prisma.syncRun.updateMany({
      where: { id: input.id, status: "QUEUED" },
      data: { status: "CANCELLED", cancelRequested: true, finishedAt: now },
    });
    if (queued.count === 0) {
      const running = await prisma.syncRun.updateMany({
        where: { id: input.id, status: "RUNNING" },
        data: { cancelRequested: true },
      });
      if (running.count === 0) {
        const row = await prisma.syncRun.findUnique({ where: { id: input.id }, select: { status: true } });
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `No run #${input.id}` });
        throw new TRPCError({ code: "CONFLICT", message: `Run #${input.id} has already finished (${row.status.toLowerCase()})` });
      }
    }
    const row = await prisma.syncRun.findUnique({ where: { id: input.id }, select: runSummarySelect });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `No run #${input.id}` });
    return toRunSummary(row, warnerFor(ctx.req.log));
  }),

  /** History, newest first (id DESC — ids follow queue order). Pass `nextCursor` back as `cursor`. */
  list: adminProcedure.input(syncRunsListInput.default({})).query(async ({ input, ctx }): Promise<SyncRunsPageDTO> => {
    const rows = await prisma.syncRun.findMany({
      where: input.cursor === undefined ? {} : { id: { lt: input.cursor } },
      orderBy: { id: "desc" },
      take: input.limit + 1,
      select: runSummarySelect,
    });
    const items = rows.slice(0, input.limit);
    const warn = warnerFor(ctx.req.log);
    return {
      items: items.map((r) => toRunSummary(r, warn)),
      nextCursor: rows.length > input.limit ? items[items.length - 1]!.id : null,
    };
  }),

  /** One run with its statistics, error and (redacted, ≤ 64 KB) log tail. */
  get: adminProcedure.input(syncRunIdInput).query(async ({ input, ctx }): Promise<SyncRunDTO> => {
    const row = await prisma.syncRun.findUnique({ where: { id: input.id }, select: runDetailSelect });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `No run #${input.id}` });
    return toRunDetail(row, warnerFor(ctx.req.log));
  }),
});

export const adminRouter = router({
  /**
   * Sign-in, atomic against concurrent attempts (verify finding C2). Every
   * attempt — any name, any password — runs the same three steps, so a failure
   * costs the same work whatever caused it (W7):
   *  1. RESERVE: one conditional UPDATE by user name counts the attempt
   *     (`failedLogins = failedLogins + 1` in SQL) unless the account is
   *     disabled or locked; it returns the row only when it counted. An
   *     unknown, malformed, disabled or locked name returns nothing.
   *  2. One scrypt: the stored hash, or the dummy hash when nothing was returned.
   *  3. a) Right password: in one transaction, re-read the row `FOR UPDATE`
   *        and issue the session only if the account is still enabled, not
   *        locked AND the streak — every attempt counted so far, including
   *        those still in flight — is at most 5. A concurrent burst can
   *        therefore not let a right guess win next to more than 4 others.
   *        The success removes this attempt and the ones before it from the
   *        streak (attempts reserved after it stay counted) and never clears
   *        a lock (it does not run while locked).
   *     b) Anything else: one conditional UPDATE sets the 15-minute lock when
   *        the streak reached 5 and the account is not locked yet (counter
   *        reset with it); for an unknown name it matches no row (id 0).
   * Attempts while locked are not counted; a right password during a lock is
   * refused with the same message. Timing: the failure paths differ only for
   * the attempt that sets the lock (one synchronous write, once per lock).
   */
  signIn: adminPublicProcedure.input(adminSignInInput).mutation(async ({ input, ctx }) => {
    if (!addressLimiter.hit(ctx.req.ip)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many sign-in attempts from this address — try again later" });
    }
    const username = input.username.trim().toLowerCase();
    const notLocked = (at: Date) => ({ disabledAt: null, OR: [{ lockedUntil: null }, { lockedUntil: { lte: at } }] }) satisfies Prisma.AdminWhereInput;

    // 1. reserve (the same statements for every name, well-formed or not — no shortcut for a malformed
    //    one). The counter's commit is asynchronous (`SET LOCAL synchronous_commit = off`): a counted
    //    attempt otherwise waits for a WAL flush (~1.7 ms here) that an unknown / locked name never
    //    pays, which told the two apart (W7). The trade-off: a Postgres crash can lose the increments of
    //    the last ~0.2–0.6 s (wal_writer_delay); the lock (3b) and the session (3a) commit synchronously.
    //    The typed query (not raw SQL) keeps the lockedUntil comparison independent of the session's
    //    TimeZone (a raw Date parameter shifted it: under UTC−4 an expired lock still refused).
    const [, reservedRows] = await prisma.$transaction([
      prisma.$executeRaw`SET LOCAL synchronous_commit = off`,
      prisma.admin.updateManyAndReturn({
        where: { username, ...notLocked(new Date()) },
        data: { failedLogins: { increment: 1 } },
        select: { id: true, passwordHash: true, failedLogins: true },
      }),
    ]);
    const reserved = reservedRows[0];

    // 2. one scrypt
    const passwordOk = reserved ? await verifyAdminPassword(input.password, reserved.passwordHash) : await verifyAgainstDummyHash(input.password);

    // 3a. right password: re-check under the row lock, then the session
    if (reserved && passwordOk) {
      const token = generateAdminSessionToken();
      const userAgent = ctx.req.headers["user-agent"];
      const signedIn = await prisma.$transaction(
        async (tx) => {
          const [row] = await tx.$queryRaw<Array<{ failedLogins: number; disabledAt: Date | null; lockedUntil: Date | null }>>`
            SELECT "failedLogins", "disabledAt", "lockedUntil" FROM "Admin" WHERE "id" = ${reserved.id} FOR UPDATE`;
          const now = new Date();
          const locked = row?.lockedUntil != null && row.lockedUntil.getTime() > now.getTime();
          if (!row || row.disabledAt !== null || locked || row.failedLogins > ADMIN_LOCK_THRESHOLD) return null;
          // Expired sessions (idle or absolute) are removed on each sign-in.
          await tx.adminSession.deleteMany({
            where: { OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: new Date(now.getTime() - ADMIN_IDLE_MS) } }] },
          });
          const updated = await tx.admin.update({
            where: { id: reserved.id },
            data: { failedLogins: Math.max(0, row.failedLogins - reserved.failedLogins), lockedUntil: null, lastLoginAt: now },
            select: { id: true, username: true, createdAt: true, lastLoginAt: true },
          });
          await tx.adminSession.create({
            data: {
              adminId: reserved.id,
              tokenDigest: adminSessionDigest(token),
              createdAt: now,
              lastSeenAt: now,
              expiresAt: new Date(now.getTime() + ADMIN_ABSOLUTE_MS),
              ipAddress: ctx.req.ip ?? null,
              userAgent: typeof userAgent === "string" ? userAgent.slice(0, 300) : null,
            },
            select: { id: true },
          });
          return updated;
        },
        { maxWait: 10_000, timeout: 10_000 },
      );
      if (signedIn) {
        setAdminCookie(ctx.res, token);
        return toMe(signedIn);
      }
    }

    // 3b. failure (wrong password, unknown / malformed / disabled / locked name, or refused above)
    const now = new Date();
    await prisma.admin.updateMany({
      where: { id: reserved?.id ?? 0, failedLogins: { gte: ADMIN_LOCK_THRESHOLD }, ...notLocked(now) },
      data: { failedLogins: 0, lockedUntil: new Date(now.getTime() + ADMIN_LOCK_MS) },
    });
    throw signInFailed();
  }),

  signOut: adminProcedure.mutation(async ({ ctx }) => {
    await prisma.adminSession.deleteMany({ where: { id: ctx.admin.sessionId } });
    clearAdminCookie(ctx.res);
    return { ok: true as const };
  }),

  me: adminProcedure.query(({ ctx }) => toMe(ctx.admin)),

  config: configRouter,
  runs: runsRouter,

  /**
   * Dashboard: worker online while SyncConfig.workerHeartbeatAt is younger than
   * 2 minutes (`isWorkerOnline`); the latest finished run; the active runs in
   * the order the worker takes them; the next scheduled times
   * (`nextScheduledRuns`, fed every active run plus the latest-starting
   * incremental and full run — the history `dueRuns` reads); the newest card in
   * the database; the latest finished run that overwrote card images.
   */
  dashboard: adminProcedure.query(async ({ ctx }): Promise<SyncDashboardDTO> => {
    const now = new Date();
    const warn = warnerFor(ctx.req.log);
    const finishedOrder = [{ finishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }] satisfies Prisma.SyncRunOrderByWithRelationInput[];
    const [config, active, lastFinished, latestSyncStarts, newest, overwritten] = await Promise.all([
      readConfig(),
      prisma.syncRun.findMany({ where: { status: { in: ACTIVE } }, orderBy: { id: "asc" }, select: runSummarySelect }),
      prisma.syncRun.findFirst({ where: { status: { notIn: ACTIVE } }, orderBy: finishedOrder, select: runSummarySelect }),
      // Latest start (startedAt ?? queuedAt, as the schedule counts it) per sync kind.
      prisma.$queryRaw<Array<{ kind: SyncKind; status: SyncStatus; queuedAt: Date; startedAt: Date | null }>>`
        SELECT DISTINCT ON ("kind") "kind"::text AS "kind", "status"::text AS "status", "queuedAt", "startedAt"
        FROM "SyncRun"
        WHERE "kind" IN ('INCREMENTAL', 'FULL')
        ORDER BY "kind", COALESCE("startedAt", "queuedAt") DESC, "id" DESC`,
      prisma.player.findFirst({
        where: { releaseDate: { not: null } },
        orderBy: [{ releaseDate: "desc" }, { id: "desc" }],
        select: { id: true, baseId: true, name: true, releaseDate: true },
      }),
      prisma.syncRun.findFirst({
        where: { status: { notIn: ACTIVE }, stats: { path: ["imagesOverwritten"], gt: 0 } },
        orderBy: finishedOrder,
        select: { id: true, stats: true, finishedAt: true },
      }),
    ]);

    const scheduleRuns: ScheduleRun[] = [
      ...active.map((r) => ({ kind: r.kind, status: r.status, queuedAt: r.queuedAt, startedAt: r.startedAt })),
      ...latestSyncStarts,
    ];
    const next = nextScheduledRuns(
      {
        enabled: config.enabled,
        incrementalIntervalMin: config.incrementalIntervalMin,
        fullWeekday: config.fullWeekday,
        fullHourUtc: config.fullHourUtc,
        blockedUntil: config.blockedUntil,
      },
      scheduleRuns,
      now,
    );

    // The overwritten count is read through the shared schema's own field
    // (a row whose other statistics are invalid still reports a valid count).
    let overwrittenImages: SyncDashboardDTO["overwrittenImages"] = null;
    if (overwritten) {
      const raw = overwritten.stats;
      const field = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.imagesOverwritten : undefined;
      const count = syncRunStatsSchema.shape.imagesOverwritten.safeParse(field);
      if (count.success && count.data !== undefined && count.data > 0) {
        overwrittenImages = { runId: overwritten.id, count: count.data, finishedAt: iso(overwritten.finishedAt) };
      } else {
        warn(overwritten.id, "stored SyncRun.stats.imagesOverwritten is not a valid count — not shown");
      }
    }

    const releaseAt = newest?.releaseDate ?? null;
    return {
      workerOnline: isWorkerOnline(config.workerHeartbeatAt, now),
      config: toConfig(config),
      lastRun: lastFinished ? toRunSummary(lastFinished, warn) : null,
      activeRuns: active.map((r) => toRunSummary(r, warn)),
      next: { incremental: iso(next.incremental), full: iso(next.full) },
      newestCardReleaseAt: iso(releaseAt),
      newestCard:
        newest && releaseAt
          ? { id: newest.id.toString(), baseId: newest.baseId.toString(), name: newest.name, releaseAt: releaseAt.toISOString() }
          : null,
      overwrittenImages,
    };
  }),
});
