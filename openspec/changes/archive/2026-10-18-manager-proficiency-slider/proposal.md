## Why

efootbase applies a Manager Proficiency bonus (slider 70–90, default 90) to every stat even when no manager is selected, so its Progression sheet shows an overall about 4 higher than eFootLab's by default. Measurements on six cards recovered the rule: at proficiency 70 the bonus is zero and our stats match; above that each stat gains `floor(s × r(level))`, capped at 99. With the rates read off two cards only (Messi SS, Neuer GK), the four other cards predicted at 70/75/80/85/90 gave 4,628/4,628 exact stat cells (178 builds). The per-card anchor of the overall at the registered position was chosen post hoc, after the unanchored goalkeeper builds of that run failed (14/50); its independent support is a population check without the bonus (9,839 cards: within ±1 97.0% → 98.3%, goalkeepers 83.6% → 97.4% of 702). This closes the largest remaining gap between the two sheets; what is in-sample, held-out and untested is listed in design.md.

## What Changes

- The Progression panel gains a Manager Proficiency slider (70–90, default 90 as on efootbase) with the bonus model applied between training and boosters.
- The estimated overall is anchored to the card's displayed overall at its registered position; at other positions the existing proficiency penalty stays and a warning states what was measured there (full-proficiency positions agree with efootbase's tiles; at half / no proficiency efootbase reads about 4 / 2–3 higher unless the estimate sits at the floor of 40).
- Max OVR stays the level-independent linear optimum (efootbase's own Max build does not change with proficiency); the spec states its bound against the bonus-aware best build (≤ 1 displayed point) and a test asserts it.
- The honest "about 4 lower" label is replaced by an accurate description of the control, the anchor, the unconfirmed level 86 exception and the position caveat.
- Oracle tests and a numeric fixture cover the stat rule, the anchored overall, the level-86 exception and regression to the old stats at proficiency 70 (in-sample guards, not validation), plus the Max OVR bound.
- Not included: per-manager effects (no manager data exists), Position Training, In-Match Roles.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `player-progression-simulator`: adds the proficiency control and rewrites the requirements that said a proficiency model was absent or that no manager control exists.

## Impact

- `packages/shared` (progression engine, types, weights header, tests, fixture), `apps/web` (Progression panel, player detail page), CLAUDE.md, README.md, `openspec/ui-dna.md`.
- No database change, no new dependency, no access to efootbase.com in this change. The fixture is numeric game data only.
