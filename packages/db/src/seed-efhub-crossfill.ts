// seed-efhub-crossfill.ts — cross-fill eflab Postgres from the eFHUB CDN SQLite
// dump. Run AFTER `pnpm db:seed` (`pnpm db:refresh` runs both). This script only
// fills the columns efootbase cannot expose; the seeder never writes them (see
// PLAYER_CROSSFILL_COLUMNS / MANAGER_CROSSFILL_COLUMNS in efootbase-map.ts),
// so seed → cross-fill → seed keeps them.
//
//   Phase 1  Manager tactic ratings. eFHUB has ~1.5k coach rows (several versions
//           of the same coach with different ids and ratings). Merge order:
//             a) exact id — an eflab manager whose id is an eFHUB coach id gets
//                THAT version's ratings (no cross-version leakage);
//             b) name — art rows (efootbase APK fixtures) still without tactics are
//                matched by name through ALIASES (eFHUB abbreviates / strips
//                accents) and get the best-MarketValue version of that name —
//                UNLESS that best version's id is another Manager row (another card
//                of the same coach, already filled by its own id in a). Such a row
//                stays at 0 (no tactics) with a warning: efootbase has no tactic data
//                for managers, and copying another card's numbers would show
//                ratings that are not this card's (eFHUB versions of one coach can
//                differ a lot). No fallback to a lower version either.
//                efootbase-static-data: the picker cards Jürgen Klopp
//                17609902885263 (eFHUB's only Klopp entry is 17605071047055, the
//                older Klopp art card) and Cristian Chivu 17610171323785 (eFHUB's
//                best Chivu entry is 17603460437385, the other Chivu art card) are
//                not eFHUB ids and therefore stay without tactics;
//             c) create — every remaining eFHUB coach name (best version) becomes a
//                no-art manager, unless an art row already carries that name.
//           Stale no-art duplicates of an art row are deleted.
//   Phase 2  Player: stars, reputation, overallPotential, gkClearing (+ maxGkClearing
//           from MAXGKClearing) and the 13 per-position ratings ratingGK…ratingCF
//           from overallGK…overallCF. One bound jsonb parameter per batch — no
//           string-spliced SQL; every id is validated as a safe integer first.
//   Phase 2b registeredPosition is seed-owned (dump `pos`). eFHUB RegisteredPosition
//           is only compared against it and mismatches are reported, never written.
//   Phase 3  player_tiers → Player.communityTier (S+/S/A/B/C/D/E), bound parameters.
//   Phase 4  3 players that exist in eFHUB but not in efootbase (Ismail Nasrallah,
//           Safi Belal, a Robert Lewandowski special card). Their eFHUB `Overall`
//           (116/116/102 with LevelCap 1) is not a display OVR, so ovr/maxOvr stay
//           40 placeholders; everything else (stats, max stats, positions, ratings,
//           condition via the shared [E,D,C,B,A] index, nameNormalized) is real.
//
// Usage:  pnpm db:crossfill            (env from the repo-root .env via tsx)
// Env:    DATABASE_URL, EFHUB_DB_PATH (default dump/efhub/efhub_db.sqlite),
//         SQLITE3_BIN (default `sqlite3`; ServBay: /Applications/ServBay/bin/sqlite3).
//         SQLite is read through the sqlite3 CLI in -readonly mode (no native dep).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { POSITIONS, type CardType } from "@eflab/shared";
import { prisma } from "./client.js";
import type { Prisma } from "./generated/client.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const EFHUB_DB = process.env.EFHUB_DB_PATH
  ?? resolve(__dirname, "../../../dump/efhub/efhub_db.sqlite");

// efhub player table is named "player export" (with a space) → quoted in SQL.
const PLAYER_TABLE = `"player export"`;
const BATCH = 2000;

/** Run a read-only sqlite3 query, return parsed JSON rows. */
function sql<T = Record<string, unknown>>(query: string): T[] {
  const bin = process.env.SQLITE3_BIN ?? "sqlite3";
  const out = execFileSync(bin, ["-readonly", "-json", EFHUB_DB, query], {
    maxBuffer: 512 * 1024 * 1024,
    encoding: "utf-8",
  });
  const trimmed = out.trim();
  return trimmed ? (JSON.parse(trimmed) as T[]) : [];
}

/** Konami ids are 15-digit integers; anything else from the SQLite file is rejected. */
function safeId(v: unknown, where: string): number | null {
  const n = typeof v === "string" && /^\d{1,16}$/.test(v) ? Number(v) : v;
  if (typeof n === "number" && Number.isSafeInteger(n) && n > 0) return n;
  console.log(`  ⚠ ${where}: rejected id ${JSON.stringify(v)}`);
  return null;
}
const int = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;

// Position aptitude inversion: eFHUB 2=registered/full, 1=partial, 0=none; eflab
// posXX columns 0=registered, 1=partial, 2=none.
const inv = (v: unknown): number => (v === 2 ? 0 : v === 0 ? 2 : 1);

// Same index order as the efootbase dump (players_meta condition.values).
const CONDITION_LETTERS = ["E", "D", "C", "B", "A"] as const;

/** Lower-case ASCII form of a name — same normalisation as efootbase `name_normalized`. */
function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// eFHUB PlayerType → CardType, from the 44k-card cross-tab against the efootbase
// dump (2026-10): 1→code 0 (30.351), 2→code 4 (313 of 428), 3→code 3 (3.586),
// 4→code 1 (255), 5→code 5 (897), 6→code 6 (7.693), 7→code 5 (149), 8→code 6 (723).
const PLAYER_TYPE_MAP: Readonly<Record<number, CardType>> = {
  1: "STANDARD", 2: "SELECTION", 3: "TRENDING", 4: "LEGENDARY",
  5: "EPIC", 6: "HIGHLIGHT", 7: "EPIC", 8: "HIGHLIGHT",
};

// efootbase (accented, full) manager name → eFHUB coachesName. eFHUB abbreviates
// first names and strips accents; every fixture manager whose id is not an eFHUB
// coach id is listed here so the name merge cannot miss it.
const ALIASES: Readonly<Record<string, string>> = {
  "josé mourinho": "jose mourinho",
  "rúben amorim": "ruben amorim",
  "ståle solbakken": "stale solbakken",
  "niko kovač": "niko kovac",
  "didier deschamps": "d. deschamps",
  "patrick kluivert": "p. kluivert",
  "franz beckenbauer": "f. beckenbauer",
  "julian nagelsmann": "j. nagelsmann",
  // "Olimpio Henriques" matches eFHUB "Olympio H." by id (not "Joao Henriques", a
  // different coach — the old alias suppressed him).
  "roberto martínez": "r. martinez",
  "vincenzo montella": "v. montella",
  // efootbase-static-data: eFHUB strips the umlaut. Its one Klopp entry is the older
  // Klopp art card (17605071047055, matched by id), so the 2026-10 picker card
  // (17609902885263, not an eFHUB id) is NOT filled from it (phase 1 b) — the alias
  // only names the reason in the log and keys the duplicate check.
  "jürgen klopp": "jurgen klopp",
};
const efhubNameKey = (eflabName: string): string => {
  const key = eflabName.toLowerCase();
  return ALIASES[key] ?? key;
};

async function main(): Promise<void> {
  if (!existsSync(EFHUB_DB)) {
    console.error(`ERROR: eFHUB SQLite not found at ${EFHUB_DB}.`);
    console.error("Dump it first: see docs/efhub-sqlite-gap-analysis.md recipe.");
    process.exit(1);
  }
  const t0 = Date.now();
  console.log("seed-efhub-crossfill: reading", EFHUB_DB);

  // ── Phase 1: Manager tactic ratings ─────────────────────────────────────
  console.log("\nphase 1: Manager tactic ratings from efhub coaches…");
  type CoachRow = {
    Id: number; coachesName: string; Country: number; Age: number;
    PossessionGame: number; QuickCounter: number; LongBallCounter: number;
    OutWide: number; LongBall: number; OverLoad: number;
    Affinity: number; MarketValue: number;
  };
  // Adaptability is always 0 in eFHUB — not read. Best version of a name first.
  const coaches = sql<CoachRow>(
    `SELECT Id, coachesName, Country, Age, PossessionGame, QuickCounter,
            LongBallCounter, OutWide, LongBall, OverLoad, Affinity, MarketValue
     FROM coaches WHERE coachesName != 'Manager'
     ORDER BY MarketValue DESC, Id ASC`,
  ).filter((c) => safeId(c.Id, "coaches") != null && typeof c.coachesName === "string" && c.coachesName.trim() !== "");
  const tacticOf = (c: CoachRow) => ({
    age: int(c.Age, 50),
    country: int(c.Country, 0),
    adaptability: 0,
    affinity: int(c.Affinity, 0),
    marketValue: int(c.MarketValue, 0),
    possessionGame: int(c.PossessionGame, 0),
    quickCounter: int(c.QuickCounter, 0),
    longBallCounter: int(c.LongBallCounter, 0),
    outWide: int(c.OutWide, 0),
    longBall: int(c.LongBall, 0),
    overload: int(c.OverLoad, 0),
  });
  const coachById = new Map<string, CoachRow>();
  const bestByName = new Map<string, CoachRow>(); // lower-case name → best version
  for (const c of coaches) {
    coachById.set(String(c.Id), c);
    const key = c.coachesName.toLowerCase();
    if (!bestByName.has(key)) bestByName.set(key, c);
  }
  console.log(`  efhub coaches: ${coaches.length} rows, ${bestByName.size} distinct names`);

  const existing = await prisma.manager.findMany({ select: { id: true, name: true, imageUrl: true } });
  // Names (eFHUB spelling) already represented by an art row — through the alias map
  // and, for id-matched art rows, through the coach's own eFHUB name, so a coach never
  // exists twice (art row + no-art row under the abbreviated name).
  const artNameKeys = new Set(existing.filter((m) => m.imageUrl != null).map((m) => efhubNameKey(m.name)));

  // a) exact id — that version's ratings, whatever its name.
  let byId = 0;
  const filledIds = new Set<string>();
  for (const m of existing) {
    const c = coachById.get(m.id.toString());
    if (!c) continue;
    await prisma.manager.update({ where: { id: m.id }, data: tacticOf(c) });
    filledIds.add(m.id.toString());
    if (m.imageUrl != null) artNameKeys.add(c.coachesName.toLowerCase());
    byId++;
  }

  // b) name — art rows not matched by id get the best version of their name, unless
  //    that version is another Manager row's own card (then: no tactics, warned).
  const existingIds = new Set(existing.map((m) => m.id.toString()));
  let byName = 0;
  const unmatchedArt: string[] = [];
  const otherCardArt: string[] = [];
  for (const m of existing) {
    if (m.imageUrl == null || filledIds.has(m.id.toString())) continue;
    const c = bestByName.get(efhubNameKey(m.name));
    if (!c) { unmatchedArt.push(m.name); continue; }
    if (existingIds.has(String(c.Id))) { otherCardArt.push(`${m.name} (${m.id} → ${c.Id})`); continue; }
    await prisma.manager.update({ where: { id: m.id }, data: tacticOf(c) });
    filledIds.add(m.id.toString());
    byName++;
  }
  if (unmatchedArt.length > 0) console.log(`  ⚠ art managers with no efhub coach (tactic stays 0): ${unmatchedArt.join(", ")}`);
  if (otherCardArt.length > 0) {
    console.log(`  ⚠ art managers with no efhub coach of their own (tactic stays 0 — the efhub entry of that name belongs to another card in the table, its tactics are not copied): ${otherCardArt.join(", ")}`);
  }

  // c) create no-art managers for every remaining coach name (best version).
  let created = 0;
  for (const [key, c] of bestByName) {
    if (artNameKeys.has(key) || existingIds.has(String(c.Id))) continue;
    await prisma.manager.create({
      data: { id: BigInt(c.Id), name: c.coachesName, rating: 0, imageUrl: null, ...tacticOf(c) },
    });
    created++;
  }

  // Stale no-art duplicates of an art row (from runs before the name merge, or eFHUB
  // versions of a coach whose own picker card arrived later). Only no-art rows are
  // ever deleted; no table references Manager (no foreign key points at it).
  const noArt = await prisma.manager.findMany({ where: { imageUrl: null }, select: { id: true, name: true } });
  const dupIds = noArt.filter((m) => artNameKeys.has(m.name.toLowerCase())).map((m) => m.id);
  if (dupIds.length > 0) await prisma.manager.deleteMany({ where: { id: { in: dupIds } } });
  const withTactics = await prisma.manager.count({ where: { possessionGame: { gt: 0 } } });
  const total = await prisma.manager.count();
  console.log(`  managers: ${byId} filled by id + ${byName} by name + ${created} created (no art) − ${dupIds.length} duplicates = ${total} total, ${withTactics} with tactics (${otherCardArt.length} left empty: efhub entry is another card)`);

  // ── Phase 2: Player stars / reputation / overallPotential / gkClearing / ratings ──
  console.log("\nphase 2: cross-fill Player stars/reputation/overallPotential/gkClearing/ratings…");
  const ratingCols = POSITIONS.map((p) => `rating${p}`);
  const overallCols = POSITIONS.map((p) => `overall${p}`);
  type FillRow = Record<string, unknown> & {
    PlayerID: unknown; Stars: unknown; Reputation: unknown; OverallPotential: unknown;
    GKClearing: unknown; MAXGKClearing: unknown; RegisteredPosition: unknown;
  };
  const fills = sql<FillRow>(
    `SELECT PlayerID, Stars, Reputation, OverallPotential, GKClearing, MAXGKClearing,
            RegisteredPosition, ${overallCols.join(", ")} FROM ${PLAYER_TABLE}`,
  );
  console.log(`  efhub player rows: ${fills.length}`);
  const fillRecords: Array<Record<string, number | null>> = [];
  const posRecords = new Map<number, number>();
  for (const r of fills) {
    const id = safeId(r.PlayerID, PLAYER_TABLE);
    if (id == null) continue;
    const gkClearing = int(r.GKClearing, 40);
    const rec: Record<string, number | null> = {
      id,
      stars: int(r.Stars, 0),
      reputation: int(r.Reputation, 0),
      overallPotential: int(r.OverallPotential, 0),
      gkClearing,
      maxGkClearing: Math.max(int(r.MAXGKClearing, gkClearing), gkClearing),
    };
    for (let i = 0; i < POSITIONS.length; i++) rec[ratingCols[i]!] = intOrNull(r[overallCols[i]!]);
    fillRecords.push(rec);
    const rp = intOrNull(r.RegisteredPosition);
    if (rp != null && rp >= 0 && rp < POSITIONS.length) posRecords.set(id, rp);
  }
  const setList = ["stars", "reputation", "overallPotential", "gkClearing", "maxGkClearing", ...ratingCols]
    .map((c) => `"${c}" = t."${c}"`).join(", ");
  // Column names are quoted so Postgres keeps their case (jsonb keys are matched exactly).
  const defList = [`"id" int8`, ...["stars", "reputation", "overallPotential", "gkClearing", "maxGkClearing", ...ratingCols]
    .map((c) => `"${c}" int4`)].join(", ");
  let fillUpdated = 0;
  for (let i = 0; i < fillRecords.length; i += BATCH) {
    const batch = fillRecords.slice(i, i + BATCH);
    // Only rows present in eflab are touched; efhub-only ids fall out of the join.
    fillUpdated += await prisma.$executeRawUnsafe(
      `UPDATE "Player" p SET ${setList}
         FROM jsonb_to_recordset($1::jsonb) AS t(${defList})
        WHERE p.id = t.id`,
      JSON.stringify(batch),
    );
  }
  console.log(`  players updated: ${fillUpdated} of ${fillRecords.length} efhub rows`);

  // ── Phase 2b: registeredPosition consistency check (seed-owned, never written) ──
  const current = await prisma.player.findMany({
    where: { id: { in: [...posRecords.keys()].map((n) => BigInt(n)) } },
    select: { id: true, name: true, registeredPosition: true },
  });
  const mismatches = current.filter((p) => posRecords.get(Number(p.id)) !== p.registeredPosition);
  if (mismatches.length > 0) {
    console.log(`  ⚠ ${mismatches.length} players where efhub RegisteredPosition ≠ seeded pos (seed wins): ${
      mismatches.slice(0, 5).map((p) => `${p.name} ${p.registeredPosition}≠${posRecords.get(Number(p.id))}`).join("; ")}`);
  } else {
    console.log(`  registeredPosition: efhub agrees with the dump on all ${current.length} shared players`);
  }

  // ── Phase 3: player_tiers → communityTier ─────────────────────────────
  console.log("\nphase 3: cross-fill Player.communityTier from efhub player_tiers…");
  const TIERS = new Set(["S+", "S", "A", "B", "C", "D", "E"]);
  type TierRow = { playerID: unknown; tier: unknown };
  const tierRecords: Array<{ id: number; tier: string }> = [];
  const tierById = new Map<number, string>(); // also applied to the Phase 4 inserts
  for (const r of sql<TierRow>(`SELECT playerID, tier FROM player_tiers`)) {
    const id = safeId(r.playerID, "player_tiers");
    if (id == null) continue;
    if (typeof r.tier !== "string" || !TIERS.has(r.tier)) { console.log(`  ⚠ player_tiers: rejected tier ${JSON.stringify(r.tier)} for ${id}`); continue; }
    tierRecords.push({ id, tier: r.tier });
    tierById.set(id, r.tier);
  }
  await prisma.player.updateMany({ where: { communityTier: { not: null } }, data: { communityTier: null } });
  let tierUpdated = 0;
  for (let i = 0; i < tierRecords.length; i += BATCH) {
    tierUpdated += await prisma.$executeRawUnsafe(
      `UPDATE "Player" p SET "communityTier" = t.tier
         FROM jsonb_to_recordset($1::jsonb) AS t("id" int8, "tier" text)
        WHERE p.id = t.id`,
      JSON.stringify(tierRecords.slice(i, i + BATCH)),
    );
  }
  console.log(`  tiers: ${tierRecords.length} efhub rows → ${tierUpdated} players badged`);

  // ── Phase 4: players missing from efootbase ───────────────────────────
  console.log("\nphase 4: insert players missing from efootbase…");
  const missingIds = [8554053, 8554076, 123236838841410];
  // eFHUB Country (Konami numeric) → eflab Country.name; only the two we need.
  const efhubCountryName = new Map<number, string>([[30, "Qatar"], [227, "Poland"]]);
  const eflabCountries = await prisma.country.findMany({
    where: { name: { in: [...efhubCountryName.values()] } },
    select: { id: true, name: true },
  });
  const countryNameToId = new Map(eflabCountries.map((c) => [c.name, c.id]));

  // Base stat column ↔ eFHUB column (same spelling with upper-case initial; GK stats
  // use the "GK" prefix). eFHUB has no GKParrying: its GKClearing IS the stat
  // efootbase calls gk_parrying, so both gkParrying and gkClearing read it.
  const BASE_STATS: Array<[string, string]> = [
    ["offensiveAwareness", "OffensiveAwareness"], ["ballControl", "BallControl"], ["dribbling", "Dribbling"],
    ["tightPossession", "TightPossession"], ["lowPass", "LowPass"], ["loftedPass", "LoftedPass"],
    ["finishing", "Finishing"], ["heading", "Heading"], ["placeKicking", "PlaceKicking"], ["curl", "Curl"],
    ["speed", "Speed"], ["acceleration", "Acceleration"], ["kickingPower", "KickingPower"], ["jump", "Jump"],
    ["physicalContact", "PhysicalContact"], ["balance", "Balance"], ["stamina", "Stamina"],
    ["defensiveAwareness", "DefensiveAwareness"], ["ballWinning", "BallWinning"],
    ["defensiveEngagement", "DefensiveEngagement"], ["aggression", "Aggression"],
    ["gkAwareness", "GKAwareness"], ["gkCatching", "GKCatching"], ["gkParrying", "GKClearing"],
    ["gkReflexes", "GKReflexes"], ["gkReach", "GKReach"], ["gkClearing", "GKClearing"],
  ];
  const maxCol = (c: string): string => `max${c.charAt(0).toUpperCase()}${c.slice(1)}`;
  const selectCols = [
    "PlayerID", "Name", "Country", "Shirt", "ShirtNational", "Height", "Weight", "Age", "StrongerFoot",
    "RegisteredPosition", "PlayerType", "WeakFootUsage", "WeakFootAccuracy", "Form", "InjuryResistance",
    "OverallPotential", "Stars", "Reputation", "DatapackID", "Condition", "LevelCap", "BoostID", "BoostID2",
    "PlayingStyles", "PlayingStylesDefensive",
    ...new Set(BASE_STATS.flatMap(([, e]) => [e, `MAX${e}`])),
    ...POSITIONS, ...overallCols,
  ];
  for (const mid of missingIds) {
    if (!Number.isSafeInteger(mid)) throw new Error(`bad missing id ${mid}`);
    const exists = await prisma.player.findUnique({ where: { id: BigInt(mid) }, select: { id: true } });
    if (exists) { console.log(`  · id=${mid} already exists, skip`); continue; }
    const rows = sql<Record<string, unknown>>(
      `SELECT ${selectCols.join(", ")} FROM ${PLAYER_TABLE} WHERE PlayerID = ${mid}`,
    );
    const r = rows[0];
    if (!r) { console.log(`  ⚠ id=${mid} not in efhub SQLite, skip`); continue; }
    const name = typeof r.Name === "string" ? r.Name : "Unknown";
    const countryName = efhubCountryName.get(int(r.Country, -1));
    const condIdx = int(r.Condition, -1);
    const registeredPosition = int(r.RegisteredPosition, 0);
    const data: Record<string, unknown> = {
      id: BigInt(mid),
      baseId: BigInt(mid),
      name,
      nameNormalized: normalizeName(name),
      shirt: typeof r.Shirt === "string" ? r.Shirt : null,
      shirtNational: typeof r.ShirtNational === "string" ? r.ShirtNational : null,
      nationalityId: countryName ? (countryNameToId.get(countryName) ?? 0) : 0,
      height: int(r.Height, 170),
      weight: int(r.Weight, 70),
      age: int(r.Age, 25),
      strongerFoot: int(r.StrongerFoot, 0),
      registeredPosition: registeredPosition >= 0 && registeredPosition < POSITIONS.length ? registeredPosition : 0,
      playingStyleAttack: int(r.PlayingStyles, 0),
      playingStyleDefense: int(r.PlayingStylesDefensive, 0),
      cardType: PLAYER_TYPE_MAP[int(r.PlayerType, 1)] ?? "STANDARD",
      // No display OVR exists for these cards (see header) — placeholders.
      ovr: 40,
      maxOvr: 40,
      condition: CONDITION_LETTERS[condIdx] ?? "C",
      form: int(r.Form, 1),
      injuryResistance: int(r.InjuryResistance, 1),
      weakFootUsage: int(r.WeakFootUsage, 0),
      weakFootAccuracy: int(r.WeakFootAccuracy, 0),
      releaseDate: null,
      datapackId: int(r.DatapackID, 20251204),
      levelCap: int(r.LevelCap, 0) > 0 ? int(r.LevelCap, 50) : 50,
      stars: int(r.Stars, 0),
      reputation: int(r.Reputation, 0),
      overallPotential: int(r.OverallPotential, 0),
      communityTier: tierById.get(mid) ?? null,
      boosterId1: int(r.BoostID, 0) > 0 ? int(r.BoostID, 0) : null,
      boosterId2: int(r.BoostID2, 0) > 0 ? int(r.BoostID2, 0) : null,
    };
    for (const [col, efhubCol] of BASE_STATS) {
      data[col] = int(r[efhubCol], 40);
      data[maxCol(col)] = Math.max(int(r[`MAX${efhubCol}`], 40), int(r[efhubCol], 40));
    }
    for (let i = 0; i < POSITIONS.length; i++) {
      data[`pos${POSITIONS[i]}`] = inv(r[POSITIONS[i]!]);
      data[ratingCols[i]!] = intOrNull(r[overallCols[i]!]);
    }
    await prisma.player.create({ data: data as unknown as Prisma.PlayerUncheckedCreateInput });
    console.log(`  + ${name} (id=${mid}, country=${countryName ?? "?"}, card=${String(data.cardType)}, pos=${POSITIONS[registeredPosition] ?? "?"}, rep=${String(data.reputation)}, ★${String(data.stars)})`);
  }

  console.log(`\nseed-efhub-crossfill: done in ${((Date.now() - t0) / 1000) | 0}s`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("seed-efhub-crossfill: FAILED", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
