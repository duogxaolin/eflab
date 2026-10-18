"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SkillDTO } from "@eflab/shared";
import { SKILL_GROUP_LABELS, skillDescription, skillGroup } from "@/lib/skill-labels";
import { SkillIcon } from "@/components/skills/SkillIcon";
import { SkillEffects } from "@/components/skills/SkillEffects";

// Player-page skill chip (efootbase-static-data): a button with the skill's
// artwork thumbnail that opens a native popover (`popover="auto"` +
// `popovertarget`) with the artwork, description, stat boosts and activation.
// The platform provides the keyboard behaviour: Enter / Space toggle it (it is
// a <button>), Escape and a click outside close it, focus returns to the chip
// when it closes from inside, and the popover's link follows the chip in the
// Tab order. Nothing renders in the popover until it is opened (UA
// `display: none`), so the chips cause no layout shift.
//
// Placement always fits the visible (visual) viewport with an 8 px margin on
// every side: the popover's height is capped at the viewport height − 16 px
// (CSS `100dvh` where supported, refined in JS from `visualViewport`, which
// also covers pinch zoom and on-screen keyboards) and it scrolls inside
// (`overflow-y: auto`); it goes under the chip when it fits there, else above,
// else on the roomier side and is then clamped into the viewport. Horizontally
// it starts at the chip's left edge, clamped — no horizontal overflow at 320 px.
// A focused element inside (Tab to the link) is scrolled into view within the
// popover. The position follows window / visual-viewport scroll and resize
// while open. `aria-expanded` mirrors the popover state (popovertarget alone
// does not set the attribute).
const GAP = 6;
const MARGIN = 8;

/** The visible viewport in layout-viewport (position: fixed) coordinates. */
function visibleViewport(): { left: number; top: number; width: number; height: number } {
  const vv = window.visualViewport;
  if (vv) return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
  return { left: 0, top: 0, width: document.documentElement.clientWidth, height: window.innerHeight };
}

export function SkillChip({ slug, label, skill }: { slug: string; label: string; skill: SkillDTO | undefined }) {
  const popoverId = `skill-pop-${useId().replace(/:/g, "")}`;
  const titleId = `${popoverId}-title`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const showtime = skill?.group === "showtime";

  const place = useCallback(() => {
    const button = buttonRef.current;
    const pop = popRef.current;
    if (!button || !pop || !pop.matches(":popover-open")) return;
    const view = visibleViewport();
    // Cap the height first so the measured height is the one that is placed.
    pop.style.maxHeight = `${Math.max(0, Math.floor(view.height - 2 * MARGIN))}px`;
    const r = button.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const minTop = view.top + MARGIN;
    const maxBottom = view.top + view.height - MARGIN;
    const below = r.bottom + GAP;
    const above = r.top - GAP - h;
    let top: number;
    if (below + h <= maxBottom) top = below;
    else if (above >= minTop) top = above;
    else top = maxBottom - (r.bottom + GAP) >= r.top - GAP - minTop ? below : above;
    top = Math.max(minTop, Math.min(top, maxBottom - h));
    const left = Math.max(view.left + MARGIN, Math.min(r.left, view.left + view.width - w - MARGIN));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }, []);

  // First placement: `toggle` is dispatched asynchronously, after the browser may
  // already have painted the popover at its unplaced origin. `beforetoggle` fires
  // synchronously just before the popover is shown, so a frame callback queued
  // there runs after it is shown (measurable) and before its first paint.
  useEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    const onBeforeToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "open") requestAnimationFrame(place);
    };
    pop.addEventListener("beforetoggle", onBeforeToggle);
    return () => pop.removeEventListener("beforetoggle", onBeforeToggle);
  }, [place]);

  // Follow the chip while open (scroll / resize of the window and of the visual viewport).
  useEffect(() => {
    if (!open) return;
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
  }, [open, place]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={popoverId}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-showtime={showtime ? "true" : undefined}
        data-skill={slug}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-md border py-0.5 pl-0.5 pr-2 text-[11px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
          showtime
            ? "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
            : "bg-[var(--color-canvas)] border-[var(--color-line)] text-white/90 hover:border-[var(--color-line-active)]"
        }`}
      >
        <SkillIcon src={skill?.iconUrl ?? null} width={28} className="rounded-[3px]" />
        <span className="truncate">{label}</span>
      </button>
      <div
        ref={popRef}
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        onToggle={(e) => setOpen(e.newState === "open")}
        onFocus={(e) => e.target.scrollIntoView({ block: "nearest" })}
        className="fixed inset-auto m-0 w-[min(18rem,calc(100vw-1rem))] max-h-[calc(100vh-1rem)] supports-[height:100dvh]:max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain space-y-2.5 rounded-xl border border-[var(--color-line-active)] bg-[var(--color-panel)] p-3 text-left text-[var(--color-text-primary)] shadow-2xl"
        data-testid="skill-popover"
      >
        {skill?.iconUrl && <SkillIcon src={skill.iconUrl} width="fluid" className="rounded-lg" />}
        <div className="space-y-0.5">
          <h4 id={titleId} className="text-sm font-bold text-white">
            {label}
          </h4>
          {skill && <p className={`text-[10px] font-semibold uppercase tracking-wider ${showtime ? "text-amber-300" : "text-[var(--color-text-dim)]"}`}>{SKILL_GROUP_LABELS[skillGroup(skill)]}</p>}
        </div>
        {skill?.description && <p className="text-xs leading-snug text-[var(--color-text-secondary)]">{skillDescription(skill)}</p>}
        {skill && <SkillEffects effects={skill.effects} activation={skill.activation} compact />}
        <Link
          href={`/skills/${slug}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Skill page and cards <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </>
  );
}
