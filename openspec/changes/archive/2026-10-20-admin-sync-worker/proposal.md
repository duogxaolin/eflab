## Why

eFootLab's catalogue only changes when the owner runs the dump, image upload and seed by hand (the last re-dump on 2026-10-18 found 2,284 new cards and 5,380 changed ones). The owner wants the site to stay current by itself: a worker that checks efootbase on a schedule and syncs new cards and their images, plus an admin page with buttons to check the API, start a sync now and read the history. The admin area needs its own accounts (a separate SQL table, user name and password) because the site has no sign-in UI and the existing user tables are for visitors.

## What Changes

- **Admin accounts and sessions** in new tables, independent of `User`/`Session`: scrypt password hashes, accounts created by a CLI (`pnpm admin:create`), cookie session, lock-out after repeated failures, CSRF guard, `no-store` and `noindex` admin pages.
- **A separate worker process** (`apps/worker`, TypeScript) that wakes every ~30 seconds, reads the schedule and the run queue from the database, and runs one job at a time: an API check, an incremental sync (new cards since a watermark) or a full sync (complete dump, existing seed, changed-image detection). It orchestrates the existing `efootbase_dump.py` and `r2_upload.py` scripts and writes rows with a mapping shared with the seed.
- **Admin API router** (`admin.*`): sign-in/out, read and update the schedule, queue a check / incremental / full run, cancel, list and read run history. The API process never holds the efootbase key or R2 credentials; the worker does.
- **Admin pages** `/admin/login`, `/admin`, `/admin/runs`: status, buttons (check API, incremental sync, full sync with confirmation, cancel), schedule form, history with stats and log tail, warnings (blocked by Cloudflare, images overwritten).
- **Seed refactor with no behaviour change:** the row-mapping functions move into a module shared by the seed and the worker; the dump script gets a "newest first, stop before a time" mode for incremental runs.
- **New tables (one migration, additive):** `Admin`, `AdminSession`, `SyncConfig`, `SyncRun`.
- **Operations docs** (`docs/admin-sync.md`), root scripts, `.env` variable names only.
- Out of scope: automatic eFHUB cross-fill, automatic image cache versioning, e-mail/Slack alerts, multiple admin roles or account management in the UI, a docker-compose service for the worker, any change to the public auth router.

## Capabilities

### New Capabilities
- `admin-access`: separate admin accounts, password handling, CLI account management, sign-in, sessions, brute-force protection, CSRF guard, protected admin API and pages that are never indexed or cached.
- `data-sync-worker`: schedule, run queue and exclusion, API check, incremental and full sync, politeness and blocking rules, image upload, run history and statistics, secret handling, worker liveness, admin dashboard behaviour.

### Modified Capabilities
- `efootbase-data-integrity`: adds the requirement that every write path from efootbase data (seed and sync) uses one shared row mapping, and that the seed can read from a staging directory. The seed's behaviour does not change.

## Impact

- `packages/db` (schema, one migration, `efootbase-map.ts` extracted from the seed, admin CLI scripts), `packages/shared` (admin/sync Zod inputs and DTOs, pure schedule and watermark functions with tests), `apps/api` (`admin` router, admin context/middleware, CSRF and rate limit), `apps/worker` (new), `apps/web` (`/admin*` pages and client), `scripts/efootbase_dump.py` (incremental mode), `scripts/smoke-test.sh`, `docs/`, CLAUDE.md, README.md, `openspec/ui-dna.md`.
- Live database: one additive migration after a verified `pg_dump`. No row of an existing table changes.
- Network: automated tests use a local fake efootbase server. Acceptance makes at most one real efootbase request (a check with `limit=1`); a real sync is run by the owner.
- New runtime requirement on the worker host: `python3` with `boto3` (already needed by the existing scripts). No new npm dependency is planned.
