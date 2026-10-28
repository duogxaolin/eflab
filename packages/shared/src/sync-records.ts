// Live progress and the downloaded-items record of a sync run (openspec change
// admin-sync-live-progress, design D2 / D4; capability data-sync-worker "Live
// Run Progress", "Downloaded Items Record").
//
//   SyncRun.progress  { phase, done, total | null, counters, updatedAt } — written
//                     by the worker with its run heartbeat, NULL once the run ended.
//   SyncRun.items     { version: 1, cards: { new, changed }, images: { downloaded,
//                     overwritten, unverified, uploaded, failed, uploadFailed } } —
//                     card ids and image paths (never a name, URL, header or body),
//                     every list ≤ 2,000 entries newest first with its true total
//                     and a truncation flag, ≤ 512 KB as jsonb text (CHECK).
//
// Deliberately NOT re-exported by the package barrel (`@eflab/shared`): the
// public web pages import the barrel, and nothing here may reach their bundle.
// Import it by its subpath `@eflab/shared/sync-records` (worker, API, the admin
// pages). Pure: no I/O, no clock reads.

import { z } from "zod";
import { INT4_MAX } from "./schemas";
import { utf8ByteLength, type SyncKind } from "./sync";

// ---- Schedule presets (dashboard) ----

/** Interval presets of the schedule form (design D6), in minutes. */
export const SYNC_INTERVAL_PRESETS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 180, label: "3 hours" },
  { minutes: 360, label: "6 hours" },
  { minutes: 720, label: "12 hours" },
  { minutes: 1440, label: "24 hours" },
];

// ---- Progress ----

/** Phase names per run kind (design D2), in the order a run passes them. */
export const SYNC_PHASES = {
  CHECK: ["Asking the source"],
  INCREMENTAL: ["Reading pages", "Comparing images", "Downloading images", "Uploading images", "Writing the catalogue"],
  FULL: ["Dumping", "Comparing rows", "Seeding", "Comparing images", "Downloading images", "Uploading images"],
} as const satisfies Record<SyncKind, readonly string[]>;
export type SyncPhase = (typeof SYNC_PHASES)[SyncKind][number];

/** Every phase name once. */
export const SYNC_PHASE_NAMES = [...new Set<SyncPhase>([...SYNC_PHASES.CHECK, ...SYNC_PHASES.INCREMENTAL, ...SYNC_PHASES.FULL])] as [
  SyncPhase,
  ...SyncPhase[],
];

export function isPhaseOfKind(kind: SyncKind, phase: string): phase is SyncPhase {
  return (SYNC_PHASES[kind] as readonly string[]).includes(phase);
}

/** The first phase of a kind (what a run reports from the moment it is claimed). */
export function firstPhase(kind: SyncKind): SyncPhase {
  return SYNC_PHASES[kind][0];
}

/** Counters a progress snapshot may carry (the statistics known so far). Never a list. */
export const SYNC_PROGRESS_COUNTERS = ["cardsNew", "cardsChanged", "imagesDownloaded", "imagesUploaded", "imagesOverwritten", "imagesFailed", "requests"] as const;
export type SyncProgressCounter = (typeof SYNC_PROGRESS_COUNTERS)[number];

const count = z.number().int().min(0).max(INT4_MAX);

export const syncRunProgressSchema = z
  .object({
    phase: z.enum(SYNC_PHASE_NAMES),
    done: count,
    /** null = unknown (an indeterminate bar). */
    total: count.nullable(),
    counters: z
      .object(Object.fromEntries(SYNC_PROGRESS_COUNTERS.map((k) => [k, count])) as Record<SyncProgressCounter, typeof count>)
      .partial()
      .strict(),
    /** When the worker wrote this snapshot. */
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine((p) => p.total === null || p.done <= p.total, { message: "done must not exceed total" });
export type SyncRunProgress = z.infer<typeof syncRunProgressSchema>;

/** The whitelisted counters of a statistics object: non-negative int4 integers only, nothing else (never `imagesPendingIds`). */
export function progressCounters(stats: Readonly<Record<string, unknown>>): SyncRunProgress["counters"] {
  const out: SyncRunProgress["counters"] = {};
  for (const k of SYNC_PROGRESS_COUNTERS) {
    const v = stats[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= INT4_MAX) out[k] = v;
  }
  return out;
}

// ---- Downloaded-items record ----

/** Entries kept per list (newest first); the true total is kept beside it. */
export const SYNC_ITEMS_LIST_MAX = 2_000;
/** Size bound of the stored record as jsonb text (= the "SyncRun_items_size" CHECK). */
export const SYNC_ITEMS_MAX_BYTES = 512 * 1024;
/** Rows per group the admin API returns with a run (card rows joined from the catalogue, image paths). */
export const SYNC_ITEMS_ROWS_SHOWN = 50;

/** Longest image path a record may hold (characters; every path is ASCII). */
export const SYNC_ITEM_PATH_MAX = 200;
/** The shape half of `isSyncItemPath` — deliberately not exported: the length bound belongs to the same test. */
const ITEM_PATH_SHAPE = /^(?:cards\/[1-9]\d{0,17}_(?:transparent|dynamic)\.webp|emblems\/(?:nationality|league|team)\/[A-Za-z0-9][A-Za-z0-9._-]*\.png)$/;

/**
 * THE test of an image path a record may hold — used by the schema below and by
 * every writer (the worker), so the two can never disagree: the dump script's
 * own layout under images/ — `cards/<id>_<transparent|dynamic>.webp` and
 * `emblems/<kind>/<safe name>.png` (kinds nationality / league / team, the
 * script's safe file names) — at most SYNC_ITEM_PATH_MAX characters. Anything
 * else (a URL, a query, a dot segment, a longer name) is not stored.
 */
export function isSyncItemPath(s: unknown): s is string {
  return typeof s === "string" && s.length <= SYNC_ITEM_PATH_MAX && ITEM_PATH_SHAPE.test(s);
}

/**
 * Failure reason classes (closed set): `http_<status>`, `timeout`,
 * `bad_signature` (a body without an image signature), `too_large`,
 * `host_refused` (an image host refused or was skipped after refusing), `other`.
 * Never free text, a response body or a URL.
 */
export const SYNC_REASON_CLASSES = ["timeout", "bad_signature", "too_large", "host_refused", "other"] as const;
const HTTP_REASON_RE = /^http_[1-5]\d\d$/;
export function isReasonClass(s: unknown): s is string {
  return typeof s === "string" && (HTTP_REASON_RE.test(s) || (SYNC_REASON_CLASSES as readonly string[]).includes(s));
}

const cardId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const itemPath = z.string().refine(isSyncItemPath, { message: "not a record image path" });
const reason = z.string().max(16).refine(isReasonClass, { message: "not a reason class" });
const consistent = (l: { total: number; truncated: boolean }, n: number) => l.total >= n && l.truncated === l.total > n;

const idList = z
  .object({ ids: z.array(cardId).max(SYNC_ITEMS_LIST_MAX), total: count, truncated: z.boolean() })
  .strict()
  .refine((l) => consistent(l, l.ids.length), { message: "total / truncated disagree with the list" });
const pathList = z
  .object({ paths: z.array(itemPath).max(SYNC_ITEMS_LIST_MAX), total: count, truncated: z.boolean() })
  .strict()
  .refine((l) => consistent(l, l.paths.length), { message: "total / truncated disagree with the list" });
const entryList = z
  .object({
    entries: z.array(z.object({ path: itemPath, reason }).strict()).max(SYNC_ITEMS_LIST_MAX),
    total: count,
    truncated: z.boolean(),
  })
  .strict()
  .refine((l) => consistent(l, l.entries.length), { message: "total / truncated disagree with the list" });

export const syncRunItemsSchema = z
  .object({
    version: z.literal(1),
    cards: z.object({ new: idList, changed: idList }).strict(),
    images: z
      .object({
        downloaded: pathList,
        overwritten: pathList,
        unverified: pathList,
        uploaded: pathList,
        failed: entryList,
        uploadFailed: entryList,
      })
      .strict(),
  })
  .strict();
export type SyncRunItems = z.infer<typeof syncRunItemsSchema>;
export type SyncItemFailure = { path: string; reason: string };
export type SyncItemCardGroup = keyof SyncRunItems["cards"];
export type SyncItemPathGroup = "downloaded" | "overwritten" | "unverified" | "uploaded";
export type SyncItemFailureGroup = "failed" | "uploadFailed";

/** The first `max` values (the caller orders them newest first), the true total and whether some were left out. */
export function capList<T>(values: readonly T[], max: number = SYNC_ITEMS_LIST_MAX): { list: T[]; total: number; truncated: boolean } {
  const list = values.slice(0, Math.max(0, max));
  return { list, total: values.length, truncated: values.length > list.length };
}

/** Uncapped lists a run collected, each ordered newest first. */
export interface SyncItemsInput {
  newIds?: readonly number[];
  changedIds?: readonly number[];
  downloaded?: readonly string[];
  overwritten?: readonly string[];
  unverified?: readonly string[];
  uploaded?: readonly string[];
  failed?: readonly SyncItemFailure[];
  uploadFailed?: readonly SyncItemFailure[];
}

const isCardId = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;

/**
 * A record of capped lists (`max` per list, default 2,000) with TRUE totals —
 * the one place that decides what is listed: an entry that is not a valid card
 * id / image path (`isSyncItemPath`: e.g. an emblem name that makes the path
 * longer than SYNC_ITEM_PATH_MAX) is not listed but still counted, so its group
 * reads `truncated` ("N more not listed") and the rest of the record is written
 * as usual — never a whole record lost for one entry. A failure whose reason is
 * not a class is listed as `other`.
 */
export function buildSyncRunItems(input: SyncItemsInput, max: number = SYNC_ITEMS_LIST_MAX): SyncRunItems {
  const group = <T>(v: readonly T[] | undefined, valid: (x: T) => boolean) => {
    const all = v ?? [];
    const c = capList(all.filter(valid), max);
    return { list: c.list, total: all.length, truncated: all.length > c.list.length };
  };
  const ids = (v: readonly number[] | undefined) => {
    const g = group(v, isCardId);
    return { ids: g.list, total: g.total, truncated: g.truncated };
  };
  const paths = (v: readonly string[] | undefined) => {
    const g = group(v, isSyncItemPath);
    return { paths: g.list, total: g.total, truncated: g.truncated };
  };
  const entries = (v: readonly SyncItemFailure[] | undefined) => {
    const g = group(v, (e) => isSyncItemPath(e?.path));
    return { entries: g.list.map((e) => ({ path: e.path, reason: isReasonClass(e.reason) ? e.reason : "other" })), total: g.total, truncated: g.truncated };
  };
  return {
    version: 1,
    cards: { new: ids(input.newIds), changed: ids(input.changedIds) },
    images: {
      downloaded: paths(input.downloaded),
      overwritten: paths(input.overwritten),
      unverified: paths(input.unverified),
      uploaded: paths(input.uploaded),
      failed: entries(input.failed),
      uploadFailed: entries(input.uploadFailed),
    },
  };
}

/**
 * Byte length of `value` as Postgres prints it for `jsonb::text` — what the
 * "SyncRun_items_size" CHECK measures: `{"key": value, …}` / `[a, b]` with one
 * space after every ":" and ",", keys reordered (the order changes nothing),
 * strings escaped as JSON. Exact for the record's values (integers, booleans,
 * null and ASCII strings without control characters).
 */
export function jsonbTextBytes(value: unknown): number {
  if (value === null || value === undefined) return 4;
  if (typeof value === "boolean") return value ? 4 : 5;
  if (typeof value === "number") return String(value).length;
  if (typeof value === "string") return utf8ByteLength(JSON.stringify(value));
  if (Array.isArray(value)) {
    if (value.length === 0) return 2;
    let n = 2 + 2 * (value.length - 1);
    for (const v of value) n += jsonbTextBytes(v);
    return n;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return 2;
  let n = 2 + 2 * (entries.length - 1);
  for (const [k, v] of entries) n += utf8ByteLength(JSON.stringify(k)) + 2 + jsonbTextBytes(v);
  return n;
}

/** Lower per-list caps tried, in order, when a record is over the size bound. */
const FIT_CAPS = [1_500, 1_000, 750, 500, 250, 100, 50, 10, 0] as const;

/**
 * The record shortened until it fits `maxBytes` as jsonb text (spec "Size
 * limit": the lists are shortened first, the database CHECK refuses what is
 * still larger — this keeps the worker from ever writing such a record): every
 * list is cut to the same lower cap, newest entries kept, totals unchanged,
 * truncation flags set. Returns the record unchanged when it already fits.
 */
export function fitSyncRunItems(items: SyncRunItems, maxBytes: number = SYNC_ITEMS_MAX_BYTES): SyncRunItems {
  if (jsonbTextBytes(items) <= maxBytes) return items;
  for (const cap of FIT_CAPS) {
    const cut = <T extends { total: number; truncated: boolean }>(l: T, key: "ids" | "paths" | "entries"): T => {
      const list = (l as unknown as Record<string, unknown[]>)[key]!;
      if (list.length <= cap) return l;
      return { ...l, [key]: list.slice(0, cap), truncated: true };
    };
    const next: SyncRunItems = {
      version: 1,
      cards: { new: cut(items.cards.new, "ids"), changed: cut(items.cards.changed, "ids") },
      images: {
        downloaded: cut(items.images.downloaded, "paths"),
        overwritten: cut(items.images.overwritten, "paths"),
        unverified: cut(items.images.unverified, "paths"),
        uploaded: cut(items.images.uploaded, "paths"),
        failed: cut(items.images.failed, "entries"),
        uploadFailed: cut(items.images.uploadFailed, "entries"),
      },
    };
    if (jsonbTextBytes(next) <= maxBytes) return next;
  }
  // Only for a bound below the empty record (a few hundred bytes) — never the real 512 KB: every list
  // empty, the true totals kept, the truncation flags set wherever something was counted.
  const empty = <T extends { total: number }>(l: T, key: "ids" | "paths" | "entries"): T => ({ ...l, [key]: [], truncated: l.total > 0 });
  return {
    version: 1,
    cards: { new: empty(items.cards.new, "ids"), changed: empty(items.cards.changed, "ids") },
    images: {
      downloaded: empty(items.images.downloaded, "paths"),
      overwritten: empty(items.images.overwritten, "paths"),
      unverified: empty(items.images.unverified, "paths"),
      uploaded: empty(items.images.uploaded, "paths"),
      failed: empty(items.images.failed, "entries"),
      uploadFailed: empty(items.images.uploadFailed, "entries"),
    },
  };
}
