// Incremental-run tests (openspec change admin-sync-worker, tasks 5.4 and 5.6).
// Same assert-style runner as worker.test.ts.
//
// Safety: the source is the local fake server (127.0.0.1, ephemeral port) and
// the dump child gets it through --api-base; card / emblem URLs of the fake rows
// point at the fake server's /cdn; uploads go to the stand-in command; stored
// URLs use a loopback fake bucket base. The database is the scratch database
// `eflab_synctest_inc` (created, migrated, seeded from a synthetic dump with the
// real seed, and dropped here). Only DATABASE_URL is read from the repo-root
// .env, to derive the scratch URL.
//
// Run: pnpm --filter @eflab/worker test   (part of `pnpm test:unit`)

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYNC_BLOCK_HOURS, SYNC_WATERMARK_MARGIN_SECONDS, type SyncRunStats } from "@eflab/shared";
import { isLoopbackHost } from "../src/efootbase.js";
import { loadWorkerEnv } from "../src/env.js";
import { FAKE_ID_BASE, fakeImage, startFakeSource, startForeignHost, startThirdPartyHost, type FakeSource } from "./harness/fake-efootbase.js";
import { startFakeBucket, type FakeBucket } from "./harness/fake-bucket.js";
import { setupScratchDb } from "./harness/scratch-db.js";
import { bumpCounters, catalogueDigests, digestDiff, runRealSeed, seedableRows, writeDumpDir, writeStaticDir } from "./harness/synthetic.js";
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

const fetchGuard = guardFetch();
const SCRATCH = "eflab_synctest_inc";
const scratch = await setupScratchDb(SCRATCH, { timezone: "America/New_York" }); // a non-UTC session (CR1)
if ("skip" in scratch) {
  console.log(`\n${scratch.skip}`);
  console.log("(the incremental-run tests were SKIPPED)");
  fetchGuard.restore();
} else {
  process.env.DATABASE_URL = scratch.url;
  const { prisma } = await import("@eflab/db");
  const runner = await import("../src/runner.js");
  const { defaultHandlers } = await import("../src/handlers/index.js");
  type WorkerDeps = import("../src/runner.js").WorkerDeps;

  const work = mkdtempSync(join(tmpdir(), "eflab-synctest-inc-"));
  const uploadDest = join(work, "bucket");
  const staticDir = writeStaticDir(join(work, "static"));
  let fake: FakeSource | null = null;
  let bucket: FakeBucket | null = null;
  let thirdParty: Awaited<ReturnType<typeof startThirdPartyHost>> | null = null;
  try {
    const db = (await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`)[0]?.db;
    assert(db === SCRATCH, `connected to the scratch database (${db})`);
    const sessionTz = (await prisma.$queryRaw<Array<{ TimeZone: string }>>`SHOW timezone`)[0]?.TimeZone;
    assert(sessionTz === "America/New_York", `the whole suite runs with a non-UTC session TimeZone (${sessionTz}) — every stored time is checked exactly below (CR1)`);
    fake = await startFakeSource({ key: TEST_SECRETS.EFBASE_API_KEY });
    bucket = await startFakeBucket(uploadDest);
    thirdParty = await startThirdPartyHost();
    const workerEnv = loadWorkerEnv({
      ...workerTestEnv({ databaseUrl: scratch.url, apiBase: fake.apiBase, uploadDest, r2PublicBase: bucket.base }),
      EFOOTBASE_STATIC_DIR: staticDir,
      EFBASE_TEST_THIRD_PARTY_BASE: thirdParty.origin,
    });
    const deps = (over: Partial<WorkerDeps> = {}): WorkerDeps => ({ db: prisma, env: workerEnv, handlers: defaultHandlers, log: () => undefined, ...over });
    const queue = () => prisma.syncRun.create({ data: { kind: "INCREMENTAL", trigger: "MANUAL" } });
    const runOnce = async () => {
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
      fake!.setMode("ok");
      fake!.setBlockAfter(null);
      const run = await queue();
      const n0 = fake!.requests.length;
      await runner.tick(deps());
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      return { row, stats: row.stats as SyncRunStats, reqs: fake!.requests.slice(n0) };
    };
    const lastUpload = (): string[] => {
      const lines = readFileSync(join(uploadDest, "_invocations.jsonl"), "utf8").trim().split("\n");
      return (JSON.parse(lines[lines.length - 1]!) as { argv: string[] }).argv;
    };
    const uploadCount = (): number => {
      try {
        return readFileSync(join(uploadDest, "_invocations.jsonl"), "utf8").trim().split("\n").length;
      } catch {
        return 0;
      }
    };
    const filesUnder = (dir: string, since: number): string[] => {
      const out: string[] = [];
      const walk = (d: string, rel: string) => {
        for (const name of readdirSync(d)) {
          const p = join(d, name);
          if (statSync(p).isDirectory()) walk(p, `${rel}${name}/`);
          else if (name !== "_invocations.jsonl" && statSync(p).mtimeMs >= since) out.push(`${rel}${name}`);
        }
      };
      walk(dir, "");
      return out.sort();
    };
    const leftoverRunDirs = (id: number) => readdirSync(tmpdir()).filter((n) => n.startsWith(`eflab-sync-${id}-`));

    // ---- empty database → refused, no request ----
    {
      const { row, reqs } = await runOnce();
      assert(row.status === "FAILED" && /no cards/.test(row.error ?? "") && /full sync/.test(row.error ?? ""), `empty database: FAILED "${row.error}"`);
      assert(reqs.length === 0, "empty database: no request was made");
    }

    // ---- baseline: the real seed on a synthetic dump (5 cards, 2 days before the source's newest) ----
    const T = Math.floor(Date.UTC(2026, 9, 18, 12) / 1000);
    const baseline = seedableRows(5, { cdnBase: fake.cdnBase, newestTimeAdded: T - 2 * 86400 });
    const baselineDir = join(work, "baseline");
    writeDumpDir(baselineDir, baseline);
    const seeded = await runRealSeed({ databaseUrl: scratch.url, dumpDir: baselineDir, staticDir, r2PublicBase: bucket.base });
    assert(seeded.code === 0, `baseline seeded with the real seed (exit ${seeded.code})`);
    if (seeded.code !== 0) console.error(seeded.output.split("\n").slice(-15).join("\n"));
    const id = (k: number) => BigInt(FAKE_ID_BASE + k);
    const leagueOf = async (pid: bigint) => (await prisma.player.findUnique({ where: { id: pid }, select: { leagueId: true } }))?.leagueId;
    // The seed stores each card's own league (fixture league 1 for the synthetic rows) — the reference
    // value the incremental write must reproduce for the same row shape (catalogue-data-refresh "Card League").
    {
      const seededLeagues = await prisma.player.groupBy({ by: ["leagueId"], _count: { _all: true } });
      assert(seededLeagues.length === 1 && seededLeagues[0]!.leagueId === 1 && seededLeagues[0]!._count._all === 5, `baseline seed: the 5 cards store their own league 1 (${JSON.stringify(seededLeagues.map((g) => [g.leagueId, g._count._all]))})`);
      const meta = await prisma.catalogueMeta.findUniqueOrThrow({ where: { id: 1 } });
      assert(meta.playersDumpedAt === null && meta.seededAt !== null && /manifest\.json missing — the stored dump date/.test(seeded.output), "baseline seed without a manifest: the dump date stays unknown (kept, with a notice), seededAt written");
    }
    // Cross-fill values on card 0 (columns the efootbase write paths never touch).
    await prisma.$executeRaw`UPDATE "Player" SET stars = 4, reputation = 3, "overallPotential" = 77, "communityTier" = 'S', "ratingCF" = 88, "gkClearing" = 41 WHERE id = ${id(0)}`;
    const crossfill = async (pid: bigint) =>
      JSON.stringify(await prisma.player.findUniqueOrThrow({ where: { id: pid }, select: { stars: true, reputation: true, overallPotential: true, communityTier: true, ratingCF: true, gkClearing: true } }));
    const crossfillBefore = await crossfill(id(0));
    // The bucket already holds the baseline cards' images (as after a real full run), so a rewritten
    // card's unchanged image reads "same" and only a differing one is replaced (CR2).
    for (const r of baseline) {
      for (const k of ["transparent", "dynamic"]) {
        const rel = `cards/${r.id}_${k}.webp`;
        mkdirSync(join(uploadDest, "cards"), { recursive: true });
        writeFileSync(join(uploadDest, rel), fake.imageBytes(rel));
      }
    }

    // ---- no R2_PUBLIC_BASE → refused before any request (the rewritten cards' images are compared with the bucket) ----
    {
      const n0 = fake.requests.length;
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, enabled: false } });
      const run = await queue();
      await runner.tick(deps({ env: { ...workerEnv, r2PublicBase: null } }));
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      assert(row.status === "FAILED" && /R2_PUBLIC_BASE/.test(row.error ?? "") && /no request was made/.test(row.error ?? "") && fake.requests.length === n0, `no R2_PUBLIC_BASE: FAILED before any request ("${row.error}")`);
    }

    // ---- 3 new cards, nothing else changed → only 3 rows added, every other row byte-identical ----
    {
      const fresh = seedableRows(3, { cdnBase: fake.cdnBase, newestTimeAdded: T, startIndex: 5 });
      // The re-seen baseline cards come back with other popularity counters: not a change, not rewritten.
      fake.setRows([...fresh, ...bumpCounters(baseline)]);
      const before = await catalogueDigests(prisma);
      const players0 = await prisma.player.count();
      const t0 = Date.now() - 1;
      const ups0 = uploadCount();
      const { row, stats, reqs } = await runOnce();
      const newIds = [id(5), id(6), id(7)];
      const after = await catalogueDigests(prisma, newIds);
      assert(row.status === "OK", `new cards: run OK (${row.error ?? ""})`);
      assert((await prisma.player.count()) === players0 + 3 && (await prisma.player.count({ where: { id: { in: newIds } } })) === 3, "new cards: the database gained exactly the 3 new players");
      assert(digestDiff(before, after).length === 0, `new cards: every other row of every catalogue table is byte-identical (differs: ${digestDiff(before, after).join(", ") || "none"})`);
      assert(stats.cardsNew === 3 && stats.cardsChanged === 0 && stats.cardsUnchanged === 5, `new cards: stats new 3 / changed 0 / unchanged 5 (${stats.cardsNew}/${stats.cardsChanged}/${stats.cardsUnchanged})`);
      const links = await prisma.playerSkill.count({ where: { playerId: { in: newIds } } });
      assert(links === fresh.filter((r) => r.s_one_touch_pass).length, `new cards: their skill links were written (${links})`);
      const newLeagues = await Promise.all(newIds.map(leagueOf));
      assert(newLeagues.every((l) => l === 1), `new cards: each stores its own league 1, as the seed does for the same rows (${newLeagues.join(", ")})`);
      const api = reqs.filter((r) => r.path.startsWith("/api/"));
      assert(api.length === 2 && api[0]!.path === "/api/meta" && api[1]!.path === "/api/players", `new cards: 2 API requests — meta, then one newest-first page (${api.map((r) => r.path).join(", ")})`);
      assert(api[1]!.query.get("sort") === "time_added" && api[1]!.query.get("order") === "desc" && api[1]!.query.get("page") === "1", "new cards: players page requested newest first");
      const cdn = reqs.filter((r) => r.path.startsWith("/cdn/")).map((r) => r.path).sort();
      const expectCards = newIds.flatMap((p) => [`/cdn/cards/${p}_dynamic.webp`, `/cdn/cards/${p}_transparent.webp`]).sort();
      assert(JSON.stringify(cdn) === JSON.stringify(expectCards), `new cards: images of the new cards only, no known emblem (${cdn.length} CDN requests)`);
      assert(uploadCount() === ups0 + 1 && lastUpload().includes("--no-resume") && lastUpload().includes("--prefix"), "new cards: one upload with --no-resume");
      const uploaded = filesUnder(uploadDest, t0);
      assert(JSON.stringify(uploaded) === JSON.stringify(expectCards.map((p) => p.replace("/cdn/", ""))), `new cards: the 6 new card images were uploaded (${uploaded.join(", ")})`);
      assert(stats.imagesDownloaded === 6 && stats.imagesUploaded === 6 && stats.imagesOverwritten === 0 && stats.imagesFailed === 0, "new cards: images downloaded 6 / uploaded 6 / overwritten 0 / failed 0");
      assert(stats.pages === 1 && stats.requests === 2 + 6, `new cards: pages 1, requests 8 (${stats.pages}, ${stats.requests})`);
      const wb = (T - 2 * 86400 - SYNC_WATERMARK_MARGIN_SECONDS) * 1000;
      assert(row.watermarkBefore?.getTime() === wb && row.watermarkAfter?.getTime() === T * 1000, "new cards: watermark before = newest in the database − 7 days, after = the newest card written");
      assert(leftoverRunDirs(row.id).length === 0, "new cards: the working directory was removed");
      assert((await crossfill(id(0))) === crossfillBefore, "new cards: cross-fill values untouched");
    }

    // ---- a re-seen card edited at the source + a card with a new country and team ----
    {
      const edited = baseline.map((r, i) => (i === 0 ? { ...r, finishing: 95, overall_rating: 81 } : r));
      const fresh = seedableRows(3, { cdnBase: fake.cdnBase, newestTimeAdded: T, startIndex: 5 });
      const hashOf = (s: string) => `${Buffer.from(s).toString("hex").padEnd(32, "0").slice(0, 32)}`;
      const newland = seedableRows(1, {
        cdnBase: fake.cdnBase,
        newestTimeAdded: T + 60,
        startIndex: 8,
        extra: () => ({
          nationality: "Newland",
          team_name: "New FC",
          league: 2,
          emblem_images: {
            nationality: `${fake!.cdnBase}/emblems/nationality/${hashOf("newland")}.png`,
            team: `${fake!.cdnBase}/emblems/team/${hashOf("newfc")}.png`,
            league: null,
          },
        }),
      });
      fake.setRows([...newland, ...fresh, ...edited]);
      // the edited card's dynamic render changed at the source too; its transparent render did not
      const editedArt = `cards/${id(0)}_dynamic.webp`;
      fake.setImage(editedArt, fakeImage("edited-art-v2"));
      const maxCountry = (await prisma.country.aggregate({ _max: { id: true } }))._max.id ?? 0;
      const maxTeam = (await prisma.team.aggregate({ _max: { id: true } }))._max.id ?? 0;
      const before = await catalogueDigests(prisma, [id(0), id(8)]);
      const t0 = Date.now() - 1;
      const { row, stats, reqs } = await runOnce();
      const p0 = await prisma.player.findUniqueOrThrow({ where: { id: id(0) } });
      assert(row.status === "OK", `edited card: run OK (${row.error ?? ""})`);
      assert(p0.finishing === 95 && p0.ovr === 81, "edited card: the seed-owned columns were rewritten");
      assert((await crossfill(id(0))) === crossfillBefore, "edited card: the cross-fill columns kept their values (stars, reputation, potential, tier, ratingCF, gkClearing)");
      assert(stats.cardsNew === 1 && stats.cardsChanged === 1 && stats.cardsUnchanged === 7, `edited card: stats new 1 / changed 1 / unchanged 7 (${stats.cardsNew}/${stats.cardsChanged}/${stats.cardsUnchanged})`);
      const country = await prisma.country.findFirst({ where: { name: "Newland" } });
      const team = await prisma.team.findFirst({ where: { name: "New FC" } });
      const p8 = await prisma.player.findUnique({ where: { id: id(8) } });
      assert(country?.id === maxCountry + 1 && country.flagUrl === `${bucket.base}/emblems/nationality/${hashOf("newland")}.png`, "new country inserted with the next free id and its flag URL");
      assert(team?.id === maxTeam + 1 && team.countryId === country?.id && team.leagueId === 2 && team.national === false, "new team inserted with the next free id, its country and league");
      assert(p8?.nationalityId === country?.id && p8?.teamId === team?.id, "the new card points at the new country and team");
      assert(p8?.leagueId === 2, `the new card stores its own league 2 (${p8?.leagueId})`);
      const changedTables = digestDiff(before, await catalogueDigests(prisma, [id(0), id(8)]));
      assert(JSON.stringify(changedTables) === JSON.stringify(["Country", "Team"]), `only the inserted Country / Team rows were added elsewhere (differs: ${changedTables.join(", ")})`);
      const cdnGets = reqs.filter((r) => r.path.startsWith("/cdn/") && r.method === "GET").map((r) => r.path).sort();
      assert(
        JSON.stringify(cdnGets) ===
          JSON.stringify([`/cdn/cards/${id(8)}_dynamic.webp`, `/cdn/cards/${id(8)}_transparent.webp`, `/cdn/emblems/nationality/${hashOf("newland")}.png`, `/cdn/emblems/team/${hashOf("newfc")}.png`, `/cdn/${editedArt}`].sort()),
        `images (CR2): the new card, the two new emblems AND the rewritten card's changed render — not its unchanged one (${cdnGets.join(", ")})`,
      );
      const cdnHeads = reqs.filter((r) => r.path.startsWith("/cdn/") && r.method === "HEAD").map((r) => r.path).sort();
      assert(JSON.stringify(cdnHeads) === JSON.stringify([`/cdn/cards/${id(0)}_dynamic.webp`, `/cdn/cards/${id(0)}_transparent.webp`]), `images (CR2): the rewritten card's two renders were ETag-compared (HEAD ${cdnHeads.join(", ")})`);
      assert(filesUnder(uploadDest, t0).length === 5 && stats.imagesUploaded === 5, `images: 5 files uploaded (${filesUnder(uploadDest, t0).join(", ")})`);
      assert(stats.imagesOverwritten === 1 && readFileSync(join(uploadDest, editedArt)).equals(fakeImage("edited-art-v2")), `images (CR2): 1 overwritten — the bucket now holds the rewritten card's new render (${stats.imagesOverwritten})`);
      assert(/overwritten in the bucket — raise the web build's image version/.test(row.logTail) && /validate-only: \d+ image URLs, 0 refused/.test(row.logTail), "images: the log tells to raise the image version; the dry validate pass ran");
    }

    // ---- validation aborts: nothing written, no image request ----
    const validationCase = async (label: string, extra: Record<string, unknown>, expect: RegExp) => {
      const bad = seedableRows(1, { cdnBase: fake!.cdnBase, newestTimeAdded: T + 600, startIndex: 20, extra: () => extra });
      const good = seedableRows(1, { cdnBase: fake!.cdnBase, newestTimeAdded: T + 500, startIndex: 21 });
      fake!.setRows([...bad, ...good, ...baseline]);
      const before = await catalogueDigests(prisma);
      const ups0 = uploadCount();
      const { row, reqs } = await runOnce();
      assert(row.status === "FAILED" && expect.test(row.error ?? ""), `${label}: FAILED naming it ("${row.error}")`);
      assert(digestDiff(before, await catalogueDigests(prisma)).length === 0, `${label}: nothing was written (every catalogue table identical)`);
      assert(reqs.every((r) => r.path.startsWith("/api/")) && uploadCount() === ups0, `${label}: no image request, no upload`);
    };
    await validationCase("unknown card-type code", { card_type: 2 }, /card_type code 2/);
    await validationCase("unknown s_* key", { s_made_up_test_skill: 1 }, /s_made_up_test_skill/);
    await validationCase("unknown booster stat key", { booster_id: 990, booster: { add: 1, stats: { made_up_test_stat: 1 } } }, /made_up_test_stat/);
    await validationCase("league not in the database or the fixture", { team_name: "Nowhere FC", league: 999 }, /league 999/);
    await validationCase("registered aptitude not 'registered'", { cf: 1 }, /aptitude/);

    // ---- hostile image references (verify finding C1): refused before any image request or write ----
    {
      const foreign = await startForeignHost();
      try {
        const cases: Array<[string, Record<string, unknown>, RegExp]> = [
          ["card render on another loopback port", { card_images: { transparent: `${fake.cdnBase}/cards/x_t.webp`, dynamic: `${foreign.origin}/cards/x_d.webp` } }, /card_images\.dynamic is not an allowed image URL/],
          ["card render as file://", { card_images: { transparent: "file:///etc/hosts", dynamic: null } }, /card_images\.transparent is not an allowed image URL/],
          ["emblem with user-info", { nationality: "Hostland", emblem_images: { nationality: `http://u:p@${new URL(fake.cdnBase).host}/cdn/emblems/nationality/abc.png` } }, /emblem_images\.nationality is not an allowed image URL/],
          ["emblem name with an encoded separator", { nationality: "Hostland", emblem_images: { nationality: `${fake.cdnBase}/emblems/nationality/..%2F..%2Fescape.png` } }, /emblem_images\.nationality (has no safe <name>\.png file name|is not an allowed image URL)/], // "%" in the path: refused by the URL rule since S3
        ];
        for (const [label, extra, expect] of cases) {
          const bad = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 700, startIndex: 40, extra: () => extra });
          fake.setRows([...bad, ...baseline]);
          const before = await catalogueDigests(prisma);
          const ups0 = uploadCount();
          const { row, reqs } = await runOnce();
          assert(row.status === "FAILED" && expect.test(row.error ?? "") && /refused \(source data\)/.test(row.error ?? ""), `hostile ${label}: FAILED naming the field ("${row.error}")`);
          assert(digestDiff(before, await catalogueDigests(prisma)).length === 0 && uploadCount() === ups0, `hostile ${label}: nothing written, no upload`);
          assert(reqs.every((r) => r.path.startsWith("/api/")) && foreign.requests.length === 0, `hostile ${label}: no image request, the foreign host got none (${foreign.requests.length})`);
        }
      } finally {
        await foreign.close();
      }
    }

    // ---- BLOCKED by the image CDN: nothing written, no upload ----
    {
      const fresh = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 900, startIndex: 30 });
      fake.setRows([...fresh, ...baseline]);
      const before = await catalogueDigests(prisma);
      const ups0 = uploadCount();
      const run = await queue();
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null } });
      fake.setMode("ok");
      fake.setCdnMode("403");
      const t0 = Date.now();
      const n0 = fake.requests.length;
      await runner.tick(deps());
      fake.setCdnMode("ok");
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const cfg = await prisma.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
      const cdn = fake.requests.slice(n0).filter((r) => r.path.startsWith("/cdn/"));
      assert(row.status === "BLOCKED" && /images step/.test(row.error ?? ""), `CDN 403: BLOCKED ("${row.error}")`);
      assert((cfg.blockedUntil?.getTime() ?? 0) >= t0 + SYNC_BLOCK_HOURS * 3600_000 - 1000, "CDN 403: blockedUntil = now + 6 h");
      assert(digestDiff(before, await catalogueDigests(prisma)).length === 0 && uploadCount() === ups0, "CDN 403: nothing written, no upload");
      // 4 image workers: at most one request each in flight when the first 403 arrives (the new card's two
      // GETs, and since CR2 the HEADs of the rewritten card's renders)
      assert(cdn.length <= 4, `CDN 403: at most the 4 requests already in flight (one per image worker) were made (${cdn.length})`);
      assert(leftoverRunDirs(row.id).length === 0, "CDN 403: the working directory was removed");
    }

    // ---- BLOCKED mid-run: 403 on the 3rd request (meta, page 1, page 2) ----
    {
      const many = seedableRows(150, { cdnBase: fake.cdnBase, newestTimeAdded: T + 100_000, startIndex: 100, stepSeconds: 60 });
      fake.setRows([...many, ...baseline]);
      const before = await catalogueDigests(prisma);
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null } });
      const run = await queue();
      fake.setMode("ok");
      fake.setBlockAfter(2);
      const n0 = fake.requests.length;
      const t0 = Date.now();
      await runner.tick(deps());
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const cfg = await prisma.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
      const reqs = fake.requests.slice(n0);
      assert(row.status === "BLOCKED" && /refused/.test(row.error ?? ""), `blocked mid-run: BLOCKED ("${row.error}")`);
      assert(reqs.length === 3 && reqs[2]!.path === "/api/players" && reqs[2]!.query.get("page") === "2", `blocked mid-run: no request after the 403 on page 2 (${reqs.map((r) => `${r.path}?page=${r.query.get("page") ?? ""}`).join(", ")})`);
      const until = cfg.blockedUntil?.getTime() ?? 0;
      assert(until >= t0 + SYNC_BLOCK_HOURS * 3600_000 - 1000 && until <= Date.now() + SYNC_BLOCK_HOURS * 3600_000 + 1000, "blocked mid-run: blockedUntil = now + 6 h");
      assert(digestDiff(before, await catalogueDigests(prisma)).length === 0, "blocked mid-run: the catalogue keeps exactly the rows it had");
      assert(leftoverRunDirs(row.id).length === 0, "blocked mid-run: the working directory was removed");
      fake.setBlockAfter(null);
    }

    // ---- third verify W1: image failures never block the source nor stop the write ----
    {
      const pendingOf = (s: unknown) => ((s as { imagesPendingIds?: number[] }).imagesPendingIds ?? []);
      // (a) the third-party host (pesdb.net's stand-in) refuses: the run is OK, nothing is blocked, the
      //     card is written, its skipped render is owed and fetched by the next run
      const tpCard = seedableRows(1, {
        cdnBase: fake.cdnBase,
        newestTimeAdded: T + 400_000,
        startIndex: 70,
        extra: () => ({ card_images: { transparent: `${thirdParty!.origin}/assets/img/card/t70.png`, dynamic: `${fake!.cdnBase}/cards/${FAKE_ID_BASE + 70}_dynamic.webp` } }),
      });
      fake.setRows([...tpCard, ...baseline]);
      thirdParty!.setMode("403");
      const a = await runOnce();
      const cfgA = await prisma.syncConfig.findUniqueOrThrow({ where: { id: 1 } });
      const p70 = await prisma.player.findUnique({ where: { id: id(70) } });
      assert(a.row.status === "OK" && cfgA.blockedUntil === null && p70 !== null, `W1: a third-party 403 → the run is OK, the source is NOT blocked, the card is written (${a.row.status}, blockedUntil ${cfgA.blockedUntil?.toISOString() ?? "null"})`);
      assert((a.stats.imagesFailed ?? 0) === 1 && pendingOf(a.row.stats).includes(FAKE_ID_BASE + 70) && existsSync(join(uploadDest, `cards/${id(70)}_dynamic.webp`)), `W1: the refused render is counted failed and owed (pending ${pendingOf(a.row.stats).join(",")}); the efootbase render was stored`);
      thirdParty!.setMode("ok");
      // a run whose rows do not include the owed card cannot compare it — it keeps it owed (never dropped)
      fake.setRows([...baseline]);
      const between = await runOnce();
      assert(between.row.status === "OK" && pendingOf(between.row.stats).includes(FAKE_ID_BASE + 70) && (between.row.stats as { imagesChecked?: boolean }).imagesChecked === true,
        `W1: a run without the owed card in its window keeps it owed (pending ${pendingOf(between.row.stats).join(",") || "none"})`);
      fake.setRows([...tpCard, ...baseline]);
      const n0 = thirdParty!.requests.length;
      const b = await runOnce();
      assert(b.row.status === "OK" && thirdParty!.requests.length > n0 && existsSync(join(uploadDest, `cards/${id(70)}_transparent.webp`)) && pendingOf(b.row.stats).length === 0,
        `W1: the next run fetches the owed render and owes nothing (${b.row.status}, pending ${pendingOf(b.row.stats).join(",") || "none"})`);

      // (b) one persistent image error at efootbase's CDN: rows written, the image owed, retried next run
      const bad = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 400_100, startIndex: 71 });
      const badPath = `cards/${id(71)}_dynamic.webp`;
      fake.setRows([...bad, ...baseline]);
      fake.setBrokenImage(badPath, true);
      const c = await runOnce();
      const p71 = await prisma.player.findUnique({ where: { id: id(71) } });
      assert(c.row.status === "OK" && p71 !== null && (c.stats.imagesFailed ?? 0) === 1 && pendingOf(c.row.stats).includes(FAKE_ID_BASE + 71) && !existsSync(join(uploadDest, badPath)),
        `W1: one bad image → the card is still written, the run OK with 1 failed and the image owed (${c.row.status}: ${c.row.error ?? ""}; pending ${pendingOf(c.row.stats).join(",")})`);
      fake.setBrokenImage(badPath, false);
      const d = await runOnce();
      assert(d.row.status === "OK" && existsSync(join(uploadDest, badPath)) && pendingOf(d.row.stats).length === 0, "W1: the next run compares the owed card again, uploads the image, owes nothing");
    }

    // ---- W3: a cancel that lands while the write transaction runs → rolled back, CANCELLED ----
    // Deterministic: another session holds a lock on "Player" (SELECTs pass, the upsert waits), so the
    // run is inside its transaction when the cancel arrives; the lock is released after the cancel
    // was seen. The transaction must roll back — nothing of this run may be committed.
    {
      const fresh = seedableRows(2, { cdnBase: fake.cdnBase, newestTimeAdded: T + 200_000, startIndex: 60 });
      // one of the two new cards has a broken render: it is owed, and that must be on the run row BEFORE the write
      const brokenW3 = `cards/${id(61)}_dynamic.webp`;
      fake.setBrokenImage(brokenW3, true);
      fake.setRows([...fresh, ...baseline]);
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null } });
      fake.setMode("ok");
      const before = await catalogueDigests(prisma);
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
        { timeout: 120_000, maxWait: 10_000 },
      );
      await isLocked;
      const run = await queue();
      const p = runner.tick(deps({ cancelPollMs: 100 }));
      let waiting = 0;
      for (let i = 0; i < 1200 && waiting === 0; i++) {
        await new Promise((r) => setTimeout(r, 50));
        waiting = Number((await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`)[0]!.n);
      }
      assert(waiting > 0, "W3: the run's write transaction is waiting on the held lock (inside its transaction)");
      // third verify (W1 follow-up): what the run owes is checkpointed before its write — a worker dying
      // after the commit can never lose the owed image (the card's row would read unchanged afterwards)
      const midStats = (await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } })).stats as { imagesPendingIds?: number[]; imagesChecked?: boolean };
      assert(midStats.imagesChecked === true && (midStats.imagesPendingIds ?? []).includes(FAKE_ID_BASE + 61),
        `W1: the owed image ids are on the RUNNING row before the write transaction (checked ${midStats.imagesChecked}, pending ${(midStats.imagesPendingIds ?? []).join(",") || "none"})`);
      fake.setBrokenImage(brokenW3, false);
      await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
      await new Promise((r) => setTimeout(r, 600)); // the cancel poll (100 ms) has fired
      release();
      await holder;
      await p;
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const written = await prisma.player.count({ where: { id: { in: [id(60), id(61)] } } });
      assert(row.status === "CANCELLED", `W3: cancel during the write transaction → CANCELLED (${row.status}: ${row.error ?? ""})`);
      assert(written === 0 && digestDiff(before, await catalogueDigests(prisma)).length === 0, `W3: the transaction was rolled back — nothing committed (${written} of the 2 new cards in the database; differs: ${digestDiff(before, await catalogueDigests(prisma)).join(", ") || "none"})`);
      assert((await prisma.syncRun.count({ where: { status: "RUNNING" } })) === 0, "W3: no run remains RUNNING");
    }

    // ---- card league (catalogue-data-refresh "Card League"): the card's own league, not its team's;
    //      a league the League table does not hold stores none — the run is not refused for it (the
    //      card's team is known), and no League row is invented ----
    {
      const other = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 500_000, startIndex: 80, extra: () => ({ league: 4 }) });
      const unknown = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 499_000, startIndex: 81, extra: () => ({ league: 999 }) });
      fake.setRows([...other, ...unknown, ...baseline]);
      const leagues0 = await prisma.league.count();
      const { row } = await runOnce();
      assert(row.status === "OK", `card league: run OK (${row.error ?? ""})`);
      const teamLeague = (await prisma.team.findFirst({ where: { name: "Test FC" }, select: { leagueId: true } }))?.leagueId;
      assert(teamLeague === 1 && (await leagueOf(id(80))) === 4, `a card of team Test FC (league ${teamLeague}) whose own league is 4 stores 4 (${await leagueOf(id(80))})`);
      assert((await leagueOf(id(81))) === null && (await prisma.player.count({ where: { id: id(81) } })) === 1, `a card whose league 999 is not in the League table is written with no league (${await leagueOf(id(81))})`);
      assert((await prisma.league.count()) === leagues0, "card league: no League row was added for the unknown league");
    }

    // ---- the key never reaches a stored log, error or statistic ----
    {
      const runs = await prisma.syncRun.findMany();
      const stored = runs.map((r) => `${r.logTail}\n${r.error ?? ""}\n${JSON.stringify(r.stats)}`).join("\n");
      const leaked = Object.entries(TEST_SECRETS).filter(([, v]) => stored.includes(v)).map(([k]) => k);
      assert(leaked.length === 0, `no secret value in any stored log / error / stats (leaked: ${leaked.join(", ") || "none"})`);
      assert(!stored.includes(scratch.url), "the database URL is never stored");
      assert(runs.some((r) => r.logTail.includes(" dump ") && r.logTail.includes("key: len")), "the dump child's output is in the log tail (it prints the key's length, never the key)");
    }

    assert(fetchGuard.refused.length === 0, "no request left the machine (fetch guard)");
    const hosts = new Set([...fake.requests.map((r) => r.headers.host), ...bucket.requests.map((r) => r.host)]);
    assert([...hosts].every((h) => typeof h === "string" && isLoopbackHost(h.replace(/:\d+$/, ""))), `every request went to the local fake source / bucket (${[...hosts].join(", ")})`);
    assert(fake.apiRequests().every((r) => r.headers["x-api-key"] === TEST_SECRETS.EFBASE_API_KEY), "every API request carried the (synthetic) key header");
  } finally {
    await fake?.close();
    await bucket?.close();
    await thirdParty?.close();
    fetchGuard.restore();
    await prisma.$disconnect();
    rmSync(work, { recursive: true, force: true });
    await scratch.drop();
    console.log(`scratch database ${scratch.name} dropped`);
  }
}

if (process.exitCode) console.error("\nincremental tests FAILED");
else console.log("\nincremental tests passed");
