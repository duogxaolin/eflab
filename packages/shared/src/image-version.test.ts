// Tests for the card-image version helper (openspec change auto-image-version,
// capability card-image-version "Next Version Helper"): every scenario of the
// spec, the day / year rollover, malformed inputs, a 14-digit current and the
// format of every result; a "tamper" section checks the strict-greater rule on
// both sides of the boundary. Same assert-style runner as helpers.test.ts.
// Run: pnpm --filter @eflab/shared test   (or: tsx packages/shared/src/image-version.test.ts)
import { IMAGE_VERSION_MAX_DIGITS, IMAGE_VERSION_MIN_DIGITS, IMAGE_VERSION_RE, clockImageVersion, isImageVersion, nextImageVersion } from "./image-version";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

const utc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi, s));

// ---- format ----
{
  assert(IMAGE_VERSION_MIN_DIGITS === 8 && IMAGE_VERSION_MAX_DIGITS === 14 && String(IMAGE_VERSION_RE) === "/^[0-9]{8,14}$/", "format: 8 to 14 digits (= the database CHECK)");
  assert(isImageVersion("20261024") && isImageVersion("202610281307") && isImageVersion("20261028130755"), "isImageVersion: 8, 12 and 14 digits accepted");
  assert(!isImageVersion("2026102") && !isImageVersion("202610281307551") && !isImageVersion("2026-10-28") && !isImageVersion(" 20261024") && !isImageVersion(""), "isImageVersion: 7 digits, 15 digits, a dash, a space and an empty string refused");
  assert(!isImageVersion(null) && !isImageVersion(undefined) && !isImageVersion(20261024) && !isImageVersion(["20261024"]), "isImageVersion: null, undefined, a number and an array refused");
}

// ---- the clock value ----
{
  assert(clockImageVersion(utc(2026, 10, 28, 13, 7, 31)) === "202610281307", "clock: 2026-10-28 13:07:31 UTC → 202610281307 (seconds dropped)");
  assert(clockImageVersion(utc(2026, 1, 1, 0, 0, 0)) === "202601010000", "clock: months, days, hours and minutes are zero-padded");
  assert(clockImageVersion(new Date("2026-10-28T23:59:59.999-05:00")) === "202610290459", "clock: read in UTC, whatever the zone of the Date");
}

// ---- the spec's scenarios ----
{
  assert(nextImageVersion(utc(2026, 10, 28, 13, 7, 31), "20261024") === "202610281307", "\"Clock ahead\": now 2026-10-28 13:07:31 UTC, current 20261024 → 202610281307");
  assert(nextImageVersion(utc(2026, 10, 28, 13, 7, 59), "202610281307") === "202610281308", "\"Same minute\": current 202610281307 at 13:07:59 → 202610281308");
  assert(nextImageVersion(utc(2026, 10, 28, 13, 7), "202611010000") === "202611010001", "\"Current ahead of the clock\": current 202611010000 at 2026-10-28 13:07 → 202611010001");
  const rolled = nextImageVersion(utc(2026, 12, 31, 23, 59), "202612312359");
  assert(rolled === "202612312360" && isImageVersion(rolled), "\"Day rollover with current ahead\": current 202612312359 at 2026-12-31 23:59 → 202612312360 (still 8–14 digits)");
  assert(nextImageVersion(utc(2027, 1, 1, 0, 0), "202612312360") === "202701010000", "…and a later call at 2027-01-01 00:00 UTC returns 202701010000");
  assert(nextImageVersion(utc(2026, 10, 28, 13, 7), "abc") === "202610281307" && nextImageVersion(utc(2026, 10, 28, 13, 7), null) === "202610281307", "\"Malformed current\": abc or null → the clock value");
  assert(nextImageVersion(utc(2026, 10, 28, 13, 7), undefined) === "202610281307" && nextImageVersion(utc(2026, 10, 28, 13, 7), "") === "202610281307", "undefined or an empty current → the clock value");
  assert(nextImageVersion(utc(2026, 10, 28, 13, 7), "2026-10-28") === "202610281307" && nextImageVersion(utc(2026, 10, 28, 13, 7), "2026102") === "202610281307", "a dashed date or a 7-digit current counts as absent");
}

// ---- strictly greater, every width ----
{
  const now = utc(2026, 10, 28, 13, 7);
  const cases: Array<[string, string]> = [
    ["20261024", "202610281307"], // 8 digits, behind the clock: the clock value
    ["202610281306", "202610281307"], // the minute before: the clock value
    ["202610281307", "202610281308"], // the same minute: +1
    ["99999999", "202610281307"], // 8 nines: above the clock digit by digit, below it as a number: the clock value
    ["999999999999", "999999999999".slice(0, 11) + "9"], // 12 nines ahead of the clock: +1 cannot keep 12 digits — see below
  ];
  cases.pop(); // the 12-nines case is asserted separately (its +1 is 13 digits, still within the format)
  for (const [current, expect] of cases) {
    const got = nextImageVersion(now, current);
    assert(got === expect && Number(got) > Number(current) && isImageVersion(got), `current ${current} → ${got} (expected ${expect}, strictly greater, format kept)`);
  }
  // A 14-digit current ahead of the clock: +1 with the same width (exact below 2^53).
  const wide = nextImageVersion(now, "20261028130755");
  assert(wide === "20261028130756" && wide.length === 14 && isImageVersion(wide), `a 14-digit current ahead of the clock → ${wide} (+1, same width)`);
  // A current of leading zeros is numerically small: the clock wins (the comparison is numeric, not textual).
  assert(nextImageVersion(utc(2000, 1, 1, 0, 0), "00000000000000") === "200001010000", "a current of 14 zeros at 2000-01-01 00:00 → 200001010000 (compared as numbers, the clock wins)");
  // The clock value just above / just below the current: +1 flips exactly at equality.
  assert(nextImageVersion(utc(2026, 10, 28, 13, 8), "202610281307") === "202610281308" && nextImageVersion(utc(2026, 10, 28, 13, 7), "202610281307") === "202610281308", "tamper: at 13:08 the clock wins (202610281308) and at 13:07 the increment gives the same value — never equal to the current");
  assert(nextImageVersion(utc(2026, 10, 28, 13, 6), "202610281307") === "202610281308", "tamper: a clock one minute BEHIND the current still increases (202610281308)");
  // 12 nines ahead of the clock: +1 carries into a 13th digit — longer than the current, still within the format.
  assert(nextImageVersion(now, "999999999999") === "1000000000000", "a current of 12 nines → 1000000000000 (+1 grows to 13 digits, within the format)");
  // The one storable value whose increment leaves the format: 14 nines (the CHECK accepts it; its + 1 has 15
  // digits) → the clock value: numerically smaller, but a different string, so the URL still changes.
  const nines: string = nextImageVersion(now, "99999999999999");
  assert(nines !== "99999999999999" && isImageVersion(nines) && nines === "202610281307","a current of 14 nines (storable, its increment would have 15 digits) → the clock value: not greater, but different and within the format");
  // Every result over a sweep of clocks and currents matches the format and is strictly greater than a valid current.
  let ok = 0;
  let n = 0;
  for (const [y, mo, d, h, mi] of [[2026, 10, 28, 0, 0], [2026, 12, 31, 23, 59], [2027, 1, 1, 0, 0], [2099, 12, 31, 23, 59]] as const) {
    for (const current of ["20261024", "202610281307", "202612312359", "209912312359", "20261028130755", null, "x", "2026-10-28"]) {
      n++;
      const got = nextImageVersion(utc(y, mo, d, h, mi), current);
      if (isImageVersion(got) && (!isImageVersion(current) || Number(got) > Number(current))) ok++;
    }
  }
  assert(ok === n && n === 32, `sweep: ${ok} of ${n} results match the format and exceed a valid current`);
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ image-version tests passed");
