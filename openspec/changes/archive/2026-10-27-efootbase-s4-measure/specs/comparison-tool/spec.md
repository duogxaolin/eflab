## MODIFIED Requirements

### Requirement: 6-Axis Radar Visualization
The comparison view MUST render an interactive hexagonal radar chart summarizing aggregate ratings across 6 macro dimensions: SHT (Shooting), PAS (Passing), STR (Strength), DEF (Defending), DRI (Dribbling), and SPD (Speed). Each side's polygon SHALL be drawn from the shown stats of that side's build, on a 0–115 scale with integer axis values, by the rules of the `efootbase-s4-measure` capability "Compare Radar From The Build", and the chart SHALL carry a text alternative with both sides' six values.

#### Scenario: Rendering radar comparison
- **WHEN** 2 players are compared
- **THEN** two distinct colored overlay polygons represent the comparative profile across the 6 axes.

#### Scenario: Radar follows the builds
- **WHEN** a side's build changes (Max OVR, Reset, a manager selected or cleared — the booster pills are read-only and there is no category editing) or the sides are swapped
- **THEN** the polygons and the text alternative are recomputed from the shown stats of the builds as they now are, and Swap exchanges the two polygons with their slots.
