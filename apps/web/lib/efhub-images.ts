// efhub / efimg.com image URL helpers — deterministic from DB IDs.
// Patterns verified against efimg.com CDN (public, no key):
//   Card  : https://efimg.com/efootballhub22/images/player_cards/{PlayerID}_l.png  (240×339, ~110KB)
//   Flag  : https://efimg.com/efootballhub22/images/symbol/Nationality/{CountryID}.png  (128×128)
//   Emblem: https://efimg.com/efootballhub22/images/symbol/Emblem/e_{TeamId:06d}.png  (~10KB; 404 for virtual teams)
// Mini-cards pattern from older docs (mini-cards/mini-cards/{id}_l.png) returns 404 as of 2026-10 — only player_cards works.
// See memory: efhub-cdn-datapath.
//
// ⚠ DEPRECATED 2026-10-06: `playerCardUrl` re-exported from `./r2-images` (R2 / efootbase
// transparent webp — prettier, no efhub watermark). `flagUrl`/`emblemUrl` still use efimg
// here because efootbase uses SHA256 hash filenames (not ID-derivable) — those URLs come
// from DB (Country.flagUrl / Team.emblemUrl) via seed-efootbase-r2.ts. Migrate consumers
// to r2-images + DB-driven flag/emblem URLs gradually.

export { playerCardUrl } from "./r2-images";

const EFIMG_BASE = "https://efimg.com/efootballhub22/images";

/** National flag. CountryID is the Konami nationality id (e.g. 227=Poland, 144=Argentina). 128×128. */
export function flagUrl(countryId: number): string {
  return `${EFIMG_BASE}/symbol/Nationality/${countryId}.png`;
}

/** Club emblem. TeamId zero-padded to 6 digits. ~25% of teams (virtual/special) 404 → caller should onErrorHide. */
export function emblemUrl(teamId: number): string {
  return `${EFIMG_BASE}/symbol/Emblem/e_${String(teamId).padStart(6, "0")}.png`;
}
