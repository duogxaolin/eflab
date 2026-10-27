## Context

Survey S5 (2026-10-27, outside the repository; 8 loads of the reference, no challenge) measured the items the 2026-10-23 survey could not. Its own grading — DETERMINED (≥ 3 cards of different positions or types), CANDIDATE (reproduces every reading on fewer cards), NOT DETERMINABLE — and the owner's standing rule (build only what is reproduced on at least two independent checks; list the rest with what would settle it) select the scope: three items are built, seven recorded.

What the code looks like today, read for this design:
- `packages/shared/src/progression.ts` `simulateBuild`: `trained = base + training` → `capDeltas` (cut at 99) → `proficiencyDeltas` (band table, on the trained value) → `boosterDeltas` → `managerDeltas`; `projectedStats = base + all deltas`; `tiles = positionTiles(projectedStats, body, aptitudes)`; `overall = tiles[position]`. `BuildResult` (`types.ts`) carries each part, which `statBreakdown` (`build.ts`) turns into the "Stat breakdown" rows.
- `simulateCardBuild` (`build.ts`) feeds one card's build to the engine; `PlayerDetailClient` calls it once (`buildResult`) and reads `projectedStats` for the grid's "Build" view, `tiles` for the Pitch Map and Best Fit; the compare page calls it per slot (`leftResult`, `rightResult`) for `CompareTable`.
- `StatGrid` draws a cyan "+N" chip for a booster bump and a lime "+1" chip for the manager from `boosterDeltas` / `managerDeltas`.
- `BuildSettings` (`ProgressionPanel.tsx`) is the non-sticky card at the end of the left column (and, embedded, in the phone sheet) with Max Level, Position, the overall and "About this build" — it renders for the capped, Highlight and Trending kinds, not for a level-cap-1 card without a build.
- `CompareRadar` (`CompareClient.tsx`) draws `player.stats` of one stat per axis on a 0–100 scale with a 0.2 floor; the axes are SHT = Finishing, PAS = Low Pass, STR = Physical Contact, DEF = Defensive Awareness, SPD = Speed, DRI = Dribbling.

## Goals / Non-Goals

**Goals:** a radar that reproduces the reference's readings; a Position Training toggle and weak-foot chips whose numbers reproduce the measured tiles and stats; every number pinned by a unit test fed from numbers-only oracles; accessible controls (axe 0, Label in Name); honest copy about what was and was not measured.

**Non-Goals:** Form A–E, the stamina slider, the skill type chip, roles, the Standard level-cap-1 build, weak-foot accuracy 3; URL state for the new toggles; the toggles in compare slots (the reference has them per slot; not measured there); any API, database or dependency change; any request to the reference.

## Decisions

### D1 — The match state is separate from the build
The two toggles are not part of the build (`BuildUrlState`, the URL, "Custom build"). A small `MatchState = { weakFoot: boolean; positionTraining: boolean }` (both false by default) lives in `PlayerDetailClient` state next to the build, is passed to `simulateCardBuild` through its `extras`, and is off on another card: the page stores the toggles with the card id they were set on (`HeldMatchState`) and reads them through `matchStateForCard(held, cardId)`, which gives both off for any other card id; Next also remounts the page when the `[cardId]` segment changes (browser-checked: off after Other Versions and after Back). **Why:** the reference writes neither to its URL (S5: "face and URL unchanged"), and treating them as build would make toggling them mark a "Custom build" and write `replaceState` on every press. Rejected: adding URL keys (invented contract, nothing to be compatible with).

### D2 — Engine API (`@eflab/shared`)
- `simulateBuild` input gains `matchState?: MatchState` (optional; absent = both off, identical output to today for every existing caller and test).
- `BuildResult` gains `weakFootDeltas` (per stat, ≤ 0, zeros when off), `shownStats` (= `projectedStats` + `weakFootDeltas`) and `trainedPositions: Position[]` (empty when off). **`projectedStats` keeps its meaning — the stats the overall formula reads** — so tiles, Best Fit, the overall and the face are computed exactly as before and cannot drift; consumers that show a stat value (the grid's Build view, the breakdown, the compare table's rows and radar) read `shownStats`. Rejected: changing `projectedStats` to include the chips (every consumer would need to know which of the two it wants; the formula's input would silently change).
- Weak-foot deltas (`weakFootDeltas(s1, accuracy)`): `s1 = base + training + cap + proficiency` (the value after the band and the cut at 99, before boosters and manager), chip table `WEAK_FOOT_CHIPS[accuracy]` for accuracies 0–2 (frozen constants in `progression.ts` next to the other measured constants, with the S5 reading counts in the comment), `delta = min(0, max(40, s1 − chip) − s1)` per chip stat — the floor of 40 never raises a stat. Taking the chip before the boosters and the manager is an inference: a flat chip and a booster commute except at the floor, and no reading floored a stat that also had a booster or a manager (the tests pin eFootLab's order with synthetic floor cases). For accuracy 3 (or any other value) the deltas are zero and `weakFootChipsAvailable(accuracy)` is false.
- Position Training (`trainedPositions(registered, aptitudes)`): `[]` for a GK registration; otherwise every position other than GK with aptitude ≠ 0 (not full) that has aptitude 1 (half) or is in `PITCH_NEIGHBOURS[registered]`. `PITCH_NEIGHBOURS` is the edge-sharing adjacency of the Pitch Map's grid (centre column CF, SS, AMF, CMF, DMF, CB, GK; wings LWF / LMF / LB and RWF / RMF / RB spanning 2 / 3 / 2 rows), written once in `@eflab/shared` and covered by a test that derives it from the Pitch Map's row spans, so the two cannot disagree. `positionTiles` is called with the aptitudes in which the trained positions are 0 (full); the overall at the selected position and `proficiency` follow from those tiles.
- Radar: `compareRadarAxes(stats: StatVector): Record<"SHT"|"PAS"|"STR"|"DEF"|"SPD"|"DRI", number>` in a new `radar.ts`, exported, with `RADAR_SCALE_MAX = 115` and `RADAR_RINGS = [30, 60, 90, 115]`. Pure and tested; the compare page maps `result.shownStats` through it.
- Implementation note (two additions found necessary while building, recorded in tasks 1.4): `SimulateInput` gains an optional **`registeredPosition`** — the engine otherwise knows only the selected `config.position`, and Position Training trains from the registered one (a goalkeeper moved to CF still trains nothing); `simulateCardBuild` passes `registeredPositionOf(card)`, and without it nothing is trained. `BuildResult` gains **`untrainedTiles`** — the 13 tiles at the card's own proficiencies (`tiles` itself while Position Training is off) — because the spec keeps the card face unchanged when the selected position is a trained one; the face, the "Build (N)" view label and the stats heading read it, while `tiles`, `overall` and `proficiency` follow the trained aptitudes. The pitch geometry lives in a new `pitch.ts` (`PITCH_GRID`, with `PITCH_NEIGHBOURS` derived from it) that the web's `PitchMap` places its cells from. The page's per-card rule of D1 is the pure helper `matchStateForCard(held: HeldMatchState, cardId)` in `build.ts` (unit-tested).

### D3 — Where the numbers come from, and what the fixtures hold
Numbers-only oracles, like `exact-model-oracle.json` (anonymous ids, no names, no third-party text), generated from the S5 reading files by a throwaway script kept outside the repo:
- `radar-oracle.json`: for each of the 7 measured builds the 26 shown stats and the six axis readings (S3 + S5).
- `weak-foot-oracle.json`: the chip table by accuracy and, per measured card, the stat values before the deduction, the chips read and the floor cells (11 cells on 4 cards).
- `position-training-oracle.json`: per measured card the 26 shown stats, height, weak-foot accuracy, the 13 aptitude codes, the registered position, the 13 tiles before and after, and the trained positions read; the test checks `trainedPositions` and `positionTiles` against it.
Their provenance is described in the files' neighbouring README/tests as "readings of a public page taken 2026-10-23 / 2026-10-27", as the existing oracle does. If the stats of a card cannot be rebuilt from the saved readings without copying page content, that card's tile test falls back to the engine's own recomputation from the local database (read-only) and is recorded in tasks.

### D4 — UI placement and form
- **Toggles**: in `BuildSettings`, a "Match state" group under the overall line and above "About this build": two `aria-pressed` toggle buttons "Position Training" and "Weak foot" (the reference's own labels), each with a one-line description when disabled (`aria-describedby`, visible text — a `title` is not enough). Disabled = `aria-disabled="true"` with the reason text; a disabled toggle never changes state. The group is embedded in the phone sheet through the same component; the dock needs no new control.
- **Chip**: a third chip in `StatGrid`'s chip area: "−N" in the warning colour token with a visually hidden "weak foot" label, beside the booster and manager chips; its contrast against the row surface is measured (≥ 4.5:1) and the value pill shows the reduced value. The stat rows are named by content, so the visible "−7" text is part of the name (Label in Name holds).
- **Breakdown**: `StatBreakdownRow` gains `weakFoot`; the list shows it as a part and `shown` equals the sum.
- **Stat views**: the chips and the shown-stat change exist in the "Build" view only; any press of the toggles switches the grid to "Build" (the existing rule that a panel change returns to Build).
- **Radar**: same box, ring radii at 30 / 60 / 90 / 115 of the outer radius, polygon radius = min(value, 115) / 115 × outer radius, no minimum floor (the old 0.2 floor hid low values), axis labels unchanged; `role="img"` with an `aria-label` built from both sides ("Left: <name>, SHT n, PAS n, STR n, DEF n, SPD n, DRI n. Right: …"), omitted for an empty side.

### D5 — Verification of the numbers
Unit tests (shared) pin D2–D3. A read-only script on the local database checks, for a sample of cards, that toggling Position Training changes no stat and no face and that a chip never lowers a stat below 40 or raises one. The browser check compares, on a check build, the tile pairs of the measured cards (those present in our catalogue with the same stats as the readings — the oracle cards are matched by id) with the table of the spec.

## Risks / Trade-offs

- **DEF is our choice.** Three formulas coincide on all 7 builds; the equal-weight one is the simplest. If a later reading separates them (a Reset of either slot would not; a card whose Defensive Awareness and Defensive Engagement differ by more than about 10 might), DEF changes and the oracle test shows it. Documented as unmeasured in `ui-dna.md` and `CLAUDE.md`.
- **Position Training outside the measured registrations** uses the grid inference (RWF and CB rest on the cards the rule was built from, the four others — LWF, CF — were predicted in advance; DMF, CMF, AMF, SS, LMF, RMF, LB, RB are untested). The disclosure says so. The goalkeeper clause rests on one card, hence the disabled toggle.
- **Weak-foot accuracies 0 and 1 are two cards each**: built because the owner's rule asks for two checks; the disclosure names the counts. Accuracy 3 is not built.
- **The floor never raises** is our reading of an unmeasured corner (a stat below 40 before the deduction); the spec states it.
- **Best Fit differs from the reference on ties after training** (reference: the trained or the later position; ours: the registered position) — kept, documented.
- **No URL state** means a shared link cannot carry the toggles; the reference's does not either.

## Migration Plan

1. Branch `efootbase-s4-measure` from `main` (d328faa). Commits: shared engine + tests; web (compare radar; toggles, chips, copy); docs + archive.
2. Gates: `pnpm typecheck`, `pnpm --filter @eflab/shared test`, `pnpm test` (every pnpm call with `pnpm_config_verify_deps_before_run=error` — pnpm 11 would otherwise reinstall in the main tree).
3. Check build `NEXT_DIST_DIR=.next-check` by calling `next build` directly in `apps/web` (web :4200, API :7200; never 3000 / 4000 / 5000 / 6000 / 7000); browser checks at 320 / 390 / 1440; axe-core 4.14.
4. After the merge: `next build` directly in `apps/web`, restart :3000 by port, check that every `/_next/static` file answers 200. The API does not change.
5. Rollback: `git revert`; no data was written.
