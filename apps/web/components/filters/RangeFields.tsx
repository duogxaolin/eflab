"use client";
import { useEffect, useId, useState } from "react";
import type { IntRange } from "@eflab/shared";

const inputClass =
  "h-8 w-full min-w-0 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-center font-mono text-xs text-white placeholder-white/40 focus:border-[var(--color-accent)] focus:outline-none";

/**
 * Min – Max pair for an integer range filter (efootbase "Base Overall Rating:
 * Min / Max" inputs; also used where efootbase draws range sliders). Values
 * are drafts while typing and are committed on blur / Enter, clamped to
 * `bounds`; an unparsable draft reverts. The committed range is `null` when
 * both fields are empty ("All"). An inverted pair (min > max) is handed to
 * `onChange` as typed, but `parseRangeParam` drops it when the URL is read back
 * (`readPlayersState`), so the filter reverts to "All" and the fields clear —
 * the API never sees an impossible range.
 */
export function RangeFields({
  label,
  value,
  bounds,
  onChange,
  unit,
  compact = false,
}: {
  label: string;
  value: IntRange | null;
  bounds: readonly [number, number];
  onChange: (next: IntRange | null) => void;
  unit?: string;
  /** Tighter layout for the long stat / body-model lists. */
  compact?: boolean;
}) {
  const id = useId();
  const [minDraft, setMinDraft] = useState(value?.min?.toString() ?? "");
  const [maxDraft, setMaxDraft] = useState(value?.max?.toString() ?? "");
  useEffect(() => {
    setMinDraft(value?.min?.toString() ?? "");
    setMaxDraft(value?.max?.toString() ?? "");
  }, [value?.min, value?.max]);

  const parse = (s: string): number | undefined | false => {
    if (s.trim() === "") return undefined;
    const n = Number(s);
    if (!Number.isInteger(n)) return false;
    return Math.min(bounds[1], Math.max(bounds[0], n));
  };
  const commit = (minS: string, maxS: string) => {
    const min = parse(minS);
    const max = parse(maxS);
    if (min === false || max === false) {
      setMinDraft(value?.min?.toString() ?? "");
      setMaxDraft(value?.max?.toString() ?? "");
      return;
    }
    const next: IntRange = {};
    if (min !== undefined) next.min = min;
    if (max !== undefined) next.max = max;
    const unchanged = (value?.min ?? undefined) === next.min && (value?.max ?? undefined) === next.max;
    if (unchanged) {
      setMinDraft(next.min?.toString() ?? "");
      setMaxDraft(next.max?.toString() ?? "");
      return;
    }
    onChange(next.min === undefined && next.max === undefined ? null : next);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(minDraft, maxDraft);
    }
  };
  const summary =
    value === null
      ? "All"
      : value.min !== undefined && value.max !== undefined
        ? `${value.min}–${value.max}${unit ?? ""}`
        : value.min !== undefined
          ? `≥ ${value.min}${unit ?? ""}`
          : `≤ ${value.max}${unit ?? ""}`;

  return (
    <div role="group" aria-labelledby={`${id}-label`} className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span id={`${id}-label`} className={`font-medium ${compact ? "text-white/85" : "text-white"}`}>
          {label}
        </span>
        <span className={`font-mono tabular-nums ${value === null ? "text-[var(--color-text-dim)]" : "text-[var(--color-accent)]"}`}>{summary}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min={bounds[0]}
          max={bounds[1]}
          placeholder="Min"
          aria-label={`${label}: Min`}
          value={minDraft}
          onChange={(e) => setMinDraft(e.target.value)}
          onBlur={() => commit(minDraft, maxDraft)}
          onKeyDown={onKey}
          className={inputClass}
        />
        <span className="text-xs text-[var(--color-text-dim)]" aria-hidden>
          –
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={bounds[0]}
          max={bounds[1]}
          placeholder="Max"
          aria-label={`${label}: Max`}
          value={maxDraft}
          onChange={(e) => setMaxDraft(e.target.value)}
          onBlur={() => commit(minDraft, maxDraft)}
          onKeyDown={onKey}
          className={inputClass}
        />
      </div>
    </div>
  );
}
