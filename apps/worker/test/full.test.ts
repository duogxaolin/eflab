// Full-run tests (openspec change admin-sync-worker, tasks 5.5 and 5.6). Same
// assert-style runner as worker.test.ts.
//
// The full run executes the REAL seed (packages/db/src/seed-efootbase-full.ts)
// as a child against the scratch database `eflab_synctest_full`, on a synthetic
// dump the fake source serves and a synthetic static snapshot (skills.json = []
// plus an empty skill-icons/). Safety as in incremental.test.ts: the fake source
// and a fake public bucket on 127.0.0.1 (ephemeral ports), the stand-in upload,
// the scratch database (dropped afterwards); the seed child gets the scratch URL
// explicitly and no --env-file.
//
// Run: pnpm --filter @eflab/worker test   (part of `pnpm test:unit`)

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYNC_BLOCK_HOURS, type SyncRunStats } from "@eflab/shared";
import { SEED_FALLBACK_R2_BASE } from "../src/catalogue.js";
import { isLoopbackHost } from "../src/efootbase.js";
import { DB_PACKAGE_DIR, SEED_ENTRY, loadWorkerEnv, seedChildEnv } from "../src/env.js";
import { FAKE_ID_BASE, fakeImage, startFakeSource, startForeignHost, type FakeSource } from "./harness/fake-efootbase.js";
import { startFakeBucket, type FakeBucket } from "./harness/fake-bucket.js";
import { setupScratchDb } from "./harness/scratch-db.js";
import { bumpCounters, catalogueDigests, digestDiff, seedableRows, writeStaticDir } from "./harness/synthetic.js";
import { TEST_SECRETS, guardFetch, workerTestEnv } from "./harness/test-env.js";

process.env.NODE_ENV = "test";
process.env.SYNC_TEST_MODE = "1";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const throws = (fn: () => unknown, re?: RegExp): boolean => {
  try {
    fn();
    return false;
  } catch (e) {
    return re ? re.test((e as Error).message) : true;
  }
};

const fetchGuard = guardFetch();

// ---- no database ----
{
  const seedSrc = readFileSync(join(DB_PACKAGE_DIR, SEED_ENTRY), "utf8");
  assert(seedSrc.includes(`?? "${SEED_FALLBACK_R2_BASE}"`), "the stored-URL fallback base = the seed's own fallback (duplicated constant)");
  const w = loadWorkerEnv(workerTestEnv({ databaseUrl: "postgresql://u:pw-1@127.0.0.1:5433/eflab_synctest_full", apiBase: "http://127.0.0.1:9/api", uploadDest: "/nonexistent", r2PublicBase: "http://127.0.0.1:9" }));
  assert(w.staticDir === null, "test mode: no EFOOTBASE_STATIC_DIR → no static directory (never the real dump/efootbase/static)");
  const se = seedChildEnv(w, { EFOOTBASE_DUMP_PATH: "/x" });
  assert(se.DATABASE_URL === "postgresql://u:pw-1@127.0.0.1:5433/eflab_synctest_full" && !("EFBASE_API_KEY" in se) && !("R2_SECRET_ACCESS_KEY" in se), "seed child env: the database URL, no key, no bucket secret");
  assert(throws(() => seedChildEnv(w, { EFBASE_API_KEY: "x" }), /EFOOTBASE_/), "seed child env: only EFOOTBASE_* location variables may be added");
  assert(throws(() => seedChildEnv({ ...w, databaseUrl: "postgresql://u:p@127.0.0.1:5433/eflab" }, {}), /scratch database/), "seed child env (test mode): a non-scratch database is refused");
}

const SCRATCH = "eflab_synctest_full";
const scratch = await setupScratchDb(SCRATCH, { timezone: "Asia/Ho_Chi_Minh" }); // a non-UTC session (CR1)
if ("skip" in scratch) {
  console.log(`\n${scratch.skip}`);
  console.log("(the database part of the full-run tests was SKIPPED)");
  fetchGuard.restore();
} else {
  process.env.DATABASE_URL = scratch.url;
  const { prisma } = await import("@eflab/db");
  const runner = await import("../src/runner.js");
  const { defaultHandlers } = await import("../src/handlers/index.js");
  const { fullPreflight, FULL_MIN_FREE_BYTES } = await import("../src/handlers/full.js");
  type WorkerDeps = import("../src/runner.js").WorkerDeps;
  type WorkerEnv = import("../src/env.js").WorkerEnv;

  const work = mkdtempSync(join(tmpdir(), "eflab-synctest-full-"));
  const uploadDest = join(work, "bucket");
  mkdirSync(uploadDest);
  const staticDir = writeStaticDir(join(work, "static"));
  let fake: FakeSource | null = null;
  let bucket: FakeBucket | null = null;
  try {
    const db = (await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0]?.db;
    assert(db === SCRATCH, `connected to the scratch database (${db})`);
    const sessionTz = (await prisma.$queryRaw<Array<{ TimeZone: string }>>`SHOW timezone`)[0]?.TimeZone;
    assert(sessionTz === "Asia/Ho_Chi_Minh", `the whole suite runs with a non-UTC session TimeZone (${sessionTz}), the seed child included (CR1)`);
    fake = await startFakeSource({ key: TEST_SECRETS.EFBASE_API_KEY, teams: [{ id: 1, name: "Test FC", emblem_images: {} }] });
    bucket = await startFakeBucket(uploadDest);
    const workerEnv = loadWorkerEnv({ ...workerTestEnv({ databaseUrl: scratch.url, apiBase: fake.apiBase, uploadDest, r2PublicBase: bucket.base }), EFOOTBASE_STATIC_DIR: staticDir });
    const deps = (env: WorkerEnv = workerEnv, now?: () => Date): WorkerDeps => ({ db: prisma, env, handlers: defaultHandlers, log: () => undefined, ...(now ? { now } : {}) });
    const runOnce = async (env: WorkerEnv = workerEnv, now?: () => Date) => {
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
      fake!.setMode("ok");
      fake!.setBlockAfter(null);
      const run = await prisma.syncRun.create({ data: { kind: "FULL", trigger: "MANUAL" } });
      const n0 = fake!.requests.length;
      const b0 = bucket!.requests.length;
      const t0 = Date.now() - 1;
      await runner.tick(deps(env, now));
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      return { row, stats: row.stats as SyncRunStats, reqs: fake!.requests.slice(n0), bucketReqs: bucket!.requests.slice(b0), t0 };
    };
    const stagingOf = (logTail: string) => /staging directory (\S+)/.exec(logTail)?.[1] ?? null;
    const leftovers = (id: number) => readdirSync(tmpdir()).filter((n) => n.startsWith(`eflab-sync-${id}-`));
    const uploadedSince = (since: number): string[] => {
      const out: string[] = [];
      const walk = (d: string, rel: string) => {
        for (const name of readdirSync(d)) {
          const p = join(d, name);
          if (statSync(p).isDirectory()) walk(p, `${rel}${name}/`);
          else if (name !== "_invocations.jsonl" && statSync(p).mtimeMs >= since) out.push(`${rel}${name}`);
        }
      };
      walk(uploadDest, "");
      return out.sort();
    };
    const id = (k: number) => BigInt(FAKE_ID_BASE + k);
    const T = Math.floor(Date.UTC(2026, 9, 18, 12) / 1000);

    // ---- pre-flight failures: before any request or write ----
    for (const [label, env, expect] of [
      ["missing static snapshot", { ...workerEnv, staticDir: writeStaticDir(join(work, "no-skills"), { skills: false }) }, /skills\.json/],
      ["missing skill icons", { ...workerEnv, staticDir: writeStaticDir(join(work, "no-icons"), { icons: false }) }, /skill-icons/],
      ["no R2_PUBLIC_BASE", { ...workerEnv, r2PublicBase: null }, /R2_PUBLIC_BASE/],
    ] as Array<[string, WorkerEnv, RegExp]>) {
      const before = await catalogueDigests(prisma);
      const { row, reqs, bucketReqs } = await runOnce(env);
      assert(row.status === "FAILED" && expect.test(row.error ?? "") && /no request was made/.test(row.error ?? ""), `${label}: FAILED naming it ("${row.error}")`);
      if (label === "missing static snapshot") assert((row.error ?? "").includes(join(work, "no-skills", "skills.json")), "missing static snapshot: the error names the file's path");
      assert(reqs.length === 0 && bucketReqs.length === 0, `${label}: no request at all`);
      assert(digestDiff(before, await catalogueDigests(prisma)).length === 0, `${label}: nothing was written`);
      assert(leftovers(row.id).length === 0, `${label}: no staging directory was created`);
    }
    {
      const ctx = { env: workerEnv } as unknown as import("../src/runner.js").RunContext;
      assert(throws(() => fullPreflight(ctx, () => FULL_MIN_FREE_BYTES - 1), /GB free/), "pre-flight: less than 2 GB free → refused");
      assert(!throws(() => fullPreflight(ctx, () => FULL_MIN_FREE_BYTES)), "pre-flight: 2 GB free → accepted");
    }

    // ---- first full run on an empty catalogue: 5 new cards ----
    const rows = seedableRows(5, { cdnBase: fake.cdnBase, newestTimeAdded: T });
    fake.setRows(rows);
    {
      // A fixed run clock (with milliseconds): the dump child gets it as --dumped-at, the seed child reads
      // it back from the staging manifest and stores it as the catalogue's dump date.
      const runClock = new Date(Math.floor(Date.now() / 1000) * 1000 + 123);
      const { row, stats, reqs, t0 } = await runOnce(workerEnv, () => runClock);
      assert(row.status === "OK", `first full run: OK (${row.error ?? ""})`);
      const meta = await prisma.catalogueMeta.findUniqueOrThrow({ where: { id: 1 } });
      const metaText = (await prisma.$queryRaw<Array<{ t: string | null }>>`SELECT "playersDumpedAt"::text AS t FROM "CatalogueMeta" WHERE id = 1`)[0]?.t;
      assert(meta.playersDumpedAt?.toISOString() === runClock.toISOString() && metaText === runClock.toISOString().replace("T", " ").replace("Z", ""),
        `first full run: the dump date = the run's --dumped-at ${runClock.toISOString()}, stored as UTC under the ${sessionTz} session (${meta.playersDumpedAt?.toISOString()}, column text ${metaText})`);
      assert(meta.seededAt !== null && meta.seededAt.getTime() >= t0 && meta.seededAt.getTime() <= Date.now(), "first full run: seededAt = the seed's own time");
      const byLeague = await prisma.player.groupBy({ by: ["leagueId"], _count: { _all: true } });
      assert(byLeague.length === 1 && byLeague[0]!.leagueId === 1 && byLeague[0]!._count._all === 5, `first full run: every card stores its own league (1) (${JSON.stringify(byLeague.map((g) => [g.leagueId, g._count._all]))})`);
      assert(stats.cardsNew === 5 && stats.cardsChanged === 0 && stats.cardsUnchanged === 0, `first full run: 5 new (${stats.cardsNew}/${stats.cardsChanged}/${stats.cardsUnchanged})`);
      assert((await prisma.player.count()) === 5 && (await prisma.skill.count()) > 0 && (await prisma.league.count()) > 0, "first full run: the seed wrote the players and the fixture catalogue");
      const api = reqs.filter((r) => r.path.startsWith("/api/")).map((r) => r.path);
      assert(api.includes("/api/meta") && api.includes("/api/teams") && api.includes("/api/packs") && api.includes("/api/players"), `first full run: meta, teams, packs and players dumped (${api.join(", ")})`);
      const up = uploadedSince(t0);
      assert(up.filter((p) => p.startsWith("cards/")).length === 10 && up.some((p) => p.startsWith("emblems/nationality/")), `first full run: 10 card images + the flag uploaded (${up.length} files)`);
      assert(stats.imagesDownloaded === 11 && stats.imagesUploaded === 11 && stats.imagesOverwritten === 0 && stats.imagesFailed === 0, `first full run: images 11 / 11 / overwritten 0 / failed 0 (${stats.imagesDownloaded}/${stats.imagesUploaded}/${stats.imagesOverwritten}/${stats.imagesFailed})`);
      const staging = stagingOf(row.logTail);
      assert(staging !== null && staging.startsWith(join(tmpdir(), `eflab-sync-${row.id}-`)) && leftovers(row.id).length === 0, "first full run: the staging directory (os.tmpdir()/eflab-sync-<runId>-…) was removed");
      assert(row.watermarkAfter?.getTime() === T * 1000, "first full run: watermark after = the newest card");
      assert(!row.logTail.includes("--prune") && !row.logTail.includes("--reset-users") && row.logTail.includes(" seed "), "first full run: the seed ran (no --prune / --reset-users)");
    }
    await prisma.$executeRaw`UPDATE "Player" SET stars = 5, reputation = 2, "ratingCF" = 91 WHERE id = ${id(1)}`;

    // ---- same source again: nothing changed (the comparison reads the seed's own rows back —
    //      non-ASCII names, fractional floats; the popularity counters moved, which is not a change) ----
    {
      fake.setRows(bumpCounters(rows));
      const { row, stats, bucketReqs } = await runOnce();
      assert(row.status === "OK" && stats.cardsNew === 0 && stats.cardsChanged === 0 && stats.cardsUnchanged === 5, `unchanged source: 0 new / 0 changed / 5 unchanged (${stats.cardsNew}/${stats.cardsChanged}/${stats.cardsUnchanged})`);
      assert(stats.imagesDownloaded === 0 && stats.imagesOverwritten === 0 && stats.imagesUploaded === 0, "unchanged source: no image downloaded or uploaded");
      assert(bucketReqs.every((r) => r.path.startsWith("/emblems/")), "unchanged source: only the emblem is checked against the bucket (no card selected)");
    }

    // ---- two edited cards (one with a new image) and a new card ----
    {
      const editedImage = `cards/${id(2)}_dynamic.webp`;
      fake.setImage(editedImage, fakeImage("edited-art-v2"));
      const fresh = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 3600, startIndex: 5 });
      fake.setRows([...fresh, ...rows.map((r, i) => (i === 1 ? { ...r, finishing: 97 } : i === 2 ? { ...r, speed: 88 } : r))]);
      const { row, stats, reqs, t0 } = await runOnce();
      assert(row.status === "OK", `edited cards: OK (${row.error ?? ""})`);
      assert(stats.cardsNew === 1 && stats.cardsChanged === 2 && stats.cardsUnchanged === 3, `edited cards: 1 new / 2 changed / 3 unchanged (${stats.cardsNew}/${stats.cardsChanged}/${stats.cardsUnchanged})`);
      const p1 = await prisma.player.findUniqueOrThrow({ where: { id: id(1) } });
      assert(p1.finishing === 97 && p1.stars === 5 && p1.reputation === 2 && p1.ratingCF === 91, "edited cards: the seed rewrote the stat and kept the cross-fill values");
      const up = uploadedSince(t0);
      const expected = [editedImage, `cards/${id(5)}_dynamic.webp`, `cards/${id(5)}_transparent.webp`].sort();
      assert(JSON.stringify(up) === JSON.stringify(expected), `edited cards: only the new card's images and the one differing image were uploaded (${up.join(", ")})`);
      assert(readFileSync(join(uploadDest, editedImage)).equals(fakeImage("edited-art-v2")), "edited cards: the bucket now holds the new art");
      assert(stats.imagesOverwritten === 1 && stats.imagesDownloaded === 3 && stats.imagesUploaded === 3, `edited cards: overwritten 1, downloaded 3, uploaded 3 (${stats.imagesOverwritten}/${stats.imagesDownloaded}/${stats.imagesUploaded})`);
      assert(/overwritten in the bucket — raise the web build's image version/.test(row.logTail), "edited cards: the log tells to raise the image version");
      const gets = reqs.filter((r) => r.path.startsWith("/cdn/") && r.method === "GET").map((r) => r.path.replace("/cdn/", "")).sort();
      assert(JSON.stringify(gets) === JSON.stringify(expected), `edited cards: the unchanged image of an edited card was not downloaded (${gets.join(", ")})`);
      assert(leftovers(row.id).length === 0, "edited cards: the staging directory was removed");
    }

    // ---- seed failure: the catalogue holds exactly the rows it held, staging removed ----
    {
      const broken = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 7200, startIndex: 6, extra: () => ({ team_name: "Broken FC", league: 999 }) });
      fake.setRows([...broken, ...rows]);
      const before = await catalogueDigests(prisma);
      const { row, reqs } = await runOnce();
      assert(row.status === "FAILED" && /the seed failed/.test(row.error ?? "") && /catalogue is unchanged/.test(row.error ?? ""), `seed failure: FAILED with the seed's message ("${(row.error ?? "").slice(0, 300)}")`);
      assert(/Foreign key|foreign key|leagueId|Team_leagueId/i.test(row.error ?? ""), "seed failure: the seed's own error is quoted");
      assert(digestDiff(before, await catalogueDigests(prisma)).length === 0, "seed failure: every catalogue table holds exactly the rows it held");
      assert(reqs.every((r) => r.path.startsWith("/api/")), "seed failure: no image request after the failed seed");
      const staging = stagingOf(row.logTail);
      assert(staging !== null && leftovers(row.id).length === 0, "seed failure: the staging directory was removed");
    }

    // ---- BLOCKED during the dump: no further request, catalogue unchanged ----
    {
      fake.setRows(rows);
      const before = await catalogueDigests(prisma);
      const run = await prisma.syncRun.create({ data: { kind: "FULL", trigger: "MANUAL" } });
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null } });
      fake.setMode("ok");
      fake.setBlockAfter(1); // meta answers, the 2nd request (teams) gets 403
      const n0 = fake.requests.length;
      const t0 = Date.now();
      await runner.tick(deps());
      const r = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const cfg = await prisma.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
      const reqs = fake.requests.slice(n0);
      assert(r.status === "BLOCKED", `blocked during the dump: BLOCKED ("${r.error}")`);
      assert(reqs.length === 2 && reqs[1]!.path === "/api/teams", `blocked during the dump: no request after the 403 (${reqs.map((q) => q.path).join(", ")})`);
      const until = cfg.blockedUntil?.getTime() ?? 0;
      assert(until >= t0 + SYNC_BLOCK_HOURS * 3600_000 - 1000, "blocked during the dump: blockedUntil = now + 6 h");
      assert(digestDiff(before, await catalogueDigests(prisma)).length === 0 && leftovers(r.id).length === 0, "blocked during the dump: catalogue unchanged, staging removed");
      fake.setBlockAfter(null);
    }

    // ---- hostile image references (verify finding C1): refused BEFORE the seed ----
    {
      const foreign = await startForeignHost();
      try {
        const cases: Array<[string, () => void, RegExp]> = [
          ["teams.json emblem kind ../../../ESCAPE", () => fake!.setTeams([{ id: 1, name: "Test FC", emblem_images: { "../../../ESCAPE": `${fake!.cdnBase}/emblems/t.png` } }]), /not an emblem kind/],
          ["teams.json emblem on another loopback port", () => fake!.setTeams([{ id: 1, name: "Test FC", emblem_images: { team: `${foreign.origin}/emblems/team/t.png` } }]), /not an allowed emblem URL/],
          [
            "card render on another loopback port",
            () => fake!.setRows([...rows.map((r, i) => (i === 0 ? { ...r, card_images: { ...(r.card_images as object), dynamic: `${foreign.origin}/cards/0_d.webp` } } : r))]),
            /card_images\.dynamic is not an allowed image URL/,
          ],
        ];
        for (const [label, arrange, expect] of cases) {
          fake.setRows(rows);
          fake.setTeams([{ id: 1, name: "Test FC", emblem_images: {} }]);
          arrange();
          const before = await catalogueDigests(prisma);
          const { row, reqs } = await runOnce();
          assert(row.status === "FAILED" && expect.test(row.error ?? "") && /refused \(source data\)/.test(row.error ?? ""), `hostile ${label}: FAILED before the seed ("${(row.error ?? "").slice(0, 200)}")`);
          assert(!row.logTail.includes("seed finished") && digestDiff(before, await catalogueDigests(prisma)).length === 0, `hostile ${label}: the seed did not run, the catalogue is unchanged`);
          assert(reqs.every((r) => r.path.startsWith("/api/")) && foreign.requests.length === 0 && leftovers(row.id).length === 0, `hostile ${label}: no image request, nothing to the foreign host, staging removed`);
        }
      } finally {
        fake.setTeams([{ id: 1, name: "Test FC", emblem_images: {} }]);
        fake.setRows(rows);
        await foreign.close();
      }
    }

    // ---- W-a: what only the dump script refuses fails the run BEFORE the seed (dry --validate-only pass) ----
    {
      fake.setRows(rows);
      fake.setTeams(["not an object"] as unknown as Array<Record<string, unknown>>);
      const before = await catalogueDigests(prisma);
      const { row, reqs } = await runOnce();
      fake.setTeams([{ id: 1, name: "Test FC", emblem_images: {} }]);
      assert(row.status === "FAILED" && /the validate step failed/.test(row.error ?? "") && /not an object/.test(row.error ?? ""), `W-a: a teams.json entry the script refuses → FAILED in the validate pass ("${(row.error ?? "").slice(0, 220)}")`);
      assert(!row.logTail.includes("seed finished") && digestDiff(before, await catalogueDigests(prisma)).length === 0 && reqs.every((r) => r.path.startsWith("/api/")), "W-a: the seed did not run, the catalogue is unchanged, no image request");
    }

    // ---- CR2: a card whose image step failed after the seed is compared again by the next full run ----
    {
      const art = `cards/${id(3)}_dynamic.webp`;
      fake.setImage(art, fakeImage("pending-art-v3"));
      fake.setRows(rows.map((r, i) => (i === 3 ? { ...r, finishing: 91 } : r)));
      fake.setCdnMode("403");
      const a = await runOnce();
      fake.setCdnMode("ok");
      const aPending = (a.row.stats as { imagesPendingIds?: number[] }).imagesPendingIds ?? [];
      const p3 = await prisma.player.findUniqueOrThrow({ where: { id: id(3) } });
      assert(a.row.status === "BLOCKED" && p3.finishing === 91 && aPending.includes(Number(id(3))), `CR2 run A: the seed committed, the image step was blocked, the card's id is kept as pending (${a.row.status}, pending ${aPending.join(",")})`);
      const b = await runOnce();
      const gets = b.reqs.filter((r) => r.path.startsWith("/cdn/") && r.method === "GET").map((r) => r.path);
      const bStats = b.stats as { imagesPendingIds?: number[] };
      assert(b.row.status === "OK" && b.stats.cardsChanged === 0 && gets.join() === `/cdn/${art}`, `CR2 run B: the card is unchanged by its row, yet its image is compared and downloaded (${b.row.status}, changed ${b.stats.cardsChanged}, GET ${gets.join(", ") || "none"})`);
      assert(b.stats.imagesOverwritten === 1 && readFileSync(join(uploadDest, art)).equals(fakeImage("pending-art-v3")) && bStats.imagesPendingIds === undefined, "CR2 run B: the bucket holds the new art (1 overwritten), nothing is pending any more");
      const c = await runOnce();
      assert(c.row.status === "OK" && c.reqs.every((r) => !(r.path.startsWith("/cdn/cards/") && r.method === "GET")), "CR2 run C: after an OK run nothing is carried over (no card image request)");
    }

    // ---- third verify W1: one persistent image error does not keep the full run FAILED ----
    {
      const badPath = `cards/${id(2)}_dynamic.webp`;
      fake.setRows(rows.map((r, i) => (i === 2 ? { ...r, speed: 66 } : i === 3 ? { ...r, finishing: 91 } : r)));
      fake.setBrokenImage(badPath, true);
      const e = await runOnce();
      const ePending = (e.stats as { imagesPendingIds?: number[] }).imagesPendingIds ?? [];
      const p2 = await prisma.player.findUniqueOrThrow({ where: { id: id(2) } });
      assert(e.row.status === "OK" && p2.speed === 66 && (e.stats.imagesFailed ?? 0) === 1 && ePending.join() === String(Number(id(2))),
        `W1 full: one bad image → the run is OK (not FAILED), the card written, 1 failed, the card owed (${e.row.status}: ${e.row.error ?? ""}; pending ${ePending.join(",")})`);
      fake.setBrokenImage(badPath, false);
      fake.setImage(badPath, fakeImage("bad-then-good"));
      const f = await runOnce();
      const gets = f.reqs.filter((r) => r.path.startsWith("/cdn/cards/") && r.method === "GET").map((r) => r.path);
      assert(f.row.status === "OK" && f.stats.cardsChanged === 0 && gets.join() === `/cdn/${badPath}` && readFileSync(join(uploadDest, badPath)).equals(fakeImage("bad-then-good")) && (f.stats as { imagesPendingIds?: number[] }).imagesPendingIds === undefined,
        `W1 full: the next full run compares the owed card (unchanged row) and uploads its image; nothing owed afterwards (GET ${gets.join(", ") || "none"})`);
    }

    // ---- W-d: a cancel while the seed is inside its transaction does not kill it ----
    // Another session holds a lock on "Player" (the handler's SELECTs pass, the seed's upsert waits), the
    // cancel arrives, then the lock is released: the seed commits, the run is NOT recorded CANCELLED, and
    // the pending image ids were written before the seed.
    {
      fake.setRows(rows.map((r, i) => (i === 3 ? { ...r, finishing: 91 } : i === 4 ? { ...r, speed: 77 } : r)));
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null } });
      fake.setMode("ok");
      let locked!: () => void;
      let release!: () => void;
      const isLocked = new Promise<void>((r) => (locked = r));
      const released = new Promise<void>((r) => (release = r));
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`LOCK TABLE "Player" IN SHARE ROW EXCLUSIVE MODE`;
          locked();
          await released;
        },
        { timeout: 180_000, maxWait: 10_000 },
      );
      await isLocked;
      const run = await prisma.syncRun.create({ data: { kind: "FULL", trigger: "MANUAL" } });
      const p = runner.tick({ ...deps(), cancelPollMs: 100 });
      let waiting = 0;
      for (let i = 0; i < 2400 && waiting === 0; i++) {
        await new Promise((r) => setTimeout(r, 50));
        waiting = Number((await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)[0]!.n);
      }
      const mid = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const midPending = (mid.stats as { imagesPendingIds?: number[] }).imagesPendingIds ?? [];
      assert(waiting > 0 && midPending.includes(Number(id(4))), `W-d: the seed waits inside its transaction; the pending image ids are already on the run row (${midPending.join(",")})`);
      await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
      await new Promise((r) => setTimeout(r, 800)); // the cancel poll (100 ms) has fired
      release();
      await holder;
      await p;
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const p4 = await prisma.player.findUniqueOrThrow({ where: { id: id(4) } });
      const endPending = (row.stats as { imagesPendingIds?: number[] }).imagesPendingIds ?? [];
      assert(p4.speed === 77, `W-d: the seed was not killed — its transaction committed (speed ${p4.speed})`);
      assert(row.status === "FAILED" && /cancel requested by an admin after the database write had committed \(the seed/.test(row.error ?? "") && endPending.includes(Number(id(4))), `W-d: not CANCELLED once the seed committed; the images it did not compare stay pending (${row.status}: ${(row.error ?? "").slice(0, 200)})`);
      assert((await prisma.syncRun.count({ where: { status: "RUNNING" } })) === 0 && leftovers(row.id).length === 0, "W-d: no run left RUNNING, staging removed");
    }

    // ---- secrets never stored ----
    {
      const runs = await prisma.syncRun.findMany();
      const stored = runs.map((r) => `${r.logTail}\n${r.error ?? ""}\n${JSON.stringify(r.stats)}`).join("\n");
      const leaked = Object.entries(TEST_SECRETS).filter(([, v]) => stored.includes(v)).map(([k]) => k);
      assert(leaked.length === 0, `no secret value in any stored log / error / stats (leaked: ${leaked.join(", ") || "none"})`);
      const pw = new URL(scratch.url).password;
      assert(!stored.includes(scratch.url) && (pw === "" || !stored.includes(decodeURIComponent(pw))), "the database URL / password is never stored (the seed child had it)");
    }

    assert(fetchGuard.refused.length === 0, "no request left the machine (fetch guard)");
    const hosts = new Set([...fake.requests.map((r) => r.headers.host), ...bucket.requests.map((r) => r.host)]);
    assert([...hosts].every((h) => typeof h === "string" && isLoopbackHost(h.replace(/:\d+$/, ""))), `every request went to the local fake source / bucket (${[...hosts].join(", ")})`);
    assert(fake.apiRequests().every((r) => r.headers["x-api-key"] === TEST_SECRETS.EFBASE_API_KEY), "every API request carried the (synthetic) key header");
  } finally {
    await fake?.close();
    await bucket?.close();
    fetchGuard.restore();
    await prisma.$disconnect();
    rmSync(work, { recursive: true, force: true });
    await scratch.drop();
    console.log(`scratch database ${scratch.name} dropped`);
  }
}

if (process.exitCode) console.error("\nfull-run tests FAILED");
else console.log("\nfull-run tests passed");
