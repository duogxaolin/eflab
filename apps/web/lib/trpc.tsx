"use client";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { AppRouter } from "@eflab/api";
import { superjson } from "@eflab/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const trpc = createTRPCReact<AppRouter>();

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
      // Forward credentials so the eflab_session cookie set by auth.signUp/signIn
      // round-trips on subsequent requests (cross-origin: API port 4000, web 3000).
      fetch(url, init) {
        return fetch(url, { ...init, credentials: "include" });
      },
    }),
  ];
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({}));
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
