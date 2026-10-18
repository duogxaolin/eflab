## 1. Offline verification

- [x] 1.1 Create the git branch `jump-from-gk1` from `main` (018a918); no commits to `main`, no push.
- [x] 1.2 Over all joined eFHUB cards, count cards where hub maximum Jump minus Jump equals the Aerial group plus the Goalkeeper 1 group; list every exception with its card type, position and cause. If unexplained exceptions remain, STOP and report. ← (verify: exception count recorded with evidence; the 3,353 goalkeeper offsets and the outfield case 179425 are explained)

## 2. Engine and tests (packages/shared)

- [x] 2.1 Put Jump under both Aerial Strength and Goalkeeper 1 in the category-to-stats table and apply it in training; remove the unprojected-Jump flag and its code path.
- [x] 2.2 Update the oracle fixture and tests: stat-map exactness on the fixture including goalkeepers, a goalkeeper case where buying only Goalkeeper 1 raises Jump, the outfield exception if present in the fixture, optimal-allocation checks within budget and not below the reference allocation minus 0.8.
- [x] 2.3 Re-measure the estimated-overall accuracy (outfield aggregate, CB, CF, GK, proficiency classes) and update the figures in the weights header and docs; refit only if the numbers show a regression. ← (verify: tests fail when the Goalkeeper 1 contribution to Jump is removed; accuracy figures match a fresh run)
- [x] 2.4 Check the engine's displayed Jump against the scratch efootbase captures for at least 50 builds (read-only, nothing committed).

## 3. Web and docs

- [x] 3.1 Remove the "n/a (card-specific)" display and every dependence on the unprojected flag in the Progression panel and the player detail page.
- [x] 3.2 Update CLAUDE.md, README.md and `openspec/ui-dna.md`: the Jump rule, the removal of the goalkeeper limitation and the outfield exception note.

## 4. Verification

- [x] 4.1 `pnpm -r typecheck`, `pnpm --filter @eflab/shared test`, `pnpm test`, `pnpm --filter @eflab/web build`, `openspec validate --specs` pass.
- [x] 4.2 Playwright on API 6100 / web 3100: on a goalkeeper, buying Goalkeeper 1 raises Jump and no "n/a (card-specific)" appears; outfield cards behave as before unless Goalkeeper 1 is bought or its Jump contribution wins the Max-OVR optimum (measured: 1 of 9,357 outfield multi-level cards — Umeda Kaito, CF, 105588818334349, opens with Goalkeeper 1 = 1 instead of Passing = 1; estimate 89.51 → 89.52, rounded overall unchanged); no console errors; no horizontal overflow at 320, 375 and 480 px. ← (verify: measured results meet every scenario; nothing committed to main or pushed; no third-party data in the diff)
