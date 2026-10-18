## 1. Progression (shared + web)

- [x] 1.1 Open the panel on the Max-OVR build with both boosters on; redefine the custom-build notion relative to that default; keep Reset (zero) and Max OVR.
- [x] 1.2 Show points in whole-point units (double the half-points) for budget, used and next cost; update aria text and tests.
- [x] 1.3 Rename categories to Lower Body Strength, Aerial Strength and Goalkeeper 1/2/3.
- [x] 1.4 Replace the level-cap-1 note text so it states that progression and manager data are unavailable for the card.
- [x] 1.5 Honest estimate label (Manager Proficiency missing, measured gap) using the measured numbers; optionally fit and verify a proficiency model on fresh measurements (≥3 other cards incl. a goalkeeper, ≥95% within ±1 on ≥30 held-out builds) and ship the slider only if it passes. ← (verify: label text matches the measured gap; if a slider ships, the held-out numbers are recorded)

## 2. Players (API + web)

- [x] 2.1 Default scope = all card types; fix the home quick filter wiring and the URL parameters accordingly; update the scope chip.
- [x] 2.2 Label changes (Nation, Base/Max Overall Rating, card-type names via the single label table where verified).
- [x] 2.3 "Sort" control with presets Trending, New cards, Top rated, High to low, Low to high and documented definitions.
- [x] 2.4 Filters in priority order: base/max overall ranges, condition, form, WF accuracy/usage, height/weight/age, skills, league, team, stat ranges, body-model ranges; API inputs with EXPLAIN checks; URL state; page reset. Stop any filter that cannot be done correctly and report it.
- [x] 2.5 Playing-style lists reconciled with the dump meta and real cards; no invented ids. ← (verify: each filter returns only matching rows; EXPLAIN under 100 ms for common combos; URL round-trips)

## 3. Detail

- [x] 3.1 Single overall pill; Card Info block with copy control; Body Model, Injury Resistance and Form sections.
- [x] 3.2 Stat grid wide enough that no stat name is truncated at 1280 and 390 px; booster "+N" chips; fifth tier colour from the tier tokens; click-to-highlight.
- [x] 3.3 Skill label table (web only) with Showtime skills first; proficiency text "N Full · N Half". ← (verify: no truncation at 390 px; labels match the observed list; tokens are the single colour source)

## 4. Packs, Skills, Home, Header

- [x] 4.1 Remove emoji from the packs header; count unique players.
- [x] 4.2 Skills grouped Showtime/Classic where verified; drop invented tier labels; no synthesised rarity or boosts.
- [x] 4.3 Palette placeholder, Esc chip and the `/` shortcut; keep or relabel the home sections per verified definitions.

## 5. Docs and verification

- [x] 5.1 Update CLAUDE.md, README.md and openspec/ui-dna.md (default scope correction, point unit, default boosters, labels) and add the new limits (stale dump, proficiency findings, no Position Training or In-Match Roles, API blocked for comparison).
- [x] 5.2 Update unit tests, smoke test and Playwright checks for the new behaviour. — Evidence: `pnpm --filter @eflab/shared test` (progression + helper suites incl. point unit, labels, range round-trip, preset/style consistency) and `scripts/smoke-test.sh` (default scope, 5 presets, filters, 400s, leagues/teams) are updated and green; Playwright `scratchpad/pw/parity-x.mjs` 123 checks (agent X) + `scratchpad/pw/verify-y2.mjs` 25/25 (verify round: counter wording/`Updating…`/aria-busy, `Early Crosser`, `/` kbd, `aria-haspopup="dialog"`, grid classes, Body Model/Form/Injury values, Cruyff dropdown ⊆ list 9/9, inverted range dropped, 0 console errors).
- [x] 5.3 `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @eflab/web build`, `openspec validate --specs` pass; Playwright on API 5400 / web 3400 covers the completion criteria with recorded numbers (including First Load JS before/after, at most +5 kB per route); no DB writes, nothing committed or pushed. ← (verify: measured results meet every spec scenario; honest list of what was not delivered) — Evidence (2026-10-18 verify round): `pnpm -r typecheck` 4/4 packages green; `pnpm test` = unit green + smoke **29 passed, 0 failed** on :4300; `pnpm --filter @eflab/web build` exit 0 — First Load JS `/` 162 kB, `/players` 168 kB (+5 vs before), `/players/[baseId]/[cardId]` 170 kB, `/packs` 158, `/skills` 161, `/compare` 163, shared 103 kB unchanged; `openspec validate efootbase-parity-round2 --strict` + `openspec validate --specs` 20/20 green; Playwright on API 5400 / web 3400 (agent X, 123 checks) and API 5700 / web 3700 (verify round, 25/25); read-only psql only, nothing committed or pushed. Not delivered (see notes-x.md "Not shipped"): Manager Proficiency slider, Community Rating filter, multi-select Position/Nation/League/Team, ISO nation codes, Long Ranger / 4 post-dump styles / 5 post-dump Showtime skills, efootbase's real Trending order.
