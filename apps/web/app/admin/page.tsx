import type { Metadata } from "next";
import { DashboardClient } from "./DashboardClient";

export const metadata: Metadata = {
  title: "Sync dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminDashboardPage() {
  return <DashboardClient />;
}
