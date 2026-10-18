## Why

A first live capture of efootbase.com (2026-10-18, headless browser, about 36 page loads) replaced the earlier assumptions with evidence. It showed concrete differences from eflab in the Progression sheet, the Players filters and sort, the player detail sections, the packs and skills pages and several labels. One documented premise was wrong: efootbase does not open /players on an "Epic & Highlight" scope, because all card types start unselected. This change fixes the differences that can be fixed from data we hold, and records the ones that cannot.

## What Changes

- **Progression**: the panel opens on the Max-OVR build with both boosters on; points are shown in efootbase's whole-point unit (2 × our half-points, e.g. "0/62 pts"); category labels follow efootbase; the estimated overall is labelled honestly about efootbase's default Manager Proficiency (about 4 higher). A proficiency slider is added only if a model verified on fresh measurements reaches the accuracy bar.
- **Players**: default scope becomes all card types; labels and card-type names follow efootbase; the sort chip is renamed and gains efootbase-style presets; the missing filters (base/max overall, condition, form, weak-foot accuracy/usage, height/weight/age, skills, league, team, stat and body-model ranges) are added in priority order, all in the URL; the playing-style lists are reconciled with the dump and efootbase.
- **Detail**: one OVR pill, a Card Info block, Body Model, Injury Resistance and Form sections, stat names that are never truncated, booster "+N" chips, a fifth tier colour for values of 100 or more, click-to-highlight, efootbase skill labels with Showtime skills first, and "N Full · N Half" proficiency text.
- **Packs / Skills / Home / Header**: no emoji in the packs header, player counts based on unique players, skills grouped Showtime/Classic where verifiable, command-palette wording and the `/` shortcut.
- **Docs**: correct the wrong default-scope claim and the other changed statements; record limits (stale dump, proficiency findings, no Position Training, no In-Match Roles, API blocked for comparison).
- No database writes, no seed, no migration in this change.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `catalog-browsing-parity`: default card-type scope, filter and sort parity, detail sections, packs and skills presentation.
- `player-progression-simulator`: default build, point unit, labels and the honesty of the overall estimate.

## Impact

- `apps/web` (players, detail, packs, skills, home, header, progression panel, card-display, globals.css), `apps/api` player router and `packages/shared` schemas/constants/tests, `scripts/smoke-test.sh`, CLAUDE.md, README.md, `openspec/ui-dna.md`.
- Out of scope by owner decision: Feed, Wiki hub, Login, community builds, rating, comments, language switcher, app badges, cookie banner, sidebar. Out of reach: refreshing the stale dump and comparing filter/sort results (needs an API key and the efootbase API, which is blocked by a bot check).
