"use client";
import type { Position } from "@eflab/shared";

export interface PitchMapProps {
  positionAptitudes: Record<string, number>;
  positionRatings: Record<string, number>;
  registeredPosition: Position | string;
  className?: string;
}

function cellBg(aptitude: number | undefined): string {
  if (aptitude === 0) return "bg-[#7DFF1FB3] text-black font-bold";
  if (aptitude === 1) return "bg-[#7DFF1F4D] text-white/90 border border-[#7DFF1F]/30";
  return "bg-[#262626CC] text-white/40";
}

function cellRatingColor(rating: number): string {
  if (rating >= 90) return "text-[#00ffb4]";
  if (rating >= 80) return "text-[#96ff00]";
  if (rating >= 70) return "text-[#ffbe00]";
  return "text-[#ff3200]";
}

interface PitchCellProps {
  pos: Position;
  aptitudes: Record<string, number>;
  ratings: Record<string, number>;
  registeredPosition: string;
  layout?: "stack" | "row";
}

function PitchCell({
  pos,
  aptitudes,
  ratings,
  registeredPosition,
  layout = "row",
}: PitchCellProps) {
  const apt = aptitudes[pos];
  const rating = ratings[pos] ?? 0;
  const isReg = pos === registeredPosition;
  const isFull = apt === 0;

  return (
    <div
      className={`relative flex items-center justify-center rounded-lg transition-all shadow-sm ${cellBg(
        apt
      )} ${isReg ? "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[#18181b]" : ""} ${
        layout === "stack" ? "flex-col gap-1.5 p-1.5" : "flex-row gap-2 px-2.5 py-1"
      } w-full h-full`}
      title={`${pos}: ${rating} OVR (${apt === 0 ? "Full" : apt === 1 ? "Half" : "None"})`}
    >
      <span
        className={`text-[11px] font-black uppercase tracking-wider leading-none ${
          isFull ? "text-black" : "text-white/70"
        }`}
      >
        {pos}
      </span>
      <span
        className={`inline-block px-1.5 py-0.5 rounded-[4px] bg-black/85 font-mono text-[11px] font-bold leading-none tabular-nums shadow-sm ${cellRatingColor(
          rating
        )}`}
      >
        {rating}
      </span>
    </div>
  );
}

export function PitchMap({
  positionAptitudes,
  positionRatings,
  registeredPosition,
  className = "",
}: PitchMapProps) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Proficiency Legend */}
      <div
        className="flex items-center justify-end gap-3.5 text-xs text-[var(--color-text-dim)] font-mono w-full max-w-[350px] mb-2.5 px-1"
        role="list"
        aria-label="Position proficiency levels"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#262626CC]" aria-hidden />
          None
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#7DFF1F4D] border border-[#7DFF1F]/30" aria-hidden />
          Half
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[#7DFF1FB3]" aria-hidden />
          Full
        </span>
      </div>

      {/* Pitch Diagram (3 columns: Left Wing, Center Spine, Right Wing with generous spacing) */}
      <div
        className="flex flex-row gap-2 p-2.5 rounded-2xl bg-gradient-to-b from-[#18181b] via-[#14161f] to-[#10121a] border border-white/10 shadow-2xl"
        style={{ width: "350px", height: "320px" }}
      >
        {/* Left Column (LWF, LMF, LB) */}
        <div className="flex flex-col justify-between gap-2 h-full" style={{ width: "82px" }}>
          <div className="flex-1">
            <PitchCell
              pos="LWF"
              aptitudes={positionAptitudes}
              ratings={positionRatings}
              registeredPosition={registeredPosition}
              layout="stack"
            />
          </div>
          <div className="flex-1">
            <PitchCell
              pos="LMF"
              aptitudes={positionAptitudes}
              ratings={positionRatings}
              registeredPosition={registeredPosition}
              layout="stack"
            />
          </div>
          <div className="flex-1">
            <PitchCell
              pos="LB"
              aptitudes={positionAptitudes}
              ratings={positionRatings}
              registeredPosition={registeredPosition}
              layout="stack"
            />
          </div>
        </div>

        {/* Center Column (CF/SS, AMF/CMF/DMF, CB/GK) */}
        <div className="flex flex-col justify-between gap-2 h-full flex-1">
          {/* Attack row: CF & SS */}
          <div className="flex gap-2 flex-1">
            <div className="flex-1">
              <PitchCell
                pos="CF"
                aptitudes={positionAptitudes}
                ratings={positionRatings}
                registeredPosition={registeredPosition}
                layout="stack"
              />
            </div>
            <div className="flex-1">
              <PitchCell
                pos="SS"
                aptitudes={positionAptitudes}
                ratings={positionRatings}
                registeredPosition={registeredPosition}
                layout="stack"
              />
            </div>
          </div>

          {/* Midfield row: AMF, CMF, DMF */}
          <div className="flex flex-col gap-1.5 flex-1 justify-between">
            <div className="flex-1">
              <PitchCell
                pos="AMF"
                aptitudes={positionAptitudes}
                ratings={positionRatings}
                registeredPosition={registeredPosition}
                layout="row"
              />
            </div>
            <div className="flex-1">
              <PitchCell
                pos="CMF"
                aptitudes={positionAptitudes}
                ratings={positionRatings}
                registeredPosition={registeredPosition}
                layout="row"
              />
            </div>
            <div className="flex-1">
              <PitchCell
                pos="DMF"
                aptitudes={positionAptitudes}
                ratings={positionRatings}
                registeredPosition={registeredPosition}
                layout="row"
              />
            </div>
          </div>

          {/* Defence & GK row: CB & GK */}
          <div className="flex gap-2 flex-1">
            <div className="flex-1">
              <PitchCell
                pos="CB"
                aptitudes={positionAptitudes}
                ratings={positionRatings}
                registeredPosition={registeredPosition}
                layout="stack"
              />
            </div>
            <div className="flex-1">
              <PitchCell
                pos="GK"
                aptitudes={positionAptitudes}
                ratings={positionRatings}
                registeredPosition={registeredPosition}
                layout="stack"
              />
            </div>
          </div>
        </div>

        {/* Right Column (RWF, RMF, RB) */}
        <div className="flex flex-col justify-between gap-2 h-full" style={{ width: "82px" }}>
          <div className="flex-1">
            <PitchCell
              pos="RWF"
              aptitudes={positionAptitudes}
              ratings={positionRatings}
              registeredPosition={registeredPosition}
              layout="stack"
            />
          </div>
          <div className="flex-1">
            <PitchCell
              pos="RMF"
              aptitudes={positionAptitudes}
              ratings={positionRatings}
              registeredPosition={registeredPosition}
              layout="stack"
            />
          </div>
          <div className="flex-1">
            <PitchCell
              pos="RB"
              aptitudes={positionAptitudes}
              ratings={positionRatings}
              registeredPosition={registeredPosition}
              layout="stack"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
