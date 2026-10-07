// Google OAuth 2.0 (Authorization Code flow) for the Fastify API.
//
// The app's session model is a custom signed-cookie (`eflab_session`) backed by
// the Prisma `Session` table (see ./session.ts) — better-auth's `auth()` instance
// is NOT used elsewhere (only `better-auth/crypto` for password hashing), so
// mounting the full better-auth social-providers flow here would create a
// second, parallel session system. Instead we implement the standard Google
// OAuth Authorization Code flow directly against Google's endpoints and reuse
// `issueSession` so Google sign-ins land in the same session store as
// email/password sign-ups.
//
// Flow:
//   1. Web `/api/auth/google` (Next route handler) 302s to the API
//      `/auth/google/login` so the opaque `state` cookie can be set by the API
//      on the same origin that will receive the callback.
//   3. Google 302s back to `/auth/google/callback` with `code` + `state`.
//   4. We redeem the code for tokens, fetch the userinfo endpoint, and either
//      load the existing User (by the google Account row) or create a fresh
//      User + Account (providerId="google", accountId=Google `sub`).
//   5. We issue a session cookie and 302 back to the web frontend.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@eflab/db";
import type { FastifyInstance, FastifyPluginCallback, FastifyReply } from "fastify";
import { issueSession, parseCookieHeader, SESSION_COOKIE } from "./session.js";

const STATE_COOKIE = "eflab_oauth_state";
// Web origin (POST-OAuth landing) — default to the dev web server.
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const API_ORIGIN = process.env.API_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? 4000}`;

// OAuth client config — both must be set; the routes 503 cleanly if missing.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// PKCE-style state — a random nonce signed with the secret so we can verify it
// came from us, without storing server-side state.
function signState(raw: string): string {
  const secret = process.env.OAUTH_STATE_SECRET ?? CLIENT_SECRET ?? "eflab-dev-state-key";
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  return `${raw}.${sig}`;
}

function verifyState(cookieValue: string | undefined, queryState: string | undefined): boolean {
  if (!cookieValue || !queryState) return false;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return false;
  const rawSig = cookieValue.slice(dot + 1);
  const rawRaw = cookieValue.slice(0, dot);
  const rawQuery = queryState.slice(0, queryState.lastIndexOf("."));
  if (rawRaw !== rawQuery) return false;
  const secret = process.env.OAUTH_STATE_SECRET ?? CLIENT_SECRET ?? "eflab-dev-state-key";
  const expected = createHmac("sha256", secret).update(rawRaw).digest("hex");
  if (rawSig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(rawSig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function setStateCookie(res: FastifyReply, state: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${STATE_COOKIE}=${state}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    isProd ? "Secure" : "",
    `Max-Age=600`,
  ].filter(Boolean);
  res.header("Set-Cookie", parts.join("; "));
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function exchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }> {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Google token exchange failed (${r.status}): ${text}`);
  }
  return (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Google userinfo fetch failed (${r.status}): ${text}`);
  }
  return (await r.json()) as GoogleUserInfo;
}

export const googleOAuthRoutes: FastifyPluginCallback = (server: FastifyInstance, _opts, done) => {
  // Step 1: start the OAuth flow — set state cookie + redirect to Google.
  server.get("/auth/google/login", async (_req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      server.log.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured");
      return res.code(503).send({ error: "Google OAuth not configured" });
    }
    const raw = randomBytes(16).toString("hex");
    const state = signState(raw);
    const redirectUri = `${API_ORIGIN}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "select_account",
    });
    setStateCookie(res, state);
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, 302);
  });

  // Step 2: OAuth callback — redeem code, find-or-create User + Account, issue session.
  server.get("/auth/google/callback", async (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.code(503).send({ error: "Google OAuth not configured" });
    }
    const query = req.query as { code?: string; state?: string; error?: string };
    if (query.error) {
      return res.redirect(`${WEB_ORIGIN}/login?google_error=${encodeURIComponent(query.error)}`, 302);
    }
    const cookieState = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE];
    if (!verifyState(cookieState, query.state)) {
      return res.code(400).send({ error: "Invalid OAuth state" });
    }
    if (!query.code) {
      return res.code(400).send({ error: "Missing authorization code" });
    }
    const redirectUri = `${API_ORIGIN}/auth/google/callback`;
    let tokens: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
    let info: GoogleUserInfo;
    try {
      tokens = await exchangeCode(query.code, redirectUri);
      info = await fetchUserInfo(tokens.access_token);
    } catch (err) {
      server.log.error({ err: (err as Error).message }, "Google OAuth callback failed");
      return res.redirect(`${WEB_ORIGIN}/login?google_error=oauth_failed`, 302);
    }

    // Find-or-create the user via the google Account row (accountId = Google sub).
    const existingAccount = await prisma.account.findUnique({
      where: { providerId_accountId: { providerId: "google", accountId: info.sub } },
      select: { userId: true },
    });
    let userId: string;
    if (existingAccount) {
      userId = existingAccount.userId;
    } else {
      // First-time Google sign-in: create a User + google Account row.
      // Derive a unique username from the email local-part, suffixing if taken.
      const baseUsername = (info.email.split("@")[0] ?? "user")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 18) || "user";
      let username = baseUsername;
      for (let i = 1; i < 1000; i++) {
        const clash = await prisma.user.findUnique({ where: { username }, select: { id: true } });
        if (!clash) break;
        username = `${baseUsername}${i}`;
      }
      const emailClash = await prisma.user.findUnique({ where: { email: info.email }, select: { id: true } });
      if (emailClash) {
        // Email already exists (registered via email/password) — link the google
        // Account to that user instead of creating a duplicate.
        userId = emailClash.id;
      } else {
        const created = await prisma.user.create({
          data: {
            username,
            email: info.email,
            emailVerified: !!info.email_verified,
            displayName: info.name ?? null,
            avatarUrl: info.picture ?? null,
          },
          select: { id: true },
        });
        userId = created.id;
      }
      // Upsert the google Account row (idempotent if email-clash path already had one).
      await prisma.account.upsert({
        where: { providerId_accountId: { providerId: "google", accountId: info.sub } },
        create: {
          userId,
          providerId: "google",
          accountId: info.sub,
          providerType: "oauth",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          scope: tokens.scope ?? null,
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          scope: tokens.scope ?? null,
        },
      });
    }

    const { token } = await issueSession(userId, prisma, {
      ip: req.ip ?? null,
      ua: req.headers["user-agent"] ?? null,
    });
    // Set the session cookie + clear the state cookie in one Set-Cookie header.
    const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}`;
    res.header("Set-Cookie", [
      `${SESSION_COOKIE}=${token}; ${cookieFlags}Max-Age=${60 * 60 * 24 * 30}`,
      `${STATE_COOKIE}=; ${cookieFlags}Max-Age=0`,
    ]);
    return res.redirect(`${WEB_ORIGIN}/`, 302);
  });

  done();
};

