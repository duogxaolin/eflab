"use client";
// Admin tRPC client (openspec change admin-sync-worker, design decision 10).
// Imported only by app/admin/** — the public pages never load it.
//
//   · Its own tRPC instance on its own React context, so it never collides with
//     the public `trpc` client (lib/trpc.tsx) mounted by the root layout.
//   · Every request carries `x-eflab-admin: 1` (the API's CSRF guard requires it
//     on mutations) and `credentials: "include"` (the `eflab_admin` cookie is
//     HttpOnly, SameSite=Strict — web and API must be the same site).
//   · Its own QueryClient per admin page: admin data is never fresh by default
//     (staleTime 0), 4xx answers are not retried, a 401 from any query or
//     mutation sends the admin to /admin/login once; the page's provider and
//     cache unmount with the page, so no admin data stays in memory.
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AppRouter } from "@eflab/api";
import { superjson } from "@eflab/shared/superjson";
import { ADMIN_LOGIN_PATH, loginHref } from "@/lib/admin-paths";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Bundle rule for app/admin/** (measured with a module-level chunk diff of
// `next build`, 2026-10-19): webpack groups shared modules by the set of
// routes using them and first builds the group shared by the most routes; a
// public group left under its 20 kB minimum is then COPIED into every public
// page chunk. Admin code importing a module of the small public group
// {lib/trpc.tsx, lib/card-display.ts, the @eflab/shared barrel} split that
// group and added ~2 kB gzip to every public page. Therefore the admin code:
//   · imports @eflab/shared only by subpath (`/sync`, `/schemas`, `/superjson`)
//     for values — `import type` from the barrel is fine (erased);
//   · never imports lib/trpc.tsx (the helpers below repeat its rules);
//   · uses lucide-react in every admin entry (each page's client tree), and
//     mounts this provider inside the pages, not in app/admin/layout.tsx, so all
//     admin entries share the same library modules.
// Re-measure (public pages' first-load JS) after changing admin imports.

/** Same bound as lib/trpc.tsx TRPC_BATCH_MAX_ITEMS (the API's maxBatchSize). */
const ADMIN_BATCH_MAX_ITEMS = 10;

/** HTTP status carried by a tRPC client error, or undefined for network errors. */
export function trpcErrorStatus(error: unknown): number | undefined {
  if (error instanceof TRPCClientError) {
    const status = error.data?.httpStatus;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

/** Never retry a 4xx; retry network / 5xx failures twice. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = trpcErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AdminTRPCContext = createContext<any>(null);

export const adminTrpc = createTRPCReact<AppRouter>({ context: AdminTRPCContext });

/** The typed server message of a tRPC error ("" for a network failure). */
function serverMessage(error: unknown): string {
  return error instanceof TRPCClientError ? String(error.message ?? "") : "";
}

/** Zod issues the API's error formatter attaches to a 400 (`data.zod`). */
function zodIssues(error: unknown): Array<{ path: string; message: string }> {
  if (!(error instanceof TRPCClientError)) return [];
  const raw = (error.data as { zod?: unknown } | undefined)?.zod;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is { path?: unknown; message?: unknown } => typeof i === "object" && i !== null)
    .map((i) => ({
      path: Array.isArray(i.path) ? i.path.join(".") : "",
      message: typeof i.message === "string" ? i.message : "invalid value",
    }));
}

/**
 * One English sentence for a failed admin request, by HTTP status:
 * 401 session ended, 403 CSRF / origin refusal, 409 already queued or running,
 * 412 blocked (the server's message names the time), 429 rate limit, 400 the
 * invalid fields, 5xx / network generic. The server's typed message is shown
 * as is for the expected 4xx answers (it never carries a secret).
 */
export function adminErrorMessage(error: unknown): string {
  const status = trpcErrorStatus(error);
  const msg = serverMessage(error);
  if (status === undefined) return "The eflab API did not answer — check that it is running, then try again.";
  if (status >= 500) return `The API returned an error (HTTP ${status}). Try again; the API log has the details.`;
  switch (status) {
    case 400: {
      const issues = zodIssues(error);
      return issues.length > 0
        ? `The API rejected the values: ${issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ")}.`
        : `The API rejected the request: ${msg || "invalid input"}.`;
    }
    case 401:
      return "Your admin session has ended — sign in again.";
    case 403:
      return `The API refused the request (403): ${msg || "the admin header or an allowed web origin is missing"}.`;
    case 404:
      return msg || "Not found.";
    case 409:
      return msg ? `${msg}.` : "A run of this kind is already queued or running.";
    case 412:
      return msg ? `${msg}.` : "Sync runs are refused while efootbase blocks our requests.";
    case 429:
      return msg ? `${msg}.` : "Too many attempts — wait a few minutes, then try again.";
    default:
      return msg || `The request was rejected (HTTP ${status}).`;
  }
}

function makeAdminLinks() {
  return [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      transformer: superjson,
      maxItems: ADMIN_BATCH_MAX_ITEMS,
      headers: () => ({ "x-eflab-admin": "1" }),
      fetch(url, init) {
        return fetch(url, { ...init, credentials: "include" });
      },
    }),
  ];
}

export function AdminTRPCProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Read inside the cache callbacks, which are created once.
  const pathRef = useRef(pathname);
  const routerRef = useRef(router);
  useEffect(() => {
    pathRef.current = pathname;
    routerRef.current = router;
  }, [pathname, router]);

  // Redirect once per provider. The cache is NOT cleared here: clearing it
  // while the page's queries are still mounted makes them refetch at once,
  // answer 401 again and loop until the navigation lands. The provider (and
  // with it the whole cache) unmounts when the sign-in page replaces the page.
  const redirecting = useRef(false);
  const [queryClient] = useState(() => {
    const onError = (error: unknown) => {
      if (trpcErrorStatus(error) !== 401 || redirecting.current) return;
      const path = pathRef.current ?? "/admin";
      if (path === ADMIN_LOGIN_PATH) return;
      redirecting.current = true;
      routerRef.current.replace(loginHref(path));
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: { retry: shouldRetry, staleTime: 0, refetchOnWindowFocus: false },
        mutations: { retry: false },
      },
    });
  });
  const [trpcClient] = useState(() => adminTrpc.createClient({ links: makeAdminLinks() }));

  return (
    <adminTrpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </adminTrpc.Provider>
  );
}
