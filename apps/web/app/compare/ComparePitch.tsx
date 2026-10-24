import type { Position } from "@eflab/shared";
import { statTierClass } from "@/lib/card-display";

// The 13 position tiles of one compare slot (change efootbase-function-parity,
// spec "Two-Build Compare"): the overall of the slot's build at every
// position, by the exact formula (`BuildResult.tiles`), with the card's
// proficiency at each position as the fill.
//
// The player page's Pitch Map (components/players/PitchMap.tsx, the
// reference's measured 350 × 320 pitch) does not fit a slot below 768 px —
// two slots side by side leave ~138 px each at 320 px — so the slot uses a
// compact grid of its own: the position filter's pitch rows (LWF CF RWF /
// LMF SS RMF / AMF CMF DMF / LB CB RB / GK), the Pitch Map's fills (full
// #7dff1f at 70 %, half at 30 %, none #262626 at 80 %), its dark tier-coloured
// value badge and its legend. Each tile is `role="img"` named like a Pitch
// Map tile ("LWF, 100 OVR, half proficient"; ", registered position").

const GRID: readonly Position[] = ["LWF", "CF", "RWF", "LMF", "SS", "RMF", "AMF", "CMF", "DMF", "LB", "CB", "RB", "GK"];

type Proficiency = "full" | "half" | "none";
const proficiencyOf = (apt: number | undefined): Proficiency => (apt === 0 ? "full" : apt === 1 ? "half" : "none");

const SPOKEN: Record<Proficiency, string> = {
  full: "fully proficient",
  half: "half proficient",
  none: "not proficient",
};
/** Fill + label colour (the Pitch Map's, each label ≥ 4.5:1 on its fill). */
const FILL: Record<Proficiency, string> = {
  full: "bg-[#7dff1fb3] text-[#080d02bf]",
  half: "bg-[#7dff1f4d] text-[#fcfcfcd9]",
  none: "bg-[#262626cc] text-[var(--color-text-secondary)]",
};
const EDGE = "shadow-[inset_0_0_0_1px_#ffffff14]";
const RING: Record<Proficiency, string> = {
  full: "shadow-[inset_0_0_0_2px_var(--color-accent-foreground)]",
  half: "shadow-[inset_0_0_0_2px_var(--color-accent)]",
  none: "shadow-[inset_0_0_0_2px_var(--color-accent)]",
};
const LEGEND: ReadonlyArray<[Proficiency, string]> = [
  ["none", "None"],
  ["half", "Half"],
  ["full", "Full"],
];

export function ComparePitch({
  tiles,
  positionAptitudes,
  registeredPosition,
  label,
}: {
  tiles: Record<Position, number>;
  positionAptitudes: Record<string, number>;
  registeredPosition: Position;
  /** Accessible name of the group ("Overall at each position, Lionel Messi"). */
  label: string;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2" data-testid="compare-tiles">
      <div role="group" aria-label={label} className="grid w-full grid-cols-3 gap-[3px] rounded-xl bg-[var(--color-default)] p-1.5 sm:p-2">
        {GRID.map((pos) => {
          const proficiency = proficiencyOf(positionAptitudes[pos]);
          const registered = pos === registeredPosition;
          const value = tiles[pos];
          return (
            <div
              key={pos}
              role="img"
              aria-label={`${pos}, ${value} OVR, ${SPOKEN[proficiency]}${registered ? ", registered position" : ""}`}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-0.5 py-1 ${FILL[proficiency]} ${registered ? RING[proficiency] : EDGE} ${
                pos === "GK" ? "col-start-2" : ""
              }`}
              data-testid={`compare-tile-${pos}`}
              data-proficiency={proficiency}
              data-value={value}
              data-registered={registered ? "true" : undefined}
            >
              <span aria-hidden className="text-[11px] font-medium leading-none">
                {pos}
              </span>
              <span
                aria-hidden
                className={`inline-flex h-[17px] min-w-[26px] items-center justify-center rounded-[4px] border border-[#ffffff21] bg-[#181818e6] px-1 text-xs font-semibold leading-none tabular-nums ${statTierClass(value)}`}
              >
                {value}
              </span>
            </div>
          );
        })}
      </div>
      <ul className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-[var(--color-default)] px-3 py-1 text-xs text-[var(--color-text-secondary)]" aria-label="Position proficiency levels">
        {LEGEND.map(([p, text]) => (
          <li key={p} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${FILL[p]} ${EDGE}`} aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
