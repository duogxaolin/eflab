"use client";
import { useMemo, useState } from "react";
import { labelSearchKey, type PickerManagerDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { statLabel } from "@/lib/card-display";
import { Modal } from "@/components/filters/Modal";
import { Search, Shield } from "lucide-react";

// "Select Manager" drawer of the Progression panel (change
// efootbase-exact-model-managers; drawer look of change efootbase-ui-redesign).
// Lists the 69 picker managers (manager.picker: rating DESC, then id ASC),
// each 74 px row with its 44 × 44 portrait, a rating shield, the name and one
// or two lime "+1" stat pills; the search matches the manager name or a
// pill's stat name with the shared `labelSearchKey` (case, accents, hyphens /
// dashes / slashes / underscores and typographic apostrophes ignored). The
// list is fetched the first time the drawer opens and kept for the session.
// Choosing a manager closes the drawer; choosing the selected one again, or
// "Clear", deselects it — the panel owns what that does to the proficiency
// (back to 90) and to the remembered manager (change
// efootbase-function-parity). While a manager is selected it is listed first,
// with an accent border and a "Clear" button (the reference's drawer); the
// search still applies to it.
// The drawer is the shared native-<dialog> Modal, variant "drawer" (bottom-
// anchored, 512 px wide, top radius 16): focus trap, Escape, focus return to
// the "Select Manager" button. The panel and the phone dock load this module
// on its first opening (`deferred.tsx`, DeferredManagerPicker) — it is not
// part of the detail page's first-load JavaScript. The list query shares its
// cache with the page's own (a linked or remembered manager is resolved
// before the drawer opens).

/** Text a search matches: the name and the pill labels ("Lofted Pass"). */
const haystack = (m: PickerManagerDTO): string => labelSearchKey([m.name, ...m.pills.map((p) => statLabel(p))].join(" | "));

export function ManagerPicker({
  open,
  onClose,
  selectedId,
  onChoose,
  onClear,
  remembered = true,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: string | null;
  onChoose: (manager: PickerManagerDTO) => void;
  /** "Clear": deselect the selected manager. */
  onClear: () => void;
  /** The page remembers the chosen manager for other cards (the player page);
   *  false where it does not (the compare slots), so the drawer does not say so. */
  remembered?: boolean;
}) {
  // Fetched on the first open (or already by the page); the list does not
  // change during a visit.
  const [requested, setRequested] = useState(false);
  if (open && !requested) setRequested(true);
  const q = trpc.manager.picker.useQuery(undefined, { enabled: requested, staleTime: Infinity, gcTime: Infinity });
  const [term, setTerm] = useState("");
  // Each opening starts with an empty search (QA 2026-10-23 U3): cleared on
  // the opening edge, not on close, so the list does not re-expand while the
  // drawer slides out.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTerm("");
  }
  const needle = labelSearchKey(term);
  const all = q.data ?? [];
  // The selected manager first, then the rest in the list's order.
  const shown = useMemo(() => {
    const hits = needle ? all.filter((m) => haystack(m).includes(needle)) : all;
    const sel = hits.find((m) => m.id === selectedId);
    return sel ? [sel, ...hits.filter((m) => m !== sel)] : hits;
  }, [all, needle, selectedId]);

  const header = (
    <>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Choosing a manager sets Manager Proficiency to its rating and adds +1 to its stats after the boosters
        {remembered ? "; it is remembered for other cards" : ""}. Choose it again or Clear to deselect it.
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
              <li key={m.id} className={selected ? "efb-manager-list__selected" : undefined}>
                <button type="button" aria-pressed={selected} onClick={() => onChoose(m)} data-testid="manager-row" data-manager-id={m.id} className="efb-manager-row">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="" width={44} height={44} loading="lazy" decoding="async" className="efb-manager-row__portrait" />
                  ) : (
                    <span className="efb-manager-row__portrait" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="efb-rating-shield">
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
                {selected && (
                  <button type="button" onClick={onClear} className="button button--sm button--secondary efb-manager-list__clear" data-testid="manager-clear">
                    Clear<span className="sr-only"> {m.name}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Sorted by rating, then by id (the original order inside a rating is not stored).</p>
    </Modal>
  );
}
