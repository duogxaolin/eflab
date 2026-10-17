# Tài liệu tham khảo — eflab `docs/`

> **Cập nhật index:** 2026-10-17 (openspec change `eflab-parity-fixes`).
> **Phạm vi:** Các phân tích kỹ thuật về hệ sinh thái cơ sở dữ liệu eFootball (efootbase.com, efhub.com, pesdb.net) và các quyết định thiết kế của eflab. Tài liệu vận hành hiện hành của repo nằm ở `CLAUDE.md` + `README.md` (gốc repo) và `openspec/ui-dna.md`.

## Lưu ý quan trọng

- **Đây là các snapshot có ghi ngày.** Các tài liệu DNA (`*-ui-dna.md`) và phân tích APK mô tả trạng thái của site/app đối chiếu và của eflab **tại ngày ghi trong tài liệu**, không phải trạng thái hiện tại của code. Ví dụ: `efootbase-ui-dna.md` §8 ghi "API key-gated — không dùng được"; kết luận đó đã **bị thay thế** từ 2026-10-06 khi dump efootbase được thực hiện (xem memory `efootbase-datapath`) và eflab dùng dump đó làm nguồn dữ liệu chính. Tương tự, mô tả "card render 4 lớp" trong các doc cũ không còn đúng: `PlayerCard` hiện render **một ảnh** `cards/{id}_dynamic.webp` + overlay HTML (xem `CLAUDE.md` "Image pipeline").
- **Repo là PUBLIC.** Hai API key của bên thứ ba từng được ghi trong `apk-db-expansion.md` và `efootbase-ui-dna.md` đã được thay bằng `<redacted>` trong working tree (2026-10-17); lịch sử git vẫn còn — việc rewrite/rotate là quyết định của chủ repo. Không thêm key, dump, font hay asset có bản quyền vào `docs/`.
- Các tài liệu được tham chiếu trong các bản index cũ nhưng **không tồn tại** trong thư mục này (`pesdb-net-analysis.md`, `data-sourcing-relationships.md`, `datamining-playbook.md`, `technical-recon.md`, `efhub-apk-extraction.md`, `efootbase-apk-analysis.md`) thuộc về workspace của bot bno, không phải eflab.

## Mục lục (đúng 9 file đang có trong `docs/`)

| # | Tài liệu | Ngày | Mô tả ngắn |
|---|----------|------|------------|
| 1 | [apk-db-expansion.md](./apk-db-expansion.md) | 2026-10-07 | Phân tích APK eFootBase (Flutter) + eFHUB (RN) → các gap trong schema eflab (League / Manager / Booster / Player→Team) và cách đã vá. Key trong `.env` của APK đã được redact. |
| 2 | [ecosystem-proposal.md](./ecosystem-proposal.md) | 2026-09-28 | Đề xuất hệ thống ban đầu (web + mobile): phạm vi tính năng, kiến trúc, roadmap. Nhiều tính năng (community, tier list, auth UI, manager page) đã bị gỡ khỏi web 2026-10-07. |
| 3 | [efhub-sqlite-gap-analysis.md](./efhub-sqlite-gap-analysis.md) | 2026-10-07 | eFHUB CDN SQLite công khai (không cần auth): công thức dump, so sánh cột với efootbase, kế hoạch cross-fill (đã thành `pnpm db:crossfill`). |
| 4 | [efhub-ui-dna.md](./efhub-ui-dna.md) | 2026-10-06 | DNA UI + function breakdown của efhub.com (web + APK §15). Tham khảo lịch sử. |
| 5 | [eflab-image-pipeline.md](./eflab-image-pipeline.md) | 2026-10-06 | Pipeline ảnh eflab web tại thời điểm chuyển từ efimg.com sang R2. **Đã cũ** ở các điểm: card hiện là 1 ảnh `_dynamic.webp` + overlay; `efhub-images.ts` không còn caller; domain swap = `R2_PUBLIC_BASE` (API rebase) + `NEXT_PUBLIC_R2_PUBLIC_BASE` (web). Xem `CLAUDE.md` cho trạng thái hiện tại. |
| 6 | [efootball-apk-datamine-analysis.md](./efootball-apk-datamine-analysis.md) | 2026-10-04 | Vì sao không thể tự datamine stats từ APK eFootball mobile (dữ liệu nằm server-side, mã hoá). Vẫn đúng. |
| 7 | [efootbase-efhub-features.md](./efootbase-efhub-features.md) | 2026-09-27 | Kiểm kê tính năng efootbase.com và efhub.com: chủ sở hữu, stack, sitemap, trường dữ liệu, so sánh từng tính năng. |
| 8 | [efootbase-ui-dna.md](./efootbase-ui-dna.md) | 2026-10-06 | DNA UI + function breakdown efootbase.com (web + APK §22) — nguồn của bố cục 4 trang mà eflab đi theo (palette zinc+lime hiện tại lấy từ CSS live của efootbase ngày 2026-10-07, không ghi trong doc này). §8 "API không dùng được" đã bị thay thế (xem Lưu ý). Key trong `.env` của APK đã được redact. |
| 9 | [pesdb-ui-dna.md](./pesdb-ui-dna.md) | 2026-10-06 | DNA UI + function breakdown pesdb.net (nguồn ảnh của bot bno, không phải eflab). Màu tier 90+/80/70/<70 của pesdb là gốc của `--color-tier-*` trong eflab. |

## Ghi chú phương pháp luận

- **ĐÃ XÁC MINH (VERIFIED):** dữ liệu được kiểm tra trực tiếp (curl, inspect payload, đọc header, đọc mã nguồn mở).
- **TIN ĐỒN CỘNG ĐỒNG / CHƯA XÁC MINH:** suy đoán từ dấu hiệu gián tiếp.

Mọi tuyên bố trong các tài liệu được đánh dấu theo phân loại này; khi tài liệu và code mâu thuẫn, code + `CLAUDE.md` là đúng.
