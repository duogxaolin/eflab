## 0. Branch and backup

- [x] 0.1 Create branch `efootbase-static-data` from `main` (3c8fcb0); no push, no commits to `main`. Take a `pg_dump -Fc` backup outside the repo and prove it with `pg_restore --list`; record row counts. ← (verify: backup exists outside the repo; counts recorded)

## 1. Data files and object storage

- [x] 1.1 Place the survey snapshot into the git-ignored dump area as `static/skills.json` and `static/managers.json` (plus the icon and manager image folders); write the documented regeneration procedure (best effort, fragile) without automating page loads.
- [x] 1.2 Upload the 67 skill icons to `skills/{Skill_Name}.webp` and the 4 new manager images to `managers/{id}.webp` with the existing upload tool; verify 200 responses with HEAD requests. ← (verify: 71 files return 200; no credentials printed)

## 2. Database and seed

- [x] 2.1 Prisma schema and one migration: Skill gains `efbKey` (unique, nullable), `group` (Showtime/Classic, nullable), `sortOrder`, `released` (default true), `iconKey`, `effects` (JSON), `activation`; Manager gains `inPicker` (default false). Apply with `migrate deploy`; `migrate diff` against the schema is empty; a scratch database built from migrations matches.
- [x] 2.2 Seed: read the two static files; attach metadata through the verified mapping; update display names and descriptions; map effects with one explicit attribute table and abort on unknown keys; add the 5 unreleased skills as hidden; keep the 17 non-skill entries without a group; upsert managers by id on fixture-owned columns and set `inPicker` for exactly 69 ids.
- [x] 2.3 Fact-only fixtures: add the 4 new managers (id, name, rating, pill stats) and fix the misspelt manager name in `packages/db/fixtures/managers.json`.
- [x] 2.4 Extend `scripts/verify-seed.py` (67 released skills with description and icon key, Showtime 23 and Classic 44, 69 `inPicker`, all effects mapped, player-skill total unchanged) and load the snapshot with the non-destructive seed (the number of seed runs was not logged; the verified facts are the end state and the single-transaction upsert). ← (verify: player-skill total unchanged, cross-fill data intact, user rows 8/12/8)

## 3. API and shared types

- [x] 3.1 Skill list and detail return description, group, icon URL (rebased), effects (eFootLab stat names), activation and released; hide unreleased skills from public lists; update shared types and schemas.

## 4. Web

- [x] 4.1 Skills pages: icon, real description, group Showtime/Classic from data (replace the locally inferred Showtime list where the data exists), effects and activation text; the "Other" section keeps the non-skill entries.
- [x] 4.2 Player detail page: skill chips show the icon and open a keyboard-accessible popover with description and effects; no horizontal overflow at 320–480 px; icons load lazily. ← (verify: popover works by keyboard; no layout shift; zero console errors)

## 5. Docs and verification

- [x] 5.1 Update CLAUDE.md, README.md and `openspec/ui-dna.md`: data sources, snapshot regeneration, limits (effects only for skills seen on loaded cards; the 5 unreleased skills are hidden and have a description and group but no icon, effects or holders; third-party content stays outside the repository).
- [x] 5.2 `pnpm -r typecheck`, `pnpm test` (smoke extended), `pnpm --filter @eflab/web build`, `openspec validate --specs` pass; Playwright on API 6900 / web 3900 covers skills pages and chips with numbers; First Load JS grows by at most 3 kB per route; secret scan; nothing committed to `main`, nothing pushed. ← (verify: measured results meet every scenario; no third-party text, image or JSON in the diff)

## 6. Verification follow-ups (independent verify: 5 warnings, 6 suggestions)

- [x] 6.1 Skill popover always fits the visible viewport: height capped (`100dvh` − 16 px, refined from `visualViewport`), scrolls inside, below → above → roomier side then clamped 8 px inside on every side; focused element scrolled into view inside it; first placement in a frame callback from `beforetoggle` (no unplaced first frame); `aria-expanded` set from the toggle state. ← (verify: Playwright at 320×568, 375×667, 390×844, 667×375, 1280×800 on three 10-skill cards, first / middle / last chip, chip at top / centre / bottom: popover inside the viewport, Tab link visible, no horizontal overflow, CLS unchanged, AX tree reports expanded)
- [x] 6.2 Manager tactics of the two new picker cards that are not eFHUB ids (Klopp 17609902885263, Chivu 17610171323785): checked read-only (eFHUB has one Klopp entry, two Chivu entries, none for these ids); the inherited tactics are documented in the cross-fill comments, CLAUDE.md, README and the snapshot doc. Whether the name merge should keep copying another card's tactics is an open owner decision.
- [x] 6.3 `scripts/verify-seed.py` manager-duplicate check made strict again: twins found by case- and accent-insensitive name, cross-fill alias or the eFHUB name of the art row's id; a twin fails unless its art row has no tactics yet and eFHUB can fill it (pending, info); `--after-crossfill` makes pending rows fail. ← (verify: live DB 0 failures + 4 pending art rows / 2 pending twins listed; simulated post-refresh state passes in both modes; simulated left-over, accent and alias twins fail)
- [x] 6.4 Docs describe the 5 hidden skills correctly (description, group, key and order stored; no icon, effects, activation or holders) and state that a seed without `skills.json` erases skill metadata while `inPicker` is left alone.
- [x] 6.5 No unlogged claim about how often the seed ran; the artifacts state what is verifiable.
- [x] 6.6 Suggestions: skill artwork drawn uncropped (`object-fit: contain`, two measured sizes documented); snapshot doc no longer mentions a non-existent `icon` field; "Showtime group" scenario names all three sections; pill columns' snake_case → camelCase change documented.
