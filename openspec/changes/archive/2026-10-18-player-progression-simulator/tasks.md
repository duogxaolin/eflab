## 1. Shared engine and oracles (packages/shared)

- [x] 1.1 Replace `TRAINING_CATEGORIES` with the ten categories and add `TRAINING_STATS` in `constants.ts`; update `TrainingCategory`.
- [x] 1.2 Rewrite `progression.ts`: `trainingPointsAvailable = levelCap − 1`, `categoryCost`, `maxGainForBudget`, `applyTraining`, `applyBoosters` (no 99 clamp), `simulateBuild`; remove the invented manager constants and unverified canonical boosters if nothing else imports them.
- [x] 1.3 Add `ovrWeights.ts` (13 positions, header with source and fit quality) and `projectOvr`; add `bestAllocation` (DP over categories in half-point units).
- [x] 1.4 Update `types.ts` (`BuildConfig`, `BuildResult`) and `schemas.ts` (`buildSimulateInput`, `buildSaveInput`) to the ten categories without manager fields.
- [x] 1.5 Create `src/__fixtures__/progression-oracle.json` (≥200 sampled cards, ≤300 lines) from the hub data via a read-only scratch script; confirm it has no names, ids tied to secrets, or key material.
- [x] 1.6 Replace `progression.test.ts` with oracle tests: stat map exactness, cost curve (incl. c(2)=1 … c(22)=36), budget invariant, OVR within ±1 for ≥99% of outfield fixtures (report GK separately), `bestAllocation` ≥ reference − 0.8, edge cases (level cap 1 → 0 points, booster by id, GK Jump marker). ← (verify: `pnpm --filter @eflab/shared test` passes and fails when a cost value is changed)

## 2. API and consumers (apps/api, apps/web compile-only)

- [x] 2.1 Check `player.byId` returns `levelCap`, `booster1`, `booster2` with sparse stat vectors; adjust the DTO only if a field is missing.
- [x] 2.2 Update `community.simulate`/`saveBuild` to the new engine and schemas (read-only DB checks only; no write mutations are called during tests).
- [x] 2.3 Make `components/build-simulator/BuildSimulator.tsx` compile against the new types without deleting it.
- [x] 2.4 Fix `CompareClient.parseIds` to reject ids above the int8 maximum and add a Remove control to the error slot. ← (verify: `/compare?ids=9999999999999999999,<valid>` shows the valid card)

## 3. Progression panel (apps/web)

- [x] 3.1 Add the panel to the player detail page: Max Level input (1..levelCap), 13-position selector, ten category steppers with next cost, points used and left, Booster 1/2 toggles with names and deltas, Max OVR and Reset; hide it and show a note when `levelCap ≤ 1`.
- [x] 3.2 Feed projected stats and the "~" estimated overall into the stat sections and the card overlay; disable the existing "stats at max level" toggle while a custom build is active; mark GK Jump "n/a (card-specific)".
- [x] 3.3 Accessibility and responsiveness: labelled steppers with `aria-valuenow`, keyboard operation, a live region announcing remaining points and overall, no horizontal overflow at 320–480 px. ← (verify: spec scenarios of `player-progression-simulator`; keyboard flow; 320 px scrollWidth equals viewport with the body guard disabled)

## 4. Docs

- [x] 4.1 Update `CLAUDE.md`, `README.md` and `openspec/ui-dna.md`: panel behaviour, rules, estimate caveat, remove the "Progression removed" limitation, record the remaining limits (OVR estimate, GK Jump, manager hidden, level cap 1 cards, weights depend on the game version, regeneration notes).

## 5. Verification

- [x] 5.1 `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @eflab/web build`, `openspec validate --specs` all green.
- [x] 5.2 Playwright (ports 4700/3700): steppers, budget never exceeded, Max OVR, Reset, booster toggles, hidden panel for a level-cap-1 card, GK case, keyboard, 320/375/480 px; record oracle error numbers. ← (verify: measured numbers meet the spec thresholds)
- [x] 5.3 Confirm `git status` has only in-scope files, nothing committed or pushed, no dumps or keys, ports free.

## 6. Verify fixes (independent verification, 2026-10-18)

- [x] 6.1 C1 — Max Level input: draft while typing, commit + clamp on blur / Enter, spinner and arrow keys commit at once, invalid drafts revert, allocation reset only when the committed level cannot afford the spend (announced in the live region). ← (verify: Playwright typing flows on Kluivert 134592/87963614711232)
- [x] 6.2 W2 — proficiency: fit `OVR_PROFICIENCY_ADJUST` (per position, half / none, floor 40) from the hub data, verify on held-out cards (half 99.9 %, none 99.7 % outfield, GK-none 100 %), label every position option with its proficiency, swap the accuracy note, pass `positionAptitudes` to `simulateBuild`; fixture cards carry `alt` oracles and the tests assert ≥ 99 %.
- [x] 6.3 W3 — boosters with an empty stat vector show "(no stat data)" without a toggle and do not count as a custom build.
- [x] 6.4 W4 — per-position floors in `progression.test.ts` (CB ≥ 85 %, CF ≥ 95 %, GK ≥ 90 %; half / none ≥ 99 %, GK-none = 40) proven by a scratch-copy tamper (CF intercept −2 and a none-CB penalty −2 both fail).
- [x] 6.5 W5 — spec wording GK2 (gkParrying — the eFHUB 'GKClearing' stat — and gkReach); CLAUDE.md MAXOverall offset "about +3.6 (+4 on 47 %, +3 on 44 %)"; the single outfield Jump exception (hub PlayerID 179425) noted in design.md / constants.ts / CLAUDE.md; spinbutton named by the category label only with the cost in `aria-valuetext`; proficiency caveat in README / ui-dna.
