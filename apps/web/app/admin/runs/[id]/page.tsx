import type { Metadata } from "next";
import { RunDetailClient } from "./RunDetailClient";

export const metadata: Metadata = {
  title: "Run",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Only the shape of the id is checked here; whether the run exists is asked
  // by the client after the session check (no admin data in the HTML).
  const n = /^[1-9]\d{0,9}$/.test(id) ? Number(id) : Number.NaN;
  return <RunDetailClient id={Number.isSafeInteger(n) && n <= 2_147_483_647 ? n : null} rawId={id.slice(0, 32)} />;
}
