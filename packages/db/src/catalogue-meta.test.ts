// Tests of the card-image version's database side (openspec change
// auto-image-version, design D1; capability card-image-version "Stored Card
// Image Version") that need no database: the Prisma model, the migration and
// the seed must agree — the column is declared once in each, the migration is
// additive, idempotent and stores no value, the CHECK is the shared helper's
// format, and the seed's CatalogueMeta upsert never names the column (so a
// seed cannot reset a stored version). The behaviour on a real database (the
// migration applied twice, the CHECK refusing bad values, the seed keeping a
// stored value) is checked on the worker's scratch databases
// (apps/worker/test/worker.test.ts, full.test.ts). Pure: no database.
// Run: pnpm --filter @eflab/db test   (or: tsx packages/db/src/catalogue-meta.test.ts)
import { readFileSync } from "node:fs";
import { IMAGE_VERSION_RE } from "@eflab/shared";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf-8");
const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20261028120000_card_image_version/migration.sql");
const seed = read("./seed-efootbase-full.ts");

// 1. The Prisma model: one nullable text column on the single-row CatalogueMeta.
{
  const model = /model CatalogueMeta \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
  assert(/^\s*imageVersion\s+String\?\s*$/m.test(model), "schema.prisma: CatalogueMeta.imageVersion is a nullable String");
  assert((schema.match(/\bimageVersion\b/g) ?? []).length === 1, "schema.prisma: the column is declared once (no second model carries it)");
}

// 2. The migration: additive, idempotent, no value stored, the CHECK = the shared format.
{
  assert(/ALTER TABLE "CatalogueMeta" ADD COLUMN IF NOT EXISTS "imageVersion" TEXT;/.test(migration), "migration: ADD COLUMN IF NOT EXISTS \"imageVersion\" TEXT (re-runnable)");
  assert(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'CatalogueMeta_image_version_format'\)/.test(migration), "migration: the CHECK is added only when it is missing");
  const check = /CHECK \("imageVersion" IS NULL OR "imageVersion" ~ '([^']+)'\)/.exec(migration)?.[1];
  assert(check !== undefined && new RegExp(check).source === IMAGE_VERSION_RE.source, `migration: the CHECK pattern is the shared IMAGE_VERSION_RE (${check})`);
  const statements = migration.split("\n").filter((l) => !l.trim().startsWith("--"));
  assert(!statements.some((l) => /\b(UPDATE|INSERT)\b/.test(l)), "migration: no UPDATE / INSERT — it stores no value (NULL = nothing stored)");
  assert(!/DROP|DELETE FROM "CatalogueMeta"|NOT NULL|DEFAULT/.test(statements.join("\n")), "migration: no DROP, DELETE, NOT NULL or DEFAULT outside the rollback comment");
  assert(/ALTER TABLE "CatalogueMeta" DROP CONSTRAINT IF EXISTS "CatalogueMeta_image_version_format";/.test(migration) && /ALTER TABLE "CatalogueMeta" DROP COLUMN IF EXISTS "imageVersion";/.test(migration), "migration: the rollback SQL is in the header comment");
}

// 3. The seed never names the column: its CatalogueMeta upsert writes the dump date and the seed time only.
{
  const upsert = /tx\.catalogueMeta\.upsert\(\{([\s\S]*?)\}\);/.exec(seed)?.[1] ?? "";
  assert(upsert.length > 0 && /playersDumpedAt/.test(upsert) && /seededAt/.test(upsert), "seed: the CatalogueMeta upsert writes playersDumpedAt and seededAt");
  assert(!/imageVersion/.test(upsert), "seed: the upsert's create / update lists do not name imageVersion (a seed never resets a stored version)");
  assert(!/imageVersion/.test(seed), "seed: the seed source does not mention imageVersion at all");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ catalogue-meta tests passed");
