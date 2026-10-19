// Child-process helper of the sync worker (openspec change admin-sync-worker,
// design decision 5): argument arrays only (`shell: false`), an explicit minimal
// environment (see `childEnv` in env.ts), line-buffered stdout/stderr where every
// line is redacted BEFORE anyone sees it, and termination by SIGTERM, then
// SIGKILL after a grace period (10 s) when the run is cancelled or hits its
// time limit.
//
// Each child is started in its own process group (`detached: true`) so the
// termination reaches whatever the script itself starts; the group is killed,
// not only the direct child. Live children are tracked so the worker can kill
// them when it exits.

import { spawn, type ChildProcess } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { LineSplitter } from "@eflab/shared";

/** SIGTERM → SIGKILL grace period (design decision 5). */
export const CHILD_KILL_GRACE_MS = 10_000;

export interface RunChildOptions {
  command: string;
  args: readonly string[];
  /** The complete environment of the child (build it with `childEnv`). */
  env: Record<string, string>;
  cwd?: string;
  /** Aborted on cancel / run time limit / worker shutdown → SIGTERM, then SIGKILL. */
  signal: AbortSignal;
  /**
   * false: the signal does NOT stop this child (it still ends by `timeoutMs`) —
   * for a child whose own write transaction must not be killed half-way (the
   * full run's seed: verify finding W-d). A child is never started once the
   * signal fired, abortable or not. Default true.
   */
  abortable?: boolean;
  /** Optional limit for this child alone (in addition to `signal`). */
  timeoutMs?: number;
  killGraceMs?: number;
  /** Applied to every line before `onLine` sees it. */
  redact: (text: string) => string;
  /** Receives complete, redacted lines (CR/LF stripped). */
  onLine: (stream: "stdout" | "stderr", line: string) => void;
}

export interface ChildResult {
  /** Exit code, or null when the child ended by a signal / never started. */
  code: number | null;
  signal: NodeJS.Signals | null;
  /** How it ended: on its own, aborted through `signal`, by `timeoutMs`, or it could not start. */
  ended: "exit" | "aborted" | "timeout" | "spawn-error";
  /** SIGKILL was needed (the child ignored SIGTERM for the grace period). */
  killed: boolean;
  /** Redacted spawn error text (ended = "spawn-error"). */
  error?: string;
  pid?: number;
  durationMs: number;
}

const live = new Set<ChildProcess>();

function killGroup(child: ChildProcess, sig: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, sig); // the whole process group
  } catch {
    try {
      child.kill(sig);
    } catch {
      /* already gone */
    }
  }
}

/** SIGKILL every live child group (worker exit). Synchronous. */
export function killAllChildren(): void {
  for (const c of live) killGroup(c, "SIGKILL");
}

/** Number of children currently running (tests). */
export function liveChildCount(): number {
  return live.size;
}

export function runChild(opts: RunChildOptions): Promise<ChildResult> {
  const t0 = Date.now();
  const grace = opts.killGraceMs ?? CHILD_KILL_GRACE_MS;
  if (opts.signal.aborted) {
    return Promise.resolve({ code: null, signal: null, ended: "aborted", killed: false, durationMs: 0 });
  }
  return new Promise<ChildResult>((resolvePromise) => {
    let child: ChildProcess;
    try {
      child = spawn(opts.command, [...opts.args], {
        shell: false,
        env: opts.env,
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    } catch (e) {
      resolvePromise({ code: null, signal: null, ended: "spawn-error", killed: false, error: opts.redact(String((e as Error).message ?? e)), durationMs: Date.now() - t0 });
      return;
    }
    live.add(child);

    let ended: ChildResult["ended"] = "exit";
    let killed = false;
    let spawnError: string | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let settled = false;

    const terminate = (why: "aborted" | "timeout") => {
      if (ended !== "exit" || child.exitCode !== null || child.signalCode !== null) return;
      ended = why;
      killGroup(child, "SIGTERM");
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          killed = true;
          killGroup(child, "SIGKILL");
        }
      }, grace);
    };
    const onAbort = () => terminate("aborted");
    if (opts.abortable !== false) opts.signal.addEventListener("abort", onAbort, { once: true });
    if (opts.timeoutMs !== undefined) timeoutTimer = setTimeout(() => terminate("timeout"), opts.timeoutMs);

    for (const stream of ["stdout", "stderr"] as const) {
      const src = child[stream];
      if (!src) continue;
      const decoder = new StringDecoder("utf8");
      const splitter = new LineSplitter();
      src.on("data", (chunk: Buffer) => {
        for (const line of splitter.push(decoder.write(chunk))) opts.onLine(stream, opts.redact(line));
      });
      src.on("end", () => {
        for (const line of splitter.push(decoder.end())) opts.onLine(stream, opts.redact(line));
        for (const line of splitter.flush()) opts.onLine(stream, opts.redact(line));
      });
    }

    const finish = (code: number | null, sig: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      live.delete(child);
      opts.signal.removeEventListener("abort", onAbort);
      clearTimeout(killTimer);
      clearTimeout(timeoutTimer);
      resolvePromise({
        code,
        signal: sig,
        ended: spawnError !== undefined ? "spawn-error" : ended,
        killed,
        error: spawnError,
        pid: child.pid,
        durationMs: Date.now() - t0,
      });
    };

    child.on("error", (e) => {
      // ENOENT / EACCES: the process never ran ('close' still follows).
      spawnError = opts.redact(e.message);
      if (child.pid === undefined) finish(null, null);
    });
    // 'close' waits for stdio to end; if a grandchild outside the group keeps a
    // pipe open, settle shortly after 'exit' anyway.
    child.on("exit", (code, sig) => {
      setTimeout(() => finish(code, sig), 2_000).unref();
    });
    child.on("close", (code, sig) => finish(code, sig));
  });
}
