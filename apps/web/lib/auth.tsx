"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import type { SessionUserDTO } from "@eflab/shared";

interface AuthContextValue {
  // `undefined` while loading, `null` when logged out.
  user: SessionUserDTO | null | undefined;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ user: undefined, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  // tRPC query — uses the underlying fetch with credentials:'include' so the
  // browser sends the eflab_session cookie along.
  const session = trpc.auth.getSession.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnMount: true,
  });
  const utils = trpc.useUtils();

  const signOutMut = trpc.auth.signOut.useMutation({
    onSuccess: async () => { await utils.auth.getSession.invalidate(); },
  });
  const signOut = async () => { await signOutMut.mutateAsync(); };

  // Re-fetch when the tab becomes visible so a logout in another tab reflects here.
  useEffect(() => {
    const handler = () => { void session.refetch(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [session]);

  return (
    <AuthContext.Provider value={{ user: session.data ?? null, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
