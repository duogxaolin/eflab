# efootbase APK + eFHUB APK analysis → eflab DB optimization

> 2026-10-07. Phân tích `eFootBase_+DB+&+Community_1.9.7` (Flutter) + `eFHUB™+27_2.1.055` (React Native.inflate), đối chiếu với database eflab hiện tại, bổ sung League/Manager/Booster + link Player→Team + community fields, và đánh giá những gì tận dụng được từ eFHUB.

## 1. Cấu trúc nguồn dữ liệu

### 1a. efootbase APK (Flutter, `com.wildpluto.efbase` v1.9.7)

Flutter app. Trong `flutter_assets/.env` có `EFBASE_API_KEY=L-}i@R-KwsGk&nB;C4)RBSB+_AQsTSK5Sxa&d:>oz54`.

API thật (verify với key) chỉ có **4 endpoint**:

| Endpoint | HTTP | Dùng |
|---|---|---|
| `/api/players` | 200 | 48.407 players (176 cols) |
| `/api/teams` | 200 | 591 teams |
| `/api/packs` | 200 | specialPlayerList + packs |
| `/api/meta` | 200 | 154 field labels (← source league OID→name!) |
| `/api/leagues` `managers` `boosters` `skills` `countries` | **404** | không có |

**Bundled trong APK** (Flutter assets, không có API):
- `assets/data/managers.json` → **65 managers** (id, name, rating, booster_1, booster_2, image)
- `assets/data/efootball_boosters.json` → standard (21) + basic (30) boosters, `bonus[27]` array
- `assets/images/managers/*.webp` → **65 manager card art** (908KB)

### 1b. efootbase.com (web)

Verify routes (dev-browser):
- `/`, `/players`, `/packs`, `/skills` → 200
- `/managers`, `/leagues` → **404** (web không có trang riêng)

→ efootbase web = 4 trang public + home. eflab đã clone đúng scope này (4-trang, 2026-10-07).

### 1c. eFHUB APK (React Native, `com.nova.peshub22` v2.1.055)

`app.config` expose:
- Firebase: `efootballhub-501e4` project (RTDB) — **client-gated** (.json 404 từ máy, cần app-auth)
- `imageCdnBase: https://img.efhub.com` (cũng 404 từ máy, gated)
- `cdn.efhub.com` CDN endpoints (công khai, verify 200):

| File | Size | Có thể tận dụng |
|---|---|---|
| `events.json` | 15KB | **10 in-game events** với startTime/endTime/missions/rewards — efootbase không có |
| `playerUpdates.json` | 3KB | **64 level-cap updates** hàng tuần cho player |
| `homescreenplayers.json` | 6KB | curated home screen (≈ eflab trending) |
| `cardAnimations.json` | 2KB | 16 mp4 card-open clips (optional, CSS layers không cần) |
| `tpsMultipliers.json` | 16B | stat multiplier (build math, optional) |
| `playerTiersManifest.json` | 55B | export timestamp + count |
| `hubConfig.json` | 215B | background/sections config |

eFHUB bổ sung efootbase: **in-game events + player level-cap refresh** — cả hai real-time, đáng ingest khi eflab có trang events/updates.

## 2. DB gap inventory (trước khi sửa)

| Entity | efootbase nguồn | eflab DB (trước) | Trạng thái |
|---|---|---|---|
| Player | 48.407 | 48.407 | ✓ đủ |
| Country | 185 | 185 (flag 100%) | ✓ đủ |
| Team | 591+ | 707 (emblem 100%) | ✓ đủ |
| **League** | **34** (từ /api/meta) | **0** | ❌ trống |
| Pack | 2046 | 2044 | ~ đủ |
| **Manager** | **65 (APK)** | **5** | ❌ thiếu |
| **Booster** | **51 (APK tiers)** | **12** | ❌ thiếu |
| Skill | 67 | 67 | ✓ đủ |
| PlayerSkill | 160k | 160.207 | ✓ đủ |
| **Player→Team** | implicit (team_name) | **no FK** | ❌ thiếu |
| Player community (views/avgRating/ratingCount) | có trong dump | không | ❌ thiếu |

Image R2 (verify 200 OK all types): cards transparent+dynamic 48k, emblems nationality 185 + team 795 + league 31, card-backgrounds 15, frames 6, conditions 5 — **đủ cho 4-layer composite**.

## 3. Schema changes (đã apply)

### League (mới — seed đầy đủ)
```prisma
model League {
  id        Int     @id         // efootbase OID (0-48)
  name      String              // "English League", "Ligue 1 McDonald's", ...
  region    String?             // Europe/Americas/Asia/Africa/Other
  emblemUrl String?             // R2 emblems/league/{hash}.png
  teams     Team[]
}
```
34 leagues từ `fixtures/leagues.json` (extract `/api/meta` field `league`). region gán thủ công theo geography.

### Team (nullable FK + relations)
```prisma
model Team {
  countryId Int?                // nullable để migrate từ countryId=0 → null
  leagueId  Int?
  country   Country? @relation(fields: [countryId], references: [id], onDelete: SetNull)
  league    League?  @relation(fields: [leagueId], references: [id], onDelete: SetNull)
  players   Player[]
  @@index([leagueId]) @@index([countryId])
}
```
707/707 teams giờ có leagueId + countryId populated (seed gán từ player.team_name + player.league).

### Player (teamId + community fields)
```prisma
teamId      Int?                 // FK→Team (nullable — some cards have no club)
views       Int    @default(0)   // efootbase community views
ratingCount Int    @default(0)   // efootbase rating count
avgRating   Float?              // efootbase avg rating (0-10)
team        Team?  @relation(fields: [teamId], references: [id])
@@index([teamId])
```
48.407/48.407 players có teamId. 30.742 có views, 5.508 có avgRating.

### Manager (thêm rating/imageUrl/booster stat keys)
```prisma
model Manager {
  rating       Int    @default(0)   // efootbase manager rating
  imageUrl     String?             // R2 managers/{id}.webp
  booster1Stat String?             // efootbase "lofted_pass" slug (not Booster.id)
  booster2Stat String?
}
```
65 managers từ `fixtures/managers.json`. 65/65 có imageUrl (R2).

### Booster (tier system — standard + basic)
```prisma
model Booster {
  tier    String @default("basic")   // "standard" | "basic"
  @@index([tier])
}
```
51 boosters (21 standard named + 30 basic +1). Bonus array 27 elems → sparse stat columns. Lưu ý: 12 basic có id trùng standard (0, 16-26) → `skipDuplicates` giữ standard (named) — đúng ý, vì basic trùng là +1 variant của cùng pattern.

## 4. Seeder changes (đã apply)

`packages/db/src/seed-efootbase-full.ts`:
- Wipe thêm League/Manager/Booster
- Phase 1: scan cũng collect `leagueEmblemHash` (first occurrence per league OID)
- Phase 1b: seed League từ `fixtures/leagues.json` + R2 emblem; seed Team với leagueId/countryId
- Seed Manager từ `fixtures/managers.json` (65, R2 imageUrl)
- Seed Booster từ `fixtures/boosters.json` (spread bonus[] → stat cols)
- Phase 2: Player cũng gán teamId, shirt (từ shirt_number), views, ratingCount, avgRating
- Idempotent, ~55s full re-run

Fixtures mới (committed, không gitignore):
- `packages/db/fixtures/leagues.json` (34 leagues, 1.9KB)
- `packages/db/fixtures/managers.json` (65 managers, 11.5KB)
- `packages/db/fixtures/boosters.json` (51 boosters, 9.4KB)

## 5. Image pipeline changes (đã apply)

- 65 manager images copy từ APK `flutter_assets/assets/images/managers/*.webp` → `dump/efootbase/images/managers/` → R2 `managers/{id}.webp`
- `apps/web/lib/r2-images.ts` thêm `managerImageUrl(managerId)` + `leagueEmblemByKey(r2Key)`
- `scripts/r2_upload.py` thêm `--key-prefix` flag (tránh tạo garbage root keys khi `--prefix` là leaf dir)
- R2 verified: `managers/{id}.webp` 200 OK (65 files), `emblems/league/{hash}.png` 200 OK (31 files)

## 6. Verification

```
League:        34 (all have emblemUrl)
Team:          707 (707 with leagueId, 707 with countryId)
Player→Team:   48.407/48.407 with teamId
Player views:  30.742/48.407
Player avgRating: 5.508/48.407
Manager:       65 (65 with imageUrl)
Booster:       39 (21 standard + 18 basic unique; 12 collisions resolved)
```

Sample data (DB):
```
FC Barcelona → Spanish League (league 12)
Manchester United → English League (league 4)
Cesc Fàbregas, rating 89, booster1=lofted_pass, managerImageUrl(17603997307931)
Bearer of Fate +4, standard, finishing 4 + low_pass 4 + kicking_power 4
```

## 7. eFHUB tận dụng gì (recommendation)

efootbase đã đủ cho 4-trang eflab scope. eFHUB bổ sung real-time data không có trong efootbase:

1. **`events.json`** (10 in-game events, live timestamps) — đáng ingest nếu eflab mở trang events. efootbase không có event data.
2. **`playerUpdates.json`** (64 level-cap updates/tuần) — worth pinging weekly để keep `Player.levelCap` fresh không cần re-dump full 48k.
3. `cardAnimations.json` mp4 — optional cho card-open animation mua gói (CSS layers hiện không cần).
4. `tpsMultipliers.json` — optional cho build-simulator accuracy.

Cam kết: eflab nguồn chính vẫn efootbase (API + APK bundle). eFHUB chỉ là **supplement real-time** cho events + level-cap refresh, không thay thế.

## 8. Out of scope (đã đánh dấu)

- Manager tactic ratings (possessionGame/quickCounter/...) — efootbase không expose, efhub Firebase gated để trống default 0.
- League emblem có 31/34 file (league 0=Other, 16=Other Europe, 24=Other N&CA dùng 1 hash shared) — đủ.
- Booster scaled variants (+2/+3/+4/+5 versions of standard names) — client derive at runtime, không lưu row riêng.
- eFHUB Firebase full player/manager data — client-gated, không tận dụng được mà không auth.
