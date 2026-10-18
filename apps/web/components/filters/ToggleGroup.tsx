"use client";
import { useId, type ReactNode } from "react";

export const togglePill = (selected: boolean, disabled = false) =>
  `rounded-full text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
    disabled
      ? "cursor-not-allowed bg-white/[0.03] text-white/35"
      : selected
        ? "cursor-pointer bg-[var(--color-accent)] font-bold text-black shadow-sm"
        : "cursor-pointer bg-white/[0.06] text-white/90 hover:bg-white/[0.12]"
  }`;

export interface ToggleOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Accessible name when the visible label is not descriptive (e.g. "1"). */
  ariaLabel?: string;
}

/**
 * A titled row of aria-pressed toggles (efootbase Position / Card Type /
 * Strong Foot / Condition / Form / WF sections). Multi-select by default;
 * `single` turns it into an exclusive choice where pressing the active option
 * clears it.
 */
export function ToggleGroup<V extends string | number>({
  label,
  options,
  selected,
  onChange,
  single = false,
  columns,
  buttonClassName = "h-8 px-3",
}: {
  label: string;
  options: ReadonlyArray<ToggleOption<V>>;
  selected: readonly V[];
  onChange: (next: V[]) => void;
  single?: boolean;
  /** Fixed grid columns; otherwise the pills wrap. */
  columns?: 2 | 3 | 4 | 5;
  buttonClassName?: string;
}) {
  const id = useId();
  const toggle = (v: V) => {
    const on = selected.includes(v);
    if (single) return onChange(on ? [] : [v]);
    onChange(on ? selected.filter((x) => x !== v) : options.map((o) => o.value).filter((x) => x === v || selected.includes(x)));
  };
  const gridClass = columns
    ? `grid gap-1.5 ${{ 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" }[columns]}`
    : "flex flex-wrap gap-1.5";
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-xs font-semibold text-white">
        {label}
      </h3>
      <div className={gridClass}>
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              aria-label={o.ariaLabel}
              onClick={() => toggle(o.value)}
              className={`${buttonClassName} ${togglePill(on)}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
