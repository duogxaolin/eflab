import { z } from "zod";
import { CARD_TYPES, POSITIONS, SORT_FIELDS } from "./constants";

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
// is rejected by Zod instead of blowing up inside the query engine.
export const INT4_MAX = 2147483647;
const int4 = z.coerce.number().int().min(0).max(INT4_MAX);

// Player filter schema (card type scope, position, styles, ovr ranges, foot,
// nationality, club/league via Team, skill) + sort/paging.
export const playerListInput = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  sort: z.enum(SORT_FIELDS as unknown as [string, ...string[]]).default("ovr"),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(120).optional(),
  cardType: z.enum(CARD_TYPES).optional(),
  // Card-type scope ("All" = omitted). The /players page sends its visible scope
  // here; the home "Epic & Big Time" quick filter sends ["EPIC"] (Big Time cards
  // are stored under EPIC — see CARD_TYPE_LABELS).
  cardTypeIn: z.array(z.enum(CARD_TYPES)).max(CARD_TYPES.length).optional(),
  position: z.enum(POSITIONS).optional(),
  playingStyle: int4.optional(),
  defensiveStyle: int4.optional(),
  ovrMin: z.coerce.number().int().min(0).max(100).optional(),
  ovrMax: z.coerce.number().int().min(0).max(100).optional(),
  maxOvrMin: z.coerce.number().int().min(0).max(120).optional(),
  maxOvrMax: z.coerce.number().int().min(0).max(120).optional(),
  weakFoot: z.enum(["0", "1", "2", "3"]).optional(),
  strongerFoot: int4.optional(),
  nationalityId: int4.optional(),
  // clubId → Player.teamId; leagueId → Team.leagueId (implemented in the API).
  clubId: int4.optional(),
  leagueId: int4.optional(),
  skillId: int4.optional(),
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
