"use client";
import { useId, type ReactNode } from "react";

export interface ToggleOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Accessible name when the visible label is not descriptive (e.g. "1"). */
  ariaLabel?: string;
  /** Extra classes for this option's button (e.g. a grid placement). */
  className?: string;
}

const GRID_COLUMNS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" } as const;

/**
 * A titled row of aria-pressed toggles (efootbase Position / Card Type /
 * Strong Foot / Condition / Form / WF sections). Multi-select by default;
 * `single` turns it into an exclusive choice where pressing the active option
 * clears it. Look: `.filter-label` heading, `.filter-toggle` buttons (34 px,
 * radius 10) in a 6 px grid; `.hit-44` keeps a 44 px tap area on touch.
 */
export function ToggleGroup<V extends string | number>({
  label,
  options,
  selected,
  onChange,
  single = false,
  columns,
  buttonClassName = "",
}: {
  label: string;
  options: ReadonlyArray<ToggleOption<V>>;
  selected: readonly V[];
  onChange: (next: V[]) => void;
  single?: boolean;
  /** Fixed grid columns; otherwise the toggles wrap. */
  columns?: 2 | 3 | 4 | 5;
  buttonClassName?: string;
}) {
  const id = useId();
  const toggle = (v: V) => {
    const on = selected.includes(v);
    if (single) return onChange(on ? [] : [v]);
    onChange(on ? selected.filter((x) => x !== v) : options.map((o) => o.value).filter((x) => x === v || selected.includes(x)));
  };
  const gridClass = columns ? `filter-toggles ${GRID_COLUMNS[columns]}` : "flex flex-wrap gap-1.5";
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="filter-label">
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
              className={`filter-toggle hit-44 ${buttonClassName} ${o.className ?? ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
