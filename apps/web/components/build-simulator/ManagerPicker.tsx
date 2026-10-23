"use client";
import { useMemo, useState } from "react";
import { normalizeSearchQuery, type PickerManagerDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { statLabel } from "@/lib/card-display";
import { Modal } from "@/components/filters/Modal";
import { Search, Shield } from "lucide-react";

// "Select Manager" drawer of the Progression panel (change
// efootbase-exact-model-managers; drawer look of change efootbase-ui-redesign).
// Lists the 69 picker managers (manager.picker: rating DESC, then id ASC),
// each 74 px row with its 44 × 44 portrait, a rating shield, the name and one
// or two lime "+1" stat pills; the search matches the manager name or a
// pill's stat name (accent- and case-insensitive). The list is fetched the
// first time the drawer opens and kept for the session.
// Choosing a manager closes the drawer; choosing the selected one again
// deselects it — the panel owns what that does to the proficiency.
// The drawer is the shared native-<dialog> Modal, variant "drawer" (bottom-
// anchored, 512 px wide, top radius 16): focus trap, Escape, focus return to
// the "Select Manager" button. The panel and the phone dock load this module
// on its first opening (`deferred.tsx`, DeferredManagerPicker) — it is not
// part of the detail page's first-load JavaScript.

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

  const header = (
    <>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Choosing a manager sets Manager Proficiency to its rating and adds +1 to its stats after the boosters. Choose it again to deselect it.
      </p>
      <label className="field field--sm">
        <span className="sr-only">Search managers by name or stat</span>
        <Search className="size-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name or stat…"
          // The drawer (Modal) focuses this after showModal().
          data-autofocus
          className="field__input"
          data-testid="manager-search"
        />
      </label>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Select Manager" headerExtra={header} variant="drawer">
      <p className="sr-only" role="status" aria-live="polite">
        {q.isSuccess ? `${shown.length} of ${all.length} managers` : ""}
      </p>
      {q.isError ? (
        <button type="button" onClick={() => void q.refetch()} className="button button--sm button--secondary">
          Could not load managers — retry
        </button>
      ) : !q.isSuccess ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Loading managers…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Nothing matches.</p>
      ) : (
        <ul className="efb-manager-list" aria-label="Managers" data-testid="manager-list">
          {shown.map((m) => {
            const selected = m.id === selectedId;
            return (
              <li key={m.id}>
                <button type="button" aria-pressed={selected} onClick={() => onChoose(m)} data-testid="manager-row" data-manager-id={m.id} className="efb-manager-row">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="" width={44} height={44} loading="lazy" decoding="async" className="efb-manager-row__portrait" />
                  ) : (
                    <span className="efb-manager-row__portrait" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="efb-rating-shield" title={`Rating ${m.rating}`}>
                        <Shield className="efb-rating-shield__icon" aria-hidden />
                        <span className="sr-only">rating </span>
                        <span className="efb-rating-shield__value">{m.rating}</span>
                      </span>
                      <span className="truncate text-sm font-medium text-white">{m.name}</span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.pills.map((p) => (
                        <span key={p} className="efb-manager-pill">
                          {statLabel(p)} +1
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Sorted by rating, then by id (the original order inside a rating is not stored).</p>
    </Modal>
  );
}
