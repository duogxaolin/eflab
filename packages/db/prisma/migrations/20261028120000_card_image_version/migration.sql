-- auto-image-version (openspec change, 2026-10-28; design D1): the card-image
-- cache version lives in the catalogue metadata row, raised by the sync worker
-- after a run replaced card images on R2 and served to the web app by
-- `catalogue.meta`. Additive and idempotent: one nullable column without a
-- default (the single row is not rewritten) and one CHECK added only when it
-- is missing. NO value is stored here — NULL means "nothing stored" and every
-- consumer falls back to its committed default; the live value is set once by
-- hand after migrating (docs/admin-sync.md → "Card image version").
--
--   · "CatalogueMeta"."imageVersion"            8–14 digits (yyyymmddHHmm from
--                                               the worker's clock, or the
--                                               previous value + 1), or NULL.
--   · "CatalogueMeta_image_version_format"      the CHECK above; NULL passes.
--
-- Rollback (stop the worker and the API first; also in docs/admin-sync.md):
--   ALTER TABLE "CatalogueMeta" DROP CONSTRAINT IF EXISTS "CatalogueMeta_image_version_format";
--   ALTER TABLE "CatalogueMeta" DROP COLUMN IF EXISTS "imageVersion";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261028120000_card_image_version';

-- AlterTable
ALTER TABLE "CatalogueMeta" ADD COLUMN IF NOT EXISTS "imageVersion" TEXT;

-- Format of the stored version (raw SQL Prisma does not model). NULL passes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CatalogueMeta_image_version_format') THEN
    ALTER TABLE "CatalogueMeta" ADD CONSTRAINT "CatalogueMeta_image_version_format"
      CHECK ("imageVersion" IS NULL OR "imageVersion" ~ '^[0-9]{8,14}$');
  END IF;
END
$$;
