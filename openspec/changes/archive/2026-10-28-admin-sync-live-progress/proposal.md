## Why

The owner wants the catalogue sync to run by itself every hour and to be operated from `/admin`: a button to run now, a visible progress while a run is going, and a record of what a run actually downloaded. Today the schedule, the run-now buttons, the run list and a 3-second refresh already exist, but a running run shows "No statistics yet." until its end, only counters are kept (nothing says which cards or images were fetched), the default interval is 6 hours and the schedule form has no presets.

## What Changes

- **Hourly by default.** The incremental interval defaults to 60 minutes (code constant and an additive, idempotent migration that changes the column default and updates the single configuration row only while it still holds the old default 360, so a value the owner chose is kept). The schedule form gets interval presets (15 min, 30 min, 1 h, 3 h, 6 h, 12 h, 24 h) beside the number input. The weekly full-run window still takes the place of the incremental run in its hour.
- **Live progress.** A new `SyncRun.progress` column holds the current phase, done / total (total unknown allowed), a snapshot of the counters known so far and a timestamp. The worker writes it in the existing 10-second heartbeat update (guarded by `status = RUNNING`). The Python scripts get opt-in `--progress-every N` flags (defaults unchanged) so the image steps report `done/total`. The run detail and the dashboard's active-run card show a phase line, a progress bar (`role="progressbar"`) and live counters; polling stays at 3 seconds (no streaming).
- **What was downloaded.** A new bounded `SyncRun.items` column records the new and changed card ids and the image paths downloaded, overwritten, unverified, failed (with a short reason class), uploaded and failed to upload, each list capped (2,000 entries, true totals kept, truncation flags), written before the database write (incremental) and again at the end. `r2_upload.py` gets an opt-in `--results-file`. Card names are not stored: the admin API joins them from the catalogue when a run is read. The run detail shows a "What was downloaded" section.
- **Run now** keeps its three buttons and their 409 / 412 rules; after a run is queued the page links to its detail, which shows the live progress.
- **Operations** (after the merge, by the orchestrator): `pg_dump` of the live database, `pnpm db:migrate`, rebuild and restart web and API, then the worker as a launchd service with its secrets in an env file outside the repository, the live interval set to 60, and the first runs watched. The admin account is created by the owner (`pnpm admin:create <name>`).
- **Docs**: `docs/admin-sync.md` (hourly auto-run on macOS, the new views), `CLAUDE.md`, README where they state 360 minutes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `data-sync-worker`: MODIFIED "Sync Schedule" (default 60 minutes), "Run Statistics And History" (live progress and the downloaded-items record), "Admin Dashboard Behaviour" (presets, progress, link to the run); ADDED "Live Run Progress", "Downloaded Items Record", "Opt-In Progress And Result Flags".

## Impact

- **DB:** one additive, idempotent migration (`SyncRun.progress`, `SyncRun.items`, a size CHECK on `items`, the new default and the conditional row update). A `pg_dump -Fc` backup of the live database outside the repository precedes it (orchestrator).
- **Code:** `packages/db` (schema, migration), `packages/shared` (schemas, types, sync defaults, tests), `apps/worker` (runner, handlers, scripts, tests), `apps/api` (admin router DTOs, names join, smoke), `scripts/efootbase_dump.py` and `scripts/r2_upload.py` (opt-in flags), `apps/web` admin pages, docs.
- **Not touched:** public pages, the seed, the cross-fill, the request cadence and identity toward the source, the cancel-versus-commit rules (preserved).
- **Operations:** web and API rebuild and restart; the worker is started as a service; rollback = `git revert` plus the documented SQL that drops the two columns and restores the old default.
