## Context

See proposal.md. The captures and measurements that justify this change live outside the repository in the session scratchpad (`parity/`), because they contain third-party material. The progression engine counts half-points internally; efootbase shows whole points. The API already implements many player filters; the web UI exposes only a few. No database write, seed or migration is part of this change.

## Goals / Non-Goals

**Goals:** make the visible labels, defaults and filters match the observed efootbase behaviour wherever our data supports it; keep every claim verifiable; be explicit about what could not be matched.

**Non-Goals:** refreshing the dump, comparing efootbase filter results (its API is blocked for automation), Position Training, In-Match Roles, Feed/Wiki/Login/community features, a Manager picker.

## Decisions

1. **Default scope is all card types.** The previous default (Epic + Highlight) was a documented assumption that the capture disproved. The quick filter on the home page stays, because it is a valid shortcut that does what its label says.
2. **Single label table.** Card-type labels and any renamed card types change only in `CARD_TYPE_LABELS`, only where the dump's own labels and the capture agree; the enum is not renamed.
3. **Points unit.** The engine keeps half-points; a display helper doubles them. Tests assert the displayed unit for a level-32 card ("62 pts").
4. **Default build.** The panel initialises from `bestAllocation` with both boosters on; the "custom build" notion is defined relative to that default.
5. **Proficiency.** Without enough measurements, the estimate is labelled, not modelled. A model ships only if it reaches 95% within ±1 on at least 30 held-out builds measured on at least three other cards including a goalkeeper; otherwise the label stays and the limit is documented.
6. **Filters.** Added in priority order; each is an API input with an `EXPLAIN` check (under 100 ms for common combinations). If an index is needed it is reported and not applied here.
7. **Playing styles.** The list is derived from the dump's meta and verified against real cards; styles without cards in our database are listed as unavailable, never given invented ids.
8. **Skill labels.** A display-only table in the web app maps stored skill names to efootbase's observed labels and Showtime grouping; the database is not changed.
9. **Detail sections.** Fields come from existing columns; In-Match Roles is skipped because the dump has no such data.

## Risks / Trade-offs

- **[Risk]** Labels copied from a capture could drift from the real site → Mitigation: only observed labels are changed, each recorded with its evidence in the verifier's report outside the repo.
- **[Risk]** More filters slow the list endpoint → Mitigation: `EXPLAIN` budget and a report instead of a silent index.
- **[Trade-off]** The estimate stays about 4 lower than efootbase's default display unless a verified proficiency model exists.
