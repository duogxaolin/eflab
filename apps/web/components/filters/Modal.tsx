"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Filter dialog (efootbase's Stats / Body Model / Playing Style / Skills /
 * Nation / League / Team modals): a native modal <dialog> — focus-trapped, the
 * page behind becomes inert, Escape closes through the `cancel` → `close`
 * events, a click on the backdrop closes — with a header, a scrolling body
 * and a "Done" footer. The look is `.efb-modal*` in globals.css: the
 * <dialog> itself covers the viewport (so a click on it is a backdrop click)
 * and centres or bottom-anchors the panel.
 *
 * Focus return: the browser restores focus to the opener when the dialog is
 * *closed*, not when it is removed while open. The on-demand filter dialogs
 * unmount on Done, so the layout-effect cleanup below closes the element while
 * it is still attached and, as a fallback, refocuses the element that had
 * focus when the dialog opened (multi-select-filters: verified with
 * Playwright — Done and Escape both return focus to the launcher).
 *
 * Variants (efootbase-ui-redesign): "dialog" (default, the centred panel —
 * 608 px, radius 24, padding 24, 32 × 32 close at the top right, accent Done
 * at the bottom right), "sheet" (a bottom sheet with a grab handle and a full-width
 * accent Done, for the phone filters / Progression sheet) and "drawer" (a
 * bottom-anchored panel 512 px wide with a top radius of 16, for the manager
 * picker). All three are the same native modal <dialog>: same focus trap,
 * Escape, backdrop click and focus return; only the look differs
 * (`.efb-modal*` in globals.css).
 *
 * Escape (efootbase-behaviour-parity, B4): handled on the dialog's own
 * keydown instead of the `cancel` event — Chrome lets a non-empty
 * <input type="search"> consume the first Escape (it clears the field), so a
 * search dialog needed two. One Escape closes the dialog unless something
 * inside already handled it (`defaultPrevented`: the Max Level draft reverting,
 * an open tooltip / popover — `components/ui/floating.ts`), it was typed into
 * an IME composition, or the key belongs to a dialog opened inside this one
 * (the manager drawer over the Progression sheet: the event bubbles through
 * both <dialog>s, only the innermost one — the topmost — acts).
 *
 * Motion: the sheet and the drawer slide in and out (250 ms
 * `cubic-bezier(.32,.72,0,1)`, CSS in globals.css). The dialog closes at once
 * — focus returns and the page is interactive again immediately — while the
 * closed dialog stays painted for the slide-out (`display` / `overlay`
 * transitions, inert and click-through) and the panel stays mounted until its
 * transition ends. Under reduced motion it appears and disappears at once.
 */
export type ModalVariant = "dialog" | "sheet" | "drawer";

/** Panel slide duration of the sheet / drawer (matches globals.css), plus slack for the fallback. */
const EXIT_FALLBACK_MS = 250 + 100;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Modal({
  open,
  onClose,
  title,
  children,
  headerExtra,
  footer,
  panelClassName = "",
  variant = "dialog",
  onShown,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Rendered under the title (e.g. a search field or a switch). */
  headerExtra?: ReactNode;
  /** Replaces the "Done" button in the footer (e.g. a confirmation's Cancel / Confirm pair). */
  footer?: ReactNode;
  panelClassName?: string;
  /** Look of the dialog; behaviour is identical. Default "dialog". */
  variant?: ModalVariant;
  /** Called each time the dialog has been shown (after showModal() and the
   *  initial focus), with the panel laid out — e.g. to scroll its body. Runs
   *  whenever the Modal mounts, also when it is mounted late (a lazily
   *  loaded dialog, `components/build-simulator/deferred.tsx`). */
  onShown?: (dialog: HTMLDialogElement) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;
  const titleId = useId();
  const slides = variant !== "dialog";
  // The panel is mounted while open and, for the sheet / drawer, until its
  // slide-out ends (derived during render so the closing frame keeps it).
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!open && mounted && (!slides || reducedMotion())) setMounted(false);
  // Fallback when no transition runs (engines without `display` transitions).
  useEffect(() => {
    if (open || !mounted) return;
    const t = setTimeout(() => setMounted(false), EXIT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      // Initial focus: a dialog with a search field (Nation / League / Team /
      // Skills pickers, the manager drawer) starts in it, marked
      // `data-autofocus`; otherwise the browser's first focusable (Close).
      // React's `autoFocus` cannot do this: it focuses on mount, before
      // showModal(), while the dialog is still closed.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      onShownRef.current?.(dialog);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Unmount while open (Done on an on-demand dialog): close first so the
  // browser runs its focus return, then make sure the opener has focus.
  useLayoutEffect(() => {
    return () => {
      const dialog = ref.current;
      if (dialog?.open) dialog.close();
      const opener = openerRef.current;
      if (opener && opener.isConnected && (document.activeElement === null || document.activeElement === document.body)) {
        opener.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`efb-modal efb-modal--${variant}`}
      aria-labelledby={titleId}
      // While it slides out the closed dialog is still painted: keep its
      // content out of the Tab order and away from assistive technology.
      inert={!open || undefined}
      // React re-dispatches a `close` event through the component tree, so a
      // dialog nested inside this one (the manager drawer inside the
      // Progression sheet) would close this one too; only this element's own
      // close counts.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented || e.nativeEvent.isComposing) return;
        const dialog = e.currentTarget;
        // Topmost only: a key from a dialog nested in this one is that dialog's.
        if (!dialog.open || (e.target as Element).closest("dialog") !== dialog) return;
        // A native popover open inside (not one of ours, which consume Escape
        // themselves) closes first, through the browser's own Escape handling.
        if (dialog.querySelector('[popover="auto"]:popover-open')) return;
        e.preventDefault();
        onClose();
      }}
    >
      {mounted && (
        <div
          className={`efb-modal__panel ${panelClassName}`}
          onTransitionEnd={(e) => {
            if (!open && e.target === e.currentTarget && e.propertyName === "translate") setMounted(false);
          }}
        >
          {variant === "sheet" && <div className="efb-modal__handle" aria-hidden />}
          <div className="efb-modal__header">
            <div className="min-w-0 flex-1 space-y-2">
              <h2 id={titleId} className="efb-modal__title">
                {title}
              </h2>
              {headerExtra}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="efb-modal__close hit-44">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="efb-modal__body">{children}</div>
          <div className="efb-modal__footer">
            {footer ?? (
              <button type="button" onClick={onClose} className="button button--md button--primary">
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
