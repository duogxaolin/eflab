// R2 image URL helper — base URL from env, easy domain swap.
// Source: efootbase images dumped to Cloudflare R2 bucket (efootbase CDN → R2),
// uploaded via scripts/r2_upload.py. See CLAUDE.md "Image pipeline".
//
// Pattern: `${R2_PUBLIC_BASE}/{key}` — R2_PUBLIC_BASE env var.
// Đổi R2 domain (custom CDN, migrate) → chỉ cần sửa NEXT_PUBLIC_R2_PUBLIC_BASE,
// không phải sửa code hay update DB.
//
// Keys this module builds (mirror of dump/efootbase/images/ + card-assets/):
//   cards/{playerId}_dynamic.webp            (pre-composited card: bg + art + frame — PlayerCard)
//   cards/{playerId}_transparent.webp        (240×339 WebP, face + OVR, no bg — home search thumbnails)
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

const R2_BASE =
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ??
  "https://pub-1a19c30950c04ef3964669ac4792f6f0.r2.dev";

/** R2 object key → full public URL. Strip leading slash if present. */
export function r2Url(key: string): string {
  return `${R2_BASE}/${key.replace(/^\//, "")}`;
}

/** Player card image (transparent, no text/watermark — efootbase render). 240×339 WebP. */
export function playerCardUrl(playerId: string | number): string {
  return r2Url(`cards/${playerId}_transparent.webp`);
}

/** Player card dynamic variant (animated background). Same dimensions, larger file. */
export function playerCardDynamicUrl(playerId: string | number): string {
  return r2Url(`cards/${playerId}_dynamic.webp`);
}

/** Condition badge SVG. `letter` is A–E (lowercased internally). 5 files on R2. */
export function conditionUrl(letter: string): string {
  return r2Url(`conditions/condition_${letter.toLowerCase()}.svg`);
}
