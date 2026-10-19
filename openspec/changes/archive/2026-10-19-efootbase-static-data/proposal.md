## Why

eFootLab stores self-written skill names and descriptions and shows skills as plain chips. efootbase publishes the real skill descriptions, group (Showtime or Classic), stat-boost effects, activation conditions and icons, and a list of 69 managers whose selection changes stats in the Progression sheet. A browser survey captured this data (outside the repository). Loading it into the database and object storage is the prerequisite for the exact progression model and the manager picker in the second change, and it makes the skills pages show real game information. The owner accepted the terms risk of using this content.

## What Changes

- Load the 67 efootbase skills (description, group, effects, activation, icon) into the database; add the 5 unreleased skills as hidden rows; keep the 17 non-skill entries under "Other".
- Add 4 managers that eFootLab lacks, fix one misspelt name, and mark the 69 managers that efootbase offers in its picker.
- Upload 67 skill icons and 4 manager images to the image bucket.
- Skill list and detail endpoints return the new fields; the skills pages and the player detail page show icons, real descriptions, effects and activation text, with keyboard-accessible popovers on player skill chips.
- The seed ingests two new static data files from the (git-ignored) dump area and fails loudly on unknown stat names; the verification script checks the new conditions; documentation explains how the snapshot is regenerated.
- Third-party text, images and JSON stay out of the repository; only code, fact-only fixtures (ids, names, numbers) and documentation are committed.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `catalog-browsing-parity`: skills pages and groups use real descriptions, icons, effects and activation text.
- `efootbase-data-integrity`: the seed ingests the static skill and manager data and verifies it.

## Impact

- `packages/db` (schema, one migration, seed, fixtures), `packages/shared` (skill types), `apps/api` (skill router), `apps/web` (skills pages, player skills chips, skill display helpers), `scripts/` (upload helper use, verification, snapshot documentation), CLAUDE.md, README.md, `openspec/ui-dna.md`.
- Live database: one migration applied after a verified backup; the snapshot loaded with the non-destructive, single-transaction seed. How many times the seed was run was not logged; what is verified is the end state (`scripts/verify-seed.py`, read-only) and that the seed is an upsert in one transaction.
- No new runtime dependency. The manager picker and the exact stat model are the next change.
