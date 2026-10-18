import { z } from "zod";
import {
  AI_PLAYING_STYLE_KEYS,
  BASE_STATS,
  CARD_TYPES,
  CONDITIONS,
  FILTER_RANGE_BOUNDS,
  MAX_FILTER_IDS,
  PHYSIQUE_FIELDS,
  POSITIONS,
  SORT_FIELDS,
  SORT_PRESETS,
} from "./constants";

// BigInt-friendly id transformer. SuperJSON handles bigint at the wire layer, but Zod
// parses the request (strings) so we coerce. Bounded to a Postgres int8
// (≤ 9223372036854775807) so an oversized id is a BAD_REQUEST from Zod, never a
// Prisma/Postgres error turned into a 500.
export const INT8_MAX = 9223372036854775807n;
export const bigIntString = z
  .string()
  .regex(/^\d{1,19}$/, "expected numeric id")
  .transform((v) => BigInt(v))
  .refine((v) => v <= INT8_MAX, { message: "id out of range" });

// Postgres int4 bound for integer filters (ids, style ids, foot) — anything larger
// is rejected by Zod instead of blowing up inside the query engine. A number
// or a decimal-digit string (older callers sent query strings) is accepted;
// `z.coerce.number()` alone would turn `null`, `true`, `""` or `[]` into 0 and
// silently filter on id 0 instead of answering 400.
export const INT4_MAX = 2147483647;
const int4 = z
  .union([z.number(), z.string().regex(/^\d{1,10}$/, "expected an integer")])
  .pipe(z.coerce.number().int().min(0).max(INT4_MAX));

// Bounded optional integer for a range edge ([lo, hi] from FILTER_RANGE_BOUNDS).
const edge = ([lo, hi]: readonly [number, number]) => z.coerce.number().int().min(lo).max(hi).optional();
const smallLevel = (max: number) => z.coerce.number().int().min(0).max(max);

// Player filter schema (card type scope, position, styles, ovr ranges, foot,
// nationality, club/league via Team, skills, condition/form/weak foot,
// height/weight/age, stat and body-model ranges) + sort/paging. Every bound is
// int4-safe so an out-of-range value is a 400 from Zod, never a 500.
export const playerListInput = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  // A SORT_FIELDS column (with `order`) or one of the SORT_PRESETS (which fix
  // their own direction — see constants.ts).
  sort: z.enum([...SORT_FIELDS, ...SORT_PRESETS] as unknown as [string, ...string[]]).default("ovr"),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(120).optional(),
  cardType: z.enum(CARD_TYPES).optional(),
  // Card-type scope ("All" = omitted). The /players page sends its visible scope
  // here; the home "Epic & Big Time" quick filter sends ["EPIC"] (Big Time cards
  // are stored under EPIC — see CARD_TYPE_LABELS).
  cardTypeIn: z.array(z.enum(CARD_TYPES)).max(CARD_TYPES.length).optional(),
  // Position / Nation / League / Team accept several values (change
  // multi-select-filters): the values of one list are OR-ed, the lists are
  // AND-ed with every other filter. The single-value fields below stay for
  // older callers; the router merges a single value into its list and
  // de-duplicates, and the merged set must still respect the same bound
  // (POSITIONS.length positions, MAX_FILTER_IDS ids) or the call is a 400.
  position: z.enum(POSITIONS).optional(),
  positions: z.array(z.enum(POSITIONS)).max(POSITIONS.length).optional(),
  nationalityIds: z.array(int4).max(MAX_FILTER_IDS).optional(),
  clubIds: z.array(int4).max(MAX_FILTER_IDS).optional(),
  leagueIds: z.array(int4).max(MAX_FILTER_IDS).optional(),
  // Style id in either slot (efootbase semantics, see PLAYING_STYLE_GROUPS);
  // `defensiveStyle` restricts to the defence slot only.
  playingStyle: int4.optional(),
  defensiveStyle: int4.optional(),
  // AI playing styles — every listed flag must be set.
  aiStyles: z.array(z.enum(AI_PLAYING_STYLE_KEYS as unknown as [string, ...string[]])).max(AI_PLAYING_STYLE_KEYS.length).optional(),
  ovrMin: edge(FILTER_RANGE_BOUNDS.ovr),
  ovrMax: edge(FILTER_RANGE_BOUNDS.ovr),
  maxOvrMin: edge(FILTER_RANGE_BOUNDS.maxOvr),
  maxOvrMax: edge(FILTER_RANGE_BOUNDS.maxOvr),
  // Legacy "at least this weak-foot accuracy" filter; the UI uses the *In lists.
  weakFoot: z.enum(["0", "1", "2", "3"]).optional(),
  strongerFoot: int4.optional(),
  nationalityId: int4.optional(),
  // clubId → Player.teamId; leagueId → Team.leagueId (implemented in the API);
  // the list forms `clubIds` / `leagueIds` / `nationalityIds` are above.
  clubId: int4.optional(),
  leagueId: int4.optional(),
  skillId: int4.optional(),
  // Every listed skill must be present (efootbase's Skills dialog is a
  // multi-toggle). Bounded so the AND chain stays small.
  skillIds: z.array(int4).max(20).optional(),
  conditionIn: z.array(z.enum(CONDITIONS)).max(CONDITIONS.length).optional(),
  formIn: z.array(smallLevel(2)).max(3).optional(),
  weakFootAccuracyIn: z.array(smallLevel(3)).max(4).optional(),
  weakFootUsageIn: z.array(smallLevel(3)).max(4).optional(),
  heightMin: edge(FILTER_RANGE_BOUNDS.height),
  heightMax: edge(FILTER_RANGE_BOUNDS.height),
  weightMin: edge(FILTER_RANGE_BOUNDS.weight),
  weightMax: edge(FILTER_RANGE_BOUNDS.weight),
  ageMin: edge(FILTER_RANGE_BOUNDS.age),
  ageMax: edge(FILTER_RANGE_BOUNDS.age),
  // Stat ranges on the 26 base stats; `statsAtMax` switches them to the
  // `max*` columns (efootbase "Max attribute potential").
  statRanges: z
    .array(z.object({ stat: z.enum(BASE_STATS), min: edge(FILTER_RANGE_BOUNDS.stat), max: edge(FILTER_RANGE_BOUNDS.stat) }))
    .max(BASE_STATS.length)
    .optional(),
  statsAtMax: z.boolean().optional(),
  // Body-model ranges on the 11 physique columns (0–15).
  bodyRanges: z
    .array(z.object({ field: z.enum(PHYSIQUE_FIELDS), min: edge(FILTER_RANGE_BOUNDS.physique), max: edge(FILTER_RANGE_BOUNDS.physique) }))
    .max(PHYSIQUE_FIELDS.length)
    .optional(),
});
export type PlayerListInput = z.infer<typeof playerListInput>;

export const playerByIdInput = z.object({
  // baseId + cardId path params (efootbase-style /players/[baseId]/[cardId])
  baseId: bigIntString,
  cardId: bigIntString,
});

// Name search (home palette, header, compare picker). Queries shorter than 2
// characters after normalisation return an empty list (design decision 6); the
// schema itself still accepts 1 character so a half-typed query is not a 400.
export const playerSearchInput = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Comparison: 1–4 cards. (min 1, not 2: the page renders each card as soon as
// it's picked, before the second card is selected. The stat matrix panel is
// gated client-side on compareData.length >= 2 — schema only needs to accept
// a single pick so the chosen card shows instead of a re-shown Add Player
// placeholder that swallows the next addition. See notes 2026-10-08.)
export const compareInput = z.object({
  cardIds: z.array(bigIntString).min(1).max(4),
});

export const skillListInput = z.object({
  category: z.string().trim().max(64).optional(),
});

export const skillByIdInput = z.object({ slug: z.string().trim().min(1).max(120) });

// Holders of a skill, paginated. A small `limit` (e.g. 4) is the "top cards"
// call used by the skills index; the order is deterministic (ovr DESC, id DESC).
export const skillPlayersInput = z.object({
  slug: z.string().trim().min(1).max(120),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
});

// Featured bundle (efootbase "Latest Packs") by its stable slug — name + release
// date, e.g. `spanish-league-midfielders-2026-10-05`, `spotlight-leo-messi-2027-…`.
export const featuredBySlugInput = z.object({ slug: z.string().trim().min(1).max(200) });

// ---- Auth (email/password; the `auth` router) ----
// The build / community / profile / feed / tier-list inputs that used to follow
// were removed with their routers in change remove-dead-surface.
export const signUpInput = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_]+$/, "username may only contain letters, numbers, and underscores"),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  region: z.string().trim().max(48).optional(),
  country: z.string().trim().max(48).optional(),
});

export const signInInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
