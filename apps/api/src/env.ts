// Runtime configuration for the API, read once from the environment
// (eflab-parity-fixes, design decision 11). The package scripts set NODE_ENV
// explicitly (`dev` = development, `start` = production); anything else —
// including an unset NODE_ENV — is treated as "not development", so stack
// traces stay hidden and cookies are Secure unless a developer opted in.

export const NODE_ENV = process.env.NODE_ENV ?? "production";
export const isDev = NODE_ENV === "development";

// Allowed browser origins (CORS + OAuth redirect target), comma-separated.
const DEFAULT_WEB_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000";
export const webOrigins: readonly string[] = (process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGINS)
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);
// First entry is where the OAuth callback sends the browser afterwards.
export const primaryWebOrigin = webOrigins[0] ?? "http://localhost:3000";

export const API_PORT = Number(process.env.API_PORT ?? 4000);
export const API_HOST = process.env.API_HOST ?? "0.0.0.0";
export const API_ORIGIN = process.env.API_ORIGIN ?? `http://localhost:${API_PORT}`;

// Public base of the R2 bucket that holds flags, emblems and manager art. The
// seeder stores absolute URLs (SHA256-named objects, not derivable from ids);
// when R2_PUBLIC_BASE is set the API rebases those URLs onto it on the way out,
// so changing the R2 domain is an env change, not a database rewrite.
export const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE ?? "").trim().replace(/\/+$/, "") || null;

// Public dev URL of the `efootlab` bucket — the same fallback the seeder and the
// web (lib/r2-images.ts) use when no base is configured.
const R2_DEFAULT_BASE = "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";

/** Public URL of an R2 object stored as a key (e.g. Skill.iconKey
 *  "skills/Skill_OneTouchPass.webp"): built on the fallback base and rebased
 *  onto R2_PUBLIC_BASE like every stored URL. null stays null. */
export function r2ObjectUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return rebaseR2Url(`${R2_DEFAULT_BASE}/${key.replace(/^\/+/, "")}`);
}

/** Rebase a stored R2 object URL onto R2_PUBLIC_BASE (keeps the object path).
 *  Returns the input unchanged when the env var is unset or the value is not an
 *  absolute URL; null stays null. */
export function rebaseR2Url(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!R2_PUBLIC_BASE) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
  return `${R2_PUBLIC_BASE}${parsed.pathname}`;
}
