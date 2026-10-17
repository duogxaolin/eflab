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
// Backgrounds/frames/conditions dumped by scripts/fetch_card_assets.py (browser-UA,
// 2026-10-07). Art depends on card_type + featured-pack-slug (see the verified rules
// in the `packHintArt` table below). Cards whose slug doesn't carry an art signal
// fall back to a per-cardType default; cards with no default render a CSS gradient
// coloured by the card-type accent (Standard/Selection/Legendary/Strike Arena).
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
//
// Art resolution model (verified against efootbase 2026-10-07):
// efootbase's card page label is richer than the card_type code — it shows
// "Epic - Big Time", "Icons", "POTD" etc. — and the rendered art depends on a
// COMBINATION of card_type + featured-pack-slug, not card_type alone. Verified
// samples (efootbase.com/players/{baseId}/{playerId}), re-keyed to the
// code-based CardType names (CARD_TYPE_BY_EFOOTBASE_CODE in @eflab/shared):
//
//   code | CardType       | featured slug           | efootbase label      | bg                 | frame
//   -----|----------------|-------------------------|----------------------|--------------------|------------------------------------
//   0    | STANDARD       | (none)                  | Standard             | —                  | —
//   1    | LEGENDARY      | fc-barcelona-73-74      | Icons                | Epic_2026/_2027    | Epic Frame (Cyan Booster)
//   3    | TRENDING potw  | potw-20-oct-22          | Trending             | —                  | POTW-Worldwide-Card [Booster]
//   3    | TRENDING potd  | potd-international-cup  | POTD Int'l Cup Day N | POTD_WC_26         | POTD_WC_26_Frame
//   4    | SELECTION      | european-club-champ...  | Selection            | —                  | —
//   5    | EPIC  bt       | big-time-argentina-...  | Epic - Big Time event| Big_Time_WC_26     | Big_Time_WC_26_Frame
//   5    | EPIC  ep       | madrid-chamartin-...   | Epic - Big Time legend| Epic_2027         | Epic Frame (Cyan Booster)
//   6    | HIGHLIGHT      | gracias-leo             | Highlight            | —                  | —
//   7    | STRIKE_ARENA   | strike-arena            | Strike Arena         | —                  | —

/** Pack-slug hint → [bg file, frame file] (both nullable). Returns the most
 *  specific match if the slug carries an art signal, else null (fall back to
 *  the cardType default map). Slug examples: "big-time-argentina-15-jul-26",
 *  "potw-national-teams-4-jul-24", "potd-international-cup-day-11". */
function packHintArt(slug: string): { bg: string | null; frame: string | null } | null {
  const s = slug.toLowerCase();

  // POTD (Player of the Day) — full bg + frame
  if (s.includes("potd-") || s.includes("/potd") || s.startsWith("potd")) {
    return { bg: "POTD_WC_26", frame: "POTD_WC_26_Frame" };
  }
  // POTW (Player of the Week) — frame only, no bg (Trending)
  if (s.includes("potw-") || s.startsWith("potw")) {
    return { bg: null, frame: "POTW-Worldwide-Card [Booster]" };
  }
  // Big Time event packs (e.g. "Big Time Argentina 15 Jul '26") — full Big_Time art
  if (s.includes("big-time") || s.includes("big_time") || s.includes("big time")) {
    return { bg: "Big_Time_WC_26", frame: "Big_Time_WC_26_Frame" };
  }
  // Show Time event packs
  if (s.includes("show-time") || s.includes("show_time") || s.includes("show time")) {
    return { bg: "Show_Time_2027", frame: "Show_Time_WC_26_Frame" };
  }
  return null;
}

// NOTE: the "Cyan Booster" frame names (e.g. "Show Time Frame (Cyan Booster)")
// probed 2026-10-07 do NOT exist on efootbase — efootbase returns an HTML 404
// page (8054 bytes) for those URLs. The valid efootbase frame filenames are the
// underscored WC_26 / Single_Booster variants (verified by direct fetch +
// `file` on every frames/ asset on R2). Never reference the spaced
// "(Cyan Booster)" frame names — they were a wrong guess in the first asset
// fetch and the 8054-byte HTML responses got uploaded to R2. To clean them
// out of the R2 bucket, delete the 3 corrupted keys:
//   frames/Big Time Frame (Cyan Booster).webp
//   frames/Show Time Frame (Cyan Booster).webp
//   frames/Epic Frame (Cyan Booster).webp

/** CardType → default art when the pack slug doesn't carry an art signal.
 *  Matches efootbase's per-card_type default render for un-hinted packs.
 *  Verified 2026-10-07 against efootbase samples (code-based names):
 *    HIGHLIGHT code 6 (Haaland "english-league-25-26-seasons-best") → Show_Time
 *      bg + Show Time frame. Label "Highlight".
 *    SELECTION code 4 (Salah "european-club-championship-16-jun-22") → no bg
 *      (gradient), no frame. Label "Selection".
 *    TRENDING code 3 + potw slug → POTW-Worldwide-Card [Booster] frame, no bg.
 *    EPIC code 5 historical (Kaká "madrid-chamartin-b-09-10") → Epic_2027 +
 *      single-booster Epic frame. Label "Epic - Big Time".
 *    LEGENDARY code 1 "Icons" (Messi "fc-barcelona-18-19-limited") → no bg, no frame.
 *    STRIKE_ARENA code 7 → no bg, no frame. */
//
// NOTE (eflab-parity-fixes): the CardType enum now mirrors efootbase's own
// `card_type` codes (CARD_TYPE_BY_EFOOTBASE_CODE in @eflab/shared): Show Time
// cards are HIGHLIGHT (code 6) and Big Time cards are EPIC (code 5). The old
// BIG_TIME / SHOW_TIME enum names no longer exist, so the defaults below are
// keyed by the code-based names. The layered composite (cardBgUrl/cardFrameUrl)
// currently has no caller — PlayerCard renders the single `_dynamic.webp`.
const CARD_BG_FILES: Partial<Record<CardType, string>> = {
  // code 6 "Highlight" (Show Time campaign, e.g. Haaland Season's Best) — Show_Time bg
  HIGHLIGHT: "Show_Time_2027",
  // code 5 "Epic" (Big Time campaign / historical, Kaká "Madrid Chamartin B 09-10")
  // renders Epic_2027 + the single-booster Epic frame by default
  EPIC: "Epic_2027",
};
const CARD_FRAME_FILES: Partial<Record<CardType, string>> = {
  HIGHLIGHT: "Show_Time_WC_26_Frame",
  EPIC: "Epic_Frame_Single_Booster",
  // code 3 "Trending" with a potw pack slug → POTW frame. Without a potw slug,
  // TRENDING renders bare (no frame) — the slug hint in packHintArt handles the
  // potw case, so TRENDING is intentionally absent here.
};

/** Layer 1: card background. Resolves pack-slug hint first (POTD/Big-Time/Show-Time
 *  events carry explicit art), else falls back to the cardType default. Null →
 *  PlayerCard renders a CSS gradient coloured by the card-type accent. */
export function cardBgUrl(cardType: CardType, packNameOrId?: string | null): string | null {
  if (packNameOrId) {
    const art = packHintArt(packNameOrId);
    if (art && art.bg) return r2Url(`card-backgrounds/${art.bg}.webp`);
    // slug carried a signal but bg is null (POTW: frame-only) → honor that
    if (art) return null;
  }
  const file = CARD_BG_FILES[cardType];
  return file ? r2Url(`card-backgrounds/${file}.webp`) : null;
}

/** Layer 3: card frame. Same resolution order as cardBgUrl. Frame is optional;
 *  null means the face renders bare (no frame overlay). */
export function cardFrameUrl(cardType: CardType, packNameOrId?: string | null): string | null {
  if (packNameOrId) {
    const art = packHintArt(packNameOrId);
    if (art && art.frame) return r2Url(`frames/${art.frame}.webp`);
    if (art) return null;
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

/** Manager card art by manager id. 65 images bundled in efootbase APK, mirrored to R2. */
export function managerImageUrl(managerId: string | number | bigint): string {
  return r2Url(`managers/${managerId}.webp`);
}

/** League emblem by R2 key path. Prefer reading League.emblemUrl from DB. */
export function leagueEmblemByKey(r2Key: string): string {
  return r2Url(r2Key);
}
