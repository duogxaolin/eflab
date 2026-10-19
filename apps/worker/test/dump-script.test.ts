// scripts/efootbase_dump.py against HOSTILE source data (openspec change
// admin-sync-worker, verify finding C1). No database. Same assert-style runner
// as the other worker tests.
//
// Two local HTTP servers on 127.0.0.1 (ephemeral ports): the "source" (its /cdn
// serves image bytes, some paths redirect) and a "foreign" host that must never
// receive a request. The script runs with an explicit minimal environment and a
// synthetic key, its output directory deep inside a sandbox, so a write outside
// that directory is visible. Checks:
//   · emblem kinds outside nationality / league / team (e.g. "../../../ESCAPE"),
//     file names "..", "%2e%2e", a string card id → refused, nothing written outside;
//   · image URLs on another host / port, file://, user-info, a redirect to
//     another host → refused / not followed, the foreign host gets 0 requests;
//   · an API redirect to another host is not followed (the key header would go with it);
//   · loopback URLs are accepted only with --allow-host AND SYNC_TEST_MODE=1;
//   · the allow-list itself (efootbase CDN for every image, pesdb.net for card
//     renders, https only, port 443, no user-info) — evaluated offline, no request.
//
// Run: pnpm --filter @eflab/worker test

import { spawn } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { DUMP_SCRIPT } from "../src/env.js";
import { fakeImage } from "./harness/fake-efootbase.js";
import { EFOOTBASE_CDN_BASE, PESDB_IMAGE_BASE } from "../src/efootbase.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

interface Recorded { method: string; path: string; headers: Record<string, unknown> }
interface Srv { origin: string; port: number; requests: Recorded[]; server: Server }

async function startServer(handler: (path: string, res: import("node:http").ServerResponse, origin: string) => void): Promise<Srv> {
  const requests: Recorded[] = [];
  let origin = "";
  const server = createServer((req, res) => {
    requests.push({ method: req.method ?? "GET", path: req.url ?? "/", headers: { ...req.headers } });
    handler(req.url ?? "/", res, origin);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  return { origin, port, requests, server };
}
const close = (s: Srv) => new Promise<void>((r) => { s.server.closeAllConnections(); s.server.close(() => r()); });

const KEY = "synthetic-dump-key-4d1e9a"; // never a real key
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const foreign = await startServer((_p, res) => { res.writeHead(200, { "Content-Type": "image/webp" }); res.end("FOREIGN-BYTES"); });
const source = await startServer((path, res) => {
  if (path.startsWith("/cdn/redirect/")) {
    res.writeHead(302, { Location: `${foreign.origin}/stolen${path}` });
    return res.end();
  }
  if (path.startsWith("/redir-api/")) {
    res.writeHead(302, { Location: `${foreign.origin}/api${path.slice("/redir-api".length)}` });
    return res.end();
  }
  // second verify (W-b): bodies that must never be stored as images
  if (path.startsWith("/cdn/html/")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
    return res.end("<!DOCTYPE html><html><body>Just a moment... challenge</body></html>");
  }
  if (path.startsWith("/cdn/big/")) {
    res.writeHead(200, { "Content-Type": "image/webp", "Content-Length": String(30 * 1024 * 1024) });
    return res.end(Buffer.alloc(30 * 1024 * 1024, 65));
  }
  if (path.startsWith("/cdn/svg/")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  }
  if (path.startsWith("/cdn/text/")) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("not an image at all");
  }
  if (path.startsWith("/cdn/octet/")) {
    // a real image served as application/octet-stream: accepted by its magic bytes
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    return res.end(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-body")]));
  }
  if (path.startsWith("/cdn/redir-userinfo/")) {
    res.writeHead(302, { Location: `http://user:pw@127.0.0.1:${source.port}/cdn/ok-after-userinfo.webp` });
    return res.end();
  }
  if (path.startsWith("/bucketdiff/")) {
    // a bucket object whose ETag differs from every CDN body ("changed")
    res.writeHead(200, { "Content-Type": "image/webp", ETag: `"${"0".repeat(32)}"` });
    return res.end();
  }
  if (path.startsWith("/bigapi/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(`{"pad":"${"x".repeat(40 * 1024 * 1024)}"}`);
  }
  // third verify: BOM + challenge pages, a JSON body claiming image/png, an efootbase CDN refusal
  if (path.startsWith("/bomapi/")) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end("﻿\n  <!DOCTYPE html><html><body>Just a moment...</body></html>");
  }
  if (path.startsWith("/cdn/bomhtml/")) {
    res.writeHead(200, { "Content-Type": "image/webp" });
    return res.end("﻿<!DOCTYPE html><html><body>challenge</body></html>");
  }
  if (path.startsWith("/cdn/bomsvg/")) {
    res.writeHead(200, { "Content-Type": "image/webp" });
    return res.end('﻿<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  }
  if (path.startsWith("/cdn/jsonpng/")) {
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end('{"not":"an image"}');
  }
  if (path.startsWith("/cdn/403/")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }
  // W2: bodies by card id (also with a weak ETag), and bucket objects with a matching / weak ETag
  if (path.startsWith("/cdn/byid/")) {
    const body = fakeImage(`id:${path.split("/").pop()}`);
    res.writeHead(200, { "Content-Type": "image/webp", ETag: path.includes("weak") ? 'W/"weak-etag"' : `"${md5(body)}"` });
    return res.end(body);
  }
  if (path.startsWith("/bucketsame/")) {
    // the bucket object = exactly the CDN body of /cdn/byid/weak-<id>.webp
    const id = /cards\/(\d+)_/.exec(path)?.[1];
    res.writeHead(200, { "Content-Type": "image/webp", ETag: `"${md5(fakeImage(`id:weak-${id}.webp`))}"` });
    return res.end();
  }
  if (path.startsWith("/bucketweak/")) {
    res.writeHead(200, { "Content-Type": "image/webp", ETag: '"0123abcd-2"' }); // a multipart ETag: not a content MD5
    return res.end();
  }
  if (path.startsWith("/cdn/")) {
    res.writeHead(200, { "Content-Type": "image/webp" });
    return res.end(fakeImage(`IMG:${path}`));
  }
  res.writeHead(404);
  res.end();
});
const cdn = `${source.origin}/cdn`;
// a third-party image host (pesdb.net in production; --allow-third-party-host in tests)
const thirdParty = await startServer((path, res) => {
  if (path.startsWith("/tp/403/")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }
  if (path.startsWith("/tp/html/")) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end("<!DOCTYPE html><html><body>Just a moment...</body></html>");
  }
  res.writeHead(200, { "Content-Type": "image/png" });
  return res.end(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`tp:${path}`)]));
});

interface PyResult { code: number | null; out: string }
function runPy(args: string[], env: Record<string, string>): Promise<PyResult> {
  return new Promise((res) => {
    const c = spawn("python3", ["-I", DUMP_SCRIPT, ...args], {
      shell: false,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PYTHONIOENCODING: "utf-8", ...env },
    });
    let out = "";
    c.stdout.on("data", (b: Buffer) => (out += b.toString("utf8")));
    c.stderr.on("data", (b: Buffer) => (out += b.toString("utf8")));
    c.on("error", (e) => res({ code: null, out: e.message }));
    c.on("close", (code) => res({ code, out }));
  });
}
const filesUnder = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (lstatSync(p).isDirectory()) walk(p); // lstat: never walk through a symlink
      else out.push(p);
    }
  };
  walk(dir);
  return out.sort();
};

const sandbox = mkdtempSync(join(tmpdir(), "eflab-synctest-dump-"));
try {
  // ---- hostile players.jsonl + teams.json, images only (--no-data) ----
  const out = join(sandbox, "a", "b", "c", "out");
  mkdirSync(out, { recursive: true });
  const emb = (kind: string, name: string) => `${cdn}/emblems/${kind}/${name}`;
  const players = [
    // 1: legitimate (fake CDN) — downloaded
    { id: 1, name: "ok", card_images: { transparent: `${cdn}/cards/1_t.webp`, dynamic: `${cdn}/cards/1_d.webp` }, emblem_images: { nationality: emb("nationality", "aaa111.png"), league: null, team: emb("team", "bbb222.png") } },
    // 2: another loopback port, a file:// URL
    { id: 2, name: "foreign", card_images: { transparent: "file:///etc/hosts", dynamic: `${foreign.origin}/cdn/cards/2_d.webp` }, emblem_images: { nationality: `${foreign.origin}/emblems/n.png` } },
    // 3: a string id that would become the card file name
    { id: "../../../ESCAPE-ID", name: "string id", card_images: { dynamic: `${cdn}/cards/3_d.webp` } },
    // 4: emblem file names "..", "%2e%2e", "." and a name with a backslash
    { id: 4, name: "dots", emblem_images: { nationality: `${cdn}/emblems/x/..`, league: `${cdn}/emblems/x/%2e%2e`, team: `${cdn}/emblems/x/a\\..\\b.png` } },
    // 5: a CDN path that redirects to the foreign host
    { id: 5, name: "redirect", card_images: { dynamic: `${cdn}/redirect/5_d.webp` } },
    // 6: user-info in the URL, a bool id
    { id: 6, name: "userinfo", card_images: { dynamic: `http://user:pw@127.0.0.1:${source.port}/cdn/cards/6_d.webp` } },
    { id: true, name: "bool id", card_images: { dynamic: `${cdn}/cards/7_d.webp` } },
  ];
  writeFileSync(join(out, "players.jsonl"), players.map((p) => JSON.stringify(p)).join("\n") + "\n");
  writeFileSync(
    join(out, "teams.json"),
    JSON.stringify({ data: [{ id: 1, emblem_images: { "../../../ESCAPE": `${cdn}/emblems/t1.png`, "../../../../ESCAPE2": `${cdn}/emblems/t2.png`, team: emb("team", "ccc333.png"), nationality: `${foreign.origin}/x.png` } }] }),
  );
  const testEnv = { EFBASE_API_KEY: KEY, SYNC_TEST_MODE: "1" };
  const r1 = await runPy(["--key-from-env", "--no-data", "--out", out, "--allow-host", `127.0.0.1:${source.port}`, "--dumped-at", "T"], testEnv);
  const all = filesUnder(sandbox).map((f) => relative(sandbox, f));
  const outside = all.filter((f) => !f.startsWith(["a", "b", "c", "out", ""].join(sep)));
  const imgs = all.filter((f) => f.includes(`${sep}images${sep}`)).map((f) => f.split(`${sep}images${sep}`)[1]!).sort();
  assert(r1.code === 0, `hostile images run: the script finishes (exit ${r1.code}) ${r1.code === 0 ? "" : r1.out.split("\n").slice(-4).join(" | ")}`);
  assert(outside.length === 0 && !all.some((f) => f.includes("ESCAPE")), `nothing written outside the output directory, no ESCAPE file (outside: ${outside.join(", ") || "none"})`);
  assert(
    JSON.stringify(imgs) === JSON.stringify(["cards/1_dynamic.webp", "cards/1_transparent.webp", "emblems/nationality/aaa111.png", "emblems/team/bbb222.png", "emblems/team/ccc333.png"].map((p) => p.split("/").join(sep))),
    `only the legitimate images were written (${imgs.join(", ")})`,
  );
  assert(foreign.requests.length === 0, `the foreign host received no request (${foreign.requests.map((r) => r.path).join(", ") || "none"})`);
  const srcPaths = source.requests.map((r) => r.path);
  assert(!srcPaths.some((p) => p.includes("..") || p.includes("%2e") || p.includes("ESCAPE") || p.includes("6_d") || p.includes("7_d") || p.includes("3_d")), `no request for a refused entry reached the source (${srcPaths.join(", ")})`);
  const man = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as { imageStats?: Record<string, number>; imageUrlsRefused?: number };
  assert((man.imageStats?.refused ?? 0) >= 10 && man.imageUrlsRefused === man.imageStats?.refused, `refused entries are counted (refused ${man.imageStats?.refused}, manifest ${man.imageUrlsRefused})`);
  assert((man.imageStats?.error ?? 0) === 1, `the redirect to another host was not followed and counted as an error (error ${man.imageStats?.error})`);
  const errLog = readFileSync(join(out, "image_errors.log"), "utf8");
  assert(/refused/.test(errLog) && /redirect/.test(errLog), "image_errors.log names the refused entries and the refused redirect");
  assert(!r1.out.includes(KEY), "the key is never printed");

  // ---- the same loopback URLs WITHOUT --allow-host: every one refused, no request ----
  const out2 = join(sandbox, "out2");
  mkdirSync(out2);
  writeFileSync(join(out2, "players.jsonl"), JSON.stringify(players[0]) + "\n");
  const n2 = source.requests.length;
  const r2 = await runPy(["--key-from-env", "--no-data", "--out", out2], testEnv);
  const man2 = JSON.parse(readFileSync(join(out2, "manifest.json"), "utf8")) as { imageStats?: Record<string, number> };
  assert(r2.code === 0 && source.requests.length === n2 && man2.imageStats?.refused === 4 && man2.imageStats?.ok === 0, `without --allow-host a loopback CDN is not on the allow-list: 4 refused, no request (exit ${r2.code}, ${source.requests.length - n2} requests)`);

  // ---- --allow-host is for tests only, loopback only ----
  const r3 = await runPy(["--key-from-env", "--no-data", "--out", out2, "--allow-host", `127.0.0.1:${source.port}`], { EFBASE_API_KEY: KEY });
  assert(r3.code === 1 && /SYNC_TEST_MODE=1/.test(r3.out), `--allow-host without SYNC_TEST_MODE=1 → refused (exit ${r3.code})`);
  const r4 = await runPy(["--key-from-env", "--no-data", "--out", out2, "--allow-host", "10.1.2.3:80"], testEnv);
  assert(r4.code === 1 && /loopback/.test(r4.out), `--allow-host with a non-loopback host → refused (exit ${r4.code})`);
  const r4b = await runPy(["--key-from-env", "--no-data", "--out", out2, "--allow-host", "127.0.0.1"], testEnv);
  assert(r4b.code === 1 && /host:port/.test(r4b.out), `--allow-host without a port → refused (exit ${r4b.code})`);

  // ---- an API redirect to another host is not followed (the key header would go with it) ----
  const out3 = join(sandbox, "out3");
  const r5 = await runPy(["--key-from-env", "--api-base", `${source.origin}/redir-api`, "--data-parts", "meta", "--no-images", "--out", out3], testEnv);
  assert(r5.code !== 0 && foreign.requests.length === 0, `API redirect to another host: not followed, the run fails, the foreign host got no request (exit ${r5.code}, foreign ${foreign.requests.length})`);
  assert(source.requests.filter((r) => r.path.startsWith("/redir-api/")).every((r) => r.headers["x-api-key"] === KEY), "the API request itself carried the key (to the configured base only)");

  // ---- second verify: bodies, shapes, symlinks, --validate-only (W-a, W-b, suggestions) ----
  const runImages = async (name: string, rows: unknown[], extra: string[] = [], prep?: (out: string) => void) => {
    const out = join(sandbox, name);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "players.jsonl"), rows.map((p) => JSON.stringify(p)).join("\n") + "\n");
    prep?.(out);
    const r = await runPy(["--key-from-env", "--no-data", "--out", out, "--allow-host", `127.0.0.1:${source.port}`, ...extra], testEnv);
    let man: { imageStats?: Record<string, number>; imageUrlsRefused?: number } = {};
    try {
      man = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    } catch {
      /* no manifest (blocked run) */
    }
    const files = (() => {
      try {
        return filesUnder(join(out, "images")).map((f) => relative(join(out, "images"), f));
      } catch {
        return [] as string[];
      }
    })();
    return { ...r, dir: out, man, files }; // r.out = the script's output
  };
  const card = (id: number, dynamic: string, transparent?: string) => ({ id, name: `c${id}`, card_images: { dynamic, ...(transparent ? { transparent } : {}) } });
  {
    const big = await runImages("w-b-big", [card(11, `${cdn}/big/11.webp`)]);
    assert(big.code === 0 && big.files.length === 0 && (big.man.imageStats?.error ?? 0) === 1 && (big.man.imageStats?.ok ?? 0) === 0, `W-b: a 30 MB body is refused (not stored, counted as an error; files: ${big.files.join(", ") || "none"}, exit ${big.code})`);
    const html = await runImages("w-b-html", [card(12, `${cdn}/html/12.webp`)]);
    assert(html.code === 2 && html.files.length === 0 && /CDN returned|challenge/i.test(html.out), `W-b: an HTML challenge body is never stored and stops the run as blocked (exit ${html.code}, files ${html.files.join(", ") || "none"}${/CDN returned|challenge/i.test(html.out) ? "" : `: ${JSON.stringify(html.out.slice(-600))}`})`);
    const svg = await runImages("w-b-svg", [card(13, `${cdn}/svg/13.webp`), card(14, `${cdn}/text/14.webp`)]);
    assert(svg.code === 0 && svg.files.length === 0 && (svg.man.imageStats?.error ?? 0) === 2, `W-b: an SVG and a text/plain body are refused (errors ${svg.man.imageStats?.error}, files: ${svg.files.join(", ") || "none"})`);
    const octet = await runImages("w-b-octet", [card(15, `${cdn}/octet/15.webp`)]);
    assert(octet.code === 0 && octet.files.join() === "cards/15_dynamic.webp", `W-b: a PNG served as application/octet-stream is accepted by its magic bytes (${octet.files.join(", ") || "none"})`);
    // --etag-vs-bucket against a bucket whose ETag differs: the refused body is not "overwritten"
    const bucketish = await runImages("w-b-bucket", [card(16, `${cdn}/big/16.webp`)], ["--etag-vs-bucket", `${source.origin}/bucketdiff`]);
    assert((bucketish.man.imageStats?.overwritten ?? 0) === 0 && bucketish.files.length === 0, `W-b: a refused body never counts as overwritten (overwritten ${bucketish.man.imageStats?.overwritten})`);
    assert(!readdirSync(sandbox, { recursive: true }).some((f) => String(f).endsWith(".part")), "W-b: no .part file left behind");

    // W-e: pesdb.net only for `transparent` renders under /assets/img/
    const pesdbDyn = await runImages("w-e", [{ id: 17, name: "c17", card_images: { dynamic: `${PESDB_IMAGE_BASE}/assets/img/card/d17.png`, transparent: `${PESDB_IMAGE_BASE}/other/t17.png` } }]);
    assert(pesdbDyn.man.imageUrlsRefused === 2 && pesdbDyn.files.length === 0, `W-e: a pesdb dynamic URL and a pesdb transparent URL outside /assets/img/ are refused (refused ${pesdbDyn.man.imageUrlsRefused})`);

    // shapes that must not crash the script: refused and counted
    const shapes = await runImages("shapes", [
      { id: 21, name: "s", card_images: "x" },
      { id: 22, name: "s", card_images: ["https://evil.example/x"] },
      { id: 23, name: "s", emblem_images: "https://evil.example/x.png" },
      ["not", "an", "object"],
      { id: 0, name: "zero id", card_images: { dynamic: `${cdn}/cards/0.webp` } },
      { id: 24, name: "s", emblem_images: { team: `${cdn}/emblems/team/x.svg`, nationality: `${cdn}/emblems/nationality/ok24.png` } },
    ], [], (o) => writeFileSync(join(o, "teams.json"), JSON.stringify({ data: { not: "a list" } })));
    assert(shapes.code === 0 && (shapes.man.imageUrlsRefused ?? 0) >= 7 && shapes.files.join() === "emblems/nationality/ok24.png", `non-object card_images / emblem_images / rows / teams.json data, id 0, an .svg emblem: refused and counted, no crash (refused ${shapes.man.imageUrlsRefused}, exit ${shapes.code}, files ${shapes.files.join(", ")})`);

    // symlinks below the output directory are refused (a .part target and an emblem directory)
    const outside = join(sandbox, "outside-target");
    mkdirSync(outside, { recursive: true });
    const sym = await runImages("symlinks", [card(31, `${cdn}/cards/31.webp`), { id: 32, name: "e", emblem_images: { nationality: `${cdn}/emblems/nationality/sym32.png` } }], [], (o) => {
      mkdirSync(join(o, "images", "cards"), { recursive: true });
      mkdirSync(join(o, "images", "emblems"), { recursive: true });
      symlinkSync(join(outside, "stolen.part"), join(o, "images", "cards", "31_dynamic.webp.part"));
      symlinkSync(outside, join(o, "images", "emblems", "nationality"));
    });
    assert(readdirSync(outside).length === 0 && (sym.man.imageStats?.ok ?? 0) === 0, `symlinked .part target / emblem directory: nothing written through the link (outside: ${readdirSync(outside).join(", ") || "empty"}, ok ${sym.man.imageStats?.ok})`);

    // a same-origin redirect that adds user-info is not followed
    const ui = await runImages("redir-userinfo", [card(33, `${cdn}/redir-userinfo/33.webp`)]);
    assert(ui.files.length === 0 && !source.requests.some((r) => r.path.includes("ok-after-userinfo")), "a redirect to a URL with user-info is not followed");

    // --validate-only: every check, no request, no file
    const vbad = join(sandbox, "validate-bad");
    mkdirSync(vbad);
    writeFileSync(join(vbad, "players.jsonl"), [card(41, `https://cdn.assets.efootbase。com/x.webp`), { id: 42, name: "s", card_images: "x" }].map((p) => JSON.stringify(p)).join("\n") + "\n");
    const n0 = source.requests.length + foreign.requests.length;
    const vb = await runPy(["--key-from-env", "--out", vbad, "--validate-only"], { EFBASE_API_KEY: KEY });
    assert(vb.code === 1 && /REFUSED/.test(vb.out) && readdirSync(vbad).join() === "players.jsonl" && source.requests.length + foreign.requests.length === n0, `--validate-only on hostile data: exit 1 naming the refusals, no file written, no request (exit ${vb.code}, files ${readdirSync(vbad).join(", ")})`);
    const vgood = join(sandbox, "validate-good");
    mkdirSync(vgood);
    writeFileSync(join(vgood, "players.jsonl"), JSON.stringify(card(43, `${EFOOTBASE_CDN_BASE}/cards/43_dynamic.webp`, `${PESDB_IMAGE_BASE}/assets/img/card/t43.png`)) + "\n");
    const vg = await runPy(["--key-from-env", "--out", vgood, "--validate-only"], { EFBASE_API_KEY: KEY });
    assert(vg.code === 0 && readdirSync(vgood).join() === "players.jsonl", `--validate-only on legitimate data: exit 0, nothing written (exit ${vg.code}: ${vg.out.trim().split("\n").pop()})`);

    // an oversized API body is refused (bounded read)
    const bigApi = await runPy(["--key-from-env", "--api-base", `${source.origin}/bigapi`, "--data-parts", "meta", "--no-images", "--out", join(sandbox, "bigapi")], testEnv);
    assert(bigApi.code !== 0 && /too large|larger than/i.test(bigApi.out), `an API body over the bound is refused (exit ${bigApi.code})`);
  }

  // ---- third verify ----
  {
    const tp = ["--allow-third-party-host", `127.0.0.1:${thirdParty.port}`];
    const lines = (f: string) => {
      try {
        return readFileSync(f, "utf8").split("\n").filter(Boolean).sort();
      } catch {
        return [] as string[];
      }
    };
    // W1: a third-party host's refusal skips only that host; the run goes on (exit 0) and lists the images
    const tpRuns: Array<[string, string]> = [["403", "W1: a third-party 403"], ["html", "W1: a third-party HTML challenge"]];
    for (const [m, label] of tpRuns) {
      const n0 = thirdParty.requests.length;
      const r = await runImages(`w1-${m}`, [
        { id: 51, name: "a", card_images: { transparent: `${thirdParty.origin}/tp/${m}/51.png`, dynamic: `${cdn}/cards/51_d.webp` } },
        { id: 52, name: "b", card_images: { transparent: `${thirdParty.origin}/tp/ok/52.png`, dynamic: `${cdn}/cards/52_d.webp` } },
      ], [...tp, "--workers", "1"]);
      const st = r.man.imageStats ?? {};
      assert(
        r.code === 0 && r.files.join() === "cards/51_dynamic.webp,cards/52_dynamic.webp" && st.hostBlocked === 1 && st.hostSkipped === 1 && thirdParty.requests.length - n0 === 1,
        `${label}: only that host is skipped for the rest of the run, efootbase images still stored, exit 0 (exit ${r.code}, files ${r.files.join(", ")}, hostBlocked ${st.hostBlocked}, hostSkipped ${st.hostSkipped}, ${thirdParty.requests.length - n0} third-party requests)`,
      );
      assert(JSON.stringify(lines(join(r.dir, "images_failed.txt"))) === JSON.stringify(["cards/51_transparent.webp", "cards/52_transparent.webp"]), `${label}: images_failed.txt lists the two skipped renders`);
    }
    const cdn403 = await runImages("w1-cdn403", [{ id: 53, name: "c", card_images: { dynamic: `${cdn}/403/53.webp` } }], tp);
    assert(cdn403.code === 2 && /CDN returned 403\/429/.test(cdn403.out), `W1: a 403 from efootbase's own CDN still blocks the run (exit ${cdn403.code})`);
    const oneBad = await runImages("w1-error", [card(54, `${cdn}/text/54.webp`), card(55, `${cdn}/cards/55.webp`)]);
    assert(oneBad.code === 0 && oneBad.files.join() === "cards/55_dynamic.webp" && JSON.stringify(lines(join(oneBad.dir, "images_failed.txt"))) === JSON.stringify(["cards/54_dynamic.webp"]), `W1: a failed image is listed in images_failed.txt for the worker (${lines(join(oneBad.dir, "images_failed.txt")).join(", ")})`);

    // W2: an image is "overwritten" only when its body differs from a bucket object with a content-MD5 ETag
    const w2 = await runImages("w2", [
      card(61, `${cdn}/byid/weak-61.webp`), // CDN ETag weak, body == bucket object → dropped
      card(62, `${cdn}/byid/62.webp`), // CDN ETag plain, bucket ETag multipart → unverified
    ], ["--etag-vs-bucket", `${source.origin}/bucketsame`]);
    const w2b = await runImages("w2b", [card(63, `${cdn}/byid/63.webp`)], ["--etag-vs-bucket", `${source.origin}/bucketweak`]);
    const s2 = w2.man.imageStats ?? {};
    const s2b = w2b.man.imageStats ?? {};
    assert(!w2.files.includes("cards/61_dynamic.webp") && lines(join(w2.dir, "images_overwritten.txt")).length === 1 && (s2.overwritten ?? 0) === 1,
      `W2: a weak CDN ETag whose body equals the bucket object is dropped (not stored, not overwritten); a body that differs is a verified overwrite (overwritten ${s2.overwritten}, files ${w2.files.join(", ")})`);
    assert(w2b.files.join() === "cards/63_dynamic.webp" && (s2b.overwritten ?? 0) === 0 && s2b.unverified === 1 && JSON.stringify(lines(join(w2b.dir, "images_unverified.txt"))) === JSON.stringify(["cards/63_dynamic.webp"]),
      `W2: a bucket object with a non-MD5 ETag makes the replacement "unverified", never "overwritten" (overwritten ${s2b.overwritten}, unverified ${s2b.unverified})`);

    // S1: a BOM in front of HTML / SVG, a JSON body typed image/png
    const bomHtml = await runImages("s1-bomhtml", [card(71, `${cdn}/bomhtml/71.webp`)]);
    assert(bomHtml.code === 2 && bomHtml.files.length === 0, `S1: BOM + HTML is a challenge (blocked), not stored (exit ${bomHtml.code}, files ${bomHtml.files.join(", ") || "none"})`);
    const bomSvg = await runImages("s1-other", [card(72, `${cdn}/bomsvg/72.webp`), card(73, `${cdn}/jsonpng/73.webp`)]);
    assert(bomSvg.code === 0 && bomSvg.files.length === 0 && (bomSvg.man.imageStats?.error ?? 0) === 2, `S1: BOM + SVG script and a JSON body typed image/png are refused — an image needs its signature (files ${bomSvg.files.join(", ") || "none"})`);

    // S2: an API challenge page behind a BOM / whitespace is a block (exit 2), not a parse failure
    const bomApi = await runPy(["--key-from-env", "--api-base", `${source.origin}/bomapi`, "--data-parts", "meta", "--no-images", "--out", join(sandbox, "bomapi")], testEnv);
    assert(bomApi.code === 2 && /BLOCKED/.test(bomApi.out), `S2: an API answer "\\ufeff  <!DOCTYPE html…" → BLOCKED, exit 2 (exit ${bomApi.code})`);
  }

  // ---- the allow-list, evaluated offline (no request) ----
  const probe = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("d", sys.argv[1]); d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
cases = json.loads(sys.argv[2])
print(json.dumps([d.image_url_allowed(u, k) for u, k in cases] + [d.safe_name("abc.png\\n"), d.safe_name("abc.png")]))
`;
  const cdnHost = new URL(EFOOTBASE_CDN_BASE).host;
  const pesdbHost = new URL(PESDB_IMAGE_BASE).host;
  const cases: Array<[string, "transparent" | "dynamic" | "emblems", boolean]> = [
    [`https://${cdnHost}/cards/1_dynamic.webp`, "dynamic", true],
    [`https://${cdnHost}/cards/1_transparent.webp`, "transparent", true],
    [`https://${cdnHost}/emblems/team/abc.png`, "emblems", true],
    [`https://${pesdbHost}/assets/img/card/t162114.png`, "transparent", true],
    [`https://${pesdbHost}/assets/img/card/t162114.png`, "dynamic", false],
    [`https://${pesdbHost}/other/t1.png`, "transparent", false],
    [`https://${pesdbHost}/assets/img/card/t1.png`, "emblems", false],
    [`http://${cdnHost}/cards/1_dynamic.webp`, "dynamic", false],
    [`https://${cdnHost}:8443/cards/1.webp`, "dynamic", false],
    [`https://${cdnHost}:443/cards/1.webp`, "dynamic", true],
    [`https://user@${cdnHost}/cards/1.webp`, "dynamic", false],
    [`https://${cdnHost}.evil.example/cards/1.webp`, "dynamic", false],
    [`https://evil.example/${cdnHost}/x.webp`, "dynamic", false],
    [`https://${cdnHost}\\@evil.example/x.webp`, "dynamic", false],
    ["https://cdn.assets.efootbase。com/x.webp", "dynamic", false],
    ["file:///etc/passwd", "dynamic", false],
    ["ftp://cdn.assets.efootbase.com/x", "dynamic", false],
    [`https://${cdnHost.toUpperCase()}/cards/1.webp`, "dynamic", true],
    [`${cdn}/cards/1.webp`, "dynamic", false],
    // S3: percent signs and dot segments in an allow-listed path
    [`https://${pesdbHost}/assets/img/../secret.png`, "transparent", false],
    [`https://${pesdbHost}/assets/img/%2e%2e/x.png`, "transparent", false],
    [`https://${cdnHost}/cards/./1.webp`, "dynamic", false],
    [`https://${cdnHost}/cards/a%2Fb.webp`, "dynamic", false],
    [`https://${cdnHost}/emblems/team/../x.png`, "emblems", false],
  ];
  const py = await new Promise<string>((res) => {
    // -B: importing the script must not leave scripts/__pycache__ behind
    const c = spawn("python3", ["-I", "-B", "-c", probe, DUMP_SCRIPT, JSON.stringify(cases.map(([u, k]) => [u, k]))], { shell: false, env: { PATH: process.env.PATH ?? "" } });
    let o = "";
    c.stdout.on("data", (b: Buffer) => (o += b.toString("utf8")));
    c.stderr.on("data", (b: Buffer) => (o += b.toString("utf8")));
    c.on("close", () => res(o));
  });
  let got: boolean[] = [];
  try {
    got = JSON.parse(py.trim().split("\n").pop() ?? "[]") as boolean[];
  } catch {
    /* reported below */
  }
  const wrong = cases.filter(([, , want], i) => got[i] !== want).map(([u, k, want]) => `${k} ${u} → want ${want}`);
  assert(got.length === cases.length + 2 && wrong.length === 0, `image URL allow-list per kind (${cases.length} cases; wrong: ${wrong.join("; ") || "none"}${got.length === 0 ? `; output: ${py.slice(0, 200)}` : ""})`);
  assert(got[cases.length] === false && got[cases.length + 1] === true, "safe_name: a trailing newline is refused (fullmatch), a plain name accepted");
  assert(foreign.requests.length === 0, "no request reached the foreign host in any case");
} finally {
  await close(source);
  await close(foreign);
  await close(thirdParty);
  rmSync(sandbox, { recursive: true, force: true });
}

if (process.exitCode) console.error("\ndump-script tests FAILED");
else console.log("\ndump-script tests passed");
