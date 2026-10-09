# eFHUB SQLite dump → eflab DB gap analysis

> 2026-10-07. Dumped eFHUB CDN SQLite (no auth required) và so sánh với eflab Postgres DB + efootbase dump. Mục tiêu: xác định data efhub có mà eflab đang thiếu, đánh giá value từng field/table.
>
> **Phase A DONE 2026-10-07** — see `packages/db/src/seed-efhub-crossfill.ts` (`pnpm db:crossfill`). Items below marked **[✓ done]** in §4. Phase B (MAXBoostedOverall*) + condition history deferred.

## 0. Cách dump eFHUB SQLite (verified 2026-10-07, no auth)

```bash
# 1. Lấy URL dbVersion hiện tại
curl -s https://cdn.efhub.com/liveUpdate.json
# → {"dbVersion":202610012, "androidZstUrl":"https://cdn.efhub.com/files/202610012.bytes.zst"}
# 2. Download + decompress (zstd)
curl -s -o efhub_db.bytes.zst "https://cdn.efhub.com/files/202610012.bytes.zst"
zstd -d efhub_db.bytes.zst -o efhub_db.sqlite
```

- **35MB SQLite**, 21 tables, 44.103 players. Saved at `dump/efhub/efhub_db.sqlite` (gitignored).
- eFHUB có 2 nguồn data RIÊNG BIỆT:
  1. **CDN public JSON** (`cdn.efhub.com/*.json` — 9 files metadata: events, playerUpdates, homescreenplayers...)
  2. **CDN public SQLite** (full DB, 260 cols player + 20 extra tables) ← viết doc này
  3. **Firebase RTDB** (`efootballhub-501e4`, client-gated, 404, không tận dụng được) ← đã verify

→ Bỏ qua "efhub không dump được" — sai. SQLite dump được qua CDN, KHÔNG cần Firebase auth.

## 1. Player count + ID overlap

| | efhub SQLite | eflab DB | efootbase |
|---|---|---|---|
| Total | 44.103 | 48.407 | 48.407 |
| In common (efhub ∩ eflab) | 44.082 | — | — |
| Only in efhub | 21 | — | — |
| Only in eflab/efootbase | 4.325 | — | — |

- **21 efhub-only**: 18 là "Face Edit 01-18" placeholders (bỏ qua đúng) + **3 cầu thủ thật thiếu trong eflab**: 8554053 Ismail Nasrallah, 8554076 Safi Belal, 123236838841410 Robert Lewandowski.
- **4.325 eflab-only**: efhub chưa update, eflab có nhiều hơn (mới hơn) — eflab dẫn đầu.

## 2. Player table — field gap (efhub 260 cols vs eflab schema)

### 2a. efhub có mà eflab CÓ (62 cols đã map ✓)
PlayerID, Name, AccentedName, JapName, ChineseName, Shirt, ShirtNational, Country, Country2, Height, Weight, Age, StrongerFoot, PlayingStyles, RegisteredPosition, GK..CF (13 aptitudes), OffensiveAwareness..GKReach (26 stats), WeakFootUsage/Accuracy, Form, InjuryResistance, PossessionGame, QuickCounter, LongBallCounter, OutWide, LongBall, Trickster..EarlyCross+LongRange (7 playstyles), all s_* skill flags (60+), MAX* stats (26), overall* per position (13), MAXOverall* (13), BoostID, BoostID2, ChineseName, DatapackID, Condition, MarketValue, LevelCap, Cost, Variation, boosterSlot, Stars, PlayingStylesDefensive, momentumDribbling..attacktrigger (16 booster skill flags).

### 2b. efhub có mà eflab THIẾU (worth considering)

| Field | Coverage | Value | Đề xuất |
|---|---|---|---|
| **Reputation** | 40.163/44.103 (91%) | Cầu thủ rarity/rep — quan trọng cho UI sorting | ADD |
| **GKClearing** | 44.103/44.103 (100%) | Stat GK thứ 6 (eflab chỉ có 5 GK stats) | ADD |
| **OverallPotential** | 100% | Potential OVR ceiling — build simulator | ADD |
| **MAXBoostedOverallGK..CF** (13 cols) | 100% | OVR với booster equipped — build/deck planner | ADD |
| **MAXShootingGroup..MAXGK3Group** (10 stat-group sums) | 100% | Aggregate display | LOW (derive client) |
| **MAXPossessionGameGroup..MAXOutWideGroup** (5, TEXT) | 100% | Tactic compatibility với booster | LOW |
| **IdClub** | 32.353 (73%) | Club binding (real contract) | LOW (Player→Team from efootbase) |
| **ContractExpiryDate, LoanExpiryDate** | 100% / sparse | Contract metadata | LOW |
| **PlayingAttitude** | 15.637 | Play attitude flag | LOW |
| **DataPackOneChange, DataPackTwoChange** | 3.367 | Datapack change flags | LOW |
| **OverallPotential89** | sparse | Potential at 89 | LOW |
| Commentary, GoalCelebration, HiddenPlayer, New, YouthClubID, OwnerClub, BaseContractCost, MaxContractCost | sparse/0 | Cosmetic/unused | SKIP |

**Bug phát hiện**: eflab có `stars`, `marketValue` column nhưng seed luôn 0 (efootbase API không expose). efhub SQLite CÓ data thật (Ronaldo Stars=5). Cần seed efhub → fill `stars`/`marketValue`/`reputation`.

**5 player table bonus có sẵn trong efhub + eflab đã có từ efootbase**: `PlayerAppearance` (44.103 physique/body), nhưng eflab seed từ efootbase `players.jsonl` max_attributes+ physique. Verify: efhub PlayerAppearance ID→PlayerID đồng bộ, eflab có neck/shoulder/chest/waist/arm/thigh/calf/leg + 5 physics. efhub thêm `LegCoverageDistribution`/`ArmCoverageDistribution`/`DribbleHeightDistribution`/`TorsoCollisionDistribution` (4 distribution floats — outlier picks).

## 3. efhub extra tables — eflab equivalents

| efhub table | rows | eflab equiv | gap |
|---|---|---|---|
| **coaches** | **1.527** | Manager (65) | ❌ lớn — efhub có 1.527 HLV với tactic ratings (PossessionGame/QuickCounter/LongBallCounter/OutWide/LongBall/Affinity/MarketValue). eflab chỉ có 65 manager (từ efootbase APK bundle, không có tactic ratings). |
| **teams** | 981 | Team (707) | ⚠️ efhub dùng Konami CountryID (numeric), eflab dùng sequence id + name. efhub 981 gồm club + national. eflab tự build từ player.team_name → đủ. |
| **CountryBin** | 215 | Country (185) | ⚠️ efhub 215 (Konami country ID → name + Region + Continent). eflab 185 từ efootbase nationality name. 30 dư là micro-nations. |
| **Boost** | 547 | Booster (39) | ❌ efhub 547 boost versions (BoosterVersion column scales từ +1..+5). eflab 39 unique. efhub có full +1/+2/+3/+4/+5 — eflab derive runtime. |
| **formations** | 934 | (none) | — eflab không có schema. |
| **player_tiers** | 10.763 | (Player.communityTier? empty) | ❌ efhub tier mapping (S+/S/A/B/C/D/E) — useful cho UI tier badge. eflab có column `communityTier` rỗng. |
| **PlayerWeekly** | 6.793 | (none) | — weekly player snapshot (id+condition). |
| **PlayerConditionHistory** | 35.047 | (none) | — 24-week condition A-E history (week1..week24). |
| **VariationDetail** | 12.705 | (Pack? 2044) | ⚠️ efhub card variations + release date — tương đương Pack nhưng có Date. |
| **PlayerAppearance** | 44.103 | (in Player) | ✓ đã có trong Player (from efootbase physique). |
| **IDTeam, CoachLinkUps, BoostCoaches, CompetitionEntry, Regulation, NewPlayers** | small | (none) | — CoachLinkUps (12 group tactic), BoostCoaches (67 — coach boost ability mapping), NewPlayers (75 latest release), CompetitionEntry (627 — tournament), Regulation (46). |

### Coaches/Manager gap (1.527 vs 65) — quan trọng nhất

efhub `coaches` table có 1.527 HLV với đầy đủ tactic ratings:
```
Id, coachesName, Country, Age, Adaptability, PossessionGame, QuickCounter,
LongBallCounter, OutWide, LongBall, OverLoad, Affinity, MarketValue, New,
LinkUpID, LinkUpID2
```
eflab `Manager` (65, từ efootbase APK) chỉ có: id, name, rating, booster1Stat, booster2Stat, imageUrl. **THIẾU tactic ratings** (PossessionGame/QuickCounter/LongBallCounter/OutWide/LongBall — 5 stat Player đã có cùng tên column nhưng cho Player, không cho Manager).

→ efhub là nguồn ĐÚNG cho Manager tactic ratings. efootbase đã bỏ qua field này (chỉ expose booster stat slugs).

### Boost 547 vs Booster 39

efhub Boost table có BoostID + BoosterVersion (1-5) → 547 = ~39 unique × ~14 versions? Verify: 547 = full grid name×version. eflab derive +2/+3/+4/+5 tại runtime, không lưu row riêng. Hiện đủ.

### player_tiers 10.763 (S+/S/A/B/C/D/E)

efhub pre-compute tier per PlayerID. eflab có `Player.communityTier String?` column rỗng. Seed được từ efhub — useful cho UI tier badge color (S+/S/A = top tier).

## 4. Tóm tắt ưu tiên

### ADD (real impact, data available, easy) — ✓ Phase A done 2026-10-07

1. **✓ Manager tactic ratings** — `pnpm db:crossfill` phase 1 cross-joins efhub `coaches` (1.518 valid → 1.454 distinct names) vào eflab Manager. eflab Manager 65 → 1.482 (65 giữ R2 art + 1.417 new no-art). Tactic fill theo ID, rồi name-merge với ALIASES map cho efhub tên viết tắt ("D. Deschamps" ↔ "Didier Deschamps"). 4 art rows vẫn tactic=0 (Roberto Martínez ×2, Vincenzo Montella ×2 — efhub không có coach tên này). Adaptability skip (efhub luôn 0).
2. **✓ Player.Reputation (40.163 filled = 91%) + Stars (44.085)** — cross-fill Phase 2. MarketValue SKIPPED (efhub const=100, vô dụng).
3. **✓ Player.gkClearing (4.587 GKs) + Player.OverallPotential (44.085) + player_tiers → communityTier (10.745)** — columns mới (reputation/overallPotential/gkClearing/maxGkClearing) added vào Prisma schema + push. NOT touching efootbase ovr/stats (efhub `Overall` raw-weighted 40-120, không phải display OVR).
4. **✓ 3 cầu thủ thiếu** — Phase 4 inserts: Ismail Nasrallah (8554053, Qatar GK), Safi Belal (8554076, Qatar GK), Robert Lewandowski special (123236838841410, Poland CF, BIG_TIME — base 40002 đã có từ efootbase). ovr/maxOvr=40 placeholder (R2 404 → gradient fallback). Country lookup efhub Country=30→"Qatar"→eflab Country.id 85; Country=227→"Poland"→id 50.

### LATER (low impact, deferred)

- **MAXBoostedOverall* (13)** (Phase B — build simulator depth, cần 13 column mới)
- PlayerConditionHistory (24-week A-E), PlayerWeekly, VariationDetail (release date per pack), formations, CoachLinkUps/BoostCoaches/CompetitionEntry/Regulation.

### SKIP (cosmetic/unused, confirmed 2026-10-07)

- Player.MarketValue (efhub const=100 — normalize vô dụng, bỏ qua trong cross-fill)
- Commentary, GoalCelebration, HiddenPlayer, YouthClubID, OwnerClub, BaseContractCost, MaxContractCost (sparse/zeros).
- MAX*Group aggregate stat sums (derive client).
- 4 art rows Manager tactic=0 (Roberto Martínez ×2, Vincenzo Montella ×2 — efhub không có coach tên này, không có data để fill).

## 5. Verify card-render unaffected

All efhub additions (manager tactic ratings, player reputation, tiers) are DATA-ONLY changes — no image pipeline impact. Player cards render unchanged. Manager cards already show `imageUrl` from efootbase APK art on R2.

## Status

- **Phase A ✓ DONE 2026-10-07** — all 4 items (managers 65→1482 with tactic, 4 new player columns filled, 10763 tier badges, 3 missing players). Script: `packages/db/src/seed-efhub-crossfill.ts` (`pnpm db:crossfill`). Memory: `eflab-efhub-crossfill`.
- **Phase B (deferred)**: MAXBoostedOverall* (13) — build simulator depth, needs 13 new columns.
- **Phase C (deferred)**: 3 missing players ✓ (moved up into Phase A4) + condition history (optional).
