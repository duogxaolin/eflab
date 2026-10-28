## Context

- Card faces are one R2 object per card (`cards/<id>_dynamic.webp`), uploaded with a one-year immutable cache header. A changed card image is replaced under the same key, so the only lever that busts browser and edge caches is the query string: every card URL carries `?v=<IMAGE_VERSION>` (`apps/web/lib/r2-images.ts`), a build-time constant (`NEXT_PUBLIC_IMAGE_VERSION`, else the committed `DEFAULT_IMAGE_VERSION`, `"20261024"`).
- The worker already measures overwrites exactly: `imagesOverwritten` counts only downloads whose body differs from a bucket object with a content-hash ETag (`imageStepOutcome`). The image step downloads into the run directory; the objects are really replaced by the **upload step** (`runUpload`, `r2_upload.py --no-resume`), which both handlers start only when `imagesDownloaded > 0`.
- `CatalogueMeta` is a single-row table (id 1, CHECK `CatalogueMeta_single_row`, row inserted by migration `20261024000000_catalogue_data_refresh`). The seed upserts it with typed queries and an explicit `update` list (`playersDumpedAt`, `seededAt`), so a new column is untouched by the seed unless the seed names it.
- The run's final state is written by one transaction in `runner.ts` (`finishRun`: status, stats, log tail, items, progress cleared). Stale RUNNING runs are recovered by `recoverStaleRuns` (FAILED "worker restarted", progress cleared, items kept). While a run is live its `progress.counters` (a whitelist that includes `imagesOverwritten`) and `progress.phase` are written every 10 s.
- `catalogue.meta` is public and already read by `/players`. The web's server fetch helper (`apiQuery`) uses `cache: "no-store"` and a 4 s timeout; the API is the only data path of the web app.
- The root layout is shared by every page, public and admin. A layout is not re-rendered on client-side navigation.

## Goals / Non-Goals

**Goals:**
- After a run replaces card images on R2, visitors get the new bytes with no human step: no edit, no build, no restart, no deploy.
- Never bust the caches without a reason (a run that replaced nothing changes nothing).
- Never show a card with a wrong image because of the ordering of the bump and the upload.
- A failure of the lookup must never block or break a page.
- The admin says what happened instead of giving a manual instruction.

**Non-Goals:**
- A version per card, new R2 keys, different cache headers, purging a CDN, any change to the dump / upload scripts.
- Making an already-open tab pick up a new version without a reload (see Risks).
- Any visual change to a public page.

## Decisions

### D1. The version lives in `CatalogueMeta.imageVersion`, NULL = nothing stored
Additive migration: `ADD COLUMN IF NOT EXISTS "imageVersion" TEXT`, and a CHECK `CatalogueMeta_image_version_format` (added only if missing) `"imageVersion" IS NULL OR "imageVersion" ~ '^[0-9]{8,14}$'`. The migration stores **no** value: guessing a version in SQL would be a hidden data decision; the orchestrator sets the live value once after migrating (D8). NULL falls back (D6), so a database that never saw a bump behaves exactly as today. The seed's `update` list does not name the column, so a seed never resets it (a test pins that).
Alternatives: a column on `SyncConfig` (rejected: it is worker configuration, not a fact about the catalogue the public API serves); a new table (rejected: one value does not need one); the stats of the last overwriting run (rejected: pruning or a failed run would silently roll the version back, which re-serves stale bytes).

### D2. `nextImageVersion(now, current)` — pure, in `@eflab/shared`
Returns `yyyymmddHHmm` in UTC (12 digits) for `now`. It must be **strictly greater** than `current`: when the clock value is `<=` a valid `current`, it returns `current + 1` as a string of the same width (numeric increment of a 14-digit string stays below 2^53), so two bumps in the same minute, a clock that moved back, or a `current` written by hand ahead of the clock all still increase. An invalid or null `current` is treated as absent. The result always matches the CHECK. Strict monotonicity is what makes "the URL changed" a guarantee: an equal value would leave the old cached bytes in place.
Alternative: a counter (rejected: the date-shaped value is readable in the admin and compares with `DEFAULT_IMAGE_VERSION`, which is date-shaped, so the fallback ordering stays meaningful).

### D3. When the worker raises it — after the objects are replaced, never before
Rule: a run raises the version when it **started the upload step with `imagesOverwritten > 0`**. Both handlers set a context flag (`ctx.cardImagesMayBeReplaced = true`) immediately before `runUpload`, only when `ctx.stats.imagesOverwritten > 0`; the final transaction in `finishRun` reads it. That covers: OK runs; a run that fails or is cancelled after the upload began (R2 may already hold replacements — over-raising is harmless, under-raising shows stale images for a year); and excludes a run that failed in the image step (nothing was uploaded, so the old bytes are still the right ones for the old URL).
The raise must come **after** the replacement. If the version were raised first, a visitor could fetch the new URL while R2 still holds the old object, and the immutable header would pin the old bytes under the new URL. The final transaction runs after the upload child has exited, so ordering holds; the transaction reads the current value `FOR UPDATE` (typed raw query on `CatalogueMeta` id 1), computes `nextImageVersion`, and updates the row in the same transaction that records the run (`status RUNNING` guard unchanged: when the guarded update matches no row the raise is skipped with the rest).
**Worker killed mid-upload**: the run is later recovered as FAILED "worker restarted" by `recoverStaleRuns`. That recovery reads the dead run's last `progress` (written every 10 s) and raises the version in the same transaction when `progress.counters.imagesOverwritten > 0` and `progress.phase` is "Uploading images" or "Writing the catalogue". Window not covered: a death within the first 10 s of the upload phase, before its first progress write — the run's overwritten images stay unannounced and the next run does not re-detect them (the bucket objects now equal the source), so the stats row would be the only trace. Accepted and documented; the log of the run and `docs/admin-sync.md` give the one-line SQL to raise the version by hand.
The seed (`pnpm db:seed` / the full run's seed child) never raises the version: image replacement is the upload step's business, whoever started the run.
Alternative: raise on every run with `imagesUploaded > 0` (rejected: new-card uploads do not replace anything and would bust every visitor's cache hourly); raise from the image step's count alone (rejected: a failed upload means nothing was replaced).

### D4. The run records the value: one optional stats field, plus a log line
`syncRunStatsSchema` (strict) gets one optional field `imageVersionRaisedTo` (string, `^[0-9]{8,14}$`). Old rows parse unchanged, new rows with the field parse with the new schema; an old API reading a new row would reject the strict object, which cannot happen because the code and the schema ship together. The run's log tail also gets "image version raised to <value>". The admin run detail reads the field to say which value the run set; the dashboard reads the current value from the database, not from a run. `publicRunStats` passes the field through. Because the value is only known inside the final transaction (after the locked read), `finishRun` builds the stats JSON inside the transaction; the recovery path does the same and writes the field into the recovered run's stats. A stats value that fails validation is dropped like the other optional fields (the existing "invalid statistic" path), never the whole record.
Alternative: only the log line (rejected: the run page would have to parse text); `SyncRun.items` (rejected: it is the downloaded-items record).

### D5. API: `catalogue.meta` gains `imageVersion`
`{ playersDumpedAt: string | null, imageVersion: string | null }`. A stored value that fails the format check (cannot happen with the CHECK, but a restored dump could differ) is returned as null, never thrown. The route stays public. The admin dashboard DTO replaces `overwrittenImages` (the "warning") with `imageVersion: { current: string | null, effectiveFallback: string }`-style data: the current stored value (null = fallback in use) and, for the last run that replaced images, its id, count and finish time (information, not a warning). The exact DTO shape is fixed in the specs and the shared types.

### D6. Web: the layout supplies the version, one rule decides it
Resolution order, one function in `lib/r2-images.ts`: **stored value → `NEXT_PUBLIC_IMAGE_VERSION` (build-time) → `DEFAULT_IMAGE_VERSION`**. The stored value wins because it reflects what happened on R2 after the build; the env and the committed constant are fallbacks for a database with nothing stored or an API that cannot be reached. `cardImageUrl` and the two helpers take the resolved version as an explicit argument (no module state, no setter).
The root layout (server component) fetches `catalogue.meta` with a dedicated small fetch (`next: { revalidate: 60 }`, the 4 s timeout, errors swallowed → `null`), so a new value reaches visitors within about 60 s plus the page's own freshness, and static pages, if any, stay static. It passes the value to `ImageVersionProvider` (client context). The four components that build card image URLs (`PlayerCard`, `PlayerSearchRow`, `SkillsClient`, `SkillDetailClient`) read it through `useImageVersion()`. A page never waits for more than the layout fetch's timeout and never throws because of it; the version is known at first render, so there is no flash of the old URL. The task for this part reports the build route table before and after to prove no route changed between static and dynamic.
Alternatives: a client-side `useQuery(catalogue.meta)` in the helper (rejected: a first render with the fallback and a second with the stored value changes every image URL after paint and fetches both); fetching in each page (rejected: many call sites, easy to miss one — the layout is the single place); a Next route handler that rewrites image URLs (rejected: images load straight from R2, adding a hop defeats the CDN).

### D7. Admin wording
`IMAGE_VERSION_INSTRUCTION`, the run detail's warning block and the dashboard's "Overwritten images" warning (`overwrittenImages`, `admin.dashboard`'s `stats.imagesOverwritten > 0` lookup) are replaced. Run detail: when a run raised the version, an informational line "Card images replaced on R2 — image version raised automatically to <value>"; the overwritten counters keep their numbers and help texts lose the manual instruction. Dashboard: a read-only "Card image version" fact (the stored value, or "default (<fallback>)" when nothing is stored) and the last such run as a plain information line, no warning role. The old lookup that scans finished runs for overwrites is removed with the warning.

### D8. Live data at deploy
After the migration the orchestrator sets the live value once (run #1 of 2026-10-28 already replaced 19 images): `UPDATE "CatalogueMeta" SET "imageVersion" = '<yyyymmddHHmm now>' WHERE id = 1 AND ("imageVersion" IS NULL)`. It is documented in `docs/admin-sync.md` next to the "worker killed" case. The worker is restarted afterwards (the launchd job was stopped during development).

## Risks / Trade-offs

- **Cache churn**: each raise makes every visitor re-download the card faces they view. It happens only on runs that replaced images (a handful a week; a full run can replace hundreds). Accepted; it is exactly the problem being solved. A per-card version would avoid it but needs a field in every list DTO and was rejected.
- **Open tabs**: a root layout is not re-rendered on client navigation, so a tab opened before the raise keeps the old version until its next full load. Acceptable for an image cache; documented.
- **Propagation delay**: up to about 60 s (layout fetch revalidation) plus any CDN page cache in front of the web app. Documented as "within about two minutes".
- **Stale-recovery window** (D3): an unannounced replacement is possible only if the worker dies within the first 10 s of an upload phase. The recovery log and the documented SQL cover it.
- **Clock**: `now` is the worker's clock; `nextImageVersion`'s strict-greater rule means a wrong clock can only move the value forward.
- **Extra fetch in the layout**: one small cached request per minute per web instance; failure is silent and falls back. The API being down already breaks the data pages themselves.
- **Strict stats schema**: adding the optional field is additive for rows but means the field must ship with the code that writes it (it does: one change).
