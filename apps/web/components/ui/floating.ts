"use client";
import { useEffect, type RefObject } from "react";

// Shared placement and Escape handling for the overlay primitives (Tooltip,
// Popover) and the player-page skill popover (efootbase-behaviour-parity; the
// placement was lifted unchanged from SkillChip.tsx).
//
// Placement always fits the visible (visual) viewport with an 8 px margin on
// every side: the floating element's height is capped at the viewport height
// − 16 px (refined from `visualViewport`, which also covers pinch zoom and
// on-screen keyboards) and it scrolls inside; it goes on the preferred side of
// its anchor (under it by default) when it fits there, else on the other side,
// else on the roomier side and is then clamped into the viewport.
// Horizontally it starts at the anchor's left edge (or spans the anchor with
// `matchWidth`), clamped — no horizontal overflow at 320 px.
// Below lg the fixed bottom chrome (the tab bar, the player page's
// Progression dock and its category strip — marked with FLOOR_ATTR) takes
// the lower edge of the viewport: the available area ends FLOATING_GAP above
// the top edge of the highest piece of it that is shown (`chromeFloor`), so
// no floating element covers any of it (browser QA 2026-10-25 W3: a stat
// row's Adjust popover hid the strip's top 29 px at 390 × 844). Every shown
// fixed piece counts, wherever it sits and whatever holds the anchor (change
// a11y-names-and-card-league D5): on a landscape phone the strip's top is in
// the upper half of the viewport (568 × 320: strip 146, dock 192, tab bar
// 250) — the former rule skipped such chrome, and chrome holding the anchor,
// so a sheet-form popover stood on the dock over the strip; a popover of a
// strip item or of the dock now opens above the strip. Nothing is a floor
// while the anchor sits in an open modal <dialog> (the phone Progression
// sheet covers the chrome).

/** Gap between an anchor and its floating element. */
export const FLOATING_GAP = 6;
/** Smallest distance between a floating element and the viewport edge. */
export const VIEWPORT_MARGIN = 8;

export type FloatingSide = "bottom" | "top";

export interface FloatingOptions {
  /** Preferred side; the other side is used when this one has no room. Default "bottom". */
  side?: FloatingSide;
  /** Give the floating element the anchor's width (still clamped to the viewport). */
  matchWidth?: boolean;
}

/** The visible viewport in layout-viewport (position: fixed) coordinates. */
export function visibleViewport(): { left: number; top: number; width: number; height: number } {
  const vv = window.visualViewport;
  if (vv) return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
  return { left: 0, top: 0, width: document.documentElement.clientWidth, height: window.innerHeight };
}

/** Marks fixed bottom chrome no floating element may cover (MobileBottomNav,
 *  the ProgressionDock's dock and strip). */
export const FLOOR_ATTR = "data-floating-floor";

/** The top edge of the highest shown, fixed bottom chrome a floating element
 *  placed against `anchor` must stay above, or Infinity: every element marked
 *  FLOOR_ATTR that is laid out (not `display: none` — the chrome is hidden
 *  from lg), not `visibility: hidden` and `position: fixed` counts, wherever
 *  it sits and whether or not it holds the anchor; none does while the
 *  anchor is inside an open modal dialog (which covers the chrome). */
export function chromeFloor(anchor: Element | null): number {
  if (typeof document === "undefined" || anchor?.closest("dialog[open]")) return Infinity;
  let floor = Infinity;
  for (const el of document.querySelectorAll(`[${FLOOR_ATTR}]`)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.position !== "fixed" || style.visibility === "hidden") continue;
    floor = Math.min(floor, r.top);
  }
  // A viewport so short that the chrome leaves no usable room above it (a
  // landscape phone under ~250 px, a pinch-zoomed page): a floating element
  // squeezed into that sliver is unreadable, so it covers the chrome as it
  // did before the floor existed.
  if (floor !== Infinity) {
    const view = visibleViewport();
    if (floor - FLOATING_GAP - view.top < MIN_USABLE_AREA) return Infinity;
  }
  return floor;
}

/** Smallest height (px) the area above the bottom chrome must leave for a
 *  popover in its anchored form; below it a popover that opts into the sheet
 *  form (`sheetBelow`) takes that form at any viewport width (design D5: a
 *  short landscape viewport, where an anchored popover would be squeezed
 *  next to its anchor). */
export const MIN_FLOATING_AREA = 160;

/** Below this much room (px) above the bottom chrome the floor is dropped
 *  altogether (see chromeFloor): the sheet form cannot be usable either. */
export const MIN_USABLE_AREA = 96;

/** The lowest y (layout-viewport coordinates) a floating element placed
 *  against `anchor` may reach: the visible viewport's bottom or the top of
 *  the bottom chrome, minus the gap. */
function bottomLimit(anchor: Element | null, view: ReturnType<typeof visibleViewport>): number {
  return Math.min(view.top + view.height - VIEWPORT_MARGIN, chromeFloor(anchor) - FLOATING_GAP);
}

// ── Sheet form ────────────────────────────────────────────────────────────────
// A popover that opts in (PopoverPanel `sheetBelow`) is shown as a bottom
// sheet instead of next to its anchor when, on a viewport narrower than that
// breakpoint, its anchored form is taller than half the visible area (the
// visible viewport above the bottom chrome; the stat-row Adjust popover below
// 640 px) — or, at any width, when the bottom chrome leaves less than
// MIN_FLOATING_AREA above it. The choice is made once per opening (`wantsSheet`, measured in the
// anchored form right after showing) and marked with SHEET_ATTR; while it is
// set, every placement pins the element to the bottom of the visible
// viewport at its full width, at most 85 % of its height, scrolling inside —
// or, over bottom chrome, to FLOATING_GAP above the chrome, 8 px in from both
// sides with all corners rounded (SHEET_FLOORED_ATTR). Same element, same
// state, focus and dismissal — only the shape changes
// (`.efb-popover[data-sheet]`).

/** Marks a popover shown in its sheet form. */
export const SHEET_ATTR = "data-sheet";
/** Marks a sheet-form popover that stands on the bottom chrome. */
export const SHEET_FLOORED_ATTR = "data-sheet-floored";
/** Largest share of the visible area's height a popover sheet takes. */
const SHEET_MAX_SHARE = 0.85;

/** True when a shown floating element, placed in its anchored form, is taller
 *  than half the visible area above the bottom chrome (`anchor`'s floor) and
 *  the viewport is narrower than `below`, or when that chrome leaves less
 *  than MIN_FLOATING_AREA of the visible viewport above it. */
export function wantsSheet(floating: HTMLElement, below: number, anchor: Element | null = null): boolean {
  const view = visibleViewport();
  const viewBottom = view.top + view.height;
  const floor = chromeFloor(anchor) - FLOATING_GAP;
  const area = Math.min(viewBottom, floor) - view.top;
  if (floor < viewBottom && area < MIN_FLOATING_AREA) return true;
  return view.width < below && floating.getBoundingClientRect().height > area / 2;
}

/** Back to the anchored form (start of every opening). */
export function clearSheet(floating: HTMLElement): void {
  if (!floating.hasAttribute(SHEET_ATTR)) return;
  floating.removeAttribute(SHEET_ATTR);
  floating.removeAttribute(SHEET_FLOORED_ATTR);
  floating.style.width = "";
}

function placeSheet(anchor: Element, floating: HTMLElement): void {
  const view = visibleViewport();
  const floor = chromeFloor(anchor);
  const floored = floor < view.top + view.height;
  floating.toggleAttribute(SHEET_FLOORED_ATTR, floored);
  const inset = floored ? VIEWPORT_MARGIN : 0;
  const bottom = floored ? floor - FLOATING_GAP : view.top + view.height;
  floating.style.width = `${Math.floor(view.width - 2 * inset)}px`;
  floating.style.maxHeight = `${Math.floor((bottom - view.top) * SHEET_MAX_SHARE)}px`;
  const h = Math.ceil(floating.getBoundingClientRect().height);
  floating.style.left = `${Math.ceil(view.left + inset)}px`;
  floating.style.top = `${Math.floor(bottom - h)}px`;
}

/** Position a shown `position: fixed` element next to `anchor`, inside the
 *  visible viewport (or at its bottom edge when it is in its sheet form). */
export function placeFloating(anchor: Element, floating: HTMLElement, { side = "bottom", matchWidth = false }: FloatingOptions = {}): void {
  if (floating.hasAttribute(SHEET_ATTR)) return placeSheet(anchor, floating);
  const view = visibleViewport();
  const r = anchor.getBoundingClientRect();
  if (matchWidth) floating.style.width = `${Math.max(0, Math.min(r.width, view.width - 2 * VIEWPORT_MARGIN))}px`;
  const minTop = view.top + VIEWPORT_MARGIN;
  // The visible viewport's bottom, or above the bottom chrome (`chromeFloor`).
  const maxBottom = bottomLimit(anchor, view);
  // Cap the height first so the measured height is the one that is placed.
  floating.style.maxHeight = `${Math.max(0, Math.floor(maxBottom - minTop))}px`;
  // Fractional sizes rounded up, positions rounded inwards: the margin is
  // never less than 8 px, also with a sub-pixel content height.
  const size = floating.getBoundingClientRect();
  const w = Math.ceil(size.width);
  const h = Math.ceil(size.height);
  const below = r.bottom + FLOATING_GAP;
  const above = r.top - FLOATING_GAP - h;
  const fitsBelow = below + h <= maxBottom;
  const fitsAbove = above >= minTop;
  let top: number;
  if (side === "bottom" ? fitsBelow : !fitsAbove && fitsBelow) top = below;
  else if (fitsAbove) top = above;
  else top = maxBottom - (r.bottom + FLOATING_GAP) >= r.top - FLOATING_GAP - minTop ? below : above;
  top = Math.max(Math.ceil(minTop), Math.min(Math.round(top), Math.floor(maxBottom - h)));
  const minLeft = view.left + VIEWPORT_MARGIN;
  const maxRight = view.left + view.width - VIEWPORT_MARGIN;
  const left = Math.max(Math.ceil(minLeft), Math.min(Math.round(r.left), Math.floor(maxRight - w)));
  floating.style.left = `${left}px`;
  floating.style.top = `${top}px`;
}

/**
 * Keep a native popover placed next to its anchor.
 *
 * First placement: `toggle` is dispatched asynchronously, after the browser may
 * already have painted the popover at its unplaced origin. `beforetoggle` fires
 * synchronously just before the popover is shown, so a frame callback queued
 * there runs after it is shown (measurable) and before its first paint.
 * While `open`, the position follows window / visual-viewport scroll and resize.
 */
export function useFloatingPlacement(
  anchorRef: RefObject<Element | null>,
  floatingRef: RefObject<HTMLElement | null>,
  open: boolean,
  options: FloatingOptions = {},
): void {
  const { side = "bottom", matchWidth = false } = options;

  useEffect(() => {
    const floating = floatingRef.current;
    if (!floating) return;
    const onBeforeToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open") return;
      requestAnimationFrame(() => {
        const anchor = anchorRef.current;
        if (anchor && floating.matches(":popover-open")) placeFloating(anchor, floating, { side, matchWidth });
      });
    };
    floating.addEventListener("beforetoggle", onBeforeToggle);
    return () => floating.removeEventListener("beforetoggle", onBeforeToggle);
  }, [anchorRef, floatingRef, side, matchWidth]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      const floating = floatingRef.current;
      if (anchor && floating && floating.matches(":popover-open")) placeFloating(anchor, floating, { side, matchWidth });
    };
    place();
    const vv = window.visualViewport;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    vv?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
      vv?.removeEventListener("resize", place);
    };
  }, [open, anchorRef, floatingRef, side, matchWidth]);
}

// ── Escape layers ─────────────────────────────────────────────────────────────
// Open tooltips and popovers register a layer; one document listener in the
// capture phase hands Escape to the most recently opened layer only and calls
// preventDefault(), so a modal <dialog> underneath (Modal.tsx skips a
// defaultPrevented Escape) stays open — one Escape closes one thing. The
// capture phase runs before React's root listener, so this also wins over a
// React onKeyDown anywhere in the tree. An Escape typed into an IME
// composition (Vietnamese Telex, CJK) is left alone.

type EscapeLayer = { close: () => void };
const escapeLayers: EscapeLayer[] = [];

function onEscapeKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
  const top = escapeLayers[escapeLayers.length - 1];
  if (!top) return;
  e.preventDefault();
  top.close();
}

/** Register `close` as the topmost Escape layer; returns the unregister function. */
export function pushEscapeLayer(close: () => void): () => void {
  const layer: EscapeLayer = { close };
  escapeLayers.push(layer);
  if (escapeLayers.length === 1) document.addEventListener("keydown", onEscapeKey, true);
  return () => {
    const i = escapeLayers.indexOf(layer);
    if (i >= 0) escapeLayers.splice(i, 1);
    if (escapeLayers.length === 0) document.removeEventListener("keydown", onEscapeKey, true);
  };
}

/** True when `el` (or the document's focus) sits in `container` or focus fell to the body. */
export function focusIsLostOrInside(container: Element | null): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || (container !== null && container.contains(active));
}

/** Show a popover with `source` (the invoker, so a press on it is not a light
 *  dismiss) where the browser supports it; older engines ignore the argument. */
export function showPopoverFrom(el: HTMLElement, source: HTMLElement | null): void {
  (el.showPopover as (options?: { source?: HTMLElement }) => void).call(el, source ? { source } : undefined);
}
