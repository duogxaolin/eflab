import type { Metadata } from "next";
import { RunsClient } from "./RunsClient";

export const metadata: Metadata = {
  title: "Run history",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRunsPage() {
  return <RunsClient />;
}
