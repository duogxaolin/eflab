## MODIFIED Requirements

### Requirement: Multi-Card Side-by-Side Comparison
The system MUST allow users to select 1 to 2 player cards (efootbase's compare is a two-slot tool) and display their 26 attributes, physical metrics, skills, and playstyles in an aligned matrix with visual indicators highlighting statistical advantages. A `?ids` query carrying more than two ids MUST be trimmed to the first two valid ids on load so no card is loaded without a slot tile. Every panel (cards, radar, stat matrix, position proficiency, boosters) MUST follow the user's selection order, and the Swap action MUST reorder all panels together.

#### Scenario: Extra ids in the share link
- **WHEN** the user opens `/compare?ids=A,B,C,D`
- **THEN** only A and B are shown (slot 1 = A, slot 2 = B), the URL is rewritten to `?ids=A,B`, and no panel lists C or D.

#### Scenario: Comparing two center-backs
- **WHEN** user selects Bonucci (Epic) and Chiellini (Epic) for comparison
- **THEN** the system renders a synchronized comparison table highlighting the superior value in green for each respective attribute row.

#### Scenario: Selection order independent of card id
- **WHEN** the user picks a card with the larger id in the left slot and a card with the smaller id in the right slot
- **THEN** the left column of the stat matrix, proficiency and booster panels shows the left slot's card, and the compare API returns the cards in the requested order.

#### Scenario: Swap
- **WHEN** the user presses Swap
- **THEN** the left and right columns of every panel exchange, matching the slot cards and radar.
