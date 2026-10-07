# Kiểm kê tính năng efootbase.com và efhub.com

> **Trạng thái:** ĐÃ XÁC MINH (trừ khi có ghi chú khác)
> **Nguồn:** Trinh sát trình duyệt trực tiếp, kiểm tra header HTTP, payload RSC, sitemap, robots.txt

---

## 1. Chủ sở hữu — Wild Pluto Sp. z o.o.

Cả hai site **efootbase.com** và **efhub.com** đều do cùng một công ty vận hành: **Wild Pluto Sp. z o.o.** — một LLC Ba Lan, website wildpluto.com.

- **efootbase.com** là thương hiệu cũ ("eFootBase"), **efhub.com** là thương hiệu tái định vị ("eFHUB").
- **Xác nhận chéo (VERIFIED):** Footer efootbase.com có liên kết đến app efhub (iOS / Android), chứng minh hai site là chị em cùng công ti mẹ.
- **Ứng dụng di động:**
  - iOS App ID: `6759371167`
  - Android package: `com.wildpluto.efbase`
- **Mạng xã hội:** @eFootbase / @eFHUBx

---

## 2. So sánh stack kỹ thuật

| Khía cạnh | efootbase.com | efhub.com |
|-----------|---------------|-----------|
| **Framework** | Next.js (App Router + Turbopack, RSC payload) | Next.js (App Router + Turbopack, RSC payload) |
| **CSS** | Tailwind CSS (RSC payload) | Tailwind CSS (RSC payload) |
| **Hosting / CDN** | Cloudflare + DigitalOcean Spaces (`cdn.assets.efootbase.com`) | Vercel (`x-vercel-id`, `dpl_*` deployment IDs) |
| **Database backend** | API riêng tư `api2.efootbase.com` | Firebase (Auth + Firestore, project `effootballhub-501e4`) + Supabase (`aqiefltgaydhzehddawg.supabase.co`) |
| **Auth** | (không công khai) | Firebase Auth (`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`) |
| **Image CDN** | `cdn.assets.efootbase.com` (webp tự host) | `efimg.com/efootballhub22/images/...` (player_cards, mini-cards, symbol/Nationality, symbol/Emblem, symbol/EmblemLC) |
| **Quảng cáo** | (không xác định rõ) | Playwire + Amazon ads |
| **Analytics** | (không xác định rõ) | Google Analytics `G-535EXL68RL` |
| **Phong cách field name** | snake_case (giữ nguyên raw datamine) | camelCase (normalize từ game) |
| **robots.txt** | Chặn toàn bộ bot AI (GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot, v.v.) + Disallow `/api/` | Không chặn AI bot tương tự |
| **Số lượng người chơi** | 450k+ card | ~40k player |
| **Cộng đồng** | (không có feed) | 882k+ user (Feed cộng đồng) |

**XÁC MINH:** Cả hai cùng dùng Next.js App Router + Tailwind + RSC payload (không còn `__NEXT_DATA__` kiểu cũ). Cả hai đều dùng Cloudflare (efhub có cả Cloudflare và Vercel).

---

## 3. Đa ngôn ngữ

Cả hai site hỗ trợ khoảng **18 ngôn ngữ** với tiền tố URL locale (`/de/`, `/es/`, `/ja/`, `/fr/`, `/it/`, `/pt/`, `/pt-br/`, `/nl/`, `/ru/`, `/tr/`, `/ar/`, `/ko/`, `/zh-cn/`, `/zh-tw/`, v.v.). efhub sử dụng `hreflang` cho 16 locale.

| Site | Pattern locale | Số locale ước tính |
|------|----------------|-------------------|
| efootbase | `/{locale}/...` | ~18 |
| efhub | `/{locale}/...` + hreflang | ~16 (hreflang) / ~18 (thực tế) |

---

## 4. Sitemap đầy đủ

### 4.1 efootbase.com — Sitemap

**Sitemap index** chia theo nhóm: `/sitemaps/hubs/{0..31}.xml`, `/sitemaps/cards/{0..N}.xml`, `/sitemaps/static.xml`.

| Pattern URL | Mục đích |
|-------------|---------|
| `/` | Trang chủ — không gian Discover nổi bật với Player of the Week, Trending Player. |
| `/players` | Trang danh sách/tìm kiếm người chơi (redirect về trang chủ). |
| `/players/{id}` | Trang người chơi cơ sở (base player), ví dụ `/players/14` = Oguro Masashi. |
| `/players/{id}/{id}` | Trang card phiên bản cụ thể (card version). |
| `/compare` | Công cụ so sánh người chơi — chọn nhiều cầu thủ, chọn stat, hiển thị bar chart nhóm. |
| `/packs` | Danh sách pack người chơi (theo pack / event drop). |
| `/skills` | Trang danh sách 67 skill (kỹ năng). |
| `/skills/{slug}` | Trang chi tiết từng skill (67 trang), mô tả skill + danh sách người chơi có skill đó. |
| `/sitemaps/hubs/{0..31}.xml` | Sitemap phân mảnh — các trang "hub" (người chơi theo chủ đề / pack). |
| `/sitemaps/cards/{0..N}.xml` | Sitemap phân mảnh — các trang card. |
| `/sitemaps/static.xml` | Sitemap các trang tĩnh (/ /, /players, /compare, /packs, /skills + 67 trang /skills/{slug}). |
| `/{locale}/...` | Bản locale của các trang trên. |

### 4.2 efhub.com — Sitemap

| Pattern URL | Mục đích |
|-------------|---------|
| `/` | Trang chủ — Discover feed cộng đồng, bài viết nổi bật, Trending. |
| `/players` | Trang danh sách người chơi. |
| `/players/{slug}-{id}` hoặc `/players/{id}` | Trang chi tiết người chơi. |
| `/compare` | Công cụ so sánh. |
| `/managers` | Danh sách 1844 manager (HUẤN LUYỆN VIÊN). |
| `/tier-lists` | Bảng xếp hạng tier (vốn cộng đồng / editorial). |
| `/new-players` | Trang người chơi mới ra mắt. |
| `/packs` | Danh sách pack. |
| `/skills` | Trang skill — **404** (không còn / không có trang chi tiết skill như efootbase). |
| `/community` hoặc `/feed` | Feed cộng đồng — 882k+ user. |
| `/articles` hoặc `/blog` | Bài viết / bài datamine leak. |
| `/tournaments` hoặc `/efhub-league` | Giải đấu eFHUB League. |
| `/pro` | Trang gói Pro (subscription không quảng cáo, dùng chung web + mobile). |
| `/vacancies` | Trang tuyển dụng (Wild Pluto tuyển dev). |
| `/{locale}/...` | Bản locale. |

---

## 5. Kiểm kê tính năng theo từng site

### 5.1 Player database & filter

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Tìm kiếm / lọc người chơi | Có — `/players` với filter multi-dimension | Có — `/players` với filter |
| Lọc theo vị trí/quốc tịch/chân/heatmap club | Có | Có |
| Số lượng người chơi (card) | 450k+ | ~40k player |

### 5.2 Player detail page

| Thành phần | efootbase | efhub |
|-----------|-----------|-------|
| Stats nhóm (Attacking / Defending / Strength) | Có | Có |
| Build simulator | Có | Có |
| Booster (booster2_id) | Có — field `booster2_id` trong payload | Có |
| Position proficiency (12 vị trí, 2 bit mỗi vị trí) | Có | Có |
| AI playing styles (7+ style) | Có — flag `p_*` | Có |
| Community ratings | (ít rõ) | Có |
| Creator reviews | Có | Có |
| Thumbnail skill FX | Có | Có |
| Other version link | Có | Có |
| **Field name style** | snake_case raw game (`offensive_awareness`, `s_flip_flap`, `p_trickster`) | camelCase normalized (`offensiveAwareness`, ...) |

#### Tên trường stat ĐÃ XÁC MINH (cùng schema Konami cả hai site dùng)

**26 base stats (Kỹ năng cơ bản)**

| # | efootbase (snake_case raw) | efhub (camelCase) | Label tiếng Anh |
|---|---------------------------|-------------------|-----------------|
| 1 | `offensive_awareness` | `offensiveAwareness` | Offensive Awareness |
| 2 | `ball_control` | `ballControl` | Ball Control |
| 3 | `dribbling` | `dribbling` | Dribbling |
| 4 | `tight_possession` | `tightPossession` | Tight Possession |
| 5 | `low_pass` | `lowPass` | Low Pass |
| 6 | `lofted_pass` | `loftedPass` | Lofted Pass |
| 7 | `finishing` | `finishing` | Finishing |
| 8 | `heading` | `heading` | Heading |
| 9 | `set_piece_taking` | `setPieceTaking` | Set Piece Taking |
| 10 | `curl` | `curl` | Curl |
| 11 | `speed` | `speed` | Speed |
| 12 | `acceleration` | `acceleration` | Acceleration |
| 13 | `kicking_power` | `kickingPower` | Kicking Power |
| 14 | `jumping` | `jump` | Jumping / Jump |
| 15 | `physical_contact` | `physicalContact` | Physical Contact |
| 16 | `balance` | `balance` | Balance |
| 17 | `stamina` | `stamina` | Stamina |
| 18 | `defensive_awareness` | `defensiveAwareness` | Defensive Awareness |
| 19 | `ball_winning` | `ballWinning` | Ball Winning |
| 20 | `defensive_engagement` | `defensiveEngagement` | Defensive Engagement |
| 21 | `aggression` | `aggression` | Aggression |
| 22 | `gk_awareness` | `gkAwareness` | GK Awareness |
| 23 | `gk_catching` | `gkCatching` | GK Catching |
| 24 | `gk_clearing` (efhub) / `gk_parrying` (pesdb) | `gkClearing` | GK Clearing / GK Parrying |
| 25 | `gk_reflexes` | `gkReflexes` | GK Reflexes |
| 26 | `gk_reach` | `gkReach` | GK Reach |

> **Lưu ý bẫy:** pesdb dùng `gk_parrying` trong khi efhub dùng `gkClearing` cho cùng một slot — cẩn thận khi normalize giữa các nguồn.

**11 trường player model (cơ thể cầu thủ)**

| efootbase (snake_case) | efhub (camelCase) | Label |
|------------------------|-------------------|-------|
| `arm_length` | `armLength` | Arm Length |
| `shoulder_width` | `shoulderWidth` | Shoulder Width |
| `neck_length` | `neckLength` | Neck Length |
| `chest_measurement` | `chestMeasurement` | Chest Measurement |
| `neck_size` | `neckSize` | Neck Size |
| `shoulder_height` | `shoulderHeight` | Shoulder Height |
| `leg_length` | `legLength` | Leg Length |
| `thigh_size` | `thighSize` | Thigh Size |
| `waist_size` | `waistSize` | Waist Size |
| `arm_size` | `armSize` | Arm Size |
| `calf_size` | `calfSize` | Calf Size |

**5 trường physics computed (bắt nguồn từ player model)**

| efootbase (snake_case) | efhub (camelCase) | Label |
|------------------------|-------------------|-------|
| `leg_coverage_radius` | `legCoverageRadius` | Leg Coverage Radius |
| `arm_coverage_radius` | `armCoverageRadius` | Arm Coverage Radius |
| `jump_height` (efootbase) / `jumping_height` | `jumpingHeight` | Jumping Height |
| `torso_collision` | `torsoCollision` | Torso Collision |
| `dribble_height` | `dribbleHeight` | Dribble Height |

**COM skill / Skill FX / Other stats**

efootbase payload có các flag skill dạng `s_*` (ví dụ `s_low_screamer`, `s_flip_flap`, `s_first_time_shot`, `s_attacking_surge`, `s_scissors_feint`, `s_gamesmanship`, `s_gk_spirit_roar`, `s_heading`, `s_double_touch`, `s_magnetic_feet`, `s_interception`, `s_power_tackle`, `s_snap_strike`, `s_chop_turn`, `s_cut_behind_turn`, `s_tap_trick`, `s_edged_crossing`, `s_pinpoint_crossing`, `s_one_touch_pass`, `s_man_marking`, `s_rabona`, `s_super_sub`, `s_sombrero`, ...), flag playstyle `p_*` (`p_trickster`, `p_long_ball_expert`, `p_mazing_run`, ...), `booster2_id`, `player_value`, và `prefix` (ví dụ `"0501_291"` — tiền tố asset Konami).

efhub tương đương nhưng camelCase: `comSkills`, `playerSkills`, `weakFootUsage`, `weakFootAccuracy`.

Khảo sát thêm các metadata: `datapackId` (ví dụ `20251204`), `playerType`, `boostId`, `boostId2`, `levelCap`, `initialLevelCap`, `form`, `condition`, `injuryResistance`, `age`, `height`, `weight`, `preferredFoot`.

### 5.3 Công cụ so sánh (Compare tool)

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Compare nhiều cầu thủ | Có (`/compare`) | Có (`/compare`) |
| Chọn nhóm stat hiển thị | Có | Có |
| Bar chart trực quan | Có | Có |

### 5.4 Pack người chơi

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Danh sách pack (`/packs`) | Có | Có |
| Lọc theo pack / event | Có | Có |

### 5.5 Skill (kỹ năng)

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Trang danh sách skill (`/skills`) | Có | (404) |
| Trang chi tiết từng skill (`/skills/{slug}`) | Có — 67 trang | (404 — không có) |
| Số lượng skill | 67 | (số lượng trong DB nhưng không có trang riêng) |

### 5.6 Manager (huấn luyện viên)

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Trang Manager riêng (`/managers`) | Không (chỉ truy cập qua build simulator) | Có — 1844 manager |
| Lọc manager theo manager skill | Không | Có |

### 5.7 Tier list (bảng xếp hạng)

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Trang tier list (`/tier-lists`) | Không | Có |
| Tier editorial cộng đồng | Không | Có |

### 5.8 Cộng đồng / Feed

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Feed cộng đồng (`/community`) | Không | Có — 882k+ user |
| Bài đăng người dùng | Không | Có |
| Rating / review người dùng | (ít rõ) | Có |

### 5.9 Bài viết / bài datamine leak

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Trang bài viết (`/articles`) | Không | Có |
| Bài datamine leak về file game | Không | **CÓ — đây là điểm khác biệt lớn nhất** |

#### Bằng chứng efhub chủ động datamine file game

ĐÃ XÁC MINH qua tiêu đề bài viết trên efhub:

- "New Skills in game files — 7 of them!" (7 skill mới được tìm trong file game)
- "Four new playing styles found in game files" (4 playing style mới)
- "Engine Summary mentioning a 'decode' that needed updating" (tham chiếu Engine Summary / tín hiệu WESYS decode)
- "Ballack/Van Persie leak analysis" (phân tích leak cầu thủ)

Những tiêu đề này chứng minh đội ngũ efhub (Wild Pluto) **chủ động datamine file game** để phát hiện skill, playing style, và cầu thủ mới trước khi Konami công bố chính thức.

### 5.10 Giải đấu / eFHUB League

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Trang giải đấu | Không | Có (`/tournaments`) |
| eFHUB League | Không | Có |

### 5.11 Trang người chơi mới

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| New players (`/new-players`) | Không | Có |

### 5.12 Gói Pro (subscription)

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Pro subscription (`/pro`) | Không rõ | Có — không quảng cáo, dùng chung web + mobile |

### 5.13 Ứng dụng di động

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| iOS app | Có (App ID `6759371167`) | Có (cùng app Wild Pluto) |
| Android app | `com.wildpluto.efbase` | `com.wildpluto.efbase` |

### 5.14 Tuyển dụng

| Tính năng | efootbase | efhub |
|-----------|-----------|-------|
| Trang Vacancies | Không rõ | Có (`/vacancies`) |

---

## 6. Tổng kết so sánh tính năng

| Nhóm tính năng | efootbase | efhub | Cả hai | Chỉ một |
|----------------|-----------|-------|--------|---------|
| Player DB & filter | Có | Có | Cả hai | — |
| Player detail (stats / build / booster) | Có | Có | Cả hai | — |
| Compare | Có | Có | Cả hai | — |
| Pack | Có | Có | Cả hai | — |
| Skill trang chi tiết | Có (67 trang) | Không (404) | — | Chỉ efootbase |
| Manager trang riêng | Không (chỉ qua build) | Có | — | Chỉ efhub |
| Tier list | Không | Có | — | Chỉ efhub |
| Community / Feed | Không | Có (882k) | — | Chỉ efhub |
| Articles / Datamine leak | Không | Có | — | Chỉ efhub |
| Tournaments / eFHUB League | Không | Có | — | Chỉ efhub |
| New players | Không | Có | — | Chỉ efhub |
| Pro subscription | (chưa rõ) | Có | — | Chỉ efhub |
| Mobile app | Có | Có | Cả hai | — |
| Vacancies | Không rõ | Có | — | Chỉ efhub |

### Điểm khác biệt cốt lõi

1. **efhub** là site cộng đồng + tin tức + datamine leak (giống như một blog + DB site lớn). Đội ngũ Wild Pluto công bố leak trước khi Konami release.
2. **efootbase** là site tra cứu dữ liệu thuần (DB, compare, skill chi tiết) — không có feed cộng đồng, không có bài datamine leak công khai.
3. Cả hai cùng schema và cùng nguồn thượng ngót Konami (xem `data-sourcing-relationships.md`), nhưng **bai datamine chỉ efhub công bố** — điều ngầm ám chỉ efootbase có phần back office riêng trích xuất dữ liệu (thấp hơn nền tảng) phục vụ DB của chính nó.
