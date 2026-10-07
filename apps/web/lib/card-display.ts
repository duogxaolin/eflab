// Shared helpers for the web app: card-tier styling, position mapping, stat colors.
import type { CardType, Position, BaseStat } from "@eflab/shared";
import { POSITIONS } from "@eflab/shared";
export const CARD_TYPE_LABEL: Record<CardType, string> = {
  STANDARD: "Standard",
  TRENDING: "Trending",
  EPIC: "Epic",
  BIG_TIME: "Big Time",
  HIGHLIGHT: "Highlight",
  SHOW_TIME: "Show Time",
  STRIKE_ARENA: "Strike Arena",
  LEGENDARY: "Legendary",
};

export const CARD_TYPE_COLOR_VAR: Record<CardType, string> = {
  STANDARD: "var(--color-card-standard)",
  TRENDING: "var(--color-card-trending)",
  EPIC: "var(--color-card-epic)",
  BIG_TIME: "var(--color-card-big-time)",
  HIGHLIGHT: "var(--color-card-highlight)",
  SHOW_TIME: "var(--color-card-show-time)",
  STRIKE_ARENA: "var(--color-card-strike-arena)",
  LEGENDARY: "var(--color-card-legendary)",
};

// Konami registered-position index → POSITIONS.
export const POSITION_BY_INDEX: readonly Position[] = POSITIONS;

export const POSITION_LABEL: Record<Position, string> = {
  GK: "GK", CB: "CB", LB: "LB", RB: "RB", DMF: "DMF", CMF: "CMF",
  LMF: "LMF", RMF: "RMF", AMF: "AMF", LWF: "LWF", RWF: "RWF", SS: "SS", CF: "CF",
};

export function positionOf(idx: number): Position | "—" {
  if (idx < 0 || idx >= POSITION_BY_INDEX.length) return "—";
  return POSITION_BY_INDEX[idx]!;
}

// Stat color tier for display.
export function statTierClass(value: number): string {
  if (value >= 90) return "text-[var(--color-tier-elite)]";
  if (value >= 80) return "text-[var(--color-tier-high)]";
  if (value >= 70) return "text-[var(--color-tier-mid)]";
  return "text-[var(--color-tier-low)]";
}

export function statTierBg(value: number): string {
  if (value >= 90) return "bg-[var(--color-tier-elite)]";
  if (value >= 80) return "bg-[var(--color-tier-high)]";
  if (value >= 70) return "bg-[var(--color-tier-mid)]";
  return "bg-[var(--color-tier-low)]";
}

export function statLabel(key: BaseStat): string {
  const map: Partial<Record<BaseStat, string>> = {
    offensiveAwareness: "Offensive Awareness",
    ballControl: "Ball Control",
    tightPossession: "Tight Possession",
    lowPass: "Low Pass",
    loftedPass: "Lofted Pass",
    placeKicking: "Set Piece Taking",
    gkAwareness: "GK Awareness",
    gkCatching: "GK Catching",
    gkParrying: "GK Parrying",
    gkReflexes: "GK Reflexes",
    gkReach: "GK Reach",
    ballWinning: "Tackling",
    defensiveEngagement: "Defensive Engagement",
  };
  return map[key] ?? (key[0] ? key[0].toUpperCase() + key.slice(1) : key);
}

// Map BASE_STATS to rows.
export const ATTACKING_STATS: BaseStat[] = [
  "offensiveAwareness","ballControl","dribbling","tightPossession",
  "lowPass","loftedPass","finishing","heading","placeKicking","curl",
];
export const DEFENDING_STATS: BaseStat[] = [
  "defensiveAwareness","ballWinning","defensiveEngagement","aggression",
  "gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach",
];
export const STRENGTH_STATS: BaseStat[] = [
  "speed","acceleration","kickingPower","jump","physicalContact","balance","stamina",
];

// Position aptitude: 0=full, 1=partial, 2=none.
export type Aptitude = 0 | 1 | 2;
