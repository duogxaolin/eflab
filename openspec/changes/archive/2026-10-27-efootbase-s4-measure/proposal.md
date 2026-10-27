## Why

The 2026-10-23 survey (S1–S3) left several reference functions on the "pending measurement" register because they rested on one or two readings, and its fourth part (S4) stopped after one load at a Cloudflare challenge. On 2026-10-27 the measurements were resumed (survey S5: 8 loads of the reference, each ≥ 97 s apart, no challenge, no 403; kept outside the repository). The new readings settle three of the pending items well enough to build under the owner's rule — only what is reproduced on at least two independent checks:

- **Compare radar** — SHT, PAS, STR, SPD and DRI are single formulas of the build's shown stats (7 builds of 5 cards, within the searched family of weighted means); DEF is narrowed to three formulas that agree on every reading. Today the radar draws one base stat per axis on a 0–100 scale.
- **Position Training** — the toggle scores a set of positions at full proficiency; the set follows one rule that was predicted before the loads for four cards and held on all seven outfield cards measured.
- **Weak-foot chips** — a flat deduction on five stats by weak-foot accuracy: accuracy 2 on three cards, accuracies 0 and 1 on two cards each (accuracy 3 on one card — not built).

Everything else S5 measured stays unbuilt and is recorded with its evidence (Form A–E, the stamina slider, the skill type chip, In-Match Roles, the proficiency bonus for Standard level-cap-1 cards).

## What Changes

- **Compare radar from the build** (`apps/web/app/compare/CompareClient.tsx`, new pure function in `@eflab/shared`): each side's polygon is drawn from the shown stats of its build (boosters on, no proficiency bonus without a manager, the manager's effect when one is chosen — the compare default), on a 0–115 scale with integer axes: SHT ⌊(Finishing + Kicking Power) / 2⌋, PAS ⌊(Low Pass + Lofted Pass) / 2⌋, STR ⌊(Physical Contact + Balance) / 2⌋, SPD ⌊(Speed + Acceleration) / 2⌋, DRI ⌊(Ball Control + Dribbling + Tight Possession) / 3⌋ and DEF ⌊(Defensive Awareness + Tackling + Defensive Engagement) / 3⌋. DEF is **our choice among three formulas the readings cannot tell apart**, and is documented as such. The radar changes with every build change and has a text alternative that states both sides' six values.
- **Position Training toggle** (detail page, Build settings): while on, the positions the card trains are scored at full proficiency in the 13 tiles, Best Fit and the panel's overall at a trained position; the card face, the stats and the URL do not change and the state is not stored. Trained positions: every half-proficiency position plus every non-full, non-goalkeeper neighbour of the registered position on the pitch grid; a goalkeeper card trains none (its toggle is disabled with the reason).
- **Weak-foot toggle** (detail page, Build settings): while on, Ball Control, Low Pass, Lofted Pass, Finishing and Curl show a flat deduction by the card's weak-foot accuracy (a bracketed-style "−N" chip beside the value, like the booster chips), applied after the proficiency band and the cut at 99, before the boosters and the manager, never below 40; the overall, the 13 tiles and the face do not change. Cards with weak-foot accuracy 3 (one card measured) get the toggle disabled with the reason. The "Stat breakdown" list gets a weak-foot part.
- **Engine** (`@eflab/shared`): `simulateBuild` accepts an optional match state (`weakFoot`, `positionTraining`, both off by default) and returns the shown stats next to the stats the formula reads, the weak-foot deltas and the trained positions. Nothing changes for callers that do not pass it.
- **Fixtures and tests**: numbers-only oracles from the S5 readings (radar axes of 7 builds, weak-foot chips with their floor cells, Position Training tile pairs of 7 cards) pinned by unit tests in `@eflab/shared`.
- **Docs**: `CLAUDE.md` (short "S5 measurements" section), `openspec/ui-dna.md` (pending register: what moved out, what stays with its evidence and what would settle it; DEF noted as our choice), the limits note of "About this build".
- **Not built, recorded as pending / observation**: Form A–E (a second offset family exists for low-rated level-cap-1 cards and its selection rule is unknown), the remaining-stamina slider (196 of 198 cells, two unexplained), the skill type chip (S4's rule was refuted by a third skill), In-Match Roles (S4's Captain rule was withdrawn), the proficiency bonus and Max Level control for Standard level-cap-1 cards (two cards of one type), weak-foot accuracy 3, Best Fit on a tie after training (the reference breaks it differently from ours; ours is kept), the order of the cut at 99 against a form offset. Observed reference changes noted without action: a Trending booster that opened off on one card, compare defaults that never buy Goalkeeper 1 for an outfield card and take Goalkeeper 2 before 3 on a tie.

## Capabilities

### New Capabilities
- `efootbase-s4-measure`: the build-derived compare radar, the Position Training toggle and the weak-foot chips, each with its measured rule, its limits and its accessible form.

### Modified Capabilities
- `comparison-tool`: "6-Axis Radar Visualization" (build-derived axes, 0–115 scale, STR instead of PHY, text alternative).
- `efootbase-function-parity`: "Unmeasured Functions Are Not Shown" (Position Training, the weak-foot chips and the radar's build axes leave the unmeasured list).
- `player-progression-simulator`: "Honest Limits" (the limits note no longer says Position Training and the weak-foot effect are not modelled), "Position Tiles From The Formula" (the tiles read the stats before the weak-foot deduction and score trained positions at full proficiency).

## Impact

- **Web and shared only:** `packages/shared/src` (`progression.ts`, `build.ts`, `types.ts`, a new radar helper, fixtures, tests), `apps/web/app/compare/CompareClient.tsx`, `apps/web/app/players/[baseId]/[cardId]/PlayerDetailClient.tsx`, `apps/web/components/build-simulator/ProgressionPanel.tsx`, `apps/web/components/detail/StatGrid.tsx`, `apps/web/components/build-simulator/build-notes.ts` copy, `apps/web/app/globals.css` (chip style), docs. **No API, database, migration, data or dependency change; no request to the reference during this change.**
- **URL contracts unchanged:** the two toggles are not written to the card URL or the compare URL (the reference's URL does not carry them either); they reset when another card opens.
- **Operations:** web rebuild and restart of :3000 by port after the merge (call `next build` directly in `apps/web`, restart, then check every `/_next/static` file answers 200); the API does not change.
- **Rollback:** `git revert` of the change; no data to undo.
