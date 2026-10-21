"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { CardPreview } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { useDebouncedValue, SEARCH_MIN_LENGTH } from "@/lib/use-debounced-value";
import { PlayerSearchRow } from "./PlayerSearchRow";

/**
 * Player search palette — the header's ⌘K search and the compare picker.
 *
 * A native modal <dialog> (showModal: focus trap, top layer, everything else
 * inert), named by its (visually hidden) title; Escape, the Esc chip and a
 * click on the backdrop close it, and focus returns to the element that had
 * it when the palette opened — or to `returnFocusTo()` when the caller names
 * another target (after a compare pick the slot button is replaced by the card).
 *
 * Look (reference measurements): panel 576 px wide, radius 16, #181818 with an
 * inset #ffffff4d hairline over a #00000099 backdrop; a 45 px input row
 * (search icon, input 14/20, round clear button, Esc chip); rows of
 * `PlayerSearchRow`. Behaviour: 250 ms debounce, nothing under 2 characters,
 * ArrowDown / ArrowUp move between the input and the rows, Enter on the input
 * runs `onSubmitQuery` (header: the full list) or, without it, picks the
 * first result (compare picker). With an empty field it lists the newest
 * cards ("Latest Players", `player.trending` — real data, not a trending
 * ranking).
 */
export function SearchPalette({
  open,
  onClose,
  title,
  onSelect,
  onSubmitQuery,
  returnFocusTo,
}: {
  open: boolean;
  /** Called after the dialog closed (any way). */
  onClose: () => void;
  /** Accessible name of the dialog (visually hidden). */
  title: string;
  onSelect: (player: CardPreview) => void;
  /** Enter on the input with ≥ 2 characters; omitted = pick the first result. */
  onSubmitQuery?: (q: string) => void;
  /** Focus target after closing; `null` (or omitted) = the element that had
   *  focus when the palette opened. */
  returnFocusTo?: () => HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const titleId = useId();
  const inputId = useId();
  const resultsId = useId();
  const hintId = useId();

  // Sync the `open` prop with the native dialog.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
      }
      inputRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const close = useCallback(() => dialogRef.current?.close(), []);

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
    const opener = openerRef.current;
    openerRef.current = null;
    // Focus after React has committed the caller's state change. A caller
    // whose opener is about to be replaced (a compare pick swaps the slot
    // button for the card) names the target itself; otherwise the opener.
    requestAnimationFrame(() => {
      const target = returnFocusTo?.() ?? (opener && opener.isConnected ? opener : null);
      target?.focus();
    });
  }, [onClose, returnFocusTo]);

  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, 250);
  const canSearch = debounced.length >= SEARCH_MIN_LENGTH;
  const typedEnough = trimmed.length >= SEARCH_MIN_LENGTH;
  const search = trpc.player.search.useQuery({ q: debounced, limit: 8 }, { enabled: open && canSearch });
  // Empty field: the newest cards (same query and cache as the home grid).
  const latest = trpc.player.trending.useQuery(undefined, { enabled: open && trimmed.length === 0, staleTime: 5 * 60_000 });
  const results = search.data ?? [];
  const waiting = typedEnough && (!canSearch || debounced !== trimmed || search.isLoading);

  const choose = (p: CardPreview) => {
    onSelect(p);
    close();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedEnough) return;
    if (onSubmitQuery) {
      onSubmitQuery(trimmed);
      close();
    } else if (!waiting && !search.isError && results[0]) {
      choose(results[0]);
    }
  };

  // ArrowDown / ArrowUp between the input and the result rows.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      // Chrome lets a non-empty <input type="search"> swallow the first Escape
      // (it clears the field) before the dialog's `cancel` — close on the key.
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-palette-option]") ?? []);
    if (rows.length === 0) return;
    const active = document.activeElement;
    const idx = rows.findIndex((r) => r === active);
    e.preventDefault();
    if (e.key === "ArrowDown") {
      rows[idx < 0 ? 0 : Math.min(rows.length - 1, idx + 1)]?.focus();
    } else if (idx <= 0) {
      inputRef.current?.focus();
    } else {
      rows[idx - 1]?.focus();
    }
  };

  const status = !typedEnough
    ? trimmed.length > 0
      ? `Type at least ${SEARCH_MIN_LENGTH} characters of a player name.`
      : ""
    : waiting
      ? "Searching…"
      : search.isError
        ? "Search failed."
        : `${results.length} ${results.length === 1 ? "player" : "players"} found`;

  const rowList = (list: readonly CardPreview[]) => (
    <ul className="m-0 list-none p-0">
      {list.map((p) => (
        <li key={p.id}>
          <PlayerSearchRow player={p} data-palette-option="" onClick={() => choose(p)} />
        </li>
      ))}
    </ul>
  );

  return (
    <dialog
      ref={dialogRef}
      className="efb-palette"
      aria-labelledby={titleId}
      onClose={handleClose}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // A click on the dialog element itself (outside the panel) = backdrop.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="efb-palette__panel">
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <p id={hintId} className="sr-only">
          {onSubmitQuery ? "Enter shows every matching card. " : "Enter picks the first result. "}
          Arrow keys move through the results; Escape closes.
        </p>
        <form onSubmit={submit} role="search" className="efb-palette__input-row">
          <Search className="efb-palette__icon" aria-hidden />
          <label htmlFor={inputId} className="sr-only">
            Player name
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players by name…"
            autoComplete="off"
            enterKeyHint="search"
            aria-controls={resultsId}
            aria-describedby={hintId}
            className="efb-palette__input no-native-clear"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="efb-palette__clear hit-44"
              aria-label="Clear search"
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
          {/* The Esc chip closes like the key (phones have no Escape key). */}
          <button type="button" onClick={close} className="efb-kbd efb-palette__esc hit-44" aria-label="Close search (Escape)">
            Esc
          </button>
        </form>

        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>

        <div id={resultsId} ref={listRef} className="efb-palette__results">
          {trimmed.length === 0 ? (
            latest.isError ? (
              <p className="efb-palette__note">
                Could not load the latest players.{" "}
                <button type="button" onClick={() => void latest.refetch()} className="efb-palette__link">
                  Retry
                </button>
              </p>
            ) : (latest.data ?? []).length > 0 ? (
              <section aria-labelledby={`${resultsId}-latest`}>
                <h3 id={`${resultsId}-latest`} className="efb-palette__group">
                  Latest Players
                </h3>
                {rowList((latest.data ?? []).slice(0, 8))}
              </section>
            ) : (
              <p className="efb-palette__note">{latest.isPending ? "Loading the latest players…" : `Type at least ${SEARCH_MIN_LENGTH} characters of a player name.`}</p>
            )
          ) : !typedEnough ? (
            <p className="efb-palette__note">Type at least {SEARCH_MIN_LENGTH} characters of a player name.</p>
          ) : waiting ? (
            <p className="efb-palette__note animate-pulse">Searching…</p>
          ) : search.isError ? (
            <p className="efb-palette__note efb-palette__note--error">
              Search failed.{" "}
              <button type="button" onClick={() => void search.refetch()} className="efb-palette__link">
                Retry
              </button>
            </p>
          ) : results.length === 0 ? (
            <p className="efb-palette__note">No cards found matching &quot;{debounced}&quot;.</p>
          ) : (
            <section aria-labelledby={`${resultsId}-found`}>
              <h3 id={`${resultsId}-found`} className="efb-palette__group">
                Players
              </h3>
              {rowList(results)}
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
