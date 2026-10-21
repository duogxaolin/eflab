"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}
function getServerSnapshot(): boolean {
  // SSR / first client render: assume motion is allowed; the real value is
  // read before any pointer or timer can act.
  return false;
}

/** true when the OS asks for reduced motion. Used by the pack rows: their
 *  previous / next arrows scroll instantly instead of smoothly when it is set
 *  (the rows never scroll by themselves — no auto-advance since change
 *  efootbase-behaviour-parity). The card tile's hover scale handles reduced
 *  motion in CSS. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
