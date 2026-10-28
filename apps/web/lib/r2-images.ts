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
// Card image cache version (change auto-image-version, design D6): R2 serves
// objects with `Cache-Control: public, max-age=31536000, immutable`, and the
// sync worker (like a re-dump: 2026-10-18 5,312 cards; 2026-10-24 821) replaces
// a changed card image under the SAME key. Browsers and edges would keep the
// old bytes for a year, so every card URL carries `?v=<version>` (R2 ignores
// the query; the cache key changes). The version is resolved per request by
// `resolveImageVersion`, in this order: the value stored in the database
// (CatalogueMeta.imageVersion, raised by the worker in the transaction that
// records a run that replaced images; read by the root layout through
// `catalogue.meta`, revalidated every 60 s) → NEXT_PUBLIC_IMAGE_VERSION
// (build-time, inlined) → the committed DEFAULT_IMAGE_VERSION. The two
// fallbacks only serve a database with nothing stored or an API that cannot be
// reached; nobody edits them for a sync any more. The root layout hands the
// resolved value to the components through `ImageVersionProvider` /
// `useImageVersion()` (lib/image-version.tsx); the URL helpers take it as an
// explicit argument — no module-level state, no setter. Conditions / flags /
// emblems are unversioned (never overwritten).

import { isImageVersion } from "@eflab/shared";

const R2_BASE =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ??
  "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";

/** Committed card-image version: the fallback when nothing is stored and no build-time version is set (date of the last in-place overwrite before the worker raised the version itself). */
export const DEFAULT_IMAGE_VERSION = "20261024";

/** Build-time fallback: NEXT_PUBLIC_IMAGE_VERSION when non-empty, else the committed default. */
const BUILD_IMAGE_VERSION = (process.env.NEXT_PUBLIC_IMAGE_VERSION || "").trim() || DEFAULT_IMAGE_VERSION;

/**
 * The card-image version to put in every card URL: the stored value when it is
 * one (8–14 digits, as `catalogue.meta` serves it), else the build-time
 * NEXT_PUBLIC_IMAGE_VERSION when set, else DEFAULT_IMAGE_VERSION. The one
 * rule of the resolution order (design D6).
 */
export function resolveImageVersion(stored: string | null | undefined): string {
  return isImageVersion(stored) ? stored : BUILD_IMAGE_VERSION;
}

/** R2 object key → full public URL. Strip leading slash if present. */
export function r2Url(key: string): string {
  return `${R2_BASE}/${key.replace(/^\//, "")}`;
}

/** Card image key → versioned public URL (`?v=<version>`, see header). */
function cardImageUrl(key: string, version: string): string {
  return `${r2Url(key)}?v=${encodeURIComponent(version)}`;
}

/** Player card image (transparent, no text/watermark — efootbase render). 240×339 WebP. `version` from `useImageVersion()`. */
export function playerCardUrl(playerId: string | number, version: string): string {
  return cardImageUrl(`cards/${playerId}_transparent.webp`, version);
}

/** Player card dynamic variant (animated background). Same dimensions, larger file. `version` from `useImageVersion()`. */
export function playerCardDynamicUrl(playerId: string | number, version: string): string {
  return cardImageUrl(`cards/${playerId}_dynamic.webp`, version);
}

/** Condition badge SVG. `letter` is A–E (lowercased internally). 5 files on R2. */
export function conditionUrl(letter: string): string {
  return r2Url(`conditions/condition_${letter.toLowerCase()}.svg`);
}
