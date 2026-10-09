# UI DNA — eFootball Lab (eflab)

Distilled design principles and interface specifications for eflab. Balances the clean, data-dense, dark aesthetic of efootbase with the rich feature depth of efhub.

## Design Tokens

### Color Palette
- Base Surface: `#080c14` (Deep pitch / Midnight Canvas)
- Panel Surface: `#0f1523` (Card / Section Surface)
- Elevated Surface: `#161f33` (Modal / Dropdown / Hover Surface)
- Border / Line: `#1e293b` (Subtle boundary), active hover: `#334155`
- Primary Text: `#f8fafc` (High contrast crisp white)
- Secondary Text: `#94a3b8` (Slate-400, metadata & labels)
- Dim Text: `#64748b` (Slate-500, timestamps, placeholders, inactive states)
- Accent Primary: `#10b981` (Emerald Athletic Green — primary interactive focus & affirmative badges)
- Accent Secondary: `#06b6d4` (Cyan — tactical & informational highlights)
- Accent Warning: `#f59e0b` (Amber — boosts, caution, mid-tier stats)
- Accent Danger: `#ef4444` (Rose / Red — alerts, negative diffs, low stats)

### Stat Tier Colors (Standardized across eFootball ecosystem)
- Elite (90+): `#00ffb4` / `#10b981` (Teal / Emerald glow)
- High (80–89): `#96ff00` / `#84cc16` (Lime punch)
- Good (70–79): `#ffbe00` / `#eab308` (Warm amber)
- Low (40–69): `#ff3200` / `#ef4444` (Coral red)

### Typography
- Primary Sans: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
- Numeric & Data: Tabular figures (`tabular-nums font-mono` for stat comparisons, OVRs, percentages)
- Headers: Crisp, tight letter-spacing (`tracking-tight`), uppercase section headers (`text-xs font-bold uppercase tracking-wider text-slate-400`)

### Radius & Density
- Small Elements (Badges, Buttons): `rounded-lg` (6px–8px)
- Cards & Panels: `rounded-xl` (12px)
- Floating Modals / Containers: `rounded-2xl` (16px)
- Spacing: 4px base scale, compact padding (comfortable reading density for dense sports statistics)

## Component Patterns

### Navigation Header
- Compact height (56px) with backdrop blur (`backdrop-blur-md bg-[#0f1523]/90 border-b border-[#1e293b]`).
- Instant quick-search trigger with `⌘K` keyboard badge.
- Desktop route links with active underline/pill indicators.
- Profile/Auth actions in right utility slot.

### Footer
- Structured in 4 columns: Browse, Features & Community, About, Legal.
- Build stamp prominently displayed: `Build {hash} · {UTC timestamp}`.
- eFootball 2027 version indicator and Konami non-affiliation disclaimer.
- Explicit AI training prohibition notice.

### Data Displays & Cards
- 3D CSS interactive card preview (`PlayerCard`) using efimg.com official artwork with hardware-accelerated tilt and glare; graceful gradient fallback.
- Horizontal carousel rows with scroll snap for trending collections.
- Diverging stat delta meters for player comparison (positive green / negative red indicators).

### Homepage Database Banner & Search
- Zinc surface: Clean panel `bg-[#18181b] border border-[#28282c] rounded-xl` matching the data card density.
- Header hierarchy: Solid crisp white header (`font-bold text-white tracking-tight`), version meta tag (`eFootball™ 2027 / 48,407 Players Database`), concise technical description.
- Search combobox: Compact `h-11` input on canvas background with clean `Search` icon, `⌘K` badge, instant clear `✕`, and lime action button.
- Rich autocomplete dropdown: Floating surface with mini card thumbnails, player name, position pills, card type label, and tabular mono OVR.
- Quick filter chips: Clean text-only micro-pills (`Epic & Big Time`, `Show Time`, `Highlight`, `90+ OVR`, `Packs`, `Compare`) with no decorative emojis.
- Desktop spotlight: Single clean, upright `PlayerCard` in a bordered slot showcasing the latest trending card.

### Skills Directory
- Categorized by Showtime vs Classic.
- Tri-color Type Badges: Stat boost (Amber), Outcome (Emerald), Animation (Violet).
- Rarity chips: Ultra rare (Purple), Rare (Cyan), Common (Slate).
- Card count badge on every skill.

## Interaction & Motion
- Hover transitions: `transition-all duration-150 ease-out`.
- 3D card tilt: Smooth pointer tracking capped at ±12° with glare gradient translation.
- Carousel smooth scrolling: CSS scroll-snap with custom navigation arrows.
- Modal / Drawer transitions: Fade with slight upward scale.

## Accessibility Baseline
- Color contrast minimum 4.5:1 for body copy and 3:1 for large text.
- Focus visible ring: `focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none`.
- Interactive elements minimum touch target of 44px on coarse pointers.
- ARIA landmarks (`header`, `main`, `nav`, `footer`, `dialog`) and accessible button labels.

## Voice & Tone
- Precise, technical, athletic, and authoritative.
- Microcopy is concise, functional, and devoid of marketing fluff.
- Empty states give actionable next steps (e.g. "No players match the selected filters. Reset filters to see all 44,000+ cards.").

## Layout & Responsive
- Max container width: `1280px` centered with responsive horizontal padding (`px-4 sm:px-6 lg:px-8`).
- Mobile breakpoint (`< 768px`): Compact mobile bottom navigation with quick-access icons.
- Desktop breakpoint (`>= 1024px`): Full multi-column filter bars and stat comparisons.

## Anti-Patterns (What We Deliberately Avoid)
- NO Three.js or heavy WebGL runtimes for card display (CSS 3D transforms are lighter and more accessible).
- NO external API calls to key-gated efootbase services.
- NO AI-style landing page tropes (gradient text, neon blur auras, decorative pitch watermarks, tilted casino cards, emoji chips) — hero must stay data-first and athletic.
- NO unnormalized snake_case data in UI components.
- NO prices shown for card packs.
