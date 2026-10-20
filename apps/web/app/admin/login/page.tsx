import type { Metadata } from "next";
import { safeAdminNext } from "@/lib/admin-paths";
import { LoginClient } from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <LoginClient next={safeAdminNext(Array.isArray(next) ? next[0] : next)} />;
}
