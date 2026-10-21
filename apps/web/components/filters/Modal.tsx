"use client";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
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
 */
export type ModalVariant = "dialog" | "sheet" | "drawer";

export function Modal({
  open,
  onClose,
  title,
  children,
  headerExtra,
  footer,
  panelClassName = "",
  variant = "dialog",
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
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

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
    >
      {open && (
        <div className={`efb-modal__panel ${panelClassName}`}>
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
