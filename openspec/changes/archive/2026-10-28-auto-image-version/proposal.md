## Why

Card images on R2 are served with `Cache-Control: public, max-age=31536000, immutable`, and the sync worker replaces a changed card image under the same key. Visitors only see the new bytes when the `?v=<version>` query of the card URL changes, and that version is a build-time constant (`DEFAULT_IMAGE_VERSION` in `apps/web/lib/r2-images.ts`): someone has to edit it and rebuild the web app after every run that overwrites an image. It already happened on the first real run (2026-10-28, 19 images overwritten) and the hourly schedule makes it routine. The owner deploys on Linux Docker, so a manual edit-and-rebuild step must not remain.

## What Changes

- New column `CatalogueMeta.imageVersion` (nullable text, 8–14 digits). NULL means "nothing stored": every consumer falls back to the committed `DEFAULT_IMAGE_VERSION`.
- The sync worker raises the stored version itself, in the transaction that records the run, whenever a run replaced existing card images on R2 (a run that replaced nothing leaves it alone). A pure helper in `@eflab/shared` makes the value (UTC `yyyymmddHHmm`, strictly greater than the stored one). A worker that dies mid-upload is covered by the stale-run recovery.
- `catalogue.meta` also returns `imageVersion` (`string | null`).
- The web root layout reads it (revalidated every 60 s, never blocking a render) and a client provider hands it to the four components that build card image URLs; the URL helpers take the version as an argument. A new version reaches visitors within about two minutes with no build and no restart.
- Admin: the "raise the image version and rebuild" instruction and the dashboard warning are removed; the run detail and the dashboard say the version was raised automatically and the dashboard shows the current value (read-only). `SyncRun.stats` gets one optional field, `imageVersionRaisedTo`.
- **BREAKING (operational only)**: nobody edits `DEFAULT_IMAGE_VERSION` for a sync any more; it stays the committed fallback. `NEXT_PUBLIC_IMAGE_VERSION` keeps working only as a fallback when nothing is stored.
- Additive migration; no data is rewritten and the migration stores no value (the orchestrator sets the live value once, after migrating).

## Capabilities

### New Capabilities
- `card-image-version`: where the card-image cache version lives, when the worker raises it, how the API exposes it, how the web resolves it, and how the admin shows it.

### Modified Capabilities
- `data-sync-worker`: "Overwritten Images Warning" — the instruction to raise the version by hand and rebuild is replaced by the automatic raise and its visible result (the overwritten count is still shown).

## Impact

- `packages/db`: `schema.prisma`, one additive migration.
- `packages/shared`: `nextImageVersion` helper, `CatalogueMetaDTO`, `syncRunStatsSchema` (one optional field), DTO for the dashboard.
- `apps/worker`: `runner.ts` (final transaction, stale recovery), the incremental and full handlers (a flag set when the upload step starts), tests on the scratch-database harness.
- `apps/api`: `catalogue.meta`, the admin dashboard DTO (`overwrittenImages` warning becomes info, current version added), smoke test.
- `apps/web`: `lib/r2-images.ts`, a provider, root layout, `PlayerCard`, `PlayerSearchRow`, `SkillsClient`, `SkillDetailClient`, admin wording (`run-display.ts`, `DashboardClient`, `RunDetailClient`, `RunItems`).
- Docs: `CLAUDE.md`, `docs/admin-sync.md`, `README.md` if it mentions the version.
- No change to the dump / upload scripts, R2 keys or cache headers, and no visual change to any public page.
