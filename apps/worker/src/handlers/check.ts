// CHECK run (openspec change admin-sync-worker, data-sync-worker "API Check"):
// exactly ONE request to the players endpoint (one record, newest first) with
// the dump script's request identity, no retry. Records whether the source
// answered, the HTTP status, whether the answer was a bot challenge, the
// response time, the newest card's release time and how it compares with the
// newest card in the database. A 403 / 429 / HTML answer ends the run BLOCKED
// (the runner sets SyncConfig.blockedUntil = now + 6 h). Reads the database
// (one aggregate) and never writes catalogue data.

import type { SyncCheckResult } from "@eflab/shared";
import { assertLoopbackUrl, efootbaseHeaders } from "../efootbase.js";
import type { RunHandler } from "../runner.js";

/** The single request of a check. */
export function checkUrl(apiBase: string): string {
  return `${apiBase}/players?limit=1&sort=time_added&order=desc`;
}

/** Bounded body read (a challenge page can be large; the JSON answer is tiny). */
const BODY_MAX_BYTES = 1024 * 1024;

async function readBody(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.byteLength;
    if (n >= BODY_MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

export const runCheck: RunHandler = async (ctx) => {
  const { env } = ctx;
  // Defence in depth: env.ts already refused a non-loopback base in test mode.
  if (env.testMode) assertLoopbackUrl(env.apiBase, "EFBASE_API_BASE");
  const key = env.efbaseApiKey;
  if (!key) return { status: "FAILED", error: "EFBASE_API_KEY is not set in the worker's environment — no request was made" };

  const agg = await ctx.db.player.aggregate({ _max: { releaseDate: true } });
  const dbNewest = agg._max.releaseDate;
  const check: SyncCheckResult = {
    answered: false,
    httpStatus: null,
    challenge: false,
    responseMs: null,
    newestReleaseAt: null,
    dbNewestReleaseAt: dbNewest ? dbNewest.toISOString() : null,
    newerThanDb: null,
  };
  ctx.stats.check = check;
  ctx.stats.requests = 1;
  ctx.log(`GET ${env.apiBase}/players (limit=1, newest first)`);

  const t0 = performance.now();
  let res: Response;
  try {
    // redirect "manual": a redirect is not followed (the key header would go with it).
    res = await fetch(checkUrl(env.apiBase), { headers: efootbaseHeaders(key), signal: ctx.signal, redirect: "manual" });
  } catch (e) {
    if (ctx.signal.aborted) throw e; // cancel / time limit: the runner decides the status
    check.responseMs = Math.round(performance.now() - t0);
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const why = cause?.code ?? cause?.message ?? (e as Error).message;
    return { status: "FAILED", error: `the source did not answer (${why})` };
  }
  check.answered = true;
  check.httpStatus = res.status;
  let body: string;
  try {
    body = await readBody(res);
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    body = "";
  }
  check.responseMs = Math.round(performance.now() - t0);
  const contentType = res.headers.get("content-type") ?? "";
  const html = body.trimStart().startsWith("<") || /text\/html/i.test(contentType);
  ctx.log(`HTTP ${res.status} in ${check.responseMs} ms${html ? " (HTML)" : ""}`);

  // The dump script's rule: 403 / 429 or an HTML body = blocked, never retried.
  if (res.status === 403 || res.status === 429 || html) {
    check.challenge = true;
    const what = res.status === 403 || res.status === 429 ? `HTTP ${res.status}` : "an HTML challenge page";
    return { status: "BLOCKED", reason: `the source answered ${what}` };
  }
  if (res.status !== 200) return { status: "FAILED", error: `the source answered HTTP ${res.status}` };

  let first: unknown;
  try {
    const data = JSON.parse(body) as { data?: unknown };
    first = Array.isArray(data.data) ? data.data[0] : undefined;
  } catch {
    return { status: "FAILED", error: "the source answered 200 with a body that is not JSON" };
  }
  ctx.stats.pages = 1;
  const t = (first as { time_added?: unknown } | undefined)?.time_added;
  if (first === undefined) return { status: "FAILED", error: "the source answered an empty player list" };
  if (typeof t !== "number" || !Number.isInteger(t) || t <= 0) {
    return { status: "FAILED", error: "the newest card in the answer has no integer time_added" };
  }
  const newest = new Date(t * 1000);
  check.newestReleaseAt = newest.toISOString();
  check.newerThanDb = dbNewest ? newest.getTime() > dbNewest.getTime() : null;
  ctx.log(
    `newest card at the source ${check.newestReleaseAt}; newest in the database ${check.dbNewestReleaseAt ?? "none"}` +
      (check.newerThanDb === null ? "" : check.newerThanDb ? " → the source has newer cards" : " → nothing newer at the source"),
  );
  return { status: "OK" };
};
