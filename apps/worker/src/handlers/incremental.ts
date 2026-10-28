// INCREMENTAL run (openspec change admin-sync-worker, design decision 6;
// data-sync-worker "Incremental Sync", "Politeness And Blocking", "Run
// Statistics And History").
//
//  1. Refuse (FAILED, no request) when the database has no card: the watermark
//     is the newest release time in the database − 7 days (`incrementalWatermark`);
//     reading everything is the full run's job.
//  2. efootbase_dump.py --data-parts meta,players --newest-first-since <watermark>
//     into a 0700 working directory (removed in `finally`): players_meta.json for
//     the card-type map and the cards released since the watermark, newest first.
//  3. Validate exactly like the seed — known card-type codes (and pack-family
//     agreement), known `s_*` skill keys (no hidden skill held), known booster
//     stat keys, valid pos / condition, registered aptitude; ANY problem ends
//     the run FAILED naming it, before anything is written. Leagues a new team
//     needs must be in the database or in fixtures/leagues.json. The dump
//     script's own source-data checks run as a dry `--validate-only` pass over
//     every fetched row (W-a), plus `checkSourceImages` per row.
//  4. Compare every fetched row with the database (catalogue.ts) → new /
//     changed / unchanged. Only new and changed rows are written.
//  5. Images of the NEW and the CHANGED (rewritten) cards and of the emblems of
//     the countries / teams / leagues this run inserts: efootbase_dump.py
//     --no-data --only-ids … --etag-vs-bucket R2_PUBLIC_BASE into a separate
//     directory (its players.jsonl is a copy of the fetched rows whose emblem
//     URLs are reduced to those new emblems) — a HEAD on the bucket and the CDN,
//     a download only when the bucket lacks the image or its ETag differs
//     (second verify CR2: a rewritten card's changed image is replaced now, and
//     counted as overwritten) — then the upload with --no-resume. Images come
//     BEFORE the database write: a block or a failed download / upload ends the
//     run with the catalogue untouched, so the next run sees the same cards as
//     new / changed and compares them again.
//  6. ONE transaction: insert the missing League / Country / Team rows (ids as
//     the seed allocates them: the next free ids in first-seen order, matched by
//     name; leagues by code from the fixture — each card's own `leagueId` is
//     stored when the League table holds it after this write, as in the seed,
//     else NULL), upsert the boosters the rows
//     carry that are missing or differ (dump wins, as in the seed), upsert the
//     new / changed Player rows over the model's columns minus
//     PLAYER_CROSSFILL_COLUMNS (cross-fill values survive), insert their
//     PlayerSkill links (skipDuplicates). Nothing is ever deleted; Pack /
//     PackCard / FeaturedBundle / Skill / Manager are never written.
//
// Progress and the items record (openspec change admin-sync-live-progress):
// phases "Reading pages" (pages, validation, comparison) → "Comparing images"
// (the image child starting) → "Downloading images" (done / total from its
// PROGRESS lines) → "Uploading images" (the upload's PROGRESS lines) → "Writing
// the catalogue". The record (new / changed card ids newest first, the image
// lists and the per-image failure classes of the image step and the upload) is
// kept with `ctx.recordItems` after the comparison and again after the upload,
// and written by the pre-write checkpoint — before the transaction, so a worker
// dying after the commit loses nothing — and by the final update. The image
// lists and both results files are read before the working directory goes.
//
// Limits (documented): a card edited at the source after its release is not
// seen (time_added does not move — the weekly full run catches it); a skill flag
// the source dropped from a re-seen card stays linked until the next full run;
// a card whose featured pack is not in the database yet keeps featuredPackId
// null until the next full run (no Pack row is created here). An image that
// changed while its row did not is not detected (as in the full run).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAYER_CROSSFILL_COLUMNS,
  basename,
  boosterRowFromDump,
  buildCardTypeMap,
  buildPlayerRow,
  emblemUrl,
  rowBoosters,
  type EfbRow,
  type PlayersMeta,
} from "@eflab/db/efootbase-map";
import { makeUpserter } from "@eflab/db/upsert";
import { incrementalWatermark, newestReleaseAfter } from "@eflab/shared";
import { buildSyncRunItems, type SyncItemsInput } from "@eflab/shared/sync-records";
import { assertLoopbackUrl } from "../efootbase.js";
import { CATALOGUE_WRITE_TX_MAX_WAIT_MS, CATALOGUE_WRITE_TX_TIMEOUT_MS } from "../limits.js";
import {
  SEED_FALLBACK_R2_BASE,
  checkRowId,
  checkSourceImages,
  heldSkillKeys,
  jsonlRows,
  leagueFixture,
  loadDbLookups,
  pendingImageIds,
  playerDigest,
  resolveSkillKeys,
  storedDigests,
  validateCardTypes,
  type LookupNames,
} from "../catalogue.js";
import type { RunContext, RunHandler, RunOutcome } from "../runner.js";
import {
  count,
  fail,
  imageItems,
  imageStepOutcome,
  makeRunDir,
  newestFirstFailures,
  newestFirstPaths,
  readLines,
  readManifest,
  recordOwedImages,
  recordStoppedStep,
  removeRunDir,
  runDumpScript,
  runUpload,
  stopToOutcome,
  uploadPreflight,
  uploadResultsFile,
} from "../scripts.js";

/** Players per upsert statement (= the seed's batch size). */
const BATCH_SIZE = 500;
// The write transaction's limits (Prisma's default of 5 s is far too short) are
// CATALOGUE_WRITE_TX_TIMEOUT_MS / _MAX_WAIT_MS in limits.ts: shorter than the
// time the runner holds an abandoned run for an in-flight write.

type EmblemKind = "nationality" | "league" | "team";

function asMeta(path: string): PlayersMeta {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PlayersMeta;
  } catch (e) {
    throw fail(`players_meta.json from the source is not valid JSON (${(e as Error).message})`);
  }
}

/** Mapping / validation errors of the shared module become FAILED with their own message. */
function mapped<T>(what: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw fail(`${what}: ${(e as Error).message} — nothing was written`);
  }
}

const canonBooster = (row: Record<string, unknown>, cols: readonly string[]) => cols.map((c) => `${c}=${JSON.stringify(row[c] ?? null)}`).join("|");

async function incremental(ctx: RunContext): Promise<RunOutcome> {
  const { env, db } = ctx;
  if (env.testMode) assertLoopbackUrl(env.apiBase, "EFBASE_API_BASE");
  if (!env.efbaseApiKey) throw fail("EFBASE_API_KEY is not set in the worker's environment — no request was made");
  if (!env.r2PublicBase) throw fail("R2_PUBLIC_BASE is not set — the incremental run compares the images of the cards it rewrites with the bucket's public URL; no request was made");

  // ---- 1. watermark ----
  const agg = await db.player.aggregate({ _max: { releaseDate: true }, _count: { _all: true } });
  if (agg._count._all === 0) {
    throw fail("the database has no cards — an incremental run only reads cards newer than the newest one stored; run a full sync first (no request was made)");
  }
  const dbNewest = agg._max.releaseDate;
  const watermark = incrementalWatermark(dbNewest);
  if (watermark === null) throw fail("no card in the database has a release time — run a full sync first (no request was made)");
  ctx.watermarkBefore = new Date(watermark * 1000);
  ctx.log(`watermark ${ctx.watermarkBefore.toISOString()} (newest card in the database ${dbNewest!.toISOString()} − 7 days)`);
  await uploadPreflight(ctx);

  const work = makeRunDir(ctx);
  ctx.log(`working directory ${work}`);
  try {
    // ---- 2. newest-first pages + metadata ----
    ctx.setProgress({ phase: "Reading pages" });
    const dataDir = join(work, "data");
    mkdirSync(dataDir, { mode: 0o700 });
    await runDumpScript(
      ctx,
      ["--out", dataDir, "--data-parts", "meta,players", "--newest-first-since", String(watermark), "--no-images", "--dumped-at", ctx.now().toISOString()],
      "dump",
    );
    const manifest = readManifest(dataDir);
    ctx.stats.pages = count(manifest, "pages");
    ctx.stats.requests = count(manifest, "apiRequests");

    // ---- 3. validation (nothing written yet) ----
    const cardTypeByCode = mapped("players_meta.json from the source", () => buildCardTypeMap(asMeta(join(dataDir, "players_meta.json")), "players_meta.json (source)"));
    const rows: EfbRow[] = [];
    for await (const r of jsonlRows(join(dataDir, "players.jsonl"))) {
      checkRowId(r, rows.length);
      checkSourceImages(r, env); // image URLs / emblem names from the source: allow-listed, safe (C1)
      rows.push(r);
    }
    // The dump script's own source-data checks over every fetched row, as a dry pass (W-a): no request,
    // no file — whatever the image step would refuse fails the run here, before any image or write.
    await runDumpScript(ctx, ["--out", dataDir, "--validate-only"], "validate");
    ctx.log(`${rows.length} cards released since the watermark (${ctx.stats.pages} pages)`);
    const lookups = await loadDbLookups(db);
    validateCardTypes(rows, cardTypeByCode);
    const skillKeyToId = resolveSkillKeys(rows, lookups.skillBySlug);

    const boosterRows = new Map<number, Record<string, unknown>>();
    for (const r of rows) {
      for (const [bid, bobj] of rowBoosters(r)) {
        if (!boosterRows.has(bid)) boosterRows.set(bid, mapped(`card ${r.id}`, () => boosterRowFromDump(bid, bobj)));
      }
    }

    // Missing lookup rows, in first-seen order, ids as the seed allocates them (next free ids).
    const r2Base = env.r2PublicBase ?? SEED_FALLBACK_R2_BASE;
    const leagues = leagueFixture();
    const newCountries = new Map<string, { id: number; name: string; hash: string | null }>();
    const newTeams = new Map<string, { id: number; name: string; hash: string | null; nationality: string | null; league: number | null }>();
    const newLeagues = new Map<number, { id: number; name: string; region: string; hash: string | null }>();
    let nextCountry = lookups.maxCountryId + 1;
    let nextTeam = lookups.maxTeamId + 1;
    for (const r of rows) {
      if (r.nationality && !lookups.countryByName.has(r.nationality) && !newCountries.has(r.nationality)) {
        newCountries.set(r.nationality, { id: nextCountry++, name: r.nationality, hash: basename(r.emblem_images?.nationality ?? null) });
      }
      if (r.team_name && !lookups.teamByName.has(r.team_name) && !newTeams.has(r.team_name)) {
        const league = r.league ?? null;
        if (league !== null && !lookups.leagueIds.has(league) && !newLeagues.has(league)) {
          const fx = leagues[String(league)];
          if (!fx) throw fail(`team "${r.team_name}" (card ${r.id}) is in league ${league}, which is neither in the database nor in fixtures/leagues.json — nothing was written`);
          newLeagues.set(league, { id: league, name: fx.name, region: fx.region, hash: null });
        }
        newTeams.set(r.team_name, { id: nextTeam++, name: r.team_name, hash: basename(r.emblem_images?.team ?? null), nationality: r.nationality ?? null, league });
      }
    }
    // A new league's emblem = the first row of that league that carries one (the seed's rule).
    for (const r of rows) {
      const l = r.league != null ? newLeagues.get(r.league) : undefined;
      if (l && !l.hash) l.hash = basename(r.emblem_images?.league ?? null);
    }

    const countryNameToId = new Map<string, number>([...lookups.countryByName].map(([n, c]) => [n, c.id]));
    for (const c of newCountries.values()) countryNameToId.set(c.name, c.id);
    const teamNameToId = new Map<string, number>([...lookups.teamByName].map(([n, t]) => [n, t.id]));
    for (const t of newTeams.values()) teamNameToId.set(t.name, t.id);
    // A card's own league is stored when the League table holds it after this
    // write: the stored ids plus the leagues inserted below (catalogue-data-refresh
    // "Card League" — the seed's rule with the seed's table); else NULL.
    const knownLeagueIds = new Set<number>([...lookups.leagueIds, ...newLeagues.keys()]);

    const aptitudeMismatch: string[] = [];
    const mappedRows = rows.map((r) => mapped(`card ${r.id}`, () => buildPlayerRow(r, BigInt(r.id), cardTypeByCode, countryNameToId, teamNameToId, lookups.packIdByName, knownLeagueIds, aptitudeMismatch)));
    if (aptitudeMismatch.length > 0) {
      throw fail(`${aptitudeMismatch.length} cards whose aptitude at \`pos\` is not "registered" (2): ${aptitudeMismatch.slice(0, 5).join("; ")} — nothing was written`);
    }
    const skillsOf = (r: EfbRow) => heldSkillKeys(r).map((k) => skillKeyToId.get(k)!);

    // ---- 4. new / changed / unchanged ----
    const ids = rows.map((r) => BigInt(r.id));
    const stored = await storedDigests(db, lookups.names, ids);
    const names: LookupNames = {
      country: new Map([...lookups.names.country, ...[...newCountries.values()].map((c) => [c.id, c.name] as [number, string])]),
      team: new Map([...lookups.names.team, ...[...newTeams.values()].map((t) => [t.id, t.name] as [number, string])]),
      pack: lookups.names.pack,
    };
    const write: number[] = [];
    const newIds: number[] = [];
    const changedIds: number[] = [];
    let unchanged = 0;
    rows.forEach((r, i) => {
      const before = stored.get(String(r.id));
      if (before === undefined) {
        newIds.push(r.id);
        write.push(i);
      } else if (before !== playerDigest(mappedRows[i]!, skillsOf(r), names)) {
        changedIds.push(r.id);
        write.push(i);
      } else unchanged++;
    });
    const changed = changedIds.length;
    ctx.stats.cardsNew = newIds.length;
    ctx.stats.cardsChanged = changed;
    ctx.stats.cardsUnchanged = unchanged;
    ctx.stats.imagesDownloaded = 0;
    ctx.stats.imagesUploaded = 0;
    ctx.stats.imagesOverwritten = 0;
    ctx.stats.imagesFailed = 0;
    ctx.log(`cards: ${newIds.length} new, ${changed} changed, ${unchanged} unchanged; new lookup rows: ${newCountries.size} countries, ${newTeams.size} teams, ${newLeagues.size} leagues`);
    // The rows come newest first (time_added DESC): that order is the record's "newest first".
    const rank = new Map<number, number>(rows.map((r, i) => [r.id, i]));
    const found: SyncItemsInput = { newIds, changedIds };
    ctx.recordItems(buildSyncRunItems(found));

    const boosterUpsert = makeUpserter("Booster", "Booster", new Set());
    const storedBoosters = await db.booster.findMany({ where: { id: { in: [...boosterRows.keys()] } } });
    const storedBoosterById = new Map(storedBoosters.map((b) => [b.id, b as unknown as Record<string, unknown>]));
    const boostersToWrite = [...boosterRows.values()].filter((b) => {
      const s = storedBoosterById.get(b.id as number);
      const cols = Object.keys(b);
      return !s || canonBooster(b, cols) !== canonBooster(s, cols);
    });

    // Images earlier runs still owe (third verify W1): the ones among this run's rows are compared now;
    // the others (older cards, no URL here) stay owed for a later run / the full run.
    const carried = await pendingImageIds(db, ctx.run.id);
    const rowIds = new Set(rows.map((r) => r.id));
    const carriedHere = carried.filter((id) => rowIds.has(id));
    const owed = new Set<number>(carried.filter((id) => !rowIds.has(id)));
    if (carried.length > 0) ctx.log(`${carried.length} cards owe images from earlier runs — ${carriedHere.length} of them are among this run's cards and are compared now`);

    const needWrite = !(write.length === 0 && newCountries.size === 0 && newTeams.size === 0 && newLeagues.size === 0 && boostersToWrite.length === 0);
    if (!needWrite && carriedHere.length === 0) {
      ctx.watermarkAfter = dbNewest;
      recordOwedImages(ctx, owed);
      ctx.log("nothing new at the source — nothing written");
      return { status: "OK" };
    }

    // ---- 5. images (before the write) ----
    const emblems = new Set<string>(); // "<kind>/<hash>" of the emblems this run's new rows reference
    for (const c of newCountries.values()) if (c.hash) emblems.add(`nationality/${c.hash}`);
    for (const t of newTeams.values()) if (t.hash) emblems.add(`team/${t.hash}`);
    for (const l of newLeagues.values()) if (l.hash) emblems.add(`league/${l.hash}`);
    const imageIds = [...new Set([...newIds, ...changedIds, ...carriedHere])];
    if (imageIds.length > 0 || emblems.size > 0) {
      const imgDir = join(work, "img");
      mkdirSync(imgDir, { mode: 0o700 });
      const keep = (kind: EmblemKind, url: string | null | undefined) => {
        const h = basename(url ?? null);
        return h && emblems.has(`${kind}/${h}`) ? url : null;
      };
      writeFileSync(
        join(imgDir, "players.jsonl"),
        rows
          .map((r) => {
            const e = r.emblem_images ?? {};
            return JSON.stringify({ ...r, emblem_images: { nationality: keep("nationality", e.nationality), league: keep("league", e.league), team: keep("team", e.team) } });
          })
          .join("\n") + "\n",
      );
      const idsFile = join(imgDir, "only_ids.json");
      // New, rewritten and owed cards, each compared with the bucket first (CR2): only a missing or differing image is downloaded.
      writeFileSync(idsFile, JSON.stringify(imageIds));
      ctx.setProgress({ phase: "Comparing images" });
      const imageResults = join(work, "image_results.jsonl");
      try {
        await runDumpScript(ctx, ["--out", imgDir, "--no-data", "--only-ids", idsFile, "--etag-vs-bucket", env.r2PublicBase], "images", {
          resultsFile: imageResults,
          onProgress: (done, total) => ctx.setProgress({ phase: "Downloading images", done, total }),
        });
      } catch (e) {
        // blocked / failed / cancelled / time limit / worker stop: keep what the step fetched (verify W2), then the original error
        recordStoppedStep(ctx, found, rank, { imageDir: imgDir, imageResults }, "the image step");
        throw e;
      }
      const im = readManifest(imgDir);
      const st = (im.imageStats ?? {}) as Record<string, unknown>;
      const step = imageStepOutcome(imgDir);
      Object.assign(found, imageItems(imgDir, imageResults, rank));
      ctx.recordItems(buildSyncRunItems(found));
      ctx.stats.requests = (ctx.stats.requests ?? 0) + count(im, "cdnRequests");
      ctx.stats.imagesDownloaded = count(st, "ok");
      ctx.stats.imagesOverwritten = step.overwritten;
      ctx.stats.imagesUnverified = step.unverified;
      ctx.stats.imagesFailed = step.failedRels.length;
      ctx.log(
        `images: ${ctx.stats.imagesDownloaded} downloaded (${count(st, "not_modified")} same as the bucket, ${count(st, "bucketNew")} new to the bucket, ` +
          `${step.overwritten} replacing a bucket object, ${step.unverified} unverified), ${count(st, "skip404")} not at the source (404), ${ctx.stats.imagesFailed} failed or skipped` +
          (count(st, "hostBlocked") > 0 ? ` (a third-party image host refused: its images are skipped in this run — the source is NOT blocked)` : ""),
      );
      // third verify W1: a failed / skipped image no longer stops the write — its card is written and the
      // image stays owed (pending), compared again by the next run.
      for (const id of step.failedIds) owed.add(id);
      if (step.failedRels.length > 0) ctx.log(`failed or skipped images: ${readLines(join(imgDir, "image_errors.log")).slice(0, 3).join("; ")}`);
      if (ctx.stats.imagesDownloaded > 0) {
        ctx.setProgress({ phase: "Uploading images" });
        // From here on R2 may hold replaced card images (auto-image-version, design D3): the runner raises
        // the stored card-image version when the run ends — whatever its outcome — because the upload
        // started with verified overwrites. Set before the child, so a failed / cancelled upload counts.
        if (ctx.stats.imagesOverwritten > 0) ctx.cardImagesMayBeReplaced = true;
        let up: Awaited<ReturnType<typeof runUpload>>;
        try {
          up = await runUpload(ctx, join(imgDir, "images"), work, (done, total) => ctx.setProgress({ phase: "Uploading images", done, total }));
        } catch (e) {
          recordStoppedStep(ctx, found, rank, { uploadResults: uploadResultsFile(work) }, "the upload");
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
        ctx.log(`${ctx.stats.imagesOverwritten} card images were overwritten in the bucket — the stored card-image version is raised automatically when this run ends, so visitors fetch the new images (no rebuild)`);
      }
    }
    recordOwedImages(ctx, owed);
    // Recorded on the run row BEFORE the write: a worker dying after the commit can then never lose an
    // owed image (the card would read unchanged afterwards) nor the items record (admin-sync-live-progress);
    // it also stops here if the row cannot be updated (S4).
    await ctx.checkpoint();
    if (!needWrite) {
      ctx.watermarkAfter = dbNewest;
      ctx.log("no row to write — only owed images were compared");
      return { status: "OK" };
    }

    // ---- 6. one transaction ----
    const playerUpsert = makeUpserter("Player", "Player", PLAYER_CROSSFILL_COLUMNS);
    const toWrite = write.map((i) => mappedRows[i]!);
    const links = write.flatMap((i) => skillsOf(rows[i]!).map((skillId) => ({ playerId: BigInt(rows[i]!.id), skillId })));
    // A cancel / time limit must never be recorded for committed rows, and must stop a write that has
    // not committed (verify finding W3): checked right before the transaction, before every statement
    // and as its last step (a throw rolls it back). The runner keeps the run RUNNING while the write is
    // in flight (writeCatalogue) and treats it as committed once it resolved — a cancel that lands
    // between the last check and COMMIT is then noted, not recorded as CANCELLED.
    const guard = (step: string) => {
      if (ctx.signal.aborted) throw new Error(`stopped ${step} (run aborted) — the write was rolled back, nothing was committed`);
    };
    guard("before the database write");
    ctx.setProgress({ phase: "Writing the catalogue" });
    await ctx.writeCatalogue("incremental catalogue write", () => db.$transaction(
      async (tx) => {
        guard("at the start of the database write");
        if (newLeagues.size > 0) {
          await tx.league.createMany({
            data: [...newLeagues.values()].map((l) => ({ id: l.id, name: l.name, region: l.region, emblemUrl: l.hash ? emblemUrl(r2Base, "league", l.hash) : null })),
          });
        }
        if (newCountries.size > 0) {
          guard("during the database write");
          await tx.country.createMany({
            data: [...newCountries.values()].map((c) => ({ id: c.id, name: c.name, flagUrl: c.hash ? emblemUrl(r2Base, "nationality", c.hash) : null })),
          });
        }
        if (newTeams.size > 0) {
          guard("during the database write");
          await tx.team.createMany({
            data: [...newTeams.values()].map((t) => ({
              id: t.id,
              name: t.name,
              national: t.nationality != null && t.nationality === t.name,
              emblemUrl: t.hash ? emblemUrl(r2Base, "team", t.hash) : null,
              countryId: t.nationality ? (countryNameToId.get(t.nationality) ?? null) : null,
              leagueId: t.league,
            })),
          });
        }
        guard("during the database write");
        await boosterUpsert.run(tx, boostersToWrite);
        for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
          guard("during the database write");
          await playerUpsert.run(tx, toWrite.slice(i, i + BATCH_SIZE));
        }
        guard("during the database write");
        if (links.length > 0) await tx.playerSkill.createMany({ data: links, skipDuplicates: true });
        guard("before the commit");
      },
      { timeout: CATALOGUE_WRITE_TX_TIMEOUT_MS, maxWait: CATALOGUE_WRITE_TX_MAX_WAIT_MS },
    ));
    ctx.log(`written: ${toWrite.length} players, ${links.length} skill links (existing kept), ${boostersToWrite.length} boosters, ${newCountries.size} countries, ${newTeams.size} teams, ${newLeagues.size} leagues`);
    ctx.watermarkAfter = newestReleaseAfter(dbNewest, toWrite.map((r) => r.releaseDate as Date | null));
    return { status: "OK" };
  } finally {
    removeRunDir(ctx, work);
  }
}

export const runIncremental: RunHandler = (ctx) => stopToOutcome(() => incremental(ctx));
