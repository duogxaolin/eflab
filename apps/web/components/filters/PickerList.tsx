"use client";
import { useId, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { togglePill } from "./ToggleGroup";

export interface PickerItem<V extends string | number> {
  value: V;
  label: string;
  /** Optional group heading; items are rendered in the order given. */
  group?: string;
  hint?: string;
}

/**
 * Searchable list of toggles for the Nation / League / Team / Skills dialogs:
 * a search field (prefix-insensitive substring on the label) over grouped
 * pressed/unpressed buttons. `single` makes it an exclusive choice.
 */
export function PickerList<V extends string | number>({
  items,
  selected,
  onChange,
  single = false,
  searchLabel = "Search",
  status,
  emptyText = "Nothing matches.",
}: {
  items: ReadonlyArray<PickerItem<V>>;
  selected: readonly V[];
  onChange: (next: V[]) => void;
  single?: boolean;
  searchLabel?: string;
  /** Loading / error row rendered above the list. */
  status?: ReactNode;
  emptyText?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items;
  const toggle = (v: V) => {
    const on = selected.includes(v);
    if (single) return onChange(on ? [] : [v]);
    onChange(on ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  // Group preserving first-seen order.
  const groups: Array<{ name: string | undefined; items: PickerItem<V>[] }> = [];
  for (const item of visible) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/40" aria-hidden />
        <input
          id={`${id}-search`}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          autoComplete="off"
          className="h-9 w-full rounded-full border border-white/10 bg-white/[0.05] pl-8 pr-8 text-xs text-white placeholder-white/40 focus:border-[var(--color-accent)] focus:outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      {selected.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="text-[11px] text-[var(--color-accent)] hover:underline">
          Clear selection ({selected.length})
        </button>
      )}
      {status}
      {visible.length === 0 && !status && <p className="py-4 text-center text-xs text-[var(--color-text-dim)]">{emptyText}</p>}
      {groups.map((g, gi) => (
        <section key={g.name ?? `g${gi}`} className="space-y-1.5">
          {g.name && <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">{g.name}</h3>}
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((item) => {
              const on = selected.includes(item.value);
              return (
                <button
                  key={String(item.value)}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item.value)}
                  title={item.hint}
                  className={`max-w-full truncate px-3 py-1.5 ${togglePill(on)}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
