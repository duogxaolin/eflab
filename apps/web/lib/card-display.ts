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

// Stat colour tier for display — five tiers over the `--color-tier-*` tokens
// (globals.css @theme, the single source): ≥ 100 max (magenta, efootbase's
// colour for trained stats past 99), 90–99 elite, 80–89 high, 70–79 mid,
// < 70 low.
export type StatTier = "max" | "elite" | "high" | "mid" | "low";
export function statTier(value: number): StatTier {
  if (value >= 100) return "max";
  if (value >= 90) return "elite";
  if (value >= 80) return "high";
  if (value >= 70) return "mid";
  return "low";
}
// Literal class strings (Tailwind only generates utilities it can see in source).
const TIER_TEXT_CLASS: Readonly<Record<StatTier, string>> = {
  max: "text-[var(--color-tier-max)]",
  elite: "text-[var(--color-tier-elite)]",
  high: "text-[var(--color-tier-high)]",
  mid: "text-[var(--color-tier-mid)]",
  // Text uses the derived low-tier tone (globals.css `--color-tier-low-text`):
  // the fill colour itself is below 4.5:1 as text on the #272727 rows.
  low: "text-[var(--color-tier-low-text)]",
};
const TIER_BG_CLASS: Readonly<Record<StatTier, string>> = {
  max: "bg-[var(--color-tier-max)]",
  elite: "bg-[var(--color-tier-elite)]",
  high: "bg-[var(--color-tier-high)]",
  mid: "bg-[var(--color-tier-mid)]",
  low: "bg-[var(--color-tier-low)]",
};
export const tierTextClass = (tier: StatTier): string => TIER_TEXT_CLASS[tier];
export const tierBgClass = (tier: StatTier): string => TIER_BG_CLASS[tier];
export function statTierClass(value: number): string {
  return TIER_TEXT_CLASS[statTier(value)];
}

export function statTierBg(value: number): string {
  return TIER_BG_CLASS[statTier(value)];
}

/** Text colour on a tier-coloured pill: black on every tier (efootbase-ui-
 *  redesign — the reference's value pills; black on the red tier #ff2e2e reads
 *  5.68:1, white only 3.70:1). The value is kept as a function so callers do
 *  not hard-code it. */
export function statTierForeground(_value: number): string {
  return "text-black";
}

/** Body-model values run 1–10: 7+ reads as high, 4–6 as mid, 1–3 as low. */
export function physiqueTier(value: number): StatTier {
  if (value >= 7) return "high";
  if (value >= 4) return "mid";
  return "low";
}

// Stat labels that are not a plain camelCase → "Title Case" split (game naming
// differs from the internal key, or the key carries an acronym). The wording
// follows efootbase's player page ("Place Kicking", "Jumping", "Tackling" —
// capture 2026-10-18); the dump keys stay `set_piece_taking` / `jumping` /
// `tackling` → placeKicking / jump / ballWinning.
const STAT_LABEL_OVERRIDES: Partial<Record<BaseStat, string>> = {
  placeKicking: "Place Kicking",
  jump: "Jumping",
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

/** Readable booster label (efootbase-behaviour-parity, "No Information Only
 *  In Title"): built from the booster's stat vector with `statLabel`, never
 *  from the abbreviations in the stored name ("Booster +5 · Dribble,
 *  TightPoss, Speed, Balance"). The generic "Booster +N …" names drop their
 *  name ("+5 · Dribbling, Tight Possession, Speed, Balance"); a named booster
 *  keeps it ("Magical +4 · Dribbling, …"); a booster whose stats rise by
 *  different amounts lists each ("Dribbling +2, Speed +3"). */
export function boosterLabel(name: string, booster: ReadonlyArray<readonly [BaseStat, number]>): string {
  // Stats in the stat grid's order (Attacking, Defending, Strength; others
  // last), not the API's column order: "Dribbling, Tight Possession, Speed,
  // Balance" — the order of the stored name.
  const rank = (s: BaseStat) => {
    const i = STAT_DISPLAY_ORDER.indexOf(s);
    return i === -1 ? STAT_DISPLAY_ORDER.length : i;
  };
  const deltas = [...booster].sort((a, b) => rank(a[0]) - rank(b[0]));
  const values = new Set(deltas.map(([, v]) => v));
  const generic = /^Booster\b/i.test(name.trim());
  // A named booster's own name, without any " · …" stat list it may carry.
  const own = name.split(" · ")[0]!.trim();
  const fmt = (v: number) => (v > 0 ? `+${v}` : String(v));
  if (values.size === 1) {
    const stats = deltas.map(([s]) => statLabel(s)).join(", ");
    return `${generic ? fmt(deltas[0]![1]) : own} · ${stats}`;
  }
  const stats = deltas.map(([s, v]) => `${statLabel(s)} ${fmt(v)}`).join(", ");
  return generic ? stats : `${own} · ${stats}`;
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
/** Every stat in the stat grid's reading order. */
const STAT_DISPLAY_ORDER: readonly BaseStat[] = [...ATTACKING_STATS, ...DEFENDING_STATS, ...STRENGTH_STATS];

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

// Derived body-model float label + efootbase display label, in efootbase's
// "Body Model" order (keys = PlayerCardDTO.bodyMetrics).
export type BodyMetricKey = "legCoverage" | "armCoverage" | "peakJumpHeight" | "torsoCollisionWidth" | "dribbleHeight";
export const BODY_METRIC_ORDER: readonly BodyMetricKey[] = ["legCoverage", "armCoverage", "peakJumpHeight", "torsoCollisionWidth", "dribbleHeight"];
export const DERIVED_LABEL: Readonly<Record<BodyMetricKey, string>> = {
  legCoverage: "Leg Coverage Radius",
  armCoverage: "Arm Coverage Radius",
  peakJumpHeight: "Jump Height",
  torsoCollisionWidth: "Torso Collision",
  dribbleHeight: "Leg Length Height",
};

