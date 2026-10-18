## Why

The player detail page lost its Progression panel in `eflab-parity-fixes` because the sliders changed nothing and the shared engine was wrong (wrong category-to-stat map, wrong point budget, invented manager and OVR rules). Progression is a core efootbase function. A data analysis of 44,103 cards shows the real rules can be recovered from the eFHUB data: the budget, the 10-category stat map, the per-category cost curve and a per-position OVR formula accurate to ±1.

## What Changes

- Rebuild the progression engine in `@eflab/shared` from the recovered rules: 10 training categories, a budget of `levelCap − 1` points, the cost curve, booster stat vectors, a fitted per-position OVR estimate, and an optimal "Max OVR" allocation.
- Add oracle tests against fixtures extracted from the eFHUB data (no dump is committed).
- Add a working Progression panel to the player detail page: Max Level input, position selector, 10 category steppers with the next cost, points used/left, Booster 1/2 toggles, Max OVR and Reset, and live stats and an estimated OVR. The panel is hidden for cards whose max level is 1 (efootbase offers no progression for them).
- **BREAKING** (internal API): `BuildConfig`/`BuildResult` and the `buildSimulateInput`/`buildSaveInput` schemas change to the 10 categories and lose the manager fields. `community.simulate` follows the new engine.
- Manager Proficiency stays hidden: no dataset ties a manager to any stat or OVR result.
- Also fix the compare page edge found by the second verification: ids above the int8 maximum must be rejected by the client instead of poisoning the whole batch.

## Capabilities

### New Capabilities
- `player-progression-simulator`: the data-derived progression rules, the estimated OVR and the detail-page Progression panel.

### Modified Capabilities
- `build-simulator`: allocation, booster and manager requirements now describe the real rules. The Manager Tactical Boost requirement is removed.

## Impact

- `packages/shared`: `constants.ts`, `progression.ts`, new `ovrWeights.ts`, `types.ts`, `schemas.ts`, tests and a small fixture JSON.
- `apps/api`: `community.ts` (`simulate`/`saveBuild`), DTO check for booster vectors and `levelCap` in `player.byId`.
- `apps/web`: `app/players/[baseId]/[cardId]/PlayerDetailClient.tsx`, `components/build-simulator/BuildSimulator.tsx` (compiles only), `app/compare/CompareClient.tsx`.
- Docs: `CLAUDE.md`, `README.md`, `openspec/ui-dna.md`.
- No schema migration and no new runtime dependencies.
