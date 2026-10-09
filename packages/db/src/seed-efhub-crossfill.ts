// seed-efhub-crossfill.ts — cross-fill eflab Postgres from the eFHUB CDN SQLite
// dump. Run AFTER `pnpm db:seed` (efootbase seeder populates the base 48.407
// players + 65 managers + 34 leagues + 707 teams + 51 boosters + 24 featured
// bundles). This script only fills gaps efootbase leaves:
//
//   Phase 1  Manager tactic ratings — expand eflab Manager from 65 (efootbase
//           APK, with R2 art) to the full 1.455 efhub coaches (deduped by
//           name, highest MarketValue wins). Existing 65 keep imageUrl +
//           booster1Stat/booster2Stat + rating from efootbase; we only
//           overwrite tactic fields. 1.390 new managers get no art (nullable;
//           the card component falls back to a gradient + initial).
//   Phase 2  Player cross-fill — `stars` (1-5 ★), `reputation` (efhub rarity,
//           91% covered), `overallPotential` (max-level ceiling, build sim),
//           `gkClearing` (6th GK stat — eflab only had 5; efootbase API
//           exposes none of these). efootbase ovr/stats are NOT touched.
//   Phase 2b registeredPosition — efhub `RegisteredPosition` (0-12, same index
//           order as eflab POSITIONS) overrides the aptitude-inference that
//           the efootbase seeder does (which wrongly files playmakers like
//           Kaká as SS instead of AMF since SS has aptitude-priority over AMF).
//           efhub reads the value straight from Konami game data.
//   Phase 3  player_tiers (10.763) → `Player.communityTier` (S+/S/A/B/C/D/E).
//   Phase 4  3 real players missing from efootbase: Ismail Nasrallah (Qatar
//           GK), Safi Belal (Qatar GK), Robert Lewandowski (Poland CF special
//           card — base 40002 already in eflab; this is a different special
//           card variant). efhub `Overall` cannot be used for display ovr
//           (it's a weighted raw value 40-120, not the 40-99 display OVR eflab
//           uses), so missing players are inserted with ovr/maxOvr=40 as
//           placeholders. R2 has no art for them (404) → gradient fallback.
//
// eflab's primary source stays efootbase (CLAUDE.md "Out of scope" still bans
// efhub as a *primary* player-data source). This script uses efhub only as a
// *secondary* cross-fill for fields efootbase structurally cannot expose.
//
// Usage:  set -a; source .env; set +a; pnpm db:crossfill
// Env:    DATABASE_URL (Postgres), EFHUB_DB_PATH (optional; default
//         dump/efhub/efhub_db.sqlite). SQLite is read via the `sqlite3` CLI
//         (no native binding / no new npm dependency) at /Applications/ServBay/bin/sqlite3.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "./client.js";
import type { CardType, Prisma } from "./generated/client.js";

const __dirname = new URL(".", import.meta.url).pathname;
const EFHUB_DB = process.env.EFHUB_DB_PATH
  ?? resolve(__dirname, "../../../dump/efhub/efhub_db.sqlite");

// efhub player table is named "player export" (with a space) → quote in SQL.
const PLAYER_TABLE = `"player export"`;

/** Run a sqlite3 query, return parsed JSON rows (empty array if no rows). */
function sql<T = Record<string, unknown>>(query: string): T[] {
  const bin = process.env.SQLITE3_BIN ?? "sqlite3";
  const out = execFileSync(bin, ["-json", EFHUB_DB, query], {
    maxBuffer: 512 * 1024 * 1024,
    encoding: "utf-8",
  });
  const trimmed = out.trim();
  return trimmed ? (JSON.parse(trimmed) as T[]) : [];
}

// ──────────────────────────────────────────────────────────────────────────
// efhub → eflab position-aptitude inversion. efhub encodes 2=full/apt,
// 1=partial, 0=none — the SAME as efootbase, and OPPOSITE of eflab prisma
// (0=registered, 1=partial, 2=none). Invert 0↔2; leave 1 as-is.
const inv = (v: number | undefined | null): number =>
  v === 2 ? 0 : v === 0 ? 2 : 1;

// efhub RegisteredPosition enum is already the eflab POSITION_BY_INDEX
// (GK=0, CB=1, LB=2, RB=3, DMF=4, CMF=5, LMF=6, RMF=7, AMF=8, LWF=9, RWF=10,
// SS=11, CF=12) — same convention, no mapping needed.

// efhub PlayerType → eflab CardType (cross-ref'd against eflab cards by id:
// PlayerType 6 = SHOW_TIME [Ronaldo 105557142802858], 3 = EPIC
// [Ronaldo/EPIC, Lewa/EPIC], 2 = BIG_TIME [Ronaldo BIG_TIME 70376260374954],
// 1 = STANDARD, others default to STANDARD for safety).
const PLAYER_TYPE_MAP: Record<number, CardType> = {
  1: "STANDARD", 2: "BIG_TIME", 3: "EPIC", 6: "SHOW_TIME",
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
  // efhub coaches: 1.527 incl. 9 "Manager" placeholders. Adaptability is
  // always 0 (efhub doesn't track it) — skip reading it. ORDER BY
  // MarketValue DESC so first occurrence of each name is the best version.
  const coaches = sql<CoachRow>(
    `SELECT Id, coachesName, Country, Age, PossessionGame, QuickCounter,
            LongBallCounter, OutWide, LongBall, OverLoad, Affinity, MarketValue
     FROM coaches WHERE coachesName != 'Manager'
     ORDER BY MarketValue DESC, Id ASC`,
  );
  // Dedupe by coachesName, keep highest-MarketValue row.
  const seenNames = new Set<string>();
  const deduped: CoachRow[] = [];
  const coachByName = new Map<string, CoachRow>(); // lowercase name → best coach
  for (const c of coaches) {
    if (seenNames.has(c.coachesName)) continue;
    seenNames.add(c.coachesName);
    deduped.push(c);
    coachByName.set(c.coachesName.toLowerCase(), c);
  }
  console.log(`  efhub coaches: ${coaches.length} → deduped: ${deduped.length}`);

  const existingManagers = await prisma.manager.findMany({
    select: { id: true, name: true, imageUrl: true, rating: true, booster1Stat: true, booster2Stat: true },
  });
  const existingById = new Map(existingManagers.map((m) => [m.id.toString(), m]));
  let mgrUpdated = 0;
  let mgrCreated = 0;
  let mgrMergedByName = 0;
  type PendingCreate = { id: bigint; coach: CoachRow; tacticData: Record<string, number> };
  const pendingCreates: PendingCreate[] = [];
  for (const c of deduped) {
    const id = BigInt(c.Id);
    const ex = existingById.get(c.Id.toString());
    const tacticData = {
      age: c.Age ?? 50,
      country: c.Country ?? 0,
      adaptability: 0, // efhub stores 0 for all coaches — no real data
      affinity: c.Affinity ?? 0,
      marketValue: c.MarketValue ?? 0,
      possessionGame: c.PossessionGame ?? 0,
      quickCounter: c.QuickCounter ?? 0,
      longBallCounter: c.LongBallCounter ?? 0,
      outWide: c.OutWide ?? 0,
      longBall: c.LongBall ?? 0,
      overload: c.OverLoad ?? 0,
    };
    if (ex) {
      // Existing row matches efhub coach by Konami id (the efootbase-managed
      // 65 + any efhub-only rows from a prior run). Update tactic fields; keep
      // imageUrl + booster stat fields + rating from efootbase if present.
      await prisma.manager.update({ where: { id }, data: tacticData });
      mgrUpdated++;
    } else {
      // First run for this efhub coach (no eflab row with its id yet). Decide
      // create-vs-skip via a NAME check below — handled after the loop, so the
      // id-based path here is a plain create guarded against name clashes.
      // We DON'T create here if a no-art duplicate would collide with an art
      // row of the same name (see name-merge pass below).
      pendingCreates.push({ id, coach: c, tacticData });
    }
  }

  // Name-merge pass: for every eflab manager that HAS art (efootbase) but has
  // possessionGame == 0 (efhub tactic never filled — because the efootbase
  // Konami id didn't match any efhub coach id), fill its tactic from the
  // efhub coach of the SAME name. This collapses "art row (no tactic) +
  // separate no-art row (with tactic)" into one art row that has both.
  // Idempotent — only touches art rows still sitting at poss=0.
  //
  // efhub stores coach names WITHOUT accents AND often abbreviates (e.g.
  // "D. Deschamps" vs efootbase "Didier Deschamps", "Ruben Amorim" vs "Rúben
  // Amorim", "P. Kluivert" vs "Patrick Kluivert"). Direct lower-case match
  // finds most; the ALIASES map below catches the abbreviated/accent-
  // divergent remainder that the first pass misses.
  const ALIASES: Record<string, string> = {
    "josé mourinho": "Jose Mourinho",
    "rúben amorim": "Ruben Amorim",
    "ståle solbakken": "Stale Solbakken",
    "niko kovač": "Niko Kovac",
    "hansi flick": "Hansi Flick",
    "frank rijkaard": "Frank Rijkaard",
    "johan cruyff": "Johan Cruyff",
    "frank lampard": "Frank Lampard",
    "simone inzaghi": "Simone Inzaghi",
    "didier deschamps": "D. Deschamps",
    "patrick kluivert": "P. Kluivert",
    "franz beckenbauer": "F. Beckenbauer",
    "julian nagelsmann": "J. Nagelsmann",
    "olimpio henriques": "Joao Henriques",
    // Roberto Martínez and Vincenzo Montella have NO efhub coach at all;
    // these keep tactic=0 with their art (no data to fill from).
  };
  const artRows = await prisma.manager.findMany({
    where: { imageUrl: { not: null }, possessionGame: 0 },
    select: { id: true, name: true },
  });
  for (const m of artRows) {
    const key = m.name.toLowerCase();
    const alt = ALIASES[key];
    const c = alt ? coachByName.get(alt.toLowerCase()) : coachByName.get(key);
    if (!c) continue;
    await prisma.manager.update({
      where: { id: m.id },
      data: {
        age: c.Age ?? 50, country: c.Country ?? 0, affinity: c.Affinity ?? 0,
        marketValue: c.MarketValue ?? 0, possessionGame: c.PossessionGame ?? 0,
        quickCounter: c.QuickCounter ?? 0, longBallCounter: c.LongBallCounter ?? 0,
        outWide: c.OutWide ?? 0, longBall: c.LongBall ?? 0, overload: c.OverLoad ?? 0,
      },
    });
    mgrMergedByName++;
  }

  // Now create efhub-only managers, but skip any whose name matches an art
  // row that already exists (art already got tactic from the merge pass; a
  // second no-art row of the same name would just be a UI duplicate).
  const allArtNames = new Set(
    (await prisma.manager.findMany({ where: { imageUrl: { not: null } }, select: { name: true } }))
      .map((m) => m.name.toLowerCase()),
  );
  for (const { id, coach, tacticData } of pendingCreates) {
    if (allArtNames.has(coach.coachesName.toLowerCase())) continue;
    await prisma.manager.create({
      data: {
        id,
        name: coach.coachesName,
        ...tacticData,
        accentedName: null, japName: null, chineseName: null, rating: 0,
        imageUrl: null, boostId1: null, boostId2: null,
        booster1Stat: null, booster2Stat: null,
      },
    });
    mgrCreated++;
  }

  // Delete stale no-art duplicates from an earlier id-only run whose name
  // now collides with an art row (the art row now carries tactic via merge).
  // Safe: only kills imageUrl IS NULL rows whose name matches an art row.
  const dup = await prisma.manager.findMany({ where: { imageUrl: null }, select: { id: true, name: true } });
  const dupToDelete = dup.filter((d) => allArtNames.has(d.name.toLowerCase()));
  if (dupToDelete.length > 0) {
    await prisma.manager.deleteMany({ where: { id: { in: dupToDelete.map((d) => d.id) } } });
    console.log(`  deleted ${dupToDelete.length} no-art duplicate managers (name == art row)`);
  }
  const finalTotal = existingManagers.length + mgrCreated - dupToDelete.length;
  console.log(`  managers: ${mgrUpdated} updated by id + ${mgrMergedByName} merged by name (art+ tactic) + ${mgrCreated} created (no art) = ${finalTotal} total`);

  // ── Phase 2: Player cross-fill (stars / reputation / overallPotential / gkClearing) ──
  console.log("\nphase 2: cross-fill Player stars/reputation/overallPotential/gkClearing…");
  type FillRow = {
    PlayerID: number; Stars: number; Reputation: number; OverallPotential: number;
    GKClearing: number;
  };
  const fills = sql<FillRow>(
    `SELECT PlayerID, Stars, Reputation, OverallPotential, GKClearing FROM ${PLAYER_TABLE}`,
  );
  console.log(`  efhub player rows: ${fills.length}`);

  const BATCH = 1000;
  let fillUpdated = 0;
  for (let i = 0; i < fills.length; i += BATCH) {
    const batch = fills.slice(i, i + BATCH);
    const idList = batch.map((r) => r.PlayerID).join(",");
    // CASE per id for one round-trip UPDATE. Only update rows that exist in
    // eflab (WHERE id IN (...)) — efhub-only players (e.g. "Face Edit NN"
    // placeholders) are silently skipped because they aren't in eflab. 4 of
    // the 4 EFHUB-only "real" players are handled by Phase 4 (the 3 missing +
    // Lewandowski special). Reputation default 0 keeps eflab rows without
    // efhub data unchanged (NULL reputation → COALESCE).
    const starsCases = batch.map((r) => `WHEN ${r.PlayerID} THEN ${r.Stars ?? 0}`).join(" ");
    const repCases = batch.map((r) => `WHEN ${r.PlayerID} THEN ${r.Reputation ?? 0}`).join(" ");
    const potCases = batch.map((r) => `WHEN ${r.PlayerID} THEN ${r.OverallPotential ?? 0}`).join(" ");
    const gkcCases = batch.map((r) => `WHEN ${r.PlayerID} THEN ${r.GKClearing ?? 40}`).join(" ");
    await prisma.$executeRawUnsafe(
      `UPDATE "Player" SET
         "stars"             = CASE id ${starsCases} END,
         "reputation"        = CASE id ${repCases} END,
         "overallPotential"  = CASE id ${potCases} END,
         "gkClearing"         = CASE id ${gkcCases} END
       WHERE id IN (${idList})`,
    );
    fillUpdated += batch.length;
    if (Math.floor(fillUpdated / 5000) !== Math.floor((fillUpdated - BATCH) / 5000)) {
      console.log(`  ${fillUpdated}/${fills.length} processed…`);
    }
  }
  console.log(`  players batched: ${fillUpdated} (only rows present in eflab update)`);

  // ── Phase 2b: registeredPosition cross-fill ───────────────────────────────
  // efootbase dump has no `registered_position` field — eflab's seeder infers it
  // from the position-aptitude array by priority (GK>CF>SS>RWF>...>AMF>...), which
  // lands playmakers like Kaká/De Bruyne/Bruno Fernandes on SS instead of AMF
  // (they have full aptitude at both; SS was simply ordered first). efootbase's
  // own card render shows the correct AMF because efootbase reads the registered
  // position from Konami game data, not aptitude inference.
  //
  // efhub's `RegisteredPosition` (INTEGER 0-12) uses the SAME index order as
  // eflab's POSITIONS: GK=0,CB=1,LB=2,RB=3,DMF=4,CMF=5,LMF=6,RMF=7,AMF=8,
  // LWF=9,RWF=10,SS=11,CF=12. Verified 2026-10-07 against known players
  // (Neuer=0=GK, Marquinhos=1=CB, Han Kook-Young=4=DMF, James Milner=5=CMF,
  //  Bruno Fernandes/Kaka/De Bruyne=8=AMF, Salah=10=RWF, Messi=11=SS,
  //  Lewandowski/Haaland/Kane/CR7=12=CF). We cross-fill it directly so eflab's
  // card position matches efootbase's card position exactly.
  console.log("\nphase 2b: cross-fill Player.registeredPosition from efhub…");
  type PosRow = { PlayerID: number; RegisteredPosition: number };
  const posRows = sql<PosRow>(
    `SELECT PlayerID, RegisteredPosition FROM ${PLAYER_TABLE} WHERE RegisteredPosition IS NOT NULL AND RegisteredPosition BETWEEN 0 AND 12`,
  );
  console.log(`  efhub position rows: ${posRows.length}`);
  let posUpdated = 0;
  for (let i = 0; i < posRows.length; i += BATCH) {
    const batch = posRows.slice(i, i + BATCH);
    const idList = batch.map((r) => r.PlayerID).join(",");
    const cases = batch
      .map((r) => `WHEN ${r.PlayerID} THEN ${r.RegisteredPosition}`)
      .join(" ");
    await prisma.$executeRawUnsafe(
      `UPDATE "Player" SET "registeredPosition" = CASE id ${cases} END WHERE id IN (${idList})`,
    );
    posUpdated += batch.length;
    if (Math.floor(posUpdated / 5000) !== Math.floor((posUpdated - BATCH) / 5000)) {
      console.log(`  ${posUpdated}/${posRows.length} processed…`);
    }
  }
  console.log(`  registeredPosition batched: ${posUpdated}`);

  // ── Phase 3: player_tiers → communityTier ─────────────────────────────
  console.log("\nphase 3: cross-fill Player.communityTier from efhub player_tiers…");
  // efhub stores playerID as TEXT (e.g. "100150"); tier ∈ {S+,S,A,B,C,D,E}.
  type TierRow = { playerID: string; tier: string };
  const tiers = sql<TierRow>(`SELECT playerID, tier FROM player_tiers`);
  console.log(`  efhub tier rows: ${tiers.length} (S+ 2370, S 3933, A 2402, B 1363, C 333, D 100, E 262)`);
  let tierUpdated = 0;
  for (let i = 0; i < tiers.length; i += BATCH) {
    const batch = tiers.slice(i, i + BATCH);
    const idList = batch.map((r) => r.playerID).join(",");
    const cases = batch
      .map((r) => `WHEN ${r.playerID} THEN '${r.tier.replace(/'/g, "''")}'`)
      .join(" ");
    await prisma.$executeRawUnsafe(
      `UPDATE "Player" SET "communityTier" = CASE id ${cases} END WHERE id IN (${idList})`,
    );
    tierUpdated += batch.length;
  }
  console.log(`  tiers updated: ${tierUpdated}`);

  // ── Phase 4: 3 missing players ─────────────────────────────────────────
  console.log("\nphase 4: insert 3 players missing from efootbase…");
  const missingIds = [8554053n, 8554076n, 123236838841410n];
  // Map efhub Country (Konami numeric) → eflab Country.id (efootbase name
  // sequence). Only the 2 we need; others would need a name lookup.
  const efhubCountryName = new Map<number, string>([[30, "Qatar"], [227, "Poland"]]);
  const eflabCountries = await prisma.country.findMany({
    where: { name: { in: [...efhubCountryName.values()] } },
    select: { id: true, name: true },
  });
  const countryNameToId = new Map(eflabCountries.map((c) => [c.name, c.id]));

  type PlayerFullRow = {
    PlayerID: number; Name: string; Country: number; Shirt: string; ShirtNational: string;
    Height: number; Weight: number; Age: number; StrongerFoot: number;
    RegisteredPosition: number; PlayerType: number;
    OffensiveAwareness: number; BallControl: number; Dribbling: number; TightPossession: number;
    LowPass: number; LoftedPass: number; Finishing: number; Heading: number; PlaceKicking: number;
    Curl: number; Speed: number; Acceleration: number; KickingPower: number; Jump: number;
    PhysicalContact: number; Balance: number; Stamina: number; DefensiveAwareness: number;
    BallWinning: number; DefensiveEngagement: number; Aggression: number;
    GKAwareness: number; GKCatching: number; GKClearing: number;
    GKReflexes: number; GKReach: number;
    WeakFootUsage: number; WeakFootAccuracy: number; Form: number; InjuryResistance: number;
    OverallPotential: number; Stars: number; Reputation: number; MarketValue: number;
    DatapackID: number; Condition: number; LevelCap: number; BoostID: number; BoostID2: number;
    GK: number; CB: number; LB: number; RB: number; DMF: number; CMF: number;
    LMF: number; RMF: number; AMF: number; LWF: number; RWF: number; SS: number; CF: number;
  };
  for (const mid of missingIds) {
    const exists = await prisma.player.findUnique({ where: { id: mid }, select: { id: true } });
    if (exists) {
      console.log(`  · id=${mid} already exists, skip`);
      continue;
    }
    const rows = sql<PlayerFullRow>(
      `SELECT PlayerID, Name, Country, Shirt, ShirtNational, Height, Weight, Age,
              StrongerFoot, RegisteredPosition, PlayerType,
              OffensiveAwareness, BallControl, Dribbling, TightPossession, LowPass,
              LoftedPass, Finishing, Heading, PlaceKicking, Curl, Speed, Acceleration,
              KickingPower, Jump, PhysicalContact, Balance, Stamina, DefensiveAwareness,
              BallWinning, DefensiveEngagement, Aggression, GKAwareness, GKCatching,
              GKClearing, GKReflexes, GKReach, WeakFootUsage, WeakFootAccuracy,
              Form, InjuryResistance, OverallPotential, Stars, Reputation, MarketValue,
              DatapackID, Condition, LevelCap, BoostID, BoostID2,
              GK, CB, LB, RB, DMF, CMF, LMF, RMF, AMF, LWF, RWF, SS, CF
       FROM ${PLAYER_TABLE} WHERE PlayerID = ${mid}`,
    );
    if (rows.length === 0) {
      console.log(`  ⚠ id=${mid} not in efhub SQLite, skip`);
      continue;
    }
    const r = rows[0]!;
    const cardType: CardType = PLAYER_TYPE_MAP[r.PlayerType] ?? "STANDARD";
    const countryName = efhubCountryName.get(r.Country);
    const nationalityId = countryName ? (countryNameToId.get(countryName) ?? 0) : 0;
    // efhub Condition: 1-5 A-E; default "B". efhub 2 = "A", 3 = "B" per the 3
    // missing (Ismail/Safi Cond=2, Lewa Cond=3). Map 1=A,2=B,3=C,4=D,5=E by
    // the eflab condition-letter convention is unknown — use a simple
    // offset from 'A'. letter = String.fromCharCode(64 + Condition) → 1=A,2=B...
    const condLetter = r.Condition >= 1 && r.Condition <= 5
      ? String.fromCharCode(64 + r.Condition)
      : "B";
    await prisma.player.create({
      data: {
        id: mid,
        baseId: mid,
        name: r.Name ?? "Unknown",
        accentedName: null,
        japName: null,
        chineseName: null,
        shirt: r.Shirt ?? null,
        shirtNational: r.ShirtNational ?? null,
        nationalityId,
        country2Id: null,
        height: r.Height ?? 170,
        weight: r.Weight ?? 70,
        age: r.Age ?? 25,
        strongerFoot: r.StrongerFoot ?? 0,
        registeredPosition: r.RegisteredPosition ?? 0,
        playingStyleAttack: 0,
        playingStyleDefense: 0,
        cardType,
        featuredPackId: null,
        dreamTeam: false,
        teamId: null,
        // efhub `Overall` is a weighted raw value (40-120), NOT the 40-99
        // display OVR eflab uses. We have no authoritative display OVR for
        // these 3 cards from any source (R2 also 404s). Insert placeholders;
        // user can correct later when data emerges. See gap-analysis §2b.
        ovr: 40,
        maxOvr: 40,
        condition: condLetter,
        form: r.Form ?? 1,
        injuryResistance: r.InjuryResistance ?? 1,
        weakFootUsage: r.WeakFootUsage ?? 0,
        weakFootAccuracy: r.WeakFootAccuracy ?? 0,
        releaseDate: null,
        datapackId: r.DatapackID ?? 20251204,
        levelCap: r.LevelCap && r.LevelCap > 0 ? r.LevelCap : 50,
        cost: 0,
        variation: 0,
        stars: r.Stars ?? 0,
        marketValue: 0, // efhub MarketValue const 100 — useless, skip
        reputation: r.Reputation ?? 0,
        overallPotential: r.OverallPotential ?? 0,
        boosterId1: r.BoostID && r.BoostID > 0 ? r.BoostID : null,
        boosterId2: r.BoostID2 && r.BoostID2 > 0 ? r.BoostID2 : null,
        views: 0,
        ratingCount: 0,
        avgRating: null,
        // 26 base stats
        offensiveAwareness: r.OffensiveAwareness ?? 40,
        ballControl: r.BallControl ?? 40,
        dribbling: r.Dribbling ?? 40,
        tightPossession: r.TightPossession ?? 40,
        lowPass: r.LowPass ?? 40,
        loftedPass: r.LoftedPass ?? 40,
        finishing: r.Finishing ?? 40,
        heading: r.Heading ?? 40,
        placeKicking: r.PlaceKicking ?? 40,
        curl: r.Curl ?? 40,
        speed: r.Speed ?? 40,
        acceleration: r.Acceleration ?? 40,
        kickingPower: r.KickingPower ?? 40,
        jump: r.Jump ?? 40,
        physicalContact: r.PhysicalContact ?? 40,
        balance: r.Balance ?? 40,
        stamina: r.Stamina ?? 40,
        defensiveAwareness: r.DefensiveAwareness ?? 40,
        ballWinning: r.BallWinning ?? 40,
        defensiveEngagement: r.DefensiveEngagement ?? 40,
        aggression: r.Aggression ?? 40,
        gkAwareness: r.GKAwareness ?? 40,
        gkCatching: r.GKCatching ?? 40,
        gkParrying: 40, // efhub has no GKParrying column; efootbase does (we sync efootbase elsewhere)
        gkClearing: r.GKClearing ?? 40,
        gkReflexes: r.GKReflexes ?? 40,
        gkReach: r.GKReach ?? 40,
        // 26 max stats default 40 (efhub MAX* columns exist but we don't
        // fetch them here to keep the row slim; eflab derives max = base for
        // plain rows — build simulator uses overallPotential instead).
        maxOffensiveAwareness: r.OffensiveAwareness ?? 40,
        maxBallControl: r.BallControl ?? 40,
        maxDribbling: r.Dribbling ?? 40,
        maxTightPossession: r.TightPossession ?? 40,
        maxLowPass: r.LowPass ?? 40,
        maxLoftedPass: r.LoftedPass ?? 40,
        maxFinishing: r.Finishing ?? 40,
        maxHeading: r.Heading ?? 40,
        maxPlaceKicking: r.PlaceKicking ?? 40,
        maxCurl: r.Curl ?? 40,
        maxSpeed: r.Speed ?? 40,
        maxAcceleration: r.Acceleration ?? 40,
        maxKickingPower: r.KickingPower ?? 40,
        maxJump: r.Jump ?? 40,
        maxPhysicalContact: r.PhysicalContact ?? 40,
        maxBalance: r.Balance ?? 40,
        maxStamina: r.Stamina ?? 40,
        maxDefensiveAwareness: r.DefensiveAwareness ?? 40,
        maxBallWinning: r.BallWinning ?? 40,
        maxDefensiveEngagement: r.DefensiveEngagement ?? 40,
        maxAggression: r.Aggression ?? 40,
        maxGkAwareness: r.GKAwareness ?? 40,
        maxGkCatching: r.GKCatching ?? 40,
        maxGkParrying: 40, // efhub has no GKParrying; placeholder
        maxGkClearing: r.GKClearing ?? 40,
        maxGkReflexes: r.GKReflexes ?? 40,
        maxGkReach: r.GKReach ?? 40,
        // 13 position aptitudes — efhub 2=full,1=partial,0=none → invert.
        posGK: inv(r.GK),
        posCB: inv(r.CB),
        posLB: inv(r.LB),
        posRB: inv(r.RB),
        posDMF: inv(r.DMF),
        posCMF: inv(r.CMF),
        posLMF: inv(r.LMF),
        posRMF: inv(r.RMF),
        posAMF: inv(r.AMF),
        posLWF: inv(r.LWF),
        posRWF: inv(r.RWF),
        posSS: inv(r.SS),
        posCF: inv(r.CF),
        // 13 position OVR ratings — without an authoritative display OVR
        // (efhub Overall is raw-weighted, R2 404s), all 40 placeholders.
        ratingGK: 40, ratingCB: 40, ratingLB: 40, ratingRB: 40, ratingDMF: 40,
        ratingCMF: 40, ratingLMF: 40, ratingRMF: 40, ratingAMF: 40,
        ratingLWF: 40, ratingRWF: 40, ratingSS: 40, ratingCF: 40,
      } satisfies Prisma.PlayerUncheckedCreateInput,
    });
    console.log(`  + ${r.Name} (id=${r.PlayerID}, country=${countryName ?? "?"} #${nationalityId}, card=${cardType}, rep=${r.Reputation}, ★${r.Stars})`);
  }

  console.log(`\nseed-efhub-crossfill: done in ${((Date.now() - t0) / 1000) | 0}s`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
