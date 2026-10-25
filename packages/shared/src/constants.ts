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

// THE mapping from an efootbase stat name to a BaseStat (openspec
// efootbase-static-data). efootbase names three stats differently (`tackling` =
// ballWinning, `jumping` = jump, `set_piece_taking` = placeKicking) and uses two
// spellings: snake_case in the dump columns and the manager picker pills
// (`lofted_pass`), camelCase in the skill boost effects (`setPieceTaking`). Both
// spellings are listed explicitly; the seeder aborts on a key that is not here
// (never guessed). scripts/verify-seed.py mirrors this table.
export const EFOOTBASE_STAT_MAP: Readonly<Record<string, BaseStat>> = {
  // snake_case — dump columns, manager pills
  offensive_awareness: "offensiveAwareness", ball_control: "ballControl", dribbling: "dribbling",
  tight_possession: "tightPossession", low_pass: "lowPass", lofted_pass: "loftedPass",
  finishing: "finishing", heading: "heading", set_piece_taking: "placeKicking", curl: "curl",
  speed: "speed", acceleration: "acceleration", kicking_power: "kickingPower", jumping: "jump",
  physical_contact: "physicalContact", balance: "balance", stamina: "stamina",
  defensive_awareness: "defensiveAwareness", tackling: "ballWinning",
  defensive_engagement: "defensiveEngagement", aggression: "aggression",
  gk_awareness: "gkAwareness", gk_catching: "gkCatching", gk_parrying: "gkParrying",
  gk_reflexes: "gkReflexes", gk_reach: "gkReach",
  // camelCase — skill effects (only the keys whose spelling differs from snake_case)
  offensiveAwareness: "offensiveAwareness", ballControl: "ballControl",
  tightPossession: "tightPossession", lowPass: "lowPass", loftedPass: "loftedPass",
  setPieceTaking: "placeKicking", kickingPower: "kickingPower",
  physicalContact: "physicalContact", defensiveAwareness: "defensiveAwareness",
  defensiveEngagement: "defensiveEngagement", gkAwareness: "gkAwareness",
  gkCatching: "gkCatching", gkParrying: "gkParrying", gkReflexes: "gkReflexes", gkReach: "gkReach",
};

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
// secondary, 2 = none). The exact overall formula scales every stat by 1 /
// 0.97 / 0.85 for the three levels (ovrModel.ts `OVR_MODEL.scale`).
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

// Two label tables per card type, kept apart so that a display rename never
// changes what the seed accepts (change efootbase-function-parity, design D14,
// owner decision 2026-10-24):
//
// CARD_TYPE_DUMP_LABELS — the label the dump itself declares for the code in
// dump/efootbase/players_meta.json (`card_type.values[code]`). Only the seed and
// the sync worker read it (`buildCardTypeMap` in @eflab/db, the worker's fake
// source); scripts/verify-seed.py keeps its own copy. Two codes have no usable
// meta label and are resolved from the pack names of the cards that carry them
// (the seeder re-validates this on every run; META_LABEL_OVERRIDES in @eflab/db):
//   · code 4 — meta repeats "Legendary", but every code-4 card comes from a 2022
//     club/league "Selection" pack (Piqué, Salah, Mbappé…), and efootbase's own card
//     page labels them "Selection".
//   · code 7 — meta is blank; all 42 cards come from the "Strike Arena" pack.
// "Big Time" and "Show Time" are pack campaigns, not card-type codes: Big Time cards
// are EPIC (code 5) and Show Time cards are HIGHLIGHT (code 6) in the dump, so a
// filter for "Epic - Big Time" is simply the EPIC type; the campaign is only visible
// in `featuredPackId` / the pack name.
export const CARD_TYPE_DUMP_LABELS: Readonly<Record<CardType, string>> = {
  STANDARD: "Standard",
  LEGENDARY: "Legendary",
  TRENDING: "Trending",
  SELECTION: "Selection",
  EPIC: "Epic",
  HIGHLIGHT: "Highlight",
  STRIKE_ARENA: "Strike Arena",
};

// CARD_TYPE_LABELS — what the UI shows for a card type (filter toggles and chips,
// Card Info, page titles, compare, the Overview sentence), so it never shows a raw
// enum name: the names efootbase's own pages display for the code ("Icons" for
// code 1, "Epic - Big Time" for code 5 — survey 2026-10-23, S2 card-type toggles
// and S1 Card Info), the dump labels otherwise. efootbase shows no Strike Arena
// label; eFootLab keeps its own.
export const CARD_TYPE_LABELS: Readonly<Record<CardType, string>> = {
  ...CARD_TYPE_DUMP_LABELS,
  LEGENDARY: "Icons",
  EPIC: "Epic - Big Time",
};

// Order of the card types where they are offered as filter toggles (`/players`
// Card Type): efootbase's toggle order — Standard, Selection, Icons, Trending,
// Highlight, Epic - Big Time — then Strike Arena (efootbase has no toggle for it).
// Only the toggles' order: the URL keeps writing `card=<code>` in code order.
export const CARD_TYPE_FILTER_ORDER: readonly CardType[] = [
  "STANDARD",
  "SELECTION",
  "LEGENDARY",
  "TRENDING",
  "HIGHLIGHT",
  "EPIC",
  "STRIKE_ARENA",
];

// efootbase `card_type` code → CardType. Source of truth for the seeder; the seeder
// additionally asserts that `players_meta.json` still carries the dump labels above
// (CARD_TYPE_DUMP_LABELS) for every code and that pack names agree, so a changed dump
// fails loudly.
export const CARD_TYPE_BY_EFOOTBASE_CODE: Readonly<Record<number, CardType>> = {
  0: "STANDARD",
  1: "LEGENDARY",
  3: "TRENDING",
  4: "SELECTION",
  5: "EPIC",
  6: "HIGHLIGHT",
  7: "STRIKE_ARENA",
};

// Skills are catalogued in packages/db/fixtures/skills.json (89 entries: 84
// public + 5 unreleased, hidden) and served by the `skill` router; there is no
// skill-id constant in code. Group, icon, effects and activation come from the
// static efootbase snapshot (docs/efootbase-static-snapshot.md).

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

// 36 eFootball playing styles, ids 0–35 (attacking + defensive, single enum
// shared by both `playingStyleAttack` and `playingStyleDefense`). eflab seeds
// `playingStyleAttack` from efootbase `playing_style` and `playingStyleDefense`
// from `playing_style_2`. 0 = Basic (no style) for both slots; efootbase shows
// "Basic" for unstyled cards. Ids and names come from efootbase
// `players_meta.json` → `playing_style.values`, except 23, 31, 32 and 34: the
// meta file of the 2026-10 re-dump still has no label for them, so their names
// are efootbase's own English UI strings (`playing_style_<id>`, checked
// 2026-10-19; they also match the other 32 names exactly), cross-checked on the
// cards that carry them — Press Back on forwards (Thuram, Doku, Ngumoha,
// Tierney), Tough Marker on defenders (Romero, Pepe, Bisseck, Luis Henrique),
// Deep Defender on centre-backs (Bastoni, Cubarsí, Stones), Build-up GK on a
// goalkeeper (Suzuki Zion).
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
  23: "Press Back",
  24: "Front Line Pressure",
  25: "Front Line Poacher",
  26: "Attack Outlet",
  27: "All-action Defender",
  28: "Pass Disruptor",
  29: "Covering Role",
  30: "High Line Master",
  31: "Tough Marker",
  32: "Deep Defender",
  33: "Sweeper GK",
  34: "Build-up GK",
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
// that real cards carry (read-only counts on the 2026-10 re-dump, 2026-10-19):
//   attack slot  → ids 1–22, 34 and 35;  defence slot → 7, 8, 9, 16, 17, 23–33.
// Verified on real cards against the capture: Neuer / Courtois / Provedel
// store Attacking GK / Defensive GK in the defence slot, Benjamin André and
// David Bates store The Destroyer there (efootbase shows all of them under
// "Defence"). Anchor Man (8) and Box-to-Box (7) sit in both groups on
// efootbase and in both slots in the dump. The four styles added to the game
// after the first dump arrived with the 2026-10 re-dump and sit in the groups
// efootbase uses: Build-up GK (34, attack slot) under "Attack"; Press Back
// (23), Tough Marker (31) and Deep Defender (32) (defence slot) under
// "Defence" — the new Romero / Doku TRENDING cards carry Tough Marker / Press
// Back, as efootbase showed before the re-dump.
export const PLAYING_STYLE_GROUPS: Readonly<Record<"attack" | "defence", readonly number[]>> = {
  attack: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 34, 35],
  defence: [7, 8, 9, 16, 17, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
};
// Styles efootbase offers that no stored card carries are listed here by name
// (shown disabled, never given an invented id). Empty since the 2026-10
// re-dump: every style efootbase lists has an id and at least one card.
export const PLAYING_STYLES_UNAVAILABLE: Readonly<Record<"attack" | "defence", readonly string[]>> = {
  attack: [],
  defence: [],
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
/** Stars of a Form level (1★–3★) and of a weak-foot level (1★–4★): the
 *  /players filters and every star display (`weakFootStars`). */
export const FORM_STARS = 3;
export const WEAK_FOOT_STARS = 4;

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

// Shortest name query any search runs — the /players search, the ⌘K palette,
// the home search, the compare picker and `player.search`, which answers 400
// below it (change efootbase-function-parity: the reference's server ignores a
// shorter term, survey 2026-10-23 S2 §4 / S3 §1.5). Measured on the folded,
// trimmed text; `player.list` ignores a shorter `q`, as the reference does.
export const SEARCH_MIN_LENGTH = 3;
/** Longest search term `player.search` accepts. */
export const SEARCH_MAX_LENGTH = 100;
/** Longest `q` `player.list` accepts (the /players `search` parameter; a
 *  longer value from a link is cut to this length by the URL reader). */
export const LIST_SEARCH_MAX_LENGTH = 120;
/** Rows per `player.search` page (palette, home list, compare picker). */
export const SEARCH_PAGE_SIZE = 12;
/** Highest `player.search` page (12 × 50 = 600 rows of one term). */
export const SEARCH_MAX_PAGE = 50;

// Sort presets of the players page (change efootbase-function-parity, survey
// 2026-10-23 S2 §2). The keys are efootbase's own URL values; New cards is
// the default and is written as no `sort`. Definitions (all end on the id
// tiebreaker, see `orderByFor` in the API's player router):
//   new      → releaseDate DESC (nulls last), id DESC
//   highest  → maxOvr DESC, id DESC          (max overall rating)
//   lowest   → maxOvr ASC, id ASC
//   top      → only while TOP_RATED (below) is set: ratingCount ≥ minVotes,
//              avgRating DESC, then the measured tiebreak, then id DESC
//              (measured 2026-10-24: ≥ 10 votes, avgRating DESC, id DESC)
// The reference's Trending (a live popularity ranking) is not offered: eFootLab
// holds none. Its old eFootLab value stays readable through LEGACY_SORT_PRESETS.
// A preset ignores `order`; the explicit field sorts (SORT_FIELDS) keep it.

/**
 * Top rated (openspec efootbase-data-refresh-1024, design D7; catalogue-data-refresh
 * "Top Rated Sort"): the reference lists the cards with at least `minVotes`
 * community votes by average rating, descending, then by one tiebreak — the
 * candidates D7 measures: more votes, the higher card id or the higher max
 * overall — then by card id. Offered only when the survey determined K and the
 * tiebreak on two checks; their values are set here (task 6.3).
 */
export interface TopRatedRule {
  /** Smallest `ratingCount` a listed card has (K). */
  minVotes: number;
  /** The order after the average: `votes` = ratingCount DESC, `id` = card id DESC, `maxOvr` = max overall DESC. */
  tiebreak: "votes" | "id" | "maxOvr";
}
/** The measured Top rated rule, or null while it is not determined: then Top
 *  rated is hidden and `sort=top` keeps reading as High to low.
 *  Measured 2026-10-24 (design D7 result: two loads of the reference read
 *  against the dump of the same day): at least **10** votes (Standard 20 and
 *  Selection 6 cards in both loads, the union 26, Icons 18 — 9 and 11 votes
 *  each fail), average DESC (the exact stored value, not rounded), then the
 *  higher card id (98 tied pairs; every other candidate fails). */
export const TOP_RATED = { minVotes: 10, tiebreak: "id" } as TopRatedRule | null;

/** One ORDER BY term of Top rated, all descending (a Prisma `orderBy` entry). */
export type TopRatedOrderTerm =
  | { avgRating: { sort: "desc"; nulls: "last" } }
  | { ratingCount: "desc" }
  | { maxOvr: "desc" }
  | { id: "desc" };
/** Top rated as a query (a Prisma `where` / `orderBy` pair, used by `player.list`):
 *  the cards with `ratingCount ≥ minVotes` and an average, by the average DESC,
 *  the rule's tiebreak and the card id DESC — a total order, so pages never
 *  overlap. */
export interface TopRatedQuery {
  where: { ratingCount: { gte: number }; avgRating: { not: null } };
  orderBy: TopRatedOrderTerm[];
}
export function topRatedQuery(rule: TopRatedRule): TopRatedQuery {
  const tiebreak: TopRatedOrderTerm[] =
    rule.tiebreak === "votes" ? [{ ratingCount: "desc" }] : rule.tiebreak === "maxOvr" ? [{ maxOvr: "desc" }] : [];
  return {
    where: { ratingCount: { gte: rule.minVotes }, avgRating: { not: null } },
    orderBy: [{ avgRating: { sort: "desc", nulls: "last" } }, ...tiebreak, { id: "desc" }],
  };
}

/** Every preset key, Top rated included (its label is needed once it is offered). */
export const ALL_SORT_PRESETS = ["new", "highest", "lowest", "top"] as const;
export type SortPreset = (typeof ALL_SORT_PRESETS)[number];
/** The presets offered under a Top rated rule (`top` only when there is one). */
export function sortPresetsFor(topRated: TopRatedRule | null): readonly SortPreset[] {
  return topRated ? ALL_SORT_PRESETS : ALL_SORT_PRESETS.filter((p) => p !== "top");
}
/** The presets offered now (the sort segment, `player.list`, the URL reader). */
export const SORT_PRESETS: readonly SortPreset[] = sortPresetsFor(TOP_RATED);
export const DEFAULT_SORT_PRESET: SortPreset = "new";
export const SORT_PRESET_LABELS: Readonly<Record<SortPreset, string>> = {
  new: "New cards",
  highest: "High to low",
  lowest: "Low to high",
  top: "Top rated",
};
export const isSortPreset = (s: string): s is SortPreset => (SORT_PRESETS as readonly string[]).includes(s);
/** Former preset values still accepted from old links and clients under a Top
 *  rated rule: `trending` (the old default) reads as New cards; `top` (max overall
 *  descending in eFootLab) reads as High to low while Top rated is not offered —
 *  once it is, `top` is Top rated (the reference's meaning; an intentional change
 *  for old eFootLab links). */
export function legacySortPresetsFor(topRated: TopRatedRule | null): Readonly<Record<string, SortPreset>> {
  return topRated ? { trending: "new" } : { trending: "new", top: "highest" };
}
export const LEGACY_SORT_PRESETS: Readonly<Record<string, SortPreset>> = legacySortPresetsFor(TOP_RATED);
/** A sort value with a legacy preset replaced by its current one; any other value unchanged. */
export function resolveLegacySort<S extends string>(sort: S): S | SortPreset {
  return Object.prototype.hasOwnProperty.call(LEGACY_SORT_PRESETS, sort) ? LEGACY_SORT_PRESETS[sort]! : sort;
}

/**
 * Community Rating filter (openspec efootbase-data-refresh-1024, catalogue-data-refresh
 * "Community Rating Filter"): one slider from COMMUNITY_RATING_MIN ("All", no
 * filter) to COMMUNITY_RATING_MAX; a value N ≥ 2 keeps the cards whose stored
 * average community rating (`Player.avgRating`, from the dump) is at least N,
 * with no minimum number of votes — a card without ratings never matches.
 * `player.list` takes `ratingMin` 2–10; the URL writes `rating=N` (2–10).
 */
export const COMMUNITY_RATING_MIN = 1;
export const COMMUNITY_RATING_MAX = 10;
/** Smallest `ratingMin` / `rating=` that filters (1 = All is the default, omitted). */
export const COMMUNITY_RATING_FILTER_MIN = 2;

// The Nation picker's fixed first nations, in the reference's order (survey
// 2026-10-23 S2 §6: the same ten on 2026-10-20 and 2026-10-23, not by card
// count), matched by the stored Country.name; the other nations follow A–Z.
export const FIXED_FIRST_NATIONS = [
  "England",
  "France",
  "Spain",
  "Brazil",
  "Argentina",
  "Germany",
  "Italy",
  "Netherlands",
  "Portugal",
  "Belgium",
] as const;

// Upper bounds of the new list filters of `player.list` (change
// efootbase-function-parity): several playing styles (OR, either slot), team
// names (OR, merged with the team ids) and skill keys (AND, merged with the
// skill ids).
export const MAX_FILTER_SKILLS = 20;
export const TEAM_NAME_MAX_LENGTH = 100;
/** A stored skill key (`Skill.efbKey`, the dump's flag name): `s_fortress`. */
export const SKILL_KEY_RE = /^s_[a-z0-9_]+$/;
/** Rows of a skill page's "Top cards" after the leader (one card per base player). */
export const SKILL_TOP_CARDS = 12;

// Longest slug each slug input of the API accepts — one bound per slug kind,
// shared by the Zod input and the web pages' path pre-check (`isSkillSlug` /
// `isBundleSlug` in helpers.ts). The pre-check must never accept a slug the
// input refuses: the input's 400 reaches a server page as an API failure (an
// HTTP 500) instead of the 404 an unknown slug deserves.
/** Skill slug, stored or public (`skill.byId`, `skill.players`; /wiki/skills/<slug>, /skills/<slug>). */
export const SKILL_SLUG_MAX_LENGTH = 120;
/** Featured-bundle slug, name + release date (`featured.bySlug`; /packs/<slug>). */
export const BUNDLE_SLUG_MAX_LENGTH = 200;

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
