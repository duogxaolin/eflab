// Scratch database lifecycle for the worker tests (openspec change
// admin-sync-worker, task 5.6; reusable by later batches).
//
// Each suite has its own scratch database `eflab_synctest_<suite>` (worker.test.ts
// `_core`, incremental.test.ts `_inc`, full.test.ts `_full`; the name is a
// required argument, so two suites run in parallel never DROP … WITH (FORCE)
// each other's database). They live in the same local Postgres
// container as the live database (127.0.0.1:5433). Its URL is derived from the
// repo-root .env's DATABASE_URL by replacing ONLY the database name; nothing
// else from that file is read (the real efootbase key / R2 values never enter
// the test process). The URL is never printed. Every Prisma CLI call gets an
// explicit minimal environment whose DATABASE_URL is the maintenance database
// (CREATE / DROP) or the scratch database (migrate deploy) — never the live one.
//
//   const db = await setupScratchDb("eflab_synctest_<suite>"); // DROP IF EXISTS → CREATE → migrate deploy
//   if ("skip" in db) { console.log(db.skip); process.exit(0); }
//   process.env.DATABASE_URL = db.url;       // BEFORE importing @eflab/db
//   const { prisma } = await import("@eflab/db");
//   …
//   await prisma.$disconnect(); await db.drop();

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { REPO_ROOT, TEST_DATABASE_NAME_RE, databaseName } from "../../src/env.js";
import { isLoopbackHost } from "../../src/efootbase.js";

const DB_PACKAGE = resolve(REPO_ROOT, "packages/db");
const PRISMA_BIN = resolve(DB_PACKAGE, "node_modules/.bin/prisma");
const SCHEMA = resolve(DB_PACKAGE, "prisma/schema.prisma");

/** DATABASE_URL of the repo-root .env (shell value wins), or null. Only this one key is read. */
export function liveDatabaseUrl(): string | null {
  const fromShell = process.env.SYNC_TEST_BASE_DATABASE_URL?.trim();
  if (fromShell) return fromShell;
  const file = resolve(REPO_ROOT, ".env");
  if (!existsSync(file)) return null;
  const parsed = parseEnv(readFileSync(file, "utf8"));
  return parsed.DATABASE_URL?.trim() || null;
}

export interface ScratchUrls {
  scratch: string;
  maintenance: string;
  liveName: string;
}

/** Same server and credentials, database name replaced (scratch) or `postgres` (maintenance). */
export function scratchUrls(liveUrl: string, name: string): ScratchUrls {
  if (!TEST_DATABASE_NAME_RE.test(name)) throw new Error(`scratch database name must match ${TEST_DATABASE_NAME_RE}`);
  const u = new URL(liveUrl);
  if (!isLoopbackHost(u.hostname)) throw new Error(`scratch database: the Postgres host must be loopback (got ${u.hostname})`);
  const liveName = databaseName(liveUrl);
  if (liveName === name) throw new Error("scratch database: the live DATABASE_URL already names the scratch database — refusing");
  const scratch = new URL(u.toString());
  scratch.pathname = `/${name}`;
  const maintenance = new URL(u.toString());
  maintenance.pathname = "/postgres";
  return { scratch: scratch.toString(), maintenance: maintenance.toString(), liveName };
}

interface CliResult {
  code: number | null;
  output: string;
}

/** Runs the Prisma CLI with DATABASE_URL = `url` (minimal env); output is masked of the URL. */
function prismaCli(args: string[], url: string, stdin?: string): Promise<CliResult> {
  return new Promise((res) => {
    const child = spawn(PRISMA_BIN, args, {
      cwd: DB_PACKAGE,
      shell: false,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        DATABASE_URL: url,
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
        CHECKPOINT_DISABLE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
    child.stderr.on("data", (b: Buffer) => (out += b.toString("utf8")));
    child.on("error", (e) => res({ code: null, output: e.message }));
    child.on("close", (code) => {
      let masked = out.split(url).join("[database-url]");
      try {
        const pw = new URL(url).password;
        if (pw) masked = masked.split(pw).join("[redacted]").split(decodeURIComponent(pw)).join("[redacted]");
      } catch {
        /* ignore */
      }
      res({ code, output: masked });
    });
    child.stdin.end(stdin ?? "");
  });
}

const sqlExecute = (url: string, sql: string) => prismaCli(["db", "execute", "--schema", SCHEMA, "--stdin"], url, sql);

/**
 * Runs a SQL script (several statements, `DO $$ … $$` blocks included — e.g. a
 * migration file) on a SCRATCH database through `prisma db execute`; refuses any
 * other database name. Output masked of the URL.
 */
export async function executeScratchSql(url: string, sql: string): Promise<{ code: number | null; output: string }> {
  if (!TEST_DATABASE_NAME_RE.test(databaseName(url))) throw new Error("executeScratchSql: only a scratch database eflab_synctest*");
  return sqlExecute(url, sql);
}

const UNREACHABLE = /P1001|P1000|P1017|Can't reach database|ECONNREFUSED|connection refused|Authentication failed/i;

export type ScratchDb = { url: string; name: string; drop(): Promise<void> } | { skip: string };

/**
 * DROP IF EXISTS (WITH FORCE) → CREATE → `prisma migrate deploy` on the scratch
 * database. `timezone` (e.g. "America/New_York") becomes the database's session
 * TimeZone, so a suite runs with a non-UTC session (verify finding CR1: no
 * stored time may depend on it).
 */
export async function setupScratchDb(name: string, opts: { timezone?: string } = {}): Promise<ScratchDb> {
  const live = liveDatabaseUrl();
  if (!live) return { skip: "SKIP: no DATABASE_URL in the repo-root .env — the worker tests need the local Postgres (docker compose up -d)" };
  const urls = scratchUrls(live, name);
  const ping = await sqlExecute(urls.maintenance, "SELECT 1;");
  if (ping.code !== 0) {
    if (UNREACHABLE.test(ping.output)) {
      return { skip: "SKIP: local Postgres is unreachable (127.0.0.1:5433?) — start it with `docker compose up -d` to run the worker tests" };
    }
    throw new Error(`scratch database: cannot run SQL on the maintenance database:\n${ping.output}`);
  }
  const drop = async () => {
    const r = await sqlExecute(urls.maintenance, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
    if (r.code !== 0) throw new Error(`scratch database: DROP failed:\n${r.output}`);
  };
  await drop();
  const created = await sqlExecute(urls.maintenance, `CREATE DATABASE "${name}";`);
  if (created.code !== 0) throw new Error(`scratch database: CREATE failed:\n${created.output}`);
  const migrated = await prismaCli(["migrate", "deploy", "--schema", SCHEMA], urls.scratch);
  if (migrated.code !== 0) {
    await drop().catch(() => undefined);
    throw new Error(`scratch database: migrate deploy failed:\n${migrated.output}`);
  }
  if (opts.timezone) {
    if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(opts.timezone)) throw new Error("scratch database: timezone must look like Area/City");
    const tz = await sqlExecute(urls.maintenance, `ALTER DATABASE "${name}" SET timezone = '${opts.timezone}';`);
    if (tz.code !== 0) {
      await drop().catch(() => undefined);
      throw new Error(`scratch database: ALTER DATABASE … SET timezone failed:\n${tz.output}`);
    }
  }
  return { url: urls.scratch, name, drop };
}
