## Context

See proposal.md. Facts checked in the tree and the database (read-only): `Player.leagueId` exists since change `efootbase-data-refresh-1024` (stored on all 50,818 dump cards, NULL on the 3 eFHUB-only rows); `player.byId` / `player.compare` build the DTO from the team join (`team.league`) through `PlayerRowForDto` (`leagueName`, `leagueEmblemUrl`); 17,608 cards have an own league different from their team's, 17,163 of them team "FREE" (team league "Other" 0, own league "Free Agent" 48). The accessible-name mismatches are the four named in the proposal (axe-core 4.14 `label-content-name-mismatch`); axe 4.10 has the rule disabled as experimental.

## Goals / Non-Goals

**Goals:** page and filter agree on a card's league; every named control passes Label in Name without changing visible text; the small QA leftovers close.
**Non-Goals:** filters, engine, data, Next upgrade, S4 measurements; removing the team's league from the DTO.

## Decisions

### D1. `cardLeague` is additive
The API selects `league` through a second relation on the card (`Player.leagueId` has no Prisma relation — no FK by design): `player.byId` / `player.compare` run one extra `League.findUnique` / batched `findMany` keyed by the card's `leagueId`. Result `{ id, name, emblemUrl (rebased with rebaseR2Url) } | null`. `leagueName` / `leagueEmblemUrl` stay as they are (team). The web helper `cardLeagueOf(dto)` returns `dto.cardLeague ?? (dto.leagueName ? { id: null, name: dto.leagueName, emblemUrl: dto.leagueEmblemUrl } : null)` and is the single place that decides the fallback (header badge, Card Info row, compare Overview).

### D2. Label in Name rules
WCAG 2.5.3 wants the visible text to be contained in the name (axe checks that the normalised visible text is a substring of the name, in order). Names are rebuilt from the visible text pieces:
- Card tile (`PlayerCard`): the face shows overall and position; the name becomes `"<ovr> <POS> <name>, <card type label>…"` plus the existing extras (max overall, condition…), so the visible text "85 CMF" is a prefix. The helper is shared with the compare slot face and the search rows where they build the same label.
- Header ⌘K button: `aria-label="Search players"` + `aria-keyshortcuts="Meta+K Control+K"`; the visible chip stays.
- Skill tile: name = visible skill name + description + count text order as rendered, the leader appended after ("…, top card: X").
- Compare slot: `aria-label="Add Player, Search and select a player (slot N)"`.
- Anything else axe 4.14 reports is fixed the same way; the visible text is not changed unless a name cannot reasonably contain it.

Implementation note (2026-10-25, tasks 2.1–2.3): axe 4.14's rule reads the element's on-screen text — text nodes joined without separators, `aria-hidden` text included when it is visible, visually hidden text excluded — and wants it as one contiguous word run inside the name. Three of the names above cannot be written as an `aria-label` under that rule, so they are built from the content instead (the rule then does not apply, as in ACT 2ee8b8, and each visible run is in the name, whole and in order): the card tile (a "styles" tile shows "85 CMF" and then the two style lines under the card — the name is "85 CMF <name>, <card type>. Condition A Attack: … Defence: …"), the header ⌘K button (its visible ⌘K chip puts a "K" in the on-screen text; the name is its text "Search players", the shortcut in `aria-keyshortcuts`) and the skill tile (the leader's name is shown before the count, so the name is the content in that order with a visually hidden "Top card:" before the leader; the description is part of the name and `aria-describedby` was dropped). The compare slot keeps the `aria-label` above. Where an `aria-label` stays, a space text node (not rendered in the flex containers) separates visible pieces that would otherwise run together ("Add Player Search …", the goalkeeper number and the value of a strip item, the booster label and "Off"). The further controls axe 4.14 reported were fixed the same way: stat-row Adjust buttons (named by content, "Adjust Dribbling: Dribbling +4 booster 97"), the Trending Booster 1 button, the palette's Esc chip ("Esc, close search", `aria-keyshortcuts="Escape"`) and the phone dock's points ("0/60 pts left — open Progression").

### D3. Booster Off name
`BoosterOffBadge` currently renders the comma as a separate `sr-only` span in an inline-flex container, which adds a layout space before it. Fix at the root: the button gets an explicit `aria-label` built from its label text + ", Off" (computed, no stray whitespace), and the visible badge is `aria-hidden`. Verified with the Chromium accessibility tree.

### D4. One empty announcement
The count line keeps its sr-only count text but drops the sentence "No results found."; the visible empty state owns it (`role="status"` stays on one element).

Implementation note (2026-10-25, task 3.2): the count line says "0 cards" (sr-only, in its existing polite live region); the empty state is rendered inside an always-mounted `role="status"` element (empty and room-less while there are results), so the sentence is announced when it appears and exists once in the page.

### D5. Floating floor
`floating.ts` currently ignores bottom chrome whose top is in the upper half of the viewport. Replace the heuristic with an explicit rule: every element marked `data-floating-floor` that is visible and fixed contributes, no matter where it sits; when the floor would leave less than a minimum height for the floating element, the existing bottom-sheet form (`sheetBelow`) is used above the chrome. Tested at 568×320, 844×390, 740×360, 390×844, 320×568.

Implementation note (2026-10-25, task 3.3): "every" includes the chrome that holds the anchor (the former exception let a strip item's sheet-form popover stand on the dock over the strip); the minimum is `MIN_FLOATING_AREA` = 160 px of visible viewport above the chrome.

### D6. Verification
axe-core 4.14.x installed in a scratch folder (never the repo); `runOnly` WCAG 2 A/AA + `label-content-name-mismatch` enabled; 12 pages × 1440/390; accessibility tree checks for the booster name and the card tile; a smoke check that the API's `cardLeague.id` equals the SQL `leagueId` for a card sample and that `leagueIds=[id]` contains the card.

## Risks / Trade-offs

- [Longer card tile names change what screen readers read] → the added text is only the visible overall + position, put first; the rest is unchanged.
- [One extra query per card page / per compare] → a primary-key lookup (34 rows table); negligible, measured in the smoke run.
- [The League filter's meaning is unchanged] → no filter edits, so no URL or count changes.

## Migration Plan

None (no schema change). Rollback = revert the merge commit.

### As built (2026-10-25)
Axe 4.14 joins all on-screen text of a control without separators and counts visible text even when it is `aria-hidden`. A literal `aria-label` such as "85 CMF <name>…" therefore cannot contain a tile's visible text (overall + position + two style lines) as one run, so the card tile, the header ⌘K button (visible chip) and the skill tile are named by their content, in the order of the visible runs, with extra context in visually-hidden text; the compare slot keeps its `aria-label`. The spec requirement is worded per visible run accordingly. `MIN_FLOATING_AREA` = 160 px (the design gave no number): a popover whose room above the chrome is smaller switches to the sheet form.
`MIN_USABLE_AREA` = 96 px (added after the verify): when the chrome leaves less than that above it, `chromeFloor` returns Infinity, so on a viewport under about 250 px tall the popover covers the chrome again instead of shrinking to a 12–17 px sliver. Measured 2026-10-25: 568×260 / 240 / 220 / 200 → popovers 170–221 px tall; the five spec viewports unchanged.
