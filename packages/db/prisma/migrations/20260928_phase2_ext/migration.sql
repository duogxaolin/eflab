-- Phase 2: full-data-seed Postgres extensions + indexes.
-- idempotent: safe to re-run.

-- pg_trgm enables trigram-based similarity (`%`) + `similarity()` for fuzzy multilingual search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent strips diacritics so "Schär" matches "Schar" via expression indexes below.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- GIN trigram index on the primary name column.
CREATE INDEX IF NOT EXISTS "Player_name_trgm"
  ON "Player" USING GIN (name gin_trgm_ops);

-- GIN trigram index on accented name — covers "Fabian Schär" matches when searching "schar".
CREATE INDEX IF NOT EXISTS "Player_accentedName_trgm"
  ON "Player" USING GIN ("accentedName" gin_trgm_ops);
