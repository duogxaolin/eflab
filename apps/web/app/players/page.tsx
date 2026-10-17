import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayersClient } from "./PlayersClient";
import { CardGridSkeleton } from "@/lib/query-state";

export const metadata: Metadata = {
  title: "Players",
  description: "Browse and search the eFootball player database — filter by card type, position, playing style, nationality and OVR.",
};

export default function PlayersPage() {
  return (
    <Suspense fallback={<CardGridSkeleton />}>
      <PlayersClient />
    </Suspense>
  );
}
