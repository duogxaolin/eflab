// Tests for the admin password / session helpers (openspec admin-sync-worker,
// capability admin-access). No database. Same assert-style runner as the shared
// package tests. Every password below is a synthetic test value.
// Run: pnpm --filter @eflab/db test   (or: tsx packages/db/src/admin-auth.test.ts)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCRYPT_KEY_BYTES,
  SCRYPT_N,
  SCRYPT_P,
  SCRYPT_R,
  adminSessionDigest,
  generateAdminSessionToken,
  hashAdminPassword,
  isWellFormedAdminToken,
  parseAdminPasswordHash,
  verifyAdminPassword,
  verifyAgainstDummyHash,
} from "./admin-auth.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

const PW = "correct horse battery staple"; // synthetic test value
const t0 = Date.now();
const h1 = await hashAdminPassword(PW);
const hashMs = Date.now() - t0;
const h2 = await hashAdminPassword(PW);

// 1. Stored format records the parameters; salted (same password → different hashes).
{
  const parts = h1.split("$");
  assert(parts.length === 6 && parts[0] === "scrypt", "format scrypt$N$r$p$salt$key");
  assert(parts[1] === String(SCRYPT_N) && parts[2] === String(SCRYPT_R) && parts[3] === String(SCRYPT_P), "N=2^15, r=8, p=1 recorded in the stored string");
  assert(SCRYPT_N === 32768 && SCRYPT_R === 8 && SCRYPT_P === 1 && SCRYPT_KEY_BYTES === 64, "design parameters N=2^15 r=8 p=1, 64-byte key");
  const parsed = parseAdminPasswordHash(h1);
  assert(parsed?.salt.length === 16 && parsed.key.length === 64, "16-byte salt, 64-byte key");
  assert(h1 !== h2, "two hashes of the same password differ (salt)");
  assert(!h1.includes(PW) && !h1.includes(Buffer.from(PW).toString("base64url")), "the stored value does not contain the password");
}

// 2. Verification.
{
  assert(await verifyAdminPassword(PW, h1), "right password verifies");
  assert(await verifyAdminPassword(PW, h2), "right password verifies against the second hash");
  assert(!(await verifyAdminPassword(PW + " ", h1)), "wrong password (one extra character) fails");
  assert(!(await verifyAdminPassword("", h1)), "empty password fails");
  assert(await verifyAdminPassword("Café password 12", await hashAdminPassword("Café password 12")), "NFC-normalised before hashing (composed = decomposed)");
}

// 3. Malformed / tampered stored values verify as false (never throw, never run a huge scrypt).
{
  const [, n, r, p, salt, key] = h1.split("$") as [string, string, string, string, string, string];
  const cases: Array<[string, string]> = [
    ["", "empty string"],
    ["bcrypt$x", "other scheme"],
    [`scrypt$${n}$${r}$${p}$${salt}`, "missing key"],
    [`scrypt$${2 ** 21}$${r}$${p}$${salt}$${key}`, "N above the bound"],
    [`scrypt$30000$${r}$${p}$${salt}$${key}`, "N not a power of two"],
    [`scrypt$${n}$0$${p}$${salt}$${key}`, "r = 0"],
    [`scrypt$${n}$${r}$99$${salt}$${key}`, "p above the bound"],
    [`scrypt$${n}$${r}$${p}$${salt}$${key.slice(0, 20)}`, "key too short"],
    [`scrypt$${n}$${r}$${p}$${salt}$${key}!`, "non-base64url character"],
    [`scrypt$${n}$${r}$${p}$${salt}$${key.slice(0, -2)}AA`, "key bytes changed"],
    [`scrypt$${n}$${r}$${p}$${salt.slice(0, -2)}AA$${key}`, "salt changed"],
    [`scrypt$${2 ** 14}$${r}$${p}$${salt}$${key}`, "N changed (parameters are part of the check)"],
  ];
  for (const [stored, why] of cases) assert(!(await verifyAdminPassword(PW, stored)), `tampered stored value rejected: ${why}`);
}

// 4. Dummy hash: same work, always false.
{
  const t1 = Date.now();
  const r = await verifyAgainstDummyHash(PW); // first call also builds the dummy hash
  const t2 = Date.now();
  await verifyAgainstDummyHash("anything else");
  const dummyMs = Date.now() - t2;
  const t3 = Date.now();
  await verifyAdminPassword("wrong password!", h1);
  const realMs = Date.now() - t3;
  assert(r === false, "the dummy hash never verifies");
  assert(dummyMs >= realMs / 3 && dummyMs <= realMs * 3 + 20, `unknown-name work comparable to a wrong password (${dummyMs} ms vs ${realMs} ms; hash ${hashMs} ms, first dummy ${t2 - t1} ms)`);
}

// 5. Session tokens: ≥ 32 random bytes, only the SHA-256 digest is stored.
{
  const a = generateAdminSessionToken();
  const b = generateAdminSessionToken();
  assert(a !== b && Buffer.from(a, "base64url").length === 32 && a.length === 43, "token = 32 random bytes, base64url (43 characters)");
  assert(isWellFormedAdminToken(a) && !isWellFormedAdminToken(a.slice(1)) && !isWellFormedAdminToken(`${a.slice(1)}=`) && !isWellFormedAdminToken(undefined), "cookie value shape check");
  const d = adminSessionDigest(a);
  assert(/^[0-9a-f]{64}$/.test(d) && d !== a && !d.includes(a), "digest = SHA-256 hex, not the token");
  assert(adminSessionDigest("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "digest is plain SHA-256 (known vector)");
}

// 6. The web app never imports @eflab/db (this module is server-only).
{
  const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web");
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) && /["']@eflab\/db(\/[^"']*)?["']|admin-auth/.test(readFileSync(p, "utf8"))) offenders.push(p);
    }
  };
  walk(webDir);
  const pkg = JSON.parse(readFileSync(join(webDir, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert(offenders.length === 0, `no file under apps/web imports @eflab/db or admin-auth${offenders.length ? `: ${offenders.join(", ")}` : ""}`);
  assert(!("@eflab/db" in (pkg.dependencies ?? {})), "apps/web does not depend on @eflab/db");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ admin-auth tests passed");
