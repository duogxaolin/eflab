// Admin sessions, cookie, CSRF guard and sign-in limits (openspec change
// admin-sync-worker, capability admin-access). Independent of the visitor
// session in ./session.ts: its own table (AdminSession), its own cookie
// (`eflab_admin`), its own procedure guard (`adminProcedure` in router/trpc.ts).
//
//   · Cookie: random 32-byte token (base64url), Path=/, HttpOnly,
//     SameSite=Strict, Secure outside development; the database stores only
//     its SHA-256 digest. Web and API must therefore be the same *site*
//     (subdomains of one domain, or localhost on two ports).
//   · Expiry: 12 h after the last use (sliding, lastSeenAt written at most once a
//     minute) and never later than 7 days after sign-in (AdminSession.expiresAt).
//     A disabled admin's sessions stop working at once.
//   · CSRF: every admin mutation needs `x-eflab-admin: 1` (a custom header forces
//     a CORS preflight) and an Origin in WEB_ORIGIN; otherwise 403.
//   · Brute force: 5 consecutive failures lock the account for 15 minutes; one
//     client address may try 20 times per 15 minutes (in memory, keyed on
//     req.ip — behind a reverse proxy Fastify's `trustProxy` must be set for
//     req.ip to be the client).

import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClientType } from "@eflab/db";
import { adminSessionDigest, isWellFormedAdminToken } from "@eflab/db/admin-auth";
import { isDev, webOrigins } from "../env.js";
import { parseCookieHeader } from "./session.js";

export const ADMIN_COOKIE = "eflab_admin";
export const ADMIN_CSRF_HEADER = "x-eflab-admin";
export const ADMIN_IDLE_MS = 12 * 60 * 60 * 1000;
export const ADMIN_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_TOUCH_MS = 60 * 1000;
export const ADMIN_LOCK_THRESHOLD = 5;
export const ADMIN_LOCK_MS = 15 * 60 * 1000;
export const ADMIN_ADDRESS_LIMIT = 20;
export const ADMIN_ADDRESS_WINDOW_MS = 15 * 60 * 1000;
/** The one message every failed sign-in answers (unknown name, wrong password, locked, disabled). */
export const ADMIN_SIGN_IN_FAILED = "Wrong user name or password";

/** The signed-in admin as procedures see it (no hash, no token, no digest). */
export interface AdminIdentity {
  id: number;
  username: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  sessionId: number;
}

export function adminCookieFlags(): string[] {
  return ["Path=/", "HttpOnly", "SameSite=Strict", ...(isDev ? [] : ["Secure"])];
}

type HeaderSink = Pick<FastifyReply, "header">;

export function setAdminCookie(res: HeaderSink, token: string): void {
  const parts = [`${ADMIN_COOKIE}=${token}`, `Max-Age=${Math.floor(ADMIN_ABSOLUTE_MS / 1000)}`, ...adminCookieFlags()];
  res.header("Set-Cookie", parts.join("; "));
}

export function clearAdminCookie(res: HeaderSink): void {
  res.header("Set-Cookie", [`${ADMIN_COOKIE}=`, "Max-Age=0", ...adminCookieFlags()].join("; "));
}

/** The admin session token in the request's cookies, when it has the right shape. */
export function adminTokenFromCookies(cookieHeader: string | undefined): string | null {
  const token = parseCookieHeader(cookieHeader ?? "")[ADMIN_COOKIE];
  return isWellFormedAdminToken(token) ? token : null;
}

/**
 * Resolve the admin session of a request: digest lookup, then the disabled,
 * absolute and idle checks (an expired row is deleted). Touches lastSeenAt at
 * most once a minute. null = no valid admin session.
 */
export async function resolveAdminSession(
  cookieHeader: string | undefined,
  p: PrismaClientType,
  now: Date = new Date(),
): Promise<AdminIdentity | null> {
  const token = adminTokenFromCookies(cookieHeader);
  if (!token) return null;
  const row = await p.adminSession.findUnique({
    where: { tokenDigest: adminSessionDigest(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      admin: { select: { id: true, username: true, createdAt: true, lastLoginAt: true, disabledAt: true } },
    },
  });
  if (!row) return null;
  const t = now.getTime();
  const expired = row.expiresAt.getTime() <= t || t - row.lastSeenAt.getTime() >= ADMIN_IDLE_MS;
  if (expired || row.admin.disabledAt) {
    await p.adminSession.deleteMany({ where: { id: row.id } });
    return null;
  }
  if (t - row.lastSeenAt.getTime() >= ADMIN_TOUCH_MS) {
    await p.adminSession.updateMany({ where: { id: row.id }, data: { lastSeenAt: now } });
  }
  const { disabledAt: _disabled, ...admin } = row.admin;
  return { ...admin, sessionId: row.id };
}

/** CSRF guard for admin mutations: the custom header and an allowed Origin. */
export function adminCsrfOk(req: Pick<FastifyRequest, "headers">): boolean {
  if (req.headers[ADMIN_CSRF_HEADER] !== "1") return false;
  const origin = req.headers.origin;
  return typeof origin === "string" && webOrigins.includes(origin.replace(/\/+$/, ""));
}

/** True when a /trpc URL calls at least one `admin.*` procedure (batched calls included). */
export function isAdminTrpcUrl(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  if (!path.startsWith("/trpc/")) return false;
  let procs: string;
  try {
    procs = decodeURIComponent(path.slice("/trpc/".length));
  } catch {
    procs = path.slice("/trpc/".length);
  }
  return procs.split(",").some((p) => p === "admin" || p.startsWith("admin."));
}

/**
 * Sliding-window attempt counter per client address (sign-in): `hit` records an
 * attempt and returns false once `limit` attempts fall inside `windowMs`.
 * In-memory: one API process; restarting the API clears it (the per-account
 * lock-out lives in the database and survives).
 */
export class AddressLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(readonly limit = ADMIN_ADDRESS_LIMIT, readonly windowMs = ADMIN_ADDRESS_WINDOW_MS) {}

  hit(key: string, now: number = Date.now()): boolean {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    const allowed = list.length < this.limit;
    if (allowed) list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.prune(now);
    return allowed;
  }

  private prune(now: number): void {
    const from = now - this.windowMs;
    for (const [k, list] of this.hits) if (!list.some((t) => t > from)) this.hits.delete(k);
  }
}
