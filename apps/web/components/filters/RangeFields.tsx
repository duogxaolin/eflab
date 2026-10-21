"use client";
import { useEffect, useId, useState } from "react";
import type { IntRange } from "@eflab/shared";

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
  /** Dialog layout for the long stat / body-model lists: the label is a
   *  14 px white field name instead of the rail's 12 px muted section label. */
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
    <div role="group" aria-labelledby={`${id}-label`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span
          id={`${id}-label`}
          className={compact ? "min-w-0 text-sm font-semibold leading-5 text-[var(--color-text-primary)]" : "filter-label min-w-0"}
        >
          {label}
        </span>
        <span
          className={`shrink-0 text-xs font-semibold tabular-nums ${value === null ? "text-[var(--color-text-secondary)]" : "text-[var(--color-accent)]"}`}
        >
          {summary}
        </span>
      </div>
      <div className="flex items-center gap-2">
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
          className="filter-number"
        />
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
          className="filter-number"
        />
      </div>
    </div>
  );
}
