// eFootball domain constants — derived from the efhub SQLite schema (259 cols)
// and the verified field surveys (2026-09-28).

// 26 base stats (value 40–99). camelCase is the internal standardized name;
// provider aliases are noted inline (the seeder maps the dump's keys itself).
export const BASE_STATS = [
  "offensiveAwareness",
  "ballControl",
  "dribbling",
  "tightPossession",
  "lowPass",
  "loftedPass",
  "finishing",
  "heading",
  "placeKicking",
  "curl",
  "speed",
  "acceleration",
  "kickingPower",
  "jump",
  "physicalContact",
  "balance",
  "stamina",
  "defensiveAwareness",
  "ballWinning", // efhub name; pesdb/efootbase call it "tackling"
  "defensiveEngagement",
  "aggression",
  "gkAwareness",
  "gkCatching",
  "gkParrying", // efhub calls it "GKClearing"; pesdb/efootbase "gk_parrying"
  "gkReflexes",
  "gkReach",
] as const;

export type BaseStat = (typeof BASE_STATS)[number];

// 11 physique / body-model fields (PlayerAppearance table).
export const PHYSIQUE_FIELDS = [
  "neckLength",
  "neckSize",
  "shoulderHeight",
  "shoulderWidth",
  "chestMeasurement",
  "waistSize",
  "armSize",
  "armLength",
  "thighSize",
  "calfSize",
  "legLength",
] as const;
export type PhysiqueField = (typeof PHYSIQUE_FIELDS)[number];

// 13 play positions used in the position aptitude / heatmap matrix.
export const POSITIONS = [
  "GK",
  "CB",
  "LB",
  "RB",
  "DMF",
  "CMF",
  "LMF",
  "RMF",
  "AMF",
  "LWF",
  "RWF",
  "SS",
  "CF",
] as const;
export type Position = (typeof POSITIONS)[number];

// Position proficiency of a card at a position, derived from its aptitude code
// (`PlayerCardDTO.positionAptitudes`: 0 = full / registered, 1 = half /
// secondary, 2 = none). The progression engine's overall estimate is fitted at
// full proficiency and applies a fitted penalty for the other two levels
// (ovrWeights.ts `OVR_PROFICIENCY_ADJUST`).
export const POSITION_PROFICIENCIES = ["full", "half", "none"] as const;
export type PositionProficiency = (typeof POSITION_PROFICIENCIES)[number];
export const proficiencyFromAptitude = (aptitude: number | null | undefined): PositionProficiency =>
  aptitude === 0 ? "full" : aptitude === 1 ? "half" : "none";
export const PROFICIENCY_LABELS: Readonly<Record<PositionProficiency, string>> = {
  full: "full",
  half: "half",
  none: "none",
};

// Card types — one value per efootbase `card_type` code, in code order. The Prisma
// `CardType` enum (packages/db/prisma/schema.prisma) mirrors this list exactly.
//   code 0 STANDARD · 1 LEGENDARY · 3 TRENDING · 4 SELECTION · 5 EPIC ·
//   6 HIGHLIGHT · 7 STRIKE_ARENA   (code 2 is unused in the 2026-10 dump)
export const CARD_TYPES = [
  "STANDARD",
  "LEGENDARY",
  "TRENDING",
  "SELECTION",
  "EPIC",
  "HIGHLIGHT",
  "STRIKE_ARENA",
] as const;
export type CardType = (typeof CARD_TYPES)[number];

// Display label per card type — the label efootbase itself declares for the code in
// dump/efootbase/players_meta.json (`card_type.values[code]`), so the UI never shows a
// raw enum name. Two codes have no usable meta label and are resolved from the pack
// names of the cards that carry them (the seeder re-validates this on every run):
//   · code 4 — meta repeats "Legendary", but every code-4 card comes from a 2022
//     club/league "Selection" pack (Piqué, Salah, Mbappé…), and efootbase's own card
//     page labels them "Selection".
//   · code 7 — meta is blank; all 42 cards come from the "Strike Arena" pack.
// "Big Time" and "Show Time" are pack campaigns, not card-type codes: Big Time cards
// are EPIC (code 5) and Show Time cards are HIGHLIGHT (code 6) in the dump, so a
// filter for "Epic & Big Time" is simply the EPIC type; the campaign is only visible
// in `featuredPackId` / the pack name.
export const CARD_TYPE_LABELS: Readonly<Record<CardType, string>> = {
  STANDARD: "Standard",
  LEGENDARY: "Legendary",
  TRENDING: "Trending",
  SELECTION: "Selection",
  EPIC: "Epic",
  HIGHLIGHT: "Highlight",
  STRIKE_ARENA: "Strike Arena",
};

// efootbase `card_type` code → CardType. Source of truth for the seeder; the seeder
// additionally asserts that `players_meta.json` still carries the labels above for
// every code and that pack names agree, so a changed dump fails loudly.
export const CARD_TYPE_BY_EFOOTBASE_CODE: Readonly<Record<number, CardType>> = {
  0: "STANDARD",
  1: "LEGENDARY",
  3: "TRENDING",
  4: "SELECTION",
  5: "EPIC",
  6: "HIGHLIGHT",
  7: "STRIKE_ARENA",
};

// Skills are catalogued in packages/db/fixtures/skills.json (84 entries) and
// served by the `skill` router; there is no skill-id constant in code.

// 10 training categories of the progression engine (player-progression-simulator).
// Recovered from the eFHUB `player export` table: `MAX<stat> − <stat>` equals
// the sum of the group values of the categories that contain the stat, for
// every one of the 26 stats on all 44,103 cards (change `jump-from-gk1`,
// 2026-10-18: Jump sits in Aerial Strength AND Goalkeeper 1, which is what the
// 3,353 goalkeeper cards and the one outfield card with a Goalkeeper 1 value
// — hub PlayerID 179425 — show; no exception remains). Order = the hub's
// `MAX<Group>Group` columns.
export const TRAINING_CATEGORIES = [
  "Shooting",
  "Passing",
  "Dribbling",
  "Dexterity",
  "LowerBody",
  "Aerial",
  "Defending",
  "GK1",
  "GK2",
  "GK3",
] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

// Category → the stats it raises, one stat point each per stat point bought.
// A stat may belong to more than one category (Jump: Aerial Strength and
// Goalkeeper 1) — its lift is the sum of the points bought in each of them.
export const TRAINING_STATS: Readonly<Record<TrainingCategory, readonly BaseStat[]>> = {
  Shooting: ["finishing", "placeKicking", "curl"],
  Passing: ["lowPass", "loftedPass"],
  Dribbling: ["dribbling", "ballControl", "tightPossession"],
  Dexterity: ["offensiveAwareness", "acceleration", "balance"],
  LowerBody: ["kickingPower", "speed", "stamina"],
  Aerial: ["heading", "physicalContact", "jump"],
  Defending: ["defensiveAwareness", "defensiveEngagement", "ballWinning", "aggression"],
  // Goalkeeper 1 raises Jump too: hub MAXJump − Jump = Aerial + GK1 on every
  // card (goalkeepers buy most of their Jump here).
  GK1: ["gkAwareness", "jump"],
  // eFHUB calls the second GK2 stat GKClearing — it is efootbase's gk_parrying,
  // i.e. the `gkParrying` BaseStat (see the alias note on BASE_STATS).
  GK2: ["gkParrying", "gkReach"],
  GK3: ["gkCatching", "gkReflexes"],
};

// Display labels (efootbase progression sheet wording).
export const TRAINING_CATEGORY_LABELS: Readonly<Record<TrainingCategory, string>> = {
  Shooting: "Shooting",
  Passing: "Passing",
  Dribbling: "Dribbling",
  Dexterity: "Dexterity",
  LowerBody: "Lower Body",
  Aerial: "Aerial",
  Defending: "Defending",
  GK1: "GK 1",
  GK2: "GK 2",
  GK3: "GK 3",
};

// 32 eFootball playing styles (attacking + defensive, single enum shared by both
// `playingStyleAttack` and `playingStyleDefense`). Numeric IDs from efootbase
// `players_meta.json` → `playing_style.values`. eflab seeds `playingStyleAttack`
// from efootbase `playing_style` and `playingStyleDefense` from `playing_style_2`.
// 0 = Basic (no style) for both slots; efootbase shows "Basic" for unstyled cards.
export const PLAYING_STYLES: Readonly<Record<number, string>> = {
  0: "Basic",
  1: "Goal Poacher",
  2: "Dummy Runner",
  3: "Fox in the Box",
  4: "Prolific Winger",
  5: "Classic No. 10",
  6: "Hole Player",
  7: "Box-to-Box",
  8: "Anchor Man",
  9: "The Destroyer",
  10: "Extra Frontman",
  11: "Attacking Full-back",
  12: "Defensive Full-back",
  13: "Deep-Lying Forward",
  14: "Creative Playmaker",
  15: "Build Up",
  16: "Attacking GK",
  17: "Defensive GK",
  18: "Roaming Flank",
  19: "Cross Specialist",
  20: "Orchestrator",
  21: "Full-back Finisher",
  22: "Target Man",
  24: "Front Line Pressure",
  25: "Front Line Poacher",
  26: "Attack Outlet",
  27: "All-action Defender",
  28: "Pass Disruptor",
  29: "Covering Role",
  30: "High Line Master",
  33: "Sweeper GK",
  35: "High Line GK",
};

/** Resolve a playing-style id to its display name, defaulting to "Basic". */
export function playingStyleName(id: number | null | undefined): string {
  if (id == null) return "Basic";
  return PLAYING_STYLES[id] ?? "Basic";
}

// Playing-style filter groups (efootbase-parity-round2, capture of efootbase
// /players → "Playing Style" dialog, 2026-10-18). efootbase groups the styles
// by *style*, not by the slot a card stores it in, and filters with one
// `playingStyle=<id>` parameter — so the API matches a style in either slot
// (`playingStyleAttack` OR `playingStyleDefense`). The groups list only ids
// that real cards in the 2026-10 dump carry (read-only counts, 2026-10-18):
//   attack slot  → ids 1–22 and 35;  defence slot → 7, 8, 9, 16, 17, 24–30, 33.
// Verified on real cards against the capture: Neuer / Courtois / Provedel
// store Attacking GK / Defensive GK in the defence slot, Benjamin André and
// David Bates store The Destroyer there (efootbase shows all of them under
// "Defence"). Anchor Man (8) and Box-to-Box (7) sit in both groups on
// efootbase and in both slots in the dump.
// Styles efootbase offers that no card in the database carries (they appeared
// after the dump was taken: Romero's cards still carry The Destroyer where
// efootbase now shows Tough Marker, Doku's defence slot is Basic where
// efootbase shows Press Back) are listed by name only — no ids are invented.
export const PLAYING_STYLE_GROUPS: Readonly<Record<"attack" | "defence", readonly number[]>> = {
  attack: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 35],
  defence: [7, 8, 9, 16, 17, 24, 25, 26, 27, 28, 29, 30, 33],
};
export const PLAYING_STYLES_UNAVAILABLE: Readonly<Record<"attack" | "defence", readonly string[]>> = {
  attack: ["Build-up GK"],
  defence: ["Deep Defender", "Press Back", "Tough Marker"],
};

// AI playing styles (efootbase "AI Playing Styles" group) → the boolean flag
// columns of Player. efootbase also lists "Long Ranger", which has no column
// in the dump and is therefore not offered.
export const AI_PLAYING_STYLES = [
  { key: "earlyCross", label: "Early Crosser" },
  { key: "incisiveRun", label: "Incisive Run" },
  { key: "longBallExpert", label: "Long Ball Expert" },
  { key: "mazingRun", label: "Mazing Run" },
  { key: "speedingBullet", label: "Speeding Bullet" },
  { key: "trickster", label: "Trickster" },
] as const;
export type AiPlayingStyleKey = (typeof AI_PLAYING_STYLES)[number]["key"];
export const AI_PLAYING_STYLE_KEYS = AI_PLAYING_STYLES.map((s) => s.key) as readonly AiPlayingStyleKey[];

// ---- Player filter vocabularies (efootbase /players sidebar) ----
// Condition letters as stored (dump `condition` → [E,D,C,B,A]); the filter
// shows them worst → best with efootbase's aria labels.
export const CONDITIONS = ["E", "D", "C", "B", "A"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_FILTER_LABELS: Readonly<Record<Condition, string>> = {
  E: "Slump Form",
  D: "Poor Form",
  C: "Normal Form",
  B: "Good Form",
  A: "Peak Form",
};
// Form 0..2 (dump meta: Inconsistent / Standard / Unwavering) — efootbase
// filters it as 1–3 stars, i.e. stars = value + 1.
export const FORM_LABELS = ["Inconsistent", "Standard", "Unwavering"] as const;
// Weak-foot usage / accuracy 0..3 (dump meta) — efootbase filters them as
// 1–4 stars (stars = value + 1).
export const WEAK_FOOT_USAGE_LABELS = ["Almost Never", "Rarely", "Occasionally", "Regularly"] as const;
export const WEAK_FOOT_ACCURACY_LABELS = ["Low", "Medium", "High", "Very High"] as const;

// Range bounds accepted by the list filters (Zod + UI). Wider than the data
// (height 155–206, weight 41–113, age 15–50, stats 40–105, body 0–14 in the
// 2026-10 dump) so a future dump never trips a 400; efootbase's sliders use
// 100–220 / 30–120 / 16–100 / 40–120 / 0–15.
export const FILTER_RANGE_BOUNDS = {
  ovr: [0, 100],
  maxOvr: [0, 120],
  height: [100, 250],
  weight: [30, 150],
  age: [10, 100],
  stat: [0, 200],
  physique: [0, 15],
} as const satisfies Record<string, readonly [number, number]>;

// Upper bound of the id lists of the multi-valued Nation / League / Team
// filters (change multi-select-filters): the OR stays an `IN (…)` of at most
// 50 ids; Position is bounded by the 13-entry catalogue (POSITIONS.length).
// Shared by the Zod input, the router's merge of list + single-value fields
// and the URL helper of the web.
export const MAX_FILTER_IDS = 50;

// Sort presets of the players page (efootbase "Sort by" radio group:
// Trending · New cards · Top rated · High to low · Low to high). The keys are
// efootbase's own URL values where they were observed (`sort=top`,
// `sort=highest`, `sort=new`; Trending = parameter absent); `lowest` is our
// name for the unobserved fifth value. Definitions (all end on the id
// tiebreaker, see `orderByFor` in the API's player router):
//   trending → releaseDate DESC (nulls last), maxOvr DESC, id DESC
//              (the strongest cards of the newest release first — efootbase's
//              real "Trending" mixes community signals we do not hold)
//   new      → releaseDate DESC (nulls last), id DESC
//   top      → maxOvr DESC, id DESC          (max overall rating)
//   highest  → ovr DESC, id DESC             (base overall rating)
//   lowest   → ovr ASC, id ASC
// A preset ignores `order`; the explicit field sorts (SORT_FIELDS) keep it.
export const SORT_PRESETS = ["trending", "new", "top", "highest", "lowest"] as const;
export type SortPreset = (typeof SORT_PRESETS)[number];
export const DEFAULT_SORT_PRESET: SortPreset = "trending";
export const SORT_PRESET_LABELS: Readonly<Record<SortPreset, string>> = {
  trending: "Trending",
  new: "New cards",
  top: "Top rated",
  highest: "High to low",
  lowest: "Low to high",
};
export const isSortPreset = (s: string): s is SortPreset => (SORT_PRESETS as readonly string[]).includes(s);

// efootbase playing-style id → short description (from efootbase player detail page).
// Used on the player detail page tactical box. Keys without a known description are
// omitted (the UI falls back to just the style name). Sourced from efootbase
// /players/{baseId}/{playerId} verbatim 2026-10-08.
export const PLAYING_STYLE_DESCRIPTIONS: Partial<Record<string, string>> = {
  "Classic No. 10":
    "A traditional playmaker who operates near the penalty area, creating and finishing chances, while conserving stamina by avoiding unnecessary sprints.",
  "Goal Poacher":
    "A predatory striker who lurks in the penalty area, pouncing on any loose ball to score.",
  "Dummy Runner":
    "A forward who draws defenders away with intelligent off-the-ball runs to create space for teammates.",
  "Fox in the Box":
    "A penalty-box predator who waits inside the area for the slightest sniff of goal.",
  "Prolific Winger":
    "A wide attacker who uses pace and dribbling to beat defenders and deliver crosses or cut inside to shoot.",
  "Hole Player":
    "An attacking midfielder who drifts into pockets of space between the lines to receive and create.",
  "Box-to-Box":
    "A tireless midfielder who contributes at both ends of the pitch, supporting attacks and tracking back to defend.",
  "Anchor Man":
    "A defensive midfielder who shields the backline and stays deep to break up opposition attacks.",
  "The Destroyer":
    "An aggressive ball-winner who hunts the ball and breaks up play with tough tackling.",
  "Extra Frontman":
    "A defender who ventures forward to add weight to attacks, almost becoming an extra striker.",
  "Attacking Full-back":
    "A full-back who bombs forward to support the attack, overlapping and delivering crosses.",
  "Defensive Full-back":
    "A conservative full-back who prioritises defensive duties and rarely ventures forward.",
  "Deep-Lying Forward":
    "A forward who drops deep to link play, drawing defenders out and creating space for teammates.",
  "Creative Playmaker":
    "A vision-driven player who exploits openings in the defence to launch attacks and provide decisive passes.",
  "Build Up":
    "A defender or midfielder who orchestrates play from deep, distributing the ball to start attacks.",
  "Roaming Flank":
    "A wide player who drifts across the pitch to find space and influence play in multiple zones.",
  "Cross Specialist":
    "A wide player who specialises in delivering accurate crosses into the box.",
  "Orchestrator":
    "A deep-lying playmaker who controls the tempo and dictates play from midfield.",
  "Full-back Finisher":
    "A full-back who makes attacking runs inside to get into scoring positions.",
  "Target Man":
    "A tall, physical striker who holds up the ball and wins aerial duels to bring others into play.",
  "Front Line Pressure":
    "A forward who presses the opposition backline to force turnovers high up the pitch.",
  "Attack Outlet":
    "A player who provides a reliable outlet for forward passes, holding up play and bringing others in.",
  "All-action Defender":
    "A defender who contributes across the pitch, defending solidly and joining the attack when possible.",
  "Pass Disruptor":
    "Defends by actively blocking the opponent's passing lanes.",
  "Covering Role":
    "A defender who provides cover for teammates, sweeping up behind the defensive line.",
  "High Line Master":
    "A defender who plays a high line, pushing the defensive line up to compress play.",
  "Sweeper GK":
    "A goalkeeper who sweeps up behind the defensive line, acting as a last-man defender.",
  "High Line GK":
    "A goalkeeper who plays a high line, ready to sweep up behind a pushed-up defence.",
  "Attacking GK":
    "A goalkeeper who is proactive in starting attacks with quick distribution.",
  "Defensive GK":
    "A conservative goalkeeper who prioritises shot-stopping and staying on the line.",
  "Front Line Poacher":
    "A forward who poaches goals by lurking on the edge of the defensive line.",
};

// Sort fields exposed to the directory. Every entry is backed by a real Player
// column (see packages/db/prisma/schema.prisma and `orderByFor` in the API's
// player router). The pesdb-style sorts that had no column behind them
// (squadNumber, nationalShirtNumber, sumOfAbilities, averageAbility, legCoverage,
// armCoverage, peakJumpHeight, torsoCollisionWidth, club) were removed in
// eflab-parity-fixes rather than silently falling back to OVR. `playerValue`
// stays because `Player.marketValue` now carries the dump's `player_value`.
//   releaseDate / recentlyAdded → releaseDate · playerId → id · name/namePrint →
//   name · japName · chineseName · nationality → nationalityId · ovr · maxOvr ·
//   age · height · weight · maxLevel → levelCap · playerValue → marketValue ·
//   26 base stats · 26 max stats · 13 per-position ratings (ratingGk … ratingCf).
export type SortField =
  | "recentlyAdded"
  | "releaseDate"
  | "playerId"
  | "name"
  | "namePrint"
  | "japName"
  | "chineseName"
  | "nationality"
  | "ovr"
  | "maxOvr"
  | "age"
  | "height"
  | "weight"
  | "maxLevel"
  | "playerValue"
  | BaseStat
  | `max${Capitalize<BaseStat>}`
  | `rating${Capitalize<Lowercase<Position>>}`;

export const SORT_FIELDS: readonly SortField[] = [
  "releaseDate",
  "recentlyAdded",
  "playerId",
  "name",
  "namePrint",
  "japName",
  "chineseName",
  "nationality",
  "ovr",
  "maxOvr",
  "age",
  "height",
  "weight",
  "maxLevel",
  "playerValue",
  ...BASE_STATS,
  ...BASE_STATS.map((s) => `max${(s[0] ?? "o").toUpperCase()}${s.slice(1)}` as `max${Capitalize<BaseStat>}`),
  ...POSITIONS.map((p) => `rating${p[0]}${p.slice(1).toLowerCase()}` as `rating${Capitalize<Lowercase<Position>>}`),
];

// Helper for type-level capitalize.
type Capitalize<S extends string> = S extends `${infer H}${infer T}`
  ? `${Uppercase<H>}${T}`
  : S;
