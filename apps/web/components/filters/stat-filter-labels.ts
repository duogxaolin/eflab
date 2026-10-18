import { splitCamelCase } from "@/lib/card-display";
import type { BaseStat } from "@eflab/shared";

// Stat groups and labels as the efootbase Stats filter dialog shows them
// (capture 2026-10-18): Attacking / Strength / Defending, "Place Kicking",
// "Jumping", "Tackling". Kept apart from the dialogs so the sidebar can name a
// stat without loading the dialog chunk.
export const STAT_FILTER_GROUPS: ReadonlyArray<{ title: string; stats: readonly BaseStat[] }> = [
  { title: "Attacking", stats: ["offensiveAwareness", "ballControl", "dribbling", "tightPossession", "lowPass", "loftedPass", "finishing", "heading", "placeKicking", "curl"] },
  { title: "Strength", stats: ["speed", "acceleration", "kickingPower", "jump", "physicalContact", "balance", "stamina"] },
  { title: "Defending", stats: ["defensiveAwareness", "ballWinning", "aggression", "defensiveEngagement", "gkAwareness", "gkCatching", "gkParrying", "gkReflexes", "gkReach"] },
];

const STAT_FILTER_LABEL: Partial<Record<BaseStat, string>> = {
  placeKicking: "Place Kicking",
  jump: "Jumping",
  ballWinning: "Tackling",
  gkAwareness: "GK Awareness",
  gkCatching: "GK Catching",
  gkParrying: "GK Parrying",
  gkReflexes: "GK Reflexes",
  gkReach: "GK Reach",
};

export const statFilterLabel = (s: BaseStat): string => STAT_FILTER_LABEL[s] ?? splitCamelCase(s);
