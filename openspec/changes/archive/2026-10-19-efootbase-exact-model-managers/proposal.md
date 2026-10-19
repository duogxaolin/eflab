## Why

The Progression panel estimates overalls with a fitted linear formula, a fitted proficiency penalty and a per-card anchor, and it cannot select a manager. A browser survey of efootbase (five cards, hundreds of builds, kept outside the repository) showed that efootbase's own rules are exact and small: a table of proficiency bonus bands, an integer-weight overall formula, and a manager effect of "set proficiency to the manager's rating, add +1 to its one or two pill stats". The survey reproduced 793 of 793 overall readings, 10,309 of 10,309 position tiles, 5,460 of 5,460 band cells and 12,324 of 12,324 manager cells. Replacing the estimate with the exact model removes the "~" label and the ±1 caveats, adds the manager picker the owner asked for, and lets every card (including the 2,284 newest cards that have no eFHUB ratings) show all 13 position tiles. The owner accepted the terms risk of using constants recovered from efootbase's public client code.

## What Changes

- Replace the proficiency model: a band table per proficiency level 70–90 (bonus 0–3 by stat range) replaces the `floor(s × rate)` rates and the level-86 exception.
- Replace the overall estimate: the exact integer-weight formula (13 positions × 28 terms, height and weak-foot terms, aptitude scaling 0.85 / 0.97 / 1.0, rounding and clamp) replaces the fitted weights, the fitted proficiency penalty and the anchor. The "~" marker and the ±1 / "not anchored" / "not confirmed" notes go away; the panel states what the formula was verified against and its real limits.
- Add manager selection: a "Select Manager" dialog in the Progression panel lists the 69 picker managers (rating badge, "+1" stat pills, search by name or stat). Choosing one sets proficiency to the manager's rating and adds +1 to its pill stats (two for 45 managers, one for 24) after the boosters; dragging the slider deselects, Reset keeps the manager, choosing the same manager again deselects. A manager below 90 can lower stats (smaller bonus) and the engine models that.
- Add a public `manager.picker` API procedure (id, name, rating, image URL, the one or two pill stats).
- Compute the 13 Pitch Map tiles, Best Fit and "At XX" from the exact formula for every card and the current build, instead of the cross-filled `rating*` columns. The columns stay in the database for reference and are no longer displayed.
- Max OVR keeps the exact dynamic programme and switches to the exact weights; the new fixture-based tests pin Messi's Max/Reset overalls at proficiency 70/80/85/90 exactly.
- Tests: a numbers-only oracle fixture (at most 300 lines, no third-party names or ids), band-table, manager and tamper tests; smoke test for `manager.picker`.
- Documentation: CLAUDE.md, README.md, `openspec/ui-dna.md` and a new `docs/` page describing where the constants come from, how to regenerate them when efootbase changes, and the accepted terms risk.
- Out of scope: Position Training and In-Match Roles (no data), manager tactic data (efootbase has none), any database write, seed or migration, any access to efootbase.com, any push.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `player-progression-simulator`: estimated overall, proficiency, manager proficiency control, max OVR preset, default build, honest limits and estimate label become the exact model; adds manager selection, the exact overall formula, the proficiency band table and position tiles computed from the formula.
- `efootbase-data-integrity`: "Real Position Ratings" — the displayed position tiles are computed from the formula; the eFHUB columns remain stored but are reference only.

## Impact

- `packages/shared` (progression engine, new exact-model data module, constants, types, tests and fixtures), `apps/api` (new `manager` router and root registration; `player` DTO already carries height, weak-foot accuracy and aptitudes — verified, no change expected), `apps/web` (ProgressionPanel, manager picker dialog, PlayerDetailClient, PitchMap, stat grid tooltips, compare tooltip), `scripts/smoke-test.sh`, CLAUDE.md, README.md, `openspec/ui-dna.md`, `docs/`.
- No database schema change, migration, seed or data write. The picker order cannot use a source-order column (Manager has none), so it sorts by rating descending then id ascending and says so.
- Public repository rule: only an integer weight table (with provenance notes), integer band tables, code, numbers-only fixtures and documentation are committed; no efootbase code, JSON, images or screenshots.
- No new runtime dependency; the detail page's First Load JS may grow by at most 5 kB.
