"use client";
import type { Position } from "@eflab/shared";
import { statTierClass } from "@/lib/card-display";

// Pitch Map of the player detail page. The 13 values are computed by the
// caller with the exact overall formula (`positionTiles` in @eflab/shared,
// change efootbase-exact-model-managers) from the stats on display, so every
// card has a value at every position — the stored eFHUB ratings are not shown.
export interface PitchMapProps {
  positionAptitudes: Record<string, number>;
  tiles: Record<Position, number>;
  registeredPosition: Position | string;
  className?: string;
}

function cellBg(aptitude: number | undefined): string {
  if (aptitude === 0) return "bg-[#7DFF1FB3] text-black font-bold";
  if (aptitude === 1) return "bg-[#7DFF1F4D] text-white/90 border border-[#7DFF1F]/30";
  return "bg-[#262626CC] text-white/40";
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

function PitchCell({
  pos,
  aptitudes,
  tiles,
  registeredPosition,
  layout = "row",
}: PitchCellProps) {
  const apt = aptitudes[pos];
  const rating = tiles[pos];
  const isReg = pos === registeredPosition;
  const isFull = apt === 0;

  return (
    <div
      className={`relative flex items-center justify-center rounded-lg transition-all shadow-sm ${cellBg(
        apt
      )} ${isReg ? "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[#18181b]" : ""} ${
        layout === "stack" ? "flex-col gap-1.5 p-1.5" : "flex-row gap-2 px-2.5 py-1"
      } w-full h-full`}
      title={`${pos}: ${rating} OVR (${aptitudeLabel(apt)} proficiency)`}
      data-testid={`pitch-${pos}`}
    >
      <span
        className={`text-[11px] font-black uppercase tracking-wider leading-none ${
          isFull ? "text-black" : "text-white/70"
        }`}
      >
        {pos}
      </span>
      {/* Rating text uses the shared `--color-tier-*` tokens (statTierClass)
          on the black/85 pill, the same contrast as the stat rows. */}
      <span
        className={`inline-block px-1.5 py-0.5 rounded-[4px] bg-black/85 font-mono text-[11px] font-bold leading-none tabular-nums shadow-sm ${statTierClass(rating)}`}
      >
        {rating}
      </span>
    </div>
  );
}

export function PitchMap({
  positionAptitudes,
  tiles,
  registeredPosition,
  className = "",
}: PitchMapProps) {
  const cell = (pos: Position, layout: "stack" | "row") => (
    <PitchCell
      pos={pos}
      aptitudes={positionAptitudes}
      tiles={tiles}
      registeredPosition={registeredPosition}
      layout={layout}
    />
  );
  return (
    <div className={`flex flex-col items-center w-full max-w-[350px] ${className}`}>
      {/* Proficiency Legend */}
      <div
        className="flex items-center justify-end gap-3.5 text-xs text-[var(--color-text-dim)] font-mono w-full mb-2.5 px-1"
        role="list"
        aria-label="Position proficiency levels"
      >
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <span className="size-2.5 rounded-sm bg-[#262626CC]" aria-hidden />
          None
        </span>
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <span className="size-2.5 rounded-sm bg-[#7DFF1F4D] border border-[#7DFF1F]/30" aria-hidden />
          Half
        </span>
        <span className="inline-flex items-center gap-1.5" role="listitem">
          <span className="size-2.5 rounded-sm bg-[#7DFF1FB3]" aria-hidden />
          Full
        </span>
      </div>

      {/* Pitch Diagram (3 columns: Left Wing, Center Spine, Right Wing). Sized
          relative to its container so it never forces horizontal scrolling on
          a phone (the 350px cap comes from the wrapper above). */}
      <div
        className="flex flex-row gap-2 p-2.5 rounded-2xl bg-gradient-to-b from-[#18181b] via-[#14161f] to-[#10121a] border border-white/10 shadow-2xl w-full"
        style={{ aspectRatio: "350 / 320" }}
      >
        {/* Left Column (LWF, LMF, LB) */}
        <div className="flex flex-col justify-between gap-2 h-full w-[23%] shrink-0">
          <div className="flex-1">{cell("LWF", "stack")}</div>
          <div className="flex-1">{cell("LMF", "stack")}</div>
          <div className="flex-1">{cell("LB", "stack")}</div>
        </div>

        {/* Center Column (CF/SS, AMF/CMF/DMF, CB/GK) */}
        <div className="flex flex-col justify-between gap-2 h-full flex-1 min-w-0">
          <div className="flex gap-2 flex-1">
            <div className="flex-1">{cell("CF", "stack")}</div>
            <div className="flex-1">{cell("SS", "stack")}</div>
          </div>
          <div className="flex flex-col gap-1.5 flex-1 justify-between">
            <div className="flex-1">{cell("AMF", "row")}</div>
            <div className="flex-1">{cell("CMF", "row")}</div>
            <div className="flex-1">{cell("DMF", "row")}</div>
          </div>
          <div className="flex gap-2 flex-1">
            <div className="flex-1">{cell("CB", "stack")}</div>
            <div className="flex-1">{cell("GK", "stack")}</div>
          </div>
        </div>

        {/* Right Column (RWF, RMF, RB) */}
        <div className="flex flex-col justify-between gap-2 h-full w-[23%] shrink-0">
          <div className="flex-1">{cell("RWF", "stack")}</div>
          <div className="flex-1">{cell("RMF", "stack")}</div>
          <div className="flex-1">{cell("RB", "stack")}</div>
        </div>
      </div>
    </div>
  );
}
