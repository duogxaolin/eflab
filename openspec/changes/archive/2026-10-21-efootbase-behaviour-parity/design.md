## Context

See `proposal.md` and `specs/`. The source of truth for every behaviour is the behaviour gap report in the outside-repo reference folder (`BEHAVIOUR-GAP.md`), which grades each reference behaviour (M measured, C class-derived, S screenshot, I inferred, NC not captured), lists the owner decisions O1–O15 and maps the QA bugs B1–B7. The visual rebuild (`efootbase-ui-redesign`) is merged; its deviations list is in `openspec/ui-dna.md`.

Owner decisions taken for this change: tooltip delay 1500 ms (as the reference token), 72 cards per page with numbered pages kept, pack rows without auto-advance, Progression pinned through the main column with Card Info moved below; every other recommendation in the report (O1–O15) is accepted as written.

## Goals / Non-Goals

**Goals:**
- One tooltip and one popover primitive used everywhere, accessible by mouse, keyboard and touch.
- Behaviour parity on the detail page, players page, home, compare and skills as listed in the specs.
- Fix the QA bugs at their root.

**Non-Goals:**
- Card context menu, card-face copy/download buttons, "Load more", dual-handle sliders, community features, changes to the Progression engine or the database.

## Decisions

**1. Primitives in `components/ui/`.** `Tooltip.tsx` (mouse-only hover via `pointerType === "mouse"` and `(hover: hover)`, delays from constants `TOOLTIP_DELAY_MS = 1500`, `TOOLTIP_CLOSE_DELAY_MS = 500`, warm-up window 500 ms held in module state, top-layer rendering with `popover="manual"`, placement and 8 px clamp reused from the current skill popover, hover bridge so the pointer can move onto it) and `Popover.tsx` (native `popover="auto"` light dismiss, `role="dialog"`, focus management, `aria-expanded`). Touch on a tooltip trigger that is a link: the first tap is intercepted (`pointerType !== "mouse"`), opening the popover variant that contains the link. Alternative — a third-party library — rejected: no new dependencies, and the native popover API already covers top layer and light dismiss.

**2. Modal Escape.** `Modal` handles `keydown` Escape on its own `<dialog>` when the event was not `defaultPrevented` and the dialog is the topmost open dialog, calling `preventDefault()` and closing. Controls that consume Escape (Max Level draft) call `preventDefault()` first. This removes the Chrome behaviour where a `type="search"` field swallows the first Escape.

**3. Pinned dialog search.** The search of `PickerList` and of the manager drawer renders above the scrolling body (or `position: sticky; top: 0` with the panel background) so it never scrolls away; chips and the limit message stay under it.

**4. Stat Adjust popover reuses the panel's actions.** `ProgressionPanel` exports its category stepper (and proficiency control) as components fed by the same state in `PlayerDetailClient`; the stat-row popover renders the stepper for the row's categories (two for Jumping) plus the breakdown that currently lives in `title`. One state source, no duplicated arithmetic.

**5. Progression layout.** Left column = card face, marks, pinned Progression card (`position: sticky; top: 64px; z-index: 10`) — these three in a wrapper that grows to fill the column and is the pinned card's travel range — then, at the end of the left column, below the pinned card's travel, the non-sticky Build settings card (Max Level, Position, estimate, "About this build"). Directly under the pinned card would not fit: the card (684 px on Messi) plus the gap plus the Build settings card (≈ 237 px) exceed what 1440×900 leaves below the 64 px offset, so a pinned card would either cover Build settings or need an inner scroll; at the column's end it never overlaps it. Card Info and Other Versions move to a full-width row after the two-column grid (two cards side by side from `lg`). Phone order stays: face, marks, overview…, Card Info, Other Versions; the panel lives in the sheet.

**6. Phone dock popover.** The proficiency chip and avatar open a `Popover` anchored above the dock (dock width, radius 16) with the manager trigger (opens the drawer) and the proficiency control with 36 px −/+ buttons; the strip, points pill and Progression button open the sheet and scroll its category list into view.

**7. Players.** `PAGE_SIZE = 72` (API limit allows 200); `SEARCH_MIN_LENGTH = 2` shared from `@eflab/shared`; out-of-range page clamped after the first response with `router.replace`; `RangeFields` re-syncs only the field that does not have focus and validates min ≤ max before committing; Nation popular group computed from `player.countries` card counts (top 10); field sorts get a natural default order in `lib/filter-url.ts`; the API sorts Name on `nameNormalized` and ranks search results in five tiers — whole word (`nameNormalized ~ '\mq\M'`), word start (`~ '\mq'`), any other substring, CJK-name substring, trigram fuzzy match — with `maxOvr DESC` inside the first four and `similarity DESC` before `maxOvr DESC` inside the fuzzy tier (a near-miss spelling is only useful when it is close); `q` is regex-escaped and both regexes are bound as parameters; the WHERE clause is unchanged, so the trigram index is kept. A name-type sort (`name`, `namePrint`, `japName`, `chineseName`) without `order` in the URL now means ascending (A→Z) — before this change an order-less `sort=name` meant Z→A; this is an intentional URL change.

**8. Home and packs.** The home search becomes an APG combobox with `aria-activedescendant` over `role="option"` rows; first Escape closes the list (preventDefault on the input while open), second clears. `PackCarousel` loses its timer and pause button; previous/next arrows show on `:hover` / `:focus-within` and always under `(hover: none)`.

**9. Compare and skills.** The palette gets an `excludeIds` prop (rows disabled with "In slot N"); unknown ids are dropped after the fetch with `router.replace` and a polite message; `showDetails` only from `md`. Skills: a normaliser that maps `[-‐–—_/]` to spaces before `normalizeSearchQuery`; `group`/`q`/`page` params with `replace`.

**10. Card face position (B2).** The face receives the selected position with the build overall.

**11. Operations.** After each web build the `next-server` listening on :3000 is stopped by port (`lsof -ti tcp:3000 -sTCP:LISTEN`) and restarted, then every `/_next/static` asset referenced by the main routes is checked for HTTP 200. Automated checks use web 4200 and API 7200.

## Risks / Trade-offs

- [1.5 s hover delay feels slow] → warm-up makes subsequent previews instant; constants are in one place for the owner to tune.
- [Touch double-tap pattern on skill links] → documented and tested with touch emulation; the popover carries the link.
- [Moving Card Info changes the reference layout] → owner decision; it prevents the pinned panel from covering content.
- [Search ranking SQL change] → smoke tests for ranking and name order; EXPLAIN checked to keep the trigram index.
- [72 cards per page increases image requests] → near-viewport lazy loading stays; measure first-load image count.
- [Not captured reference behaviours (Adjust popover contents, delays, close-on-select)] → defaults chosen and marked inferred in `ui-dna.md`.

## Migration Plan

Web-only behaviour change plus two API query changes, on branch `efootbase-behaviour-parity`. Rollback = revert the merge.
