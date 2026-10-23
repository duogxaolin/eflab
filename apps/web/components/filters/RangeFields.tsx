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
 * A commit writes the clamped drafts itself, and the `value` that comes back
 * with exactly that range (its own echo, however late) changes nothing. A
 * change of `value` from outside (Reset, Back, a reload) re-syncs only the
 * field that does not have focus, so a value being typed into the other field
 * is never overwritten (QA bug B1: typing 20 → Tab → 25 at once kept "25").
 *
 * An inverted pair (min above max, after clamping) is not committed: the
 * drafts stay, both fields get `aria-invalid` and an inline "Min is above Max"
 * message (referenced by `aria-describedby`, announced politely) until a
 * valid pair is committed or the value changes from outside — on blur and on
 * Enter alike. Equal values are
 * a valid one-value range.
 */
export function RangeFields({
  label,
  value,
  bounds,
  onChange,
  unit,
  compact = false,
  resetKey,
}: {
  label: string;
  value: IntRange | null;
  bounds: readonly [number, number];
  onChange: (next: IntRange | null) => void;
  unit?: string;
  /** Dialog layout for the long stat / body-model lists: the label is a
   *  14 px white field name instead of the rail's 12 px muted section label. */
  compact?: boolean;
  /** Changes on a navigation (Back / Forward, a link into the page): both
   *  fields then show `value` again and an unapplied "Min is above Max" draft
   *  is dropped — the fields stay mounted, so focus is never lost. */
  resetKey?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);
  const [minDraft, setMinDraft] = useState(value?.min?.toString() ?? "");
  const [maxDraft, setMaxDraft] = useState(value?.max?.toString() ?? "");
  const [inverted, setInverted] = useState(false);
  // The range this component last handed to `onChange`, until `value` comes
  // back with it. That echo is our own commit, not an outside change: it must
  // not re-sync a field or clear the "Min is above Max" state the user has
  // reached since (QA 2026-10-23 bug 2 — with a slow URL round trip the echo
  // of a Min commit arrived after an inverted Max had been entered and wiped
  // the error and the Max draft).
  const ownCommit = useRef<{ min: number | undefined; max: number | undefined } | null>(null);
  useEffect(() => {
    const own = ownCommit.current;
    if (own !== null) {
      ownCommit.current = null;
      if (own.min === value?.min && own.max === value?.max) return;
    }
    // A genuine outside change (Reset, Back, another control): re-sync the
    // field that does not have focus (B1) and drop the inverted state.
    const focused = typeof document === "undefined" ? null : document.activeElement;
    if (focused !== minRef.current) setMinDraft(value?.min?.toString() ?? "");
    if (focused !== maxRef.current) setMaxDraft(value?.max?.toString() ?? "");
    setInverted(false);
  }, [value?.min, value?.max]);
  // A navigation re-syncs both fields, the focused one included (its draft
  // belonged to the page state that was left). Not on mount.
  const seenResetKey = useRef(resetKey);
  useEffect(() => {
    if (seenResetKey.current === resetKey) return;
    seenResetKey.current = resetKey;
    ownCommit.current = null;
    setMinDraft(value?.min?.toString() ?? "");
    setMaxDraft(value?.max?.toString() ?? "");
    setInverted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

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
    ownCommit.current = { min: next.min, max: next.max };
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
