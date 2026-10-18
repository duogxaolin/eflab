## 1. Shared and API

- [x] 1.1 Extend the player list input with bounded list fields for positions, nations, leagues and teams while keeping the single-value fields; merge and de-duplicate them in the router; return 400 for invalid members.
- [x] 1.2 Apply OR-within / AND-between semantics in the query; check `EXPLAIN (ANALYZE)` for common and worst-case combinations (under 100 ms or report; do not create or apply migrations).
- [x] 1.3 URL helper: parse and serialise repeated `pos`, `nat`, `league`, `team` with stable ordering, de-duplication and dropping of invalid members; keep reading legacy single values; unit tests. ← (verify: round-trip equality, legacy links, invalid values dropped)

## 2. Web

- [x] 2.1 Position: 13 toggle buttons (`aria-pressed`), multiple selection.
- [x] 2.2 Nation, League, Team: multi-select modals with search, selected count, removable chips and a Done button; focus trap, Escape and focus return.
- [x] 2.3 Active-filter count on the mobile Filters button includes the new selections; page resets to 1 on every change; no horizontal overflow at 320–480 px. ← (verify: counts equal independent psql counts for at least two combinations per filter; reload preserves state)
- [x] 2.4 Selection limit in the Nation / League / Team pickers (`max = MAX_FILTER_IDS`): at 50 the unselected options are `aria-disabled` and an "At most 50 selections" live message shows; removals still work; the URL never loses a selection (the serialiser's slice stays as a safety net only). ← (verify: Playwright — 50 nations selected, 51st option disabled with the message, deselect one re-enables, no overflow at 320 / 375 / 480 with the message visible)
- [x] 2.5 Picker owns its load state (`load` prop) so "Nothing matches." / "No team of the selected leagues matches." renders once the list is loaded and the search (or league narrowing) leaves nothing. ← (verify: Playwright — Nation search `zzzz`, Team dialog with `league=4&league=10` and search `barcelona`)

## 3. Tests and docs

- [x] 3.1 Smoke checks: position [CF, SS], multiple leagues, multiple teams, a combined AND case, 400 for invalid lists (including a `null` member — the shared `int4` schema no longer coerces non-integers to 0; unit-tested in `helpers.test.ts`).
- [x] 3.2 Playwright: two positions, two nations, two leagues, two teams, reload, page reset, zero console errors; record First Load JS for `/players` (limit +3 kB over 168 kB).
- [x] 3.3 Update CLAUDE.md, README.md and `openspec/ui-dna.md` (parameters, behaviour, the Nation-id limitation).
- [x] 3.4 `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @eflab/web build`, `openspec validate --specs`; confirm no DB write and nothing committed or pushed. ← (verify: measured results meet every scenario)

## Measurements (2026-10-18)

- **Query cost** (read-only `EXPLAIN (ANALYZE)`, no new index; the bar was 100 ms): CF|SS count 23.5 ms · two nations 0.6 ms · two leagues 0.8 ms · nations + leagues + positions page 11.9 ms · worst case 13 positions + 50 teams + a stat range 7.6 ms (count) / 5.2 ms (page). These figures go stale with the data; CLAUDE.md only states the bound.
- **First Load JS** (`next build`, after the picker limit / load-state fixes): `/players` 168 kB (unchanged from the 168 kB baseline, limit +3 kB), `/players/[baseId]/[cardId]` 170 kB, `/` 163 kB, `/compare` 163 kB, `/packs` 159 kB, `/packs/[slug]` 158 kB, `/skills` 161 kB, `/skills/[slug]` 161 kB, shared 103 kB. `/`, `/packs` and `/skills/[slug]` are +1 kB over the pre-change baseline because the shared helper chunk grew; `/players` itself did not move.
- **Playwright** (production build, API on 6000 / web on 4000, Chromium with `--explicitly-allowed-ports=6000`): 50 nations → "At most 50 selections" visible, a 51st option `aria-disabled`, a forced click changes nothing (URL keeps all 50 ids, largest id included); chip removal at the limit → 49, message gone, option enabled, selecting it → 50 ids with the new id and the largest kept; the same on Team (50 teams); League keeps an empty `sr-only` live region (34 leagues < 50). Nation search `zzzz` → "Nothing matches."; Team with `league=4&league=10` and `barcelona` → "No team of the selected leagues matches."; a delayed countries query shows "Loading nations…" and no empty message. No horizontal overflow at 320 / 375 / 480 px with the mobile Filters sheet, the nested Nation dialog and the limit message visible (the only elements past the viewport are the card-type chips inside their intentional `overflow-x: auto` strip). Zero console errors.
