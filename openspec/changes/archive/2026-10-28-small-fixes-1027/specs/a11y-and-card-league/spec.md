## ADDED Requirements

### Requirement: Dimmed Stat Rows Keep Readable Text
While a category is highlighted on the card page (an open Adjust or category-strip popover, a pinned category, a previewed category), the stat rows outside it SHALL still show every piece of text — label, value pill, booster, manager and weak-foot chips — at a contrast of at least 4.5:1 against the surface behind it, measured on the computed colours over the real backgrounds for all five tier colours, and the highlighted rows SHALL stay visibly distinct from the dimmed ones. The dimming value and the measurement that chose it SHALL be recorded in the change's design, and the deviation from the reference's dimming SHALL be listed in `openspec/ui-dna.md`.

#### Scenario: No contrast violation while highlighted
- **WHEN** axe-core 4.14 (WCAG 2.0 / 2.1 A–AA tags) runs on a capped card with an Adjust popover open, with a category pinned, with a category previewed from the strip, and with a strip item open, at 1440 and at 390 (touch)
- **THEN** it reports 0 `color-contrast` violations and 0 violations of any other rule

#### Scenario: Worst case text
- **WHEN** the lowest-contrast dimmed text is measured (the red tier below 70, the warning-coloured weak-foot chip, the dim secondary text)
- **THEN** each reads at least 4.5:1 and the measured numbers are in design.md

#### Scenario: Highlight still reads
- **WHEN** a category is highlighted
- **THEN** its rows keep the accent ring and the full-strength text, and the other rows are visibly weaker without changing layout or size
