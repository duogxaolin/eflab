import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayersClient } from "./PlayersClient";
import { CardGridSkeleton } from "@/lib/query-state";
import { PLAYERS_GRID, PLAYERS_PAGE_SIZE } from "./players-grid";

export const metadata: Metadata = {
  title: "Players",
  description:
    "Browse and search the eFootball player database — filter by card type, position, playing style, nation, league, team, skills, stats, condition, form and overall rating.",
};

export default function PlayersPage() {
  return (
    <Suspense fallback={<CardGridSkeleton count={PLAYERS_PAGE_SIZE} className={PLAYERS_GRID} />}>
      <PlayersClient />
    </Suspense>
  );
}
