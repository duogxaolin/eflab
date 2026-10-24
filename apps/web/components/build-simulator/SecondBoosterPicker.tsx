"use client";
import { useMemo, useState } from "react";
import { labelSearchKey, type BaseStat, type SecondBoosterDTO } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { statLabel } from "@/lib/card-display";
import { Modal } from "@/components/filters/Modal";
import { Search, Sparkles } from "lucide-react";

// "Select second booster" drawer (change efootbase-function-parity, design D4;
// spec "Second Booster Choice"): a card with a level cap above 1 and no usable
// Booster 2 of its own takes one of the 29 basic "+1" boosters as its second
// booster. The list comes from the API (`booster.secondChoices`: the committed
// booster fixture's basic boosters, alphabetical, each with its `b2=` slug) —
// never typed here. Each row shows the booster's name and its four stats; the
// search (pinned above the list, focused on open, empty at each opening)
// matches the name or a stat name with the shared `labelSearchKey` (case,
// accents, hyphens / dashes / slashes / underscores and typographic
// apostrophes ignored: "striker’s" finds Striker's Instinct). While a booster
// is chosen it is listed first, highlighted, with a "Clear" button; choosing
// it again or "Clear" removes it. Choosing closes the drawer (focus returns to
// the "Select Booster" slot — the Modal's focus return).
// The drawer is the shared native-<dialog> Modal, variant "drawer" (as the
// manager picker): accessible name, focus trap, one Escape closes it even
// with text in the search, focus return. Loaded on first use (deferred.tsx).

/** Text a search matches: the name and the stat labels ("Ball Control"). */
const haystack = (b: SecondBoosterDTO): string =>
  labelSearchKey([b.name, ...(Object.keys(b.stats) as BaseStat[]).map((s) => statLabel(s))].join(" | "));

/** The stats a booster raises, in its stored order. */
const statsOf = (b: SecondBoosterDTO): BaseStat[] => (Object.entries(b.stats) as Array<[BaseStat, number | undefined]>).filter(([, v]) => typeof v === "number" && v !== 0).map(([s]) => s);

export function SecondBoosterPicker({
  open,
  onClose,
  selectedSlug,
  onChoose,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  selectedSlug: string | null;
  onChoose: (booster: SecondBoosterDTO) => void;
  onClear: () => void;
}) {
  // Fetched on the first open (or already by the page for a `b2=` link).
  const [requested, setRequested] = useState(false);
  if (open && !requested) setRequested(true);
  const q = trpc.booster.secondChoices.useQuery(undefined, { enabled: requested, staleTime: Infinity, gcTime: Infinity });
  const [term, setTerm] = useState("");
  // Each opening starts with an empty search (cleared on the opening edge).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTerm("");
  }
  const needle = labelSearchKey(term);
  const all = q.data ?? [];
  const shown = useMemo(() => {
    const hits = needle ? all.filter((b) => haystack(b).includes(needle)) : all;
    const sel = hits.find((b) => b.slug === selectedSlug);
    return sel ? [sel, ...hits.filter((b) => b !== sel)] : hits;
  }, [all, needle, selectedSlug]);

  const header = (
    <>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Choose a basic booster for the second slot: +1 on each of its four stats, after the cut at 99. Choose it again or Clear to remove it.
      </p>
      <label className="field field--sm">
        <span className="sr-only">Search boosters by name or stat</span>
        <Search className="size-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name or stat…"
          // The drawer (Modal) focuses this after showModal().
          data-autofocus
          className="field__input"
          data-testid="second-booster-search"
        />
      </label>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Select second booster" headerExtra={header} variant="drawer">
      <p className="sr-only" role="status" aria-live="polite">
        {q.isSuccess ? `${shown.length} of ${all.length} boosters` : ""}
      </p>
      {q.isError ? (
        <button type="button" onClick={() => void q.refetch()} className="button button--sm button--secondary">
          Could not load boosters — retry
        </button>
      ) : !q.isSuccess ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Loading boosters…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Nothing matches.</p>
      ) : (
        <ul className="efb-manager-list" aria-label="Second boosters" data-testid="second-booster-list">
          {shown.map((b) => {
            const selected = b.slug === selectedSlug;
            return (
              <li key={b.slug} className={selected ? "efb-manager-list__selected" : undefined}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChoose(b)}
                  className="efb-manager-row efb-booster-row"
                  data-testid="second-booster-row"
                  data-slug={b.slug}
                >
                  <span className="efb-booster-row__icon" aria-hidden>
                    <Sparkles className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{b.name}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {statsOf(b).map((s) => (
                        <span key={s} className="efb-booster-row__pill">
                          {statLabel(s)} +{b.stats[s]}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
                {selected && (
                  <button type="button" onClick={onClear} className="button button--sm button--secondary efb-manager-list__clear" data-testid="second-booster-clear">
                    Clear<span className="sr-only"> {b.name}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
