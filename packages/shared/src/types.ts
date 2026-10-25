import type { BaseStat, CardType, PhysiqueField, Position, PositionProficiency, TrainingCategory } from "./constants";
import type { SyncRunStats } from "./schemas";
import type { SyncKind, SyncStatus, SyncTrigger } from "./sync";

// Serialized DTO shapes (what tRPC returns after SuperJSON). BigInt → string.
/** Everything a PlayerCard tile needs in a list/grid (player.list, trending,
 *  featured bundles, pack grids, skill holders): identity, card type, OVR/Max
 *  OVR, position, condition, nationality flag (R2) and the two playing-style
 *  ids for the "Attack / Defence" label. `player.list` returns exactly this
 *  shape (design decision 14); the detail and compare views get the full
 *  PlayerCardDTO. */
export interface CardPreview {
  id: string;
  baseId: string;
  name: string;
  cardType: CardType;
  ovr: number;
  maxOvr: number;
  registeredPosition: number;
  condition: string;
  /** Nationality flag URL (R2, rebased onto R2_PUBLIC_BASE by the API) for the
   *  nation overlay on detail-style cards. Producers that do not join Country
   *  (featured bundles, pack grids, skill holders) leave it undefined. */
  flagUrl?: string | null;
  nationalityId?: number;
  /** Playing-style ids (numeric, see PLAYING_STYLES). Optional for lightweight
   *  producers that do not select them. */
  playingStyleAttack?: number;
  playingStyleDefense?: number;
  /** Name of the pack / campaign the card belongs to (Player.featuredPackId →
   *  Pack.name), or null when it has none. Filled by `player.search` (the
   *  result rows' pack chip); other producers leave it undefined. */
  packName?: string | null;
}

/** player.search — one page of SEARCH_PAGE_SIZE (12) rows in the server order
 *  (max overall DESC, card id DESC); `hasMore` says whether a next page
 *  exists. The word-start lift inside a page is the result lists' job
 *  (`liftWordStartRows`). */
export interface PlayerSearchResult {
  rows: CardPreview[];
  hasMore: boolean;
}

/** Full card for the detail page and the compare view. Fields the web app never
 *  rendered (shirt numbers, country2, form, datapack, physique, derived physics,
 *  tactic compat, alternate-script names) were dropped in eflab-parity-fixes
 *  (design decision 14); they still exist in the database. */
export interface PlayerCardDTO extends CardPreview {
  nationalityId: number;
  height: number;
  weight: number;
  age: number;
  strongerFoot: number;
  playingStyleAttack: number;
  playingStyleDefense: number;
  weakFootUsage: number;
  weakFootAccuracy: number;
  releaseDate: string | null;
  /** Real max level of the card (efootbase `level_cap`) — drives the MAX LEVEL badge. */
  levelCap: number;
  // 26 base stats
  stats: Record<BaseStat, number>;
  // 26 max stats
  maxStats: Record<BaseStat, number>;
  // 13 position aptitudes (0/1/2 = registered/secondary/none)
  positionAptitudes: Record<Position, number>;
  // 13 per-position OVR ratings from the eFHUB cross-fill; null when the player
  // is absent from eFHUB. Reference only since efootbase-exact-model-managers:
  // the web computes every displayed position value with `positionTiles`.
  positionRatings: Record<Position, number | null>;
  // AI playstyle flags
  playstyles: {
    trickster: boolean;
    mazingRun: boolean;
    speedingBullet: boolean;
    incisiveRun: boolean;
    longBallExpert: boolean;
    earlyCross: boolean;
  };
  // skills (list of slugs)
  skills: string[];
  // booster ids
  boosterId1: number | null;
  boosterId2: number | null;
  // resolved booster objects (joined from Booster table by boosterId1/2). When the
  // API batch-attaches these, the detail page + compare render the real name +
  // stat magnitudes instead of "Booster #199". Added 2026-10-08 — dump has 359
  // booster IDs not in fixtures/boosters.json; seeder Phase 1c upserts them.
  booster1: BoosterDTO | null;
  booster2: BoosterDTO | null;
  // relations
  otherVersions: Array<{
    id: string;
    cardType: CardType;
    ovr: number;
    maxOvr: number;
    registeredPosition: number;
  }>;
  pack: { id: string; name: string } | null;
  // R2 image URLs (populated from Team.emblemUrl / League.emblemUrl by the seeder,
  // rebased onto R2_PUBLIC_BASE by the API). efootbase uses SHA256 hash filenames
  // → not ID-derivable → must come from the DB. flagUrl is inherited from CardPreview.
  teamEmblemUrl: string | null;
  // Display-name overlays (joined Team/Country/League in the API procedure).
  countryName: string | null;
  teamName: string | null;
  /** The card's TEAM's league (Team → League). Kept for callers; the pages
   *  show `cardLeague` and fall back to this only when it is null. */
  leagueName: string | null;
  leagueEmblemUrl: string | null;
  /** The card's OWN league (`Player.leagueId`, the dump's `league` — the
   *  league the `/players` League filter matches; change
   *  a11y-names-and-card-league): the League row of that id, emblem rebased
   *  onto R2_PUBLIC_BASE, or null when the card stores none (the eFHUB-only
   *  cards). It differs from the team's league on 17,608 cards of the
   *  2026-10-24 data (17,163 of the team "FREE": "Free Agent" vs "Other"). */
  cardLeague: CardLeagueDTO | null;
  // ---- Detail-only extras (efootbase-parity-round2). The columns exist in
  // the database (Player.form / injuryResistance / 11 physique Ints / 5 derived
  // Floats) and are optional here so the detail page can render the sections
  // as soon as player.byId carries them; a producer that does not select them
  // leaves them undefined and the UI shows an "not exposed" note, never a
  // substitute number.
  /** Form 0–2 — efootbase shows it as (value + 1) stars of 3. */
  form?: number;
  /** Injury resistance 0–2 — efootbase shows it as (value + 1) stars of 3. */
  injuryResistance?: number;
  /** 11 body-model values (1–10), keyed by PhysiqueField. */
  physique?: Record<PhysiqueField, number>;
  /** 5 derived body metrics (floats) — efootbase's "Leg Coverage Radius",
   *  "Arm Coverage Radius", "Jump Height", "Torso Collision", "Leg Length Height". */
  bodyMetrics?: {
    legCoverage: number;
    armCoverage: number;
    peakJumpHeight: number;
    torsoCollisionWidth: number;
    dribbleHeight: number;
  };
}

/** A card's own league (`PlayerCardDTO.cardLeague`). */
export interface CardLeagueDTO {
  id: number;
  name: string;
  /** League emblem on R2 (rebased onto R2_PUBLIC_BASE), or null. */
  emblemUrl: string | null;
}

/** efootbase's two skill groups. Catalogue entries efootbase does not treat as
 *  skills have no group (`null`) and are listed under "Other". */
export type SkillGroup = "showtime" | "classic";

/** One stat boost of a skill, with the eFootLab stat name (efootbase `tackling`
 *  → `ballWinning`, `jumping` → `jump`, `setPieceTaking` → `placeKicking`). */
export interface SkillEffect {
  stat: BaseStat;
  value: number;
}

/** A public skill (skill.list / skill.byId). Name, description, group, icon,
 *  effects and activation come from the static efootbase snapshot when the seed
 *  had it (openspec efootbase-static-data); otherwise they are the fixture text
 *  and null / []. Unreleased skills are never returned. */
export interface SkillDTO {
  id: number;
  /** Stored slug — the join key (player DTOs list these). Never changes. */
  slug: string;
  /** Slug of the public skill page (`/wiki/skills/<publicSlug>`): the stored
   *  skill key without `s_`, `_` → `-` (`skillPublicSlug`); the stored slug
   *  for an entry without a key. */
  publicSlug: string;
  /** Stored skill key (`Skill.efbKey`, e.g. `s_fortress` — the `/players`
   *  `skill=` value), or null for the entries efootbase does not list. */
  key: string | null;
  /** The holder with the highest max overall (ties: the higher card id), or
   *  null when no card carries the skill. */
  leader: CardPreview | null;
  name: string;
  description: string;
  category: string;
  /** null = not an efootbase skill (the "Other" entries) or no snapshot. */
  group: SkillGroup | null;
  /** efootbase's wiki order (0-based); null for the "Other" entries. */
  sortOrder: number | null;
  /** Skill icon on R2 (rebased onto R2_PUBLIC_BASE), or null. */
  iconUrl: string | null;
  /** Stat boosts observed on efootbase; [] when none (most skills, and every
   *  skill whose boost was never seen on a loaded card). */
  effects: SkillEffect[];
  /** When the boost applies (efootbase text), or null. */
  activation: string | null;
  /** Always true in API responses (hidden skills are filtered out). */
  released: boolean;
  /** Number of cards that have this skill (grouped count of PlayerSkill). 0 for
   *  catalogue skills no dump card carries. */
  playerCount: number;
}

/** Top cards of one skill (skill.players, change efootbase-function-parity):
 *  the leader (the holder with the highest max overall, ties by the higher
 *  card id) and the best card of each of up to 12 other base players (max
 *  overall DESC, card id DESC; one card per base player, the leader's base
 *  player excluded). No paging; the holder count is `SkillDTO.playerCount`. */
export interface SkillPlayersResult {
  leader: CardPreview | null;
  rows: CardPreview[];
}

/** Resolved booster (joined by boosterId1/boosterId2 from the Booster table).
 *  `stats` carries only the bumped stats (sparse), matching the efootbase dump
 *  shape so the UI can render "+4 Low Pass · +4 Loft Pass" pills. */
export interface BoosterDTO {
  id: number;
  name: string;
  magnitude: number;
  tier: string;
  stats: Partial<Record<BaseStat, number>>;
}

/** One of the 29 basic "+1" boosters a card without its own Booster 2 can
 *  take as its second booster (booster.secondChoices, from the committed
 *  booster fixture's basic list, ids 1–29). `slug` is the `b2=` URL value
 *  (`secondBoosterSlug`: "Striker's Instinct +1" → `strikers-instinct1`). */
export interface SecondBoosterDTO extends BoosterDTO {
  slug: string;
}

/** player.list result — slim card previews (design decision 14). */
export interface PlayerListResult {
  items: CardPreview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Build simulator types (player-progression-simulator, exact model since
// efootbase-exact-model-managers). The selected manager is not part of the
// config: the engine takes its pill stats (`SimulateInput.manager`) and the
// level is `managerProficiency` (the UI sets it to the manager's rating).
export interface BuildConfig {
  playerId: string;
  /** Selected max level, 1..levelCap — the budget is `maxLevel − 1` points. */
  maxLevel: number;
  /** Position the overall is computed for (defaults to the registered one). */
  position: Position;
  /** Stat points bought per training category (ten categories). */
  trainingPoints: Record<TrainingCategory, number>;
  /** [Booster 1 active, Booster 2 active]. */
  boosters: [boolean, boolean];
  /** Manager Proficiency level 70–90 (efootbase's slider, or the selected
   *  manager's rating). Omitted → the engine default
   *  MANAGER_PROFICIENCY_DEFAULT (90, efootbase's default); 70–76 give no bonus. */
  managerProficiency?: number;
}

// Computed build result returned by the simulator.
export interface BuildResult {
  /** The config as applied (maxLevel clamped to the card's level cap,
   *  managerProficiency clamped to 70..90 / defaulted). */
  config: BuildConfig & { managerProficiency: number };
  base: Record<BaseStat, number>;
  /** Stat points bought, per stat (the raw lift of the categories). */
  trainingDeltas: Record<BaseStat, number>;
  /** Cut to 99 per stat (0 or negative): what base + training exceeds 99 by,
   *  removed before the boosters as efootbase does (98 + 4 training → −3). */
  capDeltas: Record<BaseStat, number>;
  /** Manager Proficiency bonus per stat (band table, read off base +
   *  training; never lifts a stat above 99, 0 for a stat already at 99+). */
  proficiencyDeltas: Record<BaseStat, number>;
  boosterDeltas: Record<BaseStat, number>;
  /** +1 on each pill stat of the selected manager (zeros without one). */
  managerDeltas: Record<BaseStat, number>;
  /** min(99, base + training + proficiency bonus) + active boosters +
   *  manager (= base + every delta above); only the boosters and the
   *  manager's +1 may take a stat above 99. */
  projectedStats: Record<BaseStat, number>;
  /** Training points at the selected max level (`maxLevel − 1`). */
  pointsAvailable: number;
  /** Cost of the allocation in points (multiples of 0.5). */
  pointsUsed: number;
  remainingPoints: number;
  withinBudget: boolean;
  /** Overall at `config.position` by the exact formula (= tiles[position]). */
  overall: number;
  /** Proficiency of the card at `config.position` ("full" when no aptitudes
   *  were given); it scales the stats inside the formula. */
  proficiency: PositionProficiency;
  /** The exact overall at all 13 positions for the projected stats. */
  tiles: Record<Position, number>;
}

/** One manager of efootbase's picker (manager.picker). `pills` are the one
 *  or two stats the manager raises by +1 (eFootLab stat names); 24 of the 70
 *  picker managers (2026-10-24 snapshot) have a single pill on efootbase. The
 *  list comes in rating DESC, picker order (the reference's drawer order), id
 *  ASC. */
export interface PickerManagerDTO {
  id: string;
  name: string;
  /** Manager rating 83–90; choosing the manager sets Manager Proficiency to it. */
  rating: number;
  /** Manager art on R2 (rebased onto R2_PUBLIC_BASE), or null. */
  imageUrl: string | null;
  pills: BaseStat[];
}

// ---- Auth session (auth.getSession; consumed by apps/web/lib/auth.tsx) ----

export interface SessionUserDTO {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  region: string | null;
  country: string | null;
  isPro: boolean;
  proUntil: string | null;
  role: "USER" | "MODERATOR" | "ADMIN";
}

/** efootbase homepage "Latest Packs" featured bundle (specialPlayerList entry).
 *  Cards are pre-ordered by `ordinal` (efootbase's exact display order — note
 *  this includes legend spotlights pulled from other packs, so OVR is not
 *  monotonic). `releaseDate` comes from efootbase's `time` field. */
export interface FeaturedBundleDTO {
  id: number;
  name: string;
  slug: string;
  releaseDate: string;
  /** Stored display order (FeaturedBundle.position): the current packs newest
   *  first, then the manager / player spotlights — the reference's /packs
   *  order, which a client sorts by. */
  position: number;
  cards: CardPreview[];
}

/** featured.list — every bundle (releaseDate DESC, position ASC) and the
 *  newest card release date in the catalogue (MAX(Player.releaseDate), ISO),
 *  the source of the /packs "Last updated" chip; null in an empty catalogue. */
export interface FeaturedListDTO {
  bundles: FeaturedBundleDTO[];
  newestCardRelease: string | null;
}

/** `catalogue.meta` (change efootbase-data-refresh-1024): when the seeded dump
 *  was taken — the date of the stored community ratings ("Ratings as of …").
 *  ISO-8601 UTC, or null while no seed has stored it. */
export interface CatalogueMetaDTO {
  playersDumpedAt: string | null;
}

// ---- Admin area + sync worker (the `admin` router; openspec admin-sync-worker) ----
// No DTO below carries a password hash, a session token or digest, the
// efootbase key or an R2 credential (admin-access "Protected Admin API").

/** admin.me / admin.signIn — the signed-in admin. */
export interface AdminMeDTO {
  id: number;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
}

/** The single SyncConfig row as the dashboard reads it. */
export interface SyncConfigDTO {
  enabled: boolean;
  incrementalIntervalMin: number;
  fullWeekday: number;
  fullHourUtc: number;
  blockedUntil: string | null;
  blockedReason: string | null;
  workerHeartbeatAt: string | null;
  updatedAt: string;
  /** User name of the admin who last changed the schedule, or null. */
  updatedBy: string | null;
}

/** One run in the history list (no log tail). */
export interface SyncRunSummaryDTO {
  id: number;
  kind: SyncKind;
  trigger: SyncTrigger;
  status: SyncStatus;
  /** User name of the admin who queued a manual run; null for scheduled runs. */
  requestedBy: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelRequested: boolean;
  error: string | null;
  /** Validated against `syncRunStatsSchema`; `{}` when the stored value fails it (then `statsInvalid`). */
  stats: SyncRunStats;
  /** true when the stored statistics did not match `syncRunStatsSchema` — they are withheld, never guessed. */
  statsInvalid: boolean;
  watermarkBefore: string | null;
  watermarkAfter: string | null;
}

/** admin.runs.get — a run with its (redacted, ≤ 64 KB) log tail. */
export interface SyncRunDTO extends SyncRunSummaryDTO {
  logTail: string;
}

/** admin.runs.list — newest first; pass `nextCursor` back as `cursor`. */
export interface SyncRunsPageDTO {
  items: SyncRunSummaryDTO[];
  nextCursor: number | null;
}

/** admin.dashboard. */
export interface SyncDashboardDTO {
  workerOnline: boolean;
  config: SyncConfigDTO;
  /** Latest finished run (any kind; queued / running ones are in `activeRuns`). */
  lastRun: SyncRunSummaryDTO | null;
  /** Queued and running runs, oldest first (the order the worker takes them). */
  activeRuns: SyncRunSummaryDTO[];
  next: { incremental: string | null; full: string | null };
  /** Newest Player.releaseDate in the database. */
  newestCardReleaseAt: string | null;
  /** The card with that release date (highest id on a tie), or null in an empty catalogue. */
  newestCard: { id: string; baseId: string; name: string; releaseAt: string } | null;
  /** Latest finished run that overwrote card images (raise the image version). */
  overwrittenImages: { runId: number; count: number; finishedAt: string | null } | null;
}
