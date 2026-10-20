// efootbase request identity and source address (openspec change admin-sync-worker,
// design decision 3, data-sync-worker "Politeness And Blocking").
//
// The worker makes exactly one request itself (the check run); everything
// heavier shells out to scripts/efootbase_dump.py. Both must present the SAME
// request identity, so the constants below are DUPLICATED from the script on
// purpose — test/worker.test.ts reads scripts/efootbase_dump.py and fails when
// API_BASE, UA or the key header name drift apart.

/** = `API_BASE` in scripts/efootbase_dump.py (the real source; never used by tests). */
export const EFOOTBASE_API_BASE = "https://api2.efootbase.com/api";
/** = `UA` in scripts/efootbase_dump.py. */
export const EFOOTBASE_USER_AGENT = "efbase/1.9.7 (com.wildpluto.efbase; Android 14)";
/** = the key header of `http_get` in scripts/efootbase_dump.py. */
export const EFOOTBASE_KEY_HEADER = "X-API-Key";
/** = `CDN_BASE` in scripts/efootbase_dump.py: the only host of emblem images, one of the two of card images. */
export const EFOOTBASE_CDN_BASE = "https://cdn.assets.efootbase.com";
/** = `PESDB_IMAGE_BASE` in scripts/efootbase_dump.py: the other host of card images (the source's
 *  `transparent` renders — 36,815 of 50,691 in the 2026-10-18 dump, 2,139 of its 2,284 newest cards). */
export const PESDB_IMAGE_BASE = "https://pesdb.net";

/** NODE_ENV=test or SYNC_TEST_MODE=1: the source and the upload target must be local. */
export function isTestMode(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "test" || env.SYNC_TEST_MODE === "1";
}

/** True for a loopback host name as `URL.hostname` spells it. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "[::1]" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Throws unless `url` is an http(s) URL on a loopback host. */
export function assertLoopbackUrl(url: string, what: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`${what}: not a valid URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`${what}: only http(s) URLs are allowed`);
  if (!isLoopbackHost(u.hostname)) {
    throw new Error(`${what}: test mode allows only a loopback address (got host ${u.hostname}) — no test may contact a real service`);
  }
}

/**
 * The efootbase API base the worker and its dump child talk to (no trailing
 * slash): EFBASE_API_BASE when set, else the real source. In test mode
 * (NODE_ENV=test or SYNC_TEST_MODE=1) EFBASE_API_BASE is REQUIRED and must be a
 * loopback URL — a missing value would mean the real source, so it is refused.
 * Reused for the dump script's `--api-base`.
 */
export function resolveSourceBase(env: NodeJS.ProcessEnv): string {
  const configured = env.EFBASE_API_BASE?.trim() ?? "";
  if (isTestMode(env)) {
    if (configured === "") throw new Error("EFBASE_API_BASE: required in test mode (a local fake source); the real source is never used by tests");
    assertLoopbackUrl(configured, "EFBASE_API_BASE");
  }
  const base = configured === "" ? EFOOTBASE_API_BASE : configured;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error("EFBASE_API_BASE: not a valid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("EFBASE_API_BASE: only http(s) URLs are allowed");
  return base.replace(/\/+$/, "");
}

export type SourceImageKind = "transparent" | "dynamic" | "emblems";

/**
 * Image hosts and path prefixes per image kind (= `IMAGE_HOSTS` in
 * scripts/efootbase_dump.py, derived from the same two bases; verify finding
 * W-e): pesdb.net only for the `transparent` renders, only under /assets/img/.
 */
export const SOURCE_IMAGE_HOSTS: Readonly<Record<SourceImageKind, Readonly<Record<string, string>>>> = {
  transparent: { [new URL(EFOOTBASE_CDN_BASE).hostname]: "/", [new URL(PESDB_IMAGE_BASE).hostname]: "/assets/img/" },
  dynamic: { [new URL(EFOOTBASE_CDN_BASE).hostname]: "/" },
  emblems: { [new URL(EFOOTBASE_CDN_BASE).hostname]: "/" },
};

/**
 * Whether an image URL taken from the source data may be fetched / stored
 * (verify findings C1, W-a, W-e; the dump script applies the same rule itself
 * and is run as a dry `--validate-only` pass before any write). The raw string
 * is checked too, so WHATWG normalisation (IDNA full-width dots, percent-
 * encoded hosts, backslashes) can never make TS accept what Python refuses:
 * printable ASCII without spaces or backslashes, a plain `host[:443]`
 * authority without user-info; then https on port 443 of an allow-listed host
 * of its kind under its path prefix. In test mode, the fake source's own origin
 * (`apiBase`, loopback-checked) instead — the worker hands it to the script as
 * `--allow-host` with SYNC_TEST_MODE=1.
 */
export function sourceImageUrlAllowed(url: unknown, kind: SourceImageKind, env: { testMode: boolean; apiBase: string; testThirdPartyBase?: string | null }): boolean {
  if (typeof url !== "string" || !/^[\x21-\x7e]+$/.test(url) || url.includes("\\")) return false;
  const raw = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/.exec(url);
  const authority = raw?.[1];
  if (authority === undefined || authority.includes("@")) return false;
  // the RAW path (WHATWG would resolve "./" and "../" first): no "%", no dot segment (third verify S3)
  const rawPath = raw![2] ?? "";
  if (rawPath.includes("%") || rawPath.split("/").some((s) => s === "." || s === "..")) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.username !== "" || u.password !== "") return false;
  if (env.testMode) {
    const src = new URL(env.apiBase);
    const httpish = u.protocol === "http:" || u.protocol === "https:";
    if (httpish && u.protocol === src.protocol && u.host === src.host && isLoopbackHost(u.hostname)) return true;
    // the stand-in third-party host (like pesdb.net): `transparent` renders only
    if (env.testThirdPartyBase && kind === "transparent") {
      const tp = new URL(env.testThirdPartyBase);
      return httpish && u.protocol === tp.protocol && u.host === tp.host && isLoopbackHost(u.hostname);
    }
    return false;
  }
  // the authority as written must be exactly the host WHATWG parsed (+ an explicit :443)
  if (!/^[a-z0-9.-]+(:443)?$/i.test(authority) || authority.toLowerCase().replace(/:443$/, "") !== u.hostname) return false;
  const prefix = SOURCE_IMAGE_HOSTS[kind][u.hostname];
  return u.protocol === "https:" && u.port === "" && prefix !== undefined && u.pathname.startsWith(prefix);
}

/** `--allow-host` value of the dump script in test mode: host:port of the fake source (which also serves its CDN). */
export function testAllowHost(apiBase: string): string {
  const u = new URL(apiBase);
  return `${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}`;
}

/** Headers of every API request (same identity as the dump script). */
export function efootbaseHeaders(key: string): Record<string, string> {
  return {
    [EFOOTBASE_KEY_HEADER]: key,
    "User-Agent": EFOOTBASE_USER_AGENT,
    Accept: "application/json",
  };
}
