"use client";
import { useCallback, useId, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronsUp, Crosshair, Footprints, Hand, Send, Shield, Volleyball, Zap, type LucideIcon } from "lucide-react";
import {
  PROGRESSION_CATEGORY_LABELS,
  TRAINING_CATEGORIES,
  TRAINING_STATS,
  type BaseStat,
  type TrainingAllocation,
  type TrainingCategory,
} from "@eflab/shared";
import {
  ATTACKING_STATS,
  DEFENDING_STATS,
  STRENGTH_STATS,
  statLabel,
  statTierBg,
  statTierClass,
  statTierForeground,
} from "@/lib/card-display";
import { Popover } from "@/components/ui/Popover";

// Three-column stat grid of the player detail page (efootbase layout):
// Attacking / Defending / Strength, one row per stat with the tier colour of
// the value (five tiers, ≥ 100 magenta — reached only through boosters or the
// manager, training stops at 99), a cyan "+N" chip for a booster bump and a
// lime "+1" chip for the selected manager.
// When the build can spend training points, activating a row (click, Enter,
// Space, tap) opens its Adjust popover (change efootbase-function-parity, D6;
// the reference's stat rows are popover triggers named "Adjust Dexterity —
// Offensive Awareness"): a non-modal dialog titled with the row's training
// category ("Dexterity"; Jumping: "Aerial Strength & Goalkeeper 1" — both
// raise it, the reference offers Goalkeeper 1 only) holding only that
// category's − / value / + and a 0–25 slider (`renderAdjust`, the Progression
// panel's own CategoryAdjust — one state). No breakdown there: it is the
// "Stat breakdown" list of "About this build". When the build cannot spend
// points (a Highlight card with a level cap of 1 at Max Level 1, a Trending
// card, any other card with a level cap of 1) the rows are plain — no button
// role, no popover. While a popover is open the stats of its categories are
// highlighted (the caller combines the open popover's categories, the hover /
// focus preview and the pinned category — useCategoryPreview).
// Below 640 px a popover taller than half the viewport is shown as a bottom
// sheet — the same popover element, state and focus handling (Popover
// `sheetBelow`).

/** Viewport width below which a tall Adjust popover becomes a bottom sheet. */
export const ADJUST_SHEET_BELOW = 640;

/** Stat → the training categories that raise it, in TRAINING_CATEGORIES
 *  order. Every stat is in at least one; Jump is in two (Aerial Strength and
 *  Goalkeeper 1 — each lifts it, see TRAINING_STATS). */
export const STAT_CATEGORIES: Readonly<Record<BaseStat, readonly TrainingCategory[]>> = (() => {
  const m = {} as Record<BaseStat, TrainingCategory[]>;
  for (const cat of TRAINING_CATEGORIES) for (const s of TRAINING_STATS[cat]) (m[s] ??= []).push(cat);
  return m;
})();

export type StatHighlight = TrainingCategory | null;
/** The categories the grid lights (an open Adjust popover's, else a preview,
 *  else the pinned one), or null. */
export type ActiveCategories = readonly TrainingCategory[] | null;
/** Reports which Adjust popover is open (`owner` names it — a row, a strip
 *  item — and only that owner can clear it) and its categories. */
export type AdjustReport = (owner: string, cats: readonly TrainingCategory[] | null) => void;

/** Handlers a category control (strip item, Progression panel label)
 *  spreads to preview its category's stats. */
export interface CategoryPreviewHandlers {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
}
export type CategoryPreviewBind = (cat: TrainingCategory) => CategoryPreviewHandlers;

const hoverDevice = () => window.matchMedia("(hover: hover)").matches;

/** Category hover preview (owner feedback 2026-10-23: on the reference,
 *  merely hovering a category item lights its stats). A mouse pointer on a
 *  hover-capable device over a category control, or keyboard focus on it
 *  (`:focus-visible` — a mouse click that focuses the button does not
 *  count), previews that category; leaving / blurring returns to the open
 *  Adjust popover's highlight, else the pinned one. Touch never previews:
 *  `pointerenter` is gated on `pointerType === "mouse"` (a tap's emulated
 *  mouseenter is never followed by a mouseleave, so mouse events would leave
 *  a stuck preview). Hover wins over focus; a handler clears only the
 *  preview it still owns. */
export function useCategoryPreview(): { preview: StatHighlight; bind: CategoryPreviewBind; clear: () => void } {
  const [hover, setHover] = useState<StatHighlight>(null);
  const [focus, setFocus] = useState<StatHighlight>(null);
  const bind = useCallback<CategoryPreviewBind>(
    (cat) => ({
      onPointerEnter: (e) => {
        if (e.pointerType === "mouse" && hoverDevice()) setHover(cat);
      },
      onPointerLeave: (e) => {
        if (e.pointerType === "mouse") setHover((cur) => (cur === cat ? null : cur));
      },
      onFocus: (e) => {
        if (e.currentTarget.matches(":focus-visible")) setFocus(cat);
      },
      onBlur: () => setFocus((cur) => (cur === cat ? null : cur)),
    }),
    [],
  );
  const clear = useCallback(() => {
    setHover(null);
    setFocus(null);
  }, []);
  return { preview: hover ?? focus, bind, clear };
}

/** "+N" chip for a stat raised by an active booster (cyan) or by the selected
 *  manager (lime, "+1"); what it is is said in screen-reader text. */
export function DeltaChip({ delta, kind = "booster" }: { delta: number | undefined; kind?: "booster" | "manager" }) {
  if (!delta) return null;
  return (
    <span
      className={`efb-stat-row__boost ${kind === "manager" ? "efb-stat-row__boost--lime" : "efb-stat-row__boost--cyan"}`}
      data-testid={kind === "manager" ? "stat-manager-delta" : "stat-delta"}
    >
      {delta > 0 ? `+${delta}` : delta}
      <span className="sr-only"> {kind === "manager" ? "manager" : "booster"}</span>
    </span>
  );
}

interface GridProps {
  values: Record<BaseStat, number>;
  /** Booster bump per stat (shown as the "+N" chip). */
  boosterDeltas?: Record<BaseStat, number>;
  /** +1 of the selected manager per stat (shown as the lime "+1" chip). */
  managerDeltas?: Record<BaseStat, number>;
  /** Categories the grid highlights while no row popover is open. */
  highlight: ActiveCategories;
  /** The Adjust popover's content of a stat (`headingId` names it); omitted
   *  when the build cannot spend points — the rows are plain then. */
  renderAdjust?: (stat: BaseStat, headingId: string) => ReactNode;
  /** Reports the open row popover's categories (the page combines them with
   *  the strip's). */
  onAdjust?: AdjustReport;
}

interface SectionProps extends GridProps {
  title: string;
  statKeys: readonly BaseStat[];
  openStat: BaseStat | null;
  setOpen: (stat: BaseStat, open: boolean) => void;
  idBase: string;
}

/** The right end of a row: the booster / manager chips, then the value pill. */
function RowContent({ stat, val, boost, mgr, boosterDeltas, managerDeltas }: { stat: BaseStat; val: number; boost: number; mgr: number } & Pick<GridProps, "boosterDeltas" | "managerDeltas">) {
  return (
    <>
      <span className={`efb-stat-row__label ${statTierClass(val)}`} data-testid="stat-name">
        {statLabel(stat)}
      </span>
      <span className="efb-stat-row__end">
        {(boost !== 0 || mgr !== 0) && (
          <span className="efb-stat-row__chips">
            <DeltaChip delta={boosterDeltas?.[stat]} />
            <DeltaChip delta={managerDeltas?.[stat]} kind="manager" />
          </span>
        )}
        <span className={`efb-stat-row__value ${statTierBg(val)} ${statTierForeground(val)}`}>{val}</span>
      </span>
    </>
  );
}

function StatSection({ title, statKeys, values, boosterDeltas, managerDeltas, highlight, renderAdjust, openStat, setOpen, idBase }: SectionProps) {
  // While a row's popover is open its categories are highlighted.
  const active: ActiveCategories = openStat && renderAdjust ? STAT_CATEGORIES[openStat] : highlight;
  return (
    <div className="min-w-0">
      <h3 className="efb-group-head">{title}</h3>
      {/* flex + gap, not space-y: each row is followed by its (hidden) popover. */}
      <div className="flex flex-col gap-1">
        {statKeys.map((st) => {
          const val = values[st];
          const cats = STAT_CATEGORIES[st];
          const catNames = cats.map((c) => PROGRESSION_CATEGORY_LABELS[c]);
          const hit = active !== null && cats.some((c) => active.includes(c));
          const dim = active !== null && !hit;
          const boost = boosterDeltas?.[st] ?? 0;
          const mgr = managerDeltas?.[st] ?? 0;
          const content = <RowContent stat={st} val={val} boost={boost} mgr={mgr} boosterDeltas={boosterDeltas} managerDeltas={managerDeltas} />;
          if (!renderAdjust) {
            // Plain row: no role, nothing to open (the build cannot spend points).
            return (
              <div key={st} className="efb-stat-row" data-stat={st} data-category={cats.join(" ")} data-hit={hit ? "true" : undefined} data-dim={dim ? "true" : undefined}>
                {content}
              </div>
            );
          }
          const headingId = `${idBase}-${st}-adjust`;
          return (
            <Popover
              key={st}
              open={openStat === st}
              onOpenChange={(o) => setOpen(st, o)}
              labelledBy={headingId}
              sheetBelow={ADJUST_SHEET_BELOW}
              className="efb-adjust-popover"
              data-testid="stat-adjust"
              trigger={(tp) => (
                <button
                  {...tp}
                  type="button"
                  className="efb-stat-row hit-44 cursor-pointer motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                  data-stat={st}
                  data-category={cats.join(" ")}
                  data-hit={hit ? "true" : undefined}
                  data-dim={dim ? "true" : undefined}
                  // No aria-pressed: the row is a popup trigger (aria-haspopup
                  // / aria-expanded from the Popover), not a toggle. The
                  // highlight is `data-hit` / `data-dim` (accent ring, dimmed
                  // others); screen readers get the categories from the
                  // row's name and the open popover's heading. Named by its
                  // content (WCAG 2.5.3 Label in Name — change
                  // a11y-names-and-card-league): the hidden action, then the
                  // visible stat name, chips and value — "Adjust Dexterity:
                  // Offensive Awareness +4 booster 89".
                >
                  <span className="sr-only">Adjust {catNames.join(" and ")}:</span>
                  {content}
                </button>
              )}
            >
              {renderAdjust(st, headingId)}
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

/** Three groups side by side from `lg`, two columns below (Attacking and
 *  Defending, then Strength — DOM order, so the Tab order follows the eye),
 *  one column under 360 px where two would leave a name ~55 px of room. At
 *  most one Adjust popover is open; it owns the highlight while open. */
export function StatGrid(props: GridProps) {
  const idBase = useId().replace(/:/g, "");
  const [openStat, setOpenStat] = useState<BaseStat | null>(null);
  const { onAdjust } = props;
  // A closing row clears the state only while it still owns it: opening
  // another row light-dismisses this one after the new one opened.
  const setOpen = (stat: BaseStat, open: boolean) => {
    setOpenStat((cur) => (open ? stat : cur === stat ? null : cur));
    onAdjust?.(`row:${stat}`, open ? STAT_CATEGORIES[stat] : null);
  };
  const section = { ...props, openStat: props.renderAdjust ? openStat : null, setOpen, idBase };
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-4 min-[360px]:grid-cols-2 lg:grid-cols-3 lg:gap-6" data-testid="stat-grid">
      <StatSection title="Attacking" statKeys={ATTACKING_STATS} {...section} />
      <StatSection title="Defending" statKeys={DEFENDING_STATS} {...section} />
      <StatSection title="Strength" statKeys={STRENGTH_STATS} {...section} />
    </div>
  );
}

/** Icon of each training category on the category strip (Lucide; the three
 *  goalkeeper categories share the glove icon and carry their number). */
export const CATEGORY_ICON: Readonly<Record<TrainingCategory, LucideIcon>> = {
  Shooting: Crosshair,
  Passing: Send,
  Dribbling: Volleyball,
  Dexterity: Zap,
  LowerBody: Footprints,
  Aerial: ChevronsUp,
  Defending: Shield,
  GK1: Hand,
  GK2: Hand,
  GK3: Hand,
};
export const CATEGORY_SUFFIX: Partial<Record<TrainingCategory, string>> = { GK1: "1", GK2: "2", GK3: "3" };

/** Width of a strip item's Adjust popover (the reference's 240 px). */
const STRIP_POPOVER_CLASS = "efb-adjust-popover efb-adjust-popover--strip";

/** Category strip: the stat points the current build spends in each of the
 *  ten training categories, as icon + number in one dark bar. Hovering an
 *  item with a mouse, or focusing it from the keyboard, previews the stats
 *  its category raises (`preview`); activating it (click, Enter, Space, tap)
 *  opens that category's Adjust popover (D6: 240 px, the category name, −,
 *  value, + and the 0–25 slider) with its stats highlighted — the same item
 *  again closes it, Escape closes it and returns focus to the item, a click
 *  outside closes it and clears its highlight. The pin lives on the
 *  Progression panel's category labels only. */
export function CategoryRow({
  allocation,
  active,
  preview,
  renderAdjust,
  onAdjust,
}: {
  allocation: TrainingAllocation;
  /** The categories lit in the grid (an item among them is drawn lit). */
  active: ActiveCategories;
  /** Hover / focus preview handlers (useCategoryPreview). */
  preview?: CategoryPreviewBind;
  /** The Adjust popover's content of a category (`headingId` names it). */
  renderAdjust: (cat: TrainingCategory, headingId: string) => ReactNode;
  onAdjust: AdjustReport;
}) {
  const idBase = useId().replace(/:/g, "");
  const [openCat, setOpenCat] = useState<TrainingCategory | null>(null);
  const setOpen = (cat: TrainingCategory, open: boolean) => {
    setOpenCat((cur) => (open ? cat : cur === cat ? null : cur));
    onAdjust(`strip:${cat}`, open ? [cat] : null);
  };
  return (
    <div className="efb-category-strip" role="group" aria-label="Training categories of the current build" data-testid="category-row">
      {TRAINING_CATEGORIES.map((cat) => {
        const v = allocation[cat];
        const lit = active !== null && active.includes(cat);
        const label = PROGRESSION_CATEGORY_LABELS[cat];
        const Icon = CATEGORY_ICON[cat];
        const suffix = CATEGORY_SUFFIX[cat];
        const headingId = `${idBase}-${cat}-adjust`;
        return (
          <Popover
            key={cat}
            open={openCat === cat}
            onOpenChange={(o) => setOpen(cat, o)}
            labelledBy={headingId}
            sheetBelow={ADJUST_SHEET_BELOW}
            className={STRIP_POPOVER_CLASS}
            data-testid="category-adjust"
            trigger={(tp) => (
              <button
                {...tp}
                {...preview?.(cat)}
                type="button"
                aria-label={`Adjust ${label}: ${v}`}
                data-testid={`category-chip-${cat}`}
                data-spent={v > 0 ? "true" : undefined}
                data-lit={lit ? "true" : undefined}
                className="efb-category-strip__item hit-44 motion-reduce:transition-none"
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {/* The spaces (not rendered in the flex row) keep the
                    goalkeeper number and the value apart in the visible text
                    ("1 0", contained in "Adjust Goalkeeper 1: 0" — Label in
                    Name), never "10". */}
                {suffix && (
                  <>
                    <span className="efb-category-strip__sub" aria-hidden>
                      {suffix}
                    </span>{" "}
                  </>
                )}
                <span aria-hidden>{v}</span>
              </button>
            )}
          >
            {renderAdjust(cat, headingId)}
          </Popover>
        );
      })}
    </div>
  );
}

/** Key stats under the playing-style cards. */
export function KeyStats({
  statKeys,
  values,
  boosterDeltas,
}: {
  statKeys: readonly BaseStat[];
  values: Record<BaseStat, number>;
  boosterDeltas?: Record<BaseStat, number>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-1.5 pt-1">
      {statKeys.map((st) => {
        const v = values[st];
        return (
          <div key={st} className="min-w-0 rounded-lg bg-[var(--color-default)] px-2.5 py-1.5">
            <dt className="text-xs leading-4 text-[var(--color-text-secondary)] [hyphens:auto] break-words" data-testid="stat-name">{statLabel(st)}</dt>
            <dd className={`mt-0.5 flex items-center gap-1.5 text-sm font-bold tabular-nums ${statTierClass(v)}`}>
              {v}
              <DeltaChip delta={boosterDeltas?.[st]} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
