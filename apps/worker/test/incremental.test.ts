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

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYNC_BLOCK_HOURS, SYNC_WATERMARK_MARGIN_SECONDS, type SyncRunStats } from "@eflab/shared";
import { syncRunItemsSchema, syncRunProgressSchema, type SyncRunProgress } from "@eflab/shared/sync-records";
import { isLoopbackHost } from "../src/efootbase.js";
import { UPLOAD_SCRIPT, loadWorkerEnv } from "../src/env.js";
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

      // admin-sync-live-progress — "Three new cards": the record lists the 3 ids and the 6 image paths, no name
      const items = syncRunItemsSchema.safeParse(row.items);
      const it = items.success ? items.data : null;
      const paths = newIds.flatMap((p) => [`cards/${p}_dynamic.webp`, `cards/${p}_transparent.webp`]);
      assert(items.success && it!.cards.new.ids.join() === newIds.map(Number).join() && it!.cards.new.total === 3 && !it!.cards.new.truncated && it!.cards.changed.total === 0,
        `items: the 3 new card ids, newest first (${it?.cards.new.ids.join(", ")})`);
      assert(it !== null && it.images.downloaded.paths.join() === paths.join() && it.images.uploaded.paths.join() === paths.join() && it.images.failed.total === 0 && it.images.uploadFailed.total === 0,
        `items: the 6 image paths downloaded and uploaded, newest card first (${it?.images.downloaded.paths.length} / ${it?.images.uploaded.paths.length})`);
      assert(!JSON.stringify(row.items).includes("Plåyer") && !JSON.stringify(row.items).includes("http"), "items: no card name and no URL is stored in the record");
      assert(row.progress === null, "progress: the ended run carries no live progress");
      const up = lastUpload();
      const rf = up[up.indexOf("--results-file") + 1] ?? "";
      assert(up.includes("--progress-every") && up[up.indexOf("--progress-every") + 1] === "50" && rf.startsWith(join(tmpdir(), `eflab-sync-${row.id}-`)) && !existsSync(rf),
        `the upload got --progress-every 50 and a results file inside the run directory, removed with it (${rf.slice(-40)})`);
      assert(/ images PROGRESS 6\/6$/m.test(row.logTail) && / upload PROGRESS 6\/6$/m.test(row.logTail), "the PROGRESS lines of the image step and the upload are kept in the log tail");
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
      // admin-sync-live-progress — "Worker dies after the commit": the record is on the row before the
      // transaction (a worker dying after COMMIT leaves it there; stale recovery keeps it — worker.test.ts)
      const midRow = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id }, select: { items: true, progress: true, status: true } });
      const midItems = syncRunItemsSchema.safeParse(midRow.items);
      const mi = midItems.success ? midItems.data : null;
      assert(
        midRow.status === "RUNNING" && mi !== null && mi.cards.new.ids.join() === [FAKE_ID_BASE + 60, FAKE_ID_BASE + 61].join() &&
          mi.images.downloaded.paths.includes(`cards/${id(60)}_dynamic.webp`) && mi.images.failed.entries.some((e) => e.path === brokenW3 && e.reason === "http_500"),
        `pre-write record on the RUNNING row: new cards ${mi?.cards.new.ids.join(", ")}, ${mi?.images.downloaded.total} downloaded, failed ${JSON.stringify(mi?.images.failed.entries)}`,
      );
      const midProgress = syncRunProgressSchema.safeParse(midRow.progress);
      assert(midProgress.success && midProgress.data.counters.cardsNew === 2, `progress while the write waits: ${JSON.stringify(midRow.progress)}`);
      fake.setBrokenImage(brokenW3, false);
      await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
      await new Promise((r) => setTimeout(r, 600)); // the cancel poll (100 ms) has fired
      release();
      await holder;
      await p;
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const written = await prisma.player.count({ where: { id: { in: [id(60), id(61)] } } });
      assert(row.status === "CANCELLED", `W3: cancel during the write transaction → CANCELLED (${row.status}: ${row.error ?? ""})`);
      assert(row.progress === null && syncRunItemsSchema.safeParse(row.items).success, "W3: the cancelled run keeps its items record and carries no progress");
      assert(written === 0 && digestDiff(before, await catalogueDigests(prisma)).length === 0, `W3: the transaction was rolled back — nothing committed (${written} of the 2 new cards in the database; differs: ${digestDiff(before, await catalogueDigests(prisma)).join(", ") || "none"})`);
      assert((await prisma.syncRun.count({ where: { status: "RUNNING" } })) === 0, "W3: no run remains RUNNING");
    }

    // ---- admin-sync-live-progress: live progress while a run is held in its image step and its upload ----
    {
      // 15 cards = 30 images: progress lines at 0, 20 (every DUMP_PROGRESS_EVERY) and 30
      const fresh = seedableRows(15, { cdnBase: fake.cdnBase, newestTimeAdded: T + 600_000, startIndex: 300 });
      fake.setRows([...fresh, ...baseline]);
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
      fake.setMode("ok");
      fake.setCdnDelayMs(250); // 30 images, 4 workers: the image step lasts ~2 s
      const run = await queue();
      const slowUpload = { ...workerEnv, uploadCommand: [...workerEnv.uploadCommand, "--delay-ms", "60"] };
      const p = runner.tick(deps({ runHeartbeatMs: 150, cancelPollMs: 50, env: slowUpload }));
      const seen: SyncRunProgress[] = [];
      let statusSeen = "";
      for (let i = 0; i < 600; i++) {
        const r = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id }, select: { status: true, progress: true } });
        statusSeen = r.status;
        if (r.status !== "RUNNING" && r.status !== "QUEUED") break;
        const pr = syncRunProgressSchema.safeParse(r.progress);
        if (pr.success && (seen.length === 0 || seen[seen.length - 1]!.updatedAt !== pr.data.updatedAt)) seen.push(pr.data);
        await new Promise((res) => setTimeout(res, 40));
      }
      await p;
      fake.setCdnDelayMs(0);
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const phases = [...new Set(seen.map((s) => s.phase))];
      const dl = seen.filter((s) => s.phase === "Downloading images");
      const upl = seen.filter((s) => s.phase === "Uploading images" && s.total !== null);
      assert(row.status === "OK", `progress run: OK (${row.error ?? ""}; last status seen ${statusSeen})`);
      assert(phases[0] === "Reading pages" && phases.includes("Downloading images") && phases.includes("Uploading images"), `progress phases seen while running: ${phases.join(" → ")}`);
      assert(dl.length > 0 && dl.every((s) => s.total === 30 && s.done <= 30) && dl.some((s) => s.done === 20), `"Image step progress": the bar reads 20 of 30 images mid-step, without a reload (${dl.map((s) => `${s.done}/${s.total}`).join(", ")})`);
      assert(dl.every((s) => s.counters.cardsNew === 15), `"Statistics while running": the counters say 15 cards new while the images download (${JSON.stringify(dl[0]?.counters)})`);
      assert(upl.length > 0 && upl.every((s) => s.total === 30), `upload progress: done of 30 files (${upl.map((s) => `${s.done}/${s.total}`).join(", ")})`);
      const gaps = seen.slice(1).map((s, i) => Date.parse(s.updatedAt) - Date.parse(seen[i]!.updatedAt));
      assert(gaps.length > 3 && Math.max(...gaps) < 2_000, `progress written with every heartbeat (${seen.length} writes, largest gap ${Math.max(...gaps)} ms at a 150 ms heartbeat)`);
      assert(row.progress === null, "progress cleared when the run ended");
    }

    // ---- admin-sync-live-progress — "Failed image": a 404 is listed under failed as http_404, the run is OK ----
    {
      const fresh = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 610_000, startIndex: 320 });
      const missing = `cards/${id(320)}_dynamic.webp`;
      fake.setRows([...fresh, ...baseline]);
      fake.setMissingImage(missing, true);
      const { row, stats } = await runOnce();
      fake.setMissingImage(missing, false);
      const it = syncRunItemsSchema.safeParse(row.items);
      const failed = it.success ? it.data.images.failed : null;
      assert(row.status === "OK" && failed !== null && failed.total === 1 && failed.entries[0]!.path === missing && failed.entries[0]!.reason === "http_404",
        `404 image: listed under failed with reason http_404, run ${row.status} (failed ${JSON.stringify(failed?.entries)})`);
      assert(!JSON.stringify(row.items).includes("Not Found") && (stats.imagesFailed ?? 0) === 0 && !((row.stats as { imagesPendingIds?: number[] }).imagesPendingIds ?? []).includes(FAKE_ID_BASE + 320),
        `404 image: no response text stored; "Images failed" counts errors to retry (0) — a 404 is not owed (failed group total 1, imagesFailed ${stats.imagesFailed})`);
      assert(it.success && it.data.images.downloaded.paths.join() === `cards/${id(320)}_transparent.webp`, "404 image: the other render was downloaded");
    }

    // ---- admin-sync-live-progress: upload failures by class, hostile result lines dropped, secrets never stored ----
    {
      const fresh = seedableRows(2, { cdnBase: fake.cdnBase, newestTimeAdded: T + 620_000, startIndex: 330 });
      fake.setRows([...fresh, ...baseline]);
      const hostile = [
        JSON.stringify({ key: TEST_SECRETS.R2_SECRET_ACCESS_KEY, outcome: "ok" }),
        JSON.stringify({ key: `cards/${id(330)}_dynamic.webp`, outcome: `failed with ${TEST_SECRETS.R2_ACCESS_KEY_ID}` }),
      ].join("\n");
      const failing = { ...workerEnv, uploadCommand: [...workerEnv.uploadCommand, "--fail-match", `${id(331)}_transparent`, "--results-extra", hostile] };
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
      const run = await queue();
      await runner.tick(deps({ env: failing }));
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const it = syncRunItemsSchema.safeParse(row.items);
      const uf = it.success ? it.data.images.uploadFailed : null;
      assert(row.status === "OK" && uf !== null && uf.total === 1 && uf.entries[0]!.path === `cards/${id(331)}_transparent.webp` && uf.entries[0]!.reason === "http_500",
        `upload failure: listed under uploadFailed with its class (${JSON.stringify(uf?.entries)}), run ${row.status}`);
      // the line keyed by a secret is no record path: counted (total 4), never listed; the line with a free-text outcome is left out (logged)
      assert(
        it.success && it.data.images.uploaded.paths.length === 3 && it.data.images.uploaded.total === 4 && it.data.images.uploaded.truncated &&
          !JSON.stringify(row.items).includes(TEST_SECRETS.R2_SECRET_ACCESS_KEY) && !JSON.stringify(row.items).includes(TEST_SECRETS.R2_ACCESS_KEY_ID) && /left out/.test(row.logTail),
        `results lines that are not {image path, class} are never stored: uploaded ${it.success ? `${it.data.images.uploaded.paths.length} listed of ${it.data.images.uploaded.total}` : "?"} (the non-path key counted, not listed), the free-text outcome left out and logged`,
      );
    }

    // ---- verify W1: one path rule — an emblem path of 200 characters listed, 201 counted but not listed, the record kept ----
    {
      const nameFor = (pathLen: number) => "x".repeat(pathLen - "emblems/nationality/".length - ".png".length);
      const atName = nameFor(200);
      const overName = nameFor(201);
      const edge = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 630_000, startIndex: 340, extra: () => ({ nationality: "Edgeland", emblem_images: { nationality: `${fake!.cdnBase}/emblems/nationality/${atName}.png`, league: null, team: null } }) });
      const long = seedableRows(1, { cdnBase: fake.cdnBase, newestTimeAdded: T + 629_000, startIndex: 341, extra: () => ({ nationality: "Longland", emblem_images: { nationality: `${fake!.cdnBase}/emblems/nationality/${overName}.png`, league: null, team: null } }) });
      fake.setRows([...edge, ...long, ...baseline]);
      const { row, stats } = await runOnce();
      const it = syncRunItemsSchema.safeParse(row.items);
      const at = `emblems/nationality/${atName}.png`;
      const dl = it.success ? it.data.images.downloaded : null;
      const up = it.success ? it.data.images.uploaded : null;
      assert(row.status === "OK" && it.success && it.data.cards.new.ids.join() === [FAKE_ID_BASE + 340, FAKE_ID_BASE + 341].join(), `W1: the run with a 201-character emblem path is OK and its record is written (${row.status}; cards ${it.success ? it.data.cards.new.ids.join(",") : it.error.message})`);
      assert(
        dl !== null && dl.paths.includes(at) && !dl.paths.some((p) => p.length > 200) && dl.total === dl.paths.length + 1 && dl.truncated && stats.imagesDownloaded === 6,
        `W1: the 200-character path is listed, the 201-character one counted but not listed (downloaded ${dl?.paths.length} listed of ${dl?.total}, truncated ${dl?.truncated}; ${stats.imagesDownloaded} downloaded)`,
      );
      assert(up !== null && up.total === up.paths.length + 1 && up.truncated && up.paths.includes(at), `W1: the same in the uploaded group (${up?.paths.length} of ${up?.total})`);
    }

    // ---- verify W2: an image step or upload that ends early keeps what it had fetched in the record ----
    const holdUntil = async (runId: number, ok: (p: SyncRunProgress) => boolean) => {
      for (let i = 0; i < 600; i++) {
        const r = await prisma.syncRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true, progress: true } });
        const pr = syncRunProgressSchema.safeParse(r.progress);
        if (pr.success && ok(pr.data)) return true;
        if (r.status !== "RUNNING" && r.status !== "QUEUED") return false;
        await new Promise((res) => setTimeout(res, 40));
      }
      return false;
    };
    const writtenOf = async (k: number, n: number) => prisma.player.count({ where: { id: { in: Array.from({ length: n }, (_, i) => id(k + i)) } } });
    {
      // (a) the image CDN blocks part-way: BLOCKED, the images downloaded before the block are in the record
      const fresh = seedableRows(15, { cdnBase: fake.cdnBase, newestTimeAdded: T + 640_000, startIndex: 350 });
      fake.setRows([...fresh, ...baseline]);
      const before = await catalogueDigests(prisma);
      fake.setCdnBlockAfter(10);
      const { row } = await runOnce();
      fake.setCdnBlockAfter(null);
      const it = syncRunItemsSchema.safeParse(row.items);
      const dl = it.success ? it.data.images.downloaded : null;
      assert(row.status === "BLOCKED" && digestDiff(before, await catalogueDigests(prisma)).length === 0, `W2 blocked mid-step: BLOCKED, nothing written (${row.status})`);
      assert(
        it.success && it.data.cards.new.total === 15 && dl !== null && dl.total >= 5 && dl.total <= 14 && dl.paths.every((p) => /^cards\/99000000035\d_|^cards\/99000000036[0-4]_/.test(p)) && row.progress === null,
        `W2 blocked mid-step: the record lists the ${dl?.total} images downloaded before the block (cards ${it.success ? it.data.cards.new.total : "?"}) — not lost`,
      );
    }
    for (const [label, how] of [["worker stopped", "shutdown"], ["cancelled", "cancel"]] as const) {
      // (b) / (c) the worker stops / an admin cancels while the images download: FAILED / CANCELLED, nothing
      //           committed, the files already stored are in the record
      const k = how === "shutdown" ? 370 : 390;
      const fresh = seedableRows(15, { cdnBase: fake.cdnBase, newestTimeAdded: T + 650_000 + k, startIndex: k });
      fake.setRows([...fresh, ...baseline]);
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
      fake.setMode("ok");
      fake.setCdnDelayMs(250);
      const stop = new AbortController();
      const run = await queue();
      const p = runner.tick(deps({ runHeartbeatMs: 150, cancelPollMs: 50, shutdown: stop.signal }));
      const reached = await holdUntil(run.id, (pr) => pr.phase === "Downloading images" && pr.done >= 20);
      if (how === "shutdown") stop.abort(new Error("shutdown"));
      else await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
      await p;
      fake.setCdnDelayMs(0);
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const it = syncRunItemsSchema.safeParse(row.items);
      const dl = it.success ? it.data.images.downloaded : null;
      const expectStatus = how === "shutdown" ? "FAILED" : "CANCELLED";
      assert(reached && row.status === expectStatus && (await writtenOf(k, 15)) === 0, `W2 ${label} during the images: ${row.status} (${row.error ?? ""}), none of the 15 cards written`);
      assert(dl !== null && dl.total >= 20 && dl.total <= 30 && it.success && it.data.cards.new.total === 15 && row.progress === null, `W2 ${label}: the record lists the ${dl?.total} image files already stored (of 30) and the 15 new cards`);
      assert(leftoverRunDirs(row.id).length === 0, `W2 ${label}: the working directory was removed after the lists were read`);
      // re-verify W2: the real dump script (run with its flags) stops on the worker's SIGTERM through its handler —
      // the fetches in progress are recorded and its image lists written before it exits 143
      const stopLine = /stopped by SIGTERM after (\d+) of 30 images/.exec(row.logTail);
      assert(stopLine !== null && Number(stopLine[1]) === dl?.total, `W2 ${label}: the dump child stopped through its SIGTERM handler after ${stopLine?.[1]} of 30 images = the ${dl?.total} listed`);
    }
    {
      // (d) the upload child dies part-way: FAILED, the record lists the downloads and the uploads its results file holds
      const fresh = seedableRows(3, { cdnBase: fake.cdnBase, newestTimeAdded: T + 700_000, startIndex: 410 });
      fake.setRows([...fresh, ...baseline]);
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
      const run = await queue();
      await runner.tick(deps({ env: { ...workerEnv, uploadCommand: [...workerEnv.uploadCommand, "--die-after", "4"] } }));
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const it = syncRunItemsSchema.safeParse(row.items);
      assert(row.status === "FAILED" && /upload step failed/.test(row.error ?? "") && (await writtenOf(410, 3)) === 0, `W2 upload dies part-way: FAILED before any write ("${(row.error ?? "").slice(0, 80)}")`);
      assert(it.success && it.data.images.downloaded.total === 6 && it.data.images.uploaded.total === 4 && it.data.cards.new.total === 3, `W2 upload dies part-way (SIGKILL after 4 files): the record lists 6 downloads and the 4 uploads done (${it.success ? `${it.data.images.downloaded.total} / ${it.data.images.uploaded.total}` : it.error.message})`);
    }
    {
      // (e) re-verify W2: an admin cancels while the upload runs (the stand-in stops like the real script —
      //     the file in progress finishes and is recorded, exit 143): CANCELLED, nothing written, the
      //     uploads done so far listed — every file the bucket received, none more
      const k = 430;
      const fresh = seedableRows(6, { cdnBase: fake.cdnBase, newestTimeAdded: T + 720_000, startIndex: k });
      fake.setRows([...fresh, ...baseline]);
      await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
      const inBucket = () =>
        existsSync(join(uploadDest, "cards")) ? readdirSync(join(uploadDest, "cards")).filter((n) => Array.from({ length: 6 }, (_, i) => `${id(k + i)}_`).some((p) => n.startsWith(p))).map((n) => `cards/${n}`) : [];
      const run = await queue();
      const p = runner.tick(deps({ runHeartbeatMs: 150, cancelPollMs: 50, env: { ...workerEnv, uploadCommand: [...workerEnv.uploadCommand, "--delay-ms", "150"] } }));
      const reached = await holdUntil(run.id, (pr) => pr.phase === "Uploading images" && inBucket().length >= 4);
      await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
      await p;
      const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      const it = syncRunItemsSchema.safeParse(row.items);
      const up = it.success ? it.data.images.uploaded : null;
      const received = inBucket().sort();
      assert(reached && row.status === "CANCELLED" && (await writtenOf(k, 6)) === 0 && row.progress === null, `W2 cancelled during the upload: ${row.status}, none of the 6 cards written`);
      assert(
        up !== null && it.success && it.data.images.downloaded.total === 12 && up.total >= 4 && up.total < 12 && JSON.stringify([...up.paths].sort()) === JSON.stringify(received),
        `W2 cancelled during the upload: the record lists the ${up?.total} uploads done = the ${received.length} files the bucket received (of 12 downloaded)`,
      );
      assert(leftoverRunDirs(row.id).length === 0 && /stopped by SIGTERM/.test(row.logTail), "W2 cancelled during the upload: the upload child stopped on SIGTERM after recording its last file; the working directory removed");
    }
    {
      // (f) third re-verify S1: the REAL r2_upload.py cancelled during its upload — a copy in a temporary
      //     "repository" (it never reads the repository's .env nor writes its manifest), its boto3 the local
      //     stub (a wrapper refuses to run if the import resolves anywhere else: no request to any bucket)
      const box = mkdtempSync(join(tmpdir(), "eflab-synctest-realupload-"));
      try {
        mkdirSync(join(box, "repo", "scripts"), { recursive: true });
        const copy = join(box, "repo", "scripts", "r2_upload.py");
        copyFileSync(UPLOAD_SCRIPT, copy);
        const stubDir = join(box, "stub");
        mkdirSync(join(stubDir, "boto3"), { recursive: true });
        mkdirSync(join(stubDir, "botocore"), { recursive: true });
        writeFileSync(join(stubDir, "botocore", "__init__.py"), "");
        writeFileSync(join(stubDir, "botocore", "config.py"), "class Config:\n    def __init__(self, **kw):\n        self.kw = kw\n");
        writeFileSync(join(stubDir, "botocore", "exceptions.py"), "class ClientError(Exception):\n    def __init__(self, response, op):\n        super().__init__('stub error')\n        self.response = response\n");
        writeFileSync(
          join(stubDir, "boto3", "__init__.py"),
          "import os, shutil, time\nclass _S3:\n    def head_object(self, Bucket, Key):\n        return {}\n    def upload_file(self, src, Bucket, Key, ExtraArgs=None):\n        time.sleep(int(os.environ['STUB_UPLOAD_DELAY_MS']) / 1000)\n        d = os.path.join(os.environ['STUB_BUCKET_DIR'], Key)\n        os.makedirs(os.path.dirname(d), exist_ok=True)\n        shutil.copyfile(src, d)\ndef client(*a, **kw):\n    return _S3()\n",
        );
        const wrap = [
          "import os, runpy, sys",
          "stub = os.path.realpath(sys.argv[1]); sys.path.insert(0, stub)",
          "import boto3",
          "assert os.path.realpath(boto3.__file__).startswith(stub + os.sep), 'refusing: boto3 is not the test stub'",
          "s = sys.argv[2]; sys.argv = sys.argv[2:]",
          "runpy.run_path(s, run_name='__main__')",
        ].join("\n");
        const k = 450;
        const fresh = seedableRows(6, { cdnBase: fake.cdnBase, newestTimeAdded: T + 740_000, startIndex: k });
        fake.setRows([...fresh, ...baseline]);
        await prisma.syncConfig.update({ where: { id: 1 }, data: { blockedUntil: null, blockedReason: null, enabled: false } });
        const inBucket = () =>
          existsSync(join(uploadDest, "cards")) ? readdirSync(join(uploadDest, "cards")).filter((n) => Array.from({ length: 6 }, (_, i) => `${id(k + i)}_`).some((p) => n.startsWith(p))).map((n) => `cards/${n}`) : [];
        // the worker's child env carries no PYTHONPATH / stub variables: /usr/bin/env adds the two the stub reads
        // one worker (the script's default is 32: all 12 files would be in flight at once)
        const realUpload = ["/usr/bin/env", `STUB_BUCKET_DIR=${uploadDest}`, "STUB_UPLOAD_DELAY_MS=150", "python3", "-I", "-B", "-c", wrap, stubDir, copy, "--workers", "1"];
        const run = await queue();
        const p = runner.tick(deps({ runHeartbeatMs: 150, cancelPollMs: 50, env: { ...workerEnv, uploadCommand: realUpload } }));
        const reached = await holdUntil(run.id, (pr) => pr.phase === "Uploading images" && inBucket().length >= 4);
        await prisma.syncRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
        await p;
        const row = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
        const it = syncRunItemsSchema.safeParse(row.items);
        const up = it.success ? it.data.images.uploaded : null;
        const received = inBucket().sort();
        assert(
          reached && row.status === "CANCELLED" && (await writtenOf(k, 6)) === 0 && /=== r2_upload ===/.test(row.logTail) && /stopped by SIGTERM after \d+ of 12 files/.test(row.logTail),
          `S1 the real r2_upload.py cancelled during its upload: ${row.status}, none of the 6 cards written, the script stopped through its SIGTERM handler`,
        );
        assert(
          up !== null && up.total >= 4 && up.total < 12 && JSON.stringify([...up.paths].sort()) === JSON.stringify(received) && !existsSync(join(box, "repo", "dump")),
          `S1 the record lists the ${up?.total} uploads the real script finished = the ${received.length} files the bucket received; no manifest written (stopped)`,
        );
      } finally {
        rmSync(box, { recursive: true, force: true });
      }
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
      const stored = runs.map((r) => `${r.logTail}\n${r.error ?? ""}\n${JSON.stringify(r.stats)}\n${JSON.stringify(r.progress)}\n${JSON.stringify(r.items)}`).join("\n");
      const leaked = Object.entries(TEST_SECRETS).filter(([, v]) => stored.includes(v)).map(([k]) => k);
      assert(leaked.length === 0, `no secret value in any stored log / error / stats / progress / items (leaked: ${leaked.join(", ") || "none"})`);
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
