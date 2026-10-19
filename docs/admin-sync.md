# Admin area and sync worker — operations

> Written 2026-10-20 (openspec change `admin-sync-worker`). Describes the code on branch `admin-sync-worker`: `apps/worker`, the `admin` tRPC router, the `/admin` pages, `packages/db/src/{admin-auth,admin-cli,efootbase-map,upsert}.ts` and the sync flags of `scripts/efootbase_dump.py`. Variable **names** only — no value of any secret belongs in this repository (it is public).

## What it is

- **Admin area** — `/admin/login`, `/admin` (dashboard), `/admin/runs`, `/admin/runs/[id]`. Its own accounts (`Admin`, `AdminSession`), separate from the visitor `User` / `Session` / `Account` tables and the `auth` router (both unchanged). Accounts are created only from the command line; the web has no account management.
- **Sync worker** — `apps/worker`, one long-running Node process (TypeScript through `tsx`). Every 30 s it writes a heartbeat, queues what the schedule makes due and executes the oldest queued run, **one run at a time**:
  - **check** — one request to efootbase (`/players?limit=1&sort=time_added&order=desc`), writes no catalogue data;
  - **incremental** — the cards released since the newest card in the database (minus 7 days), their images and any new emblem;
  - **full** — the whole dump, the existing seed, and the images of new and changed cards.
- **Run queue** — the `SyncConfig` row (schedule, "blocked until", worker heartbeat) and the `SyncRun` rows (queue + history: kind, trigger, status, times, statistics, error, a 64 KB log tail). The API only writes queued rows and cancel requests; the worker executes them.

## Architecture: who holds which secret

| Process | Gets | Never gets |
|---|---|---|
| API (`apps/api`) | `DATABASE_URL`, its own variables | — it never **reads** the efootbase key or R2 credentials (see the note below) |
| Web (`apps/web`) | `NEXT_PUBLIC_*` (inlined), `API_INTERNAL_URL` | admin data in HTML (pages are client-rendered behind `admin.me`) |
| Worker (`apps/worker`) | `DATABASE_URL`, `EFBASE_API_KEY`, `R2_*`, `SYNC_*`, `EFOOTBASE_STATIC_DIR` | — |
| dump child (`efootbase_dump.py --key-from-env`) | `EFBASE_API_KEY` in its environment (never an argument, never a file) | database URL, R2 credentials |
| upload child (`r2_upload.py`) | the worker's `R2_*` variables in its environment; started with `--env /dev/null` (the null device), so it reads **no** `.env` file — without that flag the script would load `<repo>/.env` | efootbase key, database URL |
| seed child (full run only) | `DATABASE_URL`, `R2_PUBLIC_BASE`, the four `EFOOTBASE_*` location variables | efootbase key, R2 credentials; it runs without `--env-file` |

Every child also gets a short allow-list from the worker's environment (`PATH`, `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `TZ`) and nothing else. Before a log line, an error or a statistic is stored, the worker masks every configured secret value: the key, every `R2_*` value (so `R2_BUCKET` and `R2_PUBLIC_BASE` also read `[redacted]` in log tails) and the database URL and its password.

**Where the secrets live matters.** The API, the db scripts, `next.config.ts` and the worker all load the same repo-root `.env`. If `EFBASE_API_KEY` and the R2 credentials are in that file — the simple single-host setup, as `.env.example` lays out — they are also present in the API's and the Next server's environment. Those processes never read them, but "only the worker holds them" is then not true. For a strict split:

1. keep `EFBASE_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` out of the root `.env`;
2. put them in a separate file outside the repository, mode `0600` (for example `~/.config/eflab/worker.env`), and give that file to the worker service only (see the service examples);
3. run the scripts by hand with `--env <that file>` (`efootbase_dump.py` and `r2_upload.py` both accept it).

The worker loads the root `.env` with `tsx --env-file-if-exists`. **A variable that is already in the process environment wins over the file**, so values from the service environment are never replaced by the shared file. Neither script child reads a `.env` file: the dump child is started with `--key-from-env`, the upload child with `--env /dev/null` (a worker test checks the argument and that the script then finds no R2 value of its own).

## Requirements on the worker host

- Node ≥ 22 and the repository with `pnpm install` done (the worker runs from source through `tsx`).
- `python3` with **`boto3`** (`pip install boto3`) — `r2_upload.py` needs it. A run that would upload checks `import boto3` and the three R2 credentials **before** its first request, and fails naming what is missing. `SYNC_PYTHON` selects another interpreter (an absolute path is safest under a service manager).
- The local Postgres (`docker compose up -d`) with all migrations applied (`pnpm db:migrate`).
- For full runs: the static efootbase snapshot directory (`skills.json` **and** `skill-icons/`, see `docs/efootbase-static-snapshot.md`) and at least **2 GB free** in the temporary directory (`os.tmpdir()`, i.e. `TMPDIR`, which is also passed to the children).

## Environment variables (names and meaning)

Read by the worker (`apps/worker/src/env.ts`, `efootbase.ts`):

| Name | Meaning |
|---|---|
| `DATABASE_URL` | Postgres. The worker passes it on to one child only: the seed of a full run. |
| `EFBASE_API_KEY` | efootbase API key, used for the check request and handed to the dump child in its environment. Without it every run fails before any request. |
| `EFBASE_API_BASE` | Optional API base (default: the real efootbase API, the same constant as `API_BASE` in `efootbase_dump.py`). Tests point it at the local fake source; in test mode it is required and must be a loopback URL. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Image bucket, handed to the upload child only (`R2_BUCKET` defaults to `efootlab` in `r2_upload.py`). |
| `R2_PUBLIC_BASE` | Public bucket URL, no trailing slash. **Required for a full and an incremental run**, which compare changed card images with the bucket over this URL. The incremental run and the seed also use it to build stored emblem URLs (the seed alone falls back to the dev bucket URL without it). |
| `SYNC_PYTHON` | Python interpreter for the scripts (default `python3`). |
| `SYNC_R2_UPLOAD_CMD` | Optional JSON array (argv, no shell) that replaces `[python, scripts/r2_upload.py]`. Tests use a stand-in that copies files into a temporary directory. In test mode it is required. |
| `EFOOTBASE_STATIC_DIR` | Static snapshot directory the full run's seed reads (default `dump/efootbase/static`; in test mode it is required, with no default). |
| `NODE_ENV`, `SYNC_TEST_MODE` | `NODE_ENV=test` or `SYNC_TEST_MODE=1` = test mode. The source, `R2_PUBLIC_BASE` and the database host must then be loopback, the database name must match `eflab_synctest…`, and the upload must be the stand-in. `worker:start` sets `NODE_ENV=production`, `worker:dev` sets `development`. |
| `TMPDIR` | Where the run directories (`eflab-sync-<runId>-XXXXXX`, mode 0700) are created. |

Read by the admin commands (`packages/db/src/admin-cli.ts`): `DATABASE_URL`, and `ADMIN_PASSWORD` as an alternative to the hidden prompt (see below). **Never store `ADMIN_PASSWORD` in `.env`.** The command loads the root `.env`, and the worker does not mask that value.

Read by the API for the admin area: no new variable. It uses `WEB_ORIGIN` (CORS and the CSRF origin check) and `NODE_ENV` (the cookie's `Secure` flag).

Test-only: `SYNC_TEST_BASE_DATABASE_URL` overrides the database URL the worker tests derive their scratch databases from (default: `DATABASE_URL` of the root `.env`, with only the database name replaced). The smoke test's admin section reads `SMOKE_ADMIN_PORT`, `SMOKE_SKIP_ADMIN` and `SMOKE_REQUIRE_ADMIN` (see `scripts/smoke-test.sh`).

## Admin accounts

```bash
pnpm admin:create <username>         # fails without changing anything if the name exists
pnpm admin:set-password <username>   # also signs out every session of that account
pnpm admin:disable <username>        # disables the account and signs out its sessions
```

- User name: 3–32 characters from `a-z 0-9 _ . -`. Password: at least 12 characters, stored only as `scrypt$N$r$p$salt$hash` (N = 2^15, r = 8, p = 1).
- The password comes from a **hidden prompt** on a terminal (asked twice). That is the recommended way. It is never accepted as a command-line argument.
- `ADMIN_PASSWORD` set and non-empty replaces the prompt, for automation. `ADMIN_PASSWORD=… pnpm admin:create …` typed in an interactive shell ends up in the shell history, so use the prompt by hand.
- The command prints the database name and host it writes to, never the URL. Run it against the database you mean: `DATABASE_URL` from the shell wins over the root `.env`.

## Running the worker

```bash
pnpm worker:dev     # NODE_ENV=development, tsx watch
pnpm worker:start   # NODE_ENV=production
```

Both run in `apps/worker` and load `../../.env`. A service should start the same command (`apps/worker/node_modules/.bin/tsx --env-file-if-exists=../../.env src/main.ts` with `NODE_ENV=production`) **with the working directory `apps/worker`**, because the `.env` path is relative to it. Starting it directly instead of through `pnpm` keeps the stop signal going straight to the worker.

On SIGTERM or SIGINT the worker stops its loop. A run in progress then has its children terminated (SIGTERM, then SIGKILL after 10 s) and ends **FAILED "worker stopped while the run was executing"** — **except the full run's seed**: once started it is never stopped by a cancel, a time limit or a worker stop (second verify W-d), so a stop during the seed step waits until the seed ended (at most 70 min; it normally takes about a minute) and the run then records the seed's real outcome. The examples below therefore allow **75 minutes** to stop. With a shorter stop timeout the service manager kills the worker mid-seed; the seed child may then be killed with it (systemd `KillMode=mixed`) or go on alone, the run is failed "worker restarted" 10 minutes later and the worker warns about it at its next start — the catalogue stays consistent either way (one transaction) and the cards whose images were still to compare were recorded before the seed, so the next full run compares them. Do not stop the worker during a full run unless you mean to fail it.

Service managers start with a minimal `PATH`. `node` and `python3` must be on the `PATH` you give the service, or set `SYNC_PYTHON` to an absolute path. The examples below hold **no secrets**: they read a separate `0600` file outside the repository (replace `/path/to/eflab` and the user).

### systemd (Linux)

```ini
# /etc/systemd/system/eflab-worker.service
[Unit]
Description=eFootLab sync worker
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=eflab
WorkingDirectory=/path/to/eflab/apps/worker
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
# EFBASE_API_KEY, R2_* … — KEY=value lines, owned by the service user, mode 0600, outside the repo
EnvironmentFile=/etc/eflab/worker.env
ExecStart=/path/to/eflab/apps/worker/node_modules/.bin/tsx --env-file-if-exists=../../.env src/main.ts
# SIGTERM to the worker only; it stops its own children (a running seed is waited for, ≤ 70 min). Then a hard stop.
KillMode=mixed
TimeoutStopSec=75min
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

`sudo systemctl daemon-reload && sudo systemctl enable --now eflab-worker`, logs with `journalctl -u eflab-worker -f`.

### launchd (macOS)

`~/Library/LaunchAgents/com.eflab.worker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.eflab.worker</string>
  <key>WorkingDirectory</key><string>/path/to/eflab/apps/worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string><string>-c</string>
    <!-- worker.env: KEY=value lines, mode 0600, outside the repo -->
    <string>set -a; . "$HOME/.config/eflab/worker.env"; set +a; exec ./node_modules/.bin/tsx --env-file-if-exists=../../.env src/main.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key><string>production</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ExitTimeOut</key><integer>4500</integer> <!-- 75 min: a running seed is waited for -->

  <key>StandardOutPath</key><string>/tmp/eflab-worker.log</string>
  <key>StandardErrorPath</key><string>/tmp/eflab-worker.log</string>
</dict>
</plist>
```

`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.eflab.worker.plist`; stop with `launchctl bootout gui/$(id -u)/com.eflab.worker`. Keep secrets out of the plist itself.

### pm2

```js
// ecosystem.config.cjs — keep it outside the repository, without secrets
module.exports = {
  apps: [{
    name: "eflab-worker",
    cwd: "/path/to/eflab/apps/worker",
    script: "node_modules/.bin/tsx",
    args: "--env-file-if-exists=../../.env src/main.ts",
    interpreter: "none",
    env: { NODE_ENV: "production" },
    kill_timeout: 4500000, // 75 min — pm2 sends SIGINT (handled like SIGTERM); a running seed is waited for
    autorestart: true,
    restart_delay: 30000,
  }],
};
```

pm2 passes the environment of the shell that runs `pm2 start` to the process. Load the secret file in that shell (`set -a; . ~/.config/eflab/worker.env; set +a; pm2 start ecosystem.config.cjs`), and use `pm2 restart eflab-worker --update-env` after changing it.

The worker's console shows one line per tick event and run (`[worker] …`). The same text is stored, masked, in each run's log tail on `/admin/runs/[id]`.

## First-run checklist

1. **Back up**: `pg_dump -Fc` of the live database to a file outside the repository (record the path).
2. **Migrate**: `pnpm db:migrate` adds migration `20261019230000_admin_sync_worker` — four tables, three enums, the indexes and the single `SyncConfig` row. No existing table changes. `pnpm db:generate` afterwards.
3. **Create the admin**: `pnpm admin:create <name>` at the hidden prompt.
4. **Start the API and the web**, sign in at `/admin/login`.
5. **Decide about the schedule before the worker's first tick.** It is enabled by default (incremental every 360 min, full on Sunday 03:00 UTC). A first worker with no run history therefore **queues a scheduled incremental run on its first tick**, and a full run instead if it starts inside the full window. To go step by step, untick "enabled" in the dashboard's Schedule form and save first: manual runs still work.
6. **Start the worker** (`pnpm worker:start` or the service). Within 30 s the dashboard shows it online.
7. **Run a check** ("Check API"). Confirm that the run is OK, with the HTTP status, the response time and the newest release time compared with the database. If the run is BLOCKED, wait out the 6 h; never work around it.
8. **Run one incremental sync by hand.** Read its statistics and log tail. When images were uploaded, open a new card on the site.
9. **`pg_dump` again before the first full sync**, then start it ("Full sync…", confirm). It holds the seed's locks for minutes and can take an hour or more.
10. Re-enable the schedule if you turned it off.

## Same-site cookie, origins and proxies

- The admin session cookie `eflab_admin` is `HttpOnly`, `SameSite=Strict`, `Path=/`, and **`Secure` whenever the API's `NODE_ENV` is not `development`** (`pnpm api:dev` = development; `start` / unset = production).
  - A production API must be served over HTTPS. Over plain `http://` on a LAN address the browser drops the cookie: the sign-in answer is accepted, but the next request is a 401 and the page returns to the sign-in form.
- **Web and API must be the same site** — the same registrable domain, for example `eflab.example` and `api.eflab.example`, or `localhost` on two ports. With two different sites the browser never sends a `SameSite=Strict` cookie on the web page's API calls, and the admin area stays on the sign-in page.
- **CSRF guard**: every admin mutation needs the header `x-eflab-admin: 1` (the admin client adds it) and an `Origin` that is exactly one of `WEB_ORIGIN`'s entries (scheme, host and port). `http://localhost:3000` and `http://127.0.0.1:3000` are different origins, and the wrong one is a 403. Point `NEXT_PUBLIC_API_URL` at the API on the same site as the page.
- **Per-address sign-in limit and proxies**: one client address may try 20 times per 15 minutes, keyed on Fastify's `req.ip`, in the API process's memory (reset on restart, not shared between API instances). **`trustProxy` is not set in `apps/api/src/server.ts`, and no variable controls it.**
  - Behind a reverse proxy, every client then has the proxy's address and shares **one** budget. A stranger's 20 attempts lock everyone out for 15 minutes, the owner included.
  - Enabling it is a code change to the `Fastify({ … })` options in `buildServer` (trust exactly your proxy's address or hop count). It is not done in this change.
  - **Never set `trustProxy: true` (or trust any address) while the API is also reachable directly.** Fastify then takes `req.ip` from the client-supplied `X-Forwarded-For` header: anyone who reaches the API port can send a new forged address with every attempt and so bypass the per-address limit completely. Trust only your proxy's own address (or hop count), and make the API port reachable only through that proxy.
  - The per-account lock-out (5 consecutive failures → 15 minutes) applies regardless. Anyone who knows a user name can trigger it.
  - **Known, accepted limitation (sign-in burst oracle):** the answer is always the same generic 401, but a burst of attempts can still tell an existing account from an unknown name — an existing one gets locked (and refuses even its right password for 15 minutes, and its lock-setting attempt pays one durable write), an unknown name never does. Only the owner has accounts, and their names are not secret material; the semantics are kept as they are.
  - **Concurrent attempts** (one batched request or many parallel ones) cannot get around the lock-out: each attempt is counted by one conditional `UPDATE` *before* its password is checked, and a right password is accepted only when, re-read under a row lock, the account is enabled, not locked and the streak — attempts still in flight included — is at most 5. A right password sent together with five wrong ones is therefore refused, and a success never clears a lock. The counter's increment commits asynchronously (`synchronous_commit = off` for that one statement), so a counted wrong password and an unknown, malformed or locked name take the same time — measured equal within 0.1 ms on a scratch database (before: the wrong password was 3.5–4 ms slower). The exception is the attempt that *sets* the lock (the 5th consecutive failure): it pays one synchronous write, once per lock. The trade-off: a Postgres crash can lose the counter increments of its last fraction of a second (the lock itself and the session commit synchronously). To prefer durability, drop the `SET LOCAL synchronous_commit = off` in `admin.signIn`; the wrong-password path is then ~1.7 ms slower than an unknown name again.
- Admin pages and responses: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` and `robots` metadata on every page. They are not linked from the public navigation or a sitemap.

## Schedule (defaults) and queue semantics

- **Defaults** (the migration's row): enabled, incremental every **360 min** (allowed 15–1440), full sync on weekday **0 = Sunday** at **03:00 UTC** (weekday 0–6, hour 0–23). Invalid values are a 400 and a database CHECK constraint backs them. All times are UTC. **The database's TimeZone setting does not matter** (second verify CR1): every stored time is written through typed Prisma queries (or `jsonb_to_recordset(… timestamp(3))`, where Postgres ignores the `Z`), never as a raw `Date` parameter, which Postgres would convert with the session TimeZone — a raw one once stored claim times 4 h early under America/New_York (back-to-back incrementals, a full run re-queued in its own window) and 7 h late under Asia/Ho_Chi_Minh (the schedule stalled). The worker suites run under both zones.
- **Incremental due**: enabled, not blocked, nothing of the sync group queued or running, and the latest incremental **or** full run started at least the interval ago (or none exists). "Started" means `startedAt`, or `queuedAt` for a run cancelled while still queued, so a cancel is not undone on the next tick.
- **Full due**: inside the one-hour window (weekday at `fullHourUtc`:00 UTC) when no full run started since the window opened. A due full run takes the place of a due incremental one. A worker that is offline for the whole hour misses that week's full run; it is not caught up later.
- **Checks** are never scheduled, only queued by hand.
- **Queue rules** (`admin.runs.queue`; the API and the worker both lock the `SyncConfig` row while deciding):
  - **409** when a run of the same group is queued or running — incremental and full share one group, a check only conflicts with another check;
  - **412** (`PRECONDITION_FAILED`) for an incremental or full run while "blocked until" is in the future (the message names the time); a check can still be queued, to test whether the block has lifted.
- **One run at a time** is enforced by the database: the partial unique index `SyncRun_one_running` allows at most one `RUNNING` row, and the worker claims with a conditional `UPDATE … WHERE status = 'QUEUED'`.
- **Cancel** (`admin.runs.cancel`):
  - a queued run becomes CANCELLED at once;
  - a running run gets `cancelRequested`; the worker polls it every 2 s, sends SIGTERM to its children (SIGKILL after 10 s) and marks the run CANCELLED;
  - a finished run is a 409, an unknown id a 404.
- **Time limits**: check 30 s, incremental 30 min, full 6 h. Past the limit the run ends FAILED "time limit … exceeded" (children stopped the same way — except a running seed, below, so a full run can outlast 6 h by the seed's remaining time).
- **A cancel or time limit during a database write**: the incremental run checks the signal before its write transaction, before every statement and as the transaction's last step — a cancel that lands there rolls the write back and the run ends CANCELLED with nothing committed. **The full run's seed, once started, is not stopped** (second verify W-d): a cancel / time limit / worker stop during the seed waits until it ended (at most 70 min — its transaction's own timeout is 60 min); if it committed, the run goes on to see the abort at its next step and ends FAILED "… after the database write had committed (the seed …); then: the images step stopped", never CANCELLED, and the cards whose images were still to compare stay recorded for the next full run. A cancel that lands after the rows committed (between the last check and COMMIT, or after the seed exited 0) is likewise **not** recorded as CANCELLED: the run ends with its real outcome (OK, or FAILED naming the later step that was stopped) and the log tail says the cancel came after the commit. While a write is in flight the worker never releases the run, even when the handler ignores the stop signal: the run stays RUNNING with a fresh heartbeat until the write ended (bounded by the transaction's own timeout + margin, 70 min + margin for the seed), so no second run can start next to it.
- **Blocked**: a 403, a 429 or an HTML challenge (also behind a BOM or whitespace) from **efootbase's own API or image CDN** stops the run at once with no retry. The run ends BLOCKED and "blocked until" is set **6 hours** ahead. Until then nothing is scheduled, and queued incremental or full runs end BLOCKED without a request. The dashboard shows a banner. A block is never bypassed.
- **A third-party image host never blocks the source** (third verify W1): when `pesdb.net` (which serves some `transparent` renders) answers 403 / 429 or a challenge page, only that host's remaining images are skipped for the current run; the run goes on, ends OK, counts them as failed and records their cards as owed (pending) — the next run fetches them again. "blocked until" is not touched.
- **A failed image never stops a run** (W1): an image that cannot be fetched, stored or uploaded is counted ("Images failed") and its card recorded as owed ("Images left to check", `stats.imagesPendingIds`, bounded at 200,000); the rows are written and the run ends OK. Every incremental / full run takes over what the runs since the last completed image step still owe: the incremental run compares those among its own (recent) cards and keeps the rest owed, the full run compares all of them. A failed emblem has no card id; only the next full run repairs it (it compares every emblem with the bucket), not the next incremental run. The owed ids are written to the run row before the database write (incremental) or before the seed (full), so a worker dying after the commit loses none. The dashboard and the run history show "N images failed or skipped · N cards' images left to check" on such an OK run. This replaces the earlier behaviour (an image error failed the run; any image host's refusal blocked the source for 6 h). A manual `efootbase_dump.py` run is affected the same way: a pesdb.net refusal no longer stops it (exit 0, the skipped files listed in `images_failed.txt`).
- **Worker online**: the dashboard shows the worker online while its heartbeat is younger than **2 minutes** (written every 30 s while idle and every 10 s during a run). When offline, it says so and that queued runs wait.

## Recovery when the worker dies

- **Restart it.** On each tick the worker marks every `RUNNING` run whose heartbeat is **10 minutes** old as FAILED "worker restarted", and the queue continues. A run is therefore recovered 10 minutes after its last heartbeat, not at the instant of the restart.
- **The catalogue stays consistent.**
  - The seed (full run) is one transaction, so a run killed during the seed leaves the catalogue as it was.
  - The incremental run uploads images **before** its single database transaction, so a run that died before that transaction left no rows, and the next run sees the same cards as new again.
- **A full run that died or failed after the seed** (in its image step: blocked, cancelled, killed) leaves the catalogue updated without the new or changed images. Before its seed it recorded the ids of every card whose images it must compare (`stats.imagesPendingIds` on the run row; the dashboard shows their number as "Images left to check"), so **the next run compares those cards' images again** (the full run all of them, an incremental run those among its recent cards) although their rows no longer differ, and uploads the changed ones (second verify CR2). Nothing has to be done by hand.
- **After a SIGKILL or a host crash**, the `finally` cleanup did not run (the worker also logs a warning at start for every run still marked RUNNING by an earlier worker):
  - remove leftover run directories (`$TMPDIR/eflab-sync-*`);
  - check that no orphaned `efootbase_dump.py`, `r2_upload.py` or seed process is still running (`ps`).
- A run stuck as `QUEUED` only means no worker is online. Start one, or cancel the run from the dashboard.

## Limits (by design, stated in the dashboard where they matter)

- **Incremental sees only new cards**: it reads newest first by `time_added` back to the newest release in the database minus 7 days. `time_added` does not change on stat edits, so **stat edits to older cards are only picked up by the weekly full run**.
  - It downloads the images of the cards it inserts and of the emblems of the countries, teams and leagues it inserts, and compares the images of the known cards it rewrites (and of owed cards among its rows) with the bucket, downloading only the ones that differ (a verified difference counts as overwritten — the image-version warning applies). It therefore needs `R2_PUBLIC_BASE` and refuses to start without it.
  - It does not create Pack rows: a new card whose featured pack is unknown keeps `featuredPackId` null until a full run.
  - A skill the source dropped from a card it sees again stays linked until a full run.
- **Writes**:
  - the incremental run writes only Player rows (cross-fill columns untouched), their `PlayerSkill` links, referenced boosters, and *missing* Country / Team / League rows;
  - it never deletes and never touches Pack, FeaturedBundle, Skill or Manager;
  - the full run is the existing seed without `--prune` or `--reset-users`.
- **No cross-fill**: neither run runs `pnpm db:crossfill`. New cards have no eFHUB stars, reputation, position ratings or tier badge until the owner runs it by hand.
- **Overwritten card images** stay stale in browser and CDN caches (R2 serves them `immutable` for a year). When a run reports overwritten images (dashboard and run detail), raise `DEFAULT_IMAGE_VERSION` in `apps/web/lib/r2-images.ts` (or set `NEXT_PUBLIC_IMAGE_VERSION`) and **rebuild the web app**. Nothing does this automatically.
- **Changed-image detection and the "overwritten" count** (`--etag-vs-bucket`, both runs; third verify W2): a HEAD on the bucket object (public URL) and on the image host; equal plain-MD5 ETags → unchanged, nothing downloaded. Otherwise the image is downloaded and **its body's MD5 decides**: equal to the bucket object's content-MD5 ETag → dropped (not stored, not counted — this is what happens to pesdb.net renders, whose ETags are not content MD5s, and to weak ETags); different → a **verified overwrite** ("Images overwritten", the only count behind the "raise the image version" warning); the bucket object's ETag not a content MD5 (multipart, weak) or the bucket answer unusable → the replacement is counted as **"Images replaced (unverified)"**, never as overwritten. This relies on R2's ETag of a single-part upload being the content MD5 (S3 semantics; `r2_upload.py` uploads card images single-part) — **not verified against the real bucket**; if it does not hold, replacements show up as "unverified" instead of "overwritten" (more downloads, never a missed change). After a run with unverified replacements, check whether visitors may see stale images and raise the image version if in doubt.
  - An image that changed while its card's row did not is not detected (neither run compares unchanged cards); a manual dump stays the exhaustive path.
- **The r2.dev rate limit.** The public `r2.dev` URL is rate-limited by Cloudflare and meant for development. Both runs send one bucket HEAD per compared card image.
  - A bucket answer other than 200 or 404 (a 429 included) is treated as "unknown": the image is downloaded again and, if stored, counted as "unverified". This inflates the counts but **does not block** the run; only a 403 / 429 / challenge from efootbase's own API or CDN blocks it (a third-party image host only skips its own images).
  - Prefer a custom bucket domain in `R2_PUBLIC_BASE`.
- **Full-run pre-flight**: the run fails, before any request or write, without:
  - `skills.json` and `skill-icons/` in the static snapshot directory — the seed would otherwise erase the skill metadata or clear the icon keys;
  - the key, `DATABASE_URL` or `R2_PUBLIC_BASE`;
  - 2 GB free in the temporary directory;
  - the upload prerequisites (`boto3` and the three R2 credentials).
- **An incremental run refuses to start on an empty catalogue**, or one without release dates (no watermark), or without `R2_PUBLIC_BASE`. Reading everything is the full run's job.
- Politeness: at most 4 concurrent requests (the dump script's defaults), the same request identity as the dump script. A test fails when the worker's copy of the user agent or key header drifts from the script.
- **Source data is not trusted** (image URLs, file names and ids come from efootbase's answers):
  - images are fetched only over https (port 443, no user-info) from allow-listed hosts per image kind — `dynamic` renders and emblems only from `cdn.assets.efootbase.com`, `transparent` renders from that CDN or from `pesdb.net` under `/assets/img/` (efootbase's own `transparent` renders live there: 36,815 of the 50,691 cards of the 2026-10-18 dump, 2,139 of its 2,284 newest); a new host or path at the source makes runs fail naming it until the allow-list (`CDN_BASE` / `PESDB_IMAGE_BASE` / `IMAGE_HOSTS` in `scripts/efootbase_dump.py`, mirrored in `apps/worker/src/efootbase.ts`) is extended;
  - emblem kinds are only nationality / league / team, file names fully match `[A-Za-z0-9][A-Za-z0-9._-]*` (emblems end in `.png`), card ids are positive integers, rows / `card_images` / `emblem_images` / teams.json data of the wrong shape are refused (counted, never a crash);
  - every file the dump script writes is checked to resolve inside its output directory, and nothing below the `--out` directory may be a symbolic link (a directory, the target or its `.part` file; `.part` files are created with `O_EXCL|O_NOFOLLOW`) — the `--out` path itself is resolved once;
  - image bodies are stored only when at most 10 MB (read in chunks) and carrying a PNG / WEBP / JPEG / GIF signature (magic bytes — the Content-Type is never trusted, third verify S1); an HTML body (also behind a UTF-8 BOM or whitespace) is a challenge: from efootbase's CDN it blocks the run like a 403, from a third-party host it skips that host's images (W1); anything else is a failed image, never stored and never counted as overwritten. API answers are bounded to 32 MB, and an API challenge page behind a BOM / whitespace is also a block (S2). All 98,367 images of the 2026-10-18 dump are PNG / WEBP (largest 168 KB);
  - allow-listed URL paths may contain neither `%` nor a `.` / `..` segment (S3; no real URL has either);
  - no request follows a redirect to another scheme, host or port or to a URL with user-info (urllib would otherwise send the `X-API-Key` header along);
  - the worker checks every row's image references (the same rules, on the raw string too, so WHATWG normalisation can never accept what Python refuses) and then runs the script's own checks as a dry `--validate-only` pass — in the full run before the seed, in the incremental run before any image request or write — so nothing the script would refuse can surface after the catalogue was written. The script refuses such entries independently (`imageStats.refused`, listed in `image_errors.log`). The 2026-10-18 dump has 0 such entries (102,992 image URLs identical to the original script's, 0 rows refused by the worker), so legitimate data is handled exactly as before.
  - Tests may add loopback hosts with `--allow-host host:port` (treated as efootbase's own) and `--allow-third-party-host host:port` (treated like pesdb.net: `transparent` only, a refusal skips only it), honoured only with `SYNC_TEST_MODE=1` in the script's environment; the worker passes the latter from `EFBASE_TEST_THIRD_PARTY_BASE` (test mode only, loopback).
- **Secrets in logs**: every configured secret value (key, R2 values, the database URL and its password — also one given as `?password=`) is masked raw, percent-encoded (upper / lower hex, form encoding), JSON-escaped (JavaScript and Python `ensure_ascii` forms, `/` escaped or not) and base64 (standard / url-safe, padded or not, also inside a larger base64 blob). A child's output line longer than 64 K characters is dropped whole and replaced by a marker (never split, so a secret cannot be cut into unmasked halves). Values shorter than 8 characters are not masked (they would corrupt ordinary text), so **a real worker refuses to start with an `EFBASE_API_KEY` shorter than 8 characters**.

## Rollback

Take a `pg_dump` first: the rollback deletes the admin accounts and the whole run history. Then **stop the worker**; a run in progress ends FAILED. Then run, as one transaction:

```sql
BEGIN;
DROP INDEX IF EXISTS "SyncRun_one_running";          -- dropped with its table anyway; explicit for clarity
DROP TABLE IF EXISTS "SyncRun", "SyncConfig", "AdminSession", "Admin";
DROP TYPE IF EXISTS "SyncStatus", "SyncTrigger", "SyncKind";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261019230000_admin_sync_worker';
COMMIT;
```

- Nothing outside these four tables refers to them, so public pages keep working throughout. Admin procedures fail until the code that uses them is removed or the migration is re-applied.
- Deleting the migration row means the next `pnpm db:migrate` **re-creates everything** if the migration folder is still in the deployed code. Remove `packages/db/prisma/migrations/20261019230000_admin_sync_worker/` from that code too, if the rollback is meant to stay.
- **Tested 2026-10-20 on a scratch database only** (`eflab_synctest_rollback`, created and migrated from scratch, then dropped). After the rollback:
  - the 4 tables, 3 enums, `SyncRun_one_running` and the migration row were gone, and the other 15 tables plus `_prisma_migrations` were still there (20 → 16);
  - running it a second time was a no-op;
  - a following `prisma migrate deploy` re-applied the migration cleanly (20 tables, the `SyncConfig` row back).

## Testing

- **No automated test contacts efootbase or the bucket.**
  - The worker tests (`pnpm --filter @eflab/worker test`, part of `pnpm test:unit`) start a local fake efootbase server (`apps/worker/test/harness/fake-efootbase.ts`, 127.0.0.1, ephemeral port). It serves pages, metadata, packs, images and the modes 403, 429, HTML challenge and slow, plus a refusing image CDN.
  - The bucket is a local fake for HEADs (`fake-bucket.ts`), and the upload is a stand-in command (`fake-upload.mjs`).
  - A fetch guard refuses every non-loopback host, and test mode refuses a non-loopback source, bucket base or database.
- **Scratch databases only**: each suite creates, migrates and drops its own — `eflab_synctest_core` (`worker.test.ts`), `eflab_synctest_inc` (`incremental.test.ts`, session TimeZone America/New_York), `eflab_synctest_full` (`full.test.ts`, session TimeZone Asia/Ho_Chi_Minh); `worker.test.ts` also runs the schedule, the claim and the stale-run recovery under both zones.
  - They are created in the local Postgres, with a URL derived from the root `.env`'s `DATABASE_URL` by replacing only the database name. The URL is never printed.
  - The suites skip their database part with a message when Postgres is unreachable.
  - The full-run test runs the real seed as a child against its scratch database.
- **Smoke test**: the admin section of `scripts/smoke-test.sh` starts a second API on port 4301 against a scratch database `eflab_smoke_admin_<pid>` with a throwaway admin, and checks the negative paths: 401 without a session (and with a valid visitor `eflab_session` cookie), 403 without the header or with a foreign origin, identical sign-in failures, the lock-out (also against one batched request of 6 sign-ins and 5 parallel ones), 12-hour idle and 7-day absolute expiry (time moved in the database), sign-in of a disabled account, a lock end that does not move with the database session's time zone (UTC+7 / UTC−4), the admin CLI's refusals (short password, existing name, password as an argument), no secret fields, and `no-store`. It restarts its API between blocks (resetting the in-memory per-address limit, picking up the time-zone setting). It never writes to the live database.
- **Dump script against hostile data**: `apps/worker/test/dump-script.test.ts` (no database) feeds `efootbase_dump.py` path-traversal emblem kinds and file names, a string card id, URLs on another loopback port, `file://`, user-info and a redirect to another host (also one adding user-info), HTML / SVG / text / 30 MB bodies, wrong shapes, symlinked `.part` files and directories, pesdb URLs outside `transparent` `/assets/img/`, an oversized API answer and `--validate-only`, and checks that nothing is written outside the output directory or through a link and the foreign host gets no request.
- Unit tests: `@eflab/shared` covers the schedule, watermark, redaction and log ring buffer, with tamper cases. `@eflab/db` covers password hashing and the shared row mapping.
- One real request is made by hand only, at acceptance: a check with the owner's key, against a scratch database.

## Public bundle

The admin pages are their own client entries and import the shared code by subpath (see the comment at the top of `apps/web/lib/admin-trpc.tsx`). No admin code is duplicated into public pages. Still, splitting the shared chunks adds **about 1 KB gzip to the public pages' First Load JS**. Re-measure the public pages' first-load JS after changing admin imports.
