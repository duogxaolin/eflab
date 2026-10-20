// Synthetic, seedable efootbase data for the worker's incremental / full tests
// (openspec change admin-sync-worker, task 5.6). Numbers and made-up names
// only ("Test Player N", "Testland") — no efootbase content.
//
//   seedableRows(...)       rows the shared mapping and the real seed accept
//   writeStaticDir(...)     a minimal static snapshot (skills.json = [] and an
//                           empty skill-icons/) — the seed then keeps the
//                           fixture skill names; no managers.json (optional)
//   writeDumpDir(...)       players.jsonl + players_meta.json + packs.json
//   runRealSeed(...)        the real seed (packages/db) as a child against the
//                           scratch database, explicit minimal environment
//   catalogueDigests(...)   md5 of every catalogue row per table (byte-identity checks)

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClientType } from "@eflab/db";
import { DB_PACKAGE_DIR, SEED_ENTRY, TEST_DATABASE_NAME_RE, databaseName } from "../../src/env.js";
import { tsxCli } from "../../src/scripts.js";
import { fakePlayersMeta, generateRows, type FakeRow } from "./fake-efootbase.js";

/** Rows with every field the mapping requires (condition, registered aptitude), a skill flag and a booster. */
export function seedableRows(
  n: number,
  opts: { cdnBase: string; newestTimeAdded: number; startIndex?: number; stepSeconds?: number; extra?: (i: number) => Record<string, unknown> },
): FakeRow[] {
  const start = opts.startIndex ?? 0;
  return generateRows(n, {
    cdnBase: opts.cdnBase,
    newestTimeAdded: opts.newestTimeAdded,
    startIndex: start,
    stepSeconds: opts.stepSeconds,
    extra: (i) => ({
      // Real-shaped values for the read-back comparison: non-ASCII text, fractional floats, a shirt number,
      // popularity counters (ignored by the comparison — tests change them between runs).
      name: `Tëst Plåyer ${start + i}`,
      name_ja: `テスト選手${start + i}`,
      name_zh: `测试球员${start + i}`,
      shirt_number: 7 + ((start + i) % 20),
      leg_coverage_radius: 0.1 + (start + i) / 7,
      arm_coverage_radius: 123.456789,
      jump_height: 1 / 3,
      torso_collision: 0.1 + 0.2,
      leg_length_height: 98.76543210123,
      views: 1000 + start + i,
      ratingCount: 3,
      avgRating: 4.25,
      condition: 2,
      cf: 2, // registered position 12 (CF): aptitude "registered"
      ss: 1,
      finishing: 60 + ((start + i) % 30),
      speed: 70,
      max_attributes: { finishing: 70 + ((start + i) % 20) },
      s_one_touch_pass: (start + i) % 2,
      booster_id: 16,
      booster: { name: "Test booster", add: 1, stats: { finishing: 1, speed: 1 } },
      ...(opts.extra ? opts.extra(i) : {}),
    }),
  });
}

export function writeStaticDir(dir: string, opts: { skills?: boolean; icons?: boolean } = {}): string {
  mkdirSync(dir, { recursive: true });
  if (opts.skills ?? true) writeFileSync(join(dir, "skills.json"), "[]\n");
  if (opts.icons ?? true) mkdirSync(join(dir, "skill-icons"), { recursive: true });
  return dir;
}

export function writeDumpDir(dir: string, rows: readonly FakeRow[]): { dump: string; meta: string; packs: string } {
  mkdirSync(dir, { recursive: true });
  const dump = join(dir, "players.jsonl");
  const meta = join(dir, "players_meta.json");
  const packs = join(dir, "packs.json");
  writeFileSync(dump, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(meta, JSON.stringify(fakePlayersMeta()));
  writeFileSync(packs, JSON.stringify({ data: { specialPlayerList: [], packs: [] } }));
  return { dump, meta, packs };
}

/** Runs the real seed against `databaseUrl` (must be a scratch database). Output is masked of the URL. */
export function runRealSeed(opts: { databaseUrl: string; dumpDir: string; staticDir: string; r2PublicBase: string }): Promise<{ code: number | null; output: string }> {
  if (!TEST_DATABASE_NAME_RE.test(databaseName(opts.databaseUrl))) throw new Error("runRealSeed: only a scratch database");
  return new Promise((res) => {
    const child = spawn(process.execPath, [tsxCli(), SEED_ENTRY], {
      cwd: DB_PACKAGE_DIR,
      shell: false,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        NODE_ENV: "production",
        DATABASE_URL: opts.databaseUrl,
        R2_PUBLIC_BASE: opts.r2PublicBase,
        EFOOTBASE_DUMP_PATH: join(opts.dumpDir, "players.jsonl"),
        EFOOTBASE_META_PATH: join(opts.dumpDir, "players_meta.json"),
        EFOOTBASE_PACKS_PATH: join(opts.dumpDir, "packs.json"),
        EFOOTBASE_STATIC_DIR: opts.staticDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (out += b.toString("utf8")));
    child.on("close", (code) => res({ code, output: out.split(opts.databaseUrl).join("[database-url]") }));
  });
}

const TABLES: Array<[string, string]> = [
  ["Country", "id"],
  ["Team", "id"],
  ["League", "id"],
  ["Booster", "id"],
  ["Skill", "id"],
  ["Pack", "id"],
  ["PackCard", `"packId", "playerId"`],
  ["FeaturedBundle", "id"],
  ["FeaturedBundleCard", `"bundleId", "playerId"`],
  ["Manager", "id"],
];

/**
 * md5 of the text form of every row, per table (Player / PlayerSkill without
 * the rows of `exceptPlayers`). Equal digests = byte-identical rows.
 */
export async function catalogueDigests(db: PrismaClientType, exceptPlayers: readonly bigint[] = []): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ex = exceptPlayers.length > 0 ? exceptPlayers.map(String).join(",") : "-1";
  for (const [t, order] of TABLES) {
    const r = await db.$queryRawUnsafe<Array<{ d: string | null; n: bigint }>>(`SELECT md5(string_agg(x::text, ',' ORDER BY ${order.split(",").map((c) => `x.${c.trim()}`).join(", ")})) d, count(*) n FROM "${t}" x`);
    out[t] = `${r[0]!.n}:${r[0]!.d ?? "-"}`;
  }
  const p = await db.$queryRawUnsafe<Array<{ d: string | null; n: bigint }>>(`SELECT md5(string_agg(x::text, ',' ORDER BY x.id)) d, count(*) n FROM "Player" x WHERE x.id NOT IN (${ex})`);
  out.Player = `${p[0]!.n}:${p[0]!.d ?? "-"}`;
  const s = await db.$queryRawUnsafe<Array<{ d: string | null; n: bigint }>>(
    `SELECT md5(string_agg(x::text, ',' ORDER BY x."playerId", x."skillId")) d, count(*) n FROM "PlayerSkill" x WHERE x."playerId" NOT IN (${ex})`,
  );
  out.PlayerSkill = `${s[0]!.n}:${s[0]!.d ?? "-"}`;
  return out;
}

/** The same rows with different popularity counters (not card data: must not count as a change). */
export function bumpCounters(rows: readonly FakeRow[], by = 1): FakeRow[] {
  return rows.map((r) => ({ ...r, views: Number(r.views ?? 0) + 100 * by, ratingCount: Number(r.ratingCount ?? 0) + by, avgRating: 1 + ((Number(r.avgRating ?? 0) + 0.37 * by) % 4) }));
}

/** Keys whose digest differs between two snapshots. */
export function digestDiff(a: Record<string, string>, b: Record<string, string>): string[] {
  return Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
}
