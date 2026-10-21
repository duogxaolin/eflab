## MODIFIED Requirements

### Requirement: Player Detail Accuracy
The player detail page SHALL show height in feet and inches by flooring the feet value, SHALL show the defensive-position card from defensive data, SHALL render weak-foot stars equal to the 1–4 level, SHALL show "…" only when more skills exist than are displayed, SHALL show the card's real max level (the dump's level cap) as a "Max Level" row in the Card Info block — the card face carries no MAX LEVEL badge since the interface follows the reference — and SHALL NOT present controls (Progression sliders, presets) that change nothing.

#### Scenario: Height conversion
- **WHEN** a player is 182 cm tall
- **THEN** the page shows 6'0" (71.65 in → 5 ft + 11.65 in rounds to 12 in and carries), and for 170 cm shows 5'7".

#### Scenario: Progression controls
- **WHEN** a user moves a Progression slider
- **THEN** the displayed stats and OVR update using the shared progression engine within the available point budget, or the control is not shown.

#### Scenario: Real max level
- **WHEN** the detail page of a card with a level cap of 32, and of a card with a level cap of 1, is opened at 1440 and at 390 px
- **THEN** Card Info shows "Max Level" 32 and 1 respectively, and the card face shows no MAX LEVEL badge.

## REMOVED Requirements

### Requirement: Home Quick Filters Do What They Say
**Reason**: The home page is rebuilt to the reference layout (a search field, "Latest Players" and "Latest Packs"), which has no quick-filter chips; the owner asked for the reference design without differences.
**Migration**: The same lists stay reachable from `/players` with the card-type and base-overall filters (for example `/players?card=5`, `/players?base=90-`); the URL contracts of `/players` are unchanged.
