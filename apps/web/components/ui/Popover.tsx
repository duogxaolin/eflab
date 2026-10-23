"use client";
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import {
  SHEET_ATTR,
  clearSheet,
  focusIsLostOrInside,
  placeFloating,
  pushEscapeLayer,
  showPopoverFrom,
  useFloatingPlacement,
  wantsSheet,
  type FloatingSide,
} from "./floating";

// Click popover primitive (efootbase-behaviour-parity): a non-modal
// `role="dialog"` on the native popover API (`popover="auto"`: top layer and
// light dismiss). Activating the trigger (click, Enter, Space, tap) toggles
// it; the trigger carries `aria-haspopup="dialog"`, `aria-expanded` and
// `aria-controls`; on open focus moves to the element marked `data-autofocus`
// inside, else the first control, else the panel itself; Escape (through the
// shared Escape layers, so a dialog underneath stays open) or a click outside
// closes it, and focus returns to the trigger when it was inside the popover
// or fell to the body (a click on another control keeps that control
// focused). Focus moving out of it (Tab past its last control, Shift+Tab
// before its first) closes it too, focus staying where it went — a non-modal
// popover never stays open behind the focus (QA 2026-10-23 bug 6); its
// visible controls are all tab stops. Placement and the 8 px viewport clamp
// are shared with the tooltip (`floating.ts`); a popover taller than the
// viewport scrolls inside.
// With `sheetBelow` a popover is shown as a bottom sheet on a narrow viewport
// when it is taller than half of it (the stat-row Adjust popover on phones).
// Content renders only while open.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export interface PopoverPanelProps {
  open: boolean;
  /** Called with false when the popover closes itself (Escape, light dismiss). */
  onOpenChange: (open: boolean) => void;
  /** The control that opened it: focus returns here; a press on it is not a light dismiss. */
  triggerRef: RefObject<HTMLElement | null>;
  /** What the popover is placed against; defaults to the trigger. */
  anchorRef?: RefObject<HTMLElement | null>;
  /** id of the heading that names the dialog (preferred) … */
  labelledBy?: string;
  /** … or a plain accessible name. */
  label?: string;
  id?: string;
  side?: FloatingSide;
  /** Give the popover the anchor's width. */
  matchWidth?: boolean;
  /** Below this viewport width (px), show it as a bottom sheet when its
   *  anchored form is taller than half the viewport (decided once per
   *  opening — `floating.ts`, "Sheet form"). Omitted: always anchored. */
  sheetBelow?: number;
  className?: string;
  children: ReactNode;
  "data-testid"?: string;
}

/** The controlled popover surface (used by `Popover` and by the tooltip's touch / click variant). */
export function PopoverPanel({
  open,
  onOpenChange,
  triggerRef,
  anchorRef,
  labelledBy,
  label,
  id,
  side = "bottom",
  matchWidth = false,
  sheetBelow,
  className = "",
  children,
  "data-testid": testId,
}: PopoverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const anchor = anchorRef ?? triggerRef;
  useFloatingPlacement(anchor, panelRef, open, { side, matchWidth });

  const returnFocus = useCallback(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (trigger?.isConnected && focusIsLostOrInside(panel)) trigger.focus();
  }, [triggerRef]);

  // Set while a close is caused by focus moving out: that focus has a
  // destination, so the close must not pull it back to the trigger (the
  // focusout runs before the new element is focused — activeElement is still
  // the body there, which would read as "focus lost").
  const focusMovedOut = useRef(false);

  // Sync the `open` prop with the native popover.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const shown = panel.matches(":popover-open");
    if (open && !shown) {
      focusMovedOut.current = false;
      clearSheet(panel);
      showPopoverFrom(panel, triggerRef.current);
      const a = anchor.current;
      if (a) placeFloating(a, panel, { side, matchWidth });
      if (sheetBelow !== undefined && wantsSheet(panel, sheetBelow)) {
        panel.setAttribute(SHEET_ATTR, "");
        placeFloating(a ?? panel, panel, { side, matchWidth });
      }
      const target = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus({ preventScroll: true });
    } else if (!open && shown) {
      // Focus must leave before the panel hides, or it is dropped to the body
      // — unless it is already on its way to another element.
      if (focusMovedOut.current) focusMovedOut.current = false;
      else returnFocus();
      panel.hidePopover();
    }
  }, [open, anchor, triggerRef, side, matchWidth, sheetBelow, returnFocus]);

  // Escape closes the topmost layer only (a dialog underneath stays open). The
  // layer is registered once per opening (a re-render with a new callback must
  // not move it above a layer opened later).
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    if (!open) return;
    return pushEscapeLayer(() => onOpenChangeRef.current(false));
  }, [open]);

  return (
    <div
      ref={panelRef}
      id={id}
      popover="auto"
      role="dialog"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      tabIndex={-1}
      // Light dismiss (outside click) and any other native close: report it,
      // then put focus back on the trigger if it was lost.
      onToggle={(e) => {
        if (e.newState === "closed") {
          returnFocus();
          if (open) onOpenChange(false);
        }
      }}
      // Tab to an element lower in a scrolling popover keeps it in view.
      onFocus={(e) => e.target.scrollIntoView({ block: "nearest" })}
      // Focus moved to an element outside (Tab past the last control,
      // Shift+Tab before the first, a click on another control): the popover
      // closes through `onOpenChange` like any other dismissal, so no popover
      // stays open without focus and its owner's state (the stat-row
      // highlight, `aria-expanded`) follows; focus stays where it went. A
      // blur with nowhere to go (a control disabled under focus, the window
      // losing focus) is not a move and keeps it open.
      onBlur={(e) => {
        const to = e.relatedTarget;
        if (open && to instanceof Node && !e.currentTarget.contains(to)) {
          focusMovedOut.current = true;
          onOpenChange(false);
        }
      }}
      className={`efb-popover ${className}`}
      data-testid={testId}
    >
      {open ? children : null}
    </div>
  );
}

export interface PopoverTriggerProps {
  ref: (el: HTMLElement | null) => void;
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  "aria-controls": string;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
}

/**
 * A trigger plus its popover. `trigger` receives the props to spread on a
 * <button> (Enter / Space activate it natively). Controlled when `open` /
 * `onOpenChange` are passed, else it keeps its own state.
 */
export function Popover({
  trigger,
  children,
  open: openProp,
  onOpenChange,
  labelledBy,
  label,
  anchorRef,
  side,
  matchWidth,
  sheetBelow,
  className,
  "data-testid": testId,
}: {
  trigger: (props: PopoverTriggerProps) => ReactNode;
  /** Content; a function receives `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  labelledBy?: string;
  label?: string;
  anchorRef?: RefObject<HTMLElement | null>;
  side?: FloatingSide;
  matchWidth?: boolean;
  sheetBelow?: number;
  className?: string;
  "data-testid"?: string;
}) {
  const id = `pop-${useId().replace(/:/g, "")}`;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOwnOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const triggerRef = useRef<HTMLElement | null>(null);
  // State at the press: in an engine without `showPopover({ source })` the
  // press on the trigger light-dismisses the popover before the click, which
  // would then reopen it. A click on a trigger that was open at the press closes.
  const openAtPress = useRef<boolean | null>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);

  const triggerProps: PopoverTriggerProps = {
    ref: (el) => {
      triggerRef.current = el;
    },
    "aria-haspopup": "dialog",
    "aria-expanded": open,
    "aria-controls": id,
    onPointerDown: () => {
      openAtPress.current = open;
    },
    onClick: () => {
      const wasOpen = openAtPress.current ?? open;
      openAtPress.current = null;
      setOpen(!wasOpen);
    },
  };

  return (
    <>
      {trigger(triggerProps)}
      <PopoverPanel
        id={id}
        open={open}
        onOpenChange={setOpen}
        triggerRef={triggerRef}
        anchorRef={anchorRef}
        labelledBy={labelledBy}
        label={label}
        side={side}
        matchWidth={matchWidth}
        sheetBelow={sheetBelow}
        className={className}
        data-testid={testId}
      >
        {typeof children === "function" ? children(close) : children}
      </PopoverPanel>
    </>
  );
}
