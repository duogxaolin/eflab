// Postgres-backed session + password auth.
//
// We use `better-auth/crypto` (`hashPassword`/`verifyPassword`) for the password
// hashing primitive so the cryptographic layer matches the better-auth library the
// Phase 2 design mandates. The session table itself is the Prisma `Session` model,
// loaded by a signed cookie token (`eflab_session`) — the same pattern better-auth
// uses internally. We keep the surface minimal so it plugs directly into tRPC
// middleware (`protectedProcedure`) and the Fastify context.
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { prisma, type PrismaClientType } from "@eflab/db";

// Session cookie name (consumed by the protectedProcedure middleware).
export const SESSION_COOKIE = "eflab_session";
// 30-day session lifetime, in seconds.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  region: string | null;
  country: string | null;
  isPro: boolean;
  proUntil: Date | null;
  role: "USER" | "MODERATOR" | "ADMIN";
}

export interface FullSession extends SessionUser {
  token: string;
  expiresAt: Date;
}

// Convert a Prisma User row into the trimmed SessionUser shape exposed to ctx.
export function userToSession(u: {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  region: string | null;
  country: string | null;
  isPro: boolean;
  proUntil: Date | null;
  role: "USER" | "MODERATOR" | "ADMIN";
}): SessionUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    region: u.region,
    country: u.country,
    isPro: u.isPro,
    proUntil: u.proUntil,
    role: u.role,
  };
}

export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

// Read the session cookie header, look up the active session row, then return the
// resolved User. Returns null when no cookie/active session/expired session.
export async function getSessionFromCookie(cookieHeader: string, p: PrismaClientType): Promise<FullSession | null> {
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = await p.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await p.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  return { ...userToSession(row.user), token: row.token, expiresAt: row.expiresAt };
}

// Create a fresh session row + return the token. Caller sets the Set-Cookie header.
export async function issueSession(
  userId: string,
  p: PrismaClientType,
  opts: { ip?: string | null; ua?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const row = await p.session.create({
    data: {
      token,
      userId,
      expiresAt,
      ipAddress: opts.ip ?? null,
      userAgent: opts.ua ?? null,
    },
    select: { token: true, expiresAt: true },
  });
  return { token: row.token, expiresAt: row.expiresAt };
}

// Delete the session row (gracefully no-op when the token is unknown).
export async function revokeSession(token: string | undefined, p: PrismaClientType): Promise<void> {
  if (!token) return;
  await p.session.deleteMany({ where: { token } }).catch(() => {});
}

export { hashPassword, verifyPassword, prisma };
