-- eflab-parity-fixes (openspec change) — schema half of the seeder/cross-fill fixes.
-- Every DDL statement is idempotent so the migration can be replayed on a database
-- that already carries part of it (the live dev DB was built with `db push`).
--
--  1. Per-position ratings become nullable with no default (cross-fill-owned).
--  2. CardType enum: one value per efootbase `card_type` code.
--     The old seeder's CARD_TYPE_MAP was shifted for 6 of 7 codes, so rows written
--     by it are remapped to the value that means what the code means:
--       old TRENDING  (code 1) → LEGENDARY
--       old EPIC      (code 3) → TRENDING   (POTW / POTD / POTS)
--       old BIG_TIME  (code 4) → SELECTION  (value renamed in place)
--       old HIGHLIGHT (code 5) → EPIC       (incl. Big Time campaigns)
--       old SHOW_TIME (code 6) → HIGHLIGHT  (incl. Show Time + selection packs)
--       old LEGENDARY (code 7) → STRIKE_ARENA
--     SHOW_TIME is then removed (Postgres cannot drop an enum value, so the type is
--     recreated). The block only runs while the old value SHOW_TIME still exists,
--     which is how "rows written by the old seeder" is detected; the fabricated 40s
--     in the rating columns are cleared in the same block.
--  3. Player.nameNormalized + trigram GIN index for accent-insensitive search.
--  4. Composite (sort, id) indexes for deterministic pagination; the redundant
--     single-column cardType / ovr indexes are dropped.

-- 1. Nullable, default-less per-position ratings (no-ops when already applied).
ALTER TABLE "Player"
  ALTER COLUMN "ratingGK"  DROP NOT NULL, ALTER COLUMN "ratingGK"  DROP DEFAULT,
  ALTER COLUMN "ratingCB"  DROP NOT NULL, ALTER COLUMN "ratingCB"  DROP DEFAULT,
  ALTER COLUMN "ratingLB"  DROP NOT NULL, ALTER COLUMN "ratingLB"  DROP DEFAULT,
  ALTER COLUMN "ratingRB"  DROP NOT NULL, ALTER COLUMN "ratingRB"  DROP DEFAULT,
  ALTER COLUMN "ratingDMF" DROP NOT NULL, ALTER COLUMN "ratingDMF" DROP DEFAULT,
  ALTER COLUMN "ratingCMF" DROP NOT NULL, ALTER COLUMN "ratingCMF" DROP DEFAULT,
  ALTER COLUMN "ratingLMF" DROP NOT NULL, ALTER COLUMN "ratingLMF" DROP DEFAULT,
  ALTER COLUMN "ratingRMF" DROP NOT NULL, ALTER COLUMN "ratingRMF" DROP DEFAULT,
  ALTER COLUMN "ratingAMF" DROP NOT NULL, ALTER COLUMN "ratingAMF" DROP DEFAULT,
  ALTER COLUMN "ratingLWF" DROP NOT NULL, ALTER COLUMN "ratingLWF" DROP DEFAULT,
  ALTER COLUMN "ratingRWF" DROP NOT NULL, ALTER COLUMN "ratingRWF" DROP DEFAULT,
  ALTER COLUMN "ratingSS"  DROP NOT NULL, ALTER COLUMN "ratingSS"  DROP DEFAULT,
  ALTER COLUMN "ratingCF"  DROP NOT NULL, ALTER COLUMN "ratingCF"  DROP DEFAULT;

-- 2. CardType enum.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'CardType' AND e.enumlabel = 'BIG_TIME')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'CardType' AND e.enumlabel = 'SELECTION') THEN
    ALTER TYPE "CardType" RENAME VALUE 'BIG_TIME' TO 'SELECTION';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'CardType' AND e.enumlabel = 'SHOW_TIME') THEN
    -- Rows written by the pre-parity seeder: fix the shifted card types and clear the
    -- invented per-position ratings (registered position = ovr, every other = 40).
    UPDATE "Player"
       SET "cardType" = (CASE "cardType"::text
                           WHEN 'TRENDING'  THEN 'LEGENDARY'
                           WHEN 'EPIC'      THEN 'TRENDING'
                           WHEN 'HIGHLIGHT' THEN 'EPIC'
                           WHEN 'SHOW_TIME' THEN 'HIGHLIGHT'
                           WHEN 'LEGENDARY' THEN 'STRIKE_ARENA'
                           ELSE "cardType"::text
                         END)::"CardType"
     WHERE "cardType"::text IN ('TRENDING', 'EPIC', 'HIGHLIGHT', 'SHOW_TIME', 'LEGENDARY');

    UPDATE "Player"
       SET "ratingGK" = NULL, "ratingCB" = NULL, "ratingLB" = NULL, "ratingRB" = NULL,
           "ratingDMF" = NULL, "ratingCMF" = NULL, "ratingLMF" = NULL, "ratingRMF" = NULL,
           "ratingAMF" = NULL, "ratingLWF" = NULL, "ratingRWF" = NULL, "ratingSS" = NULL,
           "ratingCF" = NULL
     WHERE "ratingGK" IS NOT NULL;

    CREATE TYPE "CardType_new" AS ENUM
      ('STANDARD', 'LEGENDARY', 'TRENDING', 'SELECTION', 'EPIC', 'HIGHLIGHT', 'STRIKE_ARENA');
    ALTER TABLE "Player" ALTER COLUMN "cardType" TYPE "CardType_new"
      USING ("cardType"::text::"CardType_new");
    ALTER TYPE "CardType" RENAME TO "CardType_old";
    ALTER TYPE "CardType_new" RENAME TO "CardType";
    DROP TYPE "CardType_old";
  END IF;
END
$$;

-- 3. Accent-insensitive search column (efootbase `name_normalized`) + trigram index.
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "nameNormalized" TEXT;
CREATE INDEX IF NOT EXISTS "Player_nameNormalized_idx"
  ON "Player" USING GIN ("nameNormalized" gin_trgm_ops);

-- 4. Deterministic pagination indexes; drop the ones they make redundant.
DROP INDEX IF EXISTS "Player_cardType_idx";
DROP INDEX IF EXISTS "Player_ovr_idx";
CREATE INDEX IF NOT EXISTS "Player_maxOvr_id_idx"       ON "Player"("maxOvr", "id");
CREATE INDEX IF NOT EXISTS "Player_ovr_id_idx"          ON "Player"("ovr", "id");
CREATE INDEX IF NOT EXISTS "Player_releaseDate_id_idx"  ON "Player"("releaseDate", "id");
