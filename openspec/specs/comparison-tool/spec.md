# comparison-tool Specification

## Purpose
The comparison tool capability enables simultaneous side-by-side analysis of two or more player cards, aligning attribute categories and rendering 6-axis radar visualizations.
## Requirements
### Requirement: Multi-Card Side-by-Side Comparison
The system MUST allow users to select 2 to 4 player cards and display their 26 attributes, physical metrics, skills, and playstyles in an aligned matrix with visual indicators highlighting statistical advantages.

#### Scenario: Comparing two center-backs
- **WHEN** user selects Bonucci (Epic) and Chiellini (Epic) for comparison
- **THEN** the system renders a synchronized comparison table highlighting the superior value in green for each respective attribute row.

### Requirement: 6-Axis Radar Visualization
The comparison view MUST render an interactive hexagonal radar chart summarizing aggregate ratings across 6 macro dimensions: SHT (Shooting), PAS (Passing), PHY (Physicality), DEF (Defending), DRI (Dribbling), and SPD (Speed).

#### Scenario: Rendering radar comparison
- **WHEN** 2 players are compared
- **THEN** two distinct colored overlay polygons represent the comparative profile across the 6 axes.

