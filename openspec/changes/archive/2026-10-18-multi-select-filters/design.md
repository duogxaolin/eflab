## Context

See proposal.md. Single-valued filters exist in the API (`position`, `nationalityId`, `leagueId`, `clubId`) and in the web URL helper; the picker and modal components already support searching a list and a Done button. The earlier round measured common filter combinations under 28 ms, and existing indexes cover position, nationality and team lookups; league is reached through the team relation.

## Goals / Non-Goals

**Goals:** complete multi-select behaviour end to end with deterministic URLs, bounded inputs and verified counts.
**Non-Goals:** ISO nation codes (no column), new indexes or migrations, redesigning the filter panel.

## Decisions

1. **List inputs, single inputs kept.** The schema accepts the new list fields and still the old single fields; the API merges both into one set before querying, de-duplicates and bounds it (positions ≤ 13, other lists ≤ 50, int4 range). Invalid members produce a 400 with the existing error style.
2. **Query shape.** OR inside a filter becomes `IN`/`ANY` on the existing columns (position through the aptitude rule that already maps a position to its registered/aptitude columns, league through the team relation); different filters are AND-ed in the same `where` object as today.
3. **URL.** Repeated parameters, serialised in a stable order (position by catalogue order, ids ascending) so equal states produce equal URLs; unknown or out-of-range members are dropped on read; legacy single values are read the same way and are rewritten on the next change.
4. **UI.** Position uses toggle buttons with `aria-pressed`; the three modals use the existing picker in multi-select mode with a selected count, removable chips and a Done button; the active-filter badge counts selected values by filter, not by value.
5. **Bound enforced in the picker, not the serialiser.** The picker takes `max = MAX_FILTER_IDS`: at the bound it refuses further additions (unselected options `aria-disabled`, an "At most 50 selections" live message, removals still allowed), so the URL helper's `slice(0, MAX_FILTER_IDS)` is only a safety net for hand-written links and never discards a choice the user made. The picker also owns the list's load state (`load` prop) so its "nothing matches" message appears exactly when the loaded list has no visible option.
6. **Strict integer ids.** The shared `int4` schema accepts a number or a decimal-digit string and nothing else; `z.coerce.number()` alone turned `null` / `true` / `""` / `[]` into id 0 and answered 200 for a malformed list.

## Risks / Trade-offs

- **[Risk]** A large OR list slows the query → Mitigation: bounded list sizes and an EXPLAIN check on the worst combination (50 teams plus 13 positions plus a stat range).
- **[Risk]** URL churn breaks old links → Mitigation: legacy single-value reading is kept and tested.
- **[Trade-off]** Nation ids are internal and can change when the catalogue is rebuilt, so shared Nation links are not stable across a re-seed; documented.
