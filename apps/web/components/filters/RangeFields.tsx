"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { IntRange } from "@eflab/shared";

/**
 * Min – Max pair for an integer range filter (efootbase "Base Overall Rating:
 * Min / Max" inputs; also used where efootbase draws range sliders). Values
 * are drafts while typing and are committed on blur / Enter, clamped to
 * `bounds`; an unparsable draft reverts. The committed range is `null` when
 * both fields are empty ("All").
 *
 * A commit writes the clamped drafts itself; a change of `value` from outside
 * (the URL after a commit, Reset, Back) re-syncs only the field that does not
 * have focus, so a value being typed into the other field is never overwritten
 * (QA bug B1: typing 20 → Tab → 25 at once kept "25").
 *
 * An inverted pair (min above max, after clamping) is not committed: the
 * drafts stay, both fields get `aria-invalid` and an inline "Min is above Max"
 * message (referenced by `aria-describedby`, announced politely) until a
 * valid pair is committed or the value changes from outside. Equal values are
 * a valid one-value range.
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
  const errorId = `${id}-error`;
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);
  const [minDraft, setMinDraft] = useState(value?.min?.toString() ?? "");
  const [maxDraft, setMaxDraft] = useState(value?.max?.toString() ?? "");
  const [inverted, setInverted] = useState(false);
  useEffect(() => {
    const focused = typeof document === "undefined" ? null : document.activeElement;
    if (focused !== minRef.current) setMinDraft(value?.min?.toString() ?? "");
    if (focused !== maxRef.current) setMaxDraft(value?.max?.toString() ?? "");
    setInverted(false);
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
      setInverted(false);
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setInverted(true);
      return;
    }
    setInverted(false);
    setMinDraft(min?.toString() ?? "");
    setMaxDraft(max?.toString() ?? "");
    const next: IntRange = {};
    if (min !== undefined) next.min = min;
    if (max !== undefined) next.max = max;
    const unchanged = (value?.min ?? undefined) === next.min && (value?.max ?? undefined) === next.max;
    if (unchanged) return;
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
  // Invalid fields: the danger border (utilities win over `.filter-number`).
  const invalidClass = "aria-invalid:border-[var(--color-accent-danger)] aria-invalid:hover:border-[var(--color-accent-danger)]";

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
          ref={minRef}
          type="number"
          inputMode="numeric"
          min={bounds[0]}
          max={bounds[1]}
          placeholder="Min"
          aria-label={`${label}: Min`}
          aria-invalid={inverted || undefined}
          aria-describedby={inverted ? errorId : undefined}
          value={minDraft}
          onChange={(e) => setMinDraft(e.target.value)}
          onBlur={() => commit(minDraft, maxDraft)}
          onKeyDown={onKey}
          className={`filter-number ${invalidClass}`}
        />
        <input
          ref={maxRef}
          type="number"
          inputMode="numeric"
          min={bounds[0]}
          max={bounds[1]}
          placeholder="Max"
          aria-label={`${label}: Max`}
          aria-invalid={inverted || undefined}
          aria-describedby={inverted ? errorId : undefined}
          value={maxDraft}
          onChange={(e) => setMaxDraft(e.target.value)}
          onBlur={() => commit(minDraft, maxDraft)}
          onKeyDown={onKey}
          className={`filter-number ${invalidClass}`}
        />
      </div>
      {/* Always mounted (polite live region); takes no room while empty. */}
      <p id={errorId} role="status" className={inverted ? "text-xs text-[var(--color-danger-soft-foreground)]" : "sr-only"}>
        {inverted ? "Min is above Max" : ""}
      </p>
    </div>
  );
}
