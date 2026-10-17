// Shared helpers for the web app: card-tier styling, position mapping, stat colors.
import type { CardType, Position, BaseStat, PhysiqueField } from "@eflab/shared";
import {
  POSITIONS,
  PLAYING_STYLES,
  PHYSIQUE_FIELDS,
  CARD_TYPE_LABELS,
} from "@eflab/shared";

// Display label per card type. Single source of truth is `CARD_TYPE_LABELS` in
// @eflab/shared (derived from efootbase's own `players_meta.json`); this alias
// keeps the historical `CARD_TYPE_LABEL` import name working for existing pages.
export const CARD_TYPE_LABEL: Readonly<Record<CardType, string>> = CARD_TYPE_LABELS;

// Card-type accent colour (stripe / badge text / placeholder tint). Keyed by the
// shared `CardType` enum — one token per enum value in globals.css `@theme`.
export const CARD_TYPE_COLOR_VAR: Readonly<Record<CardType, string>> = {
  STANDARD: "var(--color-card-standard)",
  LEGENDARY: "var(--color-card-legendary)",
  TRENDING: "var(--color-card-trending)",
  SELECTION: "var(--color-card-selection)",
  EPIC: "var(--color-card-epic)",
  HIGHLIGHT: "var(--color-card-highlight)",
  STRIKE_ARENA: "var(--color-card-strike-arena)",
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

// Stat labels that are not a plain camelCase → "Title Case" split (game naming
// differs from the internal key, or the key carries an acronym).
const STAT_LABEL_OVERRIDES: Partial<Record<BaseStat, string>> = {
  placeKicking: "Set Piece Taking",
  ballWinning: "Tackling",
  gkAwareness: "GK Awareness",
  gkCatching: "GK Catching",
  gkParrying: "GK Parrying",
  gkReflexes: "GK Reflexes",
  gkReach: "GK Reach",
};

/** Split a camelCase key into capitalised words: "defensiveAwareness" →
 *  "Defensive Awareness", "kickingPower" → "Kicking Power". A leading
 *  upper-case key ("DefensiveAwareness") splits the same way. */
export function splitCamelCase(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function statLabel(key: BaseStat): string {
  return STAT_LABEL_OVERRIDES[key] ?? splitCamelCase(key);
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

// Playing-style id → display name (single shared enum for attack + defence;
// 0 = Basic).
export function playingStyleLabel(id: number | null | undefined): string {
  if (id == null) return "Basic";
  return PLAYING_STYLES[id] ?? "Basic";
}

// eFootball condition letter → human label. A = Top Form, B = Good Form,
// C = Normal, D = Poor Form, E = Inj. Matches efootbase player detail "Condition".
export const CONDITION_LABEL: Record<string, string> = {
  A: "Top Form",
  B: "Good Form",
  C: "Normal",
  D: "Poor Form",
  E: "Inj.",
};
export function conditionLabel(letter: string | null | undefined): string {
  if (!letter) return "—";
  return CONDITION_LABEL[letter.toUpperCase()] ?? letter;
}

// Stronger-foot enum → label (Konami: 0 = Right, 1 = Left, 2 = Both).
export function strongerFootLabel(v: number | null | undefined): string {
  if (v === 1) return "Left";
  if (v === 2) return "Both";
  return "Right";
}

// Physique field → efootbase label (matches the "Body Model" panel on efootbase
// /players/{baseId}/{playerId}). Keyed by the canonical PhysiqueField slug.
export const PHYSIQUE_LABEL: Readonly<Record<PhysiqueField, string>> = {
  neckLength: "Neck Length",
  neckSize: "Neck Size",
  shoulderHeight: "Shoulder Height",
  shoulderWidth: "Shoulder Width",
  chestMeasurement: "Chest Measurement",
  waistSize: "Waist Size",
  armSize: "Arm Size",
  armLength: "Arm Length",
  thighSize: "Thigh Size",
  calfSize: "Calf Size",
  legLength: "Leg Length",
};

// efootbase "Body Model" panel render order (mirrors the verbatim efootbase layout).
export const PHYSIQUE_ORDER: readonly PhysiqueField[] = PHYSIQUE_FIELDS;

// Derived body-model float label + efootbase display label.
export const DERIVED_LABEL: Readonly<Record<string, string>> = {
  legCoverage: "Leg Coverage Radius",
  armCoverage: "Arm Coverage Radius",
  peakJumpHeight: "Jump Height",
  torsoCollisionWidth: "Torso Collision",
  dribbleHeight: "Leg Length Height",
};

