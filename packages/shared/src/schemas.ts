import { z } from "zod";
import {
  AI_PLAYING_STYLE_KEYS,
  BASE_STATS,
  BUNDLE_SLUG_MAX_LENGTH,
  CARD_TYPES,
  COMMUNITY_RATING_FILTER_MIN,
  COMMUNITY_RATING_MAX,
  CONDITIONS,
  FILTER_RANGE_BOUNDS,
  LEGACY_SORT_PRESETS,
  LIST_SEARCH_MAX_LENGTH,
  MAX_FILTER_IDS,
  MAX_FILTER_SKILLS,
  PHYSIQUE_FIELDS,
  POSITIONS,
  SEARCH_MAX_LENGTH,
  SEARCH_MAX_PAGE,
  SEARCH_MIN_LENGTH,
  SKILL_KEY_RE,
  SKILL_SLUG_MAX_LENGTH,
  SORT_FIELDS,
  SORT_PRESETS,
  TEAM_NAME_MAX_LENGTH,
  resolveLegacySort,
} from "./constants";
import { SYNC_INTERVAL_MAX_MINUTES, SYNC_INTERVAL_MIN_MINUTES, SYNC_KINDS } from "./sync";
import { IMAGE_VERSION_RE } from "./image-version";

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

// Community Rating minimum (2–10): a number or a digit string, like `int4` — a
// `null`, `true`, "" or a fraction is a 400, never coerced into a filter.
const ratingMin = z
  .union([z.number(), z.string().regex(/^\d{1,2}$/, "expected an integer")])
  .pipe(z.coerce.number().int().min(COMMUNITY_RATING_FILTER_MIN).max(COMMUNITY_RATING_MAX));

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
  // their own direction — see constants.ts). The former preset `trending` is
  // still accepted and read as `new`, and `top` as `highest` while Top rated
  // is not offered (LEGACY_SORT_PRESETS / TOP_RATED), so an old client never
  // gets a 400.
  sort: z
    .enum([...SORT_FIELDS, ...SORT_PRESETS, ...Object.keys(LEGACY_SORT_PRESETS)] as unknown as [string, ...string[]])
    .default("ovr")
    .transform((s) => resolveLegacySort(s)),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(LIST_SEARCH_MAX_LENGTH).optional(),
  cardType: z.enum(CARD_TYPES).optional(),
  // Card-type scope ("All" = omitted). The /players page sends its Card Type
  // toggles here; a Big Time card is stored under EPIC (the dump's "Epic" —
  // see CARD_TYPE_DUMP_LABELS; the UI shows "Epic - Big Time", CARD_TYPE_LABELS).
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
  // `defensiveStyle` restricts to the defence slot only. Several main styles
  // (`playingStyles`, change efootbase-function-parity) are OR-ed, each in
  // either slot; the single `playingStyle` is merged into the list.
  playingStyle: int4.optional(),
  playingStyles: z.array(int4).max(MAX_FILTER_IDS).optional(),
  // Teams by their stored name (the reference's `team=<name>`; names are
  // unique), OR-ed with `clubIds` / `clubId` into one team set.
  teamNames: z.array(z.string().min(1).max(TEAM_NAME_MAX_LENGTH)).max(MAX_FILTER_IDS).optional(),
  // Skills by their stored key (`Skill.efbKey`, the reference's
  // `skill=s_rabona`), AND-ed together with `skillIds` / `skillId`.
  skillKeys: z.array(z.string().regex(SKILL_KEY_RE, "expected a skill key such as s_rabona")).max(MAX_FILTER_SKILLS).optional(),
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
  skillIds: z.array(int4).max(MAX_FILTER_SKILLS).optional(),
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
  // Community Rating (change efootbase-data-refresh-1024): the stored average
  // community rating is at least this (2–10, no vote minimum); a card without
  // ratings never matches. 1 ("All") is the absence of the field — a 400 here.
  ratingMin: ratingMin.optional(),
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

// Player search (⌘K palette, home search, compare picker; change
// efootbase-function-parity): the trimmed term has SEARCH_MIN_LENGTH (3) to
// SEARCH_MAX_LENGTH characters — a shorter one is a 400 — and the results come
// in pages of SEARCH_PAGE_SIZE (12), page 1..SEARCH_MAX_PAGE. An older
// client's `limit` is accepted and ignored (the page size is fixed).
export const playerSearchInput = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH).max(SEARCH_MAX_LENGTH),
  page: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE).default(1),
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

// A skill by its stored or public slug, at most SKILL_SLUG_MAX_LENGTH
// characters — the bound the web skill pages pre-check (`isSkillSlug`).
export const skillByIdInput = z.object({ slug: z.string().trim().min(1).max(SKILL_SLUG_MAX_LENGTH) });

// Top cards of a skill (change efootbase-function-parity): the leader and the
// best card of up to 12 other base players — no paging. `slug` is the stored
// or the public slug. The former paging fields `page` / `limit` are accepted
// (with their old bounds) and ignored for one release, so an older client is
// not a 400.
export const skillPlayersInput = z.object({
  slug: z.string().trim().min(1).max(SKILL_SLUG_MAX_LENGTH),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

// Featured bundle (efootbase "Latest Packs") by its stable slug — name + release
// date, e.g. `spanish-league-midfielders-2026-10-05`, `spotlight-leo-messi-2027-…`.
// At most BUNDLE_SLUG_MAX_LENGTH characters — the bound /packs/<slug>
// pre-checks (`isBundleSlug`).
export const featuredBySlugInput = z.object({ slug: z.string().trim().min(1).max(BUNDLE_SLUG_MAX_LENGTH) });

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

// ---- Admin area + sync worker (the `admin` router; openspec admin-sync-worker) ----
// Admin accounts are separate from the visitor accounts above (capability
// admin-access). Schedule bounds are also CHECK constraints in the migration.

/** Admin user name: 3–32 characters from a-z 0-9 _ . - (lower case only). */
export const ADMIN_USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
/** Upper bound on a password's length (keeps the hashing input bounded). */
export const ADMIN_PASSWORD_MAX_LENGTH = 1024;

export const adminUsername = z.string().regex(ADMIN_USERNAME_RE, "user name: 3–32 characters from a-z 0-9 _ . -");
export const adminPassword = z
  .string()
  .min(ADMIN_PASSWORD_MIN_LENGTH, `password: at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`)
  .max(ADMIN_PASSWORD_MAX_LENGTH, `password: at most ${ADMIN_PASSWORD_MAX_LENGTH} characters`);

// Sign-in does not apply the user-name pattern or the password minimum: any
// failure answers the same generic message, so the input check must not tell an
// invalid name from an unknown one. Only sizes are bounded.
export const adminSignInInput = z.object({
  username: z.string().max(64),
  password: z.string().max(ADMIN_PASSWORD_MAX_LENGTH),
});

export const syncConfigUpdateInput = z.object({
  enabled: z.boolean(),
  incrementalIntervalMin: z.number().int().min(SYNC_INTERVAL_MIN_MINUTES).max(SYNC_INTERVAL_MAX_MINUTES),
  fullWeekday: z.number().int().min(0).max(6),
  fullHourUtc: z.number().int().min(0).max(23),
});
export type SyncConfigUpdateInput = z.infer<typeof syncConfigUpdateInput>;

export const syncQueueInput = z.object({ kind: z.enum(SYNC_KINDS) });
export const syncRunIdInput = z.object({ id: z.number().int().min(1).max(INT4_MAX) });
export const syncRunsListInput = z.object({
  /** id of the last run of the previous page (runs are listed newest first, id DESC). */
  cursor: z.number().int().min(1).max(INT4_MAX).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const count = z.number().int().min(0).max(INT4_MAX);
const isoTime = z.string().datetime();
// Statistics / check results stored in SyncRun.stats and returned by the admin
// API. `.strict()`: a key that is not listed here (e.g. a credential by
// mistake) fails validation instead of being stored or sent.
export const syncCheckResultSchema = z
  .object({
    answered: z.boolean(),
    httpStatus: z.number().int().min(0).max(999).nullable(),
    challenge: z.boolean(),
    responseMs: count.nullable(),
    newestReleaseAt: isoTime.nullable(),
    dbNewestReleaseAt: isoTime.nullable(),
    /** true when the source's newest card is newer than the database's newest. */
    newerThanDb: z.boolean().nullable(),
  })
  .strict();
export const syncRunStatsSchema = z
  .object({
    pages: count,
    requests: count,
    cardsNew: count,
    cardsChanged: count,
    cardsUnchanged: count,
    imagesDownloaded: count,
    imagesUploaded: count,
    imagesOverwritten: count,
    imagesFailed: count,
    durationMs: count,
    check: syncCheckResultSchema,
    /** Images that replaced a bucket object whose ETag is not a content MD5 — maybe overwritten, not verified (third verify W2). */
    imagesUnverified: count,
    /**
     * Stored only (never sent by the admin API): card ids whose images must
     * still be compared with the bucket — a FULL run writes its whole list
     * before its seed; once a run's image step finished (`imagesChecked`) the
     * list holds only what is still owed (failed / skipped images, ids it could
     * not compare). The next incremental / full run takes them over (second
     * verify CR2, third verify W1). At most every card of the catalogue.
     */
    imagesPendingIds: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).max(200_000),
    /** Stored only: this run's image step finished, so its `imagesPendingIds` are exactly what is still owed. */
    imagesChecked: z.boolean(),
    /** What the admin API sends instead of `imagesPendingIds`: their number. */
    imagesPending: count,
    /**
     * The card-image version this run raised the stored value to (change
     * auto-image-version, design D4): written by the worker's final transaction
     * (or the stale-run recovery) only when the run replaced card images on R2;
     * absent on every other run. Format = the stored version's.
     */
    imageVersionRaisedTo: z.string().regex(IMAGE_VERSION_RE),
  })
  .partial()
  .strict();
/** Statistics as the admin API returns them (`imagesPendingIds` replaced by `imagesPending`, `imagesChecked` withheld). */
export function publicRunStats(stats: SyncRunStats): SyncRunStats {
  const { imagesPendingIds, imagesChecked: _checked, ...rest } = stats;
  return imagesPendingIds && imagesPendingIds.length > 0 ? { ...rest, imagesPending: imagesPendingIds.length } : rest;
}
export type SyncCheckResult = z.infer<typeof syncCheckResultSchema>;
export type SyncRunStats = z.infer<typeof syncRunStatsSchema>;
