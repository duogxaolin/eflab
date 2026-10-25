## Why

The browser QA of 2026-10-25 left a few known inconsistencies: the card page and compare still name the **team's** league while the League filter matches the **card's own** league (17,608 cards of 14 teams differ; the card page shows "Other" for the 17,163 "FREE" cards that the filter calls "Free Agent"), accessible names of card tiles, the ⌘K button, skill tiles and compare slots omit text that is visible on screen (WCAG 2.5.3 "Label in Name" — only axe-core 4.10 reports clean, axe 4.14 flags every public page), a switched-off booster reads "Balance , Off", an empty `/players` result announces "No results found." twice, and in a landscape phone the popover can still cover the floating strip.

## What Changes

- **Card league in the API and UI:** `player.byId` and `player.compare` return `cardLeague` (`{ id, name, emblemUrl } | null`, from `Player.leagueId`); the existing team `leagueName` / `leagueEmblemUrl` stay for callers. The detail header badge, a new **League** row in Card Info and the compare Overview use the card's own league and fall back to the team's league only when the card has none. No migration, no change to filters.
- **Label in Name:** the accessible name of a card tile, the header ⌘K button, a `/wiki/skills` tile and a compare "Add Player" slot contains the text it shows; `aria-keyshortcuts` carries the shortcut. Visible text is not changed.
- **Switched-off booster:** its accessible name reads "…, Balance, Off" (no space before the comma).
- **Empty `/players`:** one "No results found." announcement.
- **Floating popovers** avoid every fixed bottom chrome (strip, dock, tab bar) whatever its screen position, including landscape phones.
- **Verification:** axe-core 4.14 with `label-content-name-mismatch` enabled reports 0 violations on the public pages at 1440 and 390 px; the docs say so.
- Not in this change: the Next 16 upgrade, the S4 measurements, filter or engine behaviour.

## Capabilities

### New Capabilities
- `a11y-and-card-league`: the card-league DTO and its display, the accessible-name rules for the named controls, the booster-off name, the single empty-state announcement and the floating-floor rule for every fixed bottom chrome.

### Modified Capabilities
- `site-quality-baseline`: Keyboard and Screen-Reader Access (Label in Name for links and buttons).
- `catalog-browsing-parity`: Player Detail Information Sections (League row; the card's own league).

## Impact

- **API:** `player.byId`, `player.compare` (additive field). **Shared:** `PlayerCardDTO`. **Web:** `PlayerCard.tsx`, `SiteHeader.tsx`, `app/wiki/skills/SkillsClient.tsx`, `app/compare/CompareClient.tsx` (+ Overview), `CardInfo.tsx`, `PlayerDetailClient.tsx`, `components/ui/floating.ts`, `app/players/PlayersClient.tsx`. **Smoke test:** a card-league check. **Docs:** CLAUDE.md, README.md, `openspec/ui-dna.md`.
- No migration, no database write, no new dependency (axe-core only in a scratch folder).
