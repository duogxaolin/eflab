## Why

The previous change (`efootbase-ui-redesign`) matched efootbase.com visually, but the owner tested the site and found that behaviour and interaction still differ: skill names open on click instead of previewing on hover, stat rows only highlight instead of opening an "Adjust" control, the Progression panel stops sticking part-way down the page, the `/players` rail leaves the screen after a short grid, dialog searches scroll away, and more. A browser QA run on the same day also found seven bugs (B1–B7). A behaviour gap analysis against the 2026-10-20 reference captures (kept in an outside-repo reference folder) lists each interaction with an evidence grade and a recommendation; the owner chose the options for the four open decisions.

## What Changes

- **Shared primitives**: a hover/focus Tooltip (1500 ms open delay with warm-up, 500 ms close delay, hoverable and dismissable, immediate on keyboard focus, tap opens a popover on touch) and a click Popover extracted from the current skill popover.
- **Dialogs**: one Escape closes a dialog even when its search field has text (B4); dialog and drawer searches stay pinned while the list scrolls; drawer and sheet slide in over 250 ms (instant under reduced motion); focus is kept after "+N" in Other Versions (B5) and after removing a compare slot (B6).
- **Player detail (desktop)**: skill names become links with a hover/focus preview; the Overview paragraph and hero line get playstyle triggers and up to two Showtime skill links; clicking a stat row opens an "Adjust <Category>" popover with the category stepper and the stat breakdown; data that only lived in `title` attributes becomes visible or screen-reader text; readable booster labels; a Compare shortcut; the card face labels the selected position (B2).
- **Progression layout**: the panel sticks at 64 px while the two-column area extends below it (at the end of that area it scrolls up with the column instead of covering what follows); Max Level, the position selector, the position estimate and the "About this build" disclosure move to a non-sticky "Build settings" card at the end of the left column, below the pinned card's travel; Card Info and Other Versions move to a full-width row below the two columns.
- **Player detail (phone)**: the proficiency chip and manager avatar open a small non-modal popover above the dock (manager selection + proficiency); the strip, points and Progression button open the sheet at the categories.
- **`/players`**: 72 cards per page with numbered pages kept; text search from 2 characters; out-of-range pages redirect to the last page; "1 card"; range fields keep what is typed and refuse min above max with an inline error (B1); Nation lists ten popular nations first; Name sort defaults to A→Z on the normalised name; search ranks whole-word matches first, then word-start, other partial, CJK and fuzzy matches, by max overall inside a tier (by similarity first in the fuzzy tier) (API); a name-type sort without `order` in the URL now means A→Z (intentional URL change: it meant Z→A before).
- **Home**: the search combobox gets arrow-key navigation and two-step Escape (B7); pack rows no longer auto-advance and show previous/next arrows on hover, focus and touch (removes B3).
- **Compare**: the same card cannot fill both slots; unknown ids in `?ids` are dropped with a message; phone slots use the plain card face.
- **Skills**: hyphens are ignored in search; the group filter and search live in the URL; the skill page's top-cards page lives in the URL.
- **BREAKING (UI)**: pack carousels lose auto-advance and the pause control; skill chips navigate on click instead of opening a popover.

## Capabilities

### New Capabilities
- `efootbase-behaviour-parity`: the interaction contract — tooltip and popover primitives, dialog behaviour, skill links and previews, stat-row Adjust popover, inline triggers, Progression pinning and layout, phone dock popover, players paging/search/range/nation/sort rules, home combobox and pack rows, compare guards, skills URL state, no data hidden in `title`, and regression guards.

### Modified Capabilities
- `efootbase-ui-parity`: "Progression Panel, Manager Drawer And Mobile Dock" (pinning extent, dock popover), "Players Page Layout" (72 per page), "Home Layout" (pack rows without auto-advance), "Player Detail Layout" (Card Info row, stat rows open the Adjust popover, skill links).
- `catalog-browsing-parity`: "Skills Grouping" (skill chips become links with a hover/focus preview and a touch popover).
- `site-quality-baseline`: "Keyboard and Screen-Reader Access" (no auto-advancing carousels, tooltips/popovers keyboard and touch reachable).
- `player-progression-simulator`: "Honest Limits" (the part cut at 99 is shown in the stat row's Adjust popover breakdown, no longer in a stat tooltip).

## Impact

- **Code**: `apps/web` (new `components/ui/Tooltip.tsx`, `components/ui/Popover.tsx`; `components/filters/*`, `components/detail/*`, `components/build-simulator/*`, `components/players/PitchMap.tsx`, `components/packs/PackCarousel.tsx`, `components/search/*`, `app/page.tsx`, `app/players/**`, `app/compare/CompareClient.tsx`, `app/skills/**`, `lib/filter-url.ts`, `lib/card-display.ts`, `app/globals.css`) and `apps/api/src/router/routers/player.ts` (search ranking, name sort column).
- **Tests and docs**: `scripts/smoke-test.sh` (search ranking, name order), CLAUDE.md, README.md, `openspec/ui-dna.md`.
- **No change**: database schema, data pipeline, Progression engine (`packages/shared`), worker, admin.
- **Operations note**: the owner's server on :3000 serves `apps/web/.next`; after every build the `next-server` process listening on :3000 must be stopped by port and restarted, and every `/_next/static` asset re-checked for HTTP 200 (a stale server served mismatched chunks and broke the client).
