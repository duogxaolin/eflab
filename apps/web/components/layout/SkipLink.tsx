"use client";
import type { MouseEvent, ReactNode } from "react";

/**
 * Skip link (browser QA 2026-10-25 W1): visually hidden until it receives
 * keyboard focus, then an accent pill above everything (`.efb-skip-link`).
 * Activating it moves focus to the element with `targetId` (a landmark or a
 * container marked `.efb-skip-target`), so the next Tab continues from
 * there, and brings it into view below the sticky header (the target's
 * `scroll-margin-top`), without a smooth scroll.
 *
 * The target is made focusable only for that move: `tabindex="-1"` is set
 * here and removed when it loses focus. A permanent `tabIndex={-1}` on
 * `main` (or the /players rail) would make every click on blank page space
 * focus it — which breaks the popovers' "outside click returns focus to the
 * trigger" (focus would have somewhere to go and stay there).
 *
 * Handled in script — no `#id` is added to the address and no history entry
 * is created (the /players page keeps its state in the query string and
 * rewrites it with `history.replaceState`); the `href` is the no-script
 * fallback.
 */
export function SkipLink({
  targetId,
  children,
  className = "",
  "data-testid": testId,
}: {
  targetId: string;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
    target.focus({ preventScroll: true });
    // Scrolled only when it starts under the sticky header or low in the
    // viewport (a sticky target, the /players filter rail, never moves).
    const top = target.getBoundingClientRect().top;
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    if (top < margin || top > window.innerHeight * 0.6) target.scrollIntoView({ block: "start", inline: "nearest" });
  };
  return (
    <a href={`#${targetId}`} onClick={onClick} className={`efb-skip-link ${className}`} data-testid={testId}>
      {children}
    </a>
  );
}
