// Tests of the live-progress and downloaded-items records (openspec change
// admin-sync-live-progress, design D2 / D4): the interval presets, the phase
// names per kind, the strict progress schema and its counter whitelist, the
// strict items schema (caps, totals, truncation flags, paths, reason classes —
// free text, URLs and names refused), the jsonb text size and the fit to 512 KB.
// Same assert-style runner as sync.test.ts.
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/sync-records.test.ts)
import { SYNC_INTERVAL_MAX_MINUTES, SYNC_INTERVAL_MIN_MINUTES } from "./sync";
import { syncConfigUpdateInput } from "./schemas";
import {
  SYNC_INTERVAL_PRESETS,
  SYNC_ITEMS_LIST_MAX,
  SYNC_ITEMS_MAX_BYTES,
  SYNC_ITEMS_ROWS_SHOWN,
  SYNC_ITEM_PATH_MAX,
  SYNC_PHASES,
  SYNC_PHASE_NAMES,
  SYNC_PROGRESS_COUNTERS,
  buildSyncRunItems,
  capList,
  firstPhase,
  fitSyncRunItems,
  isPhaseOfKind,
  isReasonClass,
  isSyncItemPath,
  jsonbTextBytes,
  progressCounters,
  syncRunItemsSchema,
  syncRunProgressSchema,
  type SyncRunItems,
} from "./sync-records";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const NOW = "2026-10-28T09:00:00.000Z";

// 1. Interval presets (dashboard, design D6)
{
  assert(same(SYNC_INTERVAL_PRESETS.map((p) => p.minutes), [15, 30, 60, 180, 360, 720, 1440]), "presets: 15 min, 30 min, 1 h, 3 h, 6 h, 12 h, 24 h");
  assert(same(SYNC_INTERVAL_PRESETS.map((p) => p.label), ["15 min", "30 min", "1 hour", "3 hours", "6 hours", "12 hours", "24 hours"]), "presets: labels");
  assert(
    SYNC_INTERVAL_PRESETS.every((p) => p.minutes >= SYNC_INTERVAL_MIN_MINUTES && p.minutes <= SYNC_INTERVAL_MAX_MINUTES && syncConfigUpdateInput.safeParse({ enabled: true, incrementalIntervalMin: p.minutes, fullWeekday: 0, fullHourUtc: 3 }).success),
    "presets: every value is accepted by the schedule schema (15–1440)",
  );
}

// 2. Phases per kind (design D2)
{
  assert(same(SYNC_PHASES.CHECK, ["Asking the source"]), "check phases");
  assert(same(SYNC_PHASES.INCREMENTAL, ["Reading pages", "Comparing images", "Downloading images", "Uploading images", "Writing the catalogue"]), "incremental phases");
  assert(same(SYNC_PHASES.FULL, ["Dumping", "Comparing rows", "Seeding", "Comparing images", "Downloading images", "Uploading images"]), "full phases");
  // 1 + 5 + 6 = 12 entries; "Comparing images", "Downloading images", "Uploading images" are shared by incremental and full
  assert(SYNC_PHASE_NAMES.length === 9 && new Set(SYNC_PHASE_NAMES).size === 9, `9 distinct phase names (${SYNC_PHASE_NAMES.length})`);
  assert(isPhaseOfKind("FULL", "Seeding") && !isPhaseOfKind("INCREMENTAL", "Seeding") && !isPhaseOfKind("CHECK", "Reading pages"), "a phase belongs to its kinds only");
  assert(firstPhase("CHECK") === "Asking the source" && firstPhase("INCREMENTAL") === "Reading pages" && firstPhase("FULL") === "Dumping", "first phase per kind");
}

// 3. Progress schema (strict) and the counter whitelist
{
  const ok = { phase: "Downloading images", done: 45, total: 120, counters: { cardsNew: 40, requests: 3 }, updatedAt: NOW };
  assert(syncRunProgressSchema.safeParse(ok).success, "progress 45 / 120 with counters accepted");
  assert(syncRunProgressSchema.safeParse({ ...ok, total: null, done: 0 }).success, "unknown total (null) accepted");
  assert(syncRunProgressSchema.safeParse({ ...ok, done: 120 }).success && !syncRunProgressSchema.safeParse({ ...ok, done: 121 }).success, "done may reach total, never pass it");
  assert(!syncRunProgressSchema.safeParse({ ...ok, phase: "Downloading 45 images from https://example.invalid" }).success, "free-text phase refused");
  assert(!syncRunProgressSchema.safeParse({ ...ok, url: "https://example.invalid" }).success, "an unlisted key refused (strict)");
  assert(!syncRunProgressSchema.safeParse({ ...ok, counters: { imagesPendingIds: [1, 2] } }).success, "a list in the counters refused (imagesPendingIds never goes out)");
  assert(!syncRunProgressSchema.safeParse({ ...ok, counters: { cardsNew: -1 } }).success && !syncRunProgressSchema.safeParse({ ...ok, done: 1.5 }).success, "negative / fractional numbers refused");
  assert(!syncRunProgressSchema.safeParse({ ...ok, updatedAt: "yesterday" }).success, "updatedAt must be an ISO time");
  const stats = { cardsNew: 40, cardsChanged: 2, imagesDownloaded: 0, imagesUploaded: 0, imagesOverwritten: 0, imagesFailed: 0, requests: 5, pages: 1, imagesPendingIds: [1, 2, 3], imagesChecked: true, check: { answered: true }, durationMs: 9 };
  const c = progressCounters(stats);
  assert(same(Object.keys(c).sort(), [...SYNC_PROGRESS_COUNTERS].sort()) && c.cardsNew === 40 && c.requests === 5, `counter whitelist: the seven counts only (${Object.keys(c).join(", ")})`);
  assert(same(progressCounters({ cardsNew: -3, imagesFailed: 1.5, requests: "7" }), {}), "counter whitelist: non-counts dropped");
}

// 4. capList / buildSyncRunItems — caps 2,000, true totals, truncation flags
{
  assert(SYNC_ITEMS_LIST_MAX === 2_000 && SYNC_ITEMS_MAX_BYTES === 524_288 && SYNC_ITEMS_ROWS_SHOWN === 50, "caps: 2,000 per list, 512 KB per record, 50 rows per group in the API");
  const big = Array.from({ length: 2_500 }, (_, i) => 990_000_000_000 + i);
  const c = capList(big);
  assert(c.list.length === 2_000 && c.total === 2_500 && c.truncated && c.list[0] === big[0] && c.list[1_999] === big[1_999], "capList: 2,500 → the first (newest) 2,000, total 2,500, truncated");
  const s = capList(big.slice(0, 2_000));
  assert(s.list.length === 2_000 && s.total === 2_000 && !s.truncated, "capList: exactly 2,000 → not truncated");
  const items = buildSyncRunItems({ newIds: [990_000_000_005, 990_000_000_006, 990_000_000_007], changedIds: big, downloaded: ["cards/990000000005_dynamic.webp"], failed: [{ path: "cards/990000000006_dynamic.webp", reason: "http_404" }] });
  assert(syncRunItemsSchema.safeParse(items).success, "a built record validates");
  assert(items.cards.new.total === 3 && !items.cards.new.truncated && items.cards.changed.ids.length === 2_000 && items.cards.changed.total === 2_500 && items.cards.changed.truncated, "2,500 changed cards: 2,000 ids listed, total 2,500, truncated (500 not listed)");
  assert(items.images.uploaded.total === 0 && items.images.uploaded.paths.length === 0 && !items.images.uploaded.truncated, "an empty group: total 0, not truncated");
}

// 5. Items schema refusals
{
  const base = (): SyncRunItems => buildSyncRunItems({ newIds: [990_000_000_001], failed: [{ path: "cards/990000000001_dynamic.webp", reason: "http_404" }] });
  const withFailed = (reason: string) => {
    const it = base();
    it.images.failed.entries[0]!.reason = reason;
    return syncRunItemsSchema.safeParse(it).success;
  };
  assert(["http_404", "http_500", "http_429", "timeout", "bad_signature", "too_large", "host_refused", "other"].every(withFailed), "reason classes accepted: http_<status>, timeout, bad_signature, too_large, host_refused, other");
  assert(!["HTTP 404", "Not Found", "http_404 not found", "http_999", "http_40", "<html>", "timeout: read timed out", ""].some(withFailed), "free text, bodies, malformed statuses refused as reasons");
  assert(isReasonClass("http_503") && !isReasonClass("http_5033") && !isReasonClass(404), "isReasonClass");
  const withPath = (p: string) => {
    const it = base();
    it.images.downloaded = { paths: [p], total: 1, truncated: false };
    return syncRunItemsSchema.safeParse(it).success;
  };
  assert(["cards/990000000001_dynamic.webp", "cards/1_transparent.webp", "emblems/nationality/0a1b2c.png", "emblems/team/a.b-c_d.png"].every(withPath), "image paths of the dump layout accepted");
  assert(
    ![
      "https://cdn.example.invalid/cards/1_dynamic.webp",
      "cards/1_dynamic.webp?x=1",
      "cards/../1_dynamic.webp",
      "../cards/1_dynamic.webp",
      "cards/01_dynamic.webp",
      "cards/x_dynamic.webp",
      "emblems/evil/a.png",
      "emblems/team/a.svg",
      "emblems/team/.png",
      "emblems/team/a b.png",
      "cards/1_dynamic.webp\n",
    ].some(withPath),
    "URLs, queries, dot segments, other kinds / extensions, spaces, a trailing newline refused as paths",
  );
  const named = base() as unknown as { cards: { new: Record<string, unknown> } };
  named.cards.new.names = ["Test Player 1"];
  assert(!syncRunItemsSchema.safeParse(named).success, "a card name in the record refused (names are joined at read time, never stored)");
  const lying = base();
  lying.cards.new = { ids: [990_000_000_001], total: 5, truncated: false };
  const lying2 = base();
  lying2.cards.new = { ids: [990_000_000_001, 990_000_000_002], total: 1, truncated: false };
  assert(!syncRunItemsSchema.safeParse(lying).success && !syncRunItemsSchema.safeParse(lying2).success, "a total / truncation flag that disagrees with the list refused");
  const over = base();
  over.cards.changed = { ids: Array.from({ length: 2_001 }, (_, i) => i + 1), total: 2_001, truncated: false };
  assert(!syncRunItemsSchema.safeParse(over).success, "a list longer than 2,000 refused");
  assert(!syncRunItemsSchema.safeParse({ ...base(), version: 2 }).success && !syncRunItemsSchema.safeParse({ ...base(), extra: 1 }).success, "version 1 only, no extra key");
}

// 6. jsonb text size (what the CHECK measures) and the fit to 512 KB
{
  assert(jsonbTextBytes({ a: [1, 2], b: "x" }) === '{"a": [1, 2], "b": "x"}'.length, "jsonb text: one space after every ':' and ','");
  assert(jsonbTextBytes({ x: true, y: false, z: null, e: [], o: {} }) === '{"e": [], "o": {}, "x": true, "y": false, "z": null}'.length, "jsonb text: booleans, null, empty containers");
  const small = buildSyncRunItems({ newIds: [990_000_000_001] });
  assert(fitSyncRunItems(small) === small, "a record under the bound is returned unchanged");
  // Worst case: every list full of the longest emblem paths (2,000 × 6 groups) and 2 × 2,000 ids — far over 512 KB.
  const longName = (i: number) => `emblems/nationality/${String(i).padStart(6, "0")}${"a".repeat(170)}.png`;
  const paths = Array.from({ length: 2_000 }, (_, i) => longName(i));
  const huge = buildSyncRunItems({
    newIds: Array.from({ length: 3_000 }, (_, i) => 9_000_000_000_000_000 + i),
    changedIds: Array.from({ length: 2_000 }, (_, i) => 9_000_000_000_000_000 + i),
    downloaded: paths,
    overwritten: paths,
    unverified: paths,
    uploaded: paths,
    failed: paths.map((p) => ({ path: p, reason: "bad_signature" })),
    uploadFailed: paths.map((p) => ({ path: p, reason: "host_refused" })),
  });
  const before = jsonbTextBytes(huge);
  const fitted = fitSyncRunItems(huge);
  const after = jsonbTextBytes(fitted);
  assert(before > SYNC_ITEMS_MAX_BYTES && after <= SYNC_ITEMS_MAX_BYTES, `fit: ${before} bytes (over 512 KB) → ${after} bytes`);
  assert(syncRunItemsSchema.safeParse(fitted).success, "fit: the shortened record still validates");
  assert(fitted.cards.new.total === 3_000 && fitted.images.failed.total === 2_000 && fitted.images.downloaded.truncated && fitted.images.downloaded.paths[0] === paths[0], "fit: true totals kept, newest entries kept, truncation flags set");
  // S2 (verify): a bound below the empty record forces the last resort — lists empty, TRUE totals kept, flags set
  const forced = fitSyncRunItems(huge, 100);
  assert(
    forced.cards.new.ids.length === 0 && forced.cards.new.total === 3_000 && forced.cards.new.truncated &&
      forced.images.downloaded.total === 2_000 && forced.images.downloaded.truncated && forced.images.uploadFailed.total === 2_000 && syncRunItemsSchema.safeParse(forced).success,
    `fit, last resort: every list empty, the true totals kept (new ${forced.cards.new.total}, downloaded ${forced.images.downloaded.total}), truncated set, still valid`,
  );
  const forcedEmpty = fitSyncRunItems(buildSyncRunItems({ newIds: [1] }), 10);
  assert(forcedEmpty.cards.new.total === 1 && forcedEmpty.cards.new.truncated && forcedEmpty.cards.changed.total === 0 && !forcedEmpty.cards.changed.truncated, "fit, last resort: a group that counted nothing stays not truncated");
}

// 7. One path test for the schema and every writer (verify W1): the bound at SYNC_ITEM_PATH_MAX, drop-and-count
{
  const emblem = (kind: string, total: number) => `emblems/${kind}/${"a".repeat(total - `emblems/${kind}/`.length - 4)}.png`;
  const at = emblem("nationality", SYNC_ITEM_PATH_MAX);
  const over = emblem("nationality", SYNC_ITEM_PATH_MAX + 1);
  assert(SYNC_ITEM_PATH_MAX === 200 && at.length === 200 && over.length === 201, "path bound: 200 characters");
  assert(isSyncItemPath(at) && !isSyncItemPath(over) && isSyncItemPath(emblem("team", 200)) && !isSyncItemPath(emblem("team", 201)), "isSyncItemPath: a path of 200 characters accepted, 201 refused (nationality and team emblems)");
  const one = (p: string) => {
    const base = buildSyncRunItems({});
    return syncRunItemsSchema.safeParse({ ...base, images: { ...base.images, downloaded: { paths: [p], total: 1, truncated: false } } }).success;
  };
  assert(one(at) && !one(over), "the schema uses the same test: 200 valid in a record, 201 not");
  // the worker's record with one over-long path among valid ones: written, the long one counted, not listed
  const rec = buildSyncRunItems({ newIds: [990_000_000_001], downloaded: ["cards/990000000001_dynamic.webp", over, "cards/990000000001_transparent.webp"], uploaded: [over], failed: [{ path: over, reason: "http_404" }, { path: at, reason: "free text" }] });
  assert(syncRunItemsSchema.safeParse(rec).success, "a record holding an over-long path among valid ones still validates (nothing lost)");
  assert(
    rec.images.downloaded.paths.length === 2 && rec.images.downloaded.total === 3 && rec.images.downloaded.truncated && rec.images.uploaded.paths.length === 0 && rec.images.uploaded.total === 1 && rec.images.uploaded.truncated,
    `the over-long path is not listed but counted: downloaded 2 listed of 3 (truncated → "1 more not listed"), uploaded 0 of 1`,
  );
  assert(rec.cards.new.ids.length === 1 && rec.images.failed.entries.length === 1 && rec.images.failed.total === 2 && rec.images.failed.entries[0]!.path === at && rec.images.failed.entries[0]!.reason === "other", "failures: an over-long path counted only; a reason that is not a class listed as \"other\"");
  const badIds = buildSyncRunItems({ newIds: [0, -5, 1.5, 990_000_000_002] });
  assert(badIds.cards.new.ids.join() === "990000000002" && badIds.cards.new.total === 4 && badIds.cards.new.truncated, "card ids that are not positive safe integers: counted, not listed");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ sync-records tests passed");
