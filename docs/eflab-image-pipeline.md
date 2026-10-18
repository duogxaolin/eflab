# eflab web — image pipeline (Konami card renders from efimg.com)

> Ngày xác minh: 2026-10-06
> Scope: **eflab web** (`apps/web`). KHÔNG áp dụng cho bot **bno** (bno dùng ảnh pesdb — xem memory `bno-bot-data-decision`).

## TL;DR

PlayerCard render **ảnh card Konami chính chủ** từ `efimg.com` (CDN của efhub), không phải card vẽ bằng CSS. Ảnh có sẵn face + OVR + position + club — không cần vẽ thêm lớp cyber content đè lên. 20/20 card load OK, 18/20 flag OK (Egypt 58 + Korea 16 là gap của CDN, không phải bug code).

## Quyết định & phân biệt với bno

| Project | Ảnh card | Lý do |
|---|---|---|
| **eflab web** (repo này) | `efimg.com` Konami render (`player_cards/{PID}_l.png`) | User OK với logo efhub; render đẹp, sẵn OVR/position/club; không cần tự vẽ. |
| **bno bot** (riêng biệt) | `pesdb.net` card (`/assets/img/card/{m\|b\|f\|c\|p}{PID}.png`) | User KHÔNG muốn logo/watermark efhub trên ảnh bno. |

→ Hai project, hai quyết định khác nhau. Đừng copy pattern ảnh từ project này sang bno hoặc ngược lại.

## URL helpers — `apps/web/lib/efhub-images.ts`

> 2026-10-18: file này đã bị xoá trong change `remove-dead-surface` (không còn caller). Helper hiện tại là `apps/web/lib/r2-images.ts` — xem `CLAUDE.md` "Image pipeline". Phần dưới là snapshot lịch sử.

```ts
const EFIMG_BASE = "https://efimg.com/efootballhub22/images";

// Ảnh card 240×339 (~110KB). Face + OVR + position + club baked-in.
playerCardUrl(playerId) → `${EFIMG_BASE}/player_cards/${playerId}_l.png`;

// Cờ quốc gia 128×128 (~5KB). CountryID là Konami nationality id (227=Poland, 144=Argentina...).
flagUrl(countryId) → `${EFIMG_BASE}/symbol/Nationality/${countryId}.png`;

// Emblem CLB, zero-pad 6. ~25% team ảo/đặc biệt 404 → caller onErrorHide.
emblemUrl(teamId) → `${EFIMG_BASE}/symbol/Emblem/e_${String(teamId).padStart(6,"0")}.png`;
```

### Lưu ý kỹ thuật quan trọng

- **`efimg.com` chặn HEAD request** (luôn trả 404). Phải dùng **GET** với header `User-Agent` (ví dụ `bno-test/1.0`) và đọc ≥4 byte để xác nhận.
- **Mini-cards** (`mini-cards/mini-cards/{id}_l.png`) trả 404 tính đến 2026-10 — chỉ `player_cards` hoạt động.
- **Flag zero-pad**: memory cũ ghi pad 3 (`{CountryID:03d}`), nhưng test thực tế Poland 227 OK với `{CountryID}` không pad. ID 58 (Egypt) và 16 (Korea) 404 là gap CDN, không phải padding bug → không cần pad.
- **EmblemLC giải đấu**: 404 với mọi pattern thử → bỏ qua.

## Component — `apps/web/components/cards/PlayerCard.tsx`

`"use client"`, 3D CSS tilt + glare (KHÔNG dùng Three.js/WebGL):
- Raw `<img>` (không phải `next/image`) — tránh overhead optimize ảnh external, load thẳng.
- `onError` → fallback gradient + initial + OVR + position.
- Flag top-right, `loading="lazy"` (flag trang trí, không cần eager).
- Card art eager load (card là main content).
- Strip tên+meta ở bottom, semi-transparent, đọc được trên card art.
- Cyber content (stat highlights, booster badges, OVR number đè lên) **đã bỏ** vì Konami card đã có sẵn.

### Tại sao dùng raw `<img>` không phải `next/image`

1. Ảnh external từ CDN không cần Next optimize.
2. `next/image` trigger optimizer proxy → chậm hơn GET thẳng.
3. `next.config` đã có `remotePatterns: [{ protocol: "https", hostname: "**" }]}` → cho phép mọi host (không cần config riêng cho efimg.com).

## Verification (2026-10-06)

- API `player.list` (tRPC GET, batch + superjson wrap) trả 20 player với `id`, `nationalityId` đúng.
- `curl` GET (kèm `User-Agent`) tới 20 URL card: **20/20 PNG hợp lệ** (~110KB mỗi cái).
- Playwright (dùng `playwright-core` từ `/Users/duogxaolin/.dev-browser/node_modules/playwright-core` vì repo chưa cài playwright) screenshot `/players`: **20/20 card render trong DOM**.
- Flag: **18/20** OK. Egypt (CountryID 58, Salah) và Korea (CountryID 16, Son) 404 → fallback ẩn gracefully (flag chỉ trang trí, `onError` không có nhưng ảnh broken cũng không vỡ layout vì `object-cover` + ring).

## Magnitude (test đã có sẵn)

- Players: 20 iconic (Lewandowski, Messi, Haaland, Bellingham, Yamal, Mbappé, Vinicius, Salah, De Bruyne, Ronaldo, Van Dijk, Kroos, Benzema, Pedri, Foden, Saka, Griezmann, Son, Marquinhos, Rúben Dias).
- Cards: 20/20 OK, ~110KB/cardia → ~2.2MB ảnh card.
- Flags: 18/20 OK, ~5KB/cờ.
- Screenshot: `/tmp/eflab_shots/players_cards_final.png` (1.93MB, 20 card render).

## Pipeline dữ liệu (tóm tắt)

> Cập nhật 2026-10-07: eflab đã chuyển nguồn data từ efhub sang **efootbase**. Phần này giữ lại cho reference lịch sử; xem `CLAUDE.md` "Player data pipeline" cho flow hiện tại.

1. **Source (hiện tại)**: efootbase API dump → `dump/efootbase/players.jsonl` (48.407 player) + `dump/efootbase/images/` (93.501 file ảnh) → mirror Cloudflare R2 bucket `efootlab`. Xem memory `efootbase-datapath`.
2. **Seed (hiện tại)**: `pnpm db:seed` (`packages/db/src/seed-efootbase-full.ts`) stream `players.jsonl` → Postgres + populate `Country.flagUrl`/`Team.emblemUrl` từ `emblem_images` hash. Idempotent, ~60s.
3. **Render**: `/players` page gọi `trpc.player.list.useQuery` → `PlayerCard` component → `playerCardUrl(player.id)` → `<img src=R2/cards/{PID}_transparent.webp>`, fallback efimg.com cho flag khi DB chưa populate.

(Legacy efhub path đã xóa 2026-10-07: `scripts/gen-players-from-efhub.py`, `packages/db/src/seed-full.ts`, `db:seed:mock`, `db:seed:full`, `db:seed:r2`.)

## Known limitations

- 2 flag 404 (Egypt 58, Korea 16) — gap CDN efhub, không phải bug. Có thể map sang `flagcdn.com` làm source phụ nhưng là polish, out of scope hiện tại.
- ~25% emblem đội ảo 404 — chưa dùng emblem trong UI nên chưa xử lý; khi dùng thì cần `onError` hide.
- Repo chưa cài `playwright` — phải dùng `playwright-core` từ `/Users/duogxaolin/.dev-browser/node_modules/playwright-core` khi cần screenshot test.

## Out of scope

- Dump ảnh về máy (CDN đủ nhanh, web fetch trực tiếp khi render).
- Dùng efootbase ảnh (key hardcode, ToS risk — đã chốt bỏ).
- Three.js/WebGL card (CSS 3D đủ đẹp, headless-scraper safe, low-end device friendly).
