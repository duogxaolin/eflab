// R2 image URL helper — base URL from env, easy domain swap.
// Source: efootbase images dumped to Cloudflare R2 bucket (efootbase CDN → R2),
// uploaded via scripts/r2_upload.py. See CLAUDE.md "Image pipeline".
//
// Pattern: `${R2_PUBLIC_BASE}/{key}` — R2_PUBLIC_BASE env var.
// Đổi R2 domain (custom CDN, migrate) → chỉ cần sửa NEXT_PUBLIC_R2_PUBLIC_BASE,
// không phải sửa code hay update DB.
//
// Key layout on R2 (mirror of dump/efootbase/images/ + card-assets/):
//   cards/{playerId}_transparent.webp        (240×339 WebP, face+OVR no watermark)
//   cards/{playerId}_dynamic.webp            (animated bg variant)
//   card-backgrounds/{Type}.webp             (layered render — layer 1 bg)
//   frames/{Name}_Frame.webp                 (layered render — layer 3 frame)
//   conditions/condition_{a-e}.svg           (layered render — layer 4 badge)
//   emblems/nationality/{sha256}.png         (185 unique — hash, not ID)
//   emblems/league/{sha256}.png              (31 unique)
//   emblems/team/{sha256}.png                (795 unique — hash, not ID)
//
// Card render (efootbase DNA §10): 4-layer composite — bg + face + frame + condition.
// Backgrounds/frames/conditions dumped by scripts/fetch_card_assets.py (probe-verified
// 2026-10-07). Standard/Trending/Highlight/Strike_Arena/Legendary have NO dedicated
// background → PlayerCard falls back to a CSS gradient by card-type accent color.
//
// Note: flag/emblem URLs CANNOT be constructed from IDs — efootbase uses SHA256
// hash filenames. Those must come from DB: Country.flagUrl / Team.emblemUrl /
// League.emblemUrl (populated by packages/db/src/seed-efootbase-r2.ts).

import type { CardType } from "@eflab/shared";

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

// ---- Layered composite layers (efootbase DNA §10) ----

// Card-type → efootbase background filename (probe-verified 2026-10-07).
// Standard/Trending/Highlight/Strike_Arena/Legendary have no dedicated bg → null
// → PlayerCard renders a CSS gradient fallback colored by the card-type accent.
const CARD_BG_FILES: Partial<Record<CardType, string>> = {
  BIG_TIME: "Big_Time_WC_26",
  EPIC: "Epic_2027",
  SHOW_TIME: "Show_Time_2027",
};

/** Layer 1: card background by card type or pack name/id fallback. */
export function cardBgUrl(cardType: CardType, packNameOrId?: string | null): string | null {
  if (packNameOrId) {
    const s = packNameOrId.toLowerCase();
    if (s.includes("big-time") || s.includes("big time") || s.includes("big_time")) {
      return r2Url("card-backgrounds/Big_Time_WC_26.webp");
    }
    if (s.includes("show-time") || s.includes("show time") || s.includes("show_time")) {
      return r2Url("card-backgrounds/Show_Time_2027.webp");
    }
    if (s.includes("epic")) {
      return r2Url("card-backgrounds/Epic_2027.webp");
    }
    if (s.includes("potd") || s.includes("potw")) {
      return r2Url("card-backgrounds/POTD_WC_26.webp");
    }
  }
  const file = CARD_BG_FILES[cardType];
  return file ? r2Url(`card-backgrounds/${file}.webp`) : null;
}

// Card-type → frame filename. WC/Special variants prioritized (most distinctive).
// Frame is optional per layer; when null, the face renders without a frame.
const CARD_FRAME_FILES: Partial<Record<CardType, string>> = {
  BIG_TIME: "Big_Time_WC_26_Frame",
  EPIC: "Epic_Frame_Single_Booster",
  SHOW_TIME: "Show_Time_WC_26_Frame",
};

/** Layer 3: card frame by card type or pack name/id fallback. */
export function cardFrameUrl(cardType: CardType, packNameOrId?: string | null): string | null {
  if (packNameOrId) {
    const s = packNameOrId.toLowerCase();
    if (s.includes("big-time") || s.includes("big time") || s.includes("big_time")) {
      return r2Url("frames/Big_Time_WC_26_Frame.webp");
    }
    if (s.includes("show-time") || s.includes("show time") || s.includes("show_time")) {
      return r2Url("frames/Show_Time_WC_26_Frame.webp");
    }
    if (s.includes("epic")) {
      return r2Url("frames/Epic_Frame_Single_Booster.webp");
    }
    if (s.includes("potd") || s.includes("potw")) {
      return r2Url("frames/POTD_WC_26_Frame.webp");
    }
  }
  const file = CARD_FRAME_FILES[cardType];
  return file ? r2Url(`frames/${file}.webp`) : null;
}

/** Layer 4: condition badge SVG. `letter` is A–E (lowercased internally). 5 files on R2. */
export function conditionUrl(letter: string): string {
  return r2Url(`conditions/condition_${letter.toLowerCase()}.svg`);
}

/** Emblem by R2 key path (e.g. "emblems/team/{hash}.png"). Prefer reading Team.emblemUrl from DB. */
export function emblemByKey(r2Key: string): string {
  return r2Url(r2Key);
}
