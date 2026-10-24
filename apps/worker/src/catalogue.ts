// Catalogue reads and row comparison of the sync runs (openspec change
// admin-sync-worker, design decisions 6b and 7).
//
// "Changed" means: the shared mapping (`buildPlayerRow` from
// @eflab/db/efootbase-map) of the source row differs from the database row in
// a seed-owned column, or the card's skill set differs. Two kinds of column are
// compared differently on purpose:
//   · lookups (nationalityId, teamId, featuredPackId) are compared by the NAME
//     they point to — the seed numbers countries / teams in first-seen dump
//     order on every run, so an id can move while the card did not change;
//   · popularity counters (views, ratingCount, avgRating) are not card data and
//     are ignored (they move on every dump; counting them would mark nearly
//     every card "changed" and make the full run compare every image).
// Cross-fill columns are not in the mapping, so they never count. The card's
// own league (`leagueId`, openspec efootbase-data-refresh-1024) is a League id
// (the source's own code, stable across seeds), so it is compared by value.
//
// Values are compared through a canonical text form (bigint / Date / number /
// boolean / string are kept apart), so a value read back from Postgres equals
// the mapped value it was written from.

import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { PrismaClientType } from "@eflab/db";
import {
  PACK_FAMILY_TYPES,
  basename,
  buildPlayerRow,
  packFamily,
  skillKeyToSlug,
  type EfbRow,
} from "@eflab/db/efootbase-map";
import { syncRunStatsSchema, type CardType } from "@eflab/shared";
import { SOURCE_IMAGE_HOSTS, sourceImageUrlAllowed, type SourceImageKind } from "./efootbase.js";
import { DB_PACKAGE_DIR } from "./env.js";
import { fail } from "./scripts.js";

/**
 * Stored-URL base the seed falls back to when R2_PUBLIC_BASE is unset
 * (DUPLICATED from packages/db/src/seed-efootbase-full.ts on purpose; a worker
 * test compares the two). Only ever written into a stored URL — never requested.
 */
export const SEED_FALLBACK_R2_BASE = "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";

/** Popularity counters of the mapping, ignored when deciding whether a card changed. */
export const VOLATILE_PLAYER_COLUMNS: ReadonlySet<string> = new Set(["views", "ratingCount", "avgRating"]);
const LOOKUP_COLUMNS: ReadonlySet<string> = new Set(["nationalityId", "teamId", "featuredPackId"]);

let compared: string[] | null = null;
/** Mapped Player columns compared by value (buildPlayerRow sets the same keys for every row). */
export function comparedPlayerColumns(): string[] {
  if (compared) return compared;
  const probe = buildPlayerRow({ id: 1, pos: 0, condition: 0 }, 1n, new Map(), new Map(), new Map(), new Map(), new Set(), []);
  compared = Object.keys(probe).filter((k) => k !== "id" && !VOLATILE_PLAYER_COLUMNS.has(k) && !LOOKUP_COLUMNS.has(k)).sort();
  return compared;
}

function canon(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "bigint") return `b${v}`;
  if (v instanceof Date) return `d${v.getTime()}`;
  if (typeof v === "number") return `n${Object.is(v, -0) ? 0 : v}`;
  if (typeof v === "boolean") return v ? "T" : "F";
  if (typeof v === "string") return `s${JSON.stringify(v)}`;
  return `j${JSON.stringify(v)}`;
}

/** id → name of the lookup rows a Player row points to. */
export interface LookupNames {
  country: ReadonlyMap<number, string>;
  team: ReadonlyMap<number, string>;
  pack: ReadonlyMap<string, string>;
}

/** Digest of a mapped (or stored) Player row + its skill ids, as defined in the header. */
export function playerDigest(row: Record<string, unknown>, skillIds: readonly number[], names: LookupNames): string {
  const h = createHash("sha1");
  for (const c of comparedPlayerColumns()) h.update(`${c}=${canon(row[c])}\u0000`);
  h.update(`country=${canon(names.country.get(row.nationalityId as number) ?? null)}\u0000`);
  h.update(`team=${canon(row.teamId == null ? null : (names.team.get(row.teamId as number) ?? `#${String(row.teamId)}`))}\u0000`);
  h.update(`pack=${canon(row.featuredPackId == null ? null : (names.pack.get(row.featuredPackId as string) ?? `#${String(row.featuredPackId)}`))}\u0000`);
  h.update(`skills=${[...new Set(skillIds)].sort((a, b) => a - b).join(",")}`);
  return h.digest("hex");
}

// ---- Database lookups ----

export interface DbLookups {
  countryByName: Map<string, { id: number; flagUrl: string | null }>;
  teamByName: Map<string, { id: number; emblemUrl: string | null }>;
  leagueIds: Set<number>;
  packIdByName: Map<string, string>;
  skillBySlug: Map<string, { id: number; released: boolean }>;
  names: LookupNames;
  maxCountryId: number;
  maxTeamId: number;
}

export async function loadDbLookups(db: PrismaClientType): Promise<DbLookups> {
  const [countries, teams, leagues, packs, skills] = await Promise.all([
    db.country.findMany({ select: { id: true, name: true, flagUrl: true }, orderBy: { id: "asc" } }),
    db.team.findMany({ select: { id: true, name: true, emblemUrl: true }, orderBy: { id: "asc" } }),
    db.league.findMany({ select: { id: true } }),
    db.pack.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
    db.skill.findMany({ select: { id: true, slug: true, released: true } }),
  ]);
  const countryByName = new Map<string, { id: number; flagUrl: string | null }>();
  for (const c of countries) if (!countryByName.has(c.name)) countryByName.set(c.name, { id: c.id, flagUrl: c.flagUrl });
  const teamByName = new Map<string, { id: number; emblemUrl: string | null }>();
  for (const t of teams) if (!teamByName.has(t.name)) teamByName.set(t.name, { id: t.id, emblemUrl: t.emblemUrl });
  const packIdByName = new Map<string, string>();
  for (const p of packs) if (!packIdByName.has(p.name)) packIdByName.set(p.name, p.id);
  return {
    countryByName,
    teamByName,
    leagueIds: new Set(leagues.map((l) => l.id)),
    packIdByName,
    skillBySlug: new Map(skills.map((s) => [s.slug, { id: s.id, released: s.released }])),
    names: {
      country: new Map(countries.map((c) => [c.id, c.name])),
      team: new Map(teams.map((t) => [t.id, t.name])),
      pack: new Map(packs.map((p) => [p.id, p.name])),
    },
    maxCountryId: countries.reduce((m, c) => Math.max(m, c.id), 0),
    maxTeamId: teams.reduce((m, t) => Math.max(m, t.id), 0),
  };
}

/** fixtures/leagues.json (league code → name / region) — the seed's only league source. */
export function leagueFixture(): Record<string, { name: string; region: string }> {
  const raw = JSON.parse(readFileSync(join(DB_PACKAGE_DIR, "fixtures/leagues.json"), "utf8")) as { leagues: Record<string, { name: string; region: string }> };
  return raw.leagues;
}

/** The League ids a seed writes (= fixtures/leagues.json): the known-league set
 *  of the rows a seed will write (`buildPlayerRow`'s `knownLeagueIds`). */
export function seedLeagueIds(): Set<number> {
  return new Set(Object.keys(leagueFixture()).map(Number));
}

const PAGE = 2_000;

let floatCols: string[] | null = null;
/** Compared Player columns of Prisma type Float. (@eflab/db/upsert is imported lazily: it loads the
 *  Prisma client, and this module must stay importable without a database configuration.) */
async function comparedFloatColumns(): Promise<string[]> {
  if (floatCols) return floatCols;
  const { modelScalarFields } = await import("@eflab/db/upsert");
  const floats = new Set(modelScalarFields("Player").filter((f) => f.type === "Float").map((f) => f.name));
  floatCols = comparedPlayerColumns().filter((c) => floats.has(c));
  return floatCols;
}

/**
 * Digest of every stored Player row (or of the given ids), keyed by id string.
 * Read-only, paged by id. Float columns are read as text through raw SQL:
 * Postgres stores the mapped double exactly (float8 shortest-exact output), but
 * Prisma's typed read rounds it to ~16 significant digits (0.30000000000000004
 * comes back as 0.3), which would mark such cards "changed" on every run.
 */
export async function storedDigests(db: PrismaClientType, names: LookupNames, ids?: readonly bigint[]): Promise<Map<string, string>> {
  const floats = await comparedFloatColumns();
  const select: Record<string, true> = { id: true, nationalityId: true, teamId: true, featuredPackId: true };
  for (const c of comparedPlayerColumns()) if (!floats.includes(c)) select[c] = true;
  // extra_float_digits ≥ 1 (the default since Postgres 12) = shortest exact float8 text; checked per page.
  const floatSql = `SELECT id::text AS id, current_setting('extra_float_digits') AS efd, ${floats.map((c) => `"${c}"::text AS "${c}"`).join(", ")} FROM "Player" WHERE id = ANY($1::text[]::int8[])`;
  const out = new Map<string, string>();
  const digestPage = async (rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) return;
    const pids = rows.map((r) => r.id as bigint);
    if (floats.length > 0) {
      const exact = await db.$queryRawUnsafe<Array<Record<string, string | null>>>(floatSql, pids.map(String));
      if (exact.length > 0 && Number(exact[0]!.efd) < 1) throw fail(`Postgres extra_float_digits is ${exact[0]!.efd} (< 1): stored floats cannot be read back exactly, so changed cards cannot be told apart`);
      const byId = new Map(exact.map((e) => [e.id!, e]));
      for (const r of rows) {
        const e = byId.get(String(r.id));
        for (const c of floats) r[c] = e?.[c] == null ? null : Number(e[c]);
      }
    }
    const links = await db.playerSkill.findMany({ where: { playerId: { in: pids } }, select: { playerId: true, skillId: true } });
    const byPlayer = new Map<string, number[]>();
    for (const l of links) {
      const k = String(l.playerId);
      const list = byPlayer.get(k);
      if (list) list.push(l.skillId);
      else byPlayer.set(k, [l.skillId]);
    }
    for (const r of rows) out.set(String(r.id), playerDigest(r, byPlayer.get(String(r.id)) ?? [], names));
  };
  if (ids) {
    for (let i = 0; i < ids.length; i += PAGE) {
      const rows = (await db.player.findMany({ where: { id: { in: [...ids.slice(i, i + PAGE)] } }, select })) as Array<Record<string, unknown>>;
      await digestPage(rows);
    }
    return out;
  }
  let after: bigint | null = null;
  for (;;) {
    const rows = (await db.player.findMany({
      where: after === null ? undefined : { id: { gt: after } },
      orderBy: { id: "asc" },
      take: PAGE,
      select,
    })) as Array<Record<string, unknown>>;
    await digestPage(rows);
    if (rows.length < PAGE) break;
    after = rows[rows.length - 1]!.id as bigint;
  }
  return out;
}

// ---- Dump rows ----

export async function* jsonlRows(path: string): AsyncGenerator<EfbRow> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    n++;
    if (!line.trim()) continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      throw fail(`${path}: line ${n} is not JSON`);
    }
    yield row as EfbRow;
  }
}

/** Id check of a dump row: a positive safe integer (the dump script refuses ids ≤ 0 too — verify finding W-a). */
export function checkRowId(r: EfbRow, index: number): void {
  if (typeof r !== "object" || r === null || Array.isArray(r)) throw fail(`dump row ${index}: not an object — nothing was written`);
  if (typeof r.id !== "number" || !Number.isSafeInteger(r.id) || r.id <= 0) throw fail(`dump row ${index}: bad id ${String(r.id)} — nothing was written`);
}

/**
 * Image references of a source row (verify finding C1): the card renders the
 * dump script downloads (`transparent`, `dynamic`) and the three emblems must
 * be URLs `sourceImageUrlAllowed` accepts, and an emblem's file name — stored
 * in Country.flagUrl / Team.emblemUrl / League.emblemUrl — must be a safe
 * `<name>.png` (`basename`). Anything else ends the run FAILED naming the card
 * and the field, before any image request or write (the script refuses such
 * entries too). Legitimate dumps pass unchanged (2026-10-18 dump: 0 refusals).
 */
export function checkSourceImages(r: EfbRow, env: { testMode: boolean; apiBase: string; testThirdPartyBase?: string | null }): void {
  const bad = (field: string, why: string): never => {
    throw fail(`card ${r.id}: ${field} ${why} — refused (source data), nothing was written`);
  };
  const hosts = (k: SourceImageKind) => Object.entries(SOURCE_IMAGE_HOSTS[k]).map(([h, p]) => (p === "/" ? h : `${h}${p}`)).join(" / ");
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  // Same shape rules as the dump script: a falsy value means "none", anything else must be an object.
  const cards = (r.card_images || {}) as unknown;
  if (!isObject(cards)) bad("card_images", "is not an object");
  for (const k of ["transparent", "dynamic"] as const) {
    const v = (cards as Record<string, unknown>)[k];
    if (!v) continue;
    if (!sourceImageUrlAllowed(v, k, env)) bad(`card_images.${k}`, `is not an allowed image URL (https on ${hosts(k)})`);
  }
  const emblems = (r.emblem_images || {}) as unknown;
  if (!isObject(emblems)) bad("emblem_images", "is not an object");
  for (const k of ["nationality", "league", "team"]) {
    const v = (emblems as Record<string, unknown>)[k];
    if (!v) continue;
    if (!sourceImageUrlAllowed(v, "emblems", env)) bad(`emblem_images.${k}`, `is not an allowed image URL (https on ${hosts("emblems")})`);
    if (basename(v as string) === null) bad(`emblem_images.${k}`, "has no safe <name>.png file name");
  }
}

/**
 * Card ids whose images earlier runs still owe (second verify CR2, third verify
 * W1): the union of `stats.imagesPendingIds` of every finished INCREMENTAL /
 * FULL run from the last one whose image step finished (`imagesChecked`; its
 * list = what it still owed) on, this run excluded. A run whose image step
 * never finished (blocked, killed, failed earlier) keeps its whole list in the
 * union, so nothing owed is lost. Read leniently: an unparsable list is skipped.
 */
export async function pendingImageIds(db: PrismaClientType, currentRunId: number): Promise<number[]> {
  const kinds: Array<"INCREMENTAL" | "FULL"> = ["INCREMENTAL", "FULL"];
  const finished = { notIn: ["QUEUED", "RUNNING"] as Array<"QUEUED" | "RUNNING"> };
  const lastChecked = await db.syncRun.findFirst({
    where: { kind: { in: kinds }, status: finished, id: { not: currentRunId }, stats: { path: ["imagesChecked"], equals: true } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const runs = await db.syncRun.findMany({
    where: { kind: { in: kinds }, status: finished, id: { gte: lastChecked?.id ?? 0, not: currentRunId } },
    select: { stats: true },
  });
  const out = new Set<number>();
  for (const r of runs) {
    const ids = syncRunStatsSchema.shape.imagesPendingIds.safeParse((r.stats as Record<string, unknown> | null)?.imagesPendingIds);
    if (ids.success && ids.data) for (const id of ids.data) out.add(id);
  }
  return [...out];
}

/** Truthy `s_*` keys of a row. */
export function heldSkillKeys(r: EfbRow): string[] {
  return Object.keys(r).filter((k) => k.startsWith("s_") && Boolean(r[k]));
}

/**
 * The seed's card-type validation of a set of rows: every code is known to
 * the card-type map, and pack-name families agree with the type. Throws FAILED
 * naming the code (never guessed).
 */
export function validateCardTypes(rows: Iterable<EfbRow>, cardTypeByCode: ReadonlyMap<number, CardType>): void {
  const disagreements = new Map<string, number>();
  for (const r of rows) {
    const code = r.card_type ?? 0;
    const type = cardTypeByCode.get(code);
    if (!type) throw fail(`card ${r.id}: unknown efootbase card_type code ${String(code)} (no CardType in CARD_TYPE_BY_EFOOTBASE_CODE) — nothing was written`);
    const family = packFamily(r.featured ?? null);
    if (family && !PACK_FAMILY_TYPES[family]!.includes(type)) {
      const key = `${family} pack → ${type} (code ${code})`;
      disagreements.set(key, (disagreements.get(key) ?? 0) + 1);
    }
  }
  if (disagreements.size > 0) {
    throw fail(`card-type map disagrees with pack names — nothing was written: ${[...disagreements].map(([k, n]) => `${k}: ${n} cards`).join("; ")}`);
  }
}

/**
 * The seed's skill validation: every `s_*` key present on a row maps to a
 * stored skill slug, and no hidden (released: false) skill is held. Returns
 * key → skill id. Throws FAILED naming the keys.
 */
export function resolveSkillKeys(rows: Iterable<EfbRow>, skillBySlug: ReadonlyMap<string, { id: number; released: boolean }>): Map<string, number> {
  const keys = new Set<string>();
  const holders = new Map<string, number>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!k.startsWith("s_")) continue;
      keys.add(k);
      if (r[k]) holders.set(k, (holders.get(k) ?? 0) + 1);
    }
  }
  const out = new Map<string, number>();
  const unknown: string[] = [];
  for (const k of [...keys].sort()) {
    const s = skillBySlug.get(skillKeyToSlug(k));
    if (!s) unknown.push(k);
    else out.set(k, s.id);
  }
  if (unknown.length > 0) throw fail(`${unknown.length} unknown s_* skill key(s) (no skill with that slug): ${unknown.join(", ")} — nothing was written`);
  const hidden = [...out].filter(([k, id]) => (holders.get(k) ?? 0) > 0 && [...skillBySlug.values()].some((s) => s.id === id && !s.released));
  if (hidden.length > 0) {
    throw fail(`cards carry skills stored as released: false: ${hidden.map(([k]) => `${k} (${holders.get(k)})`).join(", ")} — set released to true in fixtures/skills.json; nothing was written`);
  }
  return out;
}
