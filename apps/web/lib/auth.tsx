"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import type { SessionUserDTO } from "@eflab/shared";

interface AuthContextValue {
  // `undefined` while loading (or while nothing has asked yet), `null` when logged out.
  user: SessionUserDTO | null | undefined;
  signOut: () => Promise<void>;
  /** Registers a consumer; the session query only runs while at least one
   *  consumer is mounted. Returns the unsubscribe function. */
  subscribe: () => () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: undefined,
  signOut: async () => {},
  subscribe: () => () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Number of mounted `useAuth()` consumers. The catalogue pages have none, so
  // an idle `auth.getSession` request is never sent on their behalf (design
  // decision 16); the query starts the moment a consumer mounts.
  const [consumers, setConsumers] = useState(0);
  const enabled = consumers > 0;

  // tRPC query — uses the underlying fetch with credentials:'include' so the
  // browser sends the eflab_session cookie along.
  const session = trpc.auth.getSession.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  const utils = trpc.useUtils();

  const signOutMut = trpc.auth.signOut.useMutation({
    onSuccess: async () => { await utils.auth.getSession.invalidate(); },
  });
  const signOut = async () => { await signOutMut.mutateAsync(); };

  const subscribe = useCallback(() => {
    setConsumers((n) => n + 1);
    return () => setConsumers((n) => Math.max(0, n - 1));
  }, []);

  // Re-fetch when the tab becomes visible so a logout in another tab reflects
  // here — only while someone is actually showing the session.
  const refetch = session.refetch;
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [enabled, refetch]);

  const user = enabled ? (session.data === undefined ? undefined : session.data ?? null) : undefined;

  return (
    <AuthContext.Provider value={{ user, signOut, subscribe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Pick<AuthContextValue, "user" | "signOut"> {
  const ctx = useContext(AuthContext);
  const { subscribe } = ctx;
  useEffect(() => subscribe(), [subscribe]);
  return { user: ctx.user, signOut: ctx.signOut };
}
