# UI DNA — eFootLab (eflab)

Design principles and interface specification for eflab. The visual language follows efootbase's dark, data-dense catalogue (zinc neutrals + lime accent); the branding, copy and components are eflab's own. Read this before any visual change. The dated snapshots in `docs/efootbase-ui-dna.md`, `docs/efhub-ui-dna.md` and `docs/pesdb-ui-dna.md` are historical reference material, not this spec.

> Updated 2026-10-17 (openspec change `eflab-parity-fixes`): tokens, card rendering, branding, skills and accessibility sections now describe the implemented UI. The earlier "Slate-Emerald" palette in this file was never what the code shipped since 2026-10-07 session 3.
>
> Updated 2026-10-18 (openspec change `efootbase-parity-round2`, after a live capture of efootbase): default catalogue scope = all card types (the earlier "Epic + Highlight = efootbase's default" claim was wrong), efootbase labels, sort presets and the new filters, the Progression sheet's opening state / whole-point unit / labels / honest estimate label, the detail-page blocks (Card Info, Body Model, five tier colours, click-to-highlight, Showtime-first skills), packs and skills presentation, palette wording.

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
- Max (100+): `#ff2fb4` (magenta — a stat trained past 99, efootbase's colour)
- Elite (90–99): `#00ffb4`
- High (80–89): `#96ff00`
- Mid (70–79): `#ffbe00`
- Low (<70): `#ff3200`

The five hex values are declared once, in the `@theme` block of `apps/web/app/globals.css`. Every consumer references the tokens through `statTier` / `statTierClass` / `statTierBg` / `tierTextClass` / `tierBgClass` in `apps/web/lib/card-display.ts` (player-detail stat rows and pills, body-model values, best-fit pill, the Pitch Map rating cells, home OVR text) or the `.text-stat-tier-*` / `.bg-stat-tier-*` aliases in `globals.css`. Text on a tier pill: dark on-accent text on the four bright tiers, white on red (`statTierForeground`). No component may hard-code a tier hex.

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
- ⌘K search opens a named modal `<dialog>` (focus trap, Escape, focus restoration) with the placeholder "Search players by name…" and an "Esc" chip that closes like the key; `/` outside a text field focuses the home search; a mobile-only search icon button is hidden from `md` up.
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
- Database banner on a panel surface, search combobox (`h-11`, Search icon, `/` kbd hint — the key that focuses it, clear button, lime action), debounced (250 ms) autocomplete dropdown with mini thumbnails (`cards/{id}_transparent.webp`), name, position pill, card-type label, tabular OVR.
- Quick filter chips (text only, labels from `CARD_TYPE_LABELS`): the card-type chips send the efootbase card-type code (`/players?card=5` for Epic & Big Time, `card=6` Highlight & Show Time, `card=1` Legendary), `90+ OVR` (→ `/players?base=90-`), `Packs`, `Compare`; "Show all" of the latest players → `/players?sort=new`; the search submits `/players?search=…`.
- Trending grid + "Latest Packs" carousel (FeaturedBundle, newest first) with prev/next buttons, a pause control, scroll-snap; auto-advance pauses on hover/focus, when the tab is hidden and under reduced motion. Titles link to `/packs/[slug]`.
- No fabricated sidebar content (no fake comments, creator spotlight or third-party hotlinks).

### Players Catalogue (`/players`)
- URL is the single source of state (`apps/web/lib/filter-url.ts`): `search`, `card` (efootbase card-type codes, repeatable), `pos` (repeatable — any of the positions; written in catalogue order, `pos=SS&pos=CF`; names or efootbase's index form `pos=12` are read), `playingStyle` (matched in either slot), `ai`, `nat` (repeatable, **internal country id** — the data has no ISO code), `league`, `team` (both repeatable; ids ascending), `foot`, `base` / `ovr` (Base / Max Overall Rating ranges as `min-max`), `condition`, `form`, `wfa`, `wfu`, `height`, `weight`, `age`, `skill` (all listed skills must be present), `stat` (`speed:85-,finishing:80-95`) + `smax=1` (ranges on the max stats), `body` (body-model ranges), `sort`, `order`, `page`; defaults are omitted, repeated parameters carry no duplicates and invalid members are dropped (equal selections always give the same URL; an old single-value link is read and rewritten canonically on the next change), any filter change resets to page 1 and scrolls to top.
- **Default scope = all card types** (no card type pre-selected, like efootbase; the result count equals the whole catalogue, Trending included). The visible card-type control lets the user pick several types; a text search never silently narrows the scope.
- Labels follow efootbase where observed: "Nation", "Base Overall Rating", "Max Overall Rating", card-type names from the single label table.
- "Sort" control showing the current choice with the presets Trending (default: newest release first, then max overall), New cards (release date desc), Top rated (max overall desc), High to low / Low to high (base overall), each with a stable `id` tiebreaker; field sorts keep `order`.
- Filters in efootbase's priority order: overall ranges, condition, form, weak-foot accuracy / usage, height / weight / age, skills, league, team, stat ranges (base or max), body-model ranges; every one is applied by the API (`player.list`), recorded in the URL and resets the page. The long lists (Stats, Body Model, Playing Style, Skills, Nation, League, Team) open as named modal dialogs from launcher buttons with `aria-haspopup="dialog"` (no `aria-expanded` — nothing stays expanded in place); the dialogs are native `<dialog>`s (focus trap, Escape) and return focus to their launcher on Escape **and** on Done; Playing Style options come from `PLAYING_STYLE_GROUPS` (attack / defence / AI) with ids verified on real cards — styles no card carries are listed as unavailable, never given invented ids (none since the 2026-10 re-dump: all 35 efootbase styles have an id and cards).
- **Multi-select** (`multi-select-filters`): Position is a 3-column grid of 13 independent `aria-pressed` toggles (any selected position matches — OR); Nation, League and Team dialogs are the searchable `PickerList` in multi-select mode — a "N selected" line (`aria-live="polite"`) with "Clear selection", one removable lime chip per value (`aria-label="Remove <name>"`, X icon) that survives the search term and, for Team, the league narrowing, the pressed/unpressed pills, a one-line "Several selections widen the list to cards matching any of them." note and the Done footer. Launcher summaries list the chosen names ("Argentina · Brazil"); the League selection narrows the Team dialog to those leagues' clubs. **Selection limit**: the Nation / League / Team pickers stop at 50 values (`MAX_FILTER_IDS`) — the unselected pills turn `aria-disabled` (dimmed, `cursor-not-allowed`, `title` "At most 50 selections") and an amber `role="status"` line "At most 50 selections — remove one to pick another." appears directly under the search field, above the chips, so it is in view however many chips there are (the live region exists, `sr-only`, before the limit so the change is announced); chips and pressed pills stay removable and the URL never loses a choice. The picker shows "Nothing matches." (Team: "No team of the selected leagues matches.") only once its list has loaded and the search leaves no option; while loading it shows "Loading nations…", on failure a "Could not load … — retry" button. The mobile Filters badge counts each of Position / Nation / League / Team once however many values it holds (the AND lists — AI styles, skills, stat and body ranges — count per value). Chips and pills wrap (`flex-wrap`, `max-w-full truncate`): no horizontal overflow at 320 / 375 / 480 px with the Filters, Nation and Team dialogs open, the limit message included. Filter changes are written with `router.replace`, so the browser Back button leaves the page rather than undoing the last filter change (pre-existing, by design — the URL is for reload and sharing).
- Windowed pagination (first/last/prev/next) that fits 320 px; counter line "N cards · page x of y" (`aria-live="polite"`; "Loading…" before the first response, "Updating…" while a new query's result is still in flight and the previous grid is shown dimmed with `aria-busy`) plus a Reset control whenever the URL differs from `/players`; grid `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6` of `sm` cards beside the `lg` sidebar.
- Error state with Retry on every data page; 4xx responses are not retried.

### Player Detail
- Server-rendered `page.tsx` (404 via `notFound()`, `generateMetadata` with the player name) + client body.
- Layout (efootbase's): header = name + **one** lime pill "`{maxOvr}` OVR" (the card's overall at its max level from the dump — the same meaning as efootbase's pill; its `title` says so) followed by a visible dim micro-label "DUMP MAX · NO PROFICIENCY BONUS" (`ovr-pill-note`, 10 px uppercase, `whitespace-nowrap`, wraps as a unit below the name at narrow widths), because the pill carries Booster 1 only and sits below the build estimate at proficiency 90 + "POS · attack style · defence style"; left column = card, Progression, Card Info, Other Versions; main column = Overview (description, specs line with WF stars, the ten-category readout, the stat grid, skills), Body Model, Position & Playstyle. On a phone the DOM order is card → Progression → main → Card Info → Other Versions; from `lg` a `300px + 1fr` grid places the left blocks beside the main column.
- Card with `showDetails`; **its OVR block prints the live build estimate** (as efootbase prints its build overall on the card face) with a small "~NN EST" tag at the top-right, while the MAX badge keeps the dump's max overall. Nation / team / league emblems sit under the card.
- Card Info (`components/detail/CardInfo.tsx`): Name, Featured (pack), Card Type, Nationality (flag), Team (emblem), Position, Age, Strong Foot, Height ("170 CM · 5'7\""), Weight, Condition ("Good Form (B)"), Card ID with a copy button (`aria-label` "Copy card ID" → "Card ID copied", polite live region), Release Date (UTC).
- Overview: description, specs line ("170 CM · 67 KG · 39 years · Strong Foot: Left · WF Accuracy ★★★★ WF Usage ★★☆☆"), the ten-category readout chips ("Shooting 8" … — `aria-pressed` buttons that highlight the category's stats; the steppers in the Progression panel change the values).
- Stat grid (`components/detail/StatGrid.tsx`): Attacking / Defending / Strength, `grid-cols-1 md:grid-cols-3`, one `<button class="efb-stat-row">` per stat with the tier colour of the value on both the name and the pill (five tiers, ≥ 100 magenta), a cyan "+N" chip for an active booster bump (the training lift is inside the value, shown in the row `title`), labels from `statLabel` ("Place Kicking", "Jumping", "Tackling" — efootbase's words) that are **never truncated** (`overflow-wrap: anywhere`, no ellipsis; verified at 1280 and 390 px). **Click-to-highlight**: a stat row, a category chip or a category label in the Progression panel selects that training category — its rows get `data-hit` (lime border/tint), every other row `data-dim` (opacity .4); clicking the selected one again clears it — except a Jumping row, whose click cycles through the categories that raise it (Aerial Strength → Goalkeeper 1 → clear).
- Stat view segmented control: **Build (~N)** (default whenever the card has a Progression panel — the engine projection of the current build), **Max (N)** (the dump's `max_attributes`) and **Base (N)**; any change in the Progression panel returns to Build. Heading: "Stats · Max-OVR build · level N · ~NN at POS" / "Stats · custom build · …" / "Stats at max level N (dump)" / "Stats at level 1". Every stat is projected for every card — goalkeeper Jump included (it rises with Aerial Strength and Goalkeeper 1 alike, change `jump-from-gk1`); no row ever reads "n/a". A stat row's `data-category` lists the categories that raise it space-separated (Jumping: Aerial and GK1) and its `title` names them in the training-lift tooltip.
- Skills: Showtime skills first (amber chips, `data-showtime`), then classic; labels from `lib/skill-labels.ts` ("One-touch Pass", "First-time Shot", "Long-Range Curler", "Phenomenal Pass" …); the heading counts them ("Skills · 10 · 3 Showtime").
- Body Model (`components/detail/BodyModel.tsx`): the 11 physique values (1–10; 7+ lime, 4–6 amber, 1–3 red via the tier tokens) and the 5 derived metrics (Leg Coverage Radius, Arm Coverage Radius, Jump Height, Torso Collision, Leg Length Height, one decimal). `player.byId` / `player.compare` return `physique` and `bodyMetrics` for every card, so the section always shows the stored values; the fields stay optional in the DTO and a response without them would show a short "not exposed" note — never a placeholder number.
- Position & Playstyle: Best Fit (highest non-null eFHUB rating), "At POS" (eFHUB rating at the registered position, labelled as such), Proficiency "N Full" or "N Full · N Half" (the "· 0 Half" suffix is omitted), null-safe Pitch Map (`n/a` for missing ratings), attack / defence style cards with key stats, compatible positions, AI playing styles, and the star list WF Usage / WF Accuracy / **Form** / **Injury Resistance** (form and injury resistance are stored 0–2, returned by `player.byId` / `player.compare` and shown as value + 1 stars of 3, like efootbase).
- Other Versions: a 4-column grid of the player's other cards (`PlayerCard`, lazy faces), the first 8 with a "+N more" button.
- Progression panel (cards with level cap > 1 only; otherwise the note "Progression and manager data are not available for this card: its max level is 1, so it has no training points and no build."): **opens on the Max-OVR build** (`bestAllocation` at the registered position for the level cap) **with every usable booster on and Manager Proficiency 90**; the header reads "used/total pts" in **efootbase's whole-point unit** (`toDisplayPoints` = 2 × the engine's points: a level-32 card reads "62/62 pts", Reset "0/62 pts"; the first four stat points of a category cost 1 each, the next four 2 each; the rules line says so). Max Level number input (1..cap; typing edits a draft that is committed and clamped on blur / Enter, the spinner and arrow keys commit at once, an invalid draft reverts, and an allocation the new level cannot afford is reset with an amber notice in the live region, e.g. "allocation reset: level 3 gives 4 pts, fewer than the 12 spent") + 13-position select side by side, every option labelled with the card's proficiency there ("CF · full", "AMF · half", "CMF · none"); under them a full-width **Manager proficiency** row (label "MANAGER PROFICIENCY (70–90)", the value in white mono on the right, a native lime `progression-slider` range 70–90 step 1, default 90, `aria-label` "Manager proficiency", `aria-valuetext` "Manager proficiency N", described by the proficiency note; Arrow/Home/End native, PageUp/PageDown ±5); "Points used X / Y" and a `role="status"` live region ("Z pts left · ~OVR at POS · proficiency N"); ten category rows in efootbase's layout — a label **button** (toggles the stat highlight; labels **Shooting, Passing, Dribbling, Dexterity, Lower Body Strength, Aerial Strength, Defending, Goalkeeper 1, Goalkeeper 2, Goalkeeper 3**), "spent · next" in pts, −/+ buttons that are not tab stops around a `role="spinbutton"` (named by the label, `aria-valuenow/min/max`, `aria-valuetext` "N stat points, X pts spent, next costs Y", Arrow/Page/Home/End keys; the "+" is disabled when the next stat point costs more than what is left) and a range slider under the row (`aria-hidden`, not a tab stop, same clamp); Booster 1 / 2 as `aria-pressed` toggles showing the real name and "+N Stat" pills — a slot without a usable vector ("unknown booster #id", "none", or a booster with "(no stat data)") is a dashed static note, not a toggle, and never makes a build "custom"; **Max OVR** (lime) and **Reset** (secondary, with a rotate icon; keeps the proficiency) buttons; no manager picker (the note says why). The estimate header reads "Est. OVR at POS · full|half|none", the value is always written with a leading "~", and directly under it the secondary-text **proficiency note** (`proficiencyNote(level)`: "Includes Manager Proficiency N, which efootbase applies even with no manager selected: each stat gains ⌊stat × rate⌋ after training (nothing at 70–76), never past 99; boosters are added after it."), with an amber sentence appended only at level 86 ("Level 86 is unconfirmed: no single rate fits it, so a fitted exception is used."). Away from the registered position an amber **warning** follows (`data-proficiency` = the card's proficiency there), worded by proficiency from efootbase's position tiles of the six measured cards: full → "Not anchored: POS is not this card's registered position. At full-proficiency positions the estimate matched efootbase's position tiles within ±1 on 202/202 measured tiles."; half → "Not confirmed: at POS (half proficiency) efootbase tends to show about 4 higher than this estimate (3 to 5 higher on all 224 position tiles measured on six cards)."; none with an estimate above 40 → "Not confirmed: at POS (not proficient) efootbase tends to show about 2–3 higher than this estimate (mean +2.6; within ±1 on only 122 of 2,483 position tiles measured on six cards)."; none with the estimate at the floor (an outfield card at GK, a goalkeeper far from goal) → "Not anchored: POS is not this card's registered position. At the floor of 40 efootbase's position tiles agreed within ±1 on 1,145 of 1,231 measured tiles.". Then the accuracy caveat: at the registered position "Anchored to this card's own overall at POS, its registered position. The anchor was added after the measurements; on 9,839 cards checked against efootbase's max-level overall it is within ±1 for 98.3 % (goalkeepers 97.4 %, lower confidence). An estimate, not an exact value.", elsewhere "About ±1 of the eFHUB hub overall at full-proficiency positions (lower confidence at GK/CB)" or the fitted-penalty sentence, which ends "…within ±1 of the eFHUB hub overall on 99.9 % | 99.7 % of held-out hub cards; that is a hub figure, not agreement with efootbase." (an outfield card at GK reads a flat 40). The action note says Max OVR is the best build "before the Manager Proficiency bonus, so it is the same build at every proficiency (as on efootbase); with the bonus a hand-made build can read up to 1 higher". Stat-row tooltips list the training lift and the "+N Manager Proficiency" bonus (both inside the value; boosters stay cyan chips).

### Compare
- Two slots (efootbase's compare is a two-card tool): `?ids` carries at most two ids and the client trims anything beyond the second on load; panels follow the user's selection order; Swap reorders every panel; `?ids` stays in sync after removals.
- Diverging stat meters (A lime / B cyan); picker is a named modal dialog listing `CARD_TYPE_LABELS`.

### Packs
- `/packs` lists all 24 featured bundles with release dates formatted in UTC under a plain-text header ("24 packs · N players" — no emoji; "players" counts distinct base players across the bundles, not card rows); `/packs/[slug]` shows one bundle's ordered cards; cards lazy-load so the first paint requests fewer than 40 faces.

### Skills Directory
- 84 skills grouped **Showtime Skills / Classic Skills** (the grouping and the labels efootbase's skills wiki shows, `lib/skill-labels.ts`; fixture entries efootbase does not list — AI styles, motion styles, set-piece variants — sit under "Other catalogue entries"); each row shows the real holder count (`playerCount`) and share of all cards, top holders (`skill.players` top-N) and an empty state for zero-holder skills.
- `/skills/[slug]` uses the same table for its title, description and group chip ("Showtime Skills" / "Classic Skills").
- No synthesised rarity, rank, stat boosts or invented tier labels ("Premium" is gone); "Showtime" is only ever the observed group, never a badge invented for a skill.

## Interaction & Motion
- Transitions `transition-all duration-150 ease-out`; dialog fade + slight scale.
- Card tilt and carousel auto-advance respect `prefers-reduced-motion`.

## Accessibility Baseline
- Contrast ≥ 4.5:1 for body text, 3:1 for large text.
- Visible focus style on every interactive element (`.card-link:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px }`; `focus-visible:outline-[var(--color-accent)]` / `focus-visible:ring-2` utilities elsewhere).
- Dialogs (`<dialog>`) are named, trap focus, close on Escape and restore focus; buttons that open one carry `aria-haspopup="dialog"`; in-place disclosures (the home search combobox, the mobile menu button) expose `aria-expanded`.
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
- No numbers the data does not provide (rarity, ranks, Position Training, In-Match Roles, per-manager effects); progression numbers come from the recovered rules (the Manager Proficiency bonus included, level 86 flagged as unconfirmed), the overall estimate is always marked "~" and its limits (anchored only at the registered position) are stated next to it.
- No AI-landing-page tropes (gradient text, neon auras, tilted casino cards, emoji chips).
- No raw enum names or snake_case data in the UI.
- No prices for packs.
- No calls to key-gated third-party APIs from the web app.
