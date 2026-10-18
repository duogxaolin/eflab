"use client";
import { useEffect, useState, type RefObject } from "react";

// One IntersectionObserver per rootMargin, shared by every card on the page
// (a /packs page renders ~190 cards; one observer each would be wasteful).
const observers = new Map<string, IntersectionObserver>();
const callbacks = new WeakMap<Element, () => void>();

function observerFor(rootMargin: string): IntersectionObserver {
  let obs = observers.get(rootMargin);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = callbacks.get(entry.target);
          if (cb) cb();
        }
      },
      { rootMargin },
    );
    observers.set(rootMargin, obs);
  }
  return obs;
}

/** true once `ref` has come within `rootMargin` of the viewport (sticky — it
 *  never flips back). `eager` (or no IntersectionObserver support) → true at
 *  once. Used to hand an <img> its `src` only when it is about to be seen,
 *  because the browser's own `loading="lazy"` threshold (~1250 px) is far too
 *  generous for a grid of 190 card faces. */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin = "200px", eager = false): boolean {
  const [near, setNear] = useState(eager);

  useEffect(() => {
    if (near) return;
    if (eager) {
      setNear(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const obs = observerFor(rootMargin);
    callbacks.set(el, () => {
      setNear(true);
      obs.unobserve(el);
      callbacks.delete(el);
    });
    obs.observe(el);
    return () => {
      obs.unobserve(el);
      callbacks.delete(el);
    };
  }, [ref, rootMargin, eager, near]);

  return near;
}
