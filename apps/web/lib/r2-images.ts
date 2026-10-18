// R2 image URL helper — base URL from env, easy domain swap.
// Source: efootbase images dumped to Cloudflare R2 bucket (efootbase CDN → R2),
// uploaded via scripts/r2_upload.py. See CLAUDE.md "Image pipeline".
//
// Pattern: `${R2_PUBLIC_BASE}/{key}` — R2_PUBLIC_BASE env var.
// Đổi R2 domain (custom CDN, migrate) → chỉ cần sửa NEXT_PUBLIC_R2_PUBLIC_BASE,
// không phải sửa code hay update DB.
//
// Keys this module builds (mirror of dump/efootbase/images/ + card-assets/):
//   cards/{playerId}_dynamic.webp?v=…        (pre-composited card: bg + art + frame — PlayerCard)
//   cards/{playerId}_transparent.webp?v=…    (240×339 WebP, face + OVR, no bg — home search thumbnails)
//   conditions/condition_{a-e}.svg           (condition badge overlay)
//
// Flag / club / league emblems are NOT built here: efootbase names them by
// SHA256 hash, so the seeder stores absolute R2 URLs in Country.flagUrl,
// Team.emblemUrl and League.emblemUrl and the API rebases them onto
// R2_PUBLIC_BASE on the way out (apps/api/src/env.ts `rebaseR2Url`).
//
// The 4-layer composite helpers (card-backgrounds/, frames/ on R2), the manager
// art helper and the emblem-by-key helpers were removed in change
// remove-dead-surface (no caller); the objects remain in the bucket.
//
// Card image cache version: R2 serves objects with `Cache-Control: public,
// max-age=31536000, immutable`, and a re-dump overwrites changed card images
// under the SAME key (2026-10-18: 5,312 cards). Browsers and edges would keep
// the old bytes for a year, so every card URL carries `?v=<IMAGE_VERSION>`
// (R2 ignores the query; the cache key changes). Bump it whenever card objects
// are overwritten in place: edit DEFAULT_IMAGE_VERSION (committed default, takes
// effect without configuration) or set NEXT_PUBLIC_IMAGE_VERSION and rebuild —
// it is inlined at build time. Conditions/flags/emblems are unversioned (never
// overwritten).

const R2_BASE =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ??
  "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";

/** Committed card-image version (date of the last in-place overwrite on R2). */
export const DEFAULT_IMAGE_VERSION = "20261019";

/** Effective card-image version: NEXT_PUBLIC_IMAGE_VERSION when non-empty, else the default. */
export const IMAGE_VERSION =
  (process.env.NEXT_PUBLIC_IMAGE_VERSION || "").trim() || DEFAULT_IMAGE_VERSION;

/** R2 object key → full public URL. Strip leading slash if present. */
export function r2Url(key: string): string {
  return `${R2_BASE}/${key.replace(/^\//, "")}`;
}

/** Card image key → versioned public URL (`?v=IMAGE_VERSION`, see header). */
function cardImageUrl(key: string): string {
  return `${r2Url(key)}?v=${encodeURIComponent(IMAGE_VERSION)}`;
}

/** Player card image (transparent, no text/watermark — efootbase render). 240×339 WebP. */
export function playerCardUrl(playerId: string | number): string {
  return cardImageUrl(`cards/${playerId}_transparent.webp`);
}

/** Player card dynamic variant (animated background). Same dimensions, larger file. */
export function playerCardDynamicUrl(playerId: string | number): string {
  return cardImageUrl(`cards/${playerId}_dynamic.webp`);
}

/** Condition badge SVG. `letter` is A–E (lowercased internally). 5 files on R2. */
export function conditionUrl(letter: string): string {
  return r2Url(`conditions/condition_${letter.toLowerCase()}.svg`);
}
