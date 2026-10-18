## Why

The Progression engine treats goalkeeper Jump as "card-specific" and refuses to project it, and it needs a special-case note for one outfield card. New measurements on the live efootbase (goalkeeper Čech, centre-back Cannavaro) show the real rule: Jump rises with Aerial Strength **and** with Goalkeeper 1 together. That one rule explains both the 3,353 goalkeeper offsets and the single outfield exception recorded earlier. It can be verified offline against the whole eFHUB data set before anything changes.

## What Changes

- Jump belongs to two categories: Aerial Strength and Goalkeeper 1. A stat point in either raises Jump by one.
- The goalkeeper Jump "n/a (card-specific)" marker and the code path behind it are removed once the offline check confirms the rule with no unexplained exceptions.
- Oracle tests and the fixture gain the data needed to assert the rule, including a goalkeeper case and the outfield exception.
- The exact-optimum Max OVR allocation accounts for Goalkeeper 1 now influencing Jump.
- Documentation drops the "goalkeeper Jump is card-specific" limitation.
- If the offline check does not confirm the rule, the change stops and reports instead of changing it.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `player-progression-simulator`: the ten-category requirement states that Jump follows Aerial Strength and Goalkeeper 1; the honest-limits requirement no longer lists goalkeeper Jump as unprojectable.

## Impact

- `packages/shared` (constants, progression engine, tests, oracle fixture, possibly the accuracy figures in `ovrWeights.ts`), `apps/web` (Progression panel, player detail page, `components/detail/StatGrid.tsx` — it rendered the "n/a (card-specific)" marker and its stat-to-category map now lists several categories per stat), CLAUDE.md, README.md, `openspec/ui-dna.md`.
- No database change, no new dependency, no access to efootbase.com in this change.
