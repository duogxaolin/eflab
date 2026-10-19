## Context

See proposal.md. The survey snapshot lives outside the repository: skills (72 with description, group, effects, activation, icon), icons (67 files), 69 managers with images, and a mapping to eFootLab's skill slugs. The seed matches player skill flags to skill slugs through the fixture file and an alias table; those slugs must stay stable because the player-skill join depends on them.

## Goals / Non-Goals

**Goals:** a faithful, verified load of skill and manager static data; stable slugs and join; third-party content kept out of the repository; real data on the skills pages.
**Non-Goals:** the manager router or picker, the exact stat and overall model, automated scraping, Position Training.

## Decisions

1. **Snapshot in the ignored dump area.** The seed reads `static/skills.json` and `static/managers.json` under the dump directory; a missing file is a loud warning, not a crash, so a fresh clone still seeds.
2. **Slugs stay fixture-owned.** The fixture slug remains the join key; efootbase metadata is attached through a verified mapping file. Display names follow efootbase through the existing display-label table; the stored name is updated from the snapshot.
3. **Effects are mapped, never guessed.** efootbase attribute keys map to eFootLab stat columns through one explicit table; an unknown key aborts the seed.
4. **Unreleased skills are hidden rows.** The 5 skills without icon, wiki entry, stat effects or holders are stored with `released = false` and excluded from public lists; they do carry efootbase's description, group (Showtime), key and wiki order.
5. **Non-skill entries stay.** The 17 entries that efootbase does not treat as skills keep their rows but carry no group, and the skills page lists them under "Other".
6. **Managers.** Upsert by id on fixture-owned columns only; cross-fill columns are untouched; `inPicker` is set for exactly the 69 snapshot ids; the 4 new managers come from the fact-only fixture and have no tactic data until a cross-fill source has them.
7. **Object storage.** Icons go to `skills/{Skill_Name}.webp` and the 4 new manager images to `managers/{id}.webp`, using the existing upload tool and a HEAD verification; the existing 65 manager images are kept.
8. **Safety.** The migration is applied with `prisma migrate deploy` after a verified backup; the seed stays a single transaction upsert.

## Risks / Trade-offs

- **[Risk]** The snapshot is site-structure dependent and will go stale → Mitigation: documented regeneration steps, fact-only fixtures committed, loud warnings.
- **[Risk]** Effects exist only for skills seen on loaded cards → Mitigation: documented limit; skills without data show no effect text.
- **[Trade-off]** Third-party descriptions live in the database but not in the repository, so a fresh environment shows empty descriptions until the snapshot is provided.
