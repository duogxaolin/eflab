## Context

See proposal.md. The engine maps categories to stats in a single table and marks Jump as unprojected for goalkeepers because, with Aerial alone, 3,353 goalkeeper cards and one outfield card disagreed with the eFHUB data. Measurements on efootbase (outside the repository) show Jump = Aerial points + Goalkeeper 1 points in both the goalkeeper and the outfield cases.

## Goals / Non-Goals

**Goals:** make the stat rule exact for every card in the eFHUB data set and remove the special case.
**Non-Goals:** the Manager Proficiency model, per-position tiles, any change to the cost curve or the estimated-overall weights beyond re-measuring their stated accuracy.

## Decisions

1. **Verify first, offline.** For every card in the joined data (about 44,103), check that the hub's maximum Jump minus Jump equals the Aerial group value plus the Goalkeeper 1 group value. If more than a handful of unexplained exceptions remain, stop and report.
2. **Table-driven rule.** Jump is listed under both categories in the category-to-stats table, so training, the Max OVR search and display all follow without special code; the unprojected-Jump flag and its UI text are removed.
3. **Optimal allocation.** The dynamic programme already sums stat effects per category; because Goalkeeper 1 now touches Jump, its gain is computed from the combined table. The existing optimality test against an independent search is kept and extended with a goalkeeper case.
4. **Accuracy figures.** The estimated-overall accuracy in the weights header is re-measured on the fixture and the oracle; weights are refitted only if the re-measurement shows a regression.
5. **Evidence stays out of the repo.** The efootbase measurements are used only to check Jump on at least 50 builds from the scratch captures; no third-party data is committed. The committed fixture holds numbers only.

## Verification record (task 1.2, 2026-10-18, read-only)

Scratch script outside the repo (`sqlite3 -readonly` on the eFHUB `player export` table, 44,103 rows, joined to `dump/efootbase/players.jsonl` on the Konami id):

- **New table (Jump under Aerial Strength and Goalkeeper 1), all 26 stats:** `MAX<stat> − <stat>` equals the sum of the group values of the categories containing the stat on **44,103 / 44,103** cards — 0 exceptions, 0 nulls.
- **Old table (Jump under Aerial only):** 40,749 exact, **3,354 exceptions**, all on Jump: 3,353 goalkeepers (every GK card with a level cap ≥ 2; by efootbase card type 2,700 STANDARD · 553 HIGHLIGHT · 58 EPIC · 23 SELECTION · 17 LEGENDARY · 2 TRENDING) and the one outfield card (hub PlayerID 179425, DMF, cap 65, Aerial 8 + GK1 1 → Jump 67 → 76). 179425 is the only non-goalkeeper in the hub with a Goalkeeper 1 value above 0; it is in the dump with `max_level` 1.
- **Join:** 44,082 of 44,103 hub cards match a dump row (21 hub-only); exceptions among joined cards under the new table: 0.
- **Accuracy (no refit needed):** max-level estimate (+ Booster 1) within ±1 of efootbase `overall_at_max_level` on the 10,073 joined cards with `max_level` > 1 — GK **36.0 % → 82.0 %** (258 → 587 of 716; mean Δ −1.95 → −0.98), all cards 91.5 % → 94.7 %, 11 outfield 95.9 %, CB 96.1 %, CF 94.7 % unchanged; the engine's projection now equals the hub max stats on every card, so the figure coincides with the header's "hub max stats + Booster 1" cross-check. Level-1 figures (base stats, unaffected by the rule) over the whole hub: full 99.96 % at the 11 outfield positions, CB 98.58 %, CF 99.69 %, GK 93.16 %; half 99.93 %; none 99.71 % at outfield positions; GK-none = 40 on 39,497 / 39,499.

## Observed side effect (verify, 2026-10-18)

Outfield cards behave as before except where Goalkeeper 1's Jump contribution wins the Max-OVR optimum. Measured: 1 of 9,357 outfield multi-level cards (Umeda Kaito, CF, id 105588818334349, level cap 73) now opens with Goalkeeper 1 = 1 instead of Passing = 1 for the last half-point, because Jump's weight at CF (0.0538) beats Passing's (0.0459); the estimate moves 89.51 → 89.52 and the rounded overall is unchanged. This matches the game, where buying Goalkeeper 1 raises Jump.

## Risks / Trade-offs

- **[Risk]** The rule fails on some cards → Mitigation: the offline check runs first and the change stops with a report on failure.
- **[Risk]** The fitted overall weights were fitted with the old goalkeeper Jump behaviour → Mitigation: re-measure accuracy; refit only with numbers showing a regression.
