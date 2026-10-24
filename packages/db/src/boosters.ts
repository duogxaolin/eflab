// The 29 basic "+1" boosters a card without its own Booster 2 can take as its
// second booster (change efootbase-function-parity, design decision D4). They
// come from the committed fixture `fixtures/boosters.json` (`basic`, ids
// 1–29 — equal to the reference's "Select second booster" drawer, names and
// four stats each, 29/29), not from the Booster table: there ids 12–29 are the
// dump's scaled "standard" boosters, which the seed writes over the fixture
// rows. The seed is not changed by this module.
//
// The fixture's `bonus[]` follows its own `statKeys` order; each key goes
// through the seed's table (BOOSTER_STAT_MAP → BOOSTER_BONUS_COLUMNS), so a
// reordered or renamed key fails loudly here instead of moving a stat.
// Read once at import (the fixture is part of the package); a fixture that
// breaks the rules below throws — a programming error, like the consistency
// guard of efootbase-map.ts.
import { readFileSync } from "node:fs";
import { BASE_STATS, type BaseStat } from "@eflab/shared";
import { BOOSTER_BONUS_COLUMNS, BOOSTER_STAT_MAP, type FixtureBooster } from "./efootbase-map.js";

/** One basic booster: id, English name ("Striker's Instinct +1") and the
 *  stats it raises (eFootLab stat names, +1 each). */
export interface BasicBooster {
  id: number;
  name: string;
  stats: Partial<Record<BaseStat, number>>;
}

/** Number of basic boosters offered as a second booster (fixture ids 1–29; id 0 is "No Booster"). */
export const BASIC_BOOSTER_COUNT = 29;

const BASE_STAT_SET: ReadonlySet<string> = new Set(BASE_STATS);

/** Builds the list from the fixture's JSON (exported for the tests). */
export function basicBoostersFromFixture(fixture: { statKeys?: unknown; basic?: unknown }, where = "fixtures/boosters.json"): BasicBooster[] {
  const statKeys = fixture.statKeys;
  if (!Array.isArray(statKeys) || statKeys.length !== BOOSTER_BONUS_COLUMNS.length) {
    throw new Error(`${where}: statKeys must list ${BOOSTER_BONUS_COLUMNS.length} keys`);
  }
  // statKeys[i] is the stat of bonus[i]; it must be the seed's column i.
  statKeys.forEach((key, i) => {
    if (typeof key !== "string" || BOOSTER_STAT_MAP[key] !== BOOSTER_BONUS_COLUMNS[i]) {
      throw new Error(`${where}: statKeys[${i}] = ${JSON.stringify(key)} does not map to ${BOOSTER_BONUS_COLUMNS[i]}`);
    }
  });
  if (!Array.isArray(fixture.basic)) throw new Error(`${where}: no basic list`);
  const out: BasicBooster[] = [];
  for (const raw of fixture.basic as FixtureBooster[]) {
    if (raw.id === 0) continue; // "No Booster"
    if (!Number.isInteger(raw.id) || raw.id < 1 || raw.id > BASIC_BOOSTER_COUNT || typeof raw.nameEn !== "string" || !Array.isArray(raw.bonus)) {
      throw new Error(`${where}: malformed basic booster ${JSON.stringify(raw).slice(0, 80)}`);
    }
    const stats: Partial<Record<BaseStat, number>> = {};
    raw.bonus.forEach((v, i) => {
      if (v === 0) return;
      const column = BOOSTER_BONUS_COLUMNS[i];
      if (!column || !BASE_STAT_SET.has(column)) throw new Error(`${where}: basic booster ${raw.id} raises ${column ?? `column ${i}`}, not a base stat`);
      if (v !== 1) throw new Error(`${where}: basic booster ${raw.id} raises ${column} by ${v}, not +1`);
      stats[column as BaseStat] = 1;
    });
    if (Object.keys(stats).length !== 4) throw new Error(`${where}: basic booster ${raw.id} raises ${Object.keys(stats).length} stats, not 4`);
    out.push({ id: raw.id, name: raw.nameEn, stats });
  }
  out.sort((a, b) => a.id - b.id);
  const ids = out.map((b) => b.id);
  if (ids.length !== BASIC_BOOSTER_COUNT || ids.some((id, i) => id !== i + 1)) {
    throw new Error(`${where}: the basic boosters must be ids 1–${BASIC_BOOSTER_COUNT} once each`);
  }
  return out;
}

/** The 29 basic "+1" boosters, ids 1–29 (fixture order = alphabetical by name). */
export const BASIC_BOOSTERS: readonly BasicBooster[] = Object.freeze(
  basicBoostersFromFixture(JSON.parse(readFileSync(new URL("../fixtures/boosters.json", import.meta.url), "utf-8")) as { statKeys?: unknown; basic?: unknown }),
);
