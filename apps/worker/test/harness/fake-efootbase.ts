// Fake efootbase source for the worker tests (openspec change admin-sync-worker,
// design decision 11, task 5.6; reusable by later batches). A Node `http`
// server bound to 127.0.0.1 on an ephemeral port — it never listens on a fixed
// port and nothing in the tests talks to the real source.
//
//   /api/players?page&limit[&sort=time_added&order=desc]   pages of generated rows
//   /api/meta      players_meta.json-shaped labels built from our own constants
//   /api/teams     { data: [...] }          /api/packs   { data: { specialPlayerList, packs } }
//   /cdn/<path>    image bytes (GET / HEAD, plain-md5 ETag; deterministic per path)
//
// Modes (API routes): "ok"; "403" / "429" (plain refusal); "html-challenge"
// (200 text/html bot page); "slow" (waits `slowMs`, then answers like "ok").
// `blockFromApiRequest: n` answers 403 from the n-th API request on (a block in
// the middle of a sync); `setBlockAfter(n)` does the same counted from now. Every request is recorded (method, path, query,
// headers) so tests can count them and check the request identity. API requests
// without the expected key header get 401.
//
// All data is synthetic (ids from 990000000000, "Test Player N"); no efootbase
// content is used.

import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { CARD_TYPE_BY_EFOOTBASE_CODE, CARD_TYPE_LABELS, POSITIONS } from "@eflab/shared";
import { CONDITION_LETTERS, META_LABEL_OVERRIDES } from "@eflab/db/efootbase-map";
import { EFOOTBASE_KEY_HEADER } from "../../src/efootbase.js";

export type FakeMode = "ok" | "403" | "429" | "html-challenge" | "slow";

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
}

export type FakeRow = Record<string, unknown> & { id: number; name: string; time_added: number };

export interface FakeSourceOptions {
  /** Expected value of the key header (synthetic). */
  key: string;
  rows?: FakeRow[];
  mode?: FakeMode;
  slowMs?: number;
  blockFromApiRequest?: number;
  meta?: Record<string, unknown>;
  teams?: Array<Record<string, unknown>>;
  packs?: Record<string, unknown>;
}

export interface FakeSource {
  /** http://127.0.0.1:<port>/api — use as EFBASE_API_BASE. */
  apiBase: string;
  /** http://127.0.0.1:<port>/cdn — generated rows point their image URLs here. */
  cdnBase: string;
  requests: FakeRequest[];
  apiRequests(): FakeRequest[];
  setMode(mode: FakeMode): void;
  setRows(rows: FakeRow[]): void;
  /** The next `n` API requests are answered normally, every later one gets 403 (a block in the middle of a run); null = off. */
  setBlockAfter(n: number | null): void;
  /** "403": every /cdn request (GET / HEAD) is refused — a block of the image CDN. */
  setCdnMode(mode: "ok" | "403"): void;
  /** true: GET / HEAD of this CDN path answer 500 (a persistent image error); false: normal again. */
  setBrokenImage(path: string, broken: boolean): void;
  /** Replace what /api/teams answers on page 1. */
  setTeams(teams: Array<Record<string, unknown>>): void;
  /** Replace the bytes served for one CDN path (e.g. "cards/1_dynamic.webp") — a changed image. */
  setImage(path: string, bytes: Buffer): void;
  imageBytes(path: string): Buffer;
  close(): Promise<void>;
}

/** players_meta.json shape that `buildCardTypeMap` accepts (labels from our own constants). */
export function fakePlayersMeta(): Record<string, unknown> {
  const codes = Object.keys(CARD_TYPE_BY_EFOOTBASE_CODE).map(Number);
  const values: string[] = Array.from({ length: Math.max(...codes) + 1 }, () => "");
  for (const code of codes) {
    const type = CARD_TYPE_BY_EFOOTBASE_CODE[code]!;
    values[code] = code in META_LABEL_OVERRIDES ? META_LABEL_OVERRIDES[code]! : CARD_TYPE_LABELS[type];
  }
  return {
    id: { type: "integer" },
    name: { type: "string" },
    card_type: { type: "integer", default_order: "asc", values },
    pos: { type: "integer", values: [...POSITIONS] },
    condition: { type: "integer", default_order: "desc", values: [...CONDITION_LETTERS] },
  };
}

export const FAKE_ID_BASE = 990_000_000_000;

/**
 * Synthetic image bytes with a real WEBP signature (`RIFF....WEBP`): the dump
 * script stores only bodies with an image signature (third verify S1), so every
 * fake image carries one; `text` makes the bytes distinct.
 */
export function fakeImage(text: string): Buffer {
  const payload = Buffer.from(`VP8 ${text}`);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(payload.length + 4, 4);
  head.write("WEBP", 8, "ascii");
  return Buffer.concat([head, payload]);
}

/**
 * `n` synthetic cards, newest first: card i has id FAKE_ID_BASE + startIndex + i
 * and time_added = newest − i × step. `extra(i)` adds or overrides fields.
 */
export function generateRows(
  n: number,
  opts: { cdnBase: string; newestTimeAdded: number; stepSeconds?: number; startIndex?: number; extra?: (i: number) => Record<string, unknown> },
): FakeRow[] {
  const step = opts.stepSeconds ?? 3600;
  const start = opts.startIndex ?? 0;
  const out: FakeRow[] = [];
  for (let i = 0; i < n; i++) {
    const k = start + i;
    const id = FAKE_ID_BASE + k;
    out.push({
      id,
      base_id: FAKE_ID_BASE + 500_000 + k,
      name: `Test Player ${k}`,
      name_normalized: `test player ${k}`,
      nationality: "Testland",
      team_name: "Test FC",
      league: 1,
      pos: 12,
      card_type: 0,
      overall_rating: 70,
      overall_at_max_level: 70,
      max_level: 1,
      time_added: opts.newestTimeAdded - i * step,
      card_images: {
        transparent: `${opts.cdnBase}/cards/${id}_transparent.webp`,
        dynamic: `${opts.cdnBase}/cards/${id}_dynamic.webp`,
      },
      emblem_images: {
        nationality: `${opts.cdnBase}/emblems/nationality/${createHash("md5").update("Testland").digest("hex")}.png`,
        league: null,
        team: null,
      },
      ...(opts.extra ? opts.extra(i) : {}),
    });
  }
  return out;
}

function send(res: ServerResponse, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body), ...extra });
  res.end(body);
}

const CHALLENGE_PAGE = "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>fake bot challenge</body></html>";

/**
 * A second loopback host that must NEVER be contacted (hostile source data
 * points image URLs at it — verify finding C1). Records every request.
 */
export async function startForeignHost(): Promise<{ origin: string; requests: string[]; close(): Promise<void> }> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    send(res, 200, "FOREIGN", "image/webp");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

/**
 * A loopback stand-in for the third-party image host (pesdb.net in production,
 * EFBASE_TEST_THIRD_PARTY_BASE in test mode): serves `transparent` renders, or
 * refuses everything with 403 (third verify W1: it must never block the source).
 */
export async function startThirdPartyHost(): Promise<{ origin: string; requests: string[]; setMode(m: "ok" | "403"): void; bytes(path: string): Buffer; close(): Promise<void> }> {
  const requests: string[] = [];
  let mode: "ok" | "403" = "ok";
  const bytes = (p: string) => fakeImage(`third-party:${p}`);
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (mode === "403") return send(res, 403, "Forbidden", "text/plain");
    const p = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const b = bytes(p);
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": b.byteLength, ETag: `"${createHash("md5").update(b).digest("hex")}"` });
      return res.end();
    }
    send(res, 200, b, "image/png", { ETag: `"${createHash("md5").update(b).digest("hex")}"` });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    requests,
    setMode: (m) => (mode = m),
    bytes,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

export async function startFakeSource(opts: FakeSourceOptions): Promise<FakeSource> {
  let mode: FakeMode = opts.mode ?? "ok";
  let rows: FakeRow[] = opts.rows ?? [];
  const slowMs = opts.slowMs ?? 5_000;
  const requests: FakeRequest[] = [];
  const images = new Map<string, Buffer>();
  let apiCount = 0;
  let blockFrom: number | null = opts.blockFromApiRequest ?? null;
  let cdnMode: "ok" | "403" = "ok";
  let teams: Array<Record<string, unknown>> = opts.teams ?? [];
  const imageBytes = (path: string) => images.get(path) ?? fakeImage(`fake-image:${path}`);
  /** Paths answered 500 (a persistent image error at the source). */
  const brokenImages = new Set<string>();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push({ method: req.method ?? "GET", path: url.pathname, query: url.searchParams, headers: req.headers });

    if (url.pathname.startsWith("/cdn/")) {
      if (cdnMode === "403") return send(res, 403, "Forbidden", "text/plain");
      const path = url.pathname.slice("/cdn/".length);
      if (brokenImages.has(path)) return send(res, 500, "Internal Server Error", "text/plain");
      const bytes = imageBytes(path);
      const etag = `"${createHash("md5").update(bytes).digest("hex")}"`;
      const type = path.endsWith(".png") ? "image/png" : "image/webp";
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Type": type, "Content-Length": bytes.byteLength, ETag: etag });
        res.end();
      } else send(res, 200, bytes, type, { ETag: etag });
      return;
    }
    if (!url.pathname.startsWith("/api/")) return send(res, 404, "not found", "text/plain");

    apiCount++;
    const answer = () => {
      if (blockFrom !== null && apiCount >= blockFrom) return send(res, 403, "Forbidden", "text/plain");
      if (mode === "403") return send(res, 403, "Forbidden", "text/plain");
      if (mode === "429") return send(res, 429, "Too Many Requests", "text/plain");
      if (mode === "html-challenge") return send(res, 200, CHALLENGE_PAGE, "text/html; charset=UTF-8");
      if (req.headers[EFOOTBASE_KEY_HEADER.toLowerCase()] !== opts.key) return send(res, 401, JSON.stringify({ error: "bad key" }), "application/json");

      const route = url.pathname.slice("/api".length);
      if (route === "/players") {
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "24") || 24));
        const newestFirst = url.searchParams.get("sort") === "time_added" && url.searchParams.get("order") === "desc";
        const sorted = [...rows].sort(newestFirst ? (a, b) => b.time_added - a.time_added || b.id - a.id : (a, b) => a.id - b.id);
        const data = sorted.slice((page - 1) * limit, page * limit);
        // total_count / total_pages are a lookahead in the real API; here: one page further.
        return send(res, 200, JSON.stringify({ data, page, limit, total_count: page * limit + limit, total_pages: page + 1 }), "application/json");
      }
      if (route === "/meta") return send(res, 200, JSON.stringify(opts.meta ?? fakePlayersMeta()), "application/json");
      if (route === "/teams") {
        const page = Number(url.searchParams.get("page") ?? "1");
        return send(res, 200, JSON.stringify({ data: page === 1 ? teams : [] }), "application/json");
      }
      if (route === "/packs") return send(res, 200, JSON.stringify(opts.packs ?? { data: { specialPlayerList: [], packs: [] } }), "application/json");
      return send(res, 404, JSON.stringify({ error: "not found" }), "application/json");
    };
    if (mode === "slow") {
      const t = setTimeout(answer, slowMs);
      res.on("close", () => clearTimeout(t));
    } else answer();
  });

  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;
  return {
    apiBase: `${origin}/api`,
    cdnBase: `${origin}/cdn`,
    requests,
    apiRequests: () => requests.filter((r) => r.path.startsWith("/api/")),
    setMode: (m) => (mode = m),
    setRows: (r) => (rows = r),
    setBlockAfter: (n) => (blockFrom = n === null ? null : apiCount + n + 1),
    setCdnMode: (m) => (cdnMode = m),
    setTeams: (t) => (teams = t),
    setBrokenImage: (p, broken) => (broken ? brokenImages.add(p) : brokenImages.delete(p)),
    setImage: (p, b) => images.set(p, b),
    imageBytes,
    close: () =>
      new Promise<void>((res) => {
        server.closeAllConnections();
        server.close(() => res());
      }),
  };
}
