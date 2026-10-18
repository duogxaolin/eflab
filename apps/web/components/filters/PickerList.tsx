"use client";
import { useId, useState } from "react";
import { Search, X } from "lucide-react";
import { togglePill } from "./ToggleGroup";

export interface PickerItem<V extends string | number> {
  value: V;
  label: string;
  /** Optional group heading; items are rendered in the order given. */
  group?: string;
  hint?: string;
}

/** Load state of the list behind the picker (a tRPC query). */
export interface PickerLoad {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
  /** What is being loaded, for the row text ("Loading nations…"). */
  what: string;
}

/**
 * Searchable list of toggles for the Nation / League / Team / Skills dialogs:
 * a search field (prefix-insensitive substring on the label) over grouped
 * pressed/unpressed buttons. In multi-select mode (the default) the current
 * selection is summarised above the list — "N selected", a Clear control and
 * one removable chip per value (multi-select-filters) — so a choice made
 * behind a search term stays visible. `single` makes it an exclusive choice.
 *
 * `max` caps the selection (the URL / API bound, `MAX_FILTER_IDS`): once it is
 * reached the unselected options are `aria-disabled`, a live message says so
 * and only removals go through — the picker, not the serialiser, is where a
 * selection can be refused, so no choice is ever dropped silently.
 *
 * `load` is the query state of the list: the picker renders the loading /
 * retry row itself and shows `emptyText` only once the list is loaded.
 */
export function PickerList<V extends string | number>({
  items,
  selected,
  onChange,
  single = false,
  max,
  searchLabel = "Search",
  load,
  emptyText = "Nothing matches.",
  labelOf,
}: {
  items: ReadonlyArray<PickerItem<V>>;
  selected: readonly V[];
  onChange: (next: V[]) => void;
  single?: boolean;
  /** Most values that can be selected at once (multi-select only). */
  max?: number;
  searchLabel?: string;
  load?: PickerLoad;
  emptyText?: string;
  /** Chip label for a selected value that is not among `items` (e.g. a team
   *  hidden by the league narrowing); defaults to the item label or the value. */
  labelOf?: (value: V) => string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items;
  const full = !single && max !== undefined && selected.length >= max;
  const toggle = (v: V) => {
    const on = selected.includes(v);
    if (single) return onChange(on ? [] : [v]);
    if (on) return onChange(selected.filter((x) => x !== v));
    if (full) return; // the cap is reached: only removals go through
    onChange([...selected, v]);
  };
  const chipLabel = (v: V) => items.find((i) => i.value === v)?.label ?? labelOf?.(v) ?? String(v);
  const loading = load?.isPending === true;
  const failed = !loading && load?.isError === true;
  const loaded = !loading && !failed;

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
      {/* The cap notice sits under the search field (where the next choice is
          typed), above the chips, so it stays in view however many are
          selected; it is a permanent live region (sr-only while empty) so
          reaching the limit is announced the moment it happens. */}
      {!single && max !== undefined && (
        <p role="status" aria-live="polite" data-limit-message={full ? "true" : undefined} className={full ? "text-[11px] text-[var(--color-accent-warn)]" : "sr-only"}>
          {full ? `At most ${max} selections — remove one to pick another.` : ""}
        </p>
      )}
      {selected.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-[var(--color-text-secondary)]" aria-live="polite">
              {selected.length} selected
            </span>
            <button type="button" onClick={() => onChange([])} className="text-[var(--color-accent)] hover:underline">
              Clear selection
            </button>
          </div>
          {!single && (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Selected">
              {selected.map((v) => {
                const label = chipLabel(v);
                return (
                  <li key={String(v)} className="max-w-full">
                    <button
                      type="button"
                      onClick={() => toggle(v)}
                      aria-label={`Remove ${label}`}
                      title={`Remove ${label}`}
                      className={`inline-flex max-w-full items-center gap-1 py-1 pl-2.5 pr-1.5 ${togglePill(true)}`}
                    >
                      <span className="truncate">{label}</span>
                      <X className="size-3 shrink-0" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {loading &&<p className="py-3 text-center text-xs text-[var(--color-text-dim)]">Loading {load?.what}…</p>}
      {failed && (
        <button type="button" onClick={() => void load?.refetch()} className="w-full py-3 text-center text-xs text-[var(--color-accent)] hover:underline">
          Could not load {load?.what} — retry
        </button>
      )}
      {loaded && visible.length === 0 && <p className="py-4 text-center text-xs text-[var(--color-text-dim)]">{emptyText}</p>}
      {groups.map((g, gi) => (
        <section key={g.name ?? `g${gi}`} className="space-y-1.5">
          {g.name && <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">{g.name}</h3>}
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((item) => {
              const on = selected.includes(item.value);
              const blocked = full && !on;
              return (
                <button
                  key={String(item.value)}
                  type="button"
                  aria-pressed={on}
                  aria-disabled={blocked || undefined}
                  onClick={() => toggle(item.value)}
                  title={blocked ? `At most ${max} selections` : item.hint}
                  className={`max-w-full truncate px-3 py-1.5 ${togglePill(on, blocked)}`}
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
