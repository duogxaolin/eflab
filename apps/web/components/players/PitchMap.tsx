"use client";
import type { Position } from "@eflab/shared";
import { statTierClass } from "@/lib/card-display";

// Pitch Map of the player detail page. The 13 values are computed by the
// caller with the exact overall formula (`positionTiles` in @eflab/shared,
// change efootbase-exact-model-managers) from the stats on display, so every
// card has a value at every position — the stored eFHUB ratings are not shown.
//
// Geometry and colours (pitch-hover-1023, measured on the 2026-10-20
// reference capture of the detail page, our own markup and class names):
// a #272727 box (radius 12, padding 16) holding only the pitch, 350 × 320 at
// most — one CSS grid of 1fr / 2fr / 1fr columns (86 / 172 / 86 px) and seven
// equal rows, 3 px apart. The centre column is seven full-width "row" cells
// (CF, SS, AMF, CMF, DMF, CB, GK: label and badge side by side); each side
// column is three "stack" cells (label above badge) spanning 2 / 3 / 2 rows
// (LWF LMF LB, RWF RMF RB). Cells radius 6 with a 1 px #ffffff14 inner edge;
// fills: full #7DFF1F at 70 %, half #7DFF1F at 30 % (derived from the
// capture's pixels — it has no colour token for it), none #262626 at 80 %.
// The overall sits in a dark badge (#181818 at 90 %, 1 px #ffffff21 edge,
// radius 4) in its tier colour. The legend (None / Half / Full) is under the
// box. Deviations, for contrast: the position label is dark on a full cell
// and white on a half one (the reference's muted label reads ~1.6:1 on the
// lime), and the registered position carries an inset 2 px ring.
export interface PitchMapProps {
  positionAptitudes: Record<string, number>;
  tiles: Record<Position, number>;
  registeredPosition: Position | string;
  className?: string;
}

type Proficiency = "full" | "half" | "none";

/** Database aptitude coding: 0 full, 1 half, 2 (or missing) none. */
function proficiencyOf(apt: number | undefined): Proficiency {
  return apt === 0 ? "full" : apt === 1 ? "half" : "none";
}

/** Screen-reader wording of the proficiency (one parallel set of words). */
const SPOKEN: Record<Proficiency, string> = {
  full: "fully proficient",
  half: "half proficient",
  none: "not proficient",
};

/** Cell fill + the position label's colour, softened like the reference's
 *  label but ≥ 4.5:1 on each composited fill (measured on the rendered page:
 *  full: #080d02 at 75 % 5.4:1, half: #fcfcfc at 85 % 5.1:1, none: #a0a0a0
 *  5.9:1). */
const FILL: Record<Proficiency, string> = {
  full: "bg-[#7dff1fb3] text-[#080d02bf]",
  half: "bg-[#7dff1f4d] text-[#fcfcfcd9]",
  none: "bg-[#262626cc] text-[var(--color-text-secondary)]",
};

/** Inner edge of every cell; the registered position's inset ring instead
 *  (dark on the lime fill, the accent on the darker ones — ≥ 3:1 each). */
const EDGE = "shadow-[inset_0_0_0_1px_#ffffff14]";
const RING: Record<Proficiency, string> = {
  full: "shadow-[inset_0_0_0_2px_var(--color-accent-foreground)]",
  half: "shadow-[inset_0_0_0_2px_var(--color-accent)]",
  none: "shadow-[inset_0_0_0_2px_var(--color-accent)]",
};

/** Grid placement: side cells span 2 / 3 / 2 of the seven rows. */
const PLACE: Record<Position, string> = {
  LWF: "col-start-1 row-start-1 row-span-2",
  LMF: "col-start-1 row-start-3 row-span-3",
  LB: "col-start-1 row-start-6 row-span-2",
  CF: "col-start-2 row-start-1",
  SS: "col-start-2 row-start-2",
  AMF: "col-start-2 row-start-3",
  CMF: "col-start-2 row-start-4",
  DMF: "col-start-2 row-start-5",
  CB: "col-start-2 row-start-6",
  GK: "col-start-2 row-start-7",
  RWF: "col-start-3 row-start-1 row-span-2",
  RMF: "col-start-3 row-start-3 row-span-3",
  RB: "col-start-3 row-start-6 row-span-2",
};

/** DOM (and reading) order: left side, centre top to bottom, right side. */
const ORDER: readonly Position[] = ["LWF", "LMF", "LB", "CF", "SS", "AMF", "CMF", "DMF", "CB", "GK", "RWF", "RMF", "RB"];
const SIDE = new Set<Position>(["LWF", "LMF", "LB", "RWF", "RMF", "RB"]);

function PitchCell({ pos, proficiency, rating, registered }: { pos: Position; proficiency: Proficiency; rating: number; registered: boolean }) {
  const stack = SIDE.has(pos);
  // role="img": one accessible name per tile ("LWF, 104 OVR, fully
  // proficient" — WCAG 1.4.1, the proficiency is otherwise only the fill);
  // an aria-label on a plain <div> would be dropped.
  return (
    <div
      role="img"
      aria-label={`${pos}, ${rating} OVR, ${SPOKEN[proficiency]}${registered ? ", registered position" : ""}`}
      className={`flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-md ${PLACE[pos]} ${FILL[proficiency]} ${
        registered ? RING[proficiency] : EDGE
      } ${stack ? "flex-col gap-1.5" : "flex-row gap-1.5"}`}
      data-testid={`pitch-${pos}`}
      data-proficiency={proficiency}
      data-registered={registered ? "true" : undefined}
    >
      <span aria-hidden className="text-xs font-medium leading-none">
        {pos}
      </span>
      {/* Tier colour from the shared `--color-tier-*` tokens (statTierClass). */}
      <span
        aria-hidden
        className={`inline-flex h-[17px] min-w-[26px] shrink-0 items-center justify-center rounded-[4px] border border-[#ffffff21] bg-[#181818e6] px-[5px] text-xs font-semibold leading-none tabular-nums ${statTierClass(rating)}`}
      >
        {rating}
      </span>
    </div>
  );
}

const LEGEND: ReadonlyArray<[Proficiency, string]> = [
  ["none", "None"],
  ["half", "Half"],
  ["full", "Full"],
];

export function PitchMap({ positionAptitudes, tiles, registeredPosition, className = "" }: PitchMapProps) {
  return (
    <div className={`flex w-full min-w-0 flex-col items-center gap-3 ${className}`}>
      <div className="w-full rounded-xl bg-[var(--color-default)] p-4">
        {/* Sized by its container (max 350 × 320): 224 × 205 inside a 320 px
            phone, no horizontal scroll. */}
        <div
          role="group"
          aria-label="Overall at each position"
          className="mx-auto grid w-full max-w-[350px] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] grid-rows-7 gap-[3px]"
          style={{ aspectRatio: "350 / 320" }}
        >
          {ORDER.map((pos) => (
            <PitchCell
              key={pos}
              pos={pos}
              proficiency={proficiencyOf(positionAptitudes[pos])}
              rating={tiles[pos]}
              registered={pos === registeredPosition}
            />
          ))}
        </div>
      </div>

      {/* Proficiency legend: dots in the cell fills on a #272727 pill (the
          fills are translucent, so they need the cells' own background). */}
      <ul className="inline-flex items-center gap-4 rounded-full bg-[var(--color-default)] px-3 py-1 text-xs text-[var(--color-text-secondary)]" aria-label="Position proficiency levels">
        {LEGEND.map(([p, label]) => (
          <li key={p} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${FILL[p]} ${EDGE}`} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
