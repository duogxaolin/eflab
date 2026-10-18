## MODIFIED Requirements

### Requirement: Ten Training Categories
Training SHALL use ten categories that each raise every stat they contain by the number of stat points bought in that category: Shooting (finishing, placeKicking, curl), Passing (lowPass, loftedPass), Dribbling (dribbling, ballControl, tightPossession), Dexterity (offensiveAwareness, acceleration, balance), Lower Body Strength (kickingPower, speed, stamina), Aerial Strength (heading, physicalContact, jump), Defending (defensiveAwareness, defensiveEngagement, ballWinning, aggression), Goalkeeper 1 (gkAwareness and jump), Goalkeeper 2 (gkParrying — the eFHUB 'GKClearing' stat — and gkReach) and Goalkeeper 3 (gkCatching, gkReflexes). Jump therefore rises with stat points in Aerial Strength and in Goalkeeper 1 together. Projected stats SHALL NOT be capped at 99.

#### Scenario: Shooting gain
- **WHEN** a user buys 4 stat points in Shooting
- **THEN** Finishing, Place Kicking and Curl each rise by 4 and no other stat changes.

#### Scenario: Jump from two categories
- **WHEN** a user buys 6 stat points in Aerial Strength and 6 in Goalkeeper 1
- **THEN** Jump rises by 12, Heading and Physical Contact rise by 6, and Goalkeeper Awareness rises by 6.

#### Scenario: Outfield opening build may include Goalkeeper 1
- **WHEN** the Max-OVR opening build of an outfield card is computed and Goalkeeper 1's Jump contribution raises the estimate more than any other category for the last point
- **THEN** that build may include a Goalkeeper 1 point, and the displayed overall is unaffected beyond rounding.

#### Scenario: Goalkeeper 1 alone
- **WHEN** a goalkeeper buys 12 stat points in Goalkeeper 1 and none in Aerial Strength
- **THEN** Goalkeeper Awareness and Jump each rise by 12.

### Requirement: Honest Limits
The panel SHALL NOT offer a manager control and SHALL NOT claim exact overall values; it SHALL project every stat of every category, including goalkeeper Jump, from the rules above.

#### Scenario: Goalkeeper Aerial training
- **WHEN** a goalkeeper buys Aerial stat points
- **THEN** Heading, Physical Contact and Jump rise by the points bought and no stat is shown as unavailable.
