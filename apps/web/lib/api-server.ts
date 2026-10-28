// Server-side access to the eflab API for the thin server `page.tsx` wrappers
// (design decision 10): fetch over HTTP so a missing record becomes a real
// HTTP 404 via `notFound()` and `generateMetadata` can name the entity. The web
// app has no Prisma client; the API is the only data path.
//
// Used only from server components (no "use client" — never import this from a
// client component): the URL comes from API_INTERNAL_URL (container-to-
// container), falling back to the public NEXT_PUBLIC_API_URL and finally the
// dev default.
import { isImageVersion, superjson } from "@eflab/shared";
import type {
  FeaturedBundleDTO,
  PlayerCardDTO,
  SkillDTO,
} from "@eflab/shared";

const API_BASE = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/+$/, "");

/** How long a server render waits for the API before giving up (ms). */
const API_TIMEOUT_MS = 4_000;

export class ApiUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApiUnavailableError";
  }
}

type BatchItem =
  | { result: { data: { json: unknown; meta?: unknown } } }
  | { error: { message?: string; data?: { httpStatus?: number; code?: string } } };

/**
 * Call one tRPC query procedure with the batched-GET wire format the API
 * speaks: `/trpc/<proc>?batch=1&input={"0":{"json":INPUT}}` (superjson
 * envelope). Returns the deserialised result, or throws `ApiUnavailableError`
 * when the API cannot be reached or answers with an error.
 */
export async function apiQuery<T>(procedure: string, input: unknown): Promise<T> {
  const envelope = { "0": superjson.serialize(input) };
  const url = `${API_BASE}/trpc/${procedure}?batch=1&input=${encodeURIComponent(JSON.stringify(envelope))}`;
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (cause) {
    throw new ApiUnavailableError(`API request failed: ${procedure}`, cause);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new ApiUnavailableError(`API returned a non-JSON response for ${procedure} (${res.status})`, cause);
  }
  const item = Array.isArray(body) ? (body[0] as BatchItem | undefined) : undefined;
  if (!item || "error" in item) {
    const message = item && "error" in item ? item.error.message ?? "unknown error" : `HTTP ${res.status}`;
    throw new ApiUnavailableError(`API error for ${procedure}: ${message}`);
  }
  return superjson.deserialize(item.result.data as never) as T;
}

// Path-param guards: tRPC rejects non-numeric / oversized ids with a 400, but
// a malformed URL should simply be "not found" on the web, without a request.
// The slug guards come from @eflab/shared, bounded by the same constants as
// the API inputs (SKILL_SLUG_MAX_LENGTH, BUNDLE_SLUG_MAX_LENGTH): a slug the
// guard lets through is never refused by the input — a refusal would reach
// the page as an ApiUnavailableError (HTTP 500), not a 404.
const ID_PATTERN = /^\d{1,19}$/;
export const isNumericId = (s: string): boolean => ID_PATTERN.test(s);
export { isBundleSlug, isSkillSlug } from "@eflab/shared";

/** `player.byId` — null when the card is unknown OR `baseId` is not its base. */
export function fetchPlayer(baseId: string, cardId: string): Promise<PlayerCardDTO | null> {
  return apiQuery<PlayerCardDTO | null>("player.byId", { baseId, cardId });
}

/** `featured.bySlug` — one featured bundle with its ordered cards, or null. */
export function fetchBundle(slug: string): Promise<FeaturedBundleDTO | null> {
  return apiQuery<FeaturedBundleDTO | null>("featured.bySlug", { slug });
}

/** `skill.byId` — one skill (by its public or stored slug) with its holder
 *  count, or null (unknown or unreleased). */
export function fetchSkill(slug: string): Promise<SkillDTO | null> {
  return apiQuery<SkillDTO | null>("skill.byId", { slug });
}

/** `skill.list` — every public skill with its holder count (the skill page's
 *  rarity rank is computed over it). */
export function fetchSkillList(): Promise<SkillDTO[]> {
  return apiQuery<SkillDTO[]>("skill.list", {});
}

/** How long the root layout's read of the card-image version may wait (ms) — the same bound as `apiQuery`. */
const IMAGE_VERSION_TIMEOUT_MS = API_TIMEOUT_MS;
/** How often that read is revalidated (seconds): a raised version reaches new page loads within about a minute. */
export const IMAGE_VERSION_REVALIDATE_SECONDS = 60;

/**
 * The stored card-image version (`catalogue.meta` → `imageVersion`) for the
 * root layout (change auto-image-version, design D6): one small request
 * cached by Next's data cache and revalidated at most every
 * IMAGE_VERSION_REVALIDATE_SECONDS (a different cache mode than `apiQuery`'s
 * `no-store`, so a static page stays static), bounded by the same timeout,
 * and never throwing — an unreachable API, a timeout, an error answer or an
 * invalid shape all give null, which `resolveImageVersion` turns into the
 * build-time / committed fallback. Only the layout calls it.
 */
export async function fetchImageVersion(): Promise<string | null> {
  const envelope = { "0": superjson.serialize({}) };
  const url = `${API_BASE}/trpc/catalogue.meta?batch=1&input=${encodeURIComponent(JSON.stringify(envelope))}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: IMAGE_VERSION_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(IMAGE_VERSION_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const item = Array.isArray(body) ? (body[0] as BatchItem | undefined) : undefined;
    if (!item || "error" in item) return null;
    const meta = superjson.deserialize(item.result.data as never) as { imageVersion?: unknown } | null;
    return isImageVersion(meta?.imageVersion) ? meta.imageVersion : null;
  } catch {
    return null;
  }
}
