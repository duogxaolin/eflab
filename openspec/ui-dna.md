# UI DNA — eFootLab (eflab)

Design principles and interface specification for eflab. The visual language follows efootbase's dark, data-dense catalogue (zinc neutrals + lime accent); the branding, copy and components are eflab's own. Read this before any visual change. The dated snapshots in `docs/efootbase-ui-dna.md`, `docs/efhub-ui-dna.md` and `docs/pesdb-ui-dna.md` are historical reference material, not this spec.

> Updated 2026-10-17 (openspec change `eflab-parity-fixes`): tokens, card rendering, branding, skills and accessibility sections now describe the implemented UI. The earlier "Slate-Emerald" palette in this file was never what the code shipped since 2026-10-07 session 3.

## Design Tokens

All tokens live in the `@theme` block of `apps/web/app/globals.css` and are consumed as `var(--color-*)` or Tailwind utilities; hand-written component classes live in `@layer components` so utilities always win.

### Color Palette (zinc + lime)
- Canvas `--color-canvas`: `#060607` (page background)
- Panel `--color-panel`: `#18181b` (card / section surface, zinc-900)
- Elevated `--color-elevated`: `#232325` (modal / dropdown / hover surface)
- Line `--color-line`: `#28282c`; active hover `--color-line-active`: `#3f3f45`; faint separator `--color-line-separator`: `#212124`
- Text primary `--color-text-primary`: `#fcfcfc`; secondary `--color-text-secondary`: `#9f9fa9`; dim `--color-text-dim`: `#6b6b73`
- Accent `--color-accent`: `#acf41a` (lime — primary interactive focus, active pills, the "Lab" in the wordmark); on-accent text `--color-accent-foreground`: `#080d02`
- Accent secondary `--color-accent-secondary`: `#06b6d4` (cyan — compare "B" side, informational)
- Warn `--color-accent-warn`: `#f59e0b` (amber — boosts, caution)
- Danger `--color-accent-danger`: `#ef4444` (red — negative diffs, errors)

### Stat Tier Colors — single source `--color-tier-*`
- Elite (90+): `#00ffb4`
- High (80–89): `#96ff00`
- Mid (70–79): `#ffbe00`
- Low (<70): `#ff3200`

The four hex values are declared once, in the `@theme` block of `apps/web/app/globals.css`. Every consumer references the tokens: `statTierClass` / `statTierBg` in `apps/web/lib/card-display.ts` (used by the player-detail stat rows, best-fit pill and the Pitch Map rating cells) and the `.text-stat-tier-*` / `.bg-stat-tier-*` aliases in `globals.css`. No component may hard-code a tier hex.

### Card-Type Accents — `--color-card-*`
One token per `CardType` (`STANDARD #64748b`, `LEGENDARY #fbbf24`, `TRENDING #06b6d4`, `SELECTION #fb923c`, `EPIC #8b5cf6`, `HIGHLIGHT #10b981`, `STRIKE_ARENA #ef4444`), mapped by `CARD_TYPE_COLOR_VAR`. Labels always come from `CARD_TYPE_LABELS` in `@eflab/shared` ("Epic", "Highlight", "Strike Arena"…); raw enum names are never shown. "Big Time" and "Show Time" are pack campaigns, not card types (they are `EPIC` and `HIGHLIGHT`).

### Typography
- Primary sans: Inter via `next/font/google` (`var(--font-inter)`), system fallbacks.
- Card overlays: `eFootballStencil` (OVR) and `eFootballSans` (position/name) self-hosted from `apps/web/public/fonts/` — licence unknown, see CLAUDE.md "Known limitations".
- Numbers: tabular figures (`tabular-nums`, mono where values are compared).
- Headers: tight tracking, uppercase micro-labels (`text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]`).

### Radius & Density
- Badges, buttons: `rounded-lg`; cards and panels: `rounded-xl`; dialogs: `rounded-2xl`.
- 4 px spacing scale, compact padding suited to dense statistics.

## Component Patterns

### Navigation Header
- `h-16`, `max-w-6xl`, `px-4`, panel background with bottom line; eflab SVG wordmark (`EflabWordmark.tsx`, "eFoot" + lime "Lab") linking home with `aria-label="eFootLab home"`.
- Primary links: Players / Compare / Packs / Skills (also in the footer and the mobile bottom nav).
- ⌘K search opens a named modal `<dialog>` (focus trap, Escape, focus restoration); a mobile-only search icon button is hidden from `md` up.
- No language switcher, no cookie banner, no auth UI (removed rather than left as placeholders).

### Footer
- Columns: Browse (`nav[aria-label="Browse"]`) / Project; "eFootLab is an independent, fan-made player database… not affiliated with Konami" disclaimer; `© {year} eFootLab`.
- Build stamp `Build {sha} · {UTC}` only when `NEXT_PUBLIC_GIT_SHA`/`NEXT_PUBLIC_BUILD_UTC` are set (next.config.ts fills them from git); hidden otherwise. Never another site's build id.

### Player Card (`PlayerCard.tsx`)
- One real `<Link>` per tile (`.card-link`, accessible name = player name + OVR + position), optional name block below.
- Face = a single pre-composited image `cards/{id}_dynamic.webp` from R2 (`loading="lazy"`, `decoding="async"`, explicit width/height; the first grid row may pass `priority`). When the face fails to load (R2 404 / offline) the tile keeps its geometry and shows `.pcb__placeholder`: the OVR and position rendered in-card on a card-type tinted gradient (`CARD_TYPE_COLOR_VAR` mixed into the canvas colour); the OVR block and condition badge overlays are hidden in that state.
- HTML overlays: `.pcb__ovr-block` (OVR + position, top-left), `.pcb__condition` badge (`conditions/condition_{a-e}.svg`, bottom-right); with `showDetails` (detail page): `.pcb__nation` flag circle (left-mid), `.pcb__badge--max-level` (bottom-left) and `.pcb__badge--max-ovr` (bottom-right, replaces condition).
- CSS 3D tilt (±8°, `rotateX`/`rotateY`) and glare follow the pointer; disabled under `prefers-reduced-motion`. No Three.js/WebGL. The 4-layer background/frame composite is not used.
- Sizes: `sm` (`w-24`), `md` (`w-28`), `full`.

### Home
- Database banner on a panel surface, search combobox (`h-11`, Search icon, ⌘K hint, clear button, lime action), debounced (250 ms) autocomplete dropdown with mini thumbnails (`cards/{id}_transparent.webp`), name, position pill, card-type label, tabular OVR.
- Quick filter chips (text only, labels from `CARD_TYPE_LABELS`): `Epic & Big Time` (→ `/players?type=EPIC`), `Highlight & Show Time` (→ `/players?type=HIGHLIGHT`), `Legendary` (→ `/players?type=LEGENDARY`), `90+ OVR` (→ `/players?ovrMin=90&type=all`), `Packs`, `Compare`.
- Trending grid + "Latest Packs" carousel (FeaturedBundle, newest first) with prev/next buttons, a pause control, scroll-snap; auto-advance pauses on hover/focus, when the tab is hidden and under reduced motion. Titles link to `/packs/[slug]`.
- No fabricated sidebar content (no fake comments, creator spotlight or third-party hotlinks).

### Players Catalogue (`/players`)
- URL is the single source of state (`q`, `type`, `pos`, `style`, `dstyle`, `nat`, `foot`, `ovrMin`, `maxOvrMin`, `sort`, `order`, `page`); any filter change resets to page 1 and scrolls to top.
- Visible card-type scope control with an "All" option; default scope Epic + Highlight (efootbase's default view), "All" whenever `q` is set and no scope was chosen.
- Filter popovers expose `aria-expanded`, close on Escape and return focus; Playing Style options come from `PLAYING_STYLES` with real attack/defence ids.
- Windowed pagination (first/last/prev/next) that fits 320 px; result-count pill; grid `grid-cols-4 sm:5 md:6 lg:7 xl:8` of `sm` cards.
- Error state with Retry on every data page; 4xx responses are not retried.

### Player Detail
- Server-rendered `page.tsx` (404 via `notFound()`, `generateMetadata` with the player name) + client body.
- Card with `showDetails`, basic specs (floor-feet height such as `5'7"`), position & playstyle section, null-safe Pitch Map (`n/a` for missing ratings; Best Fit from non-null ratings, falling back to the registered position), stats at level 1 / at max level, skills (ellipsis only when more exist), boosters as pills, defence card from defensive data, weak-foot stars equal to the level.
- Progression panel (cards with level cap > 1 only; a one-line note otherwise): Max Level number input (1..cap; typing edits a draft that is committed and clamped on blur / Enter, the spinner and arrow keys commit at once, an invalid draft reverts, and an allocation the new level cannot afford is reset with an amber notice in the live region) + 13-position select side by side, every option labelled with the card's proficiency there ("CF · full", "AMF · half", "CMF · none"); "Points used X / Y" and a `role="status"` live region ("Z left · ~OVR at POS"); ten category steppers (`role="spinbutton"` named by the category label only, with `aria-valuenow/min/max` and the spent / next cost in `aria-valuetext`, Arrow/Page/Home/End keys, −/+ buttons that are not tab stops; the "+" is disabled when the next stat point costs more than what is left; each row lists its stats and "spent · next" cost); Booster 1 / 2 as `aria-pressed` toggles showing the real name and "+N Stat" pills — a slot without a usable vector ("unknown booster #id", "none", or a booster with "(no stat data)") is a dashed static note, not a toggle; **Max OVR** (lime) and **Reset** (secondary) buttons; a rules line (no manager effects) and an estimate caveat that follows the proficiency: "about ±1 at full-proficiency positions (lower confidence at GK/CB)" or, at a half / non-proficient position, "a fitted proficiency penalty is applied (within ±1 on 99.9 % / 99.7 % of held-out hub cards)"; an outfield card at GK reads a flat 40. The estimate header reads "Est. OVR at POS · full|half|none" and the value is always written with a leading "~".
- While a build differs from the defaults the stat sections show the projection with cyan "+N" chips, the heading reads "Stats · custom build · level N · ~OVR at POS", the Max/Base toggle is disabled, the card's MAX badge carries the estimate and a "~NN EST" pill sits on the card; a goalkeeper's Jump row reads "n/a (card-specific)". No Manager Proficiency control.

### Compare
- Two slots (efootbase's compare is a two-card tool): `?ids` carries at most two ids and the client trims anything beyond the second on load; panels follow the user's selection order; Swap reorders every panel; `?ids` stays in sync after removals.
- Diverging stat meters (A lime / B cyan); picker is a named modal dialog listing `CARD_TYPE_LABELS`.

### Packs
- `/packs` lists all 24 featured bundles with release dates formatted in UTC; `/packs/[slug]` shows one bundle's ordered cards; cards lazy-load so the first paint requests fewer than 40 faces.

### Skills Directory
- 84 skills grouped by stored `category`; each row shows the real holder count (`playerCount`) and share of all cards, top holders (`skill.players` top-N) and an empty state for zero-holder skills.
- No synthesised rarity, rank, stat-boost or "Showtime" badges.

## Interaction & Motion
- Transitions `transition-all duration-150 ease-out`; dialog fade + slight scale.
- Card tilt and carousel auto-advance respect `prefers-reduced-motion`.

## Accessibility Baseline
- Contrast ≥ 4.5:1 for body text, 3:1 for large text.
- Visible focus style on every interactive element (`.card-link:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px }`; `focus-visible:outline-[var(--color-accent)]` / `focus-visible:ring-2` utilities elsewhere).
- Dialogs (`<dialog>`) are named, trap focus, close on Escape and restore focus; popovers expose `aria-expanded`.
- Landmarks: `header`, `nav[aria-label="Primary"]`, `main`, `footer`; ≥ 44 px touch targets on coarse pointers.
- No horizontal page scroll from 320 px up (Pitch Map, pagination, compare bars and popovers use container-relative sizing; `body { overflow-x: hidden }` is a safety net only).

## Voice & Tone
- Precise, technical, athletic. Microcopy is functional and free of marketing fluff.
- Empty and error states say what to do next ("No players match these filters — reset filters", "Retry").

## Layout & Responsive
- Container `max-w-6xl` centred with `px-4`.
- `< 768px`: mobile bottom navigation (Home / Players / Compare / Skills / Packs).
- `≥ 1024px`: full filter bars and side-by-side comparisons.

## Anti-Patterns (What We Deliberately Avoid)
- No Three.js or WebGL for cards; no layered runtime composition (one image + overlays).
- No efootbase/efhub branding, icons or build ids; no copied third-party sidebar content.
- No numbers the data does not provide (rarity, ranks); progression numbers come from the recovered rules and the overall estimate is always marked "~".
- No AI-landing-page tropes (gradient text, neon auras, tilted casino cards, emoji chips).
- No raw enum names or snake_case data in the UI.
- No prices for packs.
- No calls to key-gated third-party APIs from the web app.
