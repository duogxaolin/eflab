// eFootLab sync worker entry point (openspec change admin-sync-worker).
//   pnpm worker:dev    (NODE_ENV=development, tsx watch)
//   pnpm worker:start  (NODE_ENV=production)
// Reads the repo-root .env (tsx --env-file-if-exists=../../.env). One process,
// one run at a time: every 30 s a tick writes the heartbeat, recovers stale
// runs, queues due scheduled runs and executes the oldest queued run (see
// runner.ts). SIGINT / SIGTERM stop the loop; a run in progress has its
// children terminated and ends FAILED "worker stopped".

import { prisma } from "@eflab/db";
import { nextScheduledRuns } from "@eflab/shared";
import { killAllChildren } from "./child.js";
import { loadWorkerEnv } from "./env.js";
import { defaultHandlers } from "./handlers/index.js";
import { WORKER_TICK_MS, tick, type WorkerDeps } from "./runner.js";

const env = loadWorkerEnv();
const shutdown = new AbortController();
const deps: WorkerDeps = { db: prisma, env, handlers: defaultHandlers, shutdown: shutdown.signal };
const log = (line: string) => console.log(`[worker] ${env.redact(line)}`);

let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | null = null;
let stopping = false;

async function logNextRuns(): Promise<void> {
  const cfg = await prisma.syncConfig.findUnique({ where: { id: 1 } });
  if (!cfg) return;
  const runs = await prisma.syncRun.findMany({
    where: { kind: { in: ["INCREMENTAL", "FULL"] } },
    orderBy: { queuedAt: "desc" },
    take: 20,
    select: { kind: true, status: true, queuedAt: true, startedAt: true },
  });
  const next = nextScheduledRuns(cfg, runs, new Date());
  log(
    cfg.enabled
      ? `schedule: next incremental ${next.incremental?.toISOString() ?? "—"}, next full ${next.full?.toISOString() ?? "—"}`
      : "schedule: disabled (manual runs only)",
  );
}

async function loop(): Promise<void> {
  const started = Date.now();
  let executed = false;
  try {
    const r = await tick(deps);
    executed = r.executed !== null;
    if (r.queued.length > 0 || executed) await logNextRuns().catch(() => undefined);
  } catch (e) {
    log(`tick failed: ${(e as Error).message}`);
  }
  // Ticks start every 30 s (the idle heartbeat is never older than that); after
  // a run, look again soon instead — more queued work may be waiting.
  const delay = executed ? 1_000 : Math.max(0, WORKER_TICK_MS - (Date.now() - started));
  if (!stopping) timer = setTimeout(() => (running = loop()), delay);
}

async function stop(sig: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`${sig}: stopping`);
  clearTimeout(timer);
  shutdown.abort(new Error("shutdown"));
  try {
    await running;
  } finally {
    killAllChildren();
    await prisma.$disconnect();
    process.exit(0);
  }
}

process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("exit", () => killAllChildren());

log(
  `started (pid ${process.pid}${env.testMode ? ", TEST MODE" : ""}); source ${env.apiBase}; key ${env.efbaseApiKey ? "set" : "NOT set"}; ` +
    `tick every ${WORKER_TICK_MS / 1000} s`,
);
await logNextRuns().catch((e) => log(`schedule read failed: ${(e as Error).message}`));
// A run still marked RUNNING belongs to an earlier worker that did not stop cleanly: its child
// processes (own process groups) may still be alive. It is failed "worker restarted" once its
// heartbeat is 10 minutes old; until then nothing else runs.
await prisma.syncRun
  .findMany({ where: { status: "RUNNING" }, select: { id: true, kind: true, heartbeatAt: true } })
  .then((rows) => {
    for (const r of rows) {
      log(
        `warning: run ${r.id} (${r.kind}) is still marked RUNNING by an earlier worker (last heartbeat ${r.heartbeatAt?.toISOString() ?? "none"}); ` +
          "its child processes may still be running — check `ps` for efootbase_dump.py / r2_upload.py / seed-efootbase-full.ts and $TMPDIR/eflab-sync-* before relying on the next run",
      );
    }
  })
  .catch((e) => log(`run state read failed: ${(e as Error).message}`));
running = loop();
