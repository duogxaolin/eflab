# Phân tích eFootball APK 11.0.1 — datamine feasibility

> File: `eFootball™_11.0.1_APKPure.xapk` (822MB)
> Package: `jp.konami.pesam` (Konami official, version 11.0.1)
> Ngày phân tích: 2026-10-04
> Mục đích: xem có thể tự datamine player data từ game install thay vì dùng bên thứ 3 (pesdb/efhub/efootbase) không.

## TL;DR

- eFootball mobile = **hybrid engine**: CRIware CPK (system data) + Unreal Engine 4 (assets/3D).
- **Player stats KHÔNG nằm trong APK.** Game tải player data từ server Konami khi chạy, lưu vào `/data/data/jp.konami.pesam/files/` (private app dir, cần root).
- APK chỉ chứa: code Kotlin/Android, engine config (CPK 9.4MB), sound/model assets (CPK 286MB + UE4 pak 103MB).
- → **Không thể datamine player data từ APK.** Phải hoặc: (a) root device dump data khi game chạy, (b) parse server protocol (encrypted), (c) dùng data đã extract sẵn (WebTedEditor / pesdb / efhub).

## Cấu trúc APK

```
eFootball™_11.0.1_APKPure.xapk (822MB)
├── jp.konami.pesam.apk       (21MB)   base — code Kotlin/Android, activities
├── config.arm64_v8a.apk      (57MB)   native libs (lib UE4 + CRIware)
├── config.en.apk             (33KB)   English strings
├── config.mdpi.apk           (59KB)   resources
├── pad_it_0.apk              (386MB)  asset expansion split
│   └── assets/dt200_mobile_all.cpk  (9.4MB)   CRIware CPK — system/sound config
├── pad_it_1.apk              (395MB)  asset expansion split
│   ├── assets/dt540_mobile_all.cpk  (286MB)  CRIware CPK — sound/models
│   ├── assets/pc0000_mobile_and.pak   (103MB)  UE4 pak — engine assets
│   ├── assets/pc0010_mobile_and.pak   (1.6KB)  UE4 pak (patch)
│   ├── assets/pc0010_mobile_and.ucas  (6.4MB)  UE4 archive
│   └── assets/pc0010_mobile_and.utoc  (82KB)   UE4 table of contents
└── manifest.json
```

## Engine components

### CRIware CPK (`dt200_mobile_all.cpk`, `dt540_mobile_all.cpk`)
- Magic: `CPK ` + `(c)CRITOC` → CRI Middleware CPK format (giống PES series cũ).
- `dt200` (9.4MB): system config, UI layout, sound definitions. TOC ở offset 0x800, nén.
- `dt540` (286MB): sound effects + model assets.
- Strings trong `dt540` : chỉ `SE_*_PLAYERCALL`, `region_playercall-*` (âm thanh khi cầu thủ được gọi) — không có stats.
- Tool extract công khai: `CriPakTools` (esperknight/CriPakTools, C#/Windows, 257★), `YACpkTool` (Brolijah, 100★).

### Unreal Engine 4 (`pc0000_mobile_and.pak` + `.ucas`/`.utoc`)
- UE4 pak archive (magic `pak`), chứa 3D models, blueprints, textures.
- `pc0000` (103MB): asset chính — chứa class names UE4 (`AnimGraphNode_*`, `AIIgnorePlayers`).
- Strings: chỉ engine class + asset path UE4 — không có player data.
- Tool extract: `AssetStudio` (Perfare/AssetStudio, 15.5k★, C#) — extract texture/mesh từ UE4 pak.

## Player data — ở đâu?

| Vị trí | Có player stats? | Trạng thái |
|---|---|---|
| base APK | ❌ | Kotlin code, chỉ có活動 layman API URLs |
| dt200 CPK | ❌ | system config |
| dt540 CPK | ❌ | sound + model |
| pc0000 UE4 pak | ❌ | 3D assets + blueprints |
| Server Konami (live update) | ✅ | **game tải khi chạy**, encrypted, private |
| `/data/data/jp.konami.pesam/files/` (device) | ✅ (sau khi chơi) | **cần root** để truy cập |

**Bằng chứng (strings scan)**: không tìm được `Messi`, `Haaland`, `Player.bin`, hay bất kỳ player name/stats string nào trong 4 file data. Chỉ có sound cue names (`SE_*`) và UE4 class names.

## Quyết định data source cho bno

Tự datamine từ game install **không khả thi**:
1. **APK**: không chứa player stats (server-side).
2. **Root device**: dump data khi game chạy — cần thiết bị Android đã root, manual, không auto được khi Konami update.
3. **Server protocol**: encrypted, reverse-engineering protocols — mất nhiều tuần, ToS risk, không có tool công khai.

→ Bno phải dùng data đã extract sẵn (WebTedEditor là dataminer chuyên nghiệp, hoặc pesdb/efhub là scraper đơn giản). Tự datamine = effort cao, kết quả cũng vẫn phải dựa bên thứ 3 hoặc tool đóng.

## Tools đã xác nhận tồn tại (GitHub, công khai)

| Tool | Repo | Ngôn ngữ | Chức năng |
|---|---|---|---|
| CriPakTools | esperknight/CriPakTools (257★) | C# | Extract/list/update CRIware CPK |
| YACpkTool | Brolijah/YACpkTool (100★) | — | Extract/pack/patch CPK |
| CriFsV2Lib | Sewer56/CriFsV2Lib (45★) | C# | CPK extract library |
| AssetStudio | Perfare/AssetStudio (15.5k★) | C# | Extract UE4/Unity textures/mesh |
| EvoTool | dariodenardi/eFootball2022-Project (34★) | C# | Edit eFootball .bin (player WIP) |
| PES-2021-Cheat-Table | xAranaktu (65★) | — | Cheat Engine table, parse memory PES 2021 |

Không có 1 tool open-source nào parse `Player.bin` của eFootball mới ra JSON/CSV. Tất cả site DB (pesdb, efhub, efootbase, WebTedEditor, pesmaster, efootballdb) đều tự giữ tool parse binary Konami (`Player.bin`) hoặc tự RE format.

## Update pipeline engine (ghi chú kỹ thuật)

Khi Konami update eFootball:
1. Game client tải live-update manifest từ server.
2. Tải dữ liệu mới về `/data/data/jp.konami.pesam/files/` (hoặc `/sdcard/Android/data/jp.konami.pesam/`).
3. Site DB (pesdb etc.) cập nhật DB của họ bằng tool parse riêng — delay vài giờ đến vài ngày.
4. Bno muốn tự datamine = phải có tool parse server protocol (không công khai) + tài khoản game + thiết bị.

**Trạng thái bno**: Path E (efhub CDN) primary, Path A (pesdb) fallback — vẫn dùng được, không cần datamine riêng.
