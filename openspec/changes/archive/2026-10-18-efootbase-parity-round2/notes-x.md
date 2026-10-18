# AGENT X DOC NOTES — efootbase-parity-round2 (Players · Packs · Skills · Home · Header)

Every user-visible behaviour, label, default, URL parameter and limit that AGENT X
changed, for AGENT Y to fold into CLAUDE.md / README.md / openspec/ui-dna.md.
Evidence = the 2026-10-18 efootbase capture (scratchpad `parity/`, not in the repo)
plus read-only psql counts on the 2026-10 dump (48,410 cards).

## /players — default scope, layout

- **Default scope is all card types** (48,410 cards, Trending cards included). No
  card type is pre-selected; the old "EPIC + HIGHLIGHT unless searching" rule and
  the `type=all` URL value are gone (the parameter is still *read*, see URL table).
- **Layout now mirrors efootbase**: title + `Sort` radio group in the header, a
  full-width "Search players by name…" field, a sticky right sidebar `Filters`
  (`lg` and up) and a `Filters` button (with an active-filter badge) that opens the
  same panel in a modal on smaller screens. The seven long lists (Stats, Body
  Model, Playing Style, Skills, Nation, League, Team) are modal dialogs with a
  `Done` button, loaded on demand (one chunk, `next/dynamic`). Card grid is
  3/4/5/6 columns (sm/md/xl) because of the sidebar. Pagination is unchanged
  (no infinite scroll).
- Counter line: "N cards · page x of y" (one unit — "cards" — throughout; shows
  "Loading…" while the first request is pending — never "0 cards" — and
  "Updating…" while a new query is in flight and the previous, dimmed grid is
  still shown); a `Reset` control appears whenever the URL differs from
  `/players`. (Agent Y, verify round: the earlier "N cards · M players" wording
  mixed units.)
- Removed: the "searching X only — include all types" notice and the old chip bar
  (Card types / Position / Playing Style / Strong Foot / OVR / Nationality / Sort
  popovers) — all of those live in the sidebar now.

## Labels

- "Nation" (was "Nationality"), "Base Overall Rating" / "Max Overall Rating"
  (were "Base OVR ≥ / Max OVR ≥ / Max OVR ≤"), sort control named "Sort".
- **Card-type labels unchanged** (`CARD_TYPE_LABELS`: Standard, Legendary,
  Trending, Selection, Epic, Highlight, Strike Arena). efootbase shows "Icons" for
  code 1 and "Epic - Big Time" for code 5, but the dump's own `players_meta.json`
  says "Legendary" / "Epic" — rename rule (dump labels AND capture agree) not met,
  so nothing was renamed. "Selection" (code 4) already agreed.
- Condition filter uses efootbase's aria names: Slump Form (E), Poor Form (D),
  Normal Form (C), Good Form (B), Peak Form (A) (`CONDITION_FILTER_LABELS`).
  Form / WF Accuracy / WF Usage are shown as 1–3 / 1–4 stars with the dump meta
  words in the accessible name (Inconsistent/Standard/Unwavering; Low/Medium/
  High/Very High; Almost Never/Rarely/Occasionally/Regularly).
- Stats dialog labels follow efootbase's filter: "Place Kicking" (not "Set Piece
  Taking"), "Jumping", "Tackling", groups Attacking / Strength / Defending; switch
  "Max attribute potential" (= filter on the `max*` columns).

## Sort presets (`SORT_PRESETS` in @eflab/shared, implemented in `orderByFor`)

| Preset (label) | URL | Definition |
|---|---|---|
| Trending (default) | *(absent)* | `releaseDate DESC NULLS LAST, maxOvr DESC, id DESC` — strongest cards of the newest release first (efootbase's real Trending uses community signals we do not hold) |
| New cards | `sort=new` | `releaseDate DESC NULLS LAST, id DESC` |
| Top rated | `sort=top` | `maxOvr DESC, id DESC` (max overall) |
| High to low | `sort=highest` | `ovr DESC, id DESC` (**base** overall; first card OVR 100) |
| Low to high | `sort=lowest` | `ovr ASC, id ASC` (first card OVR 40) |

`top`/`highest`/`new` are efootbase's observed URL values; `lowest` is ours
(unobserved). Presets ignore `order`. The explicit field sorts (Name, Age, Height,
Weight, Player value, Speed, …, `SORT_FIELDS`) remain in a "Field…" select with a
High to low / Low to high direction toggle (`sort=<field>&order=asc|desc`). The
API default `sort` stays `ovr` (only the web sends `trending`). Verified: 0
duplicate ids across pages 1–5 for all five presets (smoke + Playwright).

## Home

- "Latest Players" keeps its name (not "Trending Players"): it is the `New cards`
  definition de-duplicated by base player, so the heading now has a "Show all"
  link to `/players?sort=new`. Renaming to Trending would not match our Trending
  preset (which adds the maxOvr key).
- Quick filters kept and rewired: Epic & Big Time → `/players?card=5`,
  Highlight & Show Time → `card=6`, Legendary → `card=1`, 90+ OVR →
  `/players?base=90-` (Base Overall Rating ≥ 90), Packs, Compare.
- `/` focuses the home search when the user is not typing in a field and no
  dialog is open; the search box shows a `/` kbd hint (was ⌘K). Submitting
  pushes `/players?search=…` (was `q=`).

## Header palette

- Placeholder "Search players by name…" (was "Search players (e.g. Messi, …)…"),
  an `Esc` chip inside the input (clicking it closes), the X close button only on
  small screens; Enter pushes `/players?search=…`.

## /packs

- Header chips without emoji: "24 packs · 183 players · 189 cards". **Players =
  distinct base players** across all bundles (`count(DISTINCT Player.baseId)` =
  183); 189 = card rows (also = distinct card ids). efootbase shows 166 on fresh
  data — our dump is older. Bundle sections and `/packs/[slug]` unchanged.

## /skills and /skills/[slug]

- Grouping is the web-only table `apps/web/lib/skill-labels.ts`: **Showtime Skills
  (23)** then **Classic Skills (44)**, both in efootbase's wiki order, then "Other
  catalogue entries (17)" = fixture rows efootbase does not list as skills (AI
  playing styles, motion styles, set-piece variants; 0 holders each). Tabs:
  All / Showtime / Classic / Other. "Top cards" only in the Showtime group.
- The invented "Premium" tier label is gone from the index and the detail page
  (the group label is shown instead). Display labels changed where observed on
  efootbase: One-Time Pass → One-touch Pass, No-Look Pass → No Look Pass, First
  Time Shot → First-time Shot, Rising Shots → Rising Shot, Flip-Flap (Elastico) →
  Flip Flap, Sombrero Flick → Sombrero, Super-Sub → Super-sub, Long-Reach Tackle
  → Long Reach Tackle, Phenomenal Passing → Phenomenal Pass, Long Range Curler →
  Long-Range Curler, Heading Skill (Slot) → Heading. Slugs/URLs unchanged.
- The 21 fixture descriptions that start with "Premium — …" / "Premium skill — …"
  are shown without that prefix (`skillDescription`, display only). **Owner
  note:** `packages/db/fixtures/skills.json` still carries the "Premium" category
  and prefixes — cleaning the fixture/DB is a seed-time change (not done here;
  no DB writes).

## /players URL parameters (read + written by `apps/web/lib/filter-url.ts`)

Written parameters (efootbase names where observed, `min-max` range syntax):

| Param | Meaning | Example |
|---|---|---|
| `search` | name query | `search=messi` |
| `card` (repeated) | card types by efootbase code 0/1/3/4/5/6/7 | `card=5&card=6` |
| `pos` | position (name; the numeric index is also read) | `pos=CF`, `pos=12` |
| `playingStyle` | style id, **either slot** | `playingStyle=9` |
| `ai` | AI playing styles (all must be set) | `ai=trickster,mazingRun` |
| `nat` | country id (efootbase uses ISO-like codes — the data has none) | `nat=14` |
| `league`, `team` | League id / Team id | `league=26`, `team=3` |
| `foot` | 0 Right, 1 Left | `foot=1` |
| `base` | Base Overall Rating range | `base=90-`, `base=80-85`, `base=-60` |
| `ovr` | Max Overall Rating range (efootbase's name) | `ovr=100-` |
| `condition` | letters A–E | `condition=A,B` |
| `form`, `wfa`, `wfu` | stars as shown (1-based; stored value + 1) | `form=3`, `wfa=4`, `wfu=1,4` |
| `height`, `weight`, `age` | ranges (cm / kg / years) | `height=185-190` |
| `skill` | skill ids, all must be present | `skill=1,2` |
| `stat` | stat ranges `key:min-max,…` on the 26 base stats; `smax=1` = max columns | `stat=speed:85-,finishing:80-95&smax=1` |
| `body` | body-model ranges on the 11 physique fields (0–15) | `body=neckLength:-8` |
| `sort`, `order`, `page` | see presets; `order` only for field sorts | `sort=top`, `sort=speed&order=asc`, `page=3` |

Still **read** for old links, never written: `q`, `type` (names or `all`),
`style`, `dstyle` (both now mean either-slot), `ovrMin`/`ovrMax`,
`maxOvrMin`/`maxOvrMax`. Any filter change resets `page` to 1. Out-of-range
values are dropped client-side (never a 400 from a hand-edited URL).

## API (`player.list` input additions — all int4-bounded, 400 on violation)

`aiStyles[]`, `ovrMax`, `conditionIn[]`, `formIn[]` (0–2), `weakFootAccuracyIn[]`,
`weakFootUsageIn[]` (0–3), `heightMin/Max` (100–250), `weightMin/Max` (30–150),
`ageMin/Max` (10–100), `skillIds[]` (≤ 20, AND), `statRanges[]` ({stat, min, max}
0–200) + `statsAtMax`, `bodyRanges[]` ({field, min, max} 0–15); `sort` also
accepts the five presets. **Semantic change:** `playingStyle` now matches the id in
either slot (`playingStyleAttack OR playingStyleDefense`) — efootbase groups and
filters by style, not slot; `defensiveStyle` still means the defence slot only.
New procedures `player.leagues` (34) and `player.teams` (707, with `leagueId`,
`national`). `player.byId`/`compare` DTOs now also carry `form`,
`injuryResistance`, `physique` (11 fields) and `bodyMetrics` (5 floats) for the
detail page (Y's types.ts fields).

Performance: `EXPLAIN (ANALYZE)` on 12 common combinations (default Trending
page, counts with condition+form+WF, skills AND, league+height, 3 stat ranges +
body, style either slot + card type, nation+foot, name LIKE + Trending, maxSpeed
≥ 100 + Top rated): 0.1–22.6 ms execution, planning ≤ 4 ms. **No new index
needed.**

## Playing styles (`PLAYING_STYLE_GROUPS`, `PLAYING_STYLES_UNAVAILABLE`, `AI_PLAYING_STYLES`)

- Attack group (20, data-backed): Goal Poacher, Dummy Runner, Fox in the Box,
  Prolific Winger, Classic No. 10, Hole Player, Box-to-Box, Anchor Man, Extra
  Frontman, Attacking Full-back, Defensive Full-back, Deep-Lying Forward,
  Creative Playmaker, Build Up, Roaming Flank, Cross Specialist, Orchestrator,
  Full-back Finisher, Target Man, High Line GK (3 cards).
- Defence group (13): All-action Defender, Anchor Man, Attack Outlet, Attacking GK,
  Box-to-Box, Covering Role, Defensive GK, Front Line Poacher, Front Line
  Pressure, High Line Master, Pass Disruptor, Sweeper GK (1 card), The Destroyer.
- **Unavailable (shown disabled, no id invented):** Build-up GK (attack); Deep
  Defender, Press Back, Tough Marker (defence). They post-date the dump: Romero's
  cards still carry The Destroyer where efootbase shows Tough Marker; Doku's
  defence slot is Basic where efootbase shows Press Back.
- AI Playing Styles (6 boolean columns): Early Crosser, Incisive Run, Long Ball
  Expert, Mazing Run, Speeding Bullet, Trickster; "Long Ranger" has no column →
  not offered.
- Verified slot facts (read-only psql): The Destroyer / Attacking GK / Defensive
  GK sit in the **defence** slot for Neuer, Courtois, Provedel, Benjamin André,
  David Bates (matches efootbase); 377/297/186 older Standard cards carry 9/16/17
  in the attack slot with defence 0 — the either-slot filter covers both.
  Box-to-Box (7) and Anchor Man (8) sit in both slots on 3,561 / 1,364 cards.

## Not shipped / limits (honest list)

- Community Rating filter (out of scope by decision; efootbase community data).
- Multi-select Position and multi-select Nation/League/Team: the API filters stay
  single-value (efootbase's observed URL also carries one `pos`/`nation`).
- Nation by ISO-like code (`nation=ARG`): no code column in `Country`; ids used.
- "Long Ranger" AI style, the 4 post-dump playing styles (above).
- Height/Weight/Age/stat/body ranges are min/max number fields, not the dual
  sliders efootbase draws (same semantics, keyboard-friendly, no overflow at 320px).
- Trending cannot replicate efootbase's ordering (community signals, fresh data).

## Verification numbers (2026-10-18, API :5400, web :3400)

- `pnpm -r typecheck` green; `pnpm --filter @eflab/shared test` green (new tests:
  range param parse/format round-trip, preset/group consistency);
  `pnpm test` = unit + smoke **29 passed, 0 failed** (new smoke checks: default
  scope = sum of card types, 5 presets × pages 1–5 no duplicates, highest/lowest
  bracket OVR 100/40, filters narrow, heightMin=999 → 400, leagues 34 / teams 707).
- Playwright `scratchpad/pw/parity-x.mjs`: 123 checks — default 48,410 cards,
  no card type pressed, Trending default, `card=3` = 3,586, `search=cruyff` = 9/9;
  **61/61 filter URLs equal read-only psql counts** (3+ values for every filter,
  plus a 5-way combination); UI round-trip (`?pos=CF&base=90-&condition=A&sort=new`,
  130 cards before/after reload, controls restored); page reset; 5 presets × 5
  pages = 120 tiles, 0 duplicates each; dialogs apply (Stats + Max attribute
  potential → 338, Skills → 8,909, Playing Style The Destroyer → 2,894); /packs
  no emoji, 24 packs · 183 players; /skills Showtime (23) / Classic (44), labels;
  palette placeholder + Esc chip; `/` focuses home search; quick filters; no
  horizontal overflow at 320/375/480 on /players (sidebar dialog + Stats dialog
  open), /packs, /skills, /; **0 console errors**.
- First Load JS before → after: `/` 161 → 162 kB, `/packs` 157 → 158,
  `/packs/[slug]` 156 → 158, `/players` 163 → 168 (+5, the filter sidebar; the
  dialogs are a separate on-demand chunk), `/skills` 158 → 161, `/skills/[slug]`
  158 → 160, `/compare` 161 → 163 (shared constants growth). Shared chunk 103 kB
  unchanged.
