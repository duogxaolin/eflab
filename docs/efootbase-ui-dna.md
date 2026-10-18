# efootbase.com — DNA UI + Function Breakdown

> **Ngày phân tích:** 2026-10-06
> **Phương pháp:** Browser automation (osf-browser-automation agent, screenshots) + WebFetch home_full + eFootBase APK extraction (Flutter v1.9.7) + playbook synthesis
> **Tại sao đáng copy:** efootbase là site chị em efhub (cùng Wild Pluto) nhưng đi hướng "datamine-first" — API key-gated (snake_case raw fields), Skills page đầy đủ (67 skills, 3 types), ~45k card variants, Creator Spotlight, Multi-language. eFootBase APK (Flutter, khác efhub RN) render card bằng **layered assets** (background per year per card type + frame per booster color + photo overlay) — kỹ thuật render card đáng học nếu eflab muốn vẽ card động.

## TL;DR

efootbase.com = Next.js + Turbopack + RSC, Cloudflare + DigitalOcean Spaces (cdn.assets.efootbase.com), **snake_case field names** (raw datamine, khác efhub camelCase), ~45k player card variants, no public community route (khác efhub — efootbase tập trung data, `/community` 404), Skills page 67 skills (Showtime 23 + Classic 44, 3 skill types: Stat boost 18 / Outcome 26 / Animation 18), API needs X-API-Key (gated, returns 401 without, hardcode in APK `.env` — DO NOT use), robots.txt blocks 13+ AI bots + Disallow /api/, build stamp in footer (`Build 8d9068b · 2026-10-05 12:45 UTC` example), 18 locales via path prefix, iOS id6759371167, Android com.wildpluto.efbase, tagline "The eFootball 2027 Player Database".

efootbase **web UI renders cards via LAYERED COMPOSITE** (4 layers: background `{CardType}.webp` + face `cdn.assets.efootbase.com/eFPlayers/players/{PID}/{transparent,dynamic}.webp` + frame `{CardType}_Frame.webp` + condition badge SVG), NOT a single baked image. The API `card_images` object DOES contain pesdb.net URLs for front/back/mobile/compact/portrait, but the **web frontend does NOT use pesdb for display** — those URLs are legacy API payload, frontend uses its own layered render with DO Spaces WebP. eFootBase APK: Flutter app, .env hardcodes EFBASE_API_KEY + WIREDASH/DEEPL/KLIPY, API at api2.efootbase.com + strapi.efootbase.com, also renders cards via layered assets (static_backgrounds per year per card type + animated_backgrounds + tiers + linkup_styles + flags subdirs + frames), database/players.db is 0-byte placeholder (downloaded at runtime), 200+ SVG icons revealing full feature vocabulary, card front/back/mobile/compact/portrait in API payload point to **pesdb.net**.

## Stack kỹ thuật (web) — VERIFIED 2026-10-06

| Khía cạnh | Giá trị | Verification |
|---|---|---|
| Framework | Next.js + Turbopack + RSC (`has_turbopack: true`, `has_webpack: false`, `self.__next_f.push` RSC markers, header `x-powered-by: Next.js`) | VERIFIED |
| Theme | Dark (mặc định) | VERIFIED |
| Font | **Inter** (`font-family: "Inter, \"Inter Fallback\""`) — same as efhub, no custom eFootball fonts | CORRECTED (not "system sans") |
| Field naming | **snake_case** (raw datamine, không normalize) in API/RSC; Title Case in UI labels; camelCase in RSC display mapping | VERIFIED |
| API | Key-gated (`X-API-Key` header), `api2.efootbase.com/api/players` returns **401** without key. Response: `{"error":"Unauthorized","detail":"Valid API key required..."}` | VERIFIED (401 confirmed) |
| Public API endpoints (no key) | `api2.efootbase.com/api/home/comments-feed` (200), `strapi.efootbase.com/api/creator-spotlights/active` (200) — both public | VERIFIED |
| Auth (web) | None — no "Sign in" button, auth is app-only | CORRECTED |
| i18n | **18 locales** (path prefix): en (default, no prefix), de, es, it, fr, pt-PT, pt-BR, tr, uk, be, ru, ja, ko, ar, zh-CN, id, ms, th | CORRECTED (was "16") |
| Hosting | Cloudflare + DigitalOcean Spaces (cdn.assets.efootbase.com). Headers: `server: cloudflare`, `x-rgw-object-type: Normal`, `x-amz-request-id`, `x-do-cdn-uuid`. Also `uflhub-cdn.fra1.cdn.digitaloceanspaces.com` (user uploads), `react-circle-flags.pages.dev` (country flag SVGs) | VERIFIED |
| Card count | "of 45,000" in pagination (likely 45k player card variants, not 450k) | CORRECTED (was "450k+") |
| robots.txt | Blocks 13+ AI bots: GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot, ChatGPT-User, OAI-SearchBot, Claude-Web, Meta-ExternalAgent, FacebookBot, Bytespider, Omgilibot, Diffbot, PerplexityBot, YouBot, Applebot-Extended, cohere-ai, Amazonbot. `Disallow: /api/`, `Disallow: /*?*`, `Disallow: /en-US`. Sitemap declared. | VERIFIED + expanded |
| Build stamp | Footer: `Build 8d9068b · 2026-10-05 12:45 UTC` (git short hash + UTC timestamp, changes per deploy) | VERIFIED (real format, not generic) |
| Tagline | Footer: "The eFootball 2027 Player Database" | CORRECTED (was "2026") |
| iOS / Android | iOS `id6759371167`, Android `com.wildpluto.efbase` | VERIFIED |

## Stack kỹ thuật (eFootBase APK)

| Khía cạnh | Giá trị |
|---|---|
| Framework | Flutter (com.wildpluto.efbase — **"wildpluto"** not "nova" like eFHUB) |
| Bundle | 13+ dex (Flutter AOT), assets in `assets/flutter_assets/` |
| Config | `assets/flutter_assets/.env` — hardcodes API keys |
| API | `api2.efootbase.com/api/players` (+teams, packs, meta, home/comments-feed, user-profiles) + `strapi.efootbase.com/api/creator-spotlights/active` |
| Analytics | Firebase + Crashlytics + RemoteConfig |
| Card render | **Layered assets** (background + frame + photo overlay), Flutter-drawn |
| Card images | Backgrounds `assets/cards/static_backgrounds/{CardType}_{Year}.png` (e.g. `Epic_2025.png`, `Highlight_2025.png`) |
| Frames | `assets/cards/frames/{boosterColor}.svg` per booster |
| Player render | `cdn.assets.efootbase.com/eFPlayers/players/{PlayerID}/{transparent,dynamic}.webp` + Firebase Storage `efootbase.firebasestorage.app` |
| Emblem | `cdn.assets.efootbase.com/eFPlayers/emblems/{sha256hash}.png` (hash, không deterministic → phải qua API) |
| Card front/back/mobile/compact/portrait | **trỏ sang pesdb.net** — `https://pesdb.net/assets/img/card/{m|b|f|c|p}{PlayerID}.png` |
| Local DB | `database/players.db` — 0-byte placeholder, downloaded at runtime |
| 3rd-party SDK | WIREDASH, DEEPL, KLIPY (extracted from .env) |

## Sitemap (web) — VERIFIED 2026-10-06

| URL | Mục đích | HTTP Status |
|---|---|---|
| `/` | Home — Trending Players, Latest Packs, Creator Spotlight, Comments | 200 |
| `/players` | Player database (browse UI public, API gated) — 24 cards/page, "of 45,000" total, filters Position/Playing Style/Strong Foot/Max OVR/Nationality | 200 |
| `/players/{id}` | Player detail — card render layered + Title Case stats | 200 |
| `/compare` | Compare page | 200 |
| `/skills` | Skills page — 67 skills (Showtime 23 + Classic 44), 3 types, rarity badges | 200 |
| `/packs` | Pack list — Latest Packs by name + date + player cards | 200 |
| `/managers` | **404** — efootbase does NOT have a managers page | 404 |
| `/community` | **404** — no public community (differentiator vs efhub 882k users) | 404 |
| `/articles` | **404** | 404 |
| `/tournaments` | **404** | 404 |
| `/tier-lists` | **404** | 404 |
| `/leagues` | **404** | 404 |
| `/api/*` | API (robots Disallow + needs X-API-Key 401) | 401 without key |

**Only 4 public pages exist**: Players, Compare, Packs, Skills (plus homepage). efootbase is much narrower scope than efhub — pure data site.

## 1. Homepage Sections — CORRECTED 2026-10-06

Home page vertical layout (no standalone hero — header has search input instead):
1. **NO hero section** — goes straight to content. (Prior "Hero" finding was WRONG.)
2. **NO "Player of the Week"** — this section does NOT exist. (Prior finding was WRONG — likely misread of "Trending Players".)
3. **Trending Players** (`<h2>Trending Players</h2>`) — 8 player cards horizontal scroll (e.g. Calafiori 85 LB, Dan Burn 82 CB, Kaká 88 AMF, Davids 87 DMF, Kenan Yıldız 82 CF, Cantona 87 CF, McKennie 81 CMF, Calleri 82 CF)
4. **Latest Packs** (`<h2>Latest Packs</h2>`) — 3 pack sections by name (e.g. "Spanish League Midfielders", "Piemonte BN", "Netherlands"), each with player cards. Date shown (e.g. "Oct 5, 2026"). **NO pack price in UI**. "Show all packs" → `/packs`.
5. **Creator Spotlight** (`<h2>Creator Spotlight</h2>`) — Featured creator (e.g. "Ccontz"). Shows follower count, YouTube link, recent video titles. Source: `strapi.efootbase.com/api/creator-spotlights/active` (public 200).
6. **Comments** (`<h3>COMMENTS</h3>`) — Recent comments feed. Source: `api2.efootbase.com/api/home/comments-feed` (public 200, no key needed).

Game version badge: `"eFootball 2027"` in footer tagline.

## 2. Trending Players (Function) — VERIFIED

- Horizontal scroll row of 8 trending player cards
- Trending = recent search/views/build activity (likely)
- Cards show OVR + position + name + layered card render

→ eflab planned trending — pattern: horizontal scroll + activity-based ranking.

## 3. Latest Packs (Function) — VERIFIED

- Pack sections by name (e.g. "Spanish League Midfielders", "Piemonte BN", "Netherlands")
- Each pack shows player cards inside (not just pack cover)
- **No pack price in UI** (unlike game — efootbase shows pack contents, not cost)
- Date shown per pack (e.g. "Oct 5, 2026")
- "Show all packs" link → `/packs`

→ eflab has `/packs` route (per CLAUDE.md). Pattern: pack sections by name + contained player cards + date, no price display.

## 4. Creator Spotlight (Function) — VERIFIED

- Featured community creator (e.g. "Ccontz")
- Source: `strapi.efootbase.com/api/creator-spotlights/active` (public HTTP 200, NO key needed)
- Shows follower count, YouTube channel link, recent video titles
- Drives creator engagement

→ eflab could implement Creator Spotlight if community is built (deferred until auth + community exist).

## 5. Comments Feed (Function) — VERIFIED

- Homepage section `<h3>COMMENTS</h3>`
- Source: `api2.efootbase.com/api/home/comments-feed` (public HTTP 200, NO key needed)
- Recent comments — content loaded client-side

→ eflab could implement Comments on player detail + home section.

## 6. Skills Page (Function — 67 skills, 3 types) — CORRECTED 2026-10-06

efootbase has dedicated `/skills` page (khác pesdb/efhub). 67 skills:
- **Showtime skills**: 23 (recent additions, animation-driven category)
- **Classic skills**: 44 (older, stat-boost + outcome category)
- **3 skill types** (badge labels on each skill):
  1. **Stat boost** — 18 skills, passive +N to specific stat
  2. **Outcome** — 26 skills, affects match outcomes (e.g. one-touch pass)
  3. **Animation** — 18 skills, triggers visual animation (Showtime skills)
- **Rarity badges**: Ultra rare / Rare / Common
- **Skill count per skill** (e.g. "155 cards" = how many player cards have that skill)

### Skill data structure — VERIFIED
- Skill icon URL: **`https://efootbase.com/icons/skills/Skill_{Name}.webp`** — SELF-HOSTED WebP, NOT efimg.com, NOT b-cdn. (Prior efimg/b-cdn finding was WRONG — those are eFHUB patterns, not efootbase.)
- **NO video on skill pages** — no `<video>` element. Skill detail shows: icon, description, type badge, rarity badge, "Top cards" (player cards with that skill).
- Skill slug URL: `/skills/{slug}` (e.g. `/skills/momentum-dribbling`)

### Skill card HTML pattern (from inspect)
```html
<div class="card card--secondary" id="momentum-dribbling">
  <a href="/skills/momentum-dribbling">
    <img src="/icons/skills/Skill_MomentumDribbling.webp" ...>
  </a>
  <div class="card__header">
    <h3><a href="/skills/momentum-dribbling">Momentum Dribbling</a></h3>
    <span style="color:oklch(90.70% 0.2442 130.10)">Stat boost</span>  <!-- type, oklch color -->
    <span>Ultra rare</span>                                              <!-- rarity -->
    <span>155 cards</span>                                              <!-- card count -->
  </div>
  <p>Allows players to keep tight control of the ball...</p>
</div>
```

→ eflab should add `/skills` page (currently per CLAUDE.md, eflab focuses on players/managers/packs/compare/tier-list/tournaments — skills page is opportunity). Data available in efhub SQLite skill flag columns. Self-host skill icons as WebP (don't depend on efimg for skills — that's eFHUB only).

## 7. Field Naming (snake_case — datamine-raw) — VERIFIED

efootbase exposes raw Konami datamine field names (snake_case) in API/RSC payload, không normalize:
```python
{
  "player_id": "...",
  "player_card_id": "...",
  "offensive_awareness": 85,
  "defensive_awareness": 78,
  "ball_control": 90,
  "tight_possession": ...,
  "ball_resistance": ...,
  "time_added": ...,
  "card_images": {...},
  "emblem_images": {...},
  ...
}
```

- **UI display labels**: Title Case ("Offensive Awareness", "Ball Control", "Tight Possession")
- **RSC payload**: cả snake_case (raw) lẫn camelCase (display mapping) đều present
- **API**: snake_case raw

vs efhub (camelCase normalized): `{ playerId: "...", offensiveAwareness: 85, ... }`

→ eflab hiện dùng Prisma + Zod (packages/shared). Keep camelCase normalized for API, but acknowledge raw snake_case origin in fixtures. See `docs/efootbase-efhub-features.md` § field-name comparison.

## 8. API (key-gated — không dùng được) — VERIFIED 2026-10-06

- Endpoint: `https://api2.efootbase.com/api/players?page=N`
- WITHOUT key → **HTTP 401**: `{"error":"Unauthorized","detail":"Valid API key required. Send X-API-Key header or Authorization: Bearer <key>."}`
- WITH key (hardcode in APK `.env` as `EFBASE_API_KEY`) → 200, 176 field/player, includes `card_images` + `emblem_images` URLs
- robots.txt: `Disallow: /api/` (/api/ not for crawlers, only app)

### Public API endpoints (NO key needed) — CORRECTED
- `api2.efootbase.com/api/home/comments-feed` → **HTTP 200** (homepage comments, public)
- `strapi.efootbase.com/api/creator-spotlights/active` → **HTTP 200** (Creator Spotlight, public)
- These 2 are public — the rest of `api2.efootbase.com/api/*` needs key

→ eflab **does not call** the gated API. Data comes from efhub SQLite (Path E, see [[efhub-cdn-datapath]]). Don't reintroduce efootbase API without user permission. See [[bno-bot-data-decision]] Path B rejected.

## 9. robots.txt (anti-AI scraping) — VERIFIED + expanded

```
User-Agent: *
Allow: /compare
Allow: /de/compare
Allow: /es/compare
... (18 locale compare paths)
Disallow: /api/
Disallow: /*?*
Disallow: /en-US

User-Agent: GPTBot
Disallow: /
User-Agent: ChatGPT-User
Disallow: /
User-Agent: OAI-SearchBot
Disallow: /
User-Agent: ClaudeBot
Disallow: /
User-Agent: Claude-Web
Disallow: /
User-Agent: anthropic-ai
Disallow: /
User-Agent: Google-Extended
Disallow: /
User-Agent: CCBot
Disallow: /
User-Agent: Meta-ExternalAgent
Disallow: /
User-Agent: FacebookBot
Disallow: /
User-Agent: Bytespider
Disallow: /
User-Agent: Omgilibot
Disallow: /
User-Agent: Diffbot
Disallow: /
User-Agent: PerplexityBot
Disallow: /
User-Agent: YouBot
Disallow: /
User-Agent: Applebot-Extended
Disallow: /
User-Agent: cohere-ai
Disallow: /
User-Agent: Amazonbot
Disallow: /

Sitemap: https://efootbase.com/sitemap.xml
```

→ 13+ AI bot blocks. eflab can crawl efootbase for personal single-user analysis (polite rate) but **NOT dump** (Path B rejected). eflab itself can adopt this `robots.txt` anti-AI pattern if it wants to block AI training.

## 10. Card Rendering — WEB UI LAYERED COMPOSITE (correction chính)

efootbase **web UI render card bằng 4 layer composite**, không phải 1 ảnh baked. Đây là correction quan trọng — doc cũ ghi "card front/back → pesdb.net" là sai (đó là API payload, không phải UI):

### Layer 1: Background (per card type)
```
https://efootbase.com/images/card-backgrounds/{CardType}.webp
  e.g. Big_Time_WC_26.webp, Epic_2025.webp, Highlight_2025.webp, ...
```
CSS class: `.pcb__background`

### Layer 2: Face / Player photo
```
https://cdn.assets.efootbase.com/eFPlayers/players/{PlayerCardID}/transparent.webp
  (or dynamic.webp for some)
```
CSS class: `.pcb__face`

### Layer 3: Frame
```
https://efootbase.com/images/frames/{CardType}_Frame.webp
  e.g. Big_Time_WC_26_Frame.webp
```
CSS class: `.pcb__frame`

### Layer 4: Condition badge
```
https://efootbase.com/icons/conditions/condition_{letter}.svg
  e.g. condition_b.svg (condition A-E)
```
CSS class: `.pcb__condition-img`

### emblem images
```
https://cdn.assets.efootbase.com/eFPlayers/emblems/{sha256hash}.png
```
(hash, không deterministic từ DB → phải qua API)

### API `card_images` object (payload, NOT used by UI)
```json
"card_images": {
  "front": "https://pesdb.net/assets/img/card/f{PID}.png",
  "back":  "https://pesdb.net/assets/img/card/b{PID}.png",
  "mobile": "https://pesdb.net/assets/img/card/m{PID}.png",
  "compact": "https://pesdb.net/assets/img/card/c{PID}.png",
  "portrait": "https://pesdb.net/assets/img/card/p{PID}.png",
  "dynamic": "https://cdn.assets.efootbase.com/eFPlayers/players/{PID}/dynamic.webp",
  "transparent": "https://cdn.assets.efootbase.com/eFPlayers/players/{PID}/transparent.webp"
}
```
→ API returns pesdb.net URLs for front/back/mobile/compact/portrait (legacy), NHƯNG **UI chỉ dùng transparent/dynamic từ DO Spaces** để compose layered render. pesdb URLs trong API payload không được web frontend sử dụng.

→ **eflab NOT copying this pattern** (per CLAUDE.md: eflab uses efimg.com baked card images + CSS 3D, see [[eflab-web-image-pipeline]]). Layered render là reference technique — dùng khi cần card động (booster swap, condition swap) mà không cần pre-render mỗi combination.

## 11. eFootBase APK Card Rendering (layered assets — mobile, Flutter)

eFootBase APK (Flutter, com.wildpluto.efbase) cũng render card bằng layered assets (nhưng bundle trong app, không tải động như web):

### assets/flutter_assets/assets/cards/ subdirs (verified 2026-10-06)
- `static_backgrounds/` — per card type per year: `Big_Time_2025.png`, `Big_Time_2026.png`, `Big_Time_2027.webp`, `Epic_2025.png`, `Epic_2026.png`, `Epic_30th_Anniversary.png`, `POTD_WC_26.png`, `Show_Time_2023.png`-`Show_Time_2026.png` ...
- `animated_backgrounds/` — animated variants
- `tiers/` — tier frame overlays
- `linkup_styles/` — linkup/booster style overlays
- `flags/` — country flag SVGs
- `frames/` — frame SVGs (per booster color)

### Differences vs web
| | efootbase WEB | efootbase APK |
|---|---|---|
| Backgrounds | `efootbase.com/images/card-backgrounds/{CardType}.webp` (server) | `assets/cards/static_backgrounds/{CardType}_{Year}.png` (bundled) |
| Frame | `efootbase.com/images/frames/{CardType}_Frame.webp` | `assets/cards/frames/{boosterColor}.svg` |
| Face | `cdn.assets.efootbase.com/eFPlayers/players/{PID}/transparent.webp` | same (downloaded) |
| Local DB | n/a | `database/players.db` — 0-byte placeholder (downloaded at runtime, verified) |
| Card render | Flutter composition (faster, offline-capable) |

### Result
Card động: change booster color → frame SVG swap; change card type → background PNG swap. Miễn phí compose, không cần pre-render mỗi combination.

→ eflab NOT doing this (per CLAUDE.md "Don't introduce Three.js/WebGL for cards — CSS 3D transforms are intentional"). eflab uses efimg.com baked card images (post-baked). Layered approach là alternative nếu eflab muốn card động với booster swap, but adds complexity. **Reference only — not implementing.**

## 12. 200+ SVG Icons — Full Feature Vocabulary (APK)

eFootBase APK contains 200+ SVG icons revealing planned/realized features (even if not all on web yet):
| Icon set | Features revealed |
|---|---|
| Progression categories | 10 paths: AerialStrength/Defending/Dexterity/Dribbling/GK1/GK2/GK3/LowerBodyStrength/Passing/Shooting (see §22.5) |
| Condition badges (11) | `condition_a/b/c/d/e.svg` (exponential decay contract) + `form_a/b/c/d/e.svg` (form variants) + `max_level_placeholder.svg` |
| Boosters (5) | `Booster2.png` `Booster3BigTime.png` `Booster3POTW.png` `Booster4.png` `BoosterDisabled.png` |
| Skin bonuses (5) | cosmetic skin system (icon dir exists, content TBD) |
| Biometric login | FaceID/TouchID (confirmed `USE_BIOMETRIC` permission + `fingerprint.svg`) — app-only |
| Pro/Dev badges | `dev_profile_settings_manager` + Pro subscription (`PaywallActivity` RevenueCat) |
| My builds | Saved builds private + community (`MyBuildsPage`, `CommunityBuildsPage`) |
| Compare | Full compare with export to image (app-only) |
| League | league filter icons (via DigitalOcean CDN `/UFLHub/Icons/Leagues/`) |
| Creator spotlights | spotlight creator card + video tile (web shares this) |
| Skill icons (67 WebP) | bundled locally in APK (matches web's 67 skill pages) |
| Languages (21) | language flag SVG icons matching 18 locales |
| Social logos (7) | facebook/instagram/threads/tiktok/twitch/x/youtube |
| Player parameters (9) | body model parameters (neck/shoulder/body proportions) |
| Managers portrait dir | `images/managers/` (web `/managers` 404 — APP-ONLY content!) |

> **CORRECTION 2026-10-06 (deep extract)**: §12 trước ghi "Meme generator | social feature (create memes with cards)" — **SAI**, không có meme generator trong libapp.so. Chỉ có 5 `skin_bonuses` icons, đó là skin cosmetic system, không phải meme. eFHUB có Card Creator + AI Video — eFootBase KHÔNG có. See §22.10.

→ eflab feature vocabulary reference. Many overlap with efhub (compare, builds, league, creator spotlights). Novel cho eFootBase app (vs web): biometric, World Cup supporter, GIF comments (Klipy), comment auto-translate (DeepL), Creator/Following ratings distribution, adblock detection, animated card backgrounds, RevenueCat Pro. See §22.9 full diff.

## 13. API card_images payload → pesdb.net (CORRECTED context)

API `card_images` object contains pesdb.net URLs for front/back/mobile/compact/portrait:
```
https://pesdb.net/assets/img/card/{m|b|f|c|p}{PlayerID}.png
  m = mobile/mini, b = back, f = front, c = compact, p = portrait
```
**NHƯNG** — chỉ là API payload legacy. Web UI KHÔNG dùng pesdb images; UI dùng layered render với `cdn.assets.efootbase.com/eFPlayers/players/{PID}/{transparent,dynamic}.webp` (see §10). APK cũng dùng layered render (see §11). pesdb URLs tồn tại trong API để client nào cần 1 ảnh baked (no compose).

→ eFootBase confirms pesdb.net card pattern public + reused by other apps (cross-reference for bno bot, not eflab). eflab uses efimg.com (not pesdb) per [[eflab-web-image-pipeline]] — but this validates pesdb pattern as industry-wide fallback (bno uses pesdb directly).

## 14. Build Stamp (footer) — VERIFIED real format

efootbase footer has build stamp với git short hash + UTC timestamp (changes per deploy, không generic):
```
Build 8d9068b · 2026-10-05 12:45 UTC
© 2026 · "The eFootball 2027 Player Database" · Made by Wild Pluto
```
Footer sections: Browse (Players/Compare/Packs/Skills), Community (Send feedback → efbaza.featurebase.app), Social (X/Instagram/Discord/Facebook).

AI training prohibition notice:
> "Use of this content to train, fine-tune, or develop artificial intelligence, machine learning models, or large language models is expressly prohibited without prior written consent."

→ eflab could add build stamp (Next.js build hash + git commit short + UTC timestamp) for transparency/debugging.

## 15. Color & Typography DNA — VERIFIED

- **Dark theme** (mặc định, matches efhub #13151d family — cùng Wild Pluto)
- **Font**: Inter (`font-family: "Inter, \"Inter Fallback\""`) — same as efhub body, NO custom eFootball fonts (less authentic than efhub eFootballStencil/eFootballSans)
- Tailwind-like utility classes, dynamic per Next.js RSC

## 16. Header / Navigation — VERIFIED

- Nav (desktop): Players, Compare, Packs
- **Skills NOT in header** — only in footer "Browse" section
- Header actions: Menu (mobile), Search input (placeholder "Search players", ⌘K shortcut, `aria-label="Search players"`), Language switcher, App Store link (iOS id6759371167), Google Play link (Android com.wildpluto.efbase)
- **NO "Sign in" button** — no auth UI on web, auth is app-only

## 17. i18n — VERIFIED

- **18 locales** (path prefix): en (default, no prefix — `/en` redirects to `/`), de, es, it, fr, pt-PT, pt-BR, tr, uk, be, ru, ja, ko, ar, zh-CN, id, ms, th
- `<html lang="de">` on `/de`, etc.
- German page title confirmed: `"eFootBase — eFootball-Spielerdatenbank, Wertungen & Builds"`

## 18. Điểm khác biệt chiến lược vs eflab — VERIFIED

| Đặc điểm | efootbase | eflab (hiện tại) | Nên copy? |
|---|---|---|---|
| Skills page (67 skills, 3 types + rarity) | có | không | **copy** — eflab opportunity |
| Creator Spotlight | có | planned | copy (deferred until community) |
| Comments feed (home section) | có | planned | copy |
| ~~Player of the Week~~ | **KHÔNG có** | n/a | (was wrong) |
| Trending Players | có | planned | copy |
| Latest Packs (no price, by name) | có | có (`/packs`) | giữ, copy no-price pattern |
| Layered card render (web + APK) | có | không (efimg.com baked 2D) | **không** (CSS 3D enough) |
| 200+ feature icons (APK vocabulary) | có | n/a | reference vocabulary |
| snake_case fields (raw) | có | camelCase (Prisma/Zod) | giữ eflab normalized |
| Key-gated API (401 without key) | có | không (use efhub SQLite) | **không** (ToS risk) |
| Public comments-feed + creator-spotlights API | có | không | **copy** (no-key public pattern) |
| robots.txt 13+ AI bot blocks | có | chưa | optional (anti-AI for eflab) |
| Build stamp (git hash + UTC) | có | không | **copy** — small, useful |
| 18 locales path-prefix i18n | có | chưa | copy if i18n |
| Inter font only (no eFootballStencil) | có | Inter only | (cùng) — consider efhub fonts |
| Auth (web) | KHÔNG (app-only) | planned | giữ eflab auth |
| `/managers` | **404** (no managers!) | có | giữ (eflab có) |
| `/compare`, `/skills`, `/packs` | có | planned/có | align |

## 19. Files / Assets quan trọng

- `playbooks/efootbase.com.md` — playbook tóm tắt
- `docs/efootbase-efhub-features.md` — feature inventory (predecessor of this doc)
- `docs/efootbase-apk-analysis.md` — eFootBase APK detailed analysis (Flutter + .env + endpoints)
- Screenshots: `/tmp/efootbase_reinspect/` (home_full, skills, players, player_detail, packs, footer, robots — VERIFIED 2026-10-06)
- Screenshots: `/tmp/efootbase_shots/` (legacy, pre-reinspect)
- `memory/bno-bot-data-decision.md` — Path B (efootbase API) rejected decision

## 20. Actionable cho eflab (priority order)

1. **Add `/skills` page** — 67 skills (Showtime 23 + Classic 44), 3 types (Stat boost 18 / Outcome 26 / Animation 18), rarity badges (Ultra rare/Rare/Common), card count per skill. Data from efhub SQLite skill flag columns. **Self-host skill icons as WebP** (`/icons/skills/Skill_{Name}.webp` pattern — NOT efimg.com, that's eFHUB only). Skill card HTML pattern documented in §6.
2. **Trending Players row** — homepage horizontal scroll of 8 player cards, activity-based (eflab planned)
3. **Latest Packs section** — homepage, pack sections by name + contained player cards + date, **NO price display** (eflab has `/packs` route, surface on home)
4. **Creator Spotlight** — homepage featured creator (follower count, YouTube link, recent video titles). Source pattern: public API (no auth needed). Deferred until eflab has community.
5. **Comments feed on home** — homepage section `<h3>COMMENTS</h3>`, eflab implement via tRPC (own, no external API)
6. **Build stamp in footer** — git short hash + UTC timestamp (real format `Build 8d9068b · 2026-10-05 12:45 UTC`):
   ```tsx
   <footer>
     Build {process.env.NEXT_PUBLIC_GIT_SHA} · {buildDate UTC}
     © 2026 eflab · Not affiliated with Konami
   </footer>
   ```
7. **robots.txt anti-AI** — copy 13+ bot blocks if eflab doesn't want AI training. Note: efootbase also adds AI training prohibition notice in footer text — consider for eflab:
   > "Use of this content to train, fine-tune, or develop artificial intelligence, machine learning models, or large language models is expressly prohibited without prior written consent."
8. **Layered card render** — **reference only**, not implementing (eflab uses efimg.com baked images + CSS 3D per [[eflab-web-image-pipeline]]). But note: efootbase web + APK both use layered; if eflab ever wants card-dynamic (booster/condition swap without pre-render), this is the technique (background `{CardType}.webp` + face `transparent.webp` + frame `{CardType}_Frame.webp` + condition SVG).
9. **200+ feature icon vocabulary** — reference for future feature brainstorm (meme generator, biometric, card collection inventory)
10. **i18n 18 locales** — path-prefix i18n pattern (deferred, heavy lift)
11. **`/compare`, `/skills`, `/packs` public** — eflab has `/compare`, `/packs`; add `/skills` (efootbase pattern). eflab has `/managers` (efootbase 404 — eflab broader, keep)
12. **Public comments-feed + creator-spotlights pattern** — endpo`api2.efootbase.com/api/home/comments-feed` + `strapi.efootbase.com/api/creator-spotlights/active` are public no-key. eflab implement own via tRPC, but pattern: don't gate community-display endpoints, only gate write/mutation endpoints.

## 21. What NOT to do (per project decisions)

- **DON'T call efootbase gated API** (`api2.efootbase.com/api/players` etc.) — key hardcode in APK `.env`, ToS risk, Path B rejected ([[bno-bot-data-decision]]). Returns 401 without key.
- **DON'T dump efootbase data** — same reason
- **DON'T copy snake_case fields into eflab** — eflab uses camelCase normalized (Prisma + Zod). snake_case chỉ là raw source, normalize lúc ingester.
- **DON'T introduce layered card rendering** — eflab intentional uses efimg.com baked + CSS 3D (per CLAUDE.md). Layered là reference only.
- **DON'T use efimg.com for skill icons** — that's eFHUB pattern. efootbase self-hosts skill icons as WebP. eflab should self-host or use a different CDN (skills là unique efootbase, không có efimg pattern).
- **DON'T conflate eFootBase (Wild Pluto, Flutter, com.wildpluto.efbase, API key) with eFHUB (Nova, RN, com.nova.peshub22, CDN JSON no-key)** — both by Wild Pluto but different tech + image strategies. See CLAUDE.md "Don't conflate the two".
- **DON'T use pesdb images for eflab web** — that's bno bot only ([[bno-bot-data-decision]]). eflab web uses efimg.com ([[eflab-web-image-pipeline]]). efootbase API chứa pesdb URLs but UI doesn't use them — don't copy that confusion.

## 22. eFootBase APK — Mobile Function Breakdown (Deep Extract 2026-10-06)

> **Phương pháp:** Unzip `.xapk` → `base.apk` (Flutter AOT) + `config.arm64_v8a.apk` (libapp.so 16MB, libflutter.so 11MB). `strings -n 5 libapp.so` → 43.942 dòng. Androguard decode `AndroidManifest.xml`. List `assets/flutter_assets/assets/` tree. Dart source-path strings reveal full clean-architecture feature map (`/<feature>/<layer>/<file>.dart`).
> Lưu ý: Flutter AOT không có JS bundle như RN — toàn bộ UI text bị tree-shake vào machine code; chỉ còn asset path strings + a few literals. IQ function flows infer từ **Dart class/file names** (đầy đủ vì Dart preserve symbol cho stack trace), không phải từ verbatim button labels.

### 22.1 — Screen / Page inventory (extracted từ Dart class symbols)

Clean-architecture feature folders, mỗi feature có `/presentation/`, `/blocs/`, `/models/`, `/providers/`. Routes qua `go_router` (có `CustomTransitionPage`, `MaterialPage`, `NoTransitionPage`, `FadeForwardsPage`).

| Page class | Feature folder | Function |
|---|---|---|
| `HomePage` | `/home/presentation/pages/home_page.dart` | Home — Trending + Latest Packs + Creator Spotlight + Comments feed |
| `HomeAllPacksPage` | `/home/presentation/pages/home_all_packs_page` | "Show all packs" full list |
| `HomeSearchPage` | `/home/presentation/pages/home_search_page` | Global search (players/teams/packs) |
| `PlayersDatabasePage`, `PlayersPage` | `/players` | Browse database (24 cards/page, "of 45.000", filters Position/Style/Foot/Max OVR/Nation) |
| `PlayerProfilePage` | `/player_profile` | Player detail — card render layered + stats + ratings + comments + skills + builds + other versions + similar |
| `OtherVersionsPage` | `/player_other_versions` (inferred) | Other card versions of same player |
| `SimilarPlayersPage` | `/player_similar` (inferred) | Similar players (efootbase analog pesdb "Find Similar") |
| `ComparePage`, `AddPlayerPage` | `/compare/presentation/` | Compare 2 players, add via `AddPlayerPage` |
| `PackPlayersPage` | `/packs` (inferred) | Pack → players list inside |
| `OverviewPage`, `EfootbaseOverviewPage` | (root) | Onboarding/overview |
| `ProfilePage`, `ProfileTabPage` | `/profile` | My profile — tabbed (Ratings/Builds/Comments) |
| `UserProfilePage`, `UserProfileSearchPage`, `UsersPage`, `FollowProfilesPage`, `FollowRelationshipsPage` | `/users`, `/user_profile_search` | Public user profile + follow graph |
| `ProfileRatingsPage`, `ProfileCommentsPage` | `/profile` sub-pages | User's ratings + comments history |
| `RatingsPage`, `MyBuildsPage`, `CommunityBuildsPage`, `BuildsPage` | `/ratings`, `/more/presentation/pages/my_builds_page` | My + community builds; player ratings |
| `VersionsPage` | `/player_other_versions` (inferred) | Card versions |
| `InboxPage`, `UserNotificationsPage` | `/inbox/presentation/inbox_page` | Notifications inbox (Firebase Messaging) |
| `MorePage` | `/more/presentation/more_page` | Settings/more menu (login, language, delete account, my builds) |
| `InAppYoutubePlayerPage` | `/in_app_youtube` (inferred) | In-app YouTube player (creator spotlight videos) |
| `PreviewPage`, `TopPage` etc. | misc | Various previews |

### 22.2 — Sheets / Dialogs (bottom sheets — extract_POP_FROM_DART)

eFootBase dùng DraggableScrollableSheet heavily (Flutter Material 3 design):

| Sheet class | Function |
|---|---|
| `LoginSheet` | Sign-in with Google (no Apple — eFootBase Android-only?), `/api/auth/google/native` |
| `EditProfileSheet`, `UpdateUsernameSheet`, `DeleteAccountSheet` | Profile edit actions |
| `AttributesFiltersSheet`, `MainParametersFiltersBottomSheet`, `BodyModelFiltersSheet` | Player search filters (attributes + body model + main params) |
| `EfootbaseSkillsFiltersSheet`, `PlayingStyleFiltersSheet`, `PositionSelectionSheet` | Skill/style/position filters |
| `NationsFiltersSheet`, `LeagueFiltersSheet`, `LeaguesFiltersSheet`, `TeamFiltersSheet`, `CountryPickerSheet` | Geography filters |
| `SearchFiltersSheet`, `MainFiltersSheet`, `FilterPlayersSheet`, `FiltersSheet` | Search + main filters |
| `BoosterSelectionSheet`, `ManagerSelectionSheet` | Progression builder — pick booster + manager |
| `SmartLevelingSheet` | "Smart" auto-level progression (analog efhub "Smart Max Level") |
| `BuildCommentsSheet`, `CommentsSheet`, `PlayerCommentsSheet` | Comments on builds + players |
| `BuildExportSheet`, `CompareExportSheet`, `PlayerCardExportSheet`, `ExportSheet` | Screenshot/export to gallery/share |
| `ShareBuildSheet`, `ShareBuildSkillsPickerSheet` | Share build to community feed + skill picker |
| `ComparedPlayerSkillsSheet`, `PlayerSkillSheet`, `SkillSheet`, `AiPlayingStyleSheet` | Skill detail sheets (compare + player) |
| `PlayerRateSheet`, `RateSheet` | Player rating (community rating feature) |
| `WorldCupSupporterSummarySheet`, `WorldCupSupporterUpsellSheet`, `UpsellSheet` | World Cup supporter mode — pick country, show badge on profile |
| `AdBlockDetectedSheet`, `AdBlockDetectedDialog` | Ad-block detection → prompt disable (Playwire/AppLovin/Mintegral/AppLovin Max/Pangle angry at adblockers) |
| `KlipySheet` | Klipy GIF picker (comments GIF provider) |
| `UserProfileVideoActionsSheet` | User profile video actions (creator spotlight YouTube) |
| `LogoutDialog` | Sign out confirm |

### 22.3 — User flows (inferred từ Dart feature folders + sheet names)

#### Sign-in flow (`/auth/`, `LoginSheet`)
- Google sign-in only (`/api/auth/google/native`, `SignInHubActivity` in manifest, Google Play auth)
- After login: `/api/users/me` + `/api/user-profiles/me` (Strapi) for profile
- Avatar/banner upload: `/api/user-profiles/me/avatar`, `/api/user-profiles/me/banner`
- Follow: `/api/user-profiles/me/follow/{id}`, `/api/user-profiles/me/follow-status/{id}`
- Pro sync: `/api/user-profiles/me/pro-sync` (RevenueCat Android subscription cross-sync)
- Delete account: `/api/user-profiles/me/delete-account`
- Dev badges: `dev_profile_settings_manager` (dev profile override)
- NO Apple sign-in (unlike eFHUB) — Android-only app.

#### Player search flow (`PlayersPage`, filter sheets)
- 24 cards/page, "of 45,000" total (matches web)
- Filters: Position (13), Playing Style (offensive+defensive), Stronger Foot, Max OVR, Nationality → through dedicated filter sheets
- Body Parameters filter sheet (player model — neck/shoulder/etc, analog pesdb "Player Model")
- Skills filter sheet (functional skills — analog web Skills page)
- `home_search_provider` (Riverpod) drives search state.

#### Player detail flow (`PlayerProfilePage`)
- Layered card render (background + face + frame + condition — see §10/§11)
- Tabs/sections: stats (Title Case labels), `player_ratings_*` (community rating distribution + your rating), `player_comments_section` (comments), skills (`SkillSheet`), builds (`PlayerCommentsSection`), `OtherVersionsPage`, `SimilarPlayersPage`.
- `player_your_rating_card` + `player_your_rating_prompt_emoji_burst` — emoji-driven rating CTA.

#### Compare flow (`ComparePage`, `AddPlayerPage`, `/compare/...`)
- 2-player compare (`compare_two_player_layout`)
- Add player via `AddPlayerPage` with 4 preview modes: **Trending / Highest-to-Lowest / Lowest-to-Highest / New Cards** (`compare_players_preview/` sheets)
- Slider for level (drag to set, `compare_slider_pointer_utils`)
- Stat attributes by position: **Outfield** (`compare_efootbase_attributes`), **GK** (`compare_goal_keeper_attributes`), **Other positions** (`compare_other_positions_attributes`)
- Body physics compare (`compare_two_players_body_physics`)
- Booster pills section (`compare_booster_pills_section`)
- Skills comparison (`compared_player_skills`, `compared_player_skills_sheet`)
- Position proficiency pitch block (`compare_position_proficiency_pitch_block`)
- Playstyle label (`compare_playing_style_label`)
- Upgrade bottom bar (`compare_upgrade_bottom_bar`) + `add_player_to_compare_button`
- **Compare export**: full screenshot render pipeline (`compare_export_*`) — coordinator + renderer + player columns + progression summary capsule + name/playstyle header → save to gallery OR share.

#### Progression / build flow (`/builds` inferred, `ShareBuildSheet`, `BuildExportSheet`)
- Save build locally + sync to Strapi `/api/user-profiles/me`
- Export to image (PNG): toggles `build_export_image_format`, `export_background`, `export_include_body_physics`, `export_username_visible`, `build_export_title`, `build_export_include_body_physics`.
- Share build to community feed (`ShareBuildSheet`, `community_build_summary_share`, `community_build_display_ovr_calculator`)
- Smart leveling (`SmartLevelingSheet`) — auto-set level like eFHUB "Smart Max Level".
- Booster + manager selection (`BoosterSelectionSheet`, `ManagerSelectionSheet`).

#### Community / feed / comments flow (`/comments/`, `home_comments_feed_section`)
- Homepage Comments section (`home_comments_feed_section`) — public, no key (api2.efootbase.com/api/home/comments-feed)
- Player comments (`player_comments_section`, `player_comments_sheet`)
- Build comments (`build_comments_sheet`)
- Threaded (`comment_thread_shell`, `comment_thread_fold`)
- **GIF comments**: Klipy SDK (`comment_gif_picker`, `comment_gif_inline_ad` — Klipy shows ads inline in GIFs)
- Voting (`comment_vote_action`, `comment_vote_controls`)
- Sort tabs (`comments_sort_tabs`)
- **Auto-translate**: DeepL + Google backends (`comment_translation_service`, `deepl_comment_translation_backend`, `google_comment_translation_backend`)
- Edge fade + custom scroll physics (`comment_list_edge_fade`, `comment_list_scroll_physics`).

#### Creator Spotlight flow (`/home/.../creator_spotlight/`)
- Public API: strapi.efootbase.com/api/creator-spotlights/active (no key)
- Section on home (`home_creator_spotlight_section`)
- Spotlight creator card (`spotlight_creator_card`) + video tile (`spotlight_video_tile`)
- In-app YouTube player (`InAppYoutubePlayerPage`)
- YouTube IFrame API embed (strings confirm onReady/onStateChange/VideoData handlers)

#### Skills flow (`/skills/`, `EfootbaseSkillsFiltersSheet`)
- 67 skill WebP icons at `assets/icons/skills/` (list in §22.5)
- Skill card body (`efootbase_skill_card_body`)
- Filter by type via `EfootbaseSkillsFiltersSheet`
- Links from player detail SkillSheet to skill page.
- Self-hosted WebP, NOT efimg (matches web §6).

#### Ratings flow (`/ratings/`, `player_ratings_*`)
- **Two-tier KOL/community rating**: **Creator ratings** + **Following ratings** (`player_creator_ratings_section`, `player_following_ratings_section`) — separate avatar tiles.
- Distribution row (`player_rating_distribution_row`, `player_ratings_distribution_panel`)
- Summary card (`player_rating_summary_card`)
- Your rating card (`player_your_rating_card`) with emoji burst prompt.
- Profile ratings: sort/coordinator (`profile_ratings_more_menu_coordinator`, `user_profile_ratings_filter_chip`).

#### World Cup supporter flow (NO web equivalent — app-only!)
- `WorldCupSupporterSummarySheet` + `WorldCupSupporterUpsellSheet`
- `fetchWorldCupCountries` (`_refreshWorldCupCountries`)
- `WorldCupSupporterAvatarFrameState`, `WorldCupSupporterProBadgeFoilBackgroundState`, `WorldCupSupporterProfileSyncListenerState` — pick WC country → avatar frame + Pro foil badge on profile.
- Likely gated by Pro subscription (upsell sheet).

#### Inbox / notifications flow (`/inbox/`)
- Firebase Cloud Messaging (`com.google.firebase.MESSAGING_EVENT`, `com.google.android.c2dm.intent.RECEIVE`)
- Inbox page + notification row + unread indicator (`inbox_unread_indicator_provider`)
- Notification navigation coordinator → deep-link to player/build.

#### More / settings flow (`MorePage`, `/more/...`)
- Login sheet (entry to sign-in)
- My Builds page (`my_builds_page` + `my_builds_search_field` + `my_builds_more_menu_coordinator`)
- Language picker (`language_picker`)
- Delete account (`delete_account_sheet`)
- Update username (`update_username_sheet`)
- App section (`app_section`) — links to social (X/IG/Discord/Reddit/Threads/TikTok/Twitch/YouTube — 7 social logos)
- Feature request / bug report → Wiredash (`forms.gle/cYXGnC8zhffBmkA48` + Wiredash SDK)
- `dev_profile_settings_manager` (dev-only override — visible `INCORRECT_DATA_LABEL_ID` `BUG_LABEL_ID` `FEATURE_REQUEST_LABEL_ID` `APP_FEEDBACK_LABEL_ID` for Wiredash).

### 22.4 — Ad management / monetization (Flutter app, NOT web)

| Layer | SDK | Evidence |
|---|---|---|
| Banner | Playwire (`playwire_banner_slot`, `PWFullScreenAdActivity`), AppLovin MAX (`AppLovinFullscreenActivity`, `MaxDebugger*`), Mintegral (`TT*Activity` — Pangea/TikTok), InMobi (`InMobiAdActivity`), Vungle (`VungleActivity`), Pangle (`AppLovinFullscreenImmersiveActivity`), Inneractive (`Inneractive*`), Fyber (`FyberReportAdActivity`), Ogury (`com.ogury.sdk`) | 80+ ad activities in manifest |
| Interstitial | `interstitial_ads_manager`, `interstitial_ad_cooldown`, `playwire_interstitial_bridge` | Cooldown tracker |
| Paywall | `PaywallActivity`, `CustomerCenterActivity` (RevenueCat), `post_ad_paywall_prompter`, `UpsellSheet`, `WorldCupSupporterUpsellSheet` | After-ad upgrade prompt + Pro upsell |
| Ad-block detection | `AdBlockDetectedSheet`, `AdBlockDetectedDialog`, `home_ad_block_prompt_listener` | Detect Pi-hole/AdGuard → prompt disable |
| Klipy GIF comments | `klipy_ads_context_builder`, `klipy_user_agent_provider` (api.klipy.com/api/v1/) | Klipy injects ads into GIF picker |
| Gift/ads report | `AdFeedbackActivity`, `InneractiveInternalBrowserActivity` | User reports broken ads |

→ **NO web equivalent**. eFootBase mobile is **ad-heavy** (8+ networks). Web is ad-free (only robots.txt blocks AI bots). Mobile monetization via ads + RevenueCat Pro (which removes ads).

### 22.5 — Asset vocabulary (asset_path strings)

| Dir | Count | Contents |
|---|---|---|
| `cards/static_backgrounds/` | 17 | `Big_Time_2025.png` `Big_Time_2026.png` `Big_Time_2027.png` `Big_Time_2027_2.webp` `Big_Time_WC_26.webp` `Epic_2025/2026/2027.webp` `Epic_30th_Anniversary.png` `POTD_WC_26.png` `POTD_WC_26_Knockout.jpg` `Show_Time_2023-2026.png/jpg` `Show_Time_2027.webp` `Show_Time_WC_26.png` — per year per card type |
| `cards/animated_backgrounds/` | 18 | animated card bg variants (special card effects — analog eFHUB video backgrounds) |
| `cards/tiers/` | 5 | `LEGEND.png` `T1-T4.png` — tier frame overlays |
| `cards/linkup_styles/` | 2 | linkup-booster frame styles |
| `cards/flags/` | 272 | country flag SVGs |
| `icons/boosters/` | 5 | `Booster2.png` `Booster3BigTime.png` `Booster3POTW.png` `Booster4.png` `BoosterDisabled.png` |
| `icons/conditions/` | 11 | `condition_a/b/c/d/e.svg` + `form_a/b/c/d/e.svg` + `max_level_placeholder.svg` |
| `icons/progression/` | 10 | `AerialStrength` `Defending` `Dexterity` `Dribbling` `GK1` `GK2` `GK3` `LowerBodyStrength` `Passing` `Shooting` — progression category icons (6 outfield + 3 GK + aerial) |
| `icons/skills/` | 67 | Full skill list verbatim (see §6 web): `Skill_AccelerationBurst.webp` `Skill_AcrobaticClearance.webp` ... `Skill_MagneticFeet.webp` `Skill_MarseilleTurn.webp` `Skill_MomentumDribbling.webp` ... — matches web Skills page 67 |
| `icons/skin_bonuses/` | 5 | skin bonus cosmetic system |
| `icons/social_logo/` | 7 | `facebook` `instagram` `threads` `tiktok` `twitch` `x_logo` `youtube` |
| `icons/languages/` | 21 | language flag icons (matches 18 locales + 3 extra) |
| `icons/player_parameters/` | 9 | player model parameter icons (neck/shoulder/body) |
| `icons/player_parameters/nation_flags/` | subset | nationality flag subset |
| `images/frames/` | (dir) | card frames |
| `images/managers/` | (dir) | manager portrait images (web /managers is 404 — app has manager visuals!) |
| `images/` | ~17 | `compare_export_bg.jpg`, `splash_android.png`, `splash_android12.png`, `player_card_default_background.png`, `player_placeholder.png`, `player_profile_background.png`, `user_banner_placeholder.png`, `aurora_grain_tile.png`, `bottom_gradient_mask.png`, `home_tint.png`, `tint.png`, `ad_detect.png`, `splash_screen_bg.png` |

→ **`images/managers/` dir EXISTS in APK** (web `/managers` 404) — confirms app has manager content not on web. Future web route expansion could mirror app.

### 22.6 — API endpoints (complete list from libapp.so)

**api2.efootbase.com (gated `X-API-Key`)**:
- `/api/players` (list), `/api/players/{id}` (detail), `/api/teams`, `/api/packs`, `/api/meta`
- `/api/home/comments-feed` (public, 200, no key)
- `/api/events/views`
- `/api/user-profiles`, `/api/user-profiles/{id}`, `/api/user-profiles/me` (auth), `/api/user-profiles/me/avatar` (POST), `/api/user-profiles/me/banner` (POST), `/api/user-profiles/me/delete-account` (POST), `/api/user-profiles/me/follow/{id}` (POST), `/api/user-profiles/me/follow-status/{id}` (GET), `/api/user-profiles/me/pro-sync` (POST), `/api/users/me` (auth)
- `/api/auth/google/native` (Google OAuth native flow)

**strapi.efootbase.com**:
- `/api/creator-spotlights/active` (public — creator + YouTube videos)
- `/api/user-profiles/`, `/api/user-profiles/{id}` (community profiles — != api2)

**External**:
- `api.klipy.com/api/v1/` — Klipy GIF comments
- `api.wiredash.io/sdk/{ping,sendEvents,sendFeedback,sendPromoterScore,uploadAttachment}` — Wiredash feedback
- `uflhub-cdn.fra1.cdn.digitaloceanspaces.com/UFLHub/Icons/Leagues/` + `/UFLHub/Skills/Functional/` + `/UFLHub/Skills/Stats/` — DigitalOcean CDN for league/skill icons (note: `UFLHub` path, not `efootbase` — shared with sister site? UFL = "UFL hub" another Wild Pluto brand?). Web fetches from `efootbase.com/icons/` (self-host). App bundles 67 skill WebP locally instead.
- `efbase.featurebase.app` — feature/bug roadmap
- `discord.gg/YKdQUpj3cS` — Discord invite
- `forms.gle/cYXGnC8zhffBmkA48` — Google Form for "Incorrect data" feedback label
- Social: `x.com/eFootbase`, `instagram.com/efootbase`, `facebook.com/efootbase`, `reddit.com/r/eFootbase`, `discord.gg/YKdQUpj3cS`

### 22.7 — AndroidManifest (decoded via androguard)

**Main activity**: `MainActivity` (Flutter single-activity). NO custom deep-links registered (no `android.intent.action.VIEW` + `BROWSABLE` scheme) → app does NOT receive efootbase.com URL intents. Self-contained.

**Permissions** (gated subset that reveals flows):
- `USE_BIOMETRIC` + `USE_FINGERPRINT` — **Biometric login** (`assets/icons/fingerprint.svg` confirms UI). NO web equivalent.
- `BILLING` + `com.amazon.inapp.purchasing.NOTIFY` — Amazon Appstore billing + Google Play Billing (multi-store via `ProxyBillingActivity`, `ProxyAmazonBillingActivity`, `SimulatedStoreErrorDialogActivity`). Pro subscription via RevenueCat (`PaywallActivity` + `CustomerCenterActivity`).
- `POST_NOTIFICATIONS` + `com.google.firebase.MESSAGING_EVENT` + `com.google.android.c2dm.intent.RECEIVE` — FCM push notifications
- `WRITE_EXTERNAL_STORAGE` + `READ_EXTERNAL_STORAGE` — gallery save (export card image, build image, compare image)
- `RECORD_AUDIO` (TranscriptScan肚子 — likely ExoPlayer or ad SDK, not voice)
- `AD_ID` + `ACCESS_ADSERVICES_AD_ID` — ad attribution
- `WAKE_LOCK` + `FOREGROUND_SERVICE` + `RECEIVE` — ExoPlayer download service (`com.google.android.exoplayer.downloadService.action.RESTART`)

**Activities breakdown**: only `MainActivity` + ~95 ad/SDK activities (Playwire/AppLovin/Mintegral/Pangle/InMobi/Vungle/Fyber/Ogury/Amazon Billing/RevenueCat/Google SignIn/ExoPlayer). App is **ad-network-heavy** (8+ ad SDKs) — consistent with #22.4.

### 22.8 — `.env` (asset flutter_assets/.env — confirmed key names)

```
WIREDASH_PROJECT_ID=<REDACTED>
WIREDASH_SECRET=<REDACTED>
INCORRECT_DATA_LABEL_ID=<REDACTED>   # Wiredash label for "data incorrect" feedback
BUG_LABEL_ID=<REDACTED>              # Wiredash label for bug reports
FEATURE_REQUEST_LABEL_ID=<REDACTED> # Wiredash label for feature requests
APP_FEEDBACK_LABEL_ID=<REDACTED>    # Wiredash label for app feedback
EFBASE_API_KEY=<REDACTED>            # the key that gates api2.efootbase.com/api/players (401 without)
DEEPL_AUTH_KEY=<REDACTED>           # DeepL API — comment auto-translate
KLIPY_API_KEY_ANDROID=<REDACTED>    # Klipy GIF picker (Android)
#TEST KEY: <redacted>
KLIPY_API_KEY_IOS=<REDACTED>        # Klipy (iOS — plist mirror)
```

**SECURITY**: `EFBASE_API_KEY` hardcode in plaintext in `.env` — DO NOT extract or use. Path B rejected ([[bno-bot-data-decision]]). The TEST KEY line suggests DevOps leak in production `.env` — interesting but not actionable.

### 22.9 — What DIFFERS from web (efootbase.com) — app-only features

| Feature | App | Web | Note |
|---|---|---|---|
| **Biometric login** | YES (`USE_BIOMETRIC`, fingerprint.svg) | NO | FaceID/TouchID for app lock |
| **Comments with GIF (Klipy)** | YES (`comment_gif_picker`) | NO | Klipy injects ads into GIFs |
| **Comment auto-translate (DeepL)** | YES (`deepl_comment_translation_backend`) | NO | DeepL + Google backends |
| **Player rating distribution + Creator/Following ratings** | YES (`player_creator_ratings_*`, `player_following_ratings_*`, `player_ratings_distribution_*`) | NO | App has rich rating UI hidden on web |
| **World Cup Supporter avatar frame + Pro foil badge** | YES (`WorldCupSupporter*`) | NO | Pick WC country → avatar frame, gated by Pro |
| **Ad networks (8+)** | YES (Playwire/AppLovin/Mintegral/Pangle/InMobi/Vungle/Fyber/Ogury) | NO (web ad-free) | App heavy ad-monetized |
| **Pro subscription via RevenueCat** | YES (`PaywallActivity`, `CustomerCenterActivity`, `/api/user-profiles/me/pro-sync`) | NO web paywall | Amazon + Google Play billing |
| **Ad-block detection** | YES (`AdBlockDetectedSheet/Dialog`, `home_ad_block_prompt_listener`) | NO (web has robots.txt AI blocks instead) | App punishes adblock |
| **Inbox / push notifications** | YES (`InboxPage`, FCM) | NO | Firebase Messaging |
| **Builds My page + Search** | YES (`MyBuildsPage`, `my_builds_search_field`) | NO (web `/managers` 404, no builds page) | App-only build management |
| **Manager visuals/content** | YES (`images/managers/` dir, `ManagerSelectionSheet`) | NO (web `/managers` 404!) | App has managers; web doesn't (yet?) |
| **Compare export to image** | YES (`compare_export_*`, `BuildExportSheet`, `CompareExportSheet`, `PlayerCardExportSheet`) | NO | Save card/build/compare to gallery |
| **Share build to community feed** | YES (`ShareBuildSheet`, `community_build_summary_share`) | NO | Web has no community |
| **Smart leveling** | YES (`SmartLevelingSheet`) | NO | Auto-set level like eFHUB Mobile |
| **Creator Spotlight YouTube player** | YES (`InAppYoutubePlayerPage`, IFrame API) | YES (web embed) — shared | Both have spotlight |
| **Skills 67 (icons)** | YES (bundled WebP) | YES (web `/icons/skills/Skill_*.webp`) | Same content, app bundles locally |
| **Wiredash feedback (bug/feature/incorrect-data)** | YES (`WiredashFeedbackFlow`, 4 label IDs) | NO (web has only "Send feedback" link) | App has structured feedback |
| **Profile videos (Strapi)** | YES (`user_profile_video.dart`) | unclear | User profile can include videos |
| **Strapi community profiles** | YES (`strapi.efootbase.com/api/user-profiles/`) | NO | App uses Strapi for community, api2 for game data |
| **Follow graph** | YES (`viewer_follow_state_cache`, FollowRelationshipsPage) | NO | Follow other users |
| **Amazon Appstore billing** | YES (`ProxyAmazonBillingActivity`) | NO | Multi-store Android |
| **Animated backgrounds (18)** | YES (`cards/animated_backgrounds/`) | NO (web uses static webp) | App has animated card bgs |

→ eFootBase **APK is much richer than web** — web is data-only (4 routes), app adds community/ratings/World Cup/biometric/ads/Pro. App is closer to eFHUB mobile in scope, but built in Flutter (different tech).

### 22.10 — What I could NOT extract (transparency)

- **Verbatim UI button labels / empty-state strings**: Flutter AOT tree-shake removes most string literals into machine code (only asset paths + a few literals survive in `libapp.so`). Unlike React Native (Hermes keeps strings), Flutter strings are NOT recoverable from `libapp.so` alone. **Page class names ARE recoverable** (Dart preserves symbols for stack traces) so the function/flow map above is solid; but verbatim text labels ("Sign In", "No players", etc.) are NOT — those live in `.dart` source, not in compiled binary. To get verbatim labels, would need to decompile Dart AOT (dart-decompiler tools exist but low-fidelity) OR grep through `strings.xml` (which has only library boilerplate).
- **Exact bottom-nav item order/labels**: There's no `BottomNavigationBar` literal recoverable (Material 3 uses `NavigationBar`); the bottom-shell (`/navigation/main_shell_bottom_bar_scope`, `main_shell_controller`) confirms there IS a bottom bar (likely Home/Players/Compare/Skills/Packs/More/Profile — typical for this app). The `liquid_glass_navbar_debug_controller` suggests a custom iOS-style "liquid glass" bottom bar.
- **i18n ARB files**: Flutter i18n usually uses `intl_translation` + `.arb` files generated, but APK bundles only the final translations compiled into `libapp.so` (or in `packages/` — not browsed). 21 language flag icons (`icons/languages/`) confirm 18+ locales supported, matching web's 18.
- **Specific route paths between pages**: go_router config compiled into Dart map — not in strings. Path inferable from page name (e.g. `HomeAllPacksPage` → `/all-packs` like web).
- **Meme generator**: Not found in libapp.so. The CLAUDE.md mention of "meme generator" (from prior agent's 200+ SVG icons analysis) appears to be a misread — only 5 `skin_bonuses` icons exist, not meme. **Correction**: eFootBase app does NOT have meme generator. (eFHUB has Card Creator + AI Video — eFootBase does not.)
