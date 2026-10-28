// FULL run (openspec change admin-sync-worker, design decision 7; data-sync-worker
// "Full Sync", "Overwritten Images Warning", "Politeness And Blocking", "Run
// Statistics And History").
//
//  1. Pre-flight, BEFORE any request or write: the static snapshot the seed
//     needs — <static>/skills.json AND <static>/skill-icons/ (without them the
//     seed erases the skill metadata / clears every icon key) — the key, the
//     database URL, R2_PUBLIC_BASE (changed images are compared with the
//     bucket's public URL), ≥ 2 GB free in os.tmpdir(), and the upload's own
//     prerequisites. Any gap → FAILED naming it.
//  2. Staging directory os.tmpdir()/eflab-sync-<runId>-XXXXXX (0700, removed in
//     `finally`); efootbase_dump.py dumps everything (meta, teams, packs, all
//     player pages; players.jsonl atomic) into it, no images.
//  3. Read-only comparison of every dump row with the database (catalogue.ts:
//     the shared mapping, lookups by name, skill sets) → new / changed /
//     unchanged. Lookup ids are allocated exactly like the seed's pass 1
//     (first-seen order), so the mapped row is what the seed will write.
//  4. The existing seed as a child, its four location variables pointing at the
//     staging files — except EFOOTBASE_STATIC_DIR, which stays the real snapshot
//     directory (the seed reads skills.json AND checks skill-icons/ there) — and
//     WITHOUT --prune / --reset-users. A seed failure → FAILED with its last
//     lines; the seed is one transaction, so the catalogue is unchanged. No
//     cross-fill.
//  5. Images of the new and changed cards (plus emblems the bucket lacks):
//     efootbase_dump.py --no-data --only-ids … --etag-vs-bucket R2_PUBLIC_BASE
//     — a HEAD on the bucket and on the CDN, a download only when the bucket has
//     no object or the ETags differ — then the upload with --no-resume from the
//     staging images folder. images_overwritten.txt = the overwritten count
//     (the dashboard's "raise the image version" warning).
//
// Second verify: the dump script's `--validate-only` pass runs over players.jsonl
// + teams.json before the seed (W-a); the ids whose images must be compared
// (new ∪ changed ∪ those an earlier full run left pending) are written to the
// run row BEFORE the seed and removed only when the image step finished, so a
// failed / blocked / cancelled / killed image step after the commit is picked up
// by the next full run (CR2); the seed child is not stopped by an abort and runs
// inside ctx.writeCatalogue (W-d).
//
// Progress and the items record (openspec change admin-sync-live-progress):
// phases "Dumping" → "Comparing rows" (done / total = rows compared / rows in
// the dump) → "Seeding" → "Comparing images" → "Downloading images" (the image
// child's PROGRESS lines) → "Uploading images" (the upload's). The record keeps
// the new / changed card ids newest first (by `time_added`, the dump itself is
// not in release order) — written by the checkpoint before the seed — and,
// after the image step and the upload, their image lists and failure classes
// (read before the staging directory goes), written by the final update.
//
// Documented trade-offs: an image that changed while its row did not is not
// detected (a manual dump stays the exhaustive path); images come after the
// seed (design decision 7), so a failed image step leaves the catalogue updated
// until the next full run compares the pending cards.

import { existsSync, readFileSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assignPackSlugs, basename, buildCardTypeMap, buildPlayerRow, skillKeyToSlug, type PlayersMeta } from "@eflab/db/efootbase-map";
import { incrementalWatermark } from "@eflab/shared";
import { buildSyncRunItems, type SyncItemsInput } from "@eflab/shared/sync-records";
import { assertLoopbackUrl, sourceImageUrlAllowed } from "../efootbase.js";
import { SEED_WRITE_WAIT_MS } from "../limits.js";
import { checkRowId, checkSourceImages, heldSkillKeys, jsonlRows, loadDbLookups, pendingImageIds, playerDigest, seedLeagueIds, storedDigests } from "../catalogue.js";
import type { RunContext, RunHandler, RunOutcome } from "../runner.js";
import {
  MAX_PENDING_IMAGE_IDS,
  RunStop,
  count,
  fail,
  imageItems,
  imageStepOutcome,
  makeRunDir,
  newestFirstFailures,
  newestFirstPaths,
  readManifest,
  recordOwedImages,
  recordStoppedStep,
  removeRunDir,
  runDumpScript,
  runSeed,
  runUpload,
  stopToOutcome,
  uploadPreflight,
  uploadResultsFile,
} from "../scripts.js";

/** Free space the staging directory needs (design decision 7): the dump is ~0.3 GB of JSON plus images. */
export const FULL_MIN_FREE_BYTES = 2 * 1024 ** 3;

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;

/** Pre-flight of a full run (no request, no write). Exported for the tests. */
export function fullPreflight(ctx: RunContext, freeBytes: (dir: string) => number = defaultFreeBytes): void {
  const { env } = ctx;
  if (!env.staticDir) throw fail("EFOOTBASE_STATIC_DIR is not set (required in test mode) — no request was made, nothing was written");
  const skills = join(env.staticDir, "skills.json");
  const icons = join(env.staticDir, "skill-icons");
  if (!isFile(skills)) {
    throw fail(`static skill snapshot missing: ${skills} — the seed would erase the skill metadata without it (docs/efootbase-static-snapshot.md); no request was made, nothing was written`);
  }
  if (!isDir(icons)) {
    throw fail(`static skill icons missing: ${icons} — the seed would clear every skill icon key without it (docs/efootbase-static-snapshot.md); no request was made, nothing was written`);
  }
  if (!env.efbaseApiKey) throw fail("EFBASE_API_KEY is not set in the worker's environment — no request was made");
  if (!env.databaseUrl) throw fail("DATABASE_URL is not set in the worker's environment — the seed needs it; no request was made");
  if (!env.r2PublicBase) throw fail("R2_PUBLIC_BASE is not set — the full run compares changed card images with the bucket's public URL; no request was made");
  const free = freeBytes(tmpdir());
  if (free < FULL_MIN_FREE_BYTES) throw fail(`only ${gb(free)} free in ${tmpdir()} (the full run needs ≥ ${gb(FULL_MIN_FREE_BYTES)}) — no request was made`);
}

/**
 * teams.json's emblems (the image step fetches them too): only the kinds
 * nationality / league / team, allow-listed URLs, safe file names — else
 * FAILED before the seed (verify finding C1; the dump script refuses them as well).
 */
function checkTeamEmblems(path: string, env: RunContext["env"]): void {
  if (!isFile(path)) return;
  let teams: unknown;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { data?: unknown } | unknown[];
    teams = Array.isArray(raw) ? raw : (raw as { data?: unknown }).data;
  } catch (e) {
    throw fail(`teams.json from the source is not valid JSON (${(e as Error).message}) — nothing was written`);
  }
  if (!Array.isArray(teams)) throw fail("teams.json from the source has no data list — nothing was written");
  for (const t of teams as Array<{ id?: unknown; emblem_images?: Record<string, unknown> | null }>) {
    for (const [kind, url] of Object.entries(t?.emblem_images ?? {})) {
      if (url === null || url === undefined || url === "") continue;
      const where = `teams.json team ${String(t?.id).slice(0, 20)} emblem "${kind.slice(0, 40)}"`;
      if (!["nationality", "league", "team"].includes(kind)) throw fail(`${where}: not an emblem kind (nationality / league / team) — refused (source data), nothing was written`);
      if (!sourceImageUrlAllowed(url, "emblems", env) || basename(url as string) === null) {
        throw fail(`${where}: not an allowed emblem URL with a safe <name>.png file name — refused (source data), nothing was written`);
      }
    }
  }
}

function defaultFreeBytes(dir: string): number {
  const s = statfsSync(dir);
  return Number(s.bavail) * Number(s.bsize);
}

async function full(ctx: RunContext): Promise<RunOutcome> {
  const { env, db } = ctx;
  if (env.testMode) assertLoopbackUrl(env.apiBase, "EFBASE_API_BASE");
  fullPreflight(ctx);
  await uploadPreflight(ctx);

  const before = await db.player.aggregate({ _max: { releaseDate: true } });
  const wm = incrementalWatermark(before._max.releaseDate);
  ctx.watermarkBefore = wm === null ? null : new Date(wm * 1000);

  const staging = makeRunDir(ctx);
  ctx.log(`staging directory ${staging}`);
  try {
    // ---- 2. dump everything (no images) ----
    ctx.setProgress({ phase: "Dumping" });
    await runDumpScript(ctx, ["--out", staging, "--no-images", "--dumped-at", ctx.now().toISOString()], "dump");
    const manifest = readManifest(staging);
    ctx.stats.pages = count(manifest, "lastPage");
    ctx.stats.requests = count(manifest, "apiRequests");
    const dumpPath = join(staging, "players.jsonl");
    const metaPath = join(staging, "players_meta.json");
    const packsPath = join(staging, "packs.json");
    for (const p of [dumpPath, metaPath, packsPath]) if (!isFile(p)) throw fail(`the dump wrote no ${p} — nothing was written`);
    checkTeamEmblems(join(staging, "teams.json"), env);

    // ---- 3. read-only comparison ----
    let cardTypeByCode;
    try {
      cardTypeByCode = buildCardTypeMap(JSON.parse(readFileSync(metaPath, "utf8")) as PlayersMeta, "players_meta.json (source)");
    } catch (e) {
      throw fail(`${(e as Error).message} — nothing was written`);
    }
    // Pass 1 = the seed's lookup allocation (first-seen order).
    const countryIds = new Map<string, number>();
    const teamIds = new Map<string, number>();
    const featured: string[] = [];
    const featuredSeen = new Set<string>();
    let n = 0;
    for await (const r of jsonlRows(dumpPath)) {
      checkRowId(r, n++);
      checkSourceImages(r, env); // image URLs / emblem names from the source: allow-listed, safe (C1) — before the seed
      if (r.nationality && !countryIds.has(r.nationality)) countryIds.set(r.nationality, countryIds.size + 1);
      if (r.team_name && !teamIds.has(r.team_name)) teamIds.set(r.team_name, teamIds.size + 1);
      if (r.featured && r.featured !== "none" && !featuredSeen.has(r.featured)) {
        featuredSeen.add(r.featured);
        featured.push(r.featured);
      }
    }
    // The dump script's own source-data checks as a dry pass over everything the image step will read
    // (players.jsonl and teams.json; verify finding W-a): what the script would refuse fails the run
    // here, BEFORE the seed — never after the catalogue was written. No request, no file.
    await runDumpScript(ctx, ["--out", staging, "--validate-only"], "validate");
    const packIds = assignPackSlugs(featured);
    const names = {
      country: new Map([...countryIds].map(([name, id]) => [id, name] as [number, string])),
      team: new Map([...teamIds].map(([name, id]) => [id, name] as [number, string])),
      pack: new Map([...packIds].map(([name, id]) => [id, name] as [string, string])),
    };
    const lookups = await loadDbLookups(db);
    const stored = await storedDigests(db, lookups.names);
    // The seed writes the fixture leagues, so the card leagues it will store are those.
    const leagueIds = seedLeagueIds();
    const newIds: number[] = [];
    const changedIds: number[] = [];
    let unchanged = 0;
    const released = new Map<number, number>(); // id → time_added of the new / changed cards (newest-first order)
    let compared = 0;
    ctx.setProgress({ phase: "Comparing rows", done: 0, total: n });
    for await (const r of jsonlRows(dumpPath)) {
      if (++compared % 1000 === 0) ctx.setProgress({ phase: "Comparing rows", done: compared, total: n });
      let row: Record<string, unknown>;
      try {
        row = buildPlayerRow(r, BigInt(r.id), cardTypeByCode, countryIds, teamIds, packIds, leagueIds, []);
      } catch (e) {
        throw fail(`card ${r.id}: ${(e as Error).message} — nothing was written`);
      }
      // Unknown s_* keys are left out here: the seed rejects them itself.
      const skills = heldSkillKeys(r).map((k) => lookups.skillBySlug.get(skillKeyToSlug(k))?.id).filter((id): id is number => id !== undefined);
      const prev = stored.get(String(r.id));
      const t = typeof r.time_added === "number" && Number.isFinite(r.time_added) ? r.time_added : 0;
      if (prev === undefined) {
        newIds.push(r.id);
        released.set(r.id, t);
      } else if (prev !== playerDigest(row, skills, names)) {
        changedIds.push(r.id);
        released.set(r.id, t);
      } else unchanged++;
    }
    ctx.setProgress({ phase: "Comparing rows", done: compared, total: Math.max(n, compared) });
    ctx.stats.cardsNew = newIds.length;
    ctx.stats.cardsChanged = changedIds.length;
    ctx.stats.cardsUnchanged = unchanged;
    ctx.log(`dump: ${n} cards — ${newIds.length} new, ${changedIds.length} changed, ${unchanged} unchanged (compared with the database)`);
    // Newest first = release time descending, then id descending (the dump's own order is not by release).
    const newestFirst = (ids: number[]) => [...ids].sort((a, b) => (released.get(b) ?? 0) - (released.get(a) ?? 0) || b - a);
    const found: SyncItemsInput = { newIds: newestFirst(newIds), changedIds: newestFirst(changedIds) };
    const rank = new Map<number, number>(newestFirst([...newIds, ...changedIds]).map((id, i) => [id, i]));
    ctx.recordItems(buildSyncRunItems(found));

    // ---- 4. the seed ----
    // The cards whose images this run must compare: new ∪ changed ∪ those an earlier full run left
    // unchecked (its image step failed / was stopped after its seed had committed — second verify CR2).
    // Persisted on the run row BEFORE the seed, so a crash, a kill or a failed image step after the
    // commit can never lose them; removed once the image step finished.
    const carried = await pendingImageIds(db, ctx.run.id);
    const imageIds = [...new Set([...newIds, ...changedIds, ...carried])].slice(0, MAX_PENDING_IMAGE_IDS);
    if (carried.length > 0) ctx.log(`${carried.length} cards whose images an earlier run did not finish comparing are compared again`);
    ctx.stats.imagesChecked = false;
    if (imageIds.length > 0) ctx.stats.imagesPendingIds = imageIds;
    await ctx.checkpoint(); // throws (no seed) when the state cannot be recorded — third verify S4
    ctx.setProgress({ phase: "Seeding" });
    await ctx.writeCatalogue(
      "the seed (full catalogue write)",
      () =>
        runSeed(ctx, {
          EFOOTBASE_DUMP_PATH: dumpPath,
          EFOOTBASE_META_PATH: metaPath,
          EFOOTBASE_PACKS_PATH: packsPath,
          EFOOTBASE_STATIC_DIR: env.staticDir!,
        }),
      { waitMs: SEED_WRITE_WAIT_MS },
    );
    const after = await db.player.aggregate({ _max: { releaseDate: true } });
    ctx.watermarkAfter = after._max.releaseDate;
    ctx.log("seed finished");

    // ---- 5. images of new, changed and carried-over cards ----
    const idsFile = join(staging, "only_ids.json");
    writeFileSync(idsFile, JSON.stringify(imageIds));
    ctx.setProgress({ phase: "Comparing images" });
    const imageResults = join(staging, "image_results.jsonl");
    try {
      await runDumpScript(ctx, ["--out", staging, "--no-data", "--only-ids", idsFile, "--etag-vs-bucket", env.r2PublicBase!], "images", {
        resultsFile: imageResults,
        onProgress: (done, total) => ctx.setProgress({ phase: "Downloading images", done, total }),
      });
    } catch (e) {
      // blocked / failed / cancelled / time limit / worker stop: keep what the step fetched (verify W2), then the original error
      recordStoppedStep(ctx, found, rank, { imageDir: staging, imageResults }, "the image step");
      if (e instanceof RunStop) {
        const o = e.outcome;
        throw new RunStop(o.status === "BLOCKED" ? { ...o, reason: `${o.reason}; the catalogue was already updated by the seed` } : { ...o, error: `${o.error}; the catalogue was already updated by the seed` });
      }
      throw e;
    }
    const im = readManifest(staging);
    const st = (im.imageStats ?? {}) as Record<string, unknown>;
    const step = imageStepOutcome(staging);
    Object.assign(found, imageItems(staging, imageResults, rank));
    ctx.recordItems(buildSyncRunItems(found));
    ctx.stats.requests = (ctx.stats.requests ?? 0) + count(im, "cdnRequests");
    ctx.stats.imagesDownloaded = count(st, "ok");
    ctx.stats.imagesFailed = step.failedRels.length;
    ctx.stats.imagesOverwritten = step.overwritten;
    ctx.stats.imagesUnverified = step.unverified;
    ctx.stats.imagesUploaded = 0;
    ctx.log(
      `images: ${ctx.stats.imagesDownloaded} downloaded (${count(st, "not_modified")} same as the bucket, ${count(st, "bucketNew")} new to the bucket, ` +
        `${step.overwritten} replacing a bucket object, ${step.unverified} unverified), ${ctx.stats.imagesFailed} failed or skipped` +
        (count(st, "hostBlocked") > 0 ? ` (a third-party image host refused: ${count(st, "hostBlocked") + count(st, "hostSkipped")} of its images skipped — the source is NOT blocked)` : ""),
    );
    const owed = new Set<number>(step.failedIds);
    if (ctx.stats.imagesDownloaded > 0) {
      ctx.setProgress({ phase: "Uploading images" });
      let up: Awaited<ReturnType<typeof runUpload>>;
      try {
        up = await runUpload(ctx, join(staging, "images"), staging, (done, total) => ctx.setProgress({ phase: "Uploading images", done, total }));
      } catch (e) {
        recordStoppedStep(ctx, found, rank, { uploadResults: uploadResultsFile(staging) }, "the upload");
        throw e;
      }
      ctx.stats.imagesUploaded = up.ok;
      ctx.stats.imagesFailed += up.errors;
      // every downloaded card is compared again next time when an upload failed (an uploaded one then reads "same")
      if (up.errors > 0) for (const id of step.downloadedIds) owed.add(id);
      found.uploaded = newestFirstPaths(up.uploaded, rank);
      found.uploadFailed = newestFirstFailures(up.uploadFailed, rank);
      ctx.recordItems(buildSyncRunItems(found));
    }
    if (ctx.stats.imagesOverwritten > 0) {
      ctx.log(`${ctx.stats.imagesOverwritten} card images were overwritten in the bucket — raise the web build's image version (DEFAULT_IMAGE_VERSION) and rebuild the web app so visitors see them`);
    }
    // third verify W1: failed / skipped images no longer fail the run — they stay owed (pending) and the
    // next run compares them again; the run is OK with the failed / pending counts visible.
    recordOwedImages(ctx, owed);
    return { status: "OK" };
  } finally {
    removeRunDir(ctx, staging);
  }
}

export const runFull: RunHandler = (ctx) => stopToOutcome(() => full(ctx));
