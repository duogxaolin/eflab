// Admin password hashing and session-token helpers (openspec change
// admin-sync-worker, capability admin-access "Password Handling" / "Admin
// Sign-In And Session"). SERVER-ONLY: it uses node:crypto and is exported as the
// `@eflab/db/admin-auth` subpath (not from the package index), so only the admin
// CLI (src/admin-cli.ts) and the API import it. apps/web never imports
// @eflab/db at runtime (checked by admin-auth.test.ts).
//
// Stored format: scrypt$N$r$p$<salt base64url>$<key base64url>
//   N = 2^15, r = 8, p = 1, 16-byte random salt, 64-byte derived key. The
//   parameters are read back from the stored string, so they can be raised
//   later without invalidating existing hashes. Verification uses
//   crypto.timingSafeEqual; a malformed or out-of-bounds stored value verifies
//   as false (never throws, never runs an unbounded scrypt).
//
// Session tokens: 32 random bytes, base64url (43 characters) in the
// `eflab_admin` cookie; the database stores only their SHA-256 hex digest.

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
  throw new Error("@eflab/db/admin-auth is server-only and must never be bundled for a browser");
}

export const SCRYPT_N = 2 ** 15;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_SALT_BYTES = 16;
export const SCRYPT_KEY_BYTES = 64;
export const SESSION_TOKEN_BYTES = 32;

// Upper bounds accepted when reading a stored hash (a tampered row must not be
// able to make the API run a huge scrypt).
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;
const MIN_KEY_BYTES = 32;
const MAX_KEY_BYTES = 128;

/** scrypt memory = 128 · N · r bytes (32 MiB at the defaults); Node's default
 *  `maxmem` is exactly 32 MiB, which scrypt's own bookkeeping exceeds. */
const maxmemFor = (n: number, r: number): number => 128 * n * r + 16 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Hash a password into the self-describing scrypt string stored in Admin.passwordHash. */
export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await scrypt(password, salt, SCRYPT_KEY_BYTES, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: maxmemFor(SCRYPT_N, SCRYPT_R),
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

interface ParsedHash { n: number; r: number; p: number; salt: Buffer; key: Buffer }

/** Parse a stored hash; null when it is malformed or its parameters are out of bounds. */
export function parseAdminPasswordHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, nS, rS, pS, saltS, keyS] = parts as [string, string, string, string, string, string];
  if (!/^\d{1,8}$/.test(nS) || !/^\d{1,3}$/.test(rS) || !/^\d{1,3}$/.test(pS)) return null;
  const n = Number(nS);
  const r = Number(rS);
  const p = Number(pS);
  if (n < 2 || n > MAX_N || (n & (n - 1)) !== 0 || r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(saltS) || !/^[A-Za-z0-9_-]+$/.test(keyS)) return null;
  const salt = Buffer.from(saltS, "base64url");
  const key = Buffer.from(keyS, "base64url");
  if (salt.length < 8 || key.length < MIN_KEY_BYTES || key.length > MAX_KEY_BYTES) return null;
  return { n, r, p, salt, key };
}

/** Constant-time check of a password against a stored hash; false on any malformed value. */
export async function verifyAdminPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseAdminPasswordHash(stored);
  if (!parsed) return false;
  let derived: Buffer;
  try {
    derived = await scrypt(password, parsed.salt, parsed.key.length, {
      N: parsed.n, r: parsed.r, p: parsed.p, maxmem: maxmemFor(parsed.n, parsed.r),
    });
  } catch {
    return false;
  }
  return derived.length === parsed.key.length && timingSafeEqual(derived, parsed.key);
}

// A dummy hash (of random bytes nobody knows, made once per process with the
// current parameters) that sign-in verifies when the user name is unknown or the
// account cannot sign in, so every failure path costs one full scrypt.
let dummyHash: Promise<string> | null = null;

const getDummyHash = (): Promise<string> => (dummyHash ??= hashAdminPassword(randomBytes(32).toString("base64url")));

/** Spend the same work as a real verification and return false. */
export async function verifyAgainstDummyHash(password: string): Promise<false> {
  await verifyAdminPassword(password, await getDummyHash());
  return false;
}

/** Build the dummy hash ahead of the first sign-in (call at server start), so
 *  the first unknown-name attempt does not cost one extra hash. */
export async function warmUpAdminAuth(): Promise<void> {
  await getDummyHash();
}

/** New random session token for the `eflab_admin` cookie (32 bytes, base64url). */
export function generateAdminSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

/** SHA-256 hex digest of a session token — the only form stored (AdminSession.tokenDigest). */
export function adminSessionDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A cookie value that can be an admin session token (43 base64url characters). */
export function isWellFormedAdminToken(token: string | undefined | null): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
