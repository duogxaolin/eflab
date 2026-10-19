// Fake public image bucket for the worker tests (openspec change
// admin-sync-worker, task 5.6). Serves the files the stand-in upload
// (fake-upload.mjs) copied into its --dest directory, like the bucket's public
// URL: GET / HEAD with a quoted plain-md5 ETag (R2's single-part ETag), 404
// when the object is absent. Bound to 127.0.0.1 on an ephemeral port; used as
// R2_PUBLIC_BASE so `efootbase_dump.py --etag-vs-bucket` never leaves the machine.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve, sep } from "node:path";

export interface FakeBucket {
  /** http://127.0.0.1:<port> — use as R2_PUBLIC_BASE. */
  base: string;
  requests: Array<{ method: string; path: string; host: string | undefined }>;
  close(): Promise<void>;
}

export async function startFakeBucket(root: string): Promise<FakeBucket> {
  const top = resolve(root);
  const requests: FakeBucket["requests"] = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    requests.push({ method: req.method ?? "GET", path, host: req.headers.host });
    const file = resolve(top, `.${path}`);
    if (!file.startsWith(top + sep) || !existsSync(file) || !statSync(file).isFile() || file.endsWith("_invocations.jsonl")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(req.method === "HEAD" ? undefined : "not found");
      return;
    }
    const bytes = readFileSync(file);
    const headers = { "Content-Type": "application/octet-stream", "Content-Length": bytes.byteLength, ETag: `"${createHash("md5").update(bytes).digest("hex")}"` };
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : bytes);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}
