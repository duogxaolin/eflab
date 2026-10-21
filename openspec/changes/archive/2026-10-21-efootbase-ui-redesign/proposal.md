## Why

The owner compared the running site with efootbase.com and found eFootLab's interface clearly weaker. They asked to rebuild the interface to match efootbase.com as closely as possible and will hand-tune individual pages afterwards. Earlier parity work copied labels, controls and some tokens from older captures, but a fresh capture of efootbase.com (2026-10-20, kept in an outside-repo reference folder) and a page-by-page gap analysis show many differences in tokens, backdrop, header, tab bar, footer, card captions and hover, the players rail and dialogs, the detail page layout, the Progression panel, and the home, packs, compare and skills pages.

## What Changes

- **Design tokens and backdrop**: theme colour values, radii, typography and the aurora backdrop change to the measured reference values. Token names stay, so every page (including `/admin`) follows.
- **Shell**: a 65 px header with reference link styling, a floating mobile tab bar below 1024 px (replacing the edge-attached bar and the hamburger menu), and a footer of the brand block and eFootLab's own link columns (no community, social or legal columns — eFootLab has no such pages) with mobile accordions.
- **Card tiles**: hover becomes a 1.05 scale (the 3D tilt and glare are removed), and captions gain two variants: name only, or two playing-style lines.
- **Pages**:
  - **`/players`**: 280 px rail with icon rows, toggle and range styles, 608 px filter dialogs, a bottom sheet below 1024 px, and grid columns 4/6/5/6.
  - **Player detail**: the hero, a single Overview card, 36 px stat rows (three columns from 1024 px, two below), the 288 px skill tooltip and a 180 px card face without the MAX badges.
  - **Progression**: a sticky 280 px panel, a bottom-anchored manager drawer, and on mobile a floating category strip, a dock and a bottom sheet.
  - **Home**: the hero and quick filters are removed. Home becomes a search field, 12 "Latest Players" and "Latest Packs".
  - **`/packs`, `/compare`, `/skills` and the ⌘K palette**: restyled to the reference. Skills get wiki-style tiles and a name search.
- **Public UI copy** no longer names efootbase or any other third-party data source (eFHUB, pesdb) (owner branding rule).
- **Contrast over the backdrop**: text drawn on the aurora and the detail tint keeps 4.5:1 against the brightest backdrop pixel (a brighter on-backdrop text tone, a faint tint).
- **Deliberate deviations kept**:
  - numeric pagination instead of "Load more" (the URL `page=` contract);
  - the "More" sort select, our count labels, `CARD_TYPE_LABELS` and the "Latest Players" label;
  - pack carousel pause and previous/next controls;
  - wrapping stat names;
  - our `/skills` routes;
  - no community, feed, login, language, rating, comment or position-training features (no data).
- **BREAKING (UI)**: the home quick-filter chips are removed, and their spec requirement goes with them.

## Capabilities

### New Capabilities
- `efootbase-ui-parity`: the measurable visual and behavioural contract of the rebuilt interface — tokens, backdrop, shell, card tiles, each page, dialogs, drawer, dock, palette, plus responsive, accessibility and regression guards.

### Modified Capabilities
- `card-showcase-ui`: the card view requirement changes from 3D tilt and glare to the reference hover scale.
- `catalog-browsing-parity`: the home quick-filter requirement is removed (the home page no longer has quick filters); "Player Detail Accuracy" shows the card's real max level as a "Max Level" row in Card Info instead of on the face's max-level badge, which the reference face does not have.
- `site-quality-baseline`: the keyboard and screen-reader requirement no longer mentions tilt; the hover motion is disabled under reduced motion instead.
- `player-progression-simulator`: the panel's copy describes the model neutrally (the game's overall formula as measured on N readings) instead of naming efootbase; the overall's description, the Max OVR note and the limits note live in an "About this build" disclosure inside the panel; below 1024 px the panel lives in a bottom sheet opened from a category strip and a dock; each category row shows its next stat point's cost as a compact "next N" (requirements Cost Curve, Max OVR Preset, Honest Limits, Accessible and Responsive Panel, Honest Estimate Label). The engine rules are unchanged.

## Impact

- **Code**: `apps/web` only — `app/globals.css`, `app/layout.tsx`, `components/layout/*`, `components/cards/PlayerCard.tsx`, `components/packs/PackCarousel.tsx`, `components/filters/*`, `components/players/*`, `components/detail/*`, `components/build-simulator/*`, `components/skills/*`, `app/page.tsx`, `app/players/**`, `app/compare/CompareClient.tsx`, `app/packs/**`, `app/skills/**`, plus new small shared UI pieces such as a section header and a drawer variant of `Modal`.
- **Docs**: `openspec/ui-dna.md`, the theme and card lines in CLAUDE.md, and README.md where it describes the UI.
- **No change**: API, database, data pipeline, Progression engine, worker, admin behaviour, image pipeline.
- **No efootbase source, CSS, images, logos, fonts or screenshots enter the repository.** Only our own code with measured values.
- **Risks**: the shared token change cascades to every page and to `/admin`; the detail page and Progression layout changes are large; the reference captures do not cover a filled two-player compare, the pack detail page or the skill detail page, and these follow the token and component rules only.
