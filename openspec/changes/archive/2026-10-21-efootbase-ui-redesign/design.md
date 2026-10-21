## Context

See `proposal.md` for motivation and `specs/` for the measurable contract. The reference was captured from efootbase.com on 2026-10-20 in nine polite page loads and is kept in an outside-repo reference folder captured on 2026-10-20:

- `GAP-ANALYSIS.md` — page-by-page tables of reference value vs ours vs required change with likely files, the conflicts list and the batch plan. Implementers must read the section for their batch.
- `efb-captures/` — reference screenshots (full page, breakpoints 1280/1024/768/390, interaction states) and measured JSON (`*-tokens.json`, `*-measure.json`, `*-breakpoints.json`, `structure-outlines.md`, `css-custom-properties-resolved.json`).
- `ours-before/` — our pages before the change.

The current web app (`apps/web`) already matches the reference shell geometry in places (1152 px container, 65 px header, 280 px sticky rail, 6-column players grid at 124.66 px). The gaps are token values, component shapes, DOM structure, breakpoints and a few behaviours. Nothing in the API, database, Progression engine, worker or image pipeline changes.

## Goals / Non-Goals

**Goals:**
- Match the reference's tokens, backdrop, typography, radii, shell, components and page layouts at 1440/1024/768/390 px as measured.
- Keep every eFootLab behaviour, URL contract, accessibility guarantee, data label and `data-testid`.
- Leave the code easy for the owner to hand-tune afterwards: values live in tokens and a small set of component classes, not scattered literals.

**Non-Goals:**
- Features eFootLab has no data or product for: feed, comments, community rating and builds, login, language picker, in-match roles, position training, creator spotlight, app-store links, legal pages.
- A "Load more" pager, the reference's `/wiki` section structure and route names, a per-skill "leader" chip (no data).
- Copying the reference's HTML, CSS, JavaScript, images, logos, icons or fonts. Only measured values are used, written as our own code; icons come from Lucide.

## Decisions

**1. Follow the reference wherever it does not conflict with eFootLab data, contracts or accessibility.** The owner asked for the reference design without differences and will hand-tune pages later. Alternative — a curated "inspired by" design — was rejected by the owner's request.

**2. Tokens first, values not names.** Change the values in the `@theme` block of `apps/web/app/globals.css` and add the missing roles (default/default-hover, card, accent hover/soft/soft-fg, success, position colours, skill-boost). Keep existing token names so every consumer, `/admin` included, follows automatically. The five tier tokens stay the single source used through `statTier`/`statTierClass`/`statTierBg`. Alternative — new token names and a parallel theme — doubles the surface the owner has to tune.

**3. Backdrop.** One absolutely positioned top strip using the reference gradient, a vertical mask to transparent and a blur, scrolling with the page, replacing the radial gradients and the noise layer. The detail page adds a static tint per card type because the reference's per-card tint source could not be determined from the captures (no canvas sampling of R2 images: cross-origin pixels are not readable reliably).

**4. Shell.** Header links visible from 1024 px (`lg`), no hamburger; a floating tab bar below 1024 px carries the four sections (Players, Compare, Packs, Skills) plus Home; the body reserves `5.25rem + safe-area` at the bottom below 1024 px. Footer: our brand block plus our own link columns with mobile accordions (`<details>`/`<summary>` or buttons with `aria-expanded`), build stamp at the bottom right.

**5. Card tile hover = scale 1.05.** Remove the pointer tilt and glare from `PlayerCard`; apply `transform: scale(1.05)` with a raised z-index on hover and `:focus-visible`, captions to full white; no transition under `prefers-reduced-motion`. `card-showcase-ui` and `site-quality-baseline` requirements are modified accordingly. Alternative — keep tilt plus scale — departs from the reference.

**6. Caption variants.** `PlayerCard` gets a `caption` prop (`"name" | "styles" | "none"`); `"styles"` hides the name visually (kept as accessible name) and shows two 11 px lines with Lucide-based attack/defence icons. Pages choose their variant per the spec.

**7. Detail card face.** 180 px wide, condition letter kept, MAX LVL/MAX OVR badges and the "N POS BUILD" tag removed from the face; the header pill and the muted "dump max · no proficiency bonus" note keep the data honest. The nation circle overlay on the face follows the reference capture (verify against `detail-desktop-*.png`).

**8. Detail page structure.** One "Overview" card (no tablist with a single tab), stats `lg:grid-cols-3` / two columns below, boosters move to buttons in the Overview card (same toggle state, still owned by `PlayerDetailClient`), stat names keep wrapping (deliberate, existing spec), skill tooltip 288 px with artwork on top — the existing click/keyboard popover behaviour and its viewport clamping stay.

**9. Progression layout.** Desktop: sticky card in the left column; explanatory notes, accuracy text and limits move behind a disclosure inside the card; Max Level and the position selector stay as compact controls. Manager picker becomes a bottom-anchored drawer variant of `Modal` (native `<dialog>`, same focus trap/Escape/return). Mobile (<1024): the card is not rendered in the column; a floating category strip and a 366×50 dock above the tab bar open a bottom sheet (another `Modal` variant) containing the same controls. One state source — `PlayerDetailClient` — so desktop and mobile never diverge.

**10. `/players`.** Rail rows with Lucide icon tiles and chevrons; toggles, ranges and dialogs restyled; grid `grid-cols-4 md:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6`; mobile filters as a bottom sheet; numeric pagination restyled (deliberate deviation from "Load more", because `page=` is part of the URL contract and numbered pages meet the "reach every page" requirement). The Stats dialog keeps numeric min/max inputs restyled; a dual-handle slider is not added (accessibility and effort) — a deliberate deviation noted for the owner.

**11. Home.** Search field + Latest Players (12) + Latest Packs. The hero, quick filters and "Latest card" aside are removed; the `catalog-browsing-parity` quick-filter requirement is removed. `PackCarousel` keeps its pause/prev/next controls because they satisfy the carousel accessibility requirement.

**12. Skills.** Keep `/skills` and `/skills/[slug]`; index uses tiles with a client-side name filter (accent-insensitive via the shared `normalizeSearchQuery`), segmented group filters and section headers; detail page keeps artwork, effects and top cards with the new tokens. No `/wiki` sidebar.

**13. Compare.** Console geometry, slot shape and empty-state copy from the reference; swap and copy-link buttons; picker reuses the palette component; the filled view keeps our table/radar/diff restyled.

**14. Coarse-pointer rule.** The existing 44 px minimum for coarse pointers stays; small controls get an invisible hit area (padding or a pseudo-element) instead of growing visually. Text fields and selects cannot carry a pseudo-element, so on coarse pointers they are at least 44 px tall (visible change on touch screens only); sliders get a taller transparent input box with the track drawn inside it; no `overflow` clip may cut a hit area (verify fix W4).

**15. Brand strings.** Public copy that names efootbase (Progression notes, pitch note, manager picker, home) is rewritten neutrally ("the game's formula", "measured on N readings"). Docs keep provenance. Admin copy is unchanged.

**16. Verification method.** No efootbase access during this change. Each batch is checked by computed-style probes (Chrome headless or dev-browser against our build on ports 4200/7200) compared with the reference JSON at 1440/1024/768/390, side-by-side screenshots stored outside the repository, `pnpm typecheck`, `pnpm test`, web build, console errors, horizontal-overflow checks and a `data-testid` diff against the base commit.

## Risks / Trade-offs

- [Token change cascades to every page and `/admin`] → batch 1 ends with a screenshot pass of every route including `/admin/login`; values only, no renames.
- [Large detail/Progression restructure could break engine wiring] → state stays in `PlayerDetailClient`; `pnpm --filter @eflab/shared test` and existing smoke tests must pass; Playwright checks of manager rules and steppers.
- [Reference coverage gaps: filled compare, pack detail, skill detail, navbar blur, focus styles, tooltip delays, mobile sheet internals] → apply tokens and nearest captured component; mark as "not verified against reference" in tasks; the owner tunes later.
- [Deliberate deviations (pagination, sort select, wrapping stat names, carousel controls, numeric stats filter, no leader chip)] → listed in `openspec/ui-dna.md` so the owner can decide per page.
- [Removing tilt changes a documented behaviour] → specs and CLAUDE.md updated in the same change.
- [Bundle size] → no new dependencies; First Load JS of `/` and the detail route must not grow by more than 5 kB.

## Migration Plan

Web-only change on branch `efootbase-ui-redesign`, implemented in seven batches (see tasks). Rollback = revert the merge. No data migration.
