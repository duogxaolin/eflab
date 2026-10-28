// The card-image cache version (openspec change auto-image-version, design D1
// / D2; capability card-image-version "Stored Card Image Version", "Next
// Version Helper").
//
// Card faces are one R2 object per card, served `immutable` for a year and
// replaced under the SAME key when a card's render changes; the only lever
// that busts browser and edge caches is the `?v=<version>` query of the card
// URL. The version is stored in CatalogueMeta.imageVersion (NULL = nothing
// stored, every consumer falls back to its committed default), raised by the
// sync worker with `nextImageVersion` in the transaction that records a run
// that replaced card images, served by `catalogue.meta` and resolved by the web
// app at request time. Pure: no I/O, no clock reads (the caller passes `now`).

/** The stored-version format: 8 to 14 digits (= the database CHECK "CatalogueMeta_image_version_format"). */
export const IMAGE_VERSION_RE = /^[0-9]{8,14}$/;
export const IMAGE_VERSION_MIN_DIGITS = 8;
export const IMAGE_VERSION_MAX_DIGITS = 14;

/** Whether `v` is a stored-version string (8–14 digits). */
export function isImageVersion(v: unknown): v is string {
  return typeof v === "string" && IMAGE_VERSION_RE.test(v);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The clock value of `now`: UTC `yyyymmddHHmm` (12 digits). */
export function clockImageVersion(now: Date): string {
  return `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}`;
}

/**
 * The next version to store: the clock value of `now` (UTC yyyymmddHHmm) when
 * it is greater, as a number, than a valid `current`; otherwise `current + 1`
 * as a string of the same width — so two raises in the same minute, a clock
 * that moved back and a `current` written by hand ahead of the clock all still
 * increase (strict monotonicity is what makes "the URL changed" a guarantee:
 * an equal value would leave the old cached bytes in place). A null, empty or
 * malformed `current` counts as absent. The result always matches
 * IMAGE_VERSION_RE: a 14-digit `current` is below 10^14 < 2^53, so the
 * increment is exact. One storable value is the exception to "strictly
 * greater": 14 nines (`99999999999999`), which the CHECK accepts but whose
 * increment has 15 digits and leaves the format — for it the clock value (12
 * digits) is returned: numerically smaller, yet a different string, so the
 * URL still changes. No real raise reaches it (the clock values are 12 digits).
 */
export function nextImageVersion(now: Date, current: string | null | undefined): string {
  const clock = clockImageVersion(now);
  if (!isImageVersion(current)) return clock;
  if (Number(clock) > Number(current)) return clock;
  const bumped = String(Number(current) + 1).padStart(current.length, "0");
  return isImageVersion(bumped) ? bumped : clock;
}
