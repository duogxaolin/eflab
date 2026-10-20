// Pure logic of the data sync worker and the admin area (openspec change
// admin-sync-worker, capabilities data-sync-worker and admin-access): run kinds
// and statuses, schedule bounds, what the schedule makes due (`dueRuns`), the
// next scheduled times shown on the dashboard, the incremental watermark, secret
// redaction and the bounded log tail. No I/O, no clock reads (`now` is always a
// parameter), no Node-only API — the web bundle imports this module too.
//
// All times are UTC. A run's "start" for scheduling purposes is `startedAt`, or
// `queuedAt` when it never started (a run cancelled while queued still counts as
// the attempt for its slot, so cancelling a scheduled run does not make the
// worker queue it again on the next tick).

// ---- Kinds, triggers, statuses (mirror the Prisma enums SyncKind / SyncTrigger / SyncStatus) ----

export const SYNC_KINDS = ["CHECK", "INCREMENTAL", "FULL"] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

export const SYNC_TRIGGERS = ["SCHEDULE", "MANUAL"] as const;
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number];

export const SYNC_STATUSES = ["QUEUED", "RUNNING", "OK", "FAILED", "BLOCKED", "CANCELLED"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Statuses of a run that is waiting or executing (queue exclusion, 409 rule). */
export const ACTIVE_SYNC_STATUSES: readonly SyncStatus[] = ["QUEUED", "RUNNING"];
export const isActiveSyncStatus = (s: SyncStatus): boolean => s === "QUEUED" || s === "RUNNING";

/**
 * Queue exclusion groups: an incremental or a full run is refused while one of
 * EITHER kind is queued or running; a check only conflicts with another check.
 * The same grouping drives the 409 rule in the API and `dueRuns` here.
 */
export function syncKindGroup(kind: SyncKind): "check" | "sync" {
  return kind === "CHECK" ? "check" : "sync";
}

// ---- Schedule bounds and defaults (also CHECK constraints in the migration) ----

export const SYNC_INTERVAL_MIN_MINUTES = 15;
export const SYNC_INTERVAL_MAX_MINUTES = 1440;
export const SYNC_DEFAULT_INTERVAL_MINUTES = 360;
export const SYNC_DEFAULT_FULL_WEEKDAY = 0; // Sunday (UTC)
export const SYNC_DEFAULT_FULL_HOUR_UTC = 3;
/** Length of the weekly full-sync window that opens at `fullHourUtc`. */
export const SYNC_FULL_WINDOW_MS = 60 * 60 * 1000;
/** How long the worker stays away from the source after a 403 / 429 / challenge. */
export const SYNC_BLOCK_HOURS = 6;
/** Margin subtracted from the newest release time in the database (ties, late visibility). */
export const SYNC_WATERMARK_MARGIN_SECONDS = 7 * 24 * 60 * 60;
/** Stored log tail limit, UTF-8 bytes (also a CHECK constraint on SyncRun.logTail). */
export const SYNC_LOG_TAIL_MAX_BYTES = 64 * 1024;
/** A RUNNING run whose heartbeat is older than this is failed ("worker restarted"). */
export const SYNC_STALE_RUN_MS = 10 * 60 * 1000;
/** The dashboard shows the worker online while its heartbeat is younger than this. */
export const SYNC_WORKER_ONLINE_MS = 2 * 60 * 1000;
/** Mask written in place of a secret value in stored logs. */
export const REDACTION_MASK = "[redacted]";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// ---- Schedule ----

/** The schedule fields of the SyncConfig row that `dueRuns` reads. */
export interface ScheduleConfig {
  enabled: boolean;
  incrementalIntervalMin: number;
  fullWeekday: number;
  fullHourUtc: number;
  blockedUntil: Date | null;
}

/** The fields of a SyncRun row that `dueRuns` reads (recent history is enough:
 *  every active run and the latest incremental / full run). */
export interface ScheduleRun {
  kind: SyncKind;
  status: SyncStatus;
  queuedAt: Date;
  startedAt: Date | null;
}

const runStart = (r: ScheduleRun): number => (r.startedAt ?? r.queuedAt).getTime();

/** True while "blocked until" lies in the future (equal to `now` = no longer blocked). */
export function isBlocked(blockedUntil: Date | null, now: Date): boolean {
  return blockedUntil !== null && blockedUntil.getTime() > now.getTime();
}

/**
 * Start of the most recent weekly full-sync window at or before `now`: the
 * latest instant ≤ now that is `weekday` (0 = Sunday) at `hourUtc`:00:00.000 UTC.
 */
export function fullWindowStart(now: Date, weekday: number, hourUtc: number): Date {
  const t = now.getTime();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysBack = (now.getUTCDay() - weekday + 7) % 7;
  let start = midnight - daysBack * DAY_MS + hourUtc * 60 * 60 * 1000;
  if (start > t) start -= WEEK_MS;
  return new Date(start);
}

/** Latest start (startedAt ?? queuedAt) among runs of the given kinds, or null. */
function latestStart(runs: readonly ScheduleRun[], kinds: readonly SyncKind[]): number | null {
  let best: number | null = null;
  for (const r of runs) {
    if (!kinds.includes(r.kind)) continue;
    const s = runStart(r);
    if (best === null || s > best) best = s;
  }
  return best;
}

/**
 * Which scheduled runs the worker should queue now, from the configuration and
 * the run history only (data-sync-worker "Sync Schedule"):
 *  · nothing while the schedule is disabled or "blocked until" is in the future;
 *  · nothing of the sync group while an incremental or full run is queued or
 *    running (the same exclusion the API's 409 rule applies);
 *  · FULL when `now` is inside this week's window [start, start + 1 h) and no
 *    full run started (or was queued) since the window opened;
 *  · otherwise INCREMENTAL when the latest incremental or full run (any trigger,
 *    any outcome) started at least `incrementalIntervalMin` minutes ago, or none
 *    exists. A due full run supersedes a due incremental one (one queue slot).
 * Checks are never scheduled.
 */
export function dueRuns(config: ScheduleConfig, runs: readonly ScheduleRun[], now: Date): SyncKind[] {
  if (!config.enabled) return [];
  if (isBlocked(config.blockedUntil, now)) return [];
  if (runs.some((r) => syncKindGroup(r.kind) === "sync" && isActiveSyncStatus(r.status))) return [];
  const t = now.getTime();

  const windowStart = fullWindowStart(now, config.fullWeekday, config.fullHourUtc).getTime();
  if (t < windowStart + SYNC_FULL_WINDOW_MS) {
    const lastFull = latestStart(runs, ["FULL"]);
    if (lastFull === null || lastFull < windowStart) return ["FULL"];
  }

  const lastSync = latestStart(runs, ["INCREMENTAL", "FULL"]);
  if (lastSync === null || t - lastSync >= config.incrementalIntervalMin * 60 * 1000) return ["INCREMENTAL"];
  return [];
}

/**
 * When the schedule will next queue each kind (dashboard "next scheduled runs").
 * null when the schedule is disabled. While blocked, a time is never earlier
 * than "blocked until"; a weekly window that the block covers entirely is
 * skipped. While a sync-group run is active the returned times are what applies
 * once it has finished (the worker waits for it).
 */
export function nextScheduledRuns(
  config: ScheduleConfig,
  runs: readonly ScheduleRun[],
  now: Date,
): { incremental: Date | null; full: Date | null } {
  if (!config.enabled) return { incremental: null, full: null };
  const t = now.getTime();
  const notBefore = isBlocked(config.blockedUntil, now) ? config.blockedUntil!.getTime() : t;

  const lastSync = latestStart(runs, ["INCREMENTAL", "FULL"]);
  const incrementalAt = Math.max(notBefore, lastSync === null ? t : lastSync + config.incrementalIntervalMin * 60 * 1000);

  // Full: this week's window if it is still open (or ahead) and not used yet,
  // else the following weeks' windows; never before the block ends.
  const lastFull = latestStart(runs, ["FULL"]);
  let start = fullWindowStart(now, config.fullWeekday, config.fullHourUtc).getTime();
  let fullAt: number | null = null;
  for (let i = 0; i < 60 && fullAt === null; i++, start += WEEK_MS) {
    const end = start + SYNC_FULL_WINDOW_MS;
    const used = lastFull !== null && lastFull >= start;
    const from = Math.max(start, notBefore, t);
    if (!used && from < end) fullAt = from;
  }
  return { incremental: new Date(incrementalAt), full: fullAt === null ? null : new Date(fullAt) };
}

/** Worker online = heartbeat younger than SYNC_WORKER_ONLINE_MS. */
export function isWorkerOnline(heartbeatAt: Date | null, now: Date): boolean {
  return heartbeatAt !== null && now.getTime() - heartbeatAt.getTime() < SYNC_WORKER_ONLINE_MS;
}

/** A RUNNING run is stale once its heartbeat (or start) is SYNC_STALE_RUN_MS old. */
export function isStaleRun(run: { heartbeatAt: Date | null; startedAt: Date | null; queuedAt: Date }, now: Date): boolean {
  const last = (run.heartbeatAt ?? run.startedAt ?? run.queuedAt).getTime();
  return now.getTime() - last >= SYNC_STALE_RUN_MS;
}

/** "blocked until" set after a refusal by the source at `now`. */
export function blockedUntilAfter(now: Date): Date {
  return new Date(now.getTime() + SYNC_BLOCK_HOURS * 60 * 60 * 1000);
}

// ---- Watermark ----

/**
 * Incremental watermark (epoch seconds) from the newest release time in the
 * database: newest − 7 days, floored to a whole second. An incremental run
 * reads newest-first pages until a page holds only cards released before it.
 * null when the database has no release time at all — an incremental run then
 * refuses to start (it would read the whole catalogue; that is a full run's job).
 */
export function incrementalWatermark(newestReleaseDate: Date | null): number | null {
  if (newestReleaseDate === null) return null;
  return Math.floor(newestReleaseDate.getTime() / 1000) - SYNC_WATERMARK_MARGIN_SECONDS;
}

/** Newest release time after a run: the later of the previous newest and the rows written. */
export function newestReleaseAfter(previous: Date | null, written: Iterable<Date | null>): Date | null {
  let best = previous ? previous.getTime() : null;
  for (const d of written) {
    if (d && (best === null || d.getTime() > best)) best = d.getTime();
  }
  return best === null ? null : new Date(best);
}

// ---- Secret redaction ----

/**
 * Secrets shorter than this are not masked: a short value would match ordinary
 * text and corrupt every line. The worker refuses to start with an efootbase key
 * this short (apps/worker/src/env.ts), so the key is always masked.
 */
export const REDACTION_MIN_SECRET_LENGTH = 8;

/** UTF-8 bytes of a string (no TextEncoder / Buffer: shared runs anywhere). */
function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const B64_STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64 of bytes with the given alphabet, padded with "=". */
function base64(bytes: readonly number[], alphabet: string): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? alphabet[(n >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? alphabet[n & 63]! : "=";
  }
  return out;
}

/**
 * The forms a secret can take in a log line besides its raw text: percent-
 * encoded (upper- and lower-case hex, form encoding with "+" for a space, "/"
 * left as Python's `quote()` does), base64 standard and url-safe, padded and
 * unpadded, and — for a secret inside a larger base64 blob (a Basic auth
 * header, an encoded JSON value) — the characters that encode only the secret's
 * bytes at each of the three byte alignments. Forms shorter than
 * REDACTION_MIN_SECRET_LENGTH are left out.
 */
export function secretForms(secret: string): string[] {
  const forms = new Set<string>([secret]);
  let pct: string | null = null;
  try {
    pct = encodeURIComponent(secret);
  } catch {
    /* lone surrogate: no percent-encoded form */
  }
  if (pct !== null) {
    for (const p of [pct, pct.replace(/%2F/g, "/")]) {
      forms.add(p);
      forms.add(p.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()));
      forms.add(p.replace(/%20/g, "+"));
    }
  }
  // JSON-escaped (a secret inside a JSON log line): JSON.stringify's form, Python json.dumps' ASCII form
  // (\uXXXX for non-ASCII), and both with "/" escaped as "\/".
  const jsonInner = JSON.stringify(secret).slice(1, -1);
  const jsonAscii = jsonInner.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  for (const j of [jsonInner, jsonAscii]) {
    forms.add(j);
    forms.add(j.replace(/\//g, "\\/"));
  }
  const bytes = utf8Bytes(secret);
  for (const alphabet of [B64_STD, B64_URL]) {
    const whole = base64(bytes, alphabet);
    forms.add(whole);
    forms.add(whole.replace(/=+$/, ""));
    for (let offset = 0; offset < 3; offset++) {
      // the secret preceded by `offset` unknown bytes: keep only the 3-byte groups made of secret bytes
      const enc = base64([...new Array<number>(offset).fill(0), ...bytes], alphabet);
      const from = offset === 0 ? 0 : 4;
      const to = 4 * Math.floor((offset + bytes.length) / 3);
      if (to > from) forms.add(enc.slice(from, to));
    }
  }
  return [...forms].filter((f) => f.length >= REDACTION_MIN_SECRET_LENGTH);
}

/**
 * Returns a function that replaces every occurrence of each configured secret
 * value — and of its encoded forms (`secretForms`) — with REDACTION_MASK.
 * Values shorter than REDACTION_MIN_SECRET_LENGTH (after trimming) are ignored
 * (they would match ordinary text); longer forms are replaced first so a secret
 * that contains another one is masked whole. Apply it to whole lines, before
 * they are stored, so truncation can never split a secret.
 */
export function makeRedactor(secrets: readonly (string | null | undefined)[]): (text: string) => string {
  const raw = secrets.filter((s): s is string => typeof s === "string" && s.trim().length >= REDACTION_MIN_SECRET_LENGTH);
  const values = [...new Set(raw.flatMap(secretForms))].sort((a, b) => b.length - a.length);
  if (values.length === 0) return (text) => text;
  return (text) => {
    let out = text;
    for (const v of values) if (out.includes(v)) out = out.split(v).join(REDACTION_MASK);
    return out;
  };
}

// ---- Bounded log tail ----

/** UTF-8 byte length of a string (no TextEncoder / Buffer: shared runs anywhere). */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** The longest suffix of `s` that fits in `maxBytes` UTF-8 bytes (never splits a code point). */
function utf8Tail(s: string, maxBytes: number): string {
  const chars = [...s];
  let bytes = 0;
  let i = chars.length;
  while (i > 0) {
    const b = utf8ByteLength(chars[i - 1]!);
    if (bytes + b > maxBytes) break;
    bytes += b;
    i--;
  }
  return chars.slice(i).join("");
}

/**
 * Splits a byte-stream decoded into text chunks into complete lines. Chunks may
 * end mid-line; the remainder is kept until the next chunk or `flush()`. A
 * trailing "\r" is dropped (CRLF output). Memory is bounded (second verify): a
 * line longer than `maxLineChars` is DROPPED WHOLE — never split, so a secret
 * straddling the bound cannot reach redaction in two unmasked halves — and
 * reported as one marker line with its length.
 */
export class LineSplitter {
  private rest = "";
  /** Characters of the over-long line being dropped (0 = not dropping). */
  private dropping = 0;

  constructor(readonly maxLineChars: number = SYNC_LOG_TAIL_MAX_BYTES) {}

  private marker(n: number): string {
    return `[a line of ${n} characters was dropped: longer than ${this.maxLineChars}]`;
  }

  push(chunk: string): string[] {
    const out: string[] = [];
    let data = chunk;
    if (this.dropping > 0) {
      const nl = data.indexOf("\n");
      if (nl < 0) {
        this.dropping += data.length;
        return out;
      }
      out.push(this.marker(this.dropping + nl));
      this.dropping = 0;
      data = data.slice(nl + 1);
    }
    const parts = (this.rest + data).split("\n");
    this.rest = parts.pop() ?? "";
    for (const p of parts) {
      const l = p.endsWith("\r") ? p.slice(0, -1) : p;
      out.push(l.length > this.maxLineChars ? this.marker(l.length) : l);
    }
    if (this.rest.length > this.maxLineChars) {
      this.dropping = this.rest.length;
      this.rest = "";
    }
    return out;
  }

  flush(): string[] {
    if (this.dropping > 0) {
      const n = this.dropping;
      this.dropping = 0;
      return [this.marker(n)];
    }
    const r = this.rest;
    this.rest = "";
    return r === "" ? [] : [r.endsWith("\r") ? r.slice(0, -1) : r];
  }
}

/**
 * Ring buffer of log lines bounded in UTF-8 bytes (default 64 KB): each line is
 * redacted first, then stored with its "\n"; the oldest lines are dropped while
 * the total exceeds the bound; a single line longer than the bound keeps its end.
 * `toString()` is always ≤ maxBytes bytes.
 */
export class LogTail {
  private lines: Array<{ text: string; bytes: number }> = [];
  private total = 0;
  /** Lines dropped from the front so far. */
  dropped = 0;

  constructor(
    readonly maxBytes: number = SYNC_LOG_TAIL_MAX_BYTES,
    private readonly redact: (line: string) => string = (l) => l,
  ) {
    if (!Number.isInteger(maxBytes) || maxBytes < 2) throw new Error(`LogTail: maxBytes ${maxBytes} must be an integer ≥ 2`);
  }

  push(line: string): void {
    let text = this.redact(line) + "\n";
    let bytes = utf8ByteLength(text);
    if (bytes > this.maxBytes) {
      text = utf8Tail(text, this.maxBytes);
      bytes = utf8ByteLength(text);
    }
    this.lines.push({ text, bytes });
    this.total += bytes;
    while (this.total > this.maxBytes && this.lines.length > 0) {
      this.total -= this.lines.shift()!.bytes;
      this.dropped++;
    }
  }

  get bytes(): number {
    return this.total;
  }

  toString(): string {
    return this.lines.map((l) => l.text).join("");
  }
}
