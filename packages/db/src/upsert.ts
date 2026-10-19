// Generic INSERT … ON CONFLICT upsert over a column list derived from the Prisma
// model (moved out of seed-efootbase-full.ts unchanged in change admin-sync-worker
// so the seed and the sync worker share it). Columns in `excludedColumns` (e.g.
// PLAYER_CROSSFILL_COLUMNS) are never written: they are absent from the INSERT
// column list and from the ON CONFLICT update list.

import { Prisma } from "./client.js";

export type ScalarField = { name: string; kind: string; type: string; isRequired: boolean; hasDefaultValue: boolean; default?: unknown };
export type Tx = Prisma.TransactionClient;

export function modelScalarFields(model: string): ScalarField[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  if (!m) throw new Error(`model ${model} not in Prisma DMMF`);
  return m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum") as ScalarField[];
}

/** Postgres type for a Prisma scalar — used in the jsonb_to_recordset column list. */
export function pgType(f: ScalarField): string {
  if (f.kind === "enum") return `"${f.type}"`;
  switch (f.type) {
    case "BigInt": return "int8";
    case "Int": return "int4";
    case "Float": return "float8";
    case "Boolean": return "bool";
    case "String": return "text";
    case "DateTime": return "timestamp(3)";
    case "Json": return "jsonb";
    default: throw new Error(`unsupported scalar type ${f.type} on ${f.name}`);
  }
}

/** Value for a column the row did not set: the literal @default, else NULL for optional. */
export function defaultFor(model: string, f: ScalarField): unknown {
  if (f.hasDefaultValue && f.default !== undefined && typeof f.default !== "object") return f.default;
  if (f.hasDefaultValue && typeof f.default === "object" && f.default !== null
      && (f.default as { name?: string }).name === "now") return new Date();
  if (!f.isRequired) return null;
  throw new Error(`${model}.${f.name} is required, has no literal default and the seeder did not set it`);
}

/**
 * INSERT … ON CONFLICT ("id") DO UPDATE for `rows`, over every scalar column of
 * `model` except `excludedColumns`. Rows go in as ONE bound jsonb parameter
 * (jsonb_to_recordset), so there is no string splicing and no bind-count limit.
 * Columns the row object does not set get the model default. Unknown keys abort.
 */
export function makeUpserter(model: string, table: string, excludedColumns: ReadonlySet<string>) {
  const fields = modelScalarFields(model).filter((f) => !excludedColumns.has(f.name));
  const known = new Set(fields.map((f) => f.name));
  const colList = fields.map((f) => `"${f.name}"`).join(", ");
  const defList = fields.map((f) => `"${f.name}" ${pgType(f)}`).join(", ");
  const setList = fields.filter((f) => f.name !== "id").map((f) => `"${f.name}" = EXCLUDED."${f.name}"`).join(", ");
  const sql = `INSERT INTO "${table}" (${colList})
    SELECT ${colList} FROM jsonb_to_recordset($1::jsonb) AS t(${defList})
    ON CONFLICT ("id") DO UPDATE SET ${setList}`;
  const serialize = (_k: string, v: unknown): unknown => {
    if (typeof v === "bigint") {
      if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) {
        // JSON numbers must stay exact; Konami ids are 15 digits (< 2^53).
        throw new Error(`${model}: bigint ${v} exceeds JSON safe integer range`);
      }
      return Number(v);
    }
    return v;
  };
  return {
    columns: fields.map((f) => f.name),
    async run(tx: Tx, rows: Array<Record<string, unknown>>): Promise<void> {
      if (rows.length === 0) return;
      const complete = rows.map((row) => {
        for (const k of Object.keys(row)) {
          if (!known.has(k)) {
            throw new Error(excludedColumns.has(k)
              ? `${model}.${k} is excluded from this upsert (cross-fill-owned or written separately)`
              : `${model}.${k} is not a scalar column of the model`);
          }
        }
        const out: Record<string, unknown> = {};
        for (const f of fields) {
          const v = row[f.name];
          out[f.name] = v === undefined ? defaultFor(model, f) : v;
        }
        return out;
      });
      await tx.$executeRawUnsafe(sql, JSON.stringify(complete, serialize));
    },
  };
}
