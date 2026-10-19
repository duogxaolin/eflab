-- efootbase-static-data (openspec change, 2026-10-19): columns for the static
-- efootbase snapshot (skills: key, group, order, release flag, icon key, stat
-- effects, activation text; managers: picker flag). Data is written by the seed
-- from the git-ignored dump/efootbase/static/ files, never by this migration.
--
-- Generated with `prisma migrate diff --from-schema-datasource
-- --to-schema-datamodel --script` and made idempotent (IF NOT EXISTS / a
-- guarded CREATE TYPE) so it can be replayed on a database that already carries
-- part of it. Only columns with constant defaults are added, so existing rows
-- are not rewritten.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SkillGroup') THEN
    CREATE TYPE "SkillGroup" AS ENUM ('SHOWTIME', 'CLASSIC');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "Manager" ADD COLUMN IF NOT EXISTS "inPicker" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Skill"
  ADD COLUMN IF NOT EXISTS "activation" TEXT,
  ADD COLUMN IF NOT EXISTS "efbKey" TEXT,
  ADD COLUMN IF NOT EXISTS "effects" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "group" "SkillGroup",
  ADD COLUMN IF NOT EXISTS "iconKey" TEXT,
  ADD COLUMN IF NOT EXISTS "released" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Skill_efbKey_key" ON "Skill"("efbKey");
