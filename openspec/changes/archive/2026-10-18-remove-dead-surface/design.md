## Context

See proposal.md. The audit and two verifications established which procedures the web calls: `player.*`, `skill.*`, `featured.*` and `auth.getSession` (the latter only when a consumer mounts). Everything else is reachable only by direct HTTP calls. Auth tables are written by the kept `auth` router. `Pack`/`PackCard` are read by `player.byId` and seeded from the dump; `Manager` is seeded from fixtures and filled by the eFHUB cross-fill. The repository is public, and the live database holds real rows in User (8), Session (12), Account (8) and TierList (1).

## Goals / Non-Goals

**Goals:**
- Remove code and tables with no caller while keeping every user-visible behaviour, the kept routers, the data assets and the auth system intact.
- Prove each removal by grep (no references left) and by the unchanged behaviour of the product (typecheck, tests, build, browser smoke, DB row counts).

**Non-Goals:**
- Removing the auth system, Pack/PackCard, Manager data or the Progression engine.
- Rewriting git history.
- New product behaviour.

## Decisions

1. **Evidence first.** The implementer re-greps (web, api, shared, db, scripts, docs) for every symbol before removing it and records a removal ledger (symbol, callers found = 0, files). Anything with a caller stays and is reported.
2. **Order of removal.** First routers and the code only they use (API), then shared exports, then web dead code and dependencies, then the schema migration, then docker/docs. Typecheck after each group so a missing consumer surfaces early.
3. **Router removal with data kept.** `manager` and `pack` routers go, but the Manager and Pack tables, their seeding and cross-fill stay; docs state that the data is kept for future use.
4. **Migration, not push.** One new migration drops the eight tables with explicit `DROP TABLE … ` statements (and the relations and enums only they use). Applied to the live database with `prisma migrate deploy` after `pg_dump -Fc` and `pg_restore --list`. A scratch database built from migrations must match the schema (`migrate diff` empty).
5. **Seed and tooling follow the schema.** `--reset-users` deletes only tables that still exist; `verify-seed.py` and the smoke test stop referencing removed procedures and tables.
6. **Dependencies.** A package is removed only when no import in the workspace references it; the lockfile is updated with the package manager (offline where possible). `better-auth` stays because `auth/session.ts` imports `better-auth/crypto`.
7. **Docs.** CLAUDE.md, README and ui-dna list the real router set. Specs of removed features get an additional status note; their requirement text is untouched so validation stays green.

## Risks / Trade-offs

- **[Risk]** A symbol with an indirect caller (dynamic import, string reference, script) is removed → Mitigation: grep for the symbol name and file path in all text files, typecheck, build and smoke test, and keep any item that has a hit.
- **[Risk]** Dropped tables lose data → Mitigation: verified backup, ledger of row counts (TierList 1 row), owner approval recorded.
- **[Risk]** Removing procedures breaks external clients → Mitigation: none known; the API is internal to this repository.
- **[Trade-off]** Keeping auth and the Manager/Pack data means some surface remains by owner choice.
