"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Filter dialog (efootbase's Stats / Body Model / Playing Style / Skills /
 * Nation / League / Team modals): a native modal <dialog> — focus-trapped, the
 * page behind becomes inert, Escape closes through the `cancel` → `close`
 * events, a click on the backdrop closes — with a header, a scrolling body
 * and a "Done" footer. Re-uses the palette's dialog/panel classes from
 * globals.css for the full-viewport box and the blurred backdrop.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  headerExtra,
  panelClassName = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Rendered under the title (e.g. a search field or a switch). */
  headerExtra?: ReactNode;
  panelClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="efb-palette"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className={`efb-palette__panel flex max-h-[calc(100dvh-6rem)] flex-col ${panelClassName}`}>
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <h2 id={titleId} className="text-base font-semibold text-white">
                {title}
              </h2>
              {headerExtra}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-[var(--color-text-dim)] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
          <div className="flex justify-end border-t border-[var(--color-line)] px-4 py-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-[var(--color-accent-foreground)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
