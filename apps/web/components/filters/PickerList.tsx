"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { labelSearchKey } from "@eflab/shared";

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
 * a 36 px search field (substring on the label, accent-, case- and
 * separator-insensitive — `labelSearchKey`, shared with /wiki/skills) over
 * grouped pressed/unpressed option rows (`.filter-option`: 44 px, radius 12,
 * one / two / three columns at < 640 / 640 / 768 px; a pressed row is the
 * accent with a check mark). In multi-select mode (the default) the current
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
 *
 * Items are listed in the order given, under their `group` heading (the Team
 * dialog's league headings); a search keeps that order and those headings.
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
   *  name from a link that no stored team has); defaults to the item label or
   *  the value. */
  labelOf?: (value: V) => string;
}) {
  const id = useId();
  const searchId = `${id}-search`;
  const [q, setQ] = useState("");
  // Accent-, case- and separator-insensitive ("cote" → Côte d'Ivoire, "saint
  // etienne" → AS Saint-Étienne, "one touch" → One-touch Pass): the same key
  // as the /wiki/skills search.
  const needle = labelSearchKey(q);
  const visible = needle ? items.filter((i) => labelSearchKey(i.label).includes(needle)) : items;
  const full = !single && max !== undefined && selected.length >= max;
  const toggle = (v: V) => {
    const on = selected.includes(v);
    if (single) return onChange(on ? [] : [v]);
    if (on) return onChange(selected.filter((x) => x !== v));
    if (full) return; // the cap is reached: only removals go through
    onChange([...selected, v]);
  };

  // A removed chip (or "Clear selection") unmounts the focused button; focus
  // goes to the chip that took its place (the next one), else the previous
  // one, else the search field — never to the page body. Set before the
  // change, applied once the chips have re-rendered.
  const chipListRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<{ chip: number } | "search" | null>(null);
  const removeChip = (v: V, index: number) => {
    pendingFocus.current = selected.length > 1 ? { chip: Math.min(index, selected.length - 2) } : "search";
    toggle(v);
  };
  const clearAll = () => {
    pendingFocus.current = "search";
    onChange([]);
  };
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const el =
      target === "search"
        ? document.getElementById(searchId)
        : chipListRef.current?.querySelectorAll<HTMLButtonElement>("button")[target.chip] ?? document.getElementById(searchId);
    el?.focus();
  }, [selected, searchId]);
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
    <div>
      {/* Pinned at the top of the dialog body (`.filter-search-bar`, sticky)
          while the options scroll under it; the bar sits outside the
          `space-y` list below so its own margins apply. */}
      <div className="filter-search-bar">
        <div className="field field--sm filter-search">
          <Search className="size-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            autoComplete="off"
            // The enclosing Modal focuses this after showModal().
            data-autofocus
            className="field__input no-native-clear"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="hit-44 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-default)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
        </div>
        {/* The cap notice sits under the search field (where the next choice is
            typed), above the chips, pinned with it so it stays in view however
            many are selected; it is a permanent live region (sr-only while
            empty) so reaching the limit is announced the moment it happens. */}
        {!single && max !== undefined && (
          <p role="status" aria-live="polite" data-limit-message={full ? "true" : undefined} className={full ? "text-xs text-[var(--color-accent-warn)]" : "sr-only"}>
            {full ? `At most ${max} selections — remove one to pick another.` : ""}
          </p>
        )}
      </div>
      <div className="mt-3 space-y-4">
        {selected.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--color-text-secondary)]" aria-live="polite">
                {selected.length} selected
              </span>
              <button type="button" onClick={clearAll} className="hit-44 cursor-pointer font-medium text-[var(--color-accent)] hover:underline">
                Clear selection
              </button>
            </div>
            {!single && (
              <ul ref={chipListRef} className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Selected">
                {selected.map((v, i) => {
                  const label = chipLabel(v);
                  return (
                    <li key={String(v)} className="max-w-full">
                      <button type="button" onClick={() => removeChip(v, i)} aria-label={`Remove ${label}`} title={`Remove ${label}`} className="filter-chip hit-44">
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
        {loading && <p className="py-3 text-center text-xs text-[var(--color-text-secondary)]">Loading {load?.what}…</p>}
        {failed && (
          <button type="button" onClick={() => void load?.refetch()} className="hit-44 w-full cursor-pointer py-3 text-center text-xs text-[var(--color-accent)] hover:underline">
            Could not load {load?.what} — retry
          </button>
        )}
        {loaded && visible.length === 0 && <p className="py-4 text-center text-xs text-[var(--color-text-secondary)]">{emptyText}</p>}
        {groups.map((g, gi) => (
          <section key={g.name ?? `g${gi}`} className="space-y-2">
            {g.name && <h3 className="filter-label">{g.name}</h3>}
            <div className="filter-options">
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
                    title={blocked ? `At most ${max} selections` : item.hint ? `${item.label} · ${item.hint}` : item.label}
                    className="filter-option"
                  >
                    <span className="filter-option__label">{item.label}</span>
                    {on && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
