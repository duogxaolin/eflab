"use client";
import type { Position } from "@eflab/shared";
import { statTierClass } from "@/lib/card-display";

// Pitch Map of the player detail page. The 13 values are computed by the
// caller with the exact overall formula (`positionTiles` in @eflab/shared,
// change efootbase-exact-model-managers) from the stats on display, so every
// card has a value at every position — the stored eFHUB ratings are not shown.
//
// Look (efootbase-ui-redesign): the pitch sits on its #181818 tile (the
// caller's), cells radius 8 with a 3–4 px gap — full proficiency solid green,
// half a darker green, none the surface grey with a hairline — position
// 12/500 and the overall in a black pill in its tier colour; the legend
// (None / Half / Full) is under the pitch.
export interface PitchMapProps {
  positionAptitudes: Record<string, number>;
  tiles: Record<Position, number>;
  registeredPosition: Position | string;
  className?: string;
}

const FULL_BG = "bg-[#5cbf2a] text-black";
const HALF_BG = "bg-[#3d6b25] text-white";
const NONE_BG = "bg-[var(--color-elevated)] text-[var(--color-text-secondary)] shadow-[inset_0_0_0_1px_var(--color-line)]";

function cellBg(aptitude: number | undefined): string {
  if (aptitude === 0) return FULL_BG;
  if (aptitude === 1) return HALF_BG;
  return NONE_BG;
}

function aptitudeLabel(apt: number | undefined): string {
  return apt === 0 ? "Full" : apt === 1 ? "Half" : "None";
}

interface PitchCellProps {
  pos: Position;
  aptitudes: Record<string, number>;
  tiles: Record<Position, number>;
  registeredPosition: string;
  layout?: "stack" | "row";
}

function PitchCell({ pos, aptitudes, tiles, registeredPosition, layout = "row" }: PitchCellProps) {
  const apt = aptitudes[pos];
  const rating = tiles[pos];
  const isReg = pos === registeredPosition;

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center rounded-lg ${cellBg(apt)} ${
        isReg ? "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-panel)]" : ""
      } ${layout === "stack" ? "flex-col gap-1 p-1" : "flex-row gap-2 px-2 py-0.5"}`}
      title={`${pos}: ${rating} OVR (${aptitudeLabel(apt)} proficiency)`}
      data-testid={`pitch-${pos}`}
    >
      <span className="text-xs font-medium leading-none">{pos}</span>
      {/* Rating text uses the shared `--color-tier-*` tokens (statTierClass)
          on the black/85 pill, the same contrast as the stat rows. */}
      <span className={`inline-block rounded-[4px] bg-black/85 px-1.5 py-0.5 text-xs font-bold leading-none tabular-nums ${statTierClass(rating)}`}>
        {rating}
      </span>
    </div>
  );
}

export function PitchMap({ positionAptitudes, tiles, registeredPosition, className = "" }: PitchMapProps) {
  const cell = (pos: Position, layout: "stack" | "row") => (
    <PitchCell pos={pos} aptitudes={positionAptitudes} tiles={tiles} registeredPosition={registeredPosition} layout={layout} />
  );
  return (
    <div className={`flex w-full max-w-[350px] flex-col items-center ${className}`}>
      {/* Pitch Diagram (3 columns: Left Wing, Center Spine, Right Wing). Sized
          relative to its container so it never forces horizontal scrolling on
          a phone (the 350px cap comes from the wrapper above). */}
      <div className="flex w-full flex-row gap-1" style={{ aspectRatio: "350 / 320" }}>
        {/* Left Column (LWF, LMF, LB) */}
        <div className="flex h-full w-[24%] shrink-0 flex-col justify-between gap-1">
          <div className="flex-1">{cell("LWF", "stack")}</div>
          <div className="flex-1">{cell("LMF", "stack")}</div>
          <div className="flex-1">{cell("LB", "stack")}</div>
        </div>

        {/* Center Column (CF/SS, AMF/CMF/DMF, CB/GK) */}
        <div className="flex h-full min-w-0 flex-1 flex-col justify-between gap-1">
          <div className="flex flex-1 gap-1">
            <div className="flex-1">{cell("CF", "stack")}</div>
            <div className="flex-1">{cell("SS", "stack")}</div>
          </div>
          <div className="flex flex-1 flex-col justify-between gap-1">
            <div className="flex-1">{cell("AMF", "row")}</div>
            <div className="flex-1">{cell("CMF", "row")}</div>
            <div className="flex-1">{cell("DMF", "row")}</div>
          </div>
          <div className="flex flex-1 gap-1">
            <div className="flex-1">{cell("CB", "stack")}</div>
            <div className="flex-1">{cell("GK", "stack")}</div>
          </div>
        </div>

        {/* Right Column (RWF, RMF, RB) */}
        <div className="flex h-full w-[24%] shrink-0 flex-col justify-between gap-1">
          <div className="flex-1">{cell("RWF", "stack")}</div>
          <div className="flex-1">{cell("RMF", "stack")}</div>
          <div className="flex-1">{cell("RB", "stack")}</div>
        </div>
      </div>

      {/* Proficiency legend */}
      <div className="mt-3 flex w-full items-center justify-center gap-4 text-xs text-[var(--color-text-secondary)]" role="list" aria-label="Position proficiency levels">
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <span className={`size-2.5 rounded-sm ${NONE_BG}`} aria-hidden />
          None
        </span>
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <span className={`size-2.5 rounded-sm ${HALF_BG}`} aria-hidden />
          Half
        </span>
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <span className={`size-2.5 rounded-sm ${FULL_BG}`} aria-hidden />
          Full
        </span>
      </div>
    </div>
  );
}
