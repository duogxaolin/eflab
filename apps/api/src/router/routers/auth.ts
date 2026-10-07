// authRouter — email/password signup + signin + signout + getSession.
// Uses better-auth/crypto for password hashing (scrypt via @better-auth/utils).
// Sessions are persisted in the Prisma `Session` table and issued via the
// `eflab_session` signed cookie (see apps/api/src/auth/session.ts).
import { prisma, Prisma } from "@eflab/db";
import { TRPCError } from "@trpc/server";
import { signUpInput, signInInput } from "@eflab/shared";
import { router, publicProcedure } from "../trpc.js";
import {
  getSessionFromCookie,
  issueSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  parseCookieHeader,
  userToSession,
  hashPassword,
  verifyPassword,
} from "../../auth/session.js";

function setSessionCookie(res: { header: (name: string, value: string | string[]) => void }, token: string) {
  // Cross-origin (web → api) cookie: SameSite=Lax + Secure-when-prod.
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
  ].filter(Boolean);
  res.header("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res: { header: (name: string, value: string | string[]) => void }) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
  ].filter(Boolean);
  res.header("Set-Cookie", parts.join("; "));
}

export const authRouter = router({
  // Register a new user (email/password). Returns the public session shape.
  signUp: publicProcedure.input(signUpInput).mutation(async ({ input, ctx }) => {
    // Duplicate detection — 409 semantics, expressed as tRPC CONFLICT.
    const existsEmail = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existsEmail) throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
    const existsName = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (existsName) throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });

    const hashed = await hashPassword(input.password);
    let user;
    try {
      user = await prisma.user.create({
        data: {
          username: input.username,
          email: input.email,
          region: input.region ?? null,
          country: input.country ?? null,
        },
        select: {
          id: true, username: true, email: true, displayName: true, avatarUrl: true,
          region: true, country: true, isPro: true, proUntil: true, role: true,
        },
      });
    } catch (err) {
      // Race: another request registered the same email/username between the
      // pre-check and the create. P2002 = unique constraint violation.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = (err.meta?.target as string[] | undefined)?.includes("email") ? "Email" : "Username";
        throw new TRPCError({ code: "CONFLICT", message: `${target} already registered` });
      }
      throw err;
    }
    // Store the password hash as a password-type Account row (better-auth pattern).
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.email,
        providerType: "credential",
        passwordHashed: hashed,
      },
    });

    const { token } = await issueSession(user.id, prisma, {
      ip: ctx.req.ip ?? null,
      ua: ctx.req.headers["user-agent"] ?? null,
    });
    setSessionCookie(ctx.res, token);
    return { user: userToSession({ ...user, role: user.role }) };
  }),

  // Sign in with email + password.
  signIn: publicProcedure.input(signInInput).mutation(async ({ input, ctx }) => {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true, username: true, email: true, displayName: true, avatarUrl: true,
        region: true, country: true, isPro: true, proUntil: true, role: true,
        followersCount: true, followingCount: true, emailVerified: true, updatedAt: true, createdAt: true,
      },
    });
    if (!user) throw new Error("INVALID_CREDENTIALS");
    const account = await prisma.account.findUnique({
      where: { providerId_accountId: { providerId: "credential", accountId: user.email } },
      select: { passwordHashed: true },
    });
    if (!account?.passwordHashed) throw new Error("INVALID_CREDENTIALS");
    const ok = await verifyPassword({ hash: account.passwordHashed, password: input.password });
    if (!ok) throw new Error("INVALID_CREDENTIALS");

    const { token } = await issueSession(user.id, prisma, {
      ip: ctx.req.ip ?? null,
      ua: ctx.req.headers["user-agent"] ?? null,
    });
    setSessionCookie(ctx.res, token);
    return { user: userToSession(user) };
  }),

  // Sign out (revokes the active session).
  signOut: publicProcedure.mutation(async ({ ctx }) => {
    const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
    const token = cookies[SESSION_COOKIE];
    await revokeSession(token, prisma);
    clearSessionCookie(ctx.res);
    return { ok: true };
  }),

  // Current session — returns the resolved user or null.
  getSession: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.session) return null;
    return {
      id: ctx.session.id,
      username: ctx.session.username,
      email: ctx.session.email,
      displayName: ctx.session.displayName,
      avatarUrl: ctx.session.avatarUrl,
      region: ctx.session.region,
      country: ctx.session.country,
      isPro: ctx.session.isPro,
      proUntil: ctx.session.proUntil ? ctx.session.proUntil.toISOString() : null,
      role: ctx.session.role,
    };
  }),
});

