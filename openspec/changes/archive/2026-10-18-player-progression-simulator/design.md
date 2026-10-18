## Context

See proposal.md for motivation. The current engine (`packages/shared/src/progression.ts`) uses 8 categories with half-weights, a budget of `(maxLevel − level + 1) × 5`, a clamp at 99 and invented manager rules; none of it reproduces real data (0 of 300 sampled cards). A read-only analysis of the eFHUB `player export` table (44,103 cards joined to the efootbase dump by Konami id) recovered the real rules:

- hub `MAXstat − base` equals the category group value for every stat on all 44,103 cards, except goalkeeper Jump (card-specific offset) and a single outfield card (hub PlayerID 179425, DMF, level cap 65: Jump 67 → 76 with Aerial 8, one point more than the rule) — the engine does not model that exception;
- points available = `LevelCap − 1`, and the cost curve reproduces `Σ cost = LevelCap − 1` on all 32,601 cards with `LevelCap ≥ 2`;
- OVR per position is linear in the stats at full proficiency: R² 0.996–0.999 on 26,769 held-out cards, 99.9% within ±1 for most outfield positions, goalkeeper about 93% within ±1; at half / non-proficient positions the hub overall is `max(40, k·estimate + c)` per position (held-out within ±1: 99.9% half, 99.7% none at outfield positions, GK at none a flat 40) — without that penalty the full formula is within ±1 on 0% / 5.6% of those observations;
- the efootbase `max_attributes` field is a separate, inconsistent lift and must not feed the engine.

Constraints: the repository is public (no dump data committed), the DB is read-only for this work, and the web computes on the client, so no new API procedure is needed. The scratch analysis scripts live outside the repo in the session scratchpad.

## Goals / Non-Goals

**Goals:**
- A pure, deterministic engine in `@eflab/shared` that other code can test against hub oracles.
- A detail-page panel that behaves like efootbase's progression sheet: level, position, category steppers with costs, boosters, Max OVR, live stats and overall.

**Non-Goals:**
- Manager effects (no data).
- Exact overall values (the formula is an estimate).
- Using the hub's larger level caps for Standard cards, and changing the existing "stats at max level" toggle or the seeded `max*` columns.

## Decisions

### 1. Engine shape
`progression.ts` exports `TRAINING_STATS` (category → stats), `categoryCost(g)`, `maxGainForBudget(budget)`, `trainingPointsAvailable(levelCap) = levelCap − 1`, `applyTraining`, `applyBoosters`, `projectOvr(position, stats)`, `bestAllocation(base, position, budget)` and `simulateBuild(input)`. All functions are pure and integer-based (costs in half-points, stored as integers ×2 to avoid float drift).

### 2. OVR weights are generated data, not code
`ovrWeights.ts` holds fixed per-position weights and intercepts fitted from the hub (`overall<pos>` on cards with full aptitude, outfield fits without GK stats). The file header records source, date, sample size and fit quality. Alternative rejected: refit at runtime (needs the dump in the repo).

### 2b. Proficiency penalty is a monotone map of the full estimate
`projectOvr(position, stats, proficiency)` applies `OVR_PROFICIENCY_ADJUST[proficiency][position]` (`max(40, k·est + c)`) to the full-proficiency estimate; `simulateBuild` derives the proficiency from the card's `positionAptitudes` (0 full / 1 half / 2 none) and reports it in `BuildResult.proficiency`. Because the map is monotone, `bestAllocation` needs no change. The panel labels each position option with the proficiency and swaps the accuracy note; the ±1 claim is shown only for full-proficiency positions. The fixture carries `alt` (hub overall at every non-full position of each card) so the tests guard the penalty table.

### 3. Max OVR by dynamic programming
The cost curve is concave in cost per stat point (cost grows by tier), and the objective is linear in the stats, so a DP over categories with the budget in half-points is exact and fast (10 categories × at most about 130 half-point states). Alternative rejected: greedy by marginal gain, which can be suboptimal across cost tiers.

### 4. Oracle fixtures
A fixture `packages/shared/src/__fixtures__/progression-oracle.json` (≤ 300 lines) holds, per sampled card: base stats, hub max stats, hub allocation per category, level cap, position, reference overall and booster vector. It contains only numeric game data derived from the dump, no names or ids that identify keys or secrets. Tests assert the rules from the spec, not just self-consistency.

### 5. Panel placement and state
The panel lives in `PlayerDetailClient.tsx` (with a small extracted component if the file grows), keeps its state in React state (not the URL), and renders only when `levelCap > 1`. Projected stats feed the existing stat sections and the card overlay through props; the existing "stats at max level" toggle remains separate and is disabled while a custom build is active, so two different "max" meanings never mix.

### 6. API changes are minimal
`player.byId` already returns `levelCap`, `booster1` and `booster2`; verify the booster vector is sparse stat deltas. `community.simulate`/`saveBuild` and their schemas move to the 10 categories and drop manager fields so the repository still typechecks. `BuildSimulator.tsx` is adjusted only to compile.

### 7. Goalkeeper Jump
For goalkeepers the Aerial category's Jump delta is not projected; the UI shows "n/a (card-specific)" because the hub carries a card-specific offset the rules cannot reproduce.

### 8. Compare edge fix
`CompareClient.parseIds` rejects ids above the int8 maximum (shared bound) so a single bad id cannot make the API reject the whole batch.

## Risks / Trade-offs

- **[Risk]** The OVR weights depend on the hub's formula revision → Mitigation: label the value as an estimate, record the fit metadata, keep the fit script outside the repo and note regeneration steps in the docs.
- **[Risk]** Goalkeeper accuracy is lower (about 93% within ±1) → Mitigation: show a lower-confidence note for goalkeepers.
- **[Risk]** Booster ids with wrong or missing stat vectors (known seeder gaps) → Mitigation: read vectors from the resolved Booster rows and show "unknown booster" instead of guessing; verify with the oracle on cards that carry boosters.
- **[Trade-off]** Cards with level cap 1 (about 79% of the catalogue) show no panel; this matches efootbase's own data.
- **[Trade-off]** No manager control until a verifiable dataset exists.
