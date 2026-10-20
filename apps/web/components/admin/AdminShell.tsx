"use client";
// Session gate + frame of the signed-in admin pages (openspec change
// admin-sync-worker, admin-access "Admin Pages Are Private And Usable").
//
// Nothing but a neutral "Checking the admin session…" line renders until
// `admin.me` answers — on the server too (the query never runs there), so the
// HTML of /admin, /admin/runs and /admin/runs/[id] carries no admin data and no
// admin controls. A 401 sends the visitor to /admin/login (the provider's
// cache handler does the redirect; the gate shows "Redirecting…" meanwhile).
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { AdminMeDTO } from "@eflab/shared";
import { LogOut, RotateCcw, ShieldCheck } from "lucide-react";
import { AdminTRPCProvider, adminErrorMessage, adminTrpc, trpcErrorStatus } from "@/lib/admin-trpc";
import { ADMIN_LOGIN_PATH, loginHref } from "@/lib/admin-paths";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/runs", label: "Run history" },
] as const;

function NeutralShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center text-sm text-[var(--color-text-secondary)]" aria-live="polite">
      {children}
    </div>
  );
}

/** Admin tRPC provider + session gate + frame; every signed-in admin page renders inside it. */
export function AdminShell({ children }: { children: (me: AdminMeDTO) => ReactNode }) {
  return (
    <AdminTRPCProvider>
      <AdminGate>{children}</AdminGate>
    </AdminTRPCProvider>
  );
}

function AdminGate({ children }: { children: (me: AdminMeDTO) => ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me =adminTrpc.admin.me.useQuery(undefined, { staleTime: 60_000 });
  const status = me.isError ? trpcErrorStatus(me.error) : undefined;

  // The cache handler redirects on 401; this covers a 401 answered before it was mounted.
  useEffect(() => {
    if (status === 401 && pathname !== ADMIN_LOGIN_PATH) router.replace(loginHref(pathname));
  }, [status, pathname, router]);

  // The sign-in page replaces this page; the provider and its cache unmount with it.
  const signOut = adminTrpc.admin.signOut.useMutation({
    onSettled: () => router.replace(ADMIN_LOGIN_PATH),
  });

  if (me.isPending) return <NeutralShell>Checking the admin session…</NeutralShell>;
  if (status === 401) return <NeutralShell>Redirecting to the sign-in page…</NeutralShell>;
  if (me.data === undefined) {
    return (
      <NeutralShell>
        <div role="alert" className="space-y-3">
          <p>{adminErrorMessage(me.error)}</p>
          <button
            type="button"
            onClick={() => void me.refetch()}
            className="button button--sm button--secondary inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Retry
          </button>
        </div>
      </NeutralShell>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">
            <ShieldCheck className="size-4" aria-hidden />
            Admin
          </span>
          <nav aria-label="Admin" className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const current = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                    current
                      ? "bg-[var(--color-elevated)] text-white"
                      : "text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            Signed in as <span className="font-semibold text-white">{me.data.username}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (!signOut.isPending) signOut.mutate();
            }}
            aria-disabled={signOut.isPending || undefined}
            className="button button--sm button--secondary gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <LogOut className="size-3.5" aria-hidden />
            {signOut.isPending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
      {children(me.data)}
    </div>
  );
}
