// Tests for the pure sync / admin logic (openspec admin-sync-worker): the
// schedule (`dueRuns`, `nextScheduledRuns`, the weekly window), queue groups,
// stale runs, worker liveness, the watermark, secret redaction, the bounded log
// tail and the admin / schedule input schemas. Same assert-style runner as
// helpers.test.ts. Boundaries are pinned on both sides and a "tamper" section
// re-runs the real functions with every boundary moved by one unit, so an
// off-by-one change in an interval, the window start, the 7-day margin or the
// blocked check fails here.
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/sync.test.ts)
import {
  LineSplitter,
  LogTail,
  REDACTION_MASK,
  REDACTION_MIN_SECRET_LENGTH,
  SYNC_BLOCK_HOURS,
  SYNC_DEFAULT_FULL_HOUR_UTC,
  SYNC_DEFAULT_FULL_WEEKDAY,
  SYNC_DEFAULT_INTERVAL_MINUTES,
  SYNC_FULL_WINDOW_MS,
  SYNC_KINDS,
  SYNC_LOG_TAIL_MAX_BYTES,
  SYNC_STALE_RUN_MS,
  SYNC_STATUSES,
  SYNC_TRIGGERS,
  SYNC_WATERMARK_MARGIN_SECONDS,
  SYNC_WORKER_ONLINE_MS,
  blockedUntilAfter,
  dueRuns,
  fullWindowStart,
  incrementalWatermark,
  isBlocked,
  isStaleRun,
  isWorkerOnline,
  makeRedactor,
  newestReleaseAfter,
  nextScheduledRuns,
  syncKindGroup,
  utf8ByteLength,
  type ScheduleConfig,
  type ScheduleRun,
  type SyncKind,
  type SyncStatus,
} from "./sync";
import {
  ADMIN_USERNAME_RE,
  adminPassword,
  adminSignInInput,
  adminUsername,
  syncConfigUpdateInput,
  syncQueueInput,
  syncRunStatsSchema,
  syncRunsListInput,
} from "./schemas";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const same = (a: readonly unknown[], b: readonly unknown[]): boolean => JSON.stringify(a) === JSON.stringify(b);

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Monday 2026-10-19 12:00 UTC (getUTCDay() === 1). The default full window is
// Sunday 03:00–04:00 UTC: 2026-10-18T03:00Z (previous) and 2026-10-25T03:00Z (next).
const MONDAY_NOON = new Date("2026-10-19T12:00:00.000Z");
const SUNDAY_0300 = new Date("2026-10-18T03:00:00.000Z");
const NEXT_SUNDAY_0300 = new Date("2026-10-25T03:00:00.000Z");
const at = (d: Date, deltaMs: number): Date => new Date(d.getTime() + deltaMs);

const cfg = (over: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
  enabled: true,
  incrementalIntervalMin: 360,
  fullWeekday: 0,
  fullHourUtc: 3,
  blockedUntil: null,
  ...over,
});
const run = (kind: SyncKind, status: SyncStatus, startedAt: Date | null, queuedAt?: Date): ScheduleRun => ({
  kind,
  status,
  startedAt,
  queuedAt: queuedAt ?? startedAt ?? MONDAY_NOON,
});
// A full run already done in the current (previous-Sunday) window, so these
// cases test the incremental rule only.
const fullDone = run("FULL", "OK", at(SUNDAY_0300, 10 * MIN));

// 1. Constants = the spec's numbers.
{
  assert(SYNC_DEFAULT_INTERVAL_MINUTES === 360 && SYNC_DEFAULT_FULL_WEEKDAY === 0 && SYNC_DEFAULT_FULL_HOUR_UTC === 3, "defaults: every 360 min, full sync Sunday 03 UTC");
  assert(SYNC_WATERMARK_MARGIN_SECONDS === 604_800, "watermark margin = 7 days in seconds");
  assert(SYNC_LOG_TAIL_MAX_BYTES === 65_536, "log tail bound = 64 KB");
  assert(SYNC_STALE_RUN_MS === 10 * MIN, "stale RUNNING run = 10 minutes without heartbeat");
  assert(SYNC_WORKER_ONLINE_MS === 2 * MIN, "worker online = heartbeat younger than 2 minutes");
  assert(SYNC_BLOCK_HOURS === 6, "blocked for 6 hours after a refusal");
  assert(SYNC_FULL_WINDOW_MS === HOUR, "weekly full window lasts one hour");
  assert(same(SYNC_KINDS, ["CHECK", "INCREMENTAL", "FULL"]), "run kinds");
  assert(same(SYNC_TRIGGERS, ["SCHEDULE", "MANUAL"]), "run triggers");
  assert(same(SYNC_STATUSES, ["QUEUED", "RUNNING", "OK", "FAILED", "BLOCKED", "CANCELLED"]), "run statuses");
}

// 2. Sync Schedule — "Incremental due": last incremental 7 h ago, interval 360, nothing queued.
{
  const runs = [fullDone, run("INCREMENTAL", "OK", at(MONDAY_NOON, -7 * HOUR))];
  assert(same(dueRuns(cfg(), runs, MONDAY_NOON), ["INCREMENTAL"]), "incremental due when the last one started 7 h ago (interval 360 min)");
  assert(same(dueRuns(cfg(), [fullDone, run("INCREMENTAL", "OK", at(MONDAY_NOON, -5 * HOUR))], MONDAY_NOON), []), "not due 5 h after the last one");
  // boundary: exactly the interval → due; 1 ms short → not due.
  assert(same(dueRuns(cfg(), [fullDone, run("INCREMENTAL", "OK", at(MONDAY_NOON, -360 * MIN))], MONDAY_NOON), ["INCREMENTAL"]), "due at exactly the interval");
  assert(same(dueRuns(cfg(), [fullDone, run("INCREMENTAL", "OK", at(MONDAY_NOON, -360 * MIN + 1))], MONDAY_NOON), []), "not due 1 ms before the interval");
  // a full run counts as the last sync; any trigger and any outcome counts.
  assert(same(dueRuns(cfg(), [run("FULL", "OK", at(SUNDAY_0300, 0)), run("FULL", "FAILED", at(MONDAY_NOON, -1 * HOUR))], MONDAY_NOON), []), "a full run 1 h ago resets the incremental timer (failed runs count too)");
  assert(same(dueRuns(cfg(), [fullDone], MONDAY_NOON), ["INCREMENTAL"]), "the window's full run (33 h ago) makes an incremental due");
  assert(same(dueRuns(cfg(), [fullDone, run("INCREMENTAL", "CANCELLED", null, at(MONDAY_NOON, -1 * HOUR))], MONDAY_NOON), []), "a run cancelled while queued counts as the attempt (queuedAt)");
  // first ever run: nothing in history, outside the full window → incremental.
  assert(same(dueRuns(cfg(), [], MONDAY_NOON), ["INCREMENTAL"]), "empty history outside the window → incremental");
  // checks never influence the schedule
  assert(same(dueRuns(cfg(), [fullDone, run("CHECK", "OK", at(MONDAY_NOON, -1 * MIN))], MONDAY_NOON), ["INCREMENTAL"]), "a check does not reset the incremental timer");
}

// 3. "Schedule disabled" → nothing queued.
{
  assert(same(dueRuns(cfg({ enabled: false }), [], MONDAY_NOON), []), "disabled schedule queues nothing (empty history)");
  assert(same(dueRuns(cfg({ enabled: false }), [], at(SUNDAY_0300, 5 * MIN)), []), "disabled schedule queues no full run inside the window");
  const n = nextScheduledRuns(cfg({ enabled: false }), [], MONDAY_NOON);
  assert(n.incremental === null && n.full === null, "disabled schedule has no next runs");
}

// 4. "Blocked window": blocked until in the future → nothing; equal to now → not blocked.
{
  const runs = [fullDone, run("INCREMENTAL", "OK", at(MONDAY_NOON, -7 * HOUR))];
  assert(same(dueRuns(cfg({ blockedUntil: at(MONDAY_NOON, 1) }), runs, MONDAY_NOON), []), "blocked until 1 ms ahead → nothing queued");
  assert(same(dueRuns(cfg({ blockedUntil: MONDAY_NOON }), runs, MONDAY_NOON), ["INCREMENTAL"]), "blocked until == now → no longer blocked");
  assert(same(dueRuns(cfg({ blockedUntil: at(MONDAY_NOON, -1) }), runs, MONDAY_NOON), ["INCREMENTAL"]), "blocked until in the past → due");
  assert(same(dueRuns(cfg({ blockedUntil: at(SUNDAY_0300, HOUR) }), [], at(SUNDAY_0300, 30 * MIN)), []), "no full run while blocked inside the window");
  assert(isBlocked(at(MONDAY_NOON, 1), MONDAY_NOON) && !isBlocked(MONDAY_NOON, MONDAY_NOON) && !isBlocked(null, MONDAY_NOON), "isBlocked boundary");
  assert(blockedUntilAfter(MONDAY_NOON).getTime() === MONDAY_NOON.getTime() + 6 * HOUR, "blocked until = now + 6 h");
  const n = nextScheduledRuns(cfg({ blockedUntil: at(MONDAY_NOON, 2 * HOUR) }), runs, MONDAY_NOON);
  assert(n.incremental?.getTime() === MONDAY_NOON.getTime() + 2 * HOUR, "next incremental waits for the end of the block");
}

// 5. Weekly full window: due once in [Sunday 03:00, 04:00) when none started since it opened.
{
  const lastInc = run("INCREMENTAL", "OK", at(SUNDAY_0300, -1 * HOUR)); // 02:00, recent
  assert(fullWindowStart(MONDAY_NOON, 0, 3).getTime() === SUNDAY_0300.getTime(), "window start for Monday noon = previous Sunday 03:00 UTC");
  assert(fullWindowStart(SUNDAY_0300, 0, 3).getTime() === SUNDAY_0300.getTime(), "window start at exactly Sunday 03:00 = itself");
  assert(fullWindowStart(at(SUNDAY_0300, -1), 0, 3).getTime() === SUNDAY_0300.getTime() - 7 * DAY, "1 ms before the window → the week before");
  assert(fullWindowStart(new Date("2026-10-21T00:30:00Z"), 2, 23).toISOString() === "2026-10-20T23:00:00.000Z", "Tuesday 23:00 window seen from Wednesday 00:30");
  assert(same(dueRuns(cfg(), [lastInc], SUNDAY_0300), ["FULL"]), "full due at the window start (supersedes nothing else)");
  assert(same(dueRuns(cfg(), [lastInc], at(SUNDAY_0300, HOUR - 1)), ["FULL"]), "full due at window start + 59:59.999");
  assert(same(dueRuns(cfg(), [lastInc], at(SUNDAY_0300, HOUR)), []), "full not due at window start + 60:00 (window closed; incremental not due yet either)");
  assert(same(dueRuns(cfg(), [lastInc], at(SUNDAY_0300, -1)), []), "full not due 1 ms before the window");
  assert(same(dueRuns(cfg(), [lastInc, run("FULL", "OK", at(SUNDAY_0300, 1))], at(SUNDAY_0300, 30 * MIN)), []), "full not due again once one started in the window");
  assert(same(dueRuns(cfg(), [lastInc, run("FULL", "OK", SUNDAY_0300)], at(SUNDAY_0300, 30 * MIN)), []), "a full run that started exactly at the window start counts");
  assert(same(dueRuns(cfg(), [lastInc, run("FULL", "OK", at(SUNDAY_0300, -1))], at(SUNDAY_0300, 30 * MIN)), ["FULL"]), "a full run that started 1 ms before the window does not count");
  assert(same(dueRuns(cfg(), [run("INCREMENTAL", "OK", at(SUNDAY_0300, -7 * HOUR))], at(SUNDAY_0300, 10 * MIN)), ["FULL"]), "full supersedes a due incremental (one slot)");
  // another weekday / hour
  const wed = cfg({ fullWeekday: 3, fullHourUtc: 0 });
  assert(same(dueRuns(wed, [lastInc], new Date("2026-10-21T00:15:00Z")), ["FULL"]), "custom window Wednesday 00:00 UTC is honoured");
  // next scheduled full
  const n1 = nextScheduledRuns(cfg(), [fullDone], MONDAY_NOON);
  assert(n1.full?.getTime() === NEXT_SUNDAY_0300.getTime(), "next full after a used window = next Sunday 03:00");
  const n2 = nextScheduledRuns(cfg(), [lastInc], at(SUNDAY_0300, 20 * MIN));
  assert(n2.full?.getTime() === at(SUNDAY_0300, 20 * MIN).getTime(), "next full inside an unused open window = now");
  const n3 = nextScheduledRuns(cfg({ blockedUntil: at(SUNDAY_0300, 2 * HOUR) }), [lastInc], at(SUNDAY_0300, 20 * MIN));
  assert(n3.full?.getTime() === NEXT_SUNDAY_0300.getTime(), "a block covering the rest of the window moves the next full a week on");
  const n4 = nextScheduledRuns(cfg(), [fullDone, run("INCREMENTAL", "OK", at(MONDAY_NOON, -1 * HOUR))], MONDAY_NOON);
  assert(n4.incremental?.getTime() === MONDAY_NOON.getTime() + 5 * HOUR, "next incremental = last start + interval");
}

// 6. "a run is never due while another run of the same kind is queued or running"
//    (with the API's group rule: incremental and full exclude each other).
{
  const old = run("INCREMENTAL", "OK", at(MONDAY_NOON, -7 * HOUR));
  for (const status of ["QUEUED", "RUNNING"] as const) {
    assert(same(dueRuns(cfg(), [fullDone, old, run("INCREMENTAL", status, status === "RUNNING" ? at(MONDAY_NOON, -8 * HOUR) : null, at(MONDAY_NOON, -8 * HOUR))], MONDAY_NOON), []), `no incremental while an incremental is ${status}`);
    assert(same(dueRuns(cfg(), [old, run("FULL", status, null, at(SUNDAY_0300, -DAY))], at(SUNDAY_0300, 10 * MIN)), []), `no full while a full is ${status}`);
    assert(same(dueRuns(cfg(), [fullDone, old, run("FULL", status, null, at(MONDAY_NOON, -8 * HOUR))], MONDAY_NOON), []), `no incremental while a full is ${status}`);
    assert(same(dueRuns(cfg(), [fullDone, old, run("CHECK", status, null, MONDAY_NOON)], MONDAY_NOON), ["INCREMENTAL"]), `a ${status} check does not hold back the schedule`);
  }
  for (const status of ["OK", "FAILED", "BLOCKED", "CANCELLED"] as const) {
    assert(same(dueRuns(cfg(), [fullDone, run("INCREMENTAL", status, at(MONDAY_NOON, -7 * HOUR))], MONDAY_NOON), ["INCREMENTAL"]), `a finished (${status}) run does not block the queue`);
  }
  assert(syncKindGroup("CHECK") === "check" && syncKindGroup("INCREMENTAL") === "sync" && syncKindGroup("FULL") === "sync", "queue groups: check | incremental+full");
}

// 7. Run Queue — stale RUNNING rows and worker liveness.
{
  const base = { startedAt: at(MONDAY_NOON, -HOUR), queuedAt: at(MONDAY_NOON, -HOUR) };
  assert(isStaleRun({ ...base, heartbeatAt: at(MONDAY_NOON, -10 * MIN) }, MONDAY_NOON), "heartbeat exactly 10 min old → stale");
  assert(!isStaleRun({ ...base, heartbeatAt: at(MONDAY_NOON, -10 * MIN + 1) }, MONDAY_NOON), "heartbeat 1 ms younger than 10 min → not stale");
  assert(isStaleRun({ ...base, heartbeatAt: null }, MONDAY_NOON), "no heartbeat, started 1 h ago → stale");
  assert(isWorkerOnline(at(MONDAY_NOON, -2 * MIN + 1), MONDAY_NOON) && !isWorkerOnline(at(MONDAY_NOON, -2 * MIN), MONDAY_NOON), "online < 2 min, offline at 2 min");
  assert(!isWorkerOnline(at(MONDAY_NOON, -3 * MIN), MONDAY_NOON) && !isWorkerOnline(null, MONDAY_NOON), "\"Worker stopped\": 3 min old or no heartbeat → offline");
}

// 8. Watermark = newest release − 7 days (epoch seconds); empty DB → null.
{
  const newest = new Date("2026-10-15T09:30:00.900Z");
  const wm = incrementalWatermark(newest);
  assert(wm === Math.floor(newest.getTime() / 1000) - 604_800, "watermark = floor(newest s) − 604800");
  assert(Number.isInteger(wm), "watermark is an integer number of seconds");
  assert(new Date(wm! * 1000).toISOString() === "2026-10-08T09:30:00.000Z", "15 Oct 09:30:00.9 → 8 Oct 09:30:00");
  assert(incrementalWatermark(null) === null, "no release date in the database → null (incremental refuses)");
  const after = newestReleaseAfter(newest, [null, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-16T00:00:00Z")]);
  assert(after?.toISOString() === "2026-10-16T00:00:00.000Z", "watermark after = the newest of previous and written");
  assert(newestReleaseAfter(newest, [])?.getTime() === newest.getTime() && newestReleaseAfter(null, []) === null, "nothing written → unchanged");
}

// 9. Secret redaction ("Log redaction").
{
  const KEY = "k3y-AbCdEf0123456789"; // synthetic, not a real credential
  const r = makeRedactor([KEY, "", "   ", undefined, null, "AbCd", "Ef012345"]);
  assert(r(`GET /players X-API-Key: ${KEY} done`) === `GET /players X-API-Key: ${REDACTION_MASK} done`, "the configured key is masked");
  assert(r(`${KEY}${KEY}`) === `${REDACTION_MASK}${REDACTION_MASK}`, "every occurrence is masked");
  assert(!r(`a ${KEY} b`).includes("Ef012345"), "the longer secret is masked whole before a shorter one inside it");
  assert(r("Ef012345 alone") === `${REDACTION_MASK} alone`, "a shorter secret (≥ 8 characters) is masked on its own too");
  assert(REDACTION_MIN_SECRET_LENGTH === 8, "secrets shorter than 8 characters are not masked (pinned)");
  assert(r("AbCd alone, AbCd") === "AbCd alone, AbCd", "a secret shorter than 8 characters is ignored (it would corrupt ordinary text)");
  assert(r("plain line") === "plain line", "empty / whitespace secrets are ignored (no line corruption)");
  assert(makeRedactor([])("x") === "x", "no secrets → identity");
}

// 9b. Encoded forms of a secret (verify finding W6): URL-encoded (upper / lower
//     hex, form encoding, "/" kept as Python's quote() does), base64 standard and
//     url-safe, padded and unpadded, and a secret inside a larger base64 blob at
//     each byte alignment. Probes: a key with "+", "/", "=" and a space.
{
  const KEY = "k3y+with/slash=and space-Z9"; // synthetic
  const PW = "p@ss:w0rd/é+x"; // synthetic database password (non-ASCII byte too)
  const r = makeRedactor([KEY, PW]);
  const enc = encodeURIComponent(KEY); // k3y%2Bwith%2Fslash%3Dand%20space-Z9
  const b64 = Buffer.from(KEY, "utf8").toString("base64");
  const b64url = Buffer.from(KEY, "utf8").toString("base64url");
  const probes: Array<[string, string]> = [
    ["percent-encoded (upper-case hex)", enc],
    ["percent-encoded (lower-case hex)", enc.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase())],
    ["form-encoded (space as +)", enc.replace(/%20/g, "+")],
    ["percent-encoded with '/' kept (Python quote)", enc.replace(/%2F/g, "/")],
    ["base64 (standard, padded)", b64],
    ["base64 (standard, unpadded)", b64.replace(/=+$/, "")],
    ["base64url (unpadded)", b64url],
    ["base64url (padded)", b64url + "=".repeat((4 - (b64url.length % 4)) % 4)],
    ["password percent-encoded", encodeURIComponent(PW)],
    ["password base64", Buffer.from(PW, "utf8").toString("base64")],
  ];
  for (const [what, form] of probes) {
    const out = r(`x-api-key=${form}; next`);
    assert(!out.includes(form) && out.includes(REDACTION_MASK), `${what} of the secret is masked (${form.slice(0, 12)}…)`);
  }
  // The verifier's probe: the key URL-encoded inside a query string.
  assert(!r(`GET /players?key=k3y%2Bwith%2Fslash%3Dand%20space-Z9&page=1`).includes("k3y%2Bwith"), "probe k3y%2Bwith… (URL-encoded key in a query string) is masked");
  // A secret inside a larger base64 blob (Basic auth header, JSON blob) at byte offsets 0, 1, 2.
  for (const prefix of ["", "u", "us", "user:"]) {
    const blob = Buffer.from(`${prefix}${KEY}:tail`, "utf8").toString("base64");
    const p = Buffer.byteLength(prefix);
    const L = Buffer.byteLength(KEY);
    // the characters of the blob that encode only bytes of the secret (whole 3-byte groups)
    const secretChars = blob.slice(4 * Math.ceil(p / 3), 4 * Math.floor((p + L) / 3));
    const out = r(`Authorization: Basic ${blob}`);
    assert(secretChars.length >= 24 && !out.includes(secretChars) && out.includes(REDACTION_MASK), `secret inside a base64 blob at byte offset ${p} (alignment ${p % 3}) is masked`);
  }
  // JSON-escaped forms (second verify): a secret with a quote, a backslash, "/" and a non-ASCII
  // character as JSON.stringify and Python's json.dumps (ensure_ascii, "/" possibly escaped) write it.
  {
    const S = 'p"ss\\w0rd/é-long-9'; // synthetic
    const rj = makeRedactor([S]);
    const jsInner = JSON.stringify(S).slice(1, -1); // p\"ss\\w0rd/é-long-9
    const pyAscii = jsInner.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`); // …é…
    const slashEscaped = pyAscii.replace(/\//g, "\\/");
    for (const [what, form] of [["JSON.stringify", jsInner], ["json.dumps (ensure_ascii)", pyAscii], ["JSON with \\/", slashEscaped]] as const) {
      const out = rj(`{"password":"${form}"}`);
      assert(!out.includes(form) && out.includes(REDACTION_MASK), `${what} form of a secret is masked (${form})`);
    }
  }
  // Short secrets: never masked in any form (no false positives on ordinary text).
  const short = makeRedactor(["abc1234"]);
  assert(short("abc1234 YWJjMTIzNA== abc1234") === "abc1234 YWJjMTIzNA== abc1234", "a 7-character secret is ignored in every form");
  // No false positives on unrelated text.
  assert(r("GET /players?page=1&limit=100 — 200 OK in 31 ms") === "GET /players?page=1&limit=100 — 200 OK in 31 ms", "unrelated text is untouched");
}

// 10. Bounded log tail (UTF-8 bytes) + line splitting.
{
  assert(utf8ByteLength("aé€😀") === 1 + 2 + 3 + 4, "UTF-8 byte length (1/2/3/4-byte code points)");
  const t = new LogTail(16);
  t.push("0123456"); // 8 bytes with \n
  t.push("abcdefg"); // 16
  assert(t.toString() === "0123456\nabcdefg\n" && t.bytes === 16, "fills up to the bound exactly");
  t.push("X"); // 18 → drop the oldest
  assert(t.toString() === "abcdefg\nX\n" && t.dropped === 1, "oldest line dropped when the bound is exceeded");
  const t1 = new LogTail(16);
  t1.push("0123456"); // 8
  t1.push("abcdefgh"); // 17 = bound + 1 → drop
  assert(t1.toString() === "abcdefgh\n" && t1.bytes === 9, "one byte over the bound already drops the oldest line");
  const big = new LogTail(10);
  big.push("€€€€€€"); // 18 bytes + \n
  assert(big.bytes <= 10 && big.toString().endsWith("€€€\n") && big.toString() === "€€€\n", "an oversized line keeps its end, never splitting a code point");
  const red = new LogTail(SYNC_LOG_TAIL_MAX_BYTES, makeRedactor(["s3cr3t-value"]));
  for (let i = 0; i < 5000; i++) red.push(`line ${i} token=s3cr3t-value ${"é".repeat(10)}`);
  const s = red.toString();
  assert(utf8ByteLength(s) <= SYNC_LOG_TAIL_MAX_BYTES && red.bytes === utf8ByteLength(s), "64 KB bound holds after 5000 lines (byte-accurate)");
  assert(!s.includes("s3cr3t-value") && s.includes(REDACTION_MASK) && s.endsWith(`line 4999 token=${REDACTION_MASK} ${"é".repeat(10)}\n`), "redacted before storage; newest line kept");
  const sp = new LineSplitter();
  const got = [...sp.push("ab"), ...sp.push("c\r\nde"), ...sp.push("f\ng"), ...sp.flush()];
  assert(same(got, ["abc", "def", "g"]), "chunks are re-assembled into lines (CRLF, partial last line)");
  // a secret split across two chunks is still masked once lines are whole
  const sp2 = new LineSplitter();
  const rr = makeRedactor(["SPLITSECRET"]);
  const lines = [...sp2.push("x SPLIT"), ...sp2.push("SECRET y\n")].map(rr);
  assert(same(lines, [`x ${REDACTION_MASK} y`]), "a secret split across chunks is masked (redaction on whole lines)");
  // Bounded lines (second verify): a line longer than the bound is dropped whole — never split, so a
  // secret straddling the bound can never be cut into an unmasked half — and replaced by a marker.
  {
    const SECRET = "STRADDLE-SECRET-0123456789";
    const sp3 = new LineSplitter(64);
    const got3 = [
      ...sp3.push("short line\n"),
      ...sp3.push("x".repeat(50) + SECRET.slice(0, 10)), // the open line passes the bound of 64 here
      ...sp3.push(SECRET.slice(10) + " tail of the long line\nnext line\n"),
      ...sp3.push("y".repeat(100) + "\n"), // a complete over-long line in one chunk
      ...sp3.flush(),
    ];
    const r3 = makeRedactor([SECRET]);
    const joined = got3.map(r3).join("\n");
    assert(got3[0] === "short line" && got3[2] === "next line" && got3.length === 4, `bounded splitter: short lines pass, over-long lines become one marker each (${JSON.stringify(got3).slice(0, 160)})`);
    assert(/dropped/.test(got3[1]!) && /dropped/.test(got3[3]!) && !joined.includes("STRADDLE") && !joined.includes("0123456789"), "bounded splitter: no part of a secret straddling the bound survives");
    const sp4 = new LineSplitter(16);
    assert(same([...sp4.push("z".repeat(40)), ...sp4.flush()], ["[a line of 40 characters was dropped: longer than 16]"]), "bounded splitter: an unterminated over-long tail is reported on flush with its length");
    assert(new LineSplitter().maxLineChars === SYNC_LOG_TAIL_MAX_BYTES, "bounded splitter: default bound = the log tail size (64 KB)");
  }
}

// 11. Input schemas ("Invalid change" → 400; admin names and passwords).
{
  const ok = { enabled: true, incrementalIntervalMin: 360, fullWeekday: 0, fullHourUtc: 3 };
  assert(syncConfigUpdateInput.safeParse(ok).success, "valid schedule accepted");
  assert(!syncConfigUpdateInput.safeParse({ ...ok, incrementalIntervalMin: 5 }).success, "interval 5 min rejected");
  assert(!syncConfigUpdateInput.safeParse({ ...ok, fullHourUtc: 24 }).success, "hour 24 rejected");
  assert(syncConfigUpdateInput.safeParse({ ...ok, incrementalIntervalMin: 15 }).success && syncConfigUpdateInput.safeParse({ ...ok, incrementalIntervalMin: 1440 }).success, "interval bounds 15 and 1440 accepted");
  assert(!syncConfigUpdateInput.safeParse({ ...ok, incrementalIntervalMin: 14 }).success && !syncConfigUpdateInput.safeParse({ ...ok, incrementalIntervalMin: 1441 }).success, "interval 14 and 1441 rejected");
  assert(!syncConfigUpdateInput.safeParse({ ...ok, fullWeekday: 7 }).success && !syncConfigUpdateInput.safeParse({ ...ok, fullWeekday: -1 }).success, "weekday outside 0–6 rejected");
  assert(syncConfigUpdateInput.safeParse({ ...ok, fullWeekday: 6, fullHourUtc: 23 }).success, "weekday 6 / hour 23 accepted");
  assert(!syncConfigUpdateInput.safeParse({ ...ok, incrementalIntervalMin: 360.5 }).success && !syncConfigUpdateInput.safeParse({ ...ok, enabled: "yes" }).success, "non-integer interval / non-boolean enabled rejected");
  assert(!syncConfigUpdateInput.safeParse({ enabled: true }).success, "missing fields rejected");
  assert(syncQueueInput.safeParse({ kind: "FULL" }).success && !syncQueueInput.safeParse({ kind: "PRUNE" }).success, "queue kind must be CHECK / INCREMENTAL / FULL");
  assert(syncRunsListInput.parse({}).limit === 20 && !syncRunsListInput.safeParse({ limit: 51 }).success, "run list paging bounds");
  for (const name of ["abc", "owner.admin", "a_b-c.9", "x".repeat(32)]) assert(ADMIN_USERNAME_RE.test(name) && adminUsername.safeParse(name).success, `user name "${name}" accepted`);
  for (const name of ["ab", "x".repeat(33), "Owner", "own er", "ow!ner", "admin@x", ""]) assert(!adminUsername.safeParse(name).success, `user name ${JSON.stringify(name)} rejected`);
  assert(!adminPassword.safeParse("elevenchars").success && adminPassword.safeParse("twelve chars").success, "password minimum 12 characters (11 rejected, 12 accepted)");
  assert(adminSignInInput.safeParse({ username: "Not A Valid Name!", password: "x" }).success, "sign-in input does not tell invalid names from unknown ones");
  assert(syncRunStatsSchema.safeParse({ cardsNew: 3, check: { answered: true, httpStatus: 200, challenge: false, responseMs: 120, newestReleaseAt: "2026-10-15T00:00:00.000Z", dbNewestReleaseAt: null, newerThanDb: null } }).success, "run stats with a check result accepted");
  assert(!syncRunStatsSchema.safeParse({ cardsNew: 1, apiKey: "x" }).success, "an unknown key in run stats is rejected (no secret field can be stored)");
  assert(!syncRunStatsSchema.safeParse({ cardsNew: -1 }).success, "negative counts rejected");
}

// 12. Tamper checks — each moves one boundary of the real functions by one unit
//     and asserts the decision flips. If a constant or comparison in sync.ts
//     changes (interval unit, window start or length, margin, blocked compare),
//     one of the pinned cases above or below fails.
{
  const last = at(MONDAY_NOON, -360 * MIN);
  const due = (interval: number) => dueRuns(cfg({ incrementalIntervalMin: interval }), [fullDone, run("INCREMENTAL", "OK", last)], MONDAY_NOON);
  assert(same(due(360), ["INCREMENTAL"]) && same(due(361), []), "tamper: interval +1 min flips the decision");
  const winDue = (hour: number, now: Date) => dueRuns(cfg({ fullHourUtc: hour }), [run("INCREMENTAL", "OK", at(SUNDAY_0300, -HOUR))], now);
  assert(same(winDue(3, SUNDAY_0300), ["FULL"]) && same(winDue(4, SUNDAY_0300), []), "tamper: window hour +1 flips the decision at 03:00");
  assert(same(winDue(2, at(SUNDAY_0300, -1)), ["FULL"]) && same(winDue(3, at(SUNDAY_0300, -1)), []), "tamper: window hour −1 flips the decision at 02:59:59.999");
  const wdDue = (wd: number) => dueRuns(cfg({ fullWeekday: wd }), [run("INCREMENTAL", "OK", at(SUNDAY_0300, -HOUR))], at(SUNDAY_0300, 5 * MIN));
  assert(same(wdDue(0), ["FULL"]) && same(wdDue(1), []) && same(wdDue(6), []), "tamper: weekday ±1 flips the decision");
  const blk = (ms: number) => dueRuns(cfg({ blockedUntil: at(MONDAY_NOON, ms) }), [fullDone], MONDAY_NOON);
  assert(same(blk(0), ["INCREMENTAL"]) && same(blk(1), []), "tamper: blocked-until +1 ms flips the decision");
  const newest = new Date("2026-10-15T00:00:00Z");
  assert(incrementalWatermark(newest)! + SYNC_WATERMARK_MARGIN_SECONDS === newest.getTime() / 1000 && incrementalWatermark(new Date(newest.getTime() + 1000))! === incrementalWatermark(newest)! + 1, "tamper: watermark moves 1 s per second of newest release and keeps the 7-day margin");
  assert(incrementalWatermark(newest) === 1_791_417_600, "watermark for 2026-10-15T00:00Z pinned (2026-10-08T00:00Z = 1791417600)");
  const stale = (ms: number) => isStaleRun({ heartbeatAt: at(MONDAY_NOON, -ms), startedAt: null, queuedAt: MONDAY_NOON }, MONDAY_NOON);
  assert(stale(10 * MIN) && !stale(10 * MIN - 1), "tamper: stale threshold ±1 ms flips");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ sync tests passed");
