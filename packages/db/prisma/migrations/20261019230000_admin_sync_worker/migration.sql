-- admin-sync-worker (openspec change, 2026-10-19): admin accounts + sessions
-- (separate from the visitor User / Session / Account tables) and the sync
-- worker's schedule / run queue. Additive only: four new tables, three new
-- enums, their indexes and foreign keys (all pointing at the new Admin table).
-- No existing table, column, index or row is changed.
--
-- Generated with `prisma migrate diff --from-schema-datamodel <main schema>
-- --to-schema-datamodel prisma/schema.prisma --script` (offline, no database),
-- then made idempotent like 20261019000000_efootbase_static_data (guarded
-- CREATE TYPE / constraints, IF NOT EXISTS) and extended by hand with what
-- Prisma does not model (a future `migrate diff` from the database will propose
-- dropping these — keep them):
--   · "SyncRun_one_running": partial unique index, at most ONE run with status
--     RUNNING (the worker claims a run with a conditional UPDATE and treats a
--     unique violation as "another run is executing" — design decision 2);
--   · CHECK constraints: SyncConfig is a single row (id = 1) with schedule
--     ranges (interval 15–1440 min, weekday 0–6, hour 0–23); SyncRun.logTail is
--     at most 64 KB (UTF-8 bytes);
--   · the single SyncConfig row with its defaults (the only data this
--     migration writes).
--
-- Rollback (documented in docs/admin-sync.md): stop the worker, then
--   DROP TABLE "SyncRun", "SyncConfig", "AdminSession", "Admin";
--   DROP TYPE "SyncStatus", "SyncTrigger", "SyncKind";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261019230000_admin_sync_worker';

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SyncKind') THEN
    CREATE TYPE "SyncKind" AS ENUM ('CHECK', 'INCREMENTAL', 'FULL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SyncTrigger') THEN
    CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULE', 'MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SyncStatus') THEN
    CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'OK', 'FAILED', 'BLOCKED', 'CANCELLED');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Admin" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminSession" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SyncConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "incrementalIntervalMin" INTEGER NOT NULL DEFAULT 360,
    "fullWeekday" INTEGER NOT NULL DEFAULT 0,
    "fullHourUtc" INTEGER NOT NULL DEFAULT 3,
    "blockedUntil" TIMESTAMP(3),
    "blockedReason" TEXT,
    "workerHeartbeatAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" INTEGER,

    CONSTRAINT "SyncConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SyncConfig_single_row" CHECK ("id" = 1),
    CONSTRAINT "SyncConfig_interval_range" CHECK ("incrementalIntervalMin" BETWEEN 15 AND 1440),
    CONSTRAINT "SyncConfig_weekday_range" CHECK ("fullWeekday" BETWEEN 0 AND 6),
    CONSTRAINT "SyncConfig_hour_range" CHECK ("fullHourUtc" BETWEEN 0 AND 23)
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SyncRun" (
    "id" SERIAL NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedById" INTEGER,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "logTail" TEXT NOT NULL DEFAULT '',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "watermarkBefore" TIMESTAMP(3),
    "watermarkAfter" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SyncRun_logTail_size" CHECK (octet_length("logTail") <= 65536)
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_tokenDigest_key" ON "AdminSession"("tokenDigest");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminSession_adminId_idx" ON "AdminSession"("adminId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncRun_queuedAt_idx" ON "SyncRun"("queuedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncRun_status_idx" ON "SyncRun"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SyncRun_kind_startedAt_idx" ON "SyncRun"("kind", "startedAt");

-- One RUNNING run at most, enforced by the database (not modelled by Prisma).
CREATE UNIQUE INDEX IF NOT EXISTS "SyncRun_one_running" ON "SyncRun" ((true)) WHERE "status" = 'RUNNING';

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminSession_adminId_fkey') THEN
    ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncConfig_updatedById_fkey') THEN
    ALTER TABLE "SyncConfig" ADD CONSTRAINT "SyncConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncRun_requestedById_fkey') THEN
    ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- The single configuration row (defaults: enabled, every 360 min, full sync
-- Sunday 03:00 UTC). Never overwrites an existing row.
INSERT INTO "SyncConfig" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
