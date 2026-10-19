"use client";
import { useMemo, useState } from "react";
import { normalizeSearchQuery, type PickerManagerDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { statLabel } from "@/lib/card-display";
import { Modal } from "@/components/filters/Modal";
import { Search } from "lucide-react";

// "Select Manager" dialog of the Progression panel (change
// efootbase-exact-model-managers). Lists the 69 managers efootbase offers in
// its picker (manager.picker: rating DESC, then id ASC), each with its art,
// rating badge and one or two "+1" stat pills; the search matches the manager
// name or a pill's stat name (accent- and case-insensitive). The list is
// fetched the first time the dialog opens and kept for the session.
// Choosing a manager closes the dialog; choosing the selected one again
// deselects it — the panel owns what that does to the proficiency.
// The dialog is the shared native-<dialog> Modal (focus trap, Escape, focus
// return to the "Select Manager" button).

/** Text a search matches: the name and the pill labels ("Lofted Pass"). */
const haystack = (m: PickerManagerDTO): string => normalizeSearchQuery([m.name, ...m.pills.map((p) => statLabel(p))].join(" | "));

export function ManagerPicker({
  open,
  onClose,
  selectedId,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onChoose: (manager: PickerManagerDTO) => void;
}) {
  // Fetched on the first open only; the list does not change during a visit.
  const [requested, setRequested] = useState(false);
  if (open && !requested) setRequested(true);
  const q = trpc.manager.picker.useQuery(undefined, { enabled: requested, staleTime: Infinity, gcTime: Infinity });
  const [term, setTerm] = useState("");
  const needle = normalizeSearchQuery(term);
  const all = q.data ?? [];
  const shown = useMemo(() => (needle ? all.filter((m) => haystack(m).includes(needle)) : all), [all, needle]);

  const search = (
    <label className="relative block">
      <span className="sr-only">Search managers by name or stat</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-dim)]" aria-hidden />
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by name or stat…"
        className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] pl-8 pr-2.5 text-sm text-white placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-line-active)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
        data-testid="manager-search"
      />
    </label>
  );

  return (
    <Modal open={open} onClose={onClose} title="Select Manager" headerExtra={search}>
      <p className="mb-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
        Choosing a manager sets Manager Proficiency to its rating and adds +1 to its stats after the boosters. Choose it again to deselect it. Sorted by rating, then
        by id (efootbase&apos;s order inside a rating is not stored).
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {q.isSuccess ? `${shown.length} of ${all.length} managers` : ""}
      </p>
      {q.isError ? (
        <button
          type="button"
          onClick={() => void q.refetch()}
          className="button button--sm button--secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Could not load managers — retry
        </button>
      ) : !q.isSuccess ? (
        <p className="text-xs text-[var(--color-text-dim)]">Loading managers…</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-[var(--color-text-dim)]">Nothing matches.</p>
      ) : (
        <ul className="space-y-1.5" aria-label="Managers" data-testid="manager-list">
          {shown.map((m) => {
            const selected = m.id === selectedId;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChoose(m)}
                  data-testid="manager-row"
                  data-manager-id={m.id}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                    selected
                      ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/10"
                      : "border-[var(--color-line)] bg-[var(--color-canvas)] hover:border-[var(--color-line-active)]"
                  }`}
                >
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="" width={40} height={40} loading="lazy" decoding="async" className="size-10 shrink-0 rounded-md bg-[var(--color-panel)] object-cover" />
                  ) : (
                    <span className="size-10 shrink-0 rounded-md bg-[var(--color-panel)]" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{m.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {m.pills.map((p) => (
                        <span key={p} className="rounded-md bg-[var(--color-accent)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent)]">
                          +1 {statLabel(p)}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-white" title={`Rating ${m.rating}`}>
                    <span className="sr-only">rating </span>
                    {m.rating}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
