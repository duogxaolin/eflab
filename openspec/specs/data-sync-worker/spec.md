# data-sync-worker Specification

## Purpose
Keeps the catalogue and card images current with efootbase through a scheduled worker and admin-controlled runs, while never overloading the source, never losing data and never exposing credentials.
## Requirements
### Requirement: Sync Schedule
One configuration record SHALL hold: enabled (default on), the incremental interval in minutes (default 60, allowed 15–1440), the weekday (0–6, default 0) and the UTC hour (0–23, default 3) of the weekly full sync, and an optional "blocked until" time. An admin SHALL be able to read and change it, and invalid values SHALL be rejected with 400. The worker SHALL decide what is due from the configuration and the run history only: an incremental run is due when enabled, not blocked and the last scheduled or manual incremental or full run that started is older than the interval; a full run is due once in the configured weekday-hour window when none has started since the window opened; a run is never due while another run of the same kind is queued or running.

#### Scenario: Incremental due
- **WHEN** the last incremental run started 7 hours ago, the interval is 360 minutes and nothing is queued
- **THEN** one scheduled incremental run is queued.

#### Scenario: Schedule disabled
- **WHEN** the schedule is disabled
- **THEN** no scheduled run is queued, while manual runs still work.

#### Scenario: Invalid change
- **WHEN** an interval of 5 minutes or an hour of 24 is submitted
- **THEN** the request fails with 400 and the stored configuration is unchanged.

#### Scenario: Blocked window
- **WHEN** "blocked until" is in the future
- **THEN** no scheduled run is queued and a manual run other than a check is refused with a message that names the time.

#### Scenario: Default interval
- **WHEN** a fresh database has all migrations applied
- **THEN** the single configuration row holds an incremental interval of 60 minutes, and a database whose row still held the old default of 360 is updated to 60 by the migration while a row holding any other value is left unchanged.

### Requirement: Run Queue And Exclusion
A run SHALL be a database record with a kind (check, incremental, full), a trigger (schedule or manual), a status (queued, running, ok, failed, blocked, cancelled), timestamps, statistics, an error text and a log tail of at most 64 KB. Queuing SHALL refuse with 409 an incremental or full run when one of either kind is already queued or running, and a check when a check is queued or running. At most one run SHALL execute at a time, enforced by the database itself (a constraint that allows only one running run), not by worker memory. A run that is marked running but has had no heartbeat for 10 minutes SHALL be marked failed ("worker restarted") when the worker starts. An admin SHALL be able to cancel a queued or running run; the worker SHALL stop the child processes (terminate, then kill after 10 seconds) and mark it cancelled.

#### Scenario: Duplicate full run
- **WHEN** a full run is running and an admin queues another full run
- **THEN** the request is refused with 409.

#### Scenario: Worker restart
- **WHEN** the worker starts and finds a run marked running with a heartbeat older than 10 minutes
- **THEN** that run becomes failed with the text "worker restarted" and the queue continues.

#### Scenario: Cancel running
- **WHEN** an admin cancels a running run
- **THEN** the child processes end within about 15 seconds, the run is cancelled and no run remains marked running.

### Requirement: API Check
A check run SHALL make exactly one request to the efootbase players endpoint (one record, newest first) and record: whether the service answered, the HTTP status, whether the answer was a bot-challenge page, the response time, the newest card's release time and how it compares with the newest card in the database. A check SHALL NOT write catalogue data.

#### Scenario: Healthy API
- **WHEN** a check runs against a healthy source
- **THEN** the run is ok with the status, time and newest release time recorded and the dashboard shows them.

#### Scenario: Challenge page
- **WHEN** the source answers 403 or an HTML challenge
- **THEN** the run is blocked, "blocked until" is set 6 hours ahead, and the dashboard says the source blocked the request.

### Requirement: Politeness And Blocking
The worker SHALL send at most 4 concurrent requests, SHALL use the same request identity as the existing dump script, and SHALL stop the whole run immediately on a 403, a 429 or an HTML challenge from efootbase's own API or image CDN, mark it blocked, set "blocked until" 6 hours ahead and make no further request until then. A refusal (403, 429 or HTML challenge) from a third-party image host the source links to (pesdb.net) SHALL only skip that host's remaining images for the current run — recorded as failed and owed for the next run — and SHALL NOT block the run or the source. It SHALL NOT retry a blocked request and SHALL NOT attempt to bypass a block.

#### Scenario: Block during a sync
- **WHEN** the source answers 403 on the 7th page of an incremental run
- **THEN** no request follows, the run is blocked, and the catalogue keeps the rows it had.

#### Scenario: Third-party image host refuses
- **WHEN** the third-party image host answers 403 for a card render during an incremental run
- **THEN** the run ends ok with that image counted as failed and owed, the card rows are written, "blocked until" stays unset, and the next run fetches the owed image.

#### Scenario: No scheduled retry while blocked
- **WHEN** the worker ticks during the blocked period
- **THEN** it queues nothing.

### Requirement: Incremental Sync
An incremental run SHALL read the players endpoint newest first until a page contains only cards released before the watermark, where the watermark is the newest release time in the database minus 7 days. It SHALL insert or update only the player rows, their skill links, referenced boosters, and the countries, teams and leagues the new cards reference and that are missing, using the same mapping as the seed and leaving cross-fill columns untouched; download the images of the cards it inserted and of the emblems of the countries, teams and leagues it inserted, compare the images of the existing cards it rewrites with the ones already in the image bucket and download only those that differ (counted as overwritten); and upload them to the image bucket before it writes the rows. An image that cannot be fetched, stored or uploaded SHALL NOT stop the write: its card is written, the image is counted as failed and recorded as owed, the run ends ok showing the failed and owed counts, and the next run compares the owed images again (an owed card outside the incremental window is compared by the next full run). It SHALL refuse to start when the bucket's public address is not configured. It SHALL NOT delete anything and SHALL NOT replace packs, bundles, skills, managers or other catalogue tables.

#### Scenario: New cards only
- **WHEN** the source holds 3 cards newer than the database and nothing else changed
- **THEN** the database gains 3 players with their images uploaded, and every other row is unchanged.

#### Scenario: Cross-fill preserved
- **WHEN** an incremental run rewrites a card that has cross-fill values
- **THEN** the cross-fill columns keep their values.

#### Scenario: Rewritten card images compared
- **WHEN** an incremental run rewrites an existing card whose source row changed and one of its two images changed at the source
- **THEN** both images are compared with the bucket, only the changed one is downloaded and uploaded, and the overwritten count is 1.

#### Scenario: Stat edits are not seen
- **WHEN** a card released a month ago has its stats edited at the source
- **THEN** an incremental run does not change it and the documentation states that a full run does.

### Requirement: Full Sync
A full run SHALL dump all players, metadata and packs into a temporary directory written atomically, refuse to continue if the static skill snapshot the seed needs is missing (the run fails with a message that names the file, because the seed would otherwise erase skill metadata), run the existing seed against that directory without its destructive options, compare with the image bucket the images of the cards that are new, whose stored row differs from the source row, or that an earlier run still owes, upload only those images that are missing or differ, and remove the temporary directory. An image that changed at the source while the card's row did not is not detected by a full run (a manual dump covers it). The cards whose images a full run did not finish comparing after its seed had written the catalogue (a failed, blocked, cancelled or interrupted image step) SHALL be recorded before the seed and compared by the next run; an image that failed SHALL be recorded as owed while the run ends ok with the failed and owed counts. A seed that has started SHALL NOT be stopped by a cancel or a time limit; the run then ends with the seed's real outcome and SHALL NOT be recorded as cancelled once the seed committed. It SHALL NOT run the cross-fill and SHALL NOT use the prune or user-reset options.

#### Scenario: Missing snapshot
- **WHEN** the static skill snapshot is absent
- **THEN** the full run fails before writing to the database and the error names the missing file.

#### Scenario: Seed failure
- **WHEN** the seed fails
- **THEN** the catalogue holds exactly the rows it held before, the run is failed with the seed's message, and the temporary directory is removed.

#### Scenario: Changed images
- **WHEN** the dump contains a card whose row differs from the stored row and whose image differs from the one in the bucket
- **THEN** only that card's image is uploaded again and the overwritten count is recorded; an image that changed on a card whose row did not change is not detected.

#### Scenario: Image step failed after the seed
- **WHEN** a full run's seed committed a changed card and its image step was then blocked
- **THEN** the next full run compares that card's images with the bucket even though its row no longer differs, and uploads the changed one.

### Requirement: Overwritten Images Warning
When a run overwrites any existing card image, the dashboard and the run detail SHALL show how many were overwritten and that the web build's image version must be raised and the web rebuilt for visitors to see them. An image counts as overwritten only when the bucket object it replaces has a content-hash ETag that differs from the downloaded body; a downloaded body equal to the bucket object SHALL be dropped, and a replacement of a bucket object whose ETag is not a content hash SHALL be counted separately as unverified, not as overwritten.

#### Scenario: Warning shown
- **WHEN** a finished run reports 12 overwritten card images
- **THEN** the run detail and the dashboard show that count with the instruction to raise the image version.

### Requirement: Run Statistics And History
Each run SHALL record: the pages and requests made, cards new, changed and unchanged, images downloaded, uploaded, overwritten, unverified, failed and still owed, duration, and the watermark before and after. While a run is running its statistics known so far SHALL be visible, not only after it ends. The admin SHALL be able to list runs newest first with pagination and open one to see its statistics, error, log tail, its live progress while it runs and what it downloaded.

#### Scenario: History paging
- **WHEN** more than one page of runs exists
- **THEN** the list shows the newest first and can load further pages without duplicates.

#### Scenario: Run detail
- **WHEN** a finished run is opened
- **THEN** its statistics, status, times and log tail are shown.

#### Scenario: Statistics while running
- **WHEN** an incremental run that has found 40 new cards is still running and its detail is open
- **THEN** the page shows 40 cards new from the latest progress write, at most about 13 seconds old, instead of "No statistics yet.".

### Requirement: Secrets Stay In The Worker
The efootbase key and the image-bucket credentials SHALL be read only by the worker process and its child scripts. The admin API, the web app and every stored log, error and statistic SHALL NOT contain them, and the worker SHALL remove any occurrence of a configured secret value from log lines before storing them.

#### Scenario: Log redaction
- **WHEN** a child process prints a line containing the configured key
- **THEN** the stored log tail contains a mask instead of the key.

#### Scenario: API process
- **WHEN** the API process is started without any efootbase or bucket variable
- **THEN** every admin procedure still works, and a check or sync is executed by the worker only.

### Requirement: Worker Liveness
The worker SHALL record a heartbeat at least every 30 seconds while idle and during runs, and the dashboard SHALL show the worker as online when the heartbeat is less than 2 minutes old and as offline otherwise, together with the next scheduled runs.

#### Scenario: Worker stopped
- **WHEN** the worker has not written a heartbeat for 3 minutes
- **THEN** the dashboard shows it offline and queued runs are shown as waiting.

### Requirement: Admin Dashboard Behaviour
The dashboard SHALL show the worker state, the last run, the next scheduled runs, the newest card in the database, the schedule form, interval presets beside the interval input (15 minutes, 30 minutes, 1 hour, 3 hours, 6 hours, 12 hours, 24 hours), the running run with its progress, and buttons to check the API, start an incremental sync, start a full sync (after a confirmation that explains it is heavy) and cancel. It SHALL refresh itself every 3 seconds while a run is queued or running and stop when the tab is hidden, and every button SHALL be disabled with a visible reason while it cannot be used. After a run is queued the page SHALL link to that run's detail.

#### Scenario: Run now
- **WHEN** an admin presses the incremental sync button while the worker is online
- **THEN** a queued run appears at once, becomes running when the worker takes it, and the page shows its final status without a manual reload.

#### Scenario: Full sync confirmation
- **WHEN** an admin presses the full sync button
- **THEN** nothing is queued until the confirmation is accepted.

#### Scenario: Worker offline
- **WHEN** the worker is offline
- **THEN** the page says so and warns that queued runs will wait.

#### Scenario: Interval preset
- **WHEN** an admin chooses the 1 hour preset and saves
- **THEN** the interval input reads 60, the stored interval is 60, and the next scheduled incremental run is due one hour after the last one started.

#### Scenario: Link after queuing
- **WHEN** an admin queues a run
- **THEN** the page shows a link to that run's detail, which opens with its live progress.

### Requirement: Automated Tests Never Contact The Source
Automated tests of the worker SHALL use a local fake source and a stand-in for the image upload, and a separate test database, so that no test sends a request to efootbase or the image bucket and no test writes to the live database.

#### Scenario: Fake source
- **WHEN** the worker tests run
- **THEN** every request goes to the local fake source configured through the source-address variable.

### Requirement: Live Run Progress
While a run is running the worker SHALL record its progress on the run record: the current phase (a fixed name per run kind), how many units are done and the total when it is known, a snapshot of the counters known so far (cards new, changed, images downloaded, uploaded, overwritten, failed, requests), and the time of the write. It SHALL write this in the same update as its 10-second heartbeat, only while the run is still marked running, and SHALL clear it when the run ends. The image steps SHALL report `done/total` through the opt-in flags of "Opt-In Progress And Result Flags". The admin API SHALL return the progress with the run (admin only, never cached), and the run detail and the dashboard SHALL show the phase, a progress bar and the live counters, refreshing every 3 seconds while the run is queued or running. The bar SHALL be a progressbar with a minimum, a maximum, the current value and a text value, and SHALL be indeterminate when the total is unknown; it SHALL not animate under reduced motion. Writing progress SHALL NOT change the order of an incremental run's steps (images, then the checkpoint, then one database transaction) or the rule that a cancel that arrives after the rows committed is never recorded as cancelled.

#### Scenario: Image step progress
- **WHEN** an incremental run is downloading 120 images and 45 are done
- **THEN** within 13 seconds the run detail shows the phase "Downloading images", a bar at 45 of 120 and the counters so far, without a reload.

#### Scenario: Unknown total
- **WHEN** the phase has no known total
- **THEN** the bar is indeterminate, has no current value, and its text value names the phase.

#### Scenario: Progress after the run left running
- **WHEN** a run was cancelled or ended between two progress writes
- **THEN** the late write changes no row, and the ended run carries no live progress.

#### Scenario: Cancel after commit unchanged
- **WHEN** a cancel arrives after an incremental run's rows have committed
- **THEN** the run ends with its real outcome and is not recorded as cancelled, exactly as before progress existed.

### Requirement: Downloaded Items Record
Each run SHALL keep a bounded record of what it fetched, in one column of the run record: the ids of the cards it found new and changed, and the paths of the images it downloaded, overwrote, could not verify, failed to fetch (each with a short reason class such as http_404, timeout or bad_signature, never a response body or a URL), uploaded and failed to upload. Every list SHALL hold at most 2,000 entries, newest first, with the true total and a truncation flag kept beside it; the whole record SHALL NOT exceed 512 KB, enforced by the database. The worker SHALL write it before an incremental run's database write and again in the run's final update, so that a worker that dies after the commit loses nothing, and SHALL read the image file lists before the run's temporary directory is removed. A full run SHALL record the same structure from its row comparison and image step. Card names SHALL NOT be stored: the admin API SHALL add each listed card's name, overall, position and card page link from the catalogue when it returns a run, for the ids it lists, in one bounded lookup. The run detail SHALL show a "What was downloaded" section with New cards, Changed cards and the image groups, each showing its count, its first rows and, when truncated, how many are not listed; an empty group SHALL say "None".

#### Scenario: Three new cards
- **WHEN** an incremental run inserts 3 cards and downloads their 6 images
- **THEN** the record lists the 3 card ids and 6 image paths, the run detail names the 3 cards with their overall and a link to each card page, and no card name is stored in the run record.

#### Scenario: More than the cap
- **WHEN** a full run finds 2,500 changed cards
- **THEN** the record lists 2,000 ids, the total reads 2,500, the truncation flag is set, and the run detail says 500 are not listed.

#### Scenario: Failed image
- **WHEN** one image answers 404
- **THEN** its path is listed under failed with the reason http_404 and no response text, and the run still ends ok with the failed count 1.

#### Scenario: Worker dies after the commit
- **WHEN** the worker stops after an incremental run's rows committed and before its final update
- **THEN** the pre-write record is on the run and shows the new and changed cards and the images fetched so far.

#### Scenario: Size limit
- **WHEN** a write would make the record larger than 512 KB
- **THEN** the lists are shortened by the caps first, and the database refuses a record that is still larger.

### Requirement: Opt-In Progress And Result Flags
The dump script SHALL accept `--progress-every N` and print a line `PROGRESS <done>/<total>` (numbers only) every N images in its image step, and the upload script SHALL accept `--progress-every N` likewise and `--results-file <path>` to write one record per file (key and outcome: ok, skipped_exists or an error class) to that path, which the worker places in the run's temporary directory and never in the repository. Without these flags both scripts SHALL behave and print exactly as before. The worker SHALL parse the progress lines from the child's output, SHALL treat any other line as a log line, and the lines SHALL pass through the same redaction as every other child line.

#### Scenario: Defaults unchanged
- **WHEN** either script runs without the new flags
- **THEN** its output and files are byte for byte what the previous version produced for the same input.

#### Scenario: Progress lines parsed
- **WHEN** the dump child prints `PROGRESS 500/1200`
- **THEN** the run's progress reads 500 done of 1200 and the line is kept in the log tail.

#### Scenario: Results file location
- **WHEN** the upload child runs for a run
- **THEN** its results file is inside that run's temporary directory, which is removed with it, and no file appears in the repository tree.

