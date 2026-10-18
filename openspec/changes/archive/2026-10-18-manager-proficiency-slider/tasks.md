## 1. Branch and engine (packages/shared)

- [x] 1.1 Create the git branch `proficiency-slider` from `main` (cfc44e2); no commits to `main`, no push.
- [x] 1.2 Add the rate table, the bonus function (cap rule, level 86 exception flagged) and a `managerProficiency` input (70–90, default 90) to the simulation; apply the bonus between training and boosters; expose the per-stat bonus in the result.
- [x] 1.3 Anchored overall at the registered position (anchor from the base stats without boosters); keep the penalty path for other positions; replace the old proficiency-gap constants and notes.
- [x] 1.4 Build the numeric fixture (≤ 300 lines, no names or third-party identifiers) from the scratch proposal file, excluding the ambiguous cells; update the weights header (remove the outdated Cloudflare remark, document the anchor).
- [x] 1.5 Tests: stat exactness on the fixture (100%), anchored overall within ±1 on at least 95%, regression to the old behaviour at proficiency 70, the level-86 exception, the cap rule, boosters after the bonus; tamper checks (change one rate; remove the anchor) must fail the suite. ← (verify: tamper tests fail; fixture contains numbers only)

## 2. Web (apps/web)

- [x] 2.1 Progression panel: a Manager Proficiency slider 70–90 (default 90) with label, `aria-valuetext` and keyboard operation; shown stats, chips, "~" estimate and stats-view modes stay correct with the bonus; Reset keeps the current proficiency.
- [x] 2.2 Replace the "no manager proficiency / about 4 lower" text with accurate copy: bonus without a selected manager, anchor at the registered position, warning for other positions, level 86 unconfirmed.
- [x] 2.3 No horizontal overflow at 320, 375 and 480 px with the slider and notes visible. ← (verify: Messi at proficiency 70/80/85/90 matches the measured values; keyboard; no console errors)

## 3. Docs

- [x] 3.1 Update CLAUDE.md, README.md and `openspec/ui-dna.md`: the model, the measurements, the limits (other positions, level 86, no per-manager effects) and remove the "about 4 lower" limitation.

## 4. Verification

- [x] 4.1 `pnpm -r typecheck`, `pnpm --filter @eflab/shared test`, `pnpm test`, `pnpm --filter @eflab/web build`, `openspec validate --specs` pass; detail-page First Load JS grows by at most 2 kB over 170 kB.
- [x] 4.2 Playwright on API 6300 / web 3300: Messi opens higher than the old no-bonus value and the build Max OVR / Reset values match the measurements at 70/80/85/90 at SS (106/109/109/110 and 94/97/97/97), a goalkeeper and another outfield card behave correctly, level-cap-1 cards show no panel. ← (verify: measured results meet every scenario; nothing committed to main or pushed; no third-party data in the diff)

## 5. Verify-round fixes

- [x] 5.1 Delta spec merges: "Honest Estimate Label" carries the legacy scenario "No proficiency model" (rewritten to hold with the control shown); MODIFIED blocks added for "Ten Training Categories", "Proficiency-Aware Estimate" and "Max OVR Preset" with every legacy scenario carried; archive dry-run on a scratch copy merges and `openspec validate --specs` passes.
- [x] 5.2 Max OVR decision: keep the level-independent linear DP (efootbase's own Max build does not move with proficiency; a bonus-aware optimum moves Messi off 8/4/12/8/7); reword "Max OVR Preset" to the bound and add test section 8 (exact bonus-aware reference, 261 cards × 21 levels: gap < 1 unrounded, ≤ 1 displayed, 0 at 70–76); panel note says a hand-made build can read up to 1 higher.
- [x] 5.3 Wording: anchor described as post hoc with the population check as its support (no "178/178" as validation); in-sample / held-out / prospective / population evidence kept apart; 15 intermediate levels and level 86 flagged as without two-card held-out evidence; in-interval rates undetectable by design; "proficiency 70 = old engine" limited to the stats; "one outfield + one goalkeeper" fixed; 10,073 vs 9,839 denominators explained — in progression.ts, ovrWeights.ts, the test, the panel, CLAUDE.md, README.md, ui-dna.md, proposal.md and design.md.
- [x] 5.4 Off-position warning worded per proficiency from efootbase's measured tiles (full: not anchored, 202/202 agree; half: about 4 higher; none above the floor of 40: about 2–3 higher; none at the floor: not anchored, 1,145/1,231 agree); penalty figures labelled as hub figures.
- [x] 5.5 Visible "dump max · no proficiency bonus" label next to the header OVR pill.
- [x] 5.6 Gates: `pnpm -r typecheck`, `pnpm --filter @eflab/shared test`, `pnpm test`, `pnpm --filter @eflab/web build` (detail First Load ≤ 172 kB), `openspec validate manager-proficiency-slider --strict`, `openspec validate --specs`, archive dry-run; Playwright on API 6500 / web 3500 (Messi default 90, Max/Reset at 70/80/85/90, pill label, warnings at a full and a half/none position, no overflow at 320/375/480, no console errors).
