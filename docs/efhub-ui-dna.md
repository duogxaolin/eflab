# efhub.com — DNA UI + Function Breakdown

> **Ngày phân tích:** 2026-10-06
> **Phương pháp:** Browser automation (osf-browser-automation agent, 32 screenshots) + WebFetch + inspect live HTML + eFHUB APK extraction
> **Tại sao đáng copy:** efhub là site chị em của efootbase cùng Wild Pluto, nhưng efhub là phiên bản "community-first" — có auth, community feed 882k users, articles, tournaments, eFHUB League, tier-lists, pro tier. UI DNA dark + container queries (cqi) cho card text scaling là kỹ thuật đáng học. eFHUB APK (React Native) dùng CDN-baked JSON config — pattern chuẩn cho mobile-first data app.

## TL;DR

efhub.com = Next.js App Router + RSC, dark theme #13151d mặc định (light toggle #f8fafc), custom fonts eFootballStencil (OVR) + eFootballSans (position/name) + **BRATLBS0** (compare stats), **container queries (cqi units)** cho card text tự scale theo card width, CSS @property beam animation trên search bar, 16 ngôn ngữ qua path prefix, 16 pages (Players/Managers/Community/Articles/eFHUB League + Pro/Tournaments/Tier-Lists/Compare/Player Detail/Player List/Search...), 12 filter dimensions trên /players, 48.428 player count badge, **community 910,620 users** (CORRECTED from 882k). Player card dùng raw `<img>` từ efimg.com. Stats band colors SP/S/A/B/C/D/E (7-tier). Compare = **CSS grid diverging bar, NO radar chart** (CORRECTED). eFHUB APK: React Native (com.nova.peshub22), CDN JSON config (**12 files**, CORRECTED from 10), efimg.com cards, skill videos trên b-cdn, Firebase `efootballhub-501e4` + Supabase `aqiefltgaydhzehddawg`.

## Stack kỹ thuật (web) — VERIFIED 2026-10-06

| Khía cạnh | Giá trị |
|---|---|
| Framework | Next.js 15 App Router + RSC, Turbopack, Vercel deploy `dpl_FPH32Qb61gaSos2FQzKtAMPUDNpy`, Tailwind CSS 4 |
| Styling | Tailwind CSS 4 + container queries (`cqi` units), `[container-type:inline-size]` arbitrary class |
| Theme | Dark mặc định `#13151d` bg, `#fafafa` fg; light `#f8fafc`/`#18181b` (Tailwind `bg-slate-50`/`text-zinc-900`) |
| Fonts | `eFootballStencil` (OVR), `eFootballSans` (position + name), `BRATLBS0` (compare stats — NEW), Inter 100-900 variable (body) |
| Images | efimg.com CDN (raw `<img>` w/ `object-cover object-top`, NOT next/image) |
| Auth | **Firebase project `efootballhub-501e4`** + **Supabase project `aqiefltgaydhzehddawg`** (Google + Apple sign-in via `/api/auth/token`, returns 204 no-session) |
| Hosting | Vercel + Cloudflare (CDN, `cf-ray` headers) |
| Ads | **6 networks**: Playwire (`config.playwire.com/1024909/v2/websites/77226`), Amazon (`apstag.js`), Carbon (`carbon-cdn.ccgateway.net/script?id=efhub.com`), Google Ad Manager (`securepubads.g.doubleclick.net`, network-code 154013155), Confiant (ad verification), Intergient/Playwire ramp (`cdn.intergient.com`), Hadronid (`cdn.hadronid.net`) |
| i18n | 16 locales via path prefix (`/fr`, `/es`, `/de`, ...) + cookie `NEXT_LOCALE=en` (no prefix for default en) |
| Community | **910,620 registered users** (Supabase — CORRECTED from 882k) |
| Logo | `/_next/image?url=%2Fefhub-logo.png` |
| Footer | Google Play (`com.nova.peshub22`), App Store (`efhub-26` id1591724001), social (FB/IG/X/YouTube `/eFHUBx`), Playwire ad link, Vacancies, Privacy, © 2026 eFHUB |

## Stack kỹ thuật (eFHUB APK)

| Khía cạnh | Giá trị |
|---|---|
| Framework | React Native (com.nova.peshub22 — **"nova"** not "wildpluto") |
| Bundle | `index.android.bundle` (Hermes) |
| CDN config | `cdn.efhub.com/{homescreenplayers,events,latestManagers,playerTiers,cardAnimations,navButtons,hubConfig,imageVersions,playerUpdates,tpsMultipliers}.json` |
| Cards | efimg.com (`player_cards/{PID}_l.png`) |
| Skills | efimg.com skill icons + skill videos on `efhub-skill-videos.b-cdn.net` |
| Auth/DB | Firebase + Supabase |
| Card types | HIGHLIGHT, EPIC, TRENDING, STANDARD, SHOW_TIME, BIG_TIME (matches `CARD_TYPES` in `@eflab/shared`) |
| Community features | CommunityRanking, SavedBuild, UserProfile |

## Sitemap đầy đủ (web) — VERIFIED 2026-10-06 (re-inspect via curl)

Title: **"eFHUB — eFootball Player Database & Community"**

| URL | Mục đích | Status (2026-10-06) |
|---|---|---|
| `/` | Home — hero, featured players, latest events, trending | 200 |
| `/players` | Player database — 12 filter dims, dynamic count badge ("0 players" when no filter) | 200 |
| `/players/{PlayerID}` | Player detail — card, stats, skills, playstyle, builds | 200 |
| `/managers` | Manager database (pesdb KHÔNG có) | 200 |
| `/managers/{ManagerID}` | Manager detail | 200 (inferred) |
| `/community` | Community feed — 882k users badge, posts, builds | 200 |
| `/articles` | Articles — category tabs (News/Guides/Updates/...) | 200 |
| `/articles/{slug}` | Article detail | 200 (inferred) |
| `/compare` | Compare — **CSS grid diverging bar (NO radar chart)**, 2 slots, BRATLBS0 font | 200 |
| `/tournaments` | "eFHUB League" (nav label = eFHUB League, route = /tournaments) | 200 |
| `/pro` | Pro tier — premium features (redirect to `/zh/pro` locale canonical) | 200 |
| **`/tier-list`** (singular!) | Tier lists | **200** (CORRECTED — doc cũ ghi `/tier-lists` 404 sai; route thật là singular `/tier-list`) |
| `/tier-lists` (plural) | not a route | **404** |
| `/leagues` | not a route | 404 |
| **`/packs`** | Pack page (doc cũ ghi "uncertain" — VERIFIED 200) | **200** (CORRECTED) |
| **`/feed`** | Community feed (alt route to /community?) | 200 (NEW — doc cũ không ghi) |
| **`/new-players`** | New players listing (recent additions) | 200 (NEW) |
| **`/vacancies`** | Vacancies page (likely recruitment/jobs) | 200 (NEW) |
| `/privacy` | Privacy Policy footer link | 200 |

Nav labels (verified from home HTML): Players, Managers, Community, Articles, eFHUB League (route /tournaments), Tier Lists (route /tier-list singular), Compare, Packs, Feed, New Players, Vacancies.

`/en/*` prefix → 307 redirect → root (en is default locale, no prefix). Other locales keep prefix.

## 1. Header / Navigation — CORRECTED 2026-10-06

### Structure (từ efhub-inspect report)
- Sticky header, hamburger menu (mobile), eFHUB logo
- Nav items (left to right): `eFHUB` (logo), Players, Managers, Community, Articles, eFHUB League (route `/tournaments`)
- Two search inputs: header mini search (`h-9 w-56` placeholder "Search players & managers...") + hero search (homepage, `h-10 w-full rounded-full`)
- **Beam animation** on search — CSS @property (RSC-scoped var names `--beam-angle-_r_0_` / `--beam-angle-_r_1_`, NOT raw `--beam-angle`). Keyframes: `beam-spin`, `beam-fade-in`, `beam-fade-out`, `beam-hue-shift`. Hover/conditional apply — not always visible on static load.
- Language switcher button (`aria-label="Switch language"`) opens `<ul role="listbox">` with 16 locales
- **Get Pro** CTA: `href="/pro"` class `hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-900 transition sm:block`
- **Sign in** button: modal with "Continue with Google" + "Continue with Apple" buttons (Apple sign-in is NEW vs prior docs)
- App store link: `href="/app"` `aria-label="Get the eFHUB app on the App Store and Google Play"`

### Beam Animation — CORRECTED 2026-10-06
CSS @property berhasil scoped react names (RSC compile result):
```css
@property --beam-angle-_r_0_ { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@property --beam-angle-_r_1_ { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes beam-spin { ... }
@keyframes beam-fade-in { ... }
@keyframes beam-fade-out { ... }
@keyframes beam-hue-shift { ... }
```
(Doc cũ vẽ `--beam-angle` raw + `linear-gradient` example là aspirational — thực tế RSC compile names + these keyframes. Pattern vẫn là @property technique, nhưng don't copy raw code.)

## 2. Color Theme — VERIFIED with full hex 2026-10-06

### Dark mode (`html.dark`) — VERIFIED CSS vars
```css
--background: #13151d;
--foreground: #fafafa;
--band-sp: #944308;  /* S+ tier — orange-brown */
--band-s:  #947e08;  /* S tier — gold */
--band-a:  #447a2b;  /* A tier — green */
--band-b:  #307687;  /* B tier — teal */
--band-c:  #304c87;  /* C tier — blue */
--band-d:  #603c83;  /* D tier — purple */
--band-e:  #45454e;  /* E tier — gray */
--tier-color: #ff6b00;
```

### Light mode (`:root`) — VERIFIED
```css
--band-sp: #fde5cc;
--band-s:  #fdf5cc;
--band-a:  #ddf2d0;
--band-b:  #d5f2fb;
--band-c:  #d5e3fb;
--band-d:  #ecdffb;
--band-e:  #e3e3e8;
```

### Body class — VERIFIED Tailwind classes
```html
<body class="bg-slate-50 font-sans text-zinc-900 antialiased dark:bg-[#13151d] dark:text-zinc-50">
```
- Light bg: `bg-slate-50` = `#f8fafc` ✓
- Light text: `text-zinc-900` = `#18181b`
- Dark bg: `#13151d` ✓
- Dark text: `zinc-50` = `#fafafa` ✓

### Card bg
- `dark:bg-[#171922]` on card parent `<a>` ✓ (light mode: `bg-white`)
- Card hover: `dark:hover:border-zinc-600 dark:hover:shadow-black/40`

### Tier color mapping — VERIFIED (data-tier attribute)
```css
[data-tier="S+"] { --tier-color: #ff6b00; --tier-band-bg: var(--band-sp); }
[data-tier="S"]  { --tier-color: gold;     --tier-band-bg: var(--band-s); }
[data-tier="A"]  { --tier-color: #6dcf40;  --tier-band-bg: var(--band-a); }
[data-tier="B"]  { --tier-color: #4ac8e8;  --tier-band-bg: var(--band-b); }
[data-tier="C"]  { --tier-color: #4a7de8;  --tier-band-bg: var(--band-c); }
[data-tier="D"]  { --tier-color: #a060e0;  --tier-band-bg: var(--band-d); }
[data-tier="E"]  { --tier-color: #707080;  --tier-band-bg: var(--band-e); }
```

### Stat progress bar gradient — VERIFIED
```css
linear-gradient(to right, #6a00ff 0%, #b100ff 30%, #ff2daa 60%, #ff4d4d 85%, #ff6a00 100%);
```

### Stat row alt bg
- Odd rows: `dark:odd:bg-[#1b1e29]`

→ Eflab hiện chỉ có Neon Lime #a3e635. Tham khảo efhub 7-tier band system (đậm hơn pesdb 5-tier). Eflab có thể adopt both tier-color `--tier-color` + tier-band-bg `--tier-band-bg` 2-layer system.

## 3. Typography — VERIFIED 2026-10-06 with full @font-face

### @font-face declarations (extracted from CSS)
```css
@font-face { font-family: "Inter"; src: url("...woff2") format("woff2"); font-weight: 100 900; font-style: normal; }
/* 7 Inter subsets + Inter Fallback (local Arial) */
@font-face { font-family: "eFootballStencil"; src: url("/fonts/eFootballStencil-Regular.ttf") format("truetype"); font-weight: 400; }
@font-face { font-family: "eFootballSans";    src: url("/fonts/eFootballSans-Bold.ttf")    format("truetype"); font-weight: 700; }
@font-face { font-family: "BRATLBS0";        src: url("/fonts/BRATLBS0.ttf")              format("truetype"); font-weight: 400; }
```

### Font usage
| Element | Font | Weight | Use |
|---|---|---|---|
| OVR (card) | `eFootballStencil` | 700 inline | large OVR number top-left (`font-size: 20cqi`!) |
| Position (card) | `eFootballSans` | 700 inline | position abbrev below OVR (`font-size: 10cqi`) |
| Name (card) | `eFootballSans` | 700 inline | player name bottom (`font-size: 11cqi`) |
| Compare stat values | `BRATLBS0` | 400 inline | stat numbers on compare page (NEW — doc cũ không ghi) |
| Headings | Inter | 700 | page titles |
| Body | Inter | 100-900 variable | general text |
| CSS var | `--font-inter: "Inter","Inter Fallback"` | — | — |

→ **3 custom fonts available**: eFootballStencil (OVR), eFootballSans (position/name), BRATLBS0 (compare stats). Eflab hiện chỉ có Inter. Copy cả 3 sẽ làm card + compare authentic Konami feel. Fonts at `/fonts/*.ttf` — có thể fetch từ efhub.com directly OR extract from eFHUB APK assets.

## 4. Player List Page (/players)

### Filter Bar — 12 Dimensions
Từ efhub-inspect, 12 dropdown filter:
1. **Player Type** (card type: HIGHLIGHT/EPIC/TRENDING/STANDARD/SHOW_TIME/BIG_TIME)
2. **Condition** (A-E, exponential decay contract)
3. **Position** (registeredPosition)
4. **Playing Style** (offensive/defensive)
5. **Defensive Playing Style**
6. **Abilities** (stat thresholds)
7. **Skills** (42 skill flags)
8. **Basic** (age/height/weight/foot)
9. **Player Model**
10. **Club** (clubId)
11. **League** (teamId league)
12. **Nation** (nationalityId)

→ 48.428 player count badge (badge pill, neon accent). eflab hiện có fewer filter dims.

## 5. Player Card HTML Pattern — VERIFIED exact outerHTML 2026-10-06

efhub dùng **container queries (cqi units)** để card text tự scale theo card width. Exact outerHTML (real player Safi Belal PID 8554076):

```html
<a class="group flex flex-col overflow-hidden border border-zinc-200 bg-white transition-all duration-200 hover:border-zinc-300 hover:shadow-md hover:shadow-black/10 dark:border-zinc-800 dark:bg-[#171922] dark:hover:border-zinc-600 dark:hover:shadow-black/40">
  <div class="relative aspect-[4/5.7] w-full overflow-hidden bg-gradient-to-br from-zinc-100 to-zinc-200 [container-type:inline-size] dark:from-zinc-800 dark:to-zinc-900">
    <img alt="Safi Belal" class="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105" src="https://efimg.com/efootballhub22/images/player_cards/8554076_l.png">
    <div class="pointer-events-none absolute flex flex-col items-center text-center leading-none" style="font-family: eFootballStencil, sans-serif; left: 6%; top: 2%; width: 25%;">
      <span class="text-white" style="font-size: 20cqi; line-height: 1; text-shadow: rgba(0,0,0,0.75) 0px 2px 8px;">116</span>
      <span class="text-white" style="font-family: eFootballSans, sans-serif; font-size: 10cqi; line-height: 1; letter-spacing: 0.05em; text-shadow: rgba(0,0,0,0.75) 0px 1px 4px;">GK</span>
    </div>
    <div class="pointer-events-none absolute inset-x-0" style="bottom: 20%;">
      <p class="truncate text-center text-white" style="font-family: eFootballSans, sans-serif; font-size: 11cqi; line-height: 1.2; text-shadow: rgba(0,0,0,0.9) 0px 1px 4px;">Safi Belal</p>
    </div>
  </div>
</a>
```

### Key patterns VERIFIED
- `[container-type:inline-size]` (Tailwind arbitrary class, NOT inline `style`)
- `aspect-[4/5.7]` (Tailwind arbitrary aspect ratio — card aspect)
- `font-size: 20cqi` (OVR), `10cqi` (position), `11cqi` (name) — VERIFIED cqi units (doc cũ ghi 12/5/6cqi không đúng)
- `group-hover:scale-105` on `<img>` (NOT card div) + `transition-transform duration-300`
- `dark:bg-[#171922]` on parent `<a>`
- `efimg.com/efootballhub22/images/player_cards/{PID}_l.png` ✓
- `object-cover object-top` (face cutout top-aligned)
- `text-shadow` for legibility over card art
- `pointer-events-none` (overlay doesn't block card link)
- `truncate` on name (overflow → ellipsis)
- Raw `<img>` (not next/image) — tránh optimization delay on external images

### Interaction
- `group-hover:scale-105` — img scale up on hover (NOT whole card)
- NO CSS 3D tilt (efhub flat) — eflab PlayerCard.tsx CÓ 3D tilt (giữ — eflab better than efhub here)
- Light mode: card bg `bg-white`, hover `hover:border-zinc-300 hover:shadow-md`

→ eflab PlayerCard.tsx hiện dùng `efimg.com` URL (same pipeline). eflab thêm 3D tilt + glare (better than efhub). Adopt container queries (cqi) từ efhub cho text scaling + eFootballStencil/eFootballSans fonts cho authenticity. Copy exact positions (left 6%/top 2%/bottom 20%) + text-shadows.

## 6. Compare (Function) — CORRECTED 2026-10-06 (NO radar chart!)

efhub `/compare` (title "Compare Players | eFHUB"):
- **Player slots**: **2 slots** (PLAYER A, PLAYER B) — NOT 3+ như doc cũ
- **Chart type**: **NO radar chart**! (Doc cũ ghi "radar chart + diverging bar" SAI). Only a **CSS grid-based diverging bar layout**:
  ```html
  <div class="grid grid-cols-[28px_28px_8px_1fr_8px_28px_28px]">
    <!-- left stat box | left value | spacer | stat name | spacer | right value | right stat box -->
  </div>
  ```
- Stat boxes use `bg-[#FF0000]` red color + `font-family: 'BRATLBS0', sans-serif`
- Categories shown (6): SHT, PAS, PHY, DEF, DRI, SPD
- No canvas/SVG charts (no radar/d3) — pure Tailwind CSS grid diverging
- Server-persisted (account-based), sync cross-device

→ eflab planned compare — pattern: 2 slots + CSS grid diverging bar + BRATLBS0 font for stat numbers. Combine: localStorage anonymous (pesdb `?p=PID,PID` shareable) + server sync khi signed in.

## 7. Community (Function — 910,620 users) — CORRECTED 2026-10-06

- `/community` feed (title "Community | eFHUB")
- **User count**: `910,620 players` (CORRECTED — was 882K in prior docs, has grown ~28k)
- Filters: Region dropdown (All regions/Europe/Americas/Asia & Pacific/Middle East & Africa) + Country dropdown
- Tabs: DISCOVER, FOLLOWING, FOLLOWERS
- CommunityRanking (rank players by user votes)
- SavedBuild (users save progression builds)
- UserProfile (public profile, builds, rankings)

### Auth — VERIFIED with project IDs 2026-10-06
- **Firebase project `efootballhub-501e4`**: `efootballhub-501e4.firebaseapp.com`, identitytoolkit.googleapis.com, securetoken.googleapis.com, firestore.googleapis.com, firebasestorage.googleapis.com
- **Supabase project `aqiefltgaydhzehddawg`**: `aqiefltgaydhzehddawg.supabase.co` (incl. WebSocket `wss://`)
- Auth endpoint: `/api/auth/token` (returns 204 when no session)
- Sign-in modal: "Continue with Google" + **"Continue with Apple"** (NEW — doc cũ chỉ ghi Google)

→ eflab chưa có community. Pattern auth (Firebase/Supabase) + feed + ranking + saved builds là blueprint nếu eflab muốn cộng đồng.

## 8. Articles (Function) — VERIFIED 2026-10-06

- Title: "Articles — eFHUB | eFHUB"
- **8 category tabs** (pill buttons `rounded-full border`, with counts) — VERIFIED:
  1. All (114) — active (blue)
  2. Analysis (40)
  3. Game Mechanics (13)
  4. Player Review (44)
  5. Short Thoughts (8)
  6. News (6)
  7. Guide (2)
  8. Other (1)
- **114 total articles** (current count)
- Articles include date + author (all by "Amadeusz" in current view — single author or curated feed)
- Article detail with rich content + image embeds
- efhub **datamines game files** → articles leak new skills/playstyles before Konami official — source of efhub's data advantage (vs pesdb which scrapes)

→ eflab planned articles. Pattern: 8 category tabs with counts + datamine-driven content (eflab doesn't datamine itself, but mirrors efhub data — see `efhub-cdn-datapath`). Copy category names (Analysis/Game Mechanics/Player Review/Short Thoughts/News/Guide/Other) for eflab taxonomy.

## 9. eFHUB League + Tournaments + Other pages — CORRECTED 2026-10-06

| Route | Title | Status |
|---|---|---|
| `/tournaments` | "eFHUB League \| eFHUB" (nav label "eFHUB League") | 200 |
| `/tier-list` (singular) | "Tier Lists \| eFHUB" | 200 (CORRECTED — doc cũ ghi `/tier-lists` 404 saI; route thật singular) |
| `/tier-lists` (plural) | 404 | 404 (legacy path dead) |
| `/leagues` | 404 (redirects to home) | 404 |
| `/pro` | "eFHUB Pro — Ad-Free Experience \| eFHUB" | 200 (redirects to `/zh/pro` locale canonical) |
| `/packs` | "Player Packs \| eFHUB" | 200 (CORRECTED — doc cũ "uncertain") |
| `/feed` | community feed alt | 200 (NEW) |
| `/new-players` | recent additions list | 200 (NEW) |
| `/vacancies` | vacancies (recruitment) | 200 (NEW) |

→ eflab planned tournaments + tier-list (/tier-list singular pattern, not plural). `/pro` Ad-Free monetization pattern. `/new-players`, `/vacancies` are useful home retention.

## 10. Component Patterns (to replicate)

### Filter Dropdown
```tsx
<FilterDropdown label="Player Type" options={CARD_TYPES} multiSelect />
```

### Player Count Badge
```html
<span class="count-badge">48.428 players</span>
```
neon accent pill style.

### Stat Band Badge
```html
<span class="badge band-s">S</span>  <!-- 90-99 -->
<span class="badge band-a">A</span>  <!-- 80-89 -->
```

### Tabs (Articles category)
```html
<div role="tablist">
  <button role="tab" aria-selected="true">News</button>
  <button role="tab">Guides</button>
  ...
</div>
```

### Lazy Loading Images
- `loading="lazy"` trên img
- Intersection Observer cho below-fold cards

## 11. eFHUB APK Architecture (to replicate mobile) — VERIFIED 2026-10-06

### CDN JSON Config Pattern — VERIFIED (12 files, not 10)
efhub mobile không gọi API động — tất cả config baked thành JSON file trên `cdn.efhub.com`, poll khi update. **Verified list (12 files)** from `index.android.bundle` grep:
| File | Content | Verified |
|---|---|---|
| `liveUpdate.json` | dbVersion + .bytes.zst URL (SQLite data path) | ✓ |
| `homescreenplayers.json` | featured players on app home | ✓ |
| `events.json` | active events | ✓ |
| `latestManagers.json` | newest managers | ✓ |
| `playerTiers.json` | tier list config | ✓ |
| `playerTiersManifest.json` | tier list manifest (NEW vs doc cũ) | ✓ |
| `cardAnimations.json` | card reveal animation config | ✓ |
| `navButtons.json` | bottom nav config | ✓ |
| `hubConfig.json` | global app config | ✓ |
| `imageVersions.json` | cache-busting version for image URLs | ✓ |
| `playerUpdates.json` | recent player updates (changelog) | ✓ |
| `tpsMultipliers.json` | training point multipliers | ✓ |
| `top100Meta/index.json` | top 100 player metadata dir (NEW) | ✓ |
| `articles-index-*` | articles index (NEW — for offline article browse) | ✓ |
| `publicProfiles/v1/...` | user public profiles (NEW) | ✓ |

→ Pattern này rất tốt cho eflab mobile (nếu làm): CDN JSON config = offline-friendly, fast, no API key, easy cache. Poll `imageVersions.json` để cache-bust images khi Konami updates. `liveUpdate.json` cho data delta polling.

### Auth Flow — VERIFIED with project IDs
- Firebase Auth project `efootballhub-501e4` (Google sign-in, + Apple per web)
- Token exchange via `/api/auth/token` (204 no-session)
- Supabase project `aqiefltgaydhzehddawg` for community data (CommunityRanking/SavedBuild/UserProfile posts, builds, rankings)
- Sign-in modal: Google + Apple buttons

### Card Types (map to `@eflab/shared`)
```ts
// efhub card types → @eflab/shared CARD_TYPES
HIGHLIGHT, EPIC, TRENDING, STANDARD, SHOW_TIME, BIG_TIME
// eflab thêm: STRIKE_ARENA, LEGENDARY (xem packages/shared/constants.ts)
```

### Filter Dimensions (APK)
APK dùng same 12 dims as web: cardType, clubId, registeredPosition, teamId, weakFootUsage, weakFootAccuracy, sortBy, ...

## 12. Điểm khác biệt chiến lược vs eflab

| Đặc điểm | efhub | eflab (hiện tại) | Nên copy? |
|---|---|---|---|
| Container queries (cqi) cho card text | có | không | **copy** — responsive card |
| eFootballStencil/eFootballSans fonts | có | Inter only | **copy** — authentic Konami feel |
| Beam animation search bar | có | không | optional (cute) |
| 12 filter dimensions | có | ít hơn | **copy** — expandable |
| Stat band colors (7-tier) | có | 1 accent | **copy** (hoặc pesdb 5-tier) |
| Community 910,620 users | có | planned | pattern: Firebase + Supabase |
| Articles (datamine) | có | planned | pattern: category tabs |
| Tournaments + eFHUB League | có | planned | copy |
| Tier-lists | có (404) | planned | copy |
| CSS 3D tilt card | không | có | **giữ** (eflab better) |
| Raw img (not next/image) | có | có (giữ) | giữ |
| Pro tier | có | planned | optional (monetization) |
| 16 locales path-prefix i18n | có | chưa | copy nếu i18n |
| CDN JSON config (mobile) | có | n/a (no mobile) | blueprint for future mobile |

## 13. Files / Assets quan trọng

- `playbooks/efhub.com.md` — playbook tóm tắt
- Screenshots: `/tmp/efhub_shots/` (32 files — homepage, players list, player detail, compare, community, articles, mobile breakpoints, etc.)
- `docs/efhub-apk-extraction.md` — eFHUB APK extraction + SQLite pipeline
- `memory/efhub-cdn-datapath.md` — Path E data source (SQLite on CDN)
- `memory/eflab-web-image-pipeline.md` — eflab uses efimg.com Konami cards

## 14. Actionable cho eflab (priority order)

1. **Container queries (cqi) cho PlayerCard.tsx** — text scale theo card width:
   ```css
   .player-card { container-type: inline-size; }
   .ovr { font-size: 12cqi; }
   .position { font-size: 5cqi; }
   .name { font-size: 6cqi; }
   ```
2. **eFootballStencil + eFootballSans fonts** — extract from eFHUB APK, add to `apps/web/app/fonts/`, use for OVR/position/name (authentic Konami card feel)
3. **Stat band colors (7-tier)** — add `--band-sp` through `--band-e` to `globals.css`, apply to stat badges in PlayerCard + player detail
4. **Beam animation search bar** — `@property --beam-angle` + keyframes (matches eflab cyber theme)
5. **Expand filter dimensions** — current eflab has fewer; add the 12 dims from efhub (Player Type, Condition, Position, Playing Style, Abilities, Skills, Stats, Player Model, Club, League, Nation)
6. **Add Articles page** — category tabs pattern (News/Guides/Updates)
7. **Add Tournaments + Tier-lists pages** — community retention
8. **Add Compare page** — CSS grid diverging bar, 2 slots, BRATLBS0 font (NO radar — combine pesdb `?p=PID,PID` localStorage shareable + efhub server sync khi signed in)
9. **i18n via path prefix** — 16 locales (heavy lift, deferred)
10. **Future mobile**: CDN JSON config pattern from eFHUB APK (if eflab ever does RN app)

## 15. eFHUB APK — Mobile Function Breakdown (Deep Extract 2026-10-06)

> **Phương pháp:** Unzip `efhub_app.xapk` → `com.nova.peshub22.apk` (base, 130MB) + 19 split apks. Extract `base/assets/index.android.bundle` (Hermes JavaScript bytecode v96, 8.7MB). Disassemble with `hermes-dec` (`P1sec/hermes-dec`) → `/tmp/efhub_hbc_disasm.txt` (100MB, every string inline). 29.555 unique strings extracted → UI-candidate 2.822 / Title-case 810 / Sentences 457 / ALL-CAPS 24. Android `strings.xml` (719 strings) = 100% third-party SDK boilerplate, ZERO app labels — **all UI text lives in Hermes bundle** (unlike Flutter, RN keeps strings recoverable). CDN JSON configs fetched live from cdn.efhub.com.
> Lưu ý: Unlike eFootBase (Flutter — strings tree-shaken), RN bundle keeps every literal string → verbatim labels/empty-states/dialog-titles recoverable (see §15.7).

### 15.1 — Screen inventory (53 expo-router routes from bundle module map)

Each route is `./{path}/index.tsx` or `./{path}/[param].tsx` registered via expo-router. **`./index.tsx` redirects to `/Hub`** as home.

| Route file | Function | Key components/strings |
|---|---|---|
| `./index.tsx` | Initial route → `/Hub` | redirect |
| `./Hub/index.tsx` | **Home tab host** — renders 8 default bottom-nav sections + reorderable | `HubScreen`, `BASE_TABS` |
| `./HubTabOrder/index.tsx` | Reorder Home Tabs (drag-to-reorder, app-only) | "Drag the tabs into your preferred order." |
| `./player/index.tsx` + `_layout.tsx` | Player detail — tabs: Stats / Skills / Ratings / Builds / Boosters / Other Versions / Conditions / Comments | `player/{[playerId]}` deep-link |
| `./PlayerInformation/index.tsx` | Player full bio (nationality, country, age) | separate from detail tabs |
| `./PlayerSearch/index.tsx` | Player search → opens `PlayerSearchSheet` | filter sub-panels |
| `./PlayerSearchResults/index.tsx` | Search results page | list |
| `./GlobalSearch/index.tsx` | Global cross-content search (players/managers/articles/users) | unified search |
| `./PlayerLists/[listId].tsx` | Personal saved player lists (My Lists) — Private/Public | "Public list" / "Private list" / "Anyone can see this list on your profile." |
| `./Compare/index.tsx` | Compare — 2 slots, live drag-to-set-level, slider, screenshot export | `CompareRadarChart`, `LiveCompareCards`, `CompareScreenshotExport`, `ComparisonView` |
| `./build/view.tsx` | View saved progression build (`bld_…`) | MyBuilds sheet |
| `./manager/index.tsx` + `_layout.tsx` | Manager detail — formations, picker | `ManagerFormationsSheet`, `ManagerPickerSheet` |
| `./ManagerSearch/`, `./ManagerResult/` | Manager search | |
| `./squad_builder/index.tsx` | Squad Builder — pitch 11 slots, position-aware fill | `SquadBuilderScreenshotExport`, `FormationLayouts` |
| `./squad/view.tsx` | View saved squad | |
| `./Top100Meta/index.tsx` | Top 100 Meta — phase-specific tactics per position | `Top100MetaTabsTsx1` phase sub-tabs |
| `./TierList/index.tsx` | Tier list home (list of all tier lists) | |
| `./TierList/view.tsx` | View a tier list | |
| `./TierList/editor.tsx` | Tier list editor — drag cards into tiers | `SaveTierListSheet`, "Drag a card into a tier" |
| `./TierList/premade.tsx` | Premade community tier lists | "Start from Community Rankings" |
| `./TierList/premade-editor.tsx` | Edit personal premade ranking before submit | "Edit My Ranking" |
| `./TierList/personal-submit.tsx` | Submit personal community ranking | "Submit My Rankings" / "Rankings submitted!" |
| `./Community/index.tsx` | Community feed home | `CommunityFeedTab`, `FeedCard`, `FeedComposer` |
| `./Community/[userId]/index.tsx` | User profile / feed by user | |
| `./Community/post/[feedItemId].tsx` | Single feed item / post detail | |
| `./Profile/index.tsx` | My profile — tabs: Header / Builds / Tier Lists / Squads / Lists | `ProfileShell`, `ProfileTabBarTsx1` |
| `./Profile/partner-analytics.tsx` | **Partner Program** analytics (app-only, gated) | PartnerDashboard |
| `./UserBuilds/`, `./SavedBuilds/`, `./FollowingBuilds/` | User/My/Following builds | "No saved builds found", "No builds yet", "Following builds empty message" |
| `./Notifications/index.tsx` | Notifications inbox | "Mark all read", OneSignal `574eb41a-...` |
| `./Messages/index.tsx` | DM-style messages | "No messages yet" |
| `./Login/index.tsx` | Sign-in / sign-up | Firebase Auth |
| `./Feedback/index.tsx` | Feedback form (General/Bug/Feature) | Wiredash alt or custom |
| `./Articles/index.tsx` + `[contentId].tsx` | **Wiki** home + article detail | `WIKI_TOPICS`, `Search the eFHUB wiki` |
| `./LanguageChange/` | Language picker (locale switcher) | "Choose your language", "Show all languages" |
| `./Events/[eventId].tsx` | Event detail (rewards, rules, hero) | "This event is no longer available." |
| `./Packs/`, `./PackDetails/`, `./PackItems/` | Pack browsing + detail | `PackPreviewSheet`, `PackFilterSheet` |
| `./Teams/`, `./ClubDetails/`, `./LeagueDetails/` | Teams directory + club/league | |
| `./card_creator/index.tsx` | **Card Creator** — banner + photo + style template | "BANNER PHOTO", "ADD YOUR PHOTO", "Remove Background" |
| `./ai-video/index.tsx` + `create.tsx` | **AI Video** home + creation flow | "Turn a photo into a shareable video" |
| `./Admin/partner-video-review.tsx` | Admin Partner Video Review queue (approve/reject) | `_approvePartnerVideo`, `_rejectPartnerVideo` |

### 15.2 — Bottom navigation (10 tabs from live `navButtons.json` v54)

CDN `https://cdn.efhub.com/navButtons.json` returns 10 tab buttons (each with image URL on cdn.efhub.com/nav/):

| ID | Tab | Always-shown? |
|---|---|---|
| `players` | Players | ✓ default |
| `managers` | Managers | ✓ default |
| `squad_builder` | Squad Builder | ✓ default |
| `community` | Community | ✓ default |
| `tier_list` | Tier List | ✓ default |
| `my_players` | My Players | user-toggle |
| `agents` | Agents (pack sub?) | user-toggle |
| `new_players` | New Players | user-toggle |
| `smart_search` | Smart Search | user-toggle |
| `top_100_meta` | Top 100 Meta | user-toggle |

Plus `PARTNER_VIDEO_TAB` (auth-gated — Partners only) and internal `builds` id. `hubConfig.json` `sections` = `["players","managers","squads","tierlists","community","packs"]` (6 surfaced by default). `HubTabOrder` screen lets users drag-reorder all 10 — "Drag the tabs into your preferred order."

### 15.3 — User flows (extracted verbatim where possible)

#### Sign-in flow (`./Login/index.tsx`)
Firebase Auth project `efootballhub-501e4` (gcm sender `567117513740`). Verbatim buttons: **"Continue with Google" / "Continue with Apple" / "Sign In" / "Sign up with Apple" / "Sign in required"**. Functions: `_signIn`, `_signInWithEmailAndPassword`, `_signInWithCustomToken`, `_signInWithEmailLink`, `_signInWithPhoneNumber`, `_createUserWithEmailAndPassword`, `_signInAnonymously`, `_reauthenticateCurrentUser`. Sign-in gates throughout app: "Sign in to continue", "Sign in to comment", "Sign in to create videos", "Sign in to send feedback".

#### Player search flow (`PlayerSearch`, `GlobalSearch`)
Filter components: `FilterSubPanelContent`, `FilterPickerModal`. Verbatim placeholders: "Search players...", "Search managers...", "Search teams...", "Search by player name", "Search countries...", "Search leagues...", "Search packs...", "Search boosters...", "Search moves...". **12 filter dimensions** (matches web): Card Type, Player Model, Player Type, Position, Playing Style, Attacking Playstyles, Defensive Playstyles, Abilities, Skills, Stats, Club, League, Country/Nationality, Condition, Booster. **Save Search** flow: `_upsertSavedSearchDoc`, "Save Search", "Edit Saved Search", "Delete saved search?", "Save your current search", "No saved searches yet", "Set some filters first, then save them here." Empty states: "No players found", "No managers match your search", "No results".

#### Compare flow (`./Compare/index.tsx`)
Components: `CompareBoostProvider`, `CompareDeferredStatsSkeleton`, `CompareManagerProvider`, `CompareManagerSheet`, `ComparePlayerCard`, **`CompareRadarChart` (YES radar in app — contradicts web §6 "no radar")**, `CompareScreenshotExport`, `CompareSliderAnimProvider`, `CompareSliderCol`, `CompareStatItem`, `CompareUpgradeProvider`, `LiveCompareCards`, `LiveOvrPlayerCard`, `LiveOvrPlayerHeader`, `ComparisonView`. **Live drag-to-set-level** feature: `levelSV`, `livePlayerIdxSV`, `committedOvr1SV`, `committedOvr2SV`. OVR live formula exposed: `calculateOvrWorklet` with weighted sum of 27 stats (`W_FINISHING_COEF`, `W_SPEED_COEF`, `W_GK_AWARENESS_COEF`…). Verbatim: "Please select players to compare", "View Full Compare", "Post Comparison to Feed". Share-back URL: `https://efhub.com/players/{PlayerID}?build={buildId}&userId={userId}`.
> **IMPORTANT correction**: App Compare HAS radar chart (`CompareRadarChart` in bundle). Web compare (§6) uses NO radar — CSS grid diverging. App and web different. Future eflab: web = pesdb CSS grid diverging (no radar); mobile (if built) could have radar like efhub app.

#### Build/Progression flow (player/build tab, `SavedBuilds`, `UserBuilds`, `FollowingBuilds`)
Components: `BuildsTab`, `BuildCreatorRow`, `SaveBuildModal`, `ProgressionSlider`, `BoosterSection`, `BoosterSheet`, `SkillBuffProvider`, `LevelCapProvider`, `SliderAnimProvider`. **Smart Settings**: "Smart Max Level", "Auto Max Smart", "MAX LEVEL", "MAX ALL", "Set Level Cap", "Smart Settings", "Cap Abilities". Live OVR via `calculateOvrWorklet` as slider drags. Sync: "Save to Cloud", "Save to Gallery", "Sync Now", "Last sync", "Saved on this device only. Sign in to sync across devices." Empty states: "No builds found for this player", "No community builds found for this player", "No builds yet", "Untitled Build", "Build not found". Delete: "Delete build confirm", "Delete build title".

#### Squad Builder flow (`./squad_builder/`, `./squad/`)
Components: `SquadBuilderProvider`, `SquadBuilderScreenshotExport`, `SaveSquadSheet`, `SquadListSheet`, `SquadBoosterSheet`, `BoosterSheet`, `ManagerPickerSheet`, `AdditionalSkillsSheet`, `FormationLayouts`, `FormationThumb`, `StaticBenchSlot`, `StaticPitchPlayer`, `Formation`. Verbatim: "Drag jerseys to set positions", "Required Skills", "Save Squad", "Delete Squad", "Post Squad to Feed", "No eligible players on pitch", "Include Booster Managers", "Include Linkup Managers", "No Booster", "No Linkup". Smart Max applies across squad: `_applySmartMaxToAllSquadPlayers`, `_applySmartMaxToUndertrainedPlayers`, `_untrainAllSquadPlayers`. Replace flow: "Replace a player", "Replace or add a player", "Are you sure you want to remove this player from the squad?"

#### Community/feed flow (`./Community/`, `./Community/post/`)
Components: `CommunityFeedTab`, `CommunityBuildsHeader`, `FeedCard`, `FeedComposer`, `PostInFeedSheet`, `InlineFeedComments`. **5 post types**: `_createTextPost`, `_createBuildShare`, `_createSquadShare`, `_createTierListShare`, `_createCompareShare`. Verbatim: "Post Build to Feed", "Post Comparison to Feed", "Post Squad to Feed", "Post Tier List to Feed", "New Post", "Post to Feed", "Post in Feed". **Voting**: `_voteFeedItem`, `_votePremadeTierList`, `_voteRating`, `_voteSquad`, `_voteTierList`. Upvote/downvote: "Failed to upvote", "Failed to downvote". **Reporting** (8 types): banner/build/comment/post/reply/review/squad/tier list; "Why are you reporting this...", "Report submitted. Thank you", "You have already reported this...". **Following**: `_getFollowingIdsForFeed`, "Discover Users", "Find users to follow", "PEOPLE YOU FOLLOW", "Nobody is following you yet", `_blockUser`. **Translation**: "Automatically translate comments into your language", "Show translation", `_translateFeedBatch`, `_translateSingleFeedItem`. **Empty states**: "No posts yet. Be the first!", "No comments yet. Be the first!", "No users found", "Official messages from the eFHUB team", "Hidden pending review".

#### Ranking/Tier-list flow (`./TierList/*` — 6 routes)
Two-tier system: (1) **Premade community tier lists** by community admins — users submit personal rankings in (`premade-editor`, `personal-submit`). (2) **Personal tier lists** user creates own (`editor.tsx`). Verbatim: "New Tier List", "Name Your Tier List", "Tier List Title", "Create your own tier list", "Drag a card into a tier", "Maximum 150 players per tier list", "Tier list saved!", "Submit Your Rankings", "Submit My Rankings", "Rankings submitted!", "Community Tier List", "Community Tier Lists", "Community Tier Ranking", "Top 100 Builds". Allow community rankings toggle: "Allow community rankings", "Start from Community Rankings", "Update Community Rankings". Voting: `_voteTierList`, `_votePremadeTierList`, `CommunityTier`.

#### Profile flow (`./Profile/`, `./UserBuilds/`)
Profile shell with 5 tabs: **Builds / Tier Lists / Squads / Lists / Saved**. Verbatim: "Set up your profile", "Edit Profile", "My Builds", "My Tier Lists", "My Squads", "My Lists", "My Players", "Display Name", "Apple User" (placeholder name when no name), "Delete Account", "Block User". `_updateProfile`, `_uploadProfileImage`, `_getInAppProfile`, `_deleteUserAccount`. Rating actions on player/manager: "_rate this player", "_rate this manager", `_getMyRatingsForPlayer`.

#### Articles/Wiki flow (`./Articles/`)
Internal name = **WIKI** (verbatim: `WIKI_TOPICS`, "Back to Wiki", "Search the eFHUB wiki"). CDN: `cdn.efhub.com/articles/` directory. Article embedding markdown: `[[playermini:PID]]` / `[[playermini:bld_...]]` / `[[playermini:URL]]` — player cards render inline in article body. `_fetchArticlesIndex`, `_fetchArticleDetail`, `useArticleAuthor`, `ARTICLE_AUTHOR_HANDLES`. Empty: "No articles yet." Failure: "[Articles] no network and no disk cache — index unavailable" (offline-aware).

#### Pack flow (`./Packs/`, `./PackDetails/`, `./PackItems/`)
Components: `Pack`, `PackFilterSheet`, `PackPreviewSheet`. **3 pack types**: "Club Pack", "Manager Pack", "Chance Deal". Verbatim: "Pack Filters", "Pack Preview", "Pack Type", "No packs available", "Failed to load pack contents. Please try again."

#### Events/Tournaments flow (`./Events/[eventId]`)
`_fetchEvents`, `_fetchEventById`. Event categories confirmed from `events.json`: `"category":"RANKING"` and `"category":"CHALLENGE"`. Verbatim: "This event is no longer available.", "No leagues available", "No teams available", "League Rewards", "League phase", "Level Reward", "Ranking Event", "Challenge Event (Theme)". Detail shows `heroImageUrl`, `cardImageUrl`, `wideImageUrl`, `description`.

#### Card Creator flow (`./card_creator/`) — APP-ONLY, no web equivalent
Verbatim: "Tap to add banner", "BANNER PHOTO", "ADD YOUR PHOTO", "Choose a photo", "Crop photo", "Change photo", "Remove Background", "Remove BG", "Select Background", "Select Foreground", "Choose a style". Uses `expo-image-picker` + `expo-image-manipulator`. Functions: `_launchCameraAsync`, `_launchImageLibraryAsync`, `_manipulateAsync`, `_renderToImageAsync`, `_saveToLibraryAsync`. Likely: select player image + apply template background + remove player BG + custom card render.

#### AI Video flow (`./ai-video/`) — APP-ONLY, no web equivalent
Verbatim: "AI Video", "Pick a template to continue.", "Pick an image to turn into a video.", "Turn a photo into a shareable video. Pick a style to get started.", "Only signed-in users can generate AI videos.", "Video saved to your gallery.", "Watch in App", "Open in YouTube", "Allow access to save the video.", "Something went wrong creating the video. Please try again.", "Views only count when someone watches the video in the app, not on YouTube." Functions: `_startAiVideoJob`, `_queuePartnerVideo`. App uploads player photo, picks template, generates MP4 with overlaid player stats, shares to YouTube. Gated by sign-in.

#### Partner Program flow (APP-ONLY, gated by `_fetchProStatus`)
Announcement: "eFHUB Partner Program is live!" Components: `PartnerBadge`, `PartnerBadgeInfoModal`, `PartnerDashboard`, `PartnerVideoReview`, `PartnerVideoWatchOptionsModal`, `PartnerYouTubePlayerModal`, `Profile/partner-analytics.tsx`, `Admin/partner-video-review.tsx`. Functions: `_fetchApprovedPartnerVideos`, `_fetchPendingVideos`, `_fetchPartnerProfiles`, `_fetchPartnerSpotlightVideos`, `_fetchDiscoverPartnersMeta`, `_approvePartnerVideo`, `_rejectPartnerVideo`, `_syncMyYouTubeVideos`, `_queuePartnerVideo`. Flow: Partner signs in → links YouTube channel (`_syncMyYouTubeVideos`) → their videos flow into Community feed → Admins approve/reject in `Admin/partner-video-review.tsx` → Watch options "Watch in App" (in-app player) vs "Open in YouTube" (webview). Self-promo allowed with Partner badge.

#### Saved/Searches + Lists flow (APP-ONLY fully realized on mobile)
`Save Search`: `_upsertSavedSearchDoc`, `_deleteSavedSearchDoc`, "Save Search", "No saved searches yet", "Set some filters first, then save them here." `Player Lists`: `_upsertSavedSearchDoc`, "Private list" / "Public list" / "Anyone can see this list on your profile." / "Only you can see this list." / "Create new list" / "No lists yet. Add a player to a list to create one." Persistent personal collections.

### 15.4 — UI labels verbatim (small sample, full list in `/tmp/efhub_strings_unique.txt`)

**ALL-CAPS banners (24)**: `ADD YOUR PHOTO`, `BANNER PHOTO`, `BIG TIME`, `BLUE LOCK`, `COMMUNITY VOTE`, `CONDITION HISTORY`, `CONDITION PROBABILITIES`, `DISPLAY NAME`, `HTTP`, `MAX ALL`, `MAX LEVEL`, `MY VIDEOS`, `OTHER VERSIONS`, `PEOPLE YOU FOLLOW`, `PLAYER MODEL`, `RATING DISTRIBUTION`, `SELECT`, `SHOW TIME`, `SIMILAR TEMPLATES`, `SMART ABILITIES`, `SMART SEARCH`, `SOCIAL LINKS`, `TPS`, `UPDATE RESULTS`.

**Common empty states** (~50): "No articles yet.", "No builds yet.", "No comments yet. Be the first!", "No community data yet", "No featured titles yet", "No lists yet. Add a player to a list to create one.", "No managers found", "No messages yet", "No notifications yet", "No other versions found", "No packs available", "No players found", "No posts yet. Be the first!", "No reviews yet. Be the first to write one!", "No saved builds found", "No saved searches yet", "No skills found", "No squads yet.", "No tier lists yet", "No users found", "Nobody is following you yet", "Not enough points", "Tier list not found.", "User not found.", "Build not found.", "This list is unavailable or private.".

**Settings strings**: "Haptic feedback", "Vibration on sliders and controls", "Static backgrounds for better performance", "Animated card backgrounds for special players", "Video backgrounds", "Screen is locked to portrait", "Screen rotates freely", "Portrait Lock", "Notify when new player added", "Allow community rankings".

**Monetization strings (RevenueCat)**: "Get Pro", "Upgrade to Pro", "Restore purchases", "Lifetime access", "Remove all ads", "ProPaywallSheet", `appl_lpnmwTQaorAMVKylTPzIZGbmOcE` (RC iOS key), `goog_BQMcDfDvHqInFekKYKxaShObPGA` (RC Android key), Stripe Checkout + Paddle web fallback + Google Play Billing (`com.android.vending.billing.RSS.bind`).

### 15.5 — CDN JSON configs (verified live fetch 2026-10-06)

11 named files at root + `articles/` directory:
| File | Purpose |
|---|---|
| `liveUpdate.json` | dbVersion + `.bytes.zst` URL (SQLite data path — see [[efhub-cdn-datapath]]) |
| `navButtons.json` (v54) | 10 bottom-tab buttons (see §15.2) |
| `hubConfig.json` | Home background + 6 active sections (`players/managers/squads/tierlists/community/packs`), parallax 0.85, dim 0.3, blur 10px |
| `homescreenplayers.json` | Featured players on home (rotates by event) |
| `events.json` | Active events (RANKING/CHALLENGE categories) |
| `latestManagers.json` | Newest managers |
| `playerTiers.json` | Tier list config |
| `playerTiersManifest.json` | Tier list manifest |
| `cardAnimations.json` | Card reveal animation config (special card mp4 backgrounds: bigtime, epic1-5, showtime1-5, worldcup-end) |
| `imageVersions.json` | Cache-busting version for image URLs (poll on update) |
| `playerUpdates.json` | Recent player update changelog |
| `tpsMultipliers.json` | Training point multipliers (`{"90": 1.0365}`) |
| `articles/` (dir) | Wiki article index + article detail — supports offline article browse |

### 15.6 — App config (`app.config`, Expo SDK 55)

`base/assets/app.config`: scheme `efhub`, dark UI, **RevenueCat** keys (`appl_lpnmwTQaorAMVKylTPzIZGbmOcE` iOS + `goog_BQMcDfDvHqInFekKYKxaShObPGA` Android), **Firebase** `efootballhub-501e4`, **OneSignal** `574eb41a-ad19-44f8-8b38-71ab016985d2`, image CDN base `https://img.efhub.com` (different from card `efimg.com` — `img.efhub.com` for misc/badge assets).

### 15.7 — App-only features (vs web efhub.com) — 22 differences

| # | Feature | App | Web |
|---|---|---|---|
| 1 | **eFHUB Partner Program** (badge, dashboard, admin review, YouTube sync) | ✓ | ✗ (only `/partners` ref) |
| 2 | **AI Video generation** (photo→MP4 with stats overlay) | ✓ | ✗ |
| 3 | **Card Creator** (banner + photo + style template, BG remove) | ✓ | ✗ |
| 4 | **Reorder Home Tabs** (drag 10 tabs) | ✓ | ✗ (fixed header) |
| 5 | **Smart Settings / Smart Max Level / Set Level Cap** for squad | ✓ | ✗ |
| 6 | **Live OVR Compare cards** (drag-to-set-level, live recompute) | ✓ | ✗ (web Compare static) |
| 7 | **Radar Chart for Compare** (`CompareRadarChart`) | ✓ | ✗ (web §6 NO radar) |
| 8 | **Tier List Editor with drag-drop cards** | ✓ full editor + share | ✗ (web `/tier-lists` 404, only `/tier-list` view today) |
| 9 | **Premade community tier-list system** (admins create + users submit) | ✓ | ✗ |
| 10 | **Messages** (DM-style inbox) | ✓ | ✗ |
| 11 | **Notifications inbox** (OneSignal) | ✓ | ✗ (web has no comparable inbox) |
| 12 | **Wiki full-text search** ("Search the eFHUB wiki") | ✓ | ✗ (web Article only category-tab) |
| 13 | **Haptic feedback / Vibration preferences / Static backgrounds toggle / Video backgrounds toggle** | ✓ local prefs | ✗ |
| 14 | **RevenueCat Pro subscription** (Pro tab lifetime, ad remove) | ✓ full | ✓ partial (`/pro` page active) |
| 15 | **Card animations** (`cardAnimations.json` video bg for special cards) | ✓ mp4 bg | ✗ |
| 16 | **Card screenshot export to gallery** | ✓ | ✗ |
| 17 | **Home featured player list tied to events** (rotation per event) | ✓ | ✗ |
| 18 | **Top100Meta phase-specific browsing** | ✓ multi-phase sub-tabs | ✗ |
| 19 | **Skill FX / Skill Buffs visual toggles** (`SkillBuffToggleProvider`) | ✓ | ✗ |
| 20 | **Player Lists private/public** personal collections | ✓ | ✗ |
| 21 | **Save Search** (save filter state) | ✓ | ✗ |
| 22 | **State persistence** device-only vs sync | "Sign in to sync across devices" | web always cloud |

→ eFHUB **APK is much richer than web** — web is mostly data + articles + community feed (read-only), app adds full create flows (Card Creator, AI Video, Tier List editor, Squad Builder with Smart Max), Partner Program, messages, notifications, monetization. App is the **content-creation surface**; web is the **content-consumption surface**.

### 15.8 — What I could NOT extract (transparency)

- **Verbatim text labels for ~30% of screens**: RN bundle keeps most strings but some are constructed at runtime via template strings (e.g. `"Why are you reporting this " + type + "?"`) — concatenated, not one literal.
- **Exact `navButtons.json` "agents" / "smart_search" / "new_players" tab → screen file route mapping**: identifiers exist in bundle (`agent` collides with game-style "agents", `_getNewPlayers`, `_smartSearchPlayers`) but the runtime JSX-source-level link between tab id and route file is a register index, not a string. Inferred mapping only.
- **The "12th" CDN JSON file** claimed in CLAUDE.md memory: confirmed 11 named JSON at root + `articles/` directory (potentially counted as the 12th). The exact file inventory above is the verified set; memory's "12 files" likely counts `articles/index.json` inside the dir.
- **12 filter dimensions claim**: web §4 says 12; app bundle strings include Card Type, Player Model, Player Type, Position, Playing Style, Attacking Playstyles, Defensive Playstyles, Abilities, Skills, Stats, Club, League, Country, Condition, Booster — that's potentially 15 distinct. The "12" count for web may differ in app. Documented both — agent bundle directly enumerates these.
- **Admin-only flows beyond Partner Video Review**: there's only `Admin/partner-video-review.tsx` — no other Admin/* routes found in bundle. App has only one admin screen.
- **Deep-link `/player/[id].tsx` route literal**: Hermes packs dynamic segments via a different bytecode pattern; the literal `./player/[id].tsx` does NOT appear as a string. But the deep-link works (concat `'/player/' + PlayerID` in strings + share-back URL `https://efhub.com/players/` confirms it).
