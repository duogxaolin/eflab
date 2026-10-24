"use client";
import type { ReactNode } from "react";

// The root layout's page slot: `<main><PageSlot>{children}</PageSlot></main>`
// in app/layout.tsx. It renders nothing of its own (no element, no Suspense —
// the server HTML is unchanged); it only puts a function-component fiber
// between the host `<main>` and the route content. Do not inline it.
//
// Why (change efootbase-function-parity, design D13, measured 2026-10-24):
// `children` is the root segment's router element, whose `error` prop is
// app/error.tsx — a client module in its own async chunk. When that chunk has
// not run yet as hydration reaches `<main>`, the RSC client hands `<main>` a
// lazy (pending) child and hydration suspends on it. The React that Next
// 15.5.26 vendors (19.2.0-canary-0bdb9206-20250818, unchanged in 15.5.28)
// then *replays* the suspended host fiber without resetting the hydration
// cursor, so `<main>` is compared with its own first child → "Hydration
// failed … server rendered HTML didn't match" (#418) and a client re-render of
// the whole document, on a few % of loads (async-chunk timing). When the
// pending child sits under this component instead, React replays a function
// component, which never touches the cursor. React 19.3 fixes the replay
// (`replayBeginWork` resets the cursor; vendored from Next 16) — this slot can
// go once the web app runs on such a Next.
export function PageSlot({ children }: { children: ReactNode }) {
  return children;
}
