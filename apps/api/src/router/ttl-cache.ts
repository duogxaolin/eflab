// A value loaded on first use and kept in memory for `ttlMs` (change
// efootbase-function-parity: the pack names of the player search and the skill
// leaders, both of which change only when the catalogue is re-seeded or
// synced). Concurrent callers share one load; a failed load is not kept, so
// the next call tries again. Per API process; nothing is persisted.
export function ttlCache<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let cached: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  return () => {
    if (cached && Date.now() - cached.at < ttlMs) return Promise.resolve(cached.value);
    if (!inflight) {
      inflight = load()
        .then((value) => {
          cached = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}
