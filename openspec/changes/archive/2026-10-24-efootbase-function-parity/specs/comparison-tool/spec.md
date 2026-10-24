## MODIFIED Requirements

### Requirement: Multi-Card Side-by-Side Comparison
The system MUST allow users to select 1 to 2 player cards in two slots, `left` and `right` (efootbase's compare is a two-slot tool; the same card may sit in both slots), each with its own build (see efootbase-function-parity "Two-Build Compare"), and display their 26 attributes from each side's build, the overview data, skills, body model and playstyles in an aligned matrix in which each row shows both values as pills and, when they differ, the absolute difference next to both pills, marked positive on the higher side and negative on the lower side. A legacy `?ids` query MUST be read as `left` = the first valid id and `right` = the second, the extra ids dropped and the URL rewritten to the `left`/`right` form, so no card is loaded without a slot tile. Every panel (cards, radar, stat matrix, position proficiency, boosters) MUST follow the slot order, and the Swap action MUST exchange the cards and their builds in all panels together.

#### Scenario: Extra ids in the share link
- **WHEN** the user opens `/compare?ids=A,B,C,D`
- **THEN** only A and B are shown (left = A, right = B), the URL is rewritten to `?left=A&right=B`, and no panel lists C or D.

#### Scenario: Comparing two center-backs
- **WHEN** user selects Bonucci (Epic) and Chiellini (Epic) for comparison
- **THEN** the system renders a synchronized comparison table in which every row whose values differ shows the difference next to both pills, the higher value marked positive and the lower negative, and equal rows show no difference.

#### Scenario: Selection order independent of card id
- **WHEN** the user picks a card with the larger id in the left slot and a card with the smaller id in the right slot
- **THEN** the left column of the stat matrix, proficiency and booster panels shows the left slot's card, and the compare API returns the cards in the requested order.

#### Scenario: Swap
- **WHEN** the user presses Swap
- **THEN** the left and right columns of every panel exchange, matching the slot cards, their builds and the radar.
