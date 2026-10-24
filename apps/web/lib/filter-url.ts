// URL ⇄ state of the /players page (catalog-browsing-parity "Page State Lives
// in the URL"; change efootbase-function-parity, design decision D9). The
// codec itself is pure and lives in `@eflab/shared` (players-url.ts, next to
// the card-page and compare codecs) so its rules are unit-tested there; this
// module is the web's import point for it. PlayersClient reads the state from
// `useSearchParams`, holds it locally and writes every change back with
// `history.replaceState` (QA 2026-10-23 bug 1 — no server round trip per
// filter change).
export {
  DEFAULT_PLAYERS_STATE,
  FORM_STARS,
  MAX_LIST_PAGE,
  PLAYERS_URL_KEYS,
  WEAK_FOOT_STARS,
  activeFilterKey,
  activeFilters,
  countActiveFilters,
  defaultSortOrder,
  filterDialogCounts,
  groupTeamsForPicker,
  hasActiveFilters,
  orderNationsForPicker,
  playersListQuery,
  readPlayersState,
  resetFilters,
  resolveLegacyIds,
  searchApplies,
  withoutDefaultPage,
  withoutFilter,
  writePlayersState,
  type ActiveFilter,
  type FilterDialogRow,
  type LegacyIdLookups,
  type PlayersSort,
  type PlayersState,
} from "@eflab/shared";
