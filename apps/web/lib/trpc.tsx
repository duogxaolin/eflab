"use client";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, loggerLink, TRPCClientError } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

/** Retry policy: never retry a client error (4xx — a 404/400 will not get
 *  better by asking again), retry network / 5xx failures twice. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = trpcErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
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

function makeLinks() {
  return [
    loggerLink({
      enabled: (opts) =>
        process.env.NODE_ENV === "development" ||
        (opts.direction === "down" && opts.result instanceof Error),
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
