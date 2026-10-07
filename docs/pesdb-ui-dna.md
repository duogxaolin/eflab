# pesdb.net — DNA UI + Function Breakdown

> **Ngày phân tích:** 2026-10-06
> **Phương pháp:** Browser automation (osf-browser-automation agent, 17 screenshots) + WebFetch + curl
> **Tại sao đáng copy:** Pesdb là site nguyên bản kiểu "databasefocused" — khôngcard art tự vẽ, tối giản, tốc độ cao, không phụ thuộc external CDN. Muốn làm site eflab nhanh, không logo, dễ scrape → pesdb là reference chính cho "data-first" UX.

## TL;DR — CORRECTED 2026-10-06 (re-inspect)

Pesdb đã **REDESIGN** từ retro PHP (pre-2026) sang modern dark theme. Hiện tại: dark palette, card-grid layout, **game switcher** (eFootball 2027 + **11 PES archives 2011-2021**), 5-tier stat rating colors, card/table view toggle, **dedicated `/efootball/compare/` route (200, server-rendered shell + JS interactive)**, progression builder, self-hosted card art (no logo — differentiator vs efhub).

Nav thật sự: **4 items Home/Players/Packs/Compare** (doc cũ ghi "3 nav" sai — pesdb CÓ compare route + packs route 200, không phải JS-only localStorage). **`/efootball/managers/` → 404** (verified — duy nhất khác efhub/efootbase/eflab có managers). Player search count "of 1,837" (filter+advanced filter dynamic badges). Sort optgroups: **General/Attack/Defence/Strength/Rating/Player Model** (6 nhóm, doc cũ ghi khác).

## Stack kỹ thuật

| Khía cạnh | Giá trị |
|---|---|
| Framework | PHP server-rendered (vẫn), nhưng CSS/layout modern |
| Theme | Dark (mặc định), #090b10 bg, #11151d surface, #ff7f00 (orange) accent |
| Font | Bricolage Grotesque (Google Fonts) cho headings, system sans cho body |
| Images | Self-hosted `/assets/img/card/` — không external CDN, không logo |
| Card image pattern | `f{PlayerID}.png` (full), `d{PlayerID}.png` (progression), `f{PlayerID}authentic.png` (Authentic) |
| Flags | `/assets/img/Emblem/{nationalityId}.png` |
| Emblems | `/assets/img/Emblem/e_{teamId}_r.png` |
| Compare | **`/efootball/compare/` route (200), server-rendered shell + JS interactive**. Empty state `compare-empty`, `compare-grid`, `compare-toolbar`, `compare-scroll`, `compare-intro`, `compare-noscript` (works w/o JS shell). Player picker via header search. URL `?p={PID},{PID},...` shareable lists. LocalStorage persistence. | CORRECTED — has route! |
| Sort | Sortable fields trong 6 optgroups: **General, Attack, Defence, Strength, Rating, Player Model** | CORRECTED — doc cũ ghi "Basic/MAX/Playstyle/Skills/Basic/Player Model" sai |
| View toggle | `class="view-switch"` + `view-button`, Card view / Table view | VERIFIED |
| Player count | "of 1,837" (filters applied); `data-filter-count`, `data-advanced-count`, `data-compare-count` dynamic badges | CORRECTED (was "145 featured") |

## Sitemap đầy đủ — CORRECTED 2026-10-06 (re-inspect via curl)

| URL | Mục đích | Status |
|---|---|---|
| `/` (root) | 301 redirect → `/efootball/` | 301 |
| `/efootball/` | Home — title "eFootball Player Database — pesdb.net", game switcher | 200 |
| `/efootball/players/` | Player search — title "eFootball Player Search", "of 1,837" with no filter, dynamic count badges (`data-filter-count`, `data-advanced-count`, `data-compare-count`) | 200 |
| `/efootball/players/?page=N` | Paginated list (Dream Team featured subset — ~145) | 200 |
| `/efootball/players/{slug}-{15digit-PID}` | Player detail | 200 |
| `/efootball/packs/` | Pack list — title "Player packs" | **200** (CORRECTED — was "không có /packs") |
| `/efootball/compare/` | Compare — title "Compare Players", `compare-grid`+`compare-toolbar`+`compare-scroll`+`compare-empty`+`compare-noscript`. JS-required interactive; URL `?p={PID},{PID},...` shareable | **200** (CORRECTED — was "không có route") |
| `/efootball/authentic/?page=N` | Authentic Team list | from prior |
| `/efootball/authentic/players/{slug}-{sequential-id}` | Authentic player detail (ID != External PID) | from prior |
| `/pes2021/` ... `/pes2011/` | 11 PES archive sub-sites (verified in nav HTML) | 200 |
| `/managers`, `/efootball/managers/` | **404** (verified) — pesdb unique differentiator vs efhub/efootbase/eflab | 404 |
| `/community`, `/articles`, `/tournaments`, `/tier-lists`, `/skills` | not present (404 inferred) | 404 |

**Nav really has 4 items**: Home, Players, Packs, Compare. Doc cũ ghi "3 nav" **SAI**. Pesdb ships a compare route + packs route (server-rendered), không phải JS-only localStorage như doc cũ.

## 1. Header / Navigation — CORRECTED 2026-10-06

### Structure
- **Game switcher** (top): button `game-switcher-trigger` (`aria-haspopup="dialog"`, `data-game-switcher-trigger`) → opens `game-switcher-grid` panel. Active: eFootball 2027. Archive entries: PES 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011 (path `/pesYYYY/`).
- **Nav menu (4 items)**: Home (`/efootball/`), Players (`/efootball/players/`), Packs (`/efootball/packs/`), Compare (`/efootball/compare/`) — doc cũ ghi "3 nav + home" **SAI**, thực ra 4 nav items với route riêng.
- **Search input** in header: `header-player-search` class — both `desktop-header-player-search` + `mobile-header-player-search` variants
- **Theme**: dark mặc định, no light toggle (khác efhub)
- **Logo**: pesdb.net text logo
- **Dynamic count badges**: `nav-count` (`data-compare-count`), `filter-count` (`data-filter-count`), `advanced-filter-count` (`data-advanced-count`)
- Logo: pesdb.net text logo (không icon)

### Điểm khác efhub
- Pesdb **không** có "Get Pro", "Sign in", language switcher, App store link — thuần data site, không community/auth
- Game archive switcher duy nhất — pesdb giữ PES 2011-2021 data trong khi efhub/efootbase chỉ eFootball

## 2. Player List Page — CORRECTED 2026-10-06

### Routes
- `/efootball/players/` — full player search page. Title "eFootball Player Search | pesdb.net". 44,085 Dream Team results across **1,837 pages** (24/page) — VERIFIED pages 1-10 fully populated.
- `/efootball/authentic/players/` — Authentic Team list, 30,353 results. Default view: table (Dream Team default: card).
- Title: "eFootball Player Search | pesdb.net"

### Layout — CORRECTED 2026-10-06
- Sticky filter bar (search + dropdown filters + sort + view toggle)
- **Dream Team vs Authentic toggle**: anchor links in `<nav class="efootball-mode-switch">` (KHÔNG PHẢI radio):
  ```html
  <nav class="efootball-mode-switch" aria-label="Player Database">
    <a href="/efootball/players/" data-efootball-source="dream_team" class="active" aria-current="page">Dream Team</a>
    <a href="/efootball/authentic/players/" data-efootball-source="authentic">Authentic Team</a>
  </nav>
  ```
  (Doc cũ ghi "radio" sai.)
- **Card/Table view toggle**: `<div class="view-switch">` with `<button>` elements (`aria-pressed`, NOT radio):
  ```html
  <div class="view-switch" role="group" aria-label="Results view">
    <button type="button" data-search-view-button="card" aria-pressed="true">Card View</button>
    <button type="button" data-search-view-button="table" aria-pressed="false">Table View</button>
  </div>
  ```
  **Persisted via cookie `pesdb_efootball_search`** (value `{"view":"table"}` or `{"view":"card"}`, lifetime 1 year) — KHÔNG PHẢI localStorage như doc cũ.
- **Dynamic count badges**: `data-filter-count`, `data-advanced-count`, `data-compare-count` (count of players in compare list). All start `hidden` until nonzero.
- Pagination: **1,837 pages, all fully populated** (24 cards/page). "Page X of 1,837" with First/Previous/Next. (Doc cũ ghi "7 real pages, page 8+ empty" **SAI HOÀN TOÀN** — that was a Dream Team featured subset legend, không phải full search pagination.)

### Filter Bar — FULLY CORRECTED 2026-10-06 (~93 controls, not 12+!)

Total filter controls in `form#player-search` (~93 — far more than doc cũ's "12+"):

- **8 select dropdowns**: Player Availability (5: All/Dream Team/Featured/Standard/Unavailable), Card Type (9: Any/Standard/Legendary/Trending/Epic/Big Time/Highlight/Showtime/Showtime C./POTD), Stronger Foot, Region (6 options), Weak Foot Usage (5), Weak Foot Accuracy (5), Form (4), Injury Resistance (4)
- **67 fieldsets with min/max ranges**: each of 26 base stats, plus Position/League/Playing Styles/Age/Height/Weight/Sum of Abilities/Average Ability/Max Level/Player Value/Recently Added/11 Player Model fields (Neck Length, Shoulder Width,...)
- **2 dialog-based ID filters**: Player ID Whitelist (`include_ids`, max 100), Player ID Blacklist (`exclude_ids`, max 100)
- **18 hidden inputs**: nationality_id, team_id, featured, 13 secondary position ratings (gk/cb/lb/rb/dmf/cmf/lmf/rmf/amf/lwf/rwf/ss/cf min values)
- **Playing Style checkboxes**: Attacking Playing Style (22: Basic/Goal Poacher/Dummy Runner/Fox in the Box/Prolific Winger/Classic No 10/Hole Player/Box to Box/Anchor Man/Extra Frontman/Attacking Full back/Defensive Full back/Deep lying Forward/Creative Playmaker/Build Up/Roaming Flank/...), Defensive Playing Style (15)
- **Primary Position**: 13 checkboxes (GK/CB/LB/RB/DMF/CMF/LMF/RMF/AMF/LWF/RWF/SS/CF)

Visible filter labels (top bar): Player Availability, Card Type, Nationality, Club. Advanced expanded via `advanced-field-grid`, `rating-option-grid`, `position-grid`. Filter toggle + filter actions present.

### Sort dropdown — CORRECTED (74 options, 6 optgroups)
```html
<select name="sort" form="player-search" data-default="time_added">
  <optgroup label="General">19 options</optgroup>
  <optgroup label="Attack">10 options</optgroup>
  <optgroup label="Defence">9 options</optgroup>
  <optgroup label="Strength">7 options</optgroup>
  <optgroup label="Rating">13 options</optgroup>
  <optgroup label="Player Model">16 options (body proportions: Neck Length, Shoulder Width, ...)</optgroup>
</select>
```
**74 total** (doc cũ "20+" undercounted heavily). Plus order dropdown (Descending/Ascending). Player Model optgroup shared between filter fieldsets + sort.

### Card View (mặc định)
- `<div class="efootball-result-grid">` desktop 6 cols (template `181.656px 181.672px ...`), gap `30px 18px`. 24 cards/page.
- Per-card `<article class="efootball-result-card">`:
  ```html
  <article class="efootball-result-card">
    <a class="efootball-result-image" href="/efootball/players/michael-olise-52903528233305">
      <img src="/assets/img/card/f52903528233305.png" width="180" height="254"
           alt="Michael Olise — RWF, OVR 96, MAX 98" loading="eager" decoding="async">
    </a>
    <div class="efootball-result-meta">
      <h2 class="efootball-result-name"><a href="...">Michael Olise</a></h2>
      <span class="card-type">Trending</span>
      <p class="efootball-result-pack-line"><a class="efootball-result-pack" href="...">POTW National Teams 1 Oct '26</a></p>
    </div>
  </article>
  ```
- Image 180×254 rendered (from `f{PID}.png` 240×339). `loading="eager" decoding="async"`.
- Hover: standard link — NO CSS 3D tilt, NO scale transform (khác efhub `group-hover:scale-105` + eflab 3D tilt).

### Table View (toggle via `view-switch`)
- 9 columns (`<tbody><tr>`): Primary Position (filter link) | Player Name (detail link) | Club | Nationality (filter link) | Height (cm) | Weight (kg) | Age | Recently Added (sort col `is-sort-column`) | Overall Rating
- **Headers NOT individually sortable via click** — sorting is via the sort dropdown above. Active sort col header gets class `is-sort-column`.

## 3. Player Detail — CORRECTED 2026-10-06

URL: `/efootball/players/{slug}-{PID}` (e.g. `/efootball/players/michael-olise-52903528233305`)

### Hero summary
- Card image with `data-overview-src` (f) + `data-progression-src` (d):
  ```html
  <img src="/assets/img/card/f52903528233305.png" data-player-card-image=""
       data-overview-src="/assets/img/card/f52903528233305.png"
       data-progression-src="/assets/img/card/d52903528233305.png"
       width="240" height="339" alt="Michael Olise eFootball player card">
  ```
- `.player-hero-summary dl` basic info: Height (184cm), Weight (73kg), Age (25), Rating/Condition letter (A-D, links `?condition[0]=4`), Stronger Foot (links `?foot=1`), Attacking Playing Style (Prolific Wigner), Defensive Playing Style (Basic), Nationality (France), Club (emblem), Featured Pack link, Available-in pack link.
- NOT displayed in hero: Form number, Playstyle as separate. OVR + MAX as quick numbers.

### 26 base stats (Attacking/Defending/Strength groups) — VERIFIED
```html
<div class="ability-row">
  <span>Attacking Awareness</span>
  <strong class="stat-rating rating-good" data-stat-value="offensive_awareness">79</strong>
</div>
```
Field names snake_case (matches efootbase API schema, NOT efhub camelCase). 26 stats: offensive_awareness, ball_control, dribbling, tight_possession, low_pass, lofted_pass, finishing, heading, set_piece_taking, curl, defensive_awareness, tackling, aggression, defensive_engagement, gk_awareness, gk_catching, gk_parrying, gk_reflexes, gk_reach, speed, acceleration, kicking_power, jumping, physical_contact, balance, stamina.

### 13 position aptitudes — CORRECTED (NOT numbered list)
Pitch visualization `position-pitch` with zones showing Full/Partial familiarity:
```html
<span class="position-pitch-zone position-pitch-cmf is-partial"></span>
<span class="position-pitch-zone position-pitch-rmf is-full"></span>
```
Plus text list: Primary Position (RWF) + Secondary Positions (CMF/RMF/AMF/RWF/SS). Pitch bg uses `/assets/img/icons/pitch.png`.

### Skill flags — CORRECTED (14 per player max, NOT 42)
- **10 Player Skills** (`s_` prefix, badge chips as filter links): Double Touch, Flip Flap, Sole Control, Long-range Curler, First-time Shot, One-touch Pass, Through Passing, Pinpoint Crossing, Outside Curler, Super-sub. Each `<a class="player-filter-link" href="/efootball/players/?s_double_touch=1">`.
- **4 AI Playing Styles** (`p_` prefix): Trickster, Mazing Run, Speeding Bullet, Long Ranger.
- "42 skill flags" doc cũ = tổng across DB, không phải per-player.

### "Other versions" — CORRECTED (no versions section)
"Find Similar Players" form:
```html
<form method="post" action="/efootball/players/similar/">
  <input type="hidden" name="player_id" value="52903528233305">
  <button type="submit">Find Similar Players</button>
</form>
```

### Booster info — VERIFIED in Progression tab
```html
<section class="progression-boosters">
  <h3>Boosters</h3>
  <button class="progression-booster-toggle" data-booster-toggle="1" aria-pressed="true">
    <span>Booster {slot} 1</span>  <!-- literal template bug -->
    <strong>Breakthrough +3</strong>
    <small>Dribbling +3, Speed +3, Kicking Power +3, Physical Contact +3</small>
  </button>
</section>
```

### Data Extraction Pattern
Server-rendered HTML, parser dùng `data-stat-value="snake_case"` + `data-player-card-image`/`data-overview-src`/`data-progression-src`. Parse với `querySelectorAll('[data-stat-value]')`. Tên field snake_case (efootbase cùng schema, efhub thì camelCase).

## 4. Compare (Function) — CORRECTED 2026-10-06

- **CÓ route `/efootball/compare/` (200)** — doc cũ ghi "KHÔNG có route" **SAI hoàn toàn**. Pesdb có dedicated compare page.
- Title: "Compare Players"
- Server-rendered shell + JS-required interactive (`<noscript>` says "JavaScript is required to use the build comparison tool.")
- Page components: `compare-page`, `compare-main`, `compare-toolbar`, `compare-scroll`, `compare-grid`, `compare-content`, `compare-intro`
- Empty state: `compare-empty` + `compare-empty-icon` + "Your compare list is empty" auto rendered
- **URL param**: `?p={PID},{PID},...` shareable — passing PIDs in URL pre-fills compare list. (Tested `?p=89138556575063,52845277743527` → 200.)
- Player picker via `header-player-search` (search → select → add slot)
- Max 4 player slots (from prior inspect — re-verify)
- Stat comparison: per-stat highlight (green = better, red = worse)
- LocalStorage persistence (re-verify) — không persist cross-device (no account, no sync)
- Subset nhỏ so efhub compare (efhub has radar chart + diverging bar; pesdb simpler grid)
- `nav-count` badge in header shows `data-compare-count` (number of players in compare list)

## 5. Progression Builder (Function) — CORRECTED 2026-10-06

In player detail "Progression" tab (`#progression-panel`):

- **Max Level control**: NOT a 1-100 slider. Number input:
  ```html
  <div class="max-level-control">
    <label for="progression-max-level">Max Level</label>
    <input id="progression-max-level" type="number" min="1" step="1" inputmode="numeric" value="1" data-max-level="">
  </div>
  ```
  (Doc cũ ghi "level 1-100 slider" **SAI**. Đúng: type=number input.)
- **Position selector**: dropdown `<select data-progression-position>` với 13 positions (GK/CB/LB/RB/DMF/CMF/LMF/RMF/AMF/LWF/RWF/SS/CF)
- **Booster picker**: toggle buttons (`progression-booster-toggle`), mỗi booster có "Breakthrough +3" + stat bonuses hiển thị:
  ```html
  <button class="progression-booster-toggle" data-booster-toggle="1" aria-pressed="true">
    <span>Booster {slot} 1</span>  <!-- (literal "{slot}" template bug server-side) -->
    <strong>Breakthrough +3</strong>
    <small>Dribbling +3, Speed +3, Kicking Power +3, Physical Contact +3</small>
  </button>
  ```
- **Manager picker**: dialog-based (`data-manager-picker`) với search input "Search by name or Manager ID", endpoint `/progression-managers.php` (server-rendered JSON, interactive client-side)
- **Allocation steppers**: 6 categories (Shooting/Passing/Dribbling/Dexterity/Defending/Aerial...) each minus/plus buttons + "Next: 1" cost
- **Card swap**: khi progression tab active, JS swaps card img `data-overview-src` (`f{PID}.png`) → `data-progression-src` (`d{PID}.png`), SVG overlay `progression-card-overlay` updates OVR/position:
  ```html
  <svg class="progression-card-overlay" viewBox="0 0 240 339">
    <text class="progression-card-overall" x="44" y="46">98</text>
    <text class="progression-card-position" x="43" y="72">RWF</text>
  </svg>
  ```
- **Client-side interactive** — position/level/booster/manager changes update stats & OVR live via JS. Manager + booster data baked as JSON server-side.
- Điểm khác eflab: eflab sẽ cần server-side (tRPC) cho progression math (xem `packages/shared/progression.ts`), nhưng pesdb chạy full client-side.

## 6. Card Image Pipeline — CORRECTED 2026-10-06 (authentic pattern caution)

Pesdb **tự host** card art, không dùng efimg.com:
- `https://pesdb.net/assets/img/card/f{PlayerID}.png` — full card (240×339, face+OVR+position baked-in). VERIFIED 200 Messi+Haaland+Olise.
- `https://pesdb.net/assets/img/card/d{PlayerID}.png` — progression card (MAX-level stats baked). VERIFIED 200. Card có both `data-overview-src` (f) + `data-progression-src` (d) attributes, JS swaps on progression tab.
- `https://pesdb.net/assets/img/card/f{PlayerID}authentic.png` — Authentic variant. **404 for Messi** (`f89138556575063authentic.png`). Pattern có thể chỉ apply cho Authentic Team subset, Dream Team players don't have. Don't trust blindly.
- `https://pesdb.net/assets/img/Emblem/{nationalityId}.png` — flag (no padding, plain id). VERIFIED 200 (France=208).
- `https://pesdb.net/assets/img/Emblem/e_{teamId:06d}_r.png` — emblem. **Zero-pad 6** bắt buộc (`e_000008_r.png` 200, `e_130_r.png` 404). CHÚ Ý: doc cũ thiếu zero-pad note.
- `/assets/img/icons/pitch.png` — pitch background (position familiarity panel)

**Tested 2026-10-06:** Messi 89138556575063 → `f89138556575063.png` 200, `d89138556575063.png` 200, `f89138556575063authentic.png` **404**. Pattern public, không key, không logo watermark (khác efhub `player_cards/{PID}_l.png` có logo efhub → đó là lý do bno dùng pesdb, eflab dùng efhub với logo OK).

### So sánh với eflab hiện tại
| | pesdb | efhub (eflab dùng) | eflab PlayerCard.tsx |
|---|---|---|---|
| Source | self-host | efimg.com CDN | efimg.com (per `efhub-images.ts`) |
| Logo | không | efhub logo | OK (user chấp nhận) |
| Pattern | `f{PID}.png` | `player_cards/{PID}_l.png` | `player_cards/{PID}_l.png` |
| Mini | `d{PID}.png` (progression) | `mini-cards/...` (404) | n/a |
| Flag | `Emblem/{nId}.png` | `symbol/Nationality/{cId}.png` | `symbol/Nationality/{cId}.png` |
| Emblem | `Emblem/e_{tId}_r.png` | `symbol/Emblem/e_{tId:06d}.png` | `symbol/Emblem/e_{tId:06d}.png` |

→ eflab **giữ efhub pipeline** (đã quyết, xem [[eflab-web-image-pipeline]]). Nhưng nếu muốn no-logo variant hoặc backup source, pesdb pattern là fallback khả thi.

## 7. Color & Typography DNA — CORRECTED 2026-10-06 (full agent report)

### Palette — VERIFIED exact CSS vars from `:root`
```css
--bg: #090b10;        /* page background — verified rgb(9,11,16) */
--surface: #11151d;   /* card surface */
--surface-2: #171c26; /* secondary surface */
--line: #282f3d;      /* border */
--text: #f4f7fb;      /* text primary — verified rgb(244,247,251) */
--muted: #929cac;    /* text muted */
--accent: #ff7f00;    /* accent orange — verified */
--accent-dark: #2b1705;
--blue: #66a7ff;      /* blue accent (secondary) */
--danger: #ff7b7b;
--radius: 16px;
--shadow: 0 18px 55px rgba(0,0,0,.35);
```
(Doc cũ ghi `--text-primary:#e8e8e8 --text-muted:#8a8d93 --border:#1f232c` — sai. Đúng: `#f4f7fb / #929cac / #282f3d`.)

### Stat Tier Colors — FULLY CORRECTED (colors HOÀN TOÀN khác doc cũ)

Actually **5 named tiers** (NOT S/A/B/C/D), with realistic eFootball-toned colors. Applied via `<strong class="stat-rating rating-X" data-stat-value="snake_case">VALUE</strong>`:

| Class | Range | Color | Visual |
|---|---|---|---|
| `rating-elite` | 90+ | `#00ffb4` | teal/cyan |
| `rating-high` | 80-89 | `#96ff00` | lime green |
| `rating-good` | 70-79 | `#ffbe00` | amber/orange-yellow |
| `rating-average` | (unused for eFootball) | `#ffff00` | yellow — defined but not used |
| `rating-low` | 40-69 | `#ff3200` | red-orange |

Plus **5 PES-classic tiers** for the PES 2011-2021 archives:
```css
.pes-rating-low { --stat-color: var(--text); }
.pes-rating-average { --stat-color: #ffff00; }
.pes-rating-good { --stat-color: #ffbf00; }
.pes-rating-high { --stat-color: #ff7f00; }  /* orange — the old accent */
.pes-rating-elite { --stat-color: #ff4d4d; font-weight: 800; }
```

**Doc cũ SAI hoàn toàn** về tier colors (ghi S=#ff7f00, A=#4a8, B=#5aa6c9, C=#b0b0b0, D=#6a6a6a — những color này không tồn tại trong CSS pesdb). Trust tier này.

→ Eflab "Cyber-Sport Dark" Neon Lime #a3e635 gần với pesdb `rating-high #96ff00` lime — có thể align tier high với eflab accent. Toàn bộ 5-tier hệ thống đáng copy (file `globals.css` thêm 5 class `.rating-{elite,high,good,average,low}`).

### Typography — VERIFIED
```css
html { font-family: "Bricolage Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
```
- **Bricolage Grotesque self-hosted** at `/assets/fonts/bricolage-grotesque/` (3 subsets: Vietnamese, Latin Extended, Latin; woff2; weights 200-800) — NOT Google Fonts CDN (doc cũ ghi Google Fonts sai)
- Single font family for whole site (heading + body + OVR via font-weight on `<strong>`)
- Also loads: Google Sans 400/700 (likely for ads UI)
- **No separate monospace for OVR** — doc cũ ghi "monospace bold" sai

### Emblem URL format — CORRECTION
`teamId` must be **zero-padded to 6 digits**:
```css
✓ /assets/img/Emblem/e_000008_r.png  (HTTP 200)
✗ /assets/img/Emblem/e_130_r.png     (HTTP 404 — wrong padding)
```
(Doc cũ ghi `e_{teamId}_r.png` thiếu zero-pad note — misleading. efhub cũng pad 6 cùng pattern, see efhub doc.)

## 8. Component Patterns (để replicate)

### Filter Button
```html
<button class="filter-btn">
  <span>Position</span>
  <svg class="chevron-down">...</svg>
</button>
<!-- opens dropdown panel with radio/checkbox options -->
```

### View Toggle (Card/Table) — CORRECTED 2026-10-06
```html
<div class="view-switch" role="group" aria-label="Results view">
  <button type="button" data-search-view-button="card" aria-pressed="true">Card View</button>
  <button type="button" data-search-view-button="table" aria-pressed="false">Table View</button>
</div>
<!-- persists via cookie `pesdb_efootball_search` = {"view":"card"|"table"}, lifetime 1 year -->
```
(NOT radios + localStorage như doc cũ.)

### Stat Cell (5-tier color) — CORRECTED 2026-10-06
```html
<strong class="stat-rating rating-elite" data-stat-value="offensive_awareness">92</strong>  <!-- #00ffb4 teal, 90+ -->
<strong class="stat-rating rating-high" data-stat-value="ball_control">85</strong>          <!-- #96ff00 lime, 80-89 -->
<strong class="stat-rating rating-good" data-stat-value="tackling">75</strong>              <!-- #ffbe00 amber, 70-79 -->
<strong class="stat-rating rating-low" data-stat-value="balance">58</strong>               <!-- #ff3200 red-orange, 40-69 -->
```
(Doc cũ ghi `<td class="stat s-tier">` với colors orange/green/cyan/gray **SAI** — thực tế là `<strong class="stat-rating rating-{elite,high,good,average,low}">` với teal/lime/amber/yellow/red-orange.)

### Pagination — CORRECTED 2026-10-06
- "Page X of 1,837" with First/Previous/Next links
- **44,085 total Dream Team results, 1,837 pages, all fully populated** (24 cards/page). Authentic: 30,353 results.
- Doc cũ ghi "7 real pages, page 8+ empty, stop on 3 consecutive empty" **SAI HOÀN TOÀN** — that heuristic never triggers, all pages populated.

## 9. Scrape Notes (cho bno bot, không phải eflab) — CORRECTED 2026-10-06

- Dream Team list: **1,837 trang, all populated** (44,085 players, 24/page) — doc cũ "7 trang" SAI. Pagination trustable.
- Authentic Team: 30,353 results, separate paginated.
- `?search=` không hoạt động theo ID (parses slug, ignores numeric) — use `?include_ids={PID},{PID}` Whitelist dialog instead.
- Player detail parse: `data-stat-value="snake_case"` attr → dict via `querySelectorAll('[data-stat-value]')`.
- Authentic DB URL: `/efootball/authentic/players/{slug}-{sequential-id}` (sequential, NOT External PID) — different ID space.
- Player image asset: `/assets/img/card/f{PID}.png` (200), `d{PID}.png` progression (200), `f{PID}authentic.png` (404 for Dream Team players — Authentic only).
- Rate: 0.3-0.5s between requests (shared hosting, polite). Shared hosting — don't hammer.
- User-Agent: required (some endpoints 403 without)

## 10. Điểm khác biệt chiến lược vs eflab — CORRECTED 2026-10-06

| Đặc điểm | pesdb | eflab (hiện tại) | Nên copy? |
|---|---|---|---|
| Managers page | **không (404 verified)** | có (`/managers`) | giữ (eflab có — pesdb unique 404) |
| Packs page | **CÓ (200, `/efootball/packs/`)** | có (`/packs`) | align pattern |
| Compare page | **CÓ (200, `/efootball/compare/`)** — server-rendered shell + JS | planned | **copy pattern** — shareable `?p=PID,PID` URL |
| Community/Articles | không (404) | planned | giữ |
| Tournaments/Tier-lists/Skills | không (404) | planned/some | giữ eflab broader |
| Game archive switcher (11 PES games) | có | không | optional |
| Self-hosted card art (no logo) | có (`f{PID}.png` 200 OK) | không (efimg.com) | không (user OK với efhub logo) |
| 5-tier stat colors | có | không (1 accent) | **copy** — helpful UX |
| Card/Table view toggle (`view-switch`) | có | không | **copy** — dense browsing |
| Sort 6 optgroups (General/Attack/Defence/Strength/Rating/Player Model) | có | ít hơn | **copy** — richer sort |
| Dynamic count badges (filter/advanced/compare) | có | không | **copy** — UX feedback |
| Progression builder (client-side JS) | có | planned (server-side) | giữ server-side cho math |
| Bricolage Grotesque font | có | Inter | optional aesthetic |
| Orange accent #ff7f00 | có | Neon Lime #a3e635 | giữ eflab cyber theme |
| Auth | không (pure data site) | planned | giữ eflab auth |
| i18n | không (English only) | chưa | n/a |

## 11. Files / Assets quan trọng

- `playbooks/pesdb.net.md` — playbook tóm tắt
- Screenshots: `/tmp/pesdb_shots/` (legacy, prior inspect — 17 files) + `/tmp/pesdb_reinspect/*` (if pesdb-reinspect agent saved)
- `docs/pesdb-net-analysis.md` — phân tích cũ PRE-redesign (legacy, trust doc mới này)

## 12. Actionable cho eflab — CORRECTED 2026-10-06

1. **5-tier stat color system** — thêm vào `apps/web/app/globals.css` (colors VERIFIED từ pesdb CSS):
   ```css
   .rating-elite   { color: #00ffb4; }  /* 90+ teal */
   .rating-high    { color: #96ff00; }  /* 80-89 lime */
   .rating-good    { color: #ffbe00; }  /* 70-79 amber */
   .rating-average { color: #ffff00; }  /* (unused in eFootball) yellow */
   .rating-low     { color: #ff3200; }  /* 40-69 red-orange */
   /* Apply via <strong class="stat-rating rating-X" data-stat-value="...">VALUE</strong> */
   ```
   (Doc cũ ghi `#ff7f00/#4a8/#5aa6c9/#b0b0b0/#6a6a6a` SAI — dùng colors thật trên.)
2. **Card/Table view toggle** ở `/players` — buttons (not radios) + cookie persistence (not localStorage):
   ```tsx
   <div className="view-switch" role="group">
     <button data-search-view-button="card" aria-pressed>Card View</button>
     <button data-search-view-button="table" aria-pressed={false}>Table View</button>
   </div>
   ```
3. **Compare (4 slot, shareable URL)** — `/compare?p={PID},{PID},...` shareable, server-rendered shell + JS interactive. Empty state "Your compare list is empty" + "Add player from player detail page" (button `data-hero-add-compare`). No-account compare UX, thích hợp cho user chưa sign in.
4. **Self-host fallback** — nếu efimg.com chết, pesdb pattern là backup (no-logo). `f{PID}.png` 240×339, `d{PID}.png` progression, `/assets/img/Emblem/e_{teamId:06d}_r.png` (zero-pad 6 bắt buộc).
5. **Sort optgroups (74 fields, 6 nhóm)** — General/Attack/Defence/Strength/Rating/Player Model — hiện eflab chỉ sort theo OVR. Copy theo nhóm, có order dropdown (Desc/Asc) và default `time_added`.
6. **Filter system (~93 controls)** — 8 select + 67 fieldset min/max + playing style checkbox groups + position checkbox + ID whitelist/blacklist dialogs. Eflab có thể gia tăng dần, nhưng đây là gold standard cho database UI.
7. **Progression builder** — Max Level number input (not slider), position dropdown, booster toggles, manager picker dialog, allocation steppers 6 categories. Client-side interactive, server-side data JSON. Eflab có thể dùng `packages/shared/progression.ts` cho math.
8. **Find Similar Players** form `POST /players/similar/` — eflab có thể implement route tương tự, khác với "Other versions".
9. **Emblem zero-pad 6**: `e_{teamId:06d}_r.png` (efhub cũng vậy) — guard against missing-padding 404.
10. **Translate i18n (~18 languages)** — pesdb có language switcher (English/Italiano/Espanol/Portugues/Chinese/Francais/Turkce/Japanese/Russian/Korean/Arabic/Deutsch/Indonesian/Thai...). Eflab chưa có i18n — có thể tham khảo.
