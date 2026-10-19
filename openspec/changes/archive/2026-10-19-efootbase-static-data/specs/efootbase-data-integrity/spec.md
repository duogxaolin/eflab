## MODIFIED Requirements

### Requirement: Complete Skill Import
The seeder SHALL import every skill flag (`s_*`) present in a player row into the player's skill list, and the skill catalogue SHALL contain a slug for every `s_*` key in the dump. When the static skill snapshot is available, the seeder SHALL attach each skill's description, group, effects, activation text and icon key, SHALL map every effect attribute to an eFootLab stat through one explicit table, and SHALL abort on an attribute that is not in the table; when the snapshot is missing it SHALL log a clear warning and continue.

#### Scenario: No skill flag is dropped
- **WHEN** the seed completes
- **THEN** the total number of player-skill rows equals the number of true `s_*` flags in the dump, and the seeder logs zero unmatched skill keys.

#### Scenario: Static data attached
- **WHEN** the seed completes with the snapshot present
- **THEN** every released efootbase skill (67) has a non-empty description and an icon key, 23 of them are Showtime and 44 are Classic, the 17 non-skill entries keep their fixture text with no group, and unreleased skills are stored but hidden.

#### Scenario: Unknown effect attribute
- **WHEN** a skill effect names a stat that is not in the mapping table
- **THEN** the seed aborts and the database is unchanged.

## ADDED Requirements

### Requirement: Manager Picker Roster
The database SHALL mark exactly the managers that efootbase offers in its picker (69 at the time of the snapshot) as picker managers, SHALL contain every one of them by id, and the seed SHALL leave cross-fill owned manager columns untouched.

#### Scenario: Picker managers
- **WHEN** the seed completes with the manager snapshot present
- **THEN** 69 managers are marked as picker managers, each with a name, a rating from 83 to 90 and the stat pills efootbase lists (one or two — 45 of the 69 have a second pill), stored as eFootLab stat names, and the cross-filled tactic data of the other managers is unchanged.
