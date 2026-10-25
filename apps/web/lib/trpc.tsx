"use client";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, loggerLink, TRPCClientError } from "@trpc/client";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { AppRouter } from "@eflab/api";
import { superjson } from "@eflab/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Must not exceed the API's TRPC_MAX_BATCH_SIZE (apps/api/src/server.ts) —
// a larger batch is rejected with a 4xx (design decision 11).
export const TRPC_BATCH_MAX_ITEMS = 10;

export const trpc = createTRPCReact<AppRouter>();

/** HTTP status carried by a tRPC client error, or undefined for network errors. */
export function trpcErrorStatus(error: unknown): number | undefined {
  if (error instanceof TRPCClientError) {
    const status = error.data?.httpStatus;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/** The browser's online state: TanStack Query's online manager (fed by the
 *  `online` / `offline` events) and `navigator.onLine` (a page opened while
 *  offline has fired no event yet). True on the server. */
export function browserOnline(): boolean {
  return onlineManager.isOnline() && (typeof navigator === "undefined" || navigator.onLine !== false);
}

/** Retry policy: never retry a client error (4xx — a 404/400 will not get
 *  better by asking again), retry network / 5xx failures twice — but not
 *  while the browser reports itself offline: the failure is shown at once
 *  (with Retry), and the query runs again by itself on reconnect
 *  (`refetchOnReconnect`, browser QA 2026-10-25 W5). */
export function shouldRetry(failureCount: number, error: unknown, online: boolean = browserOnline()): boolean {
  const status = trpcErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  if (!online) return false;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // "always", not TanStack's default "online": offline, an "online"
        // query PAUSES (fetchStatus "paused") and never fails, so a list sat
        // on "Updating…" with stale cards and no Retry for as long as the
        // network was gone (browser QA 2026-10-25 W5). With "always" the
        // request is made, fails, and the page shows its error state with
        // Retry (site-quality-baseline "Debounced Search and Error States").
        networkMode: "always",
        // Explicit: under "always" TanStack defaults it to false. On the
        // `online` event every stale query refetches — an errored one has no
        // data and always counts as stale — so the error states clear by
        // themselves when the connection is back (the "online" mode's
        // default behaviour, kept).
        refetchOnReconnect: true,
        retry: (failureCount, error) => shouldRetry(failureCount, error),
        // Catalogue data (players, bundles, skills) changes only on a reseed:
        // a minute of freshness avoids refetching the same list when the user
        // tabs away and back, and lets server-provided initialData stand.
        staleTime: 60_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

/** True when the operation's caller aborted it on purpose — a superseded
 *  search page: TanStack Query cancels an in-flight query whose text changed
 *  (components/search/usePlayerSearchPages.ts, change
 *  efootbase-function-parity). The logger receives the operation, `signal`
 *  included, in both directions. Not a failure, so never logged as one. */
function abortedByCaller(opts: object): boolean {
  return (opts as { signal?: AbortSignal | null }).signal?.aborted === true;
}

function makeLinks() {
  return [
    loggerLink({
      enabled: (opts) =>
        !abortedByCaller(opts) &&
        (process.env.NODE_ENV === "development" || (opts.direction === "down" && opts.result instanceof Error)),
    }),
    httpBatchLink({
      url: `${API_URL}/trpc`,
      transformer: superjson,
      maxItems: TRPC_BATCH_MAX_ITEMS,
      // Forward credentials so the eflab_session cookie set by auth.signUp/signIn
      // round-trips on subsequent requests (cross-origin: API port 4000, web 3000).
      fetch(url, init) {
        return fetch(url, { ...init, credentials: "include" });
      },
    }),
  ];
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: makeLinks(),
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
