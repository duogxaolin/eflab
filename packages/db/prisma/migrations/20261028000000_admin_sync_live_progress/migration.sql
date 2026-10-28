-- admin-sync-live-progress (openspec change, 2026-10-28; design D1, D2, D4):
-- hourly incremental syncs by default, the live progress of a running run and
-- the bounded record of what a run fetched. Additive and idempotent: two
-- nullable columns without a default (existing rows are not rewritten), one
-- CHECK added only when it is missing, a new column default, and the single
-- configuration row moved from the old default only while it still holds it.
--
--   · "SyncRun"."progress"  live progress of a RUNNING run (phase, done / total,
--                           counters so far, time of the write — shape
--                           SyncRunProgress in @eflab/shared); written with the
--                           run heartbeat, NULL once the run ended.
--   · "SyncRun"."items"     what the run fetched (card ids, image paths, failure
--                           reason classes; lists capped at 2,000 with their true
--                           totals — shape SyncRunItems in @eflab/shared).
--   · "SyncRun_items_size"  the record stays ≤ 512 KB as jsonb text (the worker
--                           shortens the lists to fit before it writes; this
--                           refuses anything larger).
--   · "SyncConfig"."incrementalIntervalMin" default 360 → 60; the single row is
--                           moved to 60 only while it still holds 360 (a value
--                           an admin chose is kept). The 15–1440 CHECK stays.
--
-- Rollback (stop the worker and the API first; also in docs/admin-sync.md):
--   ALTER TABLE "SyncRun" DROP CONSTRAINT IF EXISTS "SyncRun_items_size";
--   ALTER TABLE "SyncRun" DROP COLUMN IF EXISTS "items";
--   ALTER TABLE "SyncRun" DROP COLUMN IF EXISTS "progress";
--   ALTER TABLE "SyncConfig" ALTER COLUMN "incrementalIntervalMin" SET DEFAULT 360;
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261028000000_admin_sync_live_progress';
-- (the row keeps its current interval; set 360 by hand in the dashboard if wanted)

-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN IF NOT EXISTS "progress" JSONB;

-- AlterTable
ALTER TABLE "SyncRun" ADD COLUMN IF NOT EXISTS "items" JSONB;

-- Size bound of the record (raw SQL Prisma does not model). NULL passes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncRun_items_size') THEN
    ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_items_size" CHECK (octet_length("items"::text) <= 524288);
  END IF;
END
$$;

-- Hourly by default.
ALTER TABLE "SyncConfig" ALTER COLUMN "incrementalIntervalMin" SET DEFAULT 60;

-- The single row only while it still holds the old default.
UPDATE "SyncConfig" SET "incrementalIntervalMin" = 60 WHERE "id" = 1 AND "incrementalIntervalMin" = 360;
