# efootbase's exact progression model (overall formula, proficiency bands, managers)

> Written 2026-10-19 (openspec change `efootbase-exact-model-managers`). The constants come from a browser survey of efootbase.com (five cards, hundreds of readings) and from efootbase's public web client. The survey material — scripts, captured pages, the client's JavaScript, readings — stays **outside this repository**. The owner accepted the terms risk of using constants recovered from another site's public client code; only integers, stat names, code, a numbers-only fixture and this description are committed.

## What the constants are

All of them live in one data module, `packages/shared/src/ovrModel.ts`; the arithmetic is in `packages/shared/src/progression.ts`.

| Constant | Meaning |
|---|---|
| `OVR_WEIGHTS` | 13 positions × 28 integer weights, keyed by position and eFootLab term name: `height`, the 25 stats other than defensive engagement, `weakFootAccuracy`, `defensiveEngagement`. |
| `OVR_TERMS` | The order the weighted sum is accumulated in (the weak-foot term is not an integer, so the order is kept to reproduce the sum bit for bit). |
| `OVR_MODEL` | Scale factors by proficiency (full 1, half 0.97, none 0.85), rounding (`floor(x + 0.5)`), stat limit 255, term offset 25, height offset 111, weak-foot term `59 × a / 3 + 40`, sum bias 499 / divisor 1000, overall limits 40..127. |
| `PROFICIENCY_BANDS` | Manager Proficiency bonus bands per level 70–90 (`{min, max, bonus}`; 70–76 empty). |
| `PROFICIENCY_STAT_CAP` | 99 — base + training + bonus is limited to it before the boosters (the bonus never lifts a stat past it, a stat trained past it reads 99). |
| `MANAGER_PILL_BONUS` | 1 — what a selected manager adds to each of its pill stats. |

### Rules

For each stat, with `s₀` = base + training (Jump: Aerial Strength + Goalkeeper 1):

```
s₁    = min(99, s₀ + band(level, s₀))       (band = 0 below the first band, at 99+ and at 70–76)
final = s₁ + active boosters + 1 on each pill stat of the selected manager   (may exceed 99)
```

This is efootbase's client: it sums base and training, adds the band bonus read off that sum, limits the result to 99 and only then adds the boosters (the manager's +1 travels with them). A stat trained past 99 therefore reads 99 before the boosters (98 + 4 → 99): the points bought above 99 are not counted. `BuildResult.capDeltas` carries the cut (0 or negative) so the stat grid's tooltip can show it; `trainingDeltas` keep the raw points bought.

Overall at a position (`exactOvr`), for the final stats:

```
stat'  = min(255, max(0, floor(stat × f + 0.5)))   f = 1 / 0.97 / 0.85 for full / half / no proficiency
term   = max(0, stat' − 25)                        (all 26 stats; defensive engagement and GK stats included)
height = max(0, height − 111 − 25)                 (not scaled)
wf     = max(0, 59 × weakFootAccuracy / 3 + 40 − 25)   (not scaled; a real number)
sum    = Σ weight × term   (accumulated in OVR_TERMS order)
OVR    = min(127, max(40, floor((sum + 499) / 1000)))
```

`positionTiles` evaluates it at all 13 positions with the card's aptitudes (database coding 0 full, 1 half, 2 none — the dump's coding is inverted, 2 full … 0 none); the panel's overall is the tile at the selected position, so the two can never disagree.

A manager is an input of the engine (`SimulateInput.manager = { stats }`): choosing one in the UI sets the Manager Proficiency level to the manager's rating (83–90) and passes its one or two pill stats (efootbase lists 24 of its 69 picker managers with a single pill). Moving the slider deselects the manager, choosing it again deselects it and keeps the level, Reset and Max OVR keep it — the same behaviour the survey recorded on efootbase.

**Max OVR** keeps the dynamic programme over the ten categories, now on the exact integer weights: it maximises Σ weight × stat (the linear part of the formula, without the bonus, scaling and rounding), so the preset is the same at every proficiency level and for every manager.

## Stats trained past 99 (cut, as on efootbase's sheet)

efootbase's client limits base + training + bonus to 99 unconditionally before the boosters, so a stat trained above 99 (e.g. 98 + 4) reads 99 there. The engine does the same since 2026-10-19 (**owner decision**; until then it kept such stats and the panel disclosed the difference). Facts behind the decision, kept on record:

- No reading of the survey covers the case: the highest trained value of any surveyed build is exactly 99 (where cutting and keeping agree), so the replay figures below are unchanged and synthetic unit tests pin the cut (98 + 4 → 99; 97 + 4 → 99; 95 + 4 → 99 with nothing cut; boosters and a manager's +1 on top; a source change back to keeping fails them).
- The game's own data leans the other way: on the 99 cards of the population check whose eFHUB max-level stats exceed 99, the formula equals efootbase's max-level overall (`overall_at_max_level` of the dump, the game's number) on **94** when those stats are kept and on **65** when they are cut to 99. efootbase's own dump does not contradict the cut: its `max_attributes` minus Booster 1 and Booster 2 never exceed 99 on the 10,175 cards with progression (the 141 stat cells of 70 cards that exceed 99 after removing Booster 1 alone are all Booster 2 stats).
- Effect on the opening build (Max OVR preset, both boosters, no manager; 10,175 dump cards with progression): the preset trains a stat past 99 on **108** cards (by at most 10). Against the former keep rule the overall drops by 1 on 26 of them at proficiency 90 and on 42 at 70; over all 21 levels −1 on 680 and −2 on 4 of the 2,268 card × level pairs, 82 cards changed at some level.
- Effect on Max OVR: the preset stays linear and ignores the cut, so it can buy points above 99 that are not counted. On those 108 cards an exact bonus- and cap-aware search reads 1 higher on 912 and 2 higher on 31 of the 2,268 pairs (1 higher on 280 of the 756 pairs at 70–76, where there is no bonus); on the other 10,067 cards it reads at most 1 higher (7,764 of 211,407 pairs) and never at 70–76. The panel's Max OVR note says "up to 1 higher, or up to 2 when the preset trains a stat past 99".

`BuildResult.capDeltas` (0 or negative) holds the cut, and the stat grid's tooltip lists it ("−3 cut at 99").

## How it was verified

Read-only scripts (session scratchpad, not committed), 2026-10-19:

- **Survey replay** through the shared engine, five cards (SS, GK, CB, DMF, CF), every reading: **793/793** overalls, **20,618/20,618** stat cells, **10,309/10,309** position tiles, 8,008/8,008 booster chips (the 308 manager-free readings × 26 stats; efootbase folds a manager's +1 into the booster chip, eFootLab shows boosters and the manager as separate chips on purpose, so manager readings are compared on the stat values). Of these, 474 readings with a manager at its rating (12,324/12,324 cells; level = rating on all 474; 162 single-pill readings; 23/23 pill stats already above 99 still +1), 98 readings after the slider was moved with a manager selected (deselected on all 98; plain result exact), 11 probe readings (pick / slider / pick again / Reset).
- **An earlier capture** (263 builds on six cards, a second goalkeeper among them; the constants were not fitted on it): 263/263 overalls, 6,838/6,838 stat cells; the Max OVR preset reads efootbase's own Max reading on 89/89.
- **Reference card** (SS): Max 106 / 109 / 109 / 110 and Reset 94 / 97 / 97 / 97 at proficiency 70 / 80 / 85 / 90 — exactly efootbase's readings.
- **Max OVR allocation**: on the five committed fixture cards it equals efootbase's own Max build on 4 and differs on the striker (fixture card c5), where efootbase's build has a lower objective value (133,336 vs the preset's 133,360 — efootbase's preset is not the exact linear optimum there). The earlier capture adds a second goalkeeper not in the fixture, which differs only by a Goalkeeper 2 / Goalkeeper 3 tie (both 399 per point at GK, equal objective). Six distinct cards: 4 equal, 2 different. The displayed overall is the same at every level read (69/69 fixture readings, 89/89 earlier capture). Against an exact bonus- and cap-aware search (5 fixture cards × 21 levels) the preset reads 1 lower on 8 of 105 pairs, never more, never at 70–76 (no fixture preset trains a stat past 99; for presets that do, see "Stats trained past 99").
- **Population** (efootbase dump × eFHUB, no proficiency bonus involved):
  - 9,843 cards with a level cap above 1 in both: the formula on eFHUB's max-level stats + Booster 1 equals the dump's `overall_at_max_level` on **9,358 (95.07 %)**, within 1 on 9,683 (98.37 %); goalkeepers 652/702 exact (92.88 %), 693/702 within 1. The misses are cards whose eFHUB max stats are not the build behind efootbase's number (eFHUB's allocations, boosters and game version are its own); the check therefore bounds the formula from below.
  - 40,516 cards with level cap 1: the formula on the base stats equals the dump's overall on **40,479 (99.91 %)**, all within 1. Base + Booster 1 vs `overall_at_max_level`: 38,023 (93.85 %).
  - The stored eFHUB per-position ratings (`Player.ratingGK…ratingCF`) agree with the formula at full-proficiency positions (97.47 % exact at level 1) but not elsewhere: at half proficiency the formula is 3.07 higher on average (0.09 % exact), at none 1.37 higher (28.79 % exact). efootbase's own tiles follow the formula (10,309/10,309), so the web now computes every position value and no longer displays the stored columns; they stay in the database as reference.

The tests (`pnpm --filter @eflab/shared test`) pin all of this on the numbers-only fixture `packages/shared/src/__fixtures__/exact-model-oracle.json` (273 lines, five anonymous cards `c1`…`c5`, 262 readings): band table, stats, overall, all 13 tiles, the manager rule, the reference card's eight values, efootbase's Max readings, the bound against the bonus- and cap-aware optimum, synthetic cut-at-99 cases (a stat trained past 99 reads 99 before the boosters; keeping it fails them), and 20 tamper cases (one weight, a swapped pair of terms, swapped LMF/RMF columns, two band bounds, no manager +1, manager or boosters before the bonus, three rounding changes, two scale factors, two floors, term / height / weak-foot offsets) that must each make the oracle fail. A literal swap of the booster and manager additions is a no-op, so the order tampers move the manager's +1 or the boosters before the bonus instead. The 127 ceiling and the 255 scaled-stat limit never bind on a measured reading, so direct unit checks pin them (one heavily weighted stat at 300 vs 255 vs 200 with the overall below 127 — it fails with the limit removed or set to 200 or 120).

## Limits (what the panel says)

- Stats, height and weak-foot accuracy come from the database dump; a dump that differs from efootbase's current data gives different numbers.
- Only five cards were measured one by one. Other cards were checked in bulk (the population figures above); the Pitch Map note of a card without a Progression panel says its tiles are not checked tile by tile.
- As on efootbase's sheet, base + training + bonus stops at 99 before the boosters: stat points bought past 99 are not counted (the stat's tooltip shows the part cut). The Max OVR note says a hand-made build can read up to 1 higher, up to 2 when the preset trains a stat past 99.
- Not modelled: Position Training, In-Match Roles (no data in the dump) and manager tactics (efootbase has none).
- The picker order is rating descending, then id ascending: efootbase keeps its own source order inside a rating, which the `Manager` table has no column for (adding one needs a migration).

## Regenerating when efootbase changes

1. Survey again (outside the repository): load a few player pages, read the Progression sheet at several proficiency levels with and without managers, and capture the client JavaScript that holds the weight table and the band table.
2. Re-derive `ovrModel.ts` with the same shapes: weights keyed by position and term name (map efootbase's stat names through `EFOOTBASE_STAT_MAP`: `tackling` → `ballWinning`, `jumping` → `jump`, `setPieceTaking` → `placeKicking`), bands per level, the scale factors and offsets. Commit integers and names only.
3. Regenerate `__fixtures__/exact-model-oracle.json` from the new readings (≤ 300 lines, numbers only, anonymous card ids, no names or ids of the third party).
4. Run `pnpm --filter @eflab/shared test` (the oracle must pass at 100 % and every tamper case must fail), replay every reading of the survey through the engine, and re-run the population check; update the figures here, in `LIMITS_NOTE` / `EXACT_MODEL_READINGS` (`apps/web/components/build-simulator/ProgressionPanel.tsx`) and in CLAUDE.md.
5. The manager list is data, not a constant: it comes from the static snapshot (`docs/efootbase-static-snapshot.md`, `Manager.inPicker`, `booster1Stat` / `booster2Stat`) and is served by `manager.picker`.
