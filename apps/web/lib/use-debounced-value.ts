"use client";
import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delayMs` (default 250 ms).
 * Search inputs key their query on the debounced value so typing a name sends
 * a handful of requests instead of one per keystroke (site-quality-baseline
 * "Debounced Search"); React Query drops the superseded responses because the
 * query key moves on.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
