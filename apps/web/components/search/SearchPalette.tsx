"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, type CardPreview } from "@eflab/shared";
import { trpc } from "@/lib/trpc";
import { useBrowserOnline } from "@/lib/query-state";
import { PlayerSearchRow } from "./PlayerSearchRow";
import { useLoadMoreOnScroll, usePlayerSearchPages } from "./usePlayerSearchPages";

/** Rows of the "Latest Players" empty state. */
const LATEST_ROWS = 12;

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
 * `PlayerSearchRow`.
 *
 * Behaviour (change efootbase-function-parity "Search Result Lists", survey
 * 2026-10-23 S3 §2 / §10): `usePlayerSearchPages` — 200 ms after the last
 * keystroke, from 3 characters, name or pack / campaign name, pages of 12 in
 * max-overall order with the word-start rows lifted inside each page, the
 * next page when the "Loading more…" row at the end scrolls into view. Below
 * 3 characters the empty state stays: "Latest Players", the 12 newest
 * distinct players (`player.trending` — real data, not a trending ranking;
 * the reference's 2-character "top list" is not copied). The input is an APG
 * combobox: DOM focus stays in it, the rows are `role="option"` pointed at by
 * `aria-activedescendant`; the first result row is active as soon as the
 * results of the current text appear, ArrowDown / ArrowUp move the active
 * row (ArrowDown on the last loaded row asks for the next page; the list
 * wraps once everything is loaded), and Enter opens — or, in the compare
 * picker, picks — the active row; Enter with no active row (no result, the
 * search still running, the empty state before an arrow key) does nothing.
 * Every card can be chosen (the compare picker lists the card already in the
 * other slot like any other).
 */
export function SearchPalette({
  open,
  onClose,
  title,
  onSelect,
  returnFocusTo,
}: {
  open: boolean;
  /** Called after the dialog closed (any way). */
  onClose: () => void;
  /** Accessible name of the dialog (visually hidden). */
  title: string;
  /** A row was chosen (click, tap or Enter on the active row); the palette closes. */
  onSelect: (player: CardPreview) => void;
  /** Focus target after closing; `null` (or omitted) = the element that had
   *  focus when the palette opened. */
  returnFocusTo?: () => HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLParagraphElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  // The row the user moved to with an arrow key, by card id. Null = the
  // default: the first row of the search results, none in the empty state.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const titleId = useId();
  const inputId = useId();
  const listboxId = useId();
  const groupId = useId();
  const hintId = useId();
  const optionId = (p: CardPreview) => `${listboxId}-opt-${p.id}`;

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
    setPickedId(null);
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
  const search = usePlayerSearchPages(query, { enabled: open });
  // Below 3 characters: the newest cards (same query and cache as the home grid).
  const showLatest = !search.typedEnough;
  const latest = trpc.player.trending.useQuery(undefined, { enabled: open && showLatest, staleTime: 5 * 60_000 });
  const latestRows = (latest.data ?? []).slice(0, LATEST_ROWS);

  // The rows on screen, in order; the active one by id.
  const options: readonly CardPreview[] = showLatest ? latestRows : search.rows;
  const picked = pickedId !== null ? options.find((p) => p.id === pickedId) : undefined;
  const active = picked ?? (!showLatest ? options[0] : undefined);

  // Keep the active row in view; a new text starts at the top of its list.
  const activeDomId = active ? optionId(active) : undefined;
  useEffect(() => {
    if (activeDomId) document.getElementById(activeDomId)?.scrollIntoView({ block: "nearest" });
  }, [activeDomId]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [search.query, showLatest]);

  useLoadMoreOnScroll(listRef, sentinelRef, open && search.hasMore && !search.loadMoreFailed, search.pageCount, search.loadMore);

  const choose = (p: CardPreview) => {
    onSelect(p);
    close();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active) choose(active);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Never act in the middle of an IME composition (CJK names).
    if (e.nativeEvent.isComposing) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const n = options.length;
    if (n === 0) return;
    e.preventDefault();
    const at = active ? options.indexOf(active) : -1;
    if (e.key === "ArrowDown") {
      if (at === n - 1 && search.hasMore && !showLatest) {
        // The end of the loaded rows: ask for the next page, stay here.
        search.loadMore();
        return;
      }
      setPickedId(options[at < 0 || at === n - 1 ? 0 : at + 1]!.id);
    } else {
      setPickedId(options[at <= 0 ? n - 1 : at - 1]!.id);
    }
  };

  // Escape: Chrome lets a non-empty <input type="search"> swallow the first
  // Escape (it clears the field) before the dialog's `cancel` — close on the key.
  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  };

  const listing = open && options.length > 0 && (showLatest || search.current);
  // A failed list says why when the browser is offline (the query client
  // fails offline requests at once and reloads them on reconnect).
  const online = useBrowserOnline();
  const searchFailedText = online ? "Search failed." : "Search failed — you appear to be offline.";
  const latestFailedText = online ? "Could not load the latest players." : "Could not load the latest players — you appear to be offline.";
  const status = showLatest
    ? trimmed.length > 0
      ? `Type at least ${SEARCH_MIN_LENGTH} characters to search.`
      : ""
    : search.waiting
      ? "Searching…"
      : search.failed
        ? searchFailedText
        : search.rows.length === 0
          ? `No players found for "${search.query}".`
          : search.hasMore
            ? `${search.rows.length} players listed, more at the end of the list.`
            : `${search.rows.length} ${search.rows.length === 1 ? "player" : "players"} found.`;

  const optionList = (list: readonly CardPreview[], labelledBy: string) => (
    <div id={listboxId} role="listbox" aria-labelledby={labelledBy}>
      {list.map((p) => (
        <PlayerSearchRow
          key={p.id}
          id={optionId(p)}
          player={p}
          role="option"
          aria-selected={p === active}
          // Options are not tab stops (focus stays in the input, which points
          // at them); a mouse press must not move focus out of the input.
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(p)}
        />
      ))}
    </div>
  );

  return (
    <dialog
      ref={dialogRef}
      className="efb-palette"
      aria-labelledby={titleId}
      onClose={handleClose}
      onKeyDown={onDialogKeyDown}
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
          Type at least {SEARCH_MIN_LENGTH} characters of a player or pack name. Up and down arrows move through the players, Enter chooses the highlighted one, Escape closes.
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
            onChange={(e) => {
              setQuery(e.target.value);
              setPickedId(null);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search players by name…"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={SEARCH_MAX_LENGTH}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listing}
            aria-controls={listing ? listboxId : undefined}
            aria-activedescendant={listing ? activeDomId : undefined}
            aria-describedby={hintId}
            className="efb-palette__input no-native-clear"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPickedId(null);
                inputRef.current?.focus();
              }}
              className="efb-palette__clear hit-44"
              aria-label="Clear search"
            >
              <X className="size-3" aria-hidden />
            </button>
          )}
          {/* The Esc chip closes like the key (phones have no Escape key). */}
          {/* Named "Esc, close search": the visible "Esc" first (Label in Name), the key in aria-keyshortcuts. */}
          <button type="button" onClick={close} className="efb-kbd efb-palette__esc hit-44" aria-label="Esc, close search" aria-keyshortcuts="Escape">
            Esc
          </button>
        </form>

        <p className="sr-only" role="status" aria-live="polite">
          {status}
        </p>

        <div ref={listRef} className="efb-palette__results">
          {/* Nothing is listed while closed (the cached latest players would
              otherwise sit in the hidden dialog). */}
          {!open ? null : showLatest ? (
            latest.isError ? (
              <p className="efb-palette__note">
                {latestFailedText}{" "}
                <button type="button" onClick={() => void latest.refetch()} className="efb-palette__link">
                  Retry
                </button>
              </p>
            ) : latestRows.length > 0 ? (
              <section aria-labelledby={groupId}>
                <h3 id={groupId} className="efb-palette__group">
                  Latest Players
                </h3>
                {optionList(latestRows, groupId)}
              </section>
            ) : (
              <p className="efb-palette__note">{latest.isPending ? "Loading the latest players…" : `Type at least ${SEARCH_MIN_LENGTH} characters of a player name.`}</p>
            )
          ) : search.waiting ? (
            <p className="efb-palette__note animate-pulse">Searching…</p>
          ) : search.failed ? (
            <p className="efb-palette__note efb-palette__note--error">
              {searchFailedText}{" "}
              <button type="button" onClick={search.retry} className="efb-palette__link">
                Retry
              </button>
            </p>
          ) : search.rows.length === 0 ? (
            <p className="efb-palette__note">No cards found matching &quot;{search.query}&quot;.</p>
          ) : (
            <section aria-labelledby={groupId}>
              <h3 id={groupId} className="efb-palette__group">
                Players
              </h3>
              {optionList(search.rows, groupId)}
              {search.loadMoreFailed ? (
                <p className="efb-palette__more">
                  Could not load more players.{" "}
                  <button type="button" onClick={search.loadMore} className="efb-palette__link">
                    Retry
                  </button>
                </p>
              ) : search.hasMore ? (
                <p ref={sentinelRef} className="efb-palette__more" aria-hidden>
                  Loading more…
                </p>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
