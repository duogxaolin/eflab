// Kind → handler table of the worker (pluggable: tests pass their own table to
// `tick` / `executeRun`).

import type { RunHandlers } from "../runner.js";
import { runCheck } from "./check.js";
import { runFull } from "./full.js";
import { runIncremental } from "./incremental.js";

export const defaultHandlers: RunHandlers = {
  CHECK: runCheck,
  INCREMENTAL: runIncremental,
  FULL: runFull,
};
