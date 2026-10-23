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
// Activating a row (click, Enter, Space, tap) opens its Adjust popover
// (efootbase-behaviour-parity; the reference's stat rows are popover
// triggers named "Adjust Dexterity — Offensive Awareness"): a non-modal
// dialog titled with the row's training category ("Dexterity"; Jumping:
// "Aerial Strength & Goalkeeper 1") holding the category steppers the caller
// renders (`renderAdjust`, the Progression panel's own CategoryStepper — one
// state) and the value's breakdown into base, training, the cut at 99,
// Manager Proficiency, booster and manager parts. A card without Progression
// (level cap 1) gets the breakdown only, titled with the stat: its Max value
// as base + Booster 1, never a reference to a Build view it does not have
// (QA 2026-10-23 U1). While a
// popover is open the stats of its categories are highlighted; otherwise the
// highlight follows the category strip / the panel's category labels (the
// caller passes the hovered / focused category's preview, else the pinned
// one — useCategoryPreview).
// Below 640 px a popover taller than half the viewport (e.g. Jumping's two
// steppers on a 568 px tall phone) is shown as a bottom sheet — the same
// popover element, state and focus handling (Popover `sheetBelow`).

/** Viewport width below which a tall Adjust popover becomes a bottom sheet. */
const ADJUST_SHEET_BELOW = 640;

/** Stat → the training categories that raise it, in TRAINING_CATEGORIES
 *  order. Every stat is in at least one; Jump is in two (Aerial Strength and
 *  Goalkeeper 1 — each lifts it, see TRAINING_STATS). */
export const STAT_CATEGORIES: Readonly<Record<BaseStat, readonly TrainingCategory[]>> = (() => {
  const m = {} as Record<BaseStat, TrainingCategory[]>;
  for (const cat of TRAINING_CATEGORIES) for (const s of TRAINING_STATS[cat]) (m[s] ??= []).push(cat);
  return m;
})();

export type StatHighlight = TrainingCategory | null;

/** Handlers a category control (strip counter, Progression panel label)
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
 *  count), previews that category; leaving / blurring returns to the pinned
 *  highlight, which only click / Enter / Space toggles (and which alone
 *  drives `aria-pressed`). Touch never previews: `pointerenter` is gated on
 *  `pointerType === "mouse"` (a tap's emulated mouseenter is never followed
 *  by a mouseleave, so mouse events would leave a stuck preview). Hover wins
 *  over focus; a handler clears only the preview it still owns. */
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

/** What the grid's values are: the Progression build's projection (with its
 *  parts), the dump's max-level values, or the level-1 values. */
export type StatSource = "build" | "max" | "base";

interface GridProps {
  values: Record<BaseStat, number>;
  /** Booster bump per stat (shown as the "+N" chip). */
  boosterDeltas?: Record<BaseStat, number>;
  /** Training lift per stat (breakdown only — it is already inside the value). */
  trainingDeltas?: Record<BaseStat, number>;
  /** Cut to 99 per stat, 0 or negative (breakdown only — inside the value). */
  capDeltas?: Record<BaseStat, number>;
  /** Manager Proficiency bonus per stat (breakdown only — inside the value too). */
  proficiencyDeltas?: Record<BaseStat, number>;
  /** +1 of the selected manager per stat (shown as the lime "+1" chip). */
  managerDeltas?: Record<BaseStat, number>;
  source: StatSource;
  highlight: StatHighlight;
  /** The steppers of a stat's categories for its Adjust popover; omitted for
   *  a card without Progression (the popover then holds the breakdown only). */
  renderAdjust?: (stat: BaseStat) => ReactNode;
  /** Level-1 values of a card without Progression (level cap 1): the Max
   *  view's breakdown splits a value into this base and Booster 1. */
  baseValues?: Record<BaseStat, number>;
}

interface SectionProps extends GridProps {
  title: string;
  statKeys: readonly BaseStat[];
  openStat: BaseStat | null;
  setOpen: (stat: BaseStat, open: boolean) => void;
  idBase: string;
}

const signed = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

/** The value's parts, one line each (no line for a part that is 0). `cap1Base`
 *  is the level-1 value of a card whose max level is 1 (no Build view): its
 *  Max value splits into that base and Booster 1. */
function Breakdown({
  stat,
  value,
  source,
  lift,
  cut,
  bonus,
  boost,
  mgr,
  cap1Base,
}: {
  stat: BaseStat;
  value: number;
  source: StatSource;
  lift: number;
  cut: number;
  bonus: number;
  boost: number;
  mgr: number;
  cap1Base?: number;
}) {
  const cats = STAT_CATEGORIES[stat].map((c) => PROGRESSION_CATEGORY_LABELS[c]).join(" / ");
  const cap1Max = source === "max" && cap1Base !== undefined;
  const rows: Array<[string, string]> =
    source === "build"
      ? [
          ["Base", String(value - lift - cut - bonus - boost - mgr)],
          ...(lift ? [[`${cats} training`, signed(lift)] as [string, string]] : []),
          ...(cut ? [["Cut at 99 (training above 99 is not counted)", signed(cut)] as [string, string]] : []),
          ...(bonus ? [["Manager Proficiency", signed(bonus)] as [string, string]] : []),
          ...(boost ? [["Boosters", signed(boost)] as [string, string]] : []),
          ...(mgr ? [["Manager", signed(mgr)] as [string, string]] : []),
        ]
      : cap1Max
        ? [["Base", String(cap1Base)], ...(value !== cap1Base ? [["Booster 1", signed(value - cap1Base)] as [string, string]] : [])]
        : [];
  const total =
    source === "build"
      ? statLabel(stat)
      : cap1Max
        ? `${statLabel(stat)} at max level 1`
        : source === "max"
          ? `${statLabel(stat)} at max level (dump)`
          : `${statLabel(stat)} at level 1`;
  // Level-cap-1 cards have no Build view, so their notes never point to one;
  // on them the dump's max-level value is the base plus Booster 1 (true for
  // every level-cap-1 card of the dump: no training, no Booster 2 bump).
  const note =
    source === "build"
      ? null
      : cap1Max
        ? "Max level is 1 for this card: no training, so the value is the base plus Booster 1."
        : source === "max"
          ? "The dump's own max-level value; the Build view splits a value into its parts."
          : cap1Base !== undefined
            ? "The card's level-1 value, without its booster."
            : "The card's level-1 value.";
  return (
    <div className="efb-adjust__breakdown" data-testid="stat-breakdown">
      <dl className="efb-adjust__parts">
        {rows.map(([label, v]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="contents efb-adjust__total">
          <dt>{total}</dt>
          <dd>{value}</dd>
        </div>
      </dl>
      {note && <p className="efb-adjust__note">{note}</p>}
    </div>
  );
}

function StatSection({
  title,
  statKeys,
  values,
  boosterDeltas,
  trainingDeltas,
  capDeltas,
  proficiencyDeltas,
  managerDeltas,
  source,
  highlight,
  renderAdjust,
  baseValues,
  openStat,
  setOpen,
  idBase,
}: SectionProps) {
  // While a row's popover is open its categories are highlighted.
  const active: readonly TrainingCategory[] | null = openStat ? STAT_CATEGORIES[openStat] : highlight ? [highlight] : null;
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
          const lift = trainingDeltas?.[st] ?? 0;
          const cut = capDeltas?.[st] ?? 0;
          const bonus = proficiencyDeltas?.[st] ?? 0;
          const boost = boosterDeltas?.[st] ?? 0;
          const mgr = managerDeltas?.[st] ?? 0;
          const headingId = `${idBase}-${st}-adjust`;
          const heading = renderAdjust ? catNames.join(" & ") : statLabel(st);
          const name = renderAdjust ? `Adjust ${catNames.join(" and ")} — ${statLabel(st)} ${val}` : `${statLabel(st)} ${val} — show its breakdown`;
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
                  // row's name and the open popover's heading.
                  aria-label={name}
                >
                  <span className={`efb-stat-row__label ${statTierClass(val)}`} data-testid="stat-name">
                    {statLabel(st)}
                  </span>
                  <span className="efb-stat-row__end">
                    {(boost !== 0 || mgr !== 0) && (
                      <span className="efb-stat-row__chips">
                        <DeltaChip delta={boosterDeltas?.[st]} />
                        <DeltaChip delta={managerDeltas?.[st]} kind="manager" />
                      </span>
                    )}
                    <span className={`efb-stat-row__value ${statTierBg(val)} ${statTierForeground(val)}`}>{val}</span>
                  </span>
                </button>
              )}
            >
              <div className="efb-adjust">
                <h3 id={headingId} className="efb-adjust__title">
                  {heading}
                </h3>
                {renderAdjust?.(st)}
                <Breakdown
                  stat={st}
                  value={val}
                  source={source}
                  lift={lift}
                  cut={cut}
                  bonus={bonus}
                  boost={boost}
                  mgr={mgr}
                  cap1Base={renderAdjust ? undefined : baseValues?.[st]}
                />
              </div>
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
  // A closing row clears the state only while it still owns it: opening
  // another row light-dismisses this one after the new one opened.
  const setOpen = (stat: BaseStat, open: boolean) => setOpenStat((cur) => (open ? stat : cur === stat ? null : cur));
  const section = { ...props, openStat, setOpen, idBase };
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

/** Category strip: the stat points the current build spends in each of the
 *  ten training categories, as icon + number in one dark bar. Hovering a
 *  counter with a mouse, or focusing it from the keyboard, previews the
 *  stats its category raises (`preview`); each counter is also a toggle
 *  (aria-pressed = the pinned highlight only, named by the category) that
 *  pins / unpins that highlight. It is a readout — the steppers in the
 *  Progression panel change the values. */
export function CategoryRow({
  allocation,
  highlight,
  onHighlight,
  preview,
}: {
  allocation: TrainingAllocation;
  /** The pinned category (click / Enter / Space). */
  highlight: StatHighlight;
  onHighlight: (next: StatHighlight) => void;
  /** Hover / focus preview handlers (useCategoryPreview). */
  preview?: CategoryPreviewBind;
}) {
  return (
    <div className="efb-category-strip" role="group" aria-label="Training categories of the current build" data-testid="category-row">
      {TRAINING_CATEGORIES.map((cat) => {
        const v = allocation[cat];
        const hit = highlight === cat;
        const label = PROGRESSION_CATEGORY_LABELS[cat];
        const Icon = CATEGORY_ICON[cat];
        const suffix = CATEGORY_SUFFIX[cat];
        return (
          <button
            key={cat}
            type="button"
            aria-pressed={hit}
            aria-label={`${label}: ${v}`}
            data-testid={`category-chip-${cat}`}
            data-spent={v > 0 ? "true" : undefined}
            {...preview?.(cat)}
            onClick={() => onHighlight(hit ? null : cat)}
            className="efb-category-strip__item hit-44 motion-reduce:transition-none"
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {suffix && <span className="efb-category-strip__sub" aria-hidden>{suffix}</span>}
            <span aria-hidden>{v}</span>
          </button>
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
