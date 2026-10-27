"use client";
// /admin/login — admin sign-in (openspec change admin-sync-worker,
// admin-access "Admin Sign-In And Session"). Every failure the API answers
// with the one generic message ("Wrong user name or password" — unknown name,
// wrong password, locked and disabled accounts alike); a 429 says the address
// made too many attempts. The form never stores or logs the password.
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LogIn, ShieldCheck } from "lucide-react";
import { AdminTRPCProvider, adminErrorMessage, adminTrpc, trpcErrorStatus } from "@/lib/admin-trpc";

const GENERIC_FAILURE = "Wrong user name or password";

function signInError(error: unknown): string {
  const status = trpcErrorStatus(error);
  if (status === 401) return `${GENERIC_FAILURE}.`;
  if (status === 403) return "The API refused the sign-in: this web address is not one of the API's allowed web origins (WEB_ORIGIN).";
  return adminErrorMessage(error);
}

export function LoginClient({ next }: { next: Route }) {
  return (
    <AdminTRPCProvider>
      <LoginForm next={next} />
    </AdminTRPCProvider>
  );
}

function LoginForm({ next }: { next: Route }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const userId = useId();
  const passId = useId();
  const errorId = useId();

  const signIn = adminTrpc.admin.signIn.useMutation({
    onSuccess: () => {
      setPassword("");
      router.replace(next);
    },
    onError: (e) => {
      setPassword("");
      setError(signInError(e));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (signIn.isPending) return;
    if (username.trim() === "" || password === "") {
      setError("Enter your user name and password.");
      return;
    }
    setError(null);
    signIn.mutate({ username: username.trim(), password });
  };

  const inputClass =
    "h-11 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 text-sm text-white placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40";

  return (
    <div className="mx-auto w-full max-w-sm py-8">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
          <ShieldCheck className="size-5 text-[var(--color-accent)]" aria-hidden />
          Admin sign-in
        </h1>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
          For the site owner. Accounts are created with <code className="font-mono">pnpm admin:create</code>.
        </p>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4" aria-describedby={error ? errorId : undefined}>
          <div className="space-y-1.5">
            <label htmlFor={userId} className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              User name
            </label>
            <input
              id={userId}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={64}
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={passId} className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Password
            </label>
            <input
              id={passId}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={1024}
              required
              className={inputClass}
            />
          </div>
          <div id={errorId} role="alert" aria-live="assertive" className="min-h-0 text-xs text-[var(--color-accent-danger)] empty:hidden">
            {error}
          </div>
          <button
            type="submit"
            aria-disabled={signIn.isPending || undefined}
            className="button button--md w-full gap-2 bg-[var(--color-accent)] font-bold text-[var(--color-accent-foreground)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white aria-disabled:opacity-60"
          >
            <LogIn className="size-4" aria-hidden />
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
