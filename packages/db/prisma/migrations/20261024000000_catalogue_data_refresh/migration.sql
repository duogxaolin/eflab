-- efootbase-data-refresh-1024 (openspec change, 2026-10-24; design D2): the
-- card's own league, the manager picker order and the date of the seeded dump.
-- Additive only: two nullable columns without a default (existing rows are not
-- rewritten), one index, one new table with its single row. No existing column,
-- index or row is changed.
--
--   · "Player"."leagueId"      the card's own league (dump `league`), written by
--                              the shared row mapping (seed + incremental sync);
--                              NULL when that league is not in "League". No
--                              foreign key: the seed replaces the League rows
--                              inside its transaction.
--   · "Player_leagueId_idx"    serves the League filter (`leagueId IN (…)`).
--   · "Manager"."pickerOrder"  0-based position in the static manager snapshot;
--                              NULL outside the picker.
--   · "CatalogueMeta"          single row (id 1, CHECK below — raw SQL Prisma does
--                              not model): when the seeded dump was taken
--                              (`playersDumpedAt`, the date of the community
--                              ratings) and when the seed committed (`seededAt`).
--                              Inserted here with NULLs; written by the seed only.
--
-- Generated with `prisma migrate diff --from-schema-datamodel <main schema>
-- --to-schema-datamodel prisma/schema.prisma --script` (offline, no database),
-- then made idempotent like 20261019230000_admin_sync_worker (IF NOT EXISTS, a
-- guarded constraint, ON CONFLICT DO NOTHING) and extended with the CHECK and
-- the single row.
--
-- Rollback (also in the change's design.md, "As built"):
--   DROP TABLE IF EXISTS "CatalogueMeta";
--   DROP INDEX IF EXISTS "Player_leagueId_idx";
--   ALTER TABLE "Player" DROP COLUMN IF EXISTS "leagueId";
--   ALTER TABLE "Manager" DROP COLUMN IF EXISTS "pickerOrder";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261024000000_catalogue_data_refresh';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "leagueId" INTEGER;

-- AlterTable
ALTER TABLE "Manager" ADD COLUMN IF NOT EXISTS "pickerOrder" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CatalogueMeta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "playersDumpedAt" TIMESTAMP(3),
    "seededAt" TIMESTAMP(3),

    CONSTRAINT "CatalogueMeta_pkey" PRIMARY KEY ("id")
);

-- Single row: id 1 only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CatalogueMeta_single_row') THEN
    ALTER TABLE "CatalogueMeta" ADD CONSTRAINT "CatalogueMeta_single_row" CHECK ("id" = 1);
  END IF;
END
$$;

INSERT INTO "CatalogueMeta" ("id", "playersDumpedAt", "seededAt") VALUES (1, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Player_leagueId_idx" ON "Player"("leagueId");
