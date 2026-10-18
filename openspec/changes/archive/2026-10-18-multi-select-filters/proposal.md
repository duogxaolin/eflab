## Why

efootbase lets users choose several positions, nations, leagues and teams at once. eflab accepts one value for each (the API inputs `position`, `nationalityId`, `leagueId`, `clubId` are single-valued and the Position filter is a single-choice popover), so common questions such as "all strikers and second strikers" or "players from Argentina or Brazil" need several searches. The owner asked to reopen this gap, and it can be delivered completely on the data we already hold.

## What Changes

- The API accepts lists for position (up to 13), nations, leagues and teams (bounded, de-duplicated, valid int4 values). Values inside one filter are OR-ed, different filters are AND-ed. The older single-value inputs keep working.
- The URL repeats the parameter (`pos`, `nat`, `league`, `team`) as efootbase does; nations use our internal ids because no ISO column exists. Old single-value links keep working.
- The Position filter becomes 13 independent toggles; Nation, League and Team use the existing search modals in multi-select mode with a Done button, a selected-count and removable chips; the pickers enforce the 50-value bound themselves (disabled options plus an "At most 50 selections" message) so no selection is dropped on the way to the URL.
- The count of active filters on the mobile Filters button includes the new multi-selections.
- Unit tests for URL parse/serialise, smoke checks for the API, and a Playwright run.
- No database change, no migration, no new runtime dependency.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `catalog-browsing-parity`: the filters requirement and the URL-state requirement describe multi-valued position, nation, league and team filters.

## Impact

- `apps/api` player router and `packages/shared` schemas, helpers and tests; `apps/web` players page, filter components and URL helper; `scripts/smoke-test.sh`; CLAUDE.md, README and `openspec/ui-dna.md`.
- Limitation to document: Nation uses internal ids (no ISO code column).
