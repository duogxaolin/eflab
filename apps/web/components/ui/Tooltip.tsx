"use client";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { placeFloating, pushEscapeLayer, useFloatingPlacement, type FloatingSide } from "./floating";
import { PopoverPanel } from "./Popover";

// Hover / focus tooltip primitive (efootbase-behaviour-parity; timing of change
// efootbase-function-parity, design D7: the reference's measured behaviour —
// open 514–547 ms after the pointer rests, close 104–113 ms after it leaves,
// the next trigger in 25 ms, keyboard focus in about 27 ms).
//
// - Mouse: opens after the pointer rests on the trigger for TOOLTIP_OPEN_MS,
//   at once while another tooltip is open or closed less than
//   TOOLTIP_WARMUP_MS ago (warm-up, so moving along a row of triggers is
//   immediate after the first one). Only a real mouse on a hover-capable
//   device opens it (`pointerType === "mouse"` and `(hover: hover)`); touch
//   and pen never do.
// - It is hoverable (WCAG 1.4.13, a deliberate deviation from the reference's
//   `pointer-events: none`): it closes TOOLTIP_CLOSE_MS after the pointer has
//   left both the trigger and the tooltip, which bridges the 6 px gap, and
//   stays open while the pointer is over it.
// - Keyboard: opens at once when the trigger gets keyboard focus
//   (`:focus-visible`, so a mouse click that focuses a link does not), closes
//   on blur.
// - Escape closes it without moving focus (shared Escape layers: a dialog
//   underneath stays open). A press on the trigger closes it.
// - `role="tooltip"`, referenced by the trigger's `aria-describedby`; it is in
//   the DOM while closed (UA `display: none`), so the description is always
//   available. Its content must not be interactive (no links, no buttons).
// - Placed in the top layer (`popover="manual"`: no light dismiss) with the
//   shared placement — under the trigger, else above, ≥ 8 px inside the
//   visible viewport.
// - `popover` adds a click popover with the same (or richer, e.g. a link)
//   content: `popoverOn="touch"` (default) opens it only on a touch / pen tap —
//   the tap does not follow a link trigger; a mouse click and Enter keep the
//   trigger's own action — and `popoverOn="click"` on every activation (a
//   button whose only action is to show the text: the trigger then carries
//   `aria-haspopup="dialog"` and `aria-expanded`).

// The delay values are defined here once (design D7); change them here.
/** Mouse rest before a tooltip opens. */
export const TOOLTIP_OPEN_MS = 500;
/** Delay before a tooltip closes once the pointer left the trigger and the tooltip. */
export const TOOLTIP_CLOSE_MS = 100;
/** A tooltip opens at once when another one closed less than this long ago. */
export const TOOLTIP_WARMUP_MS = 500;

// Warm-up state shared by every tooltip: at most one is open at a time.
interface TooltipHandle {
  hideNow: () => void;
}
let activeTooltip: TooltipHandle | null = null;
let lastClosedAt = Number.NEGATIVE_INFINITY;
const warm = () => activeTooltip !== null || performance.now() - lastClosedAt < TOOLTIP_WARMUP_MS;
const hoverDevice = () => window.matchMedia("(hover: hover)").matches;

export interface TooltipTriggerProps {
  ref: (el: HTMLElement | null) => void;
  "aria-describedby": string;
  "aria-haspopup"?: "dialog";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: (e: FocusEvent<HTMLElement>) => void;
  onClick: (e: MouseEvent<HTMLElement>) => void;
}

export interface TooltipPopover {
  content: ReactNode;
  /** id of the heading inside `content` that names the dialog … */
  labelledBy?: string;
  /** … or a plain accessible name. */
  label?: string;
  className?: string;
  "data-testid"?: string;
}

export function Tooltip({
  content,
  children,
  className = "",
  side = "bottom",
  popover,
  popoverOn = "touch",
  "data-testid": testId,
}: {
  /** Non-interactive preview content. */
  content: ReactNode;
  /** Renders the trigger; spread the props on it (a link or a button). */
  children: (props: TooltipTriggerProps) => ReactNode;
  className?: string;
  side?: FloatingSide;
  /** Click popover with the same content (touch fallback, or every click). */
  popover?: TooltipPopover;
  popoverOn?: "touch" | "click";
  "data-testid"?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const tipId = `tip-${uid}`;
  const popId = `tip-pop-${uid}`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Pointer type of the press that leads to the next click, and whether the
  // popover was open at that press (an engine without `showPopover({ source })`
  // light-dismisses it on the press, before the click).
  const pressType = useRef<string | null>(null);
  const popOpenAtPress = useRef<boolean | null>(null);
  const handle = useRef<TooltipHandle>({ hideNow: () => {} });

  useFloatingPlacement(triggerRef, tipRef, open, { side });

  const clearTimers = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    openTimer.current = undefined;
    closeTimer.current = undefined;
  }, []);

  const hideNow = useCallback(() => {
    clearTimers();
    const tip = tipRef.current;
    if (tip?.matches(":popover-open")) {
      tip.hidePopover();
      lastClosedAt = performance.now();
    }
    if (activeTooltip === handle.current) activeTooltip = null;
    setOpen(false);
  }, [clearTimers]);
  handle.current.hideNow = hideNow;

  const showNow = useCallback(() => {
    clearTimers();
    const tip = tipRef.current;
    const trigger = triggerRef.current;
    if (!tip || !trigger?.isConnected) return;
    if (activeTooltip && activeTooltip !== handle.current) activeTooltip.hideNow();
    if (!tip.matches(":popover-open")) {
      tip.showPopover();
      placeFloating(trigger, tip, { side });
    }
    activeTooltip = handle.current;
    setOpen(true);
  }, [clearTimers, side]);

  const isShown = () => tipRef.current?.matches(":popover-open") === true;
  const scheduleHide = () => {
    if (!isShown()) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(hideNow, TOOLTIP_CLOSE_MS);
  };

  // Escape closes it (focus stays where it is).
  useEffect(() => {
    if (!open) return;
    return pushEscapeLayer(hideNow);
  }, [open, hideNow]);

  // Unmount while open or pending.
  useEffect(
    () => () => {
      clearTimers();
      if (activeTooltip === handle.current) {
        activeTooltip = null;
        lastClosedAt = performance.now();
      }
    },
    [clearTimers],
  );

  const clickPopover = popover !== undefined && popoverOn === "click";
  const triggerProps: TooltipTriggerProps = {
    ref: (el) => {
      triggerRef.current = el;
    },
    "aria-describedby": tipId,
    ...(clickPopover ? { "aria-haspopup": "dialog" as const, "aria-expanded": popOpen, "aria-controls": popId } : {}),
    onPointerEnter: (e) => {
      if (e.pointerType !== "mouse" || !hoverDevice()) return;
      clearTimeout(closeTimer.current);
      if (popOpen || isShown()) return;
      if (warm()) showNow();
      else {
        clearTimeout(openTimer.current);
        openTimer.current = setTimeout(showNow, TOOLTIP_OPEN_MS);
      }
    },
    onPointerLeave: (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(openTimer.current);
      openTimer.current = undefined;
      // Opened by keyboard focus: it stays while the trigger has focus.
      if (triggerRef.current?.matches(":focus-visible")) return;
      scheduleHide();
    },
    onPointerDown: (e) => {
      pressType.current = e.pointerType;
      popOpenAtPress.current = popOpen;
      hideNow();
    },
    onFocus: (e) => {
      if (!popOpen && e.currentTarget.matches(":focus-visible")) showNow();
    },
    onBlur: () => hideNow(),
    onClick: (e) => {
      // Chrome / Firefox give the click its own pointerType ("" for a
      // keyboard Enter); elsewhere a pointer click (detail > 0) uses the press.
      const own = (e.nativeEvent as Partial<globalThis.PointerEvent>).pointerType;
      const type = own || (e.detail > 0 ? pressType.current : null);
      const wasOpen = popOpenAtPress.current ?? popOpen;
      pressType.current = null;
      popOpenAtPress.current = null;
      if (!popover) return;
      const touch = type === "touch" || type === "pen";
      if (!clickPopover && !touch) return;
      e.preventDefault();
      hideNow();
      setPopOpen(!wasOpen);
    },
  };

  return (
    <>
      {children(triggerProps)}
      <div
        ref={tipRef}
        id={tipId}
        role="tooltip"
        popover="manual"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") clearTimeout(closeTimer.current);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleHide();
        }}
        className={`efb-tooltip ${className}`}
        data-testid={testId}
      >
        {content}
      </div>
      {popover && (
        <PopoverPanel
          id={popId}
          open={popOpen}
          onOpenChange={setPopOpen}
          triggerRef={triggerRef}
          labelledBy={popover.labelledBy}
          label={popover.label}
          side={side}
          className={popover.className}
          data-testid={popover["data-testid"]}
        >
          {popover.content}
        </PopoverPanel>
      )}
    </>
  );
}
