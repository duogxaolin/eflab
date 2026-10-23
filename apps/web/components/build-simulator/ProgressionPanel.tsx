"use client";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  MANAGER_PROFICIENCY_DEFAULT,
  MANAGER_PROFICIENCY_MAX,
  MANAGER_PROFICIENCY_MIN,
  POSITIONS,
  PROFICIENCY_BANDS,
  PROFICIENCY_LABELS,
  PROGRESSION_CATEGORY_LABELS,
  TRAINING_CATEGORIES,
  TRAINING_STATS,
  allocationCost,
  bestAllocation,
  categoryCost,
  clampManagerProficiency,
  emptyAllocation,
  maxGainForBudget,
  nextStatPointCost,
  positionFromIndex,
  proficiencyFromAptitude,
  toDisplayPoints,
  trainingPointsAvailable,
  type BaseStat,
  type BuildResult,
  type PickerManagerDTO,
  type PlayerCardDTO,
  type Position,
  type TrainingAllocation,
  type TrainingCategory,
} from "@eflab/shared";
import { boosterLabel, statLabel } from "@/lib/card-display";
import { DeferredManagerPicker, prefetchManagerPicker } from "@/components/build-simulator/deferred";
import { CATEGORY_ICON, CATEGORY_SUFFIX, type CategoryPreviewBind } from "@/components/detail/StatGrid";
import { PopoverPanel } from "@/components/ui/Popover";
// Type only: the static copy itself comes from the server page (`notes`).
import type { BuildNotes } from "@/components/build-simulator/build-notes";
import { ChevronDown, Minus, Plus, RotateCcw, SlidersHorizontal, UserRound, UserRoundCog } from "lucide-react";

// Progression controls of the player detail page (player-progression-simulator;
// exact model since efootbase-exact-model-managers; layout of change
// efootbase-ui-redesign, measured on the reference capture of 2026-10-20;
// split in efootbase-behaviour-parity). The parent (PlayerDetailClient) owns
// the state — it feeds the projected stats into the stat grid, the card face
// and the Pitch Map — and runs the shared engine; this file renders the
// controls:
//   ProgressionPanel  the card: header (title, "used/total pts", Max OVR,
//                     reset icon), "Select Manager", Manager Proficiency
//                     (70–90), ten 42 px category rows (label button, next
//                     cost, − n +, 16 px track). Pinned at 64 px in the left
//                     column from lg (it fits a 900 px viewport); below lg
//                     the same component runs inside the bottom sheet
//                     (`embedded`, which also holds the Build settings).
//   BuildSettings     the non-sticky card at the end of the left column, below
//                     the pinned card's travel: Max Level + Position, the
//                     overall at the position, and the explanatory notes
//                     behind "About this build".
//   CategoryStepper   − value + of one category — the panel rows and the
//                     stat-row Adjust popover share it (withCategory holds the
//                     arithmetic once).
//   ProficiencyControl  the Manager Proficiency row (label, value, slider;
//                     with 36 px − / + buttons in the dock popover).
//   ManagerTrigger    the 48 px "Select Manager" pill (panel and dock popover).
//   ProgressionDock   below lg: a floating category strip and a 366 × 50 dock
//                     above the tab bar (proficiency, manager, points + reset,
//                     Max OVR, Progression): the proficiency chip and the
//                     avatar open a small non-modal popover (manager +
//                     proficiency), the rest open the sheet.
// Booster toggles live in the Overview card (same `boosters` state).
// Points are printed in the displayed whole-point unit (toDisplayPoints:
// twice the engine's training points). Rules: packages/shared/src/progression.ts.

/** Readings the formula was checked against (change
 *  efootbase-exact-model-managers, docs/efootbase-exact-model.md): every
 *  overall displayed in the survey of five cards. */
export const EXACT_MODEL_READINGS = 793;

export interface ProgressionState {
  maxLevel: number;
  position: Position;
  trainingPoints: TrainingAllocation;
  boosters: [boolean, boolean];
  /** Manager Proficiency level 70–90 (default 90; the selected manager's
   *  rating while a manager is selected). */
  managerProficiency: number;
  /** The selected manager (its pills get +1 after the boosters), or null. */
  manager: PickerManagerDTO | null;
}

/** A change of the build; `notice` is the Max Level reset notice that the
 *  panel shows and announces (any other change clears it). */
export type ProgressionChange = (next: ProgressionState, notice?: string | null) => void;

type BoosterSlotInfo = { label: string; deltas: Array<[BaseStat, number]>; usable: boolean };
type BoosterPlayer = Pick<PlayerCardDTO, "boosterId1" | "boosterId2" | "booster1" | "booster2">;
type DefaultsPlayer = Pick<PlayerCardDTO, "levelCap" | "registeredPosition"> & BoosterPlayer;

/** Booster slot: readable label ("+5 · Dribbling, Tight Possession, Speed,
 *  Balance", `boosterLabel`) + sparse deltas, or the reason it is unusable.
 *  A booster whose stat vector is empty (e.g. the seeded "Booster +1" rows
 *  with no stat data) is as unusable as an unknown id: there is nothing to
 *  toggle, so it never gets an ON/OFF control. */
export function boosterSummary(player: BoosterPlayer, slot: 0 | 1): BoosterSlotInfo {
  const id = slot === 0 ? player.boosterId1 : player.boosterId2;
  const b = slot === 0 ? player.booster1 : player.booster2;
  if (b) {
    const deltas = (Object.entries(b.stats) as Array<[BaseStat, number]>).filter(([, v]) => typeof v === "number" && v !== 0);
    if (deltas.length === 0) return { label: `${b.name} (no stat data)`, deltas: [], usable: false };
    return { label: boosterLabel(b.name, deltas), deltas, usable: true };
  }
  if (id != null && id > 0) return { label: `unknown booster #${id}`, deltas: [], usable: false };
  return { label: "none", deltas: [], usable: false };
}

/** Opening state of a card: the card's level cap, its registered position,
 *  the Max-OVR allocation for that budget, every usable booster on (a slot
 *  without stat data stays off — there is nothing to apply), Manager
 *  Proficiency 90 and no manager. */
export function defaultProgressionState(player: DefaultsPlayer): ProgressionState {
  const levelCap = Math.max(1, player.levelCap);
  const position = positionFromIndex(player.registeredPosition);
  return {
    maxLevel: levelCap,
    position,
    trainingPoints: bestAllocation(position, trainingPointsAvailable(levelCap)),
    boosters: [boosterSummary(player, 0).usable, boosterSummary(player, 1).usable],
    managerProficiency: MANAGER_PROFICIENCY_DEFAULT,
    manager: null,
  };
}

/** True once the state differs from the opening state (level, position,
 *  Manager Proficiency, a selected manager, any category, or a usable booster
 *  toggled off). */
export function isCustomBuild(state: ProgressionState, defaults: ProgressionState, player: BoosterPlayer): boolean {
  return (
    state.maxLevel !== defaults.maxLevel ||
    state.position !== defaults.position ||
    state.managerProficiency !== defaults.managerProficiency ||
    (state.manager?.id ?? null) !== (defaults.manager?.id ?? null) ||
    ([0, 1] as const).some((slot) => boosterSummary(player, slot).usable && state.boosters[slot] !== defaults.boosters[slot]) ||
    TRAINING_CATEGORIES.some((c) => state.trainingPoints[c] !== defaults.trainingPoints[c])
  );
}

/** Max OVR: the optimal allocation for the committed level at the selected
 *  position; the proficiency, the boosters and the manager stay. The one
 *  implementation behind the panel's and the dock's Max OVR buttons. */
export function withMaxOvr(state: ProgressionState): ProgressionState {
  return { ...state, trainingPoints: bestAllocation(state.position, trainingPointsAvailable(state.maxLevel)) };
}

/** Reset: every category to zero; the proficiency, the boosters and the
 *  manager stay. Shared by the panel and the dock. */
export function withReset(state: ProgressionState): ProgressionState {
  return { ...state, trainingPoints: emptyAllocation() };
}

/** Most stat points `cat` can hold with what the other categories leave of the budget. */
export function categoryMax(state: ProgressionState, cat: TrainingCategory): number {
  const others = allocationCost({ ...state.trainingPoints, [cat]: 0 });
  return maxGainForBudget(trainingPointsAvailable(state.maxLevel) - others);
}

/** Points left of the budget (engine half-point unit). */
export function pointsLeft(state: ProgressionState): number {
  return trainingPointsAvailable(state.maxLevel) - allocationCost(state.trainingPoints);
}

/** One category set to `value`: never below 0, an increase clamped to what
 *  the budget still affords. Null when nothing changes. The one
 *  implementation behind the panel rows, their keyboard, their tracks and the
 *  stat-row Adjust popover. */
export function withCategory(state: ProgressionState, cat: TrainingCategory, value: number): ProgressionState | null {
  const cur = state.trainingPoints[cat];
  const wanted = Math.max(0, Math.floor(value));
  const next = Math.min(wanted, Math.max(cur, categoryMax(state, cat)));
  if (next === cur) return null;
  return { ...state, trainingPoints: { ...state.trainingPoints, [cat]: next } };
}

/** Manager Proficiency moved to `value` (70–90): a new value deselects the
 *  manager. Null when nothing changes. */
export function withManagerProficiency(state: ProgressionState, value: number): ProgressionState | null {
  const managerProficiency = clampManagerProficiency(value);
  if (managerProficiency === state.managerProficiency) return null;
  return { ...state, managerProficiency, manager: null };
}

/** A manager chosen in the picker: it sets the level to its rating; choosing
 *  the selected one again deselects it and leaves the level where it is. The
 *  one implementation behind the panel's and the phone dock's picker. */
export function withManagerChoice(state: ProgressionState, m: PickerManagerDTO): ProgressionState {
  if (state.manager?.id === m.id) return { ...state, manager: null };
  return { ...state, manager: m, managerProficiency: clampManagerProficiency(m.rating) };
}

/** Points in the displayed (whole-point) unit. */
const pts = (v: number): string => String(toDisplayPoints(v));
export const displayPoints = pts;

const pillText = (m: PickerManagerDTO): string => m.pills.map((p) => `+1 ${statLabel(p)}`).join(", ");

/** "N pts spent, next costs M" of a category. */
export const categoryCostText = (v: number): string => `${pts(categoryCost(v))} pts spent, next costs ${pts(nextStatPointCost(v))}`;

/** The label next to the overall (spec "Honest Estimate Label"): the setting
 *  in effect (proficiency level, or the selected manager) and what the figure
 *  is. Neutral wording (efootbase-ui-redesign, "Branding In Public UI"); the
 *  provenance lives in docs/efootbase-exact-model.md. */
export function overallLabel(level: number, manager: PickerManagerDTO | null): string {
  const setting = manager
    ? `Manager ${manager.name} (rating ${manager.rating}: proficiency ${level}, ${pillText(manager)} after the boosters)`
    : `Manager Proficiency ${level}, no manager selected`;
  return `${setting}. Computed with the game's overall formula as measured, which reproduced all ${EXACT_MODEL_READINGS} overall readings taken on five cards.`;
}

/** What the Manager Proficiency control does at `level`. */
export function proficiencyNote(level: number): string {
  const bands = PROFICIENCY_BANDS[level] ?? [];
  if (bands.length === 0) return `At ${level} no stat gains a proficiency bonus (levels ${MANAGER_PROFICIENCY_MIN}–76).`;
  const top = Math.max(...bands.map((b) => b.bonus));
  return `At ${level} a stat of ${bands[0]!.min} or more gains 1 to ${top} after training, by the level's band table, never past 99; boosters and a manager's +1 come after it.`;
}

/** Track fill of a range input as a CSS variable (0..1 of its min..max), read
 *  by `.efb-range` (the fill ends at the thumb's far edge). */
const rangeStyle = (value: number, min: number, max: number): CSSProperties =>
  ({ "--range-p": max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0 }) as CSSProperties;

/** Ids shared by the panel and the Build settings card (one `useId` in the
 *  parent): the proficiency slider is described by the note that lives in
 *  "About this build". */
export const progressionIds = (base: string) => ({
  title: `${base}-title`,
  mp: `${base}-mp`,
  mpNote: `${base}-mp-note`,
  level: `${base}-level`,
  levelHint: `${base}-level-hint`,
  position: `${base}-position`,
  settingsTitle: `${base}-settings-title`,
  /** The ten category rows (the phone sheet opens scrolled to them). */
  cats: `${base}-cats`,
  catLabel: (cat: TrainingCategory) => `${base}-cat-${cat}-label`,
  /** Screen-reader description of a category label: its stats. */
  catStats: (cat: TrainingCategory) => `${base}-cat-${cat}-stats`,
});

/** "Finishing, Place Kicking, Curl": the stats a category's stat point raises
 *  (the label's description and the "About this build" list). */
const categoryStatsText = (cat: TrainingCategory): string => TRAINING_STATS[cat].map((s) => statLabel(s)).join(", ");

/**
 * − value + of one training category: 18 × 18 icon buttons (44 × 44 on touch)
 * around a `role="spinbutton"` value (Arrow / Page / Home / End keys; named by
 * `labelledBy`; value text "N stat points, X pts spent, next costs Y"). "+" is
 * disabled when the next stat point costs more than what is left. A button
 * that becomes disabled while focused hands focus to the value.
 * In the panel's ten rows the buttons are not tab stops (the spinbutton is the
 * row's one stop); `tabbable` (the stat-row Adjust popover, a handful of
 * controls) makes − value + three stops in that order (QA 2026-10-23 bug 6:
 * the popover used to open on a "+" that was not a tab stop, and one Tab left
 * it). `autoFocus` marks the value as the control a popover focuses on
 * opening — the middle of the sequence, with the category's name and the
 * arrow keys; Tab reaches "+", Shift+Tab "−".
 */
export function CategoryStepper({
  cat,
  state,
  onChange,
  labelledBy,
  autoFocus = false,
  tabbable = false,
}: {
  cat: TrainingCategory;
  state: ProgressionState;
  onChange: ProgressionChange;
  labelledBy: string;
  autoFocus?: boolean;
  tabbable?: boolean;
}) {
  const v = state.trainingPoints[cat];
  const next = nextStatPointCost(v);
  const max = categoryMax(state, cat);
  const canInc = next <= pointsLeft(state) + 1e-9;
  const costText = categoryCostText(v);
  const label = PROGRESSION_CATEGORY_LABELS[cat];
  const valueRef = useRef<HTMLDivElement>(null);
  // Which button had focus when it was last focused (cleared when focus moves
  // to another element; a button disabled under the focus loses it to the body).
  const focusedButton = useRef<"dec" | "inc" | null>(null);
  useEffect(() => {
    const lost = focusedButton.current;
    if ((lost === "inc" && !canInc) || (lost === "dec" && v === 0)) {
      const active = document.activeElement;
      if (active === null || active === document.body || (active instanceof HTMLButtonElement && active.disabled)) valueRef.current?.focus();
      focusedButton.current = null;
    }
  }, [canInc, v]);
  const set = (value: number) => {
    const s = withCategory(state, cat, value);
    if (s) onChange(s);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let target: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "+") target = v + 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "-") target = v - 1;
    else if (e.key === "PageUp") target = v + 4;
    else if (e.key === "PageDown") target = v - 4;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = max;
    if (target === null) return;
    e.preventDefault();
    set(Math.min(Math.max(0, target), max));
  };
  const track = (which: "dec" | "inc") => ({
    onFocus: () => {
      focusedButton.current = which;
    },
    onBlur: (e: FocusEvent) => {
      if (e.relatedTarget) focusedButton.current = null;
    },
  });
  return (
    <div className="efb-stepper">
      <button
        type="button"
        tabIndex={tabbable ? undefined : -1}
        aria-label={`Decrease ${label}`}
        disabled={v === 0}
        onClick={() => set(v - 1)}
        className="efb-stepper__button hit-44"
        {...track("dec")}
      >
        <Minus className="size-3.5" aria-hidden />
      </button>
      <div
        ref={valueRef}
        role="spinbutton"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={`${v} stat points, ${costText}`}
        onKeyDown={onKey}
        className="efb-stepper__value"
        data-autofocus={autoFocus ? "" : undefined}
      >
        {v}
      </div>
      <button
        type="button"
        tabIndex={tabbable ? undefined : -1}
        aria-label={`Increase ${label}`}
        disabled={!canInc}
        onClick={() => set(v + 1)}
        className="efb-stepper__button hit-44"
        {...track("inc")}
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** The steppers of a stat row's Adjust popover (StatGrid `renderAdjust`):
 *  one row per category that raises the stat (two for Jumping: Aerial
 *  Strength and Goalkeeper 1) with the label, the next stat point's cost and
 *  the shared CategoryStepper (− value + as tab stops), then the points left.
 *  The first stepper's value takes the popover's focus. A polite status
 *  announces each change made here (the panel's own live region is absent
 *  below lg). */
export function CategoryAdjust({
  cats,
  state,
  result,
  onChange,
  idBase,
}: {
  cats: readonly TrainingCategory[];
  state: ProgressionState;
  result: BuildResult;
  onChange: ProgressionChange;
  idBase: string;
}) {
  const budget = trainingPointsAvailable(state.maxLevel);
  const opened = useRef(state);
  const changed = state !== opened.current;
  return (
    <div className="efb-adjust__cats">
      {cats.map((cat, i) => {
        const v = state.trainingPoints[cat];
        const labelId = `${idBase}-${cat}-label`;
        return (
          <div key={cat} className="efb-adjust__cat" data-active={v > 0 ? "true" : undefined} data-testid={`adjust-cat-${cat}`}>
            <span id={labelId} className="efb-adjust__cat-label">
              {PROGRESSION_CATEGORY_LABELS[cat]}
            </span>
            <span className="efb-progression-row__next" aria-hidden>
              next {pts(nextStatPointCost(v))}
            </span>
            <CategoryStepper cat={cat} state={state} onChange={onChange} labelledBy={labelId} autoFocus={i === 0} tabbable />
          </div>
        );
      })}
      <p className="efb-adjust__left" data-testid="adjust-points-left">
        <span className="text-white">{pts(pointsLeft(state))} pts left</span> · {pts(allocationCost(state.trainingPoints))}/{pts(budget)} used
      </p>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {changed
          ? `${cats.map((c) => `${PROGRESSION_CATEGORY_LABELS[c]} ${state.trainingPoints[c]}`).join(", ")} · ${pts(pointsLeft(state))} pts left · ${result.overall} at ${state.position}`
          : ""}
      </p>
    </div>
  );
}

type ProficiencyTestIds = { root: string; value: string; slider: string; decrease: string; increase: string };
const PANEL_PROFICIENCY_TESTIDS: ProficiencyTestIds = {
  root: "progression-proficiency",
  value: "progression-proficiency-value",
  slider: "progression-proficiency-slider",
  decrease: "progression-proficiency-decrease",
  increase: "progression-proficiency-increase",
};
const DOCK_PROFICIENCY_TESTIDS: ProficiencyTestIds = {
  root: "dock-proficiency",
  value: "dock-proficiency-value",
  slider: "dock-proficiency-slider",
  decrease: "dock-proficiency-decrease",
  increase: "dock-proficiency-increase",
};

/** Manager Proficiency (70–90, default 90): label, the value in an <output>
 *  and a native range drawn as a 16 px track. Moving it to a new value
 *  deselects the manager (withManagerProficiency). Arrow / Home / End are
 *  native; PageUp / PageDown move by 5 (browsers disagree on their step).
 *  `steppers` (the phone dock's popover) adds 36 px round − / + buttons
 *  (44 px touch area, step 1) on either side of the slider, in the Tab order
 *  − slider + like every other visible control of a popover (QA 2026-10-23
 *  bug 6); at a bound a button is
 *  `aria-disabled`, so it keeps focus instead of dropping it to the body, and
 *  each press is announced. `autoFocus` marks the slider as the control a
 *  popover focuses on opening. */
export function ProficiencyControl({
  state,
  level,
  onChange,
  id,
  describedBy,
  steppers = false,
  autoFocus = false,
  testIds = PANEL_PROFICIENCY_TESTIDS,
}: {
  state: ProgressionState;
  /** The level in effect (the engine's config). */
  level: number;
  onChange: ProgressionChange;
  id: string;
  describedBy?: string;
  steppers?: boolean;
  autoFocus?: boolean;
  /** data-testids (the panel's and the dock's controls differ). */
  testIds?: ProficiencyTestIds;
}) {
  const [stepped, setStepped] = useState("");
  const set = (value: number) => {
    const s = withManagerProficiency(state, value);
    if (s) onChange(s);
    return s;
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "PageUp" && e.key !== "PageDown") return;
    e.preventDefault();
    set(state.managerProficiency + (e.key === "PageUp" ? 5 : -5));
  };
  const step = (delta: 1 | -1) => {
    const s = set(state.managerProficiency + delta);
    if (s) setStepped(`Manager proficiency ${s.managerProficiency}${state.manager ? `, ${state.manager.name} deselected` : ""}`);
  };
  const slider = (
    <input
      id={id}
      type="range"
      min={MANAGER_PROFICIENCY_MIN}
      max={MANAGER_PROFICIENCY_MAX}
      step={1}
      value={level}
      aria-label="Manager proficiency"
      aria-valuetext={`Manager proficiency ${level}`}
      aria-describedby={describedBy}
      onChange={(e) => set(Number(e.target.value))}
      onKeyDown={onKey}
      style={rangeStyle(level, MANAGER_PROFICIENCY_MIN, MANAGER_PROFICIENCY_MAX)}
      className="efb-range efb-range--proficiency"
      data-testid={testIds.slider}
      data-autofocus={autoFocus ? "" : undefined}
    />
  );
  const stepButton = (delta: 1 | -1) => {
    const atBound = delta > 0 ? level >= MANAGER_PROFICIENCY_MAX : level <= MANAGER_PROFICIENCY_MIN;
    return (
      <button
        type="button"
        aria-label={`${delta > 0 ? "Increase" : "Decrease"} Manager Proficiency`}
        aria-disabled={atBound || undefined}
        onClick={() => {
          if (!atBound) step(delta);
        }}
        className="efb-proficiency-step hit-44"
        data-testid={delta > 0 ? testIds.increase : testIds.decrease}
      >
        {delta > 0 ? <Plus className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      </button>
    );
  };
  return (
    <div className="min-w-0" data-testid={testIds.root}>
      <div className="efb-progression__row-head">
        <label htmlFor={id} className="efb-progression__label text-[var(--color-text-secondary)]">
          Manager Proficiency
        </label>
        <output htmlFor={id} className="efb-progression__proficiency-value" data-testid={testIds.value}>
          {level}
        </output>
      </div>
      {steppers ? (
        <div className="efb-proficiency-steps">
          {stepButton(-1)}
          {slider}
          {stepButton(1)}
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {stepped}
          </p>
        </div>
      ) : (
        slider
      )}
    </div>
  );
}

/** "Select Manager": 48 px pill (#272727, text #c2f879); with a manager
 *  selected it shows the art, the name, the rating and the "+1" pills. The
 *  panel's trigger and the phone dock popover's share it. Pointer over,
 *  focus or a press start loading the drawer's code (deferred.tsx). */
export function ManagerTrigger({ manager, onClick, testId }: { manager: PickerManagerDTO | null; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onClick}
      onPointerEnter={prefetchManagerPicker}
      onFocus={prefetchManagerPicker}
      onPointerDown={prefetchManagerPicker}
      data-testid={testId}
      data-manager-id={manager?.id ?? ""}
      data-selected={manager ? "true" : undefined}
      className="efb-manager-trigger"
    >
      {manager ? (
        <>
          {manager.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={manager.imageUrl} alt="" width={32} height={32} loading="lazy" decoding="async" className="size-8 shrink-0 rounded-full object-cover" />
          ) : (
            <UserRound className="size-5 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-white">
              <span className="sr-only">Select Manager — selected: </span>
              {manager.name} <span className="text-[var(--color-text-secondary)]">· {manager.rating}</span>
            </span>
            <span className="block truncate text-xs">{pillText(manager)}</span>
          </span>
        </>
      ) : (
        <>
          <UserRoundCog className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">Select Manager</span>
        </>
      )}
    </button>
  );
}

export function ProgressionPanel({
  player,
  state,
  result,
  onChange,
  notice = null,
  idBase,
  highlight = null,
  onHighlight,
  preview,
  embedded = false,
  notes,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  result: BuildResult;
  onChange: ProgressionChange;
  /** Static explanatory copy (build-notes.ts, from the server page) for the
   *  Build settings the embedded panel renders. */
  notes: BuildNotes;
  /** Max Level reset notice of the last change (shown and announced). */
  notice?: string | null;
  /** Base of the ids shared with the Build settings card. */
  idBase: string;
  /** Pinned category whose stats the stat grid highlights; the label buttons
   *  toggle it (and their aria-pressed reflects it only). */
  highlight?: TrainingCategory | null;
  onHighlight?: (next: TrainingCategory | null) => void;
  /** Hover / keyboard-focus preview of a label's category (useCategoryPreview);
   *  omitted in the phone sheet, where the grid sits behind the modal. */
  preview?: CategoryPreviewBind;
  /** Rendered inside the mobile bottom sheet: no card chrome, the sheet's
   *  title replaces the visible heading, and the Build settings follow the
   *  categories in the same flow. */
  embedded?: boolean;
}) {
  const ids = progressionIds(idBase);
  const budget = trainingPointsAvailable(state.maxLevel);
  const remaining = result.remainingPoints;
  const mp = result.config.managerProficiency;
  const manager = state.manager;
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Fixed scale of the category tracks: the most stat points one category
   *  can hold with the whole budget, so every track reads on the same scale. */
  const trackMax = maxGainForBudget(budget);

  const emit = (next: ProgressionState | null) => {
    if (next) onChange(next);
  };
  const maxOvr = () => emit(withMaxOvr(state));
  // Reset clears the training only; the proficiency level and the manager stay.
  const reset = () => emit(withReset(state));
  // Choosing a manager sets the level to its rating; choosing the selected
  // one again deselects it and leaves the level where it is.
  const chooseManager = (m: PickerManagerDTO) => {
    setPickerOpen(false);
    emit(withManagerChoice(state, m));
  };

  const labelOf = (cat: TrainingCategory) => PROGRESSION_CATEGORY_LABELS[cat];

  return (
    <section
      aria-labelledby={ids.title}
      data-testid="progression-panel"
      className={embedded ? "efb-progression efb-progression--embedded" : "efb-progression efb-card"}
    >
      {/* Header: title + points, Max OVR, reset (32 px each). */}
      <div className="efb-progression__header">
        <div className="min-w-0 flex-1">
          <h2 id={ids.title} className={embedded ? "sr-only" : "efb-progression__title"}>
            Progression
          </h2>
          <p className="efb-progression__points" data-testid="progression-budget">
            <span data-testid="progression-used">{pts(result.pointsUsed)}</span>/{pts(budget)} pts
          </p>
        </div>
        <button type="button" onClick={maxOvr} className="button button--sm button--primary shrink-0">
          Max OVR
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label="Reset"
          title="Reset: every category to 0 (keeps the proficiency and the manager)"
          className="button button--sm button--ghost button--icon-only shrink-0"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>
      {notice ? (
        // Visible copy of the live region's reset notice (announced there).
        <p className="efb-progression__notice" aria-hidden>
          {notice}
        </p>
      ) : null}

      {/* Select Manager: 48 px pill; the rating becomes the proficiency level,
          the pills get +1 after the boosters. */}
      <div className="min-w-0" data-testid="progression-manager">
        <ManagerTrigger manager={manager} onClick={() => setPickerOpen(true)} testId="progression-manager-button" />
        <DeferredManagerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selectedId={manager?.id ?? null} onChoose={chooseManager} />
      </div>

      {/* Manager Proficiency (70–90, default 90). */}
      <ProficiencyControl state={state} level={mp} onChange={onChange} id={ids.mp} describedBy={ids.mpNote} />

      {/* Ten category rows (42 px): label button (hover / keyboard focus
          previews the category's stats in the stat grid, a press pins the
          highlight), next cost, − value +, 16 px track. */}
      <div id={ids.cats} className="efb-progression__cats" role="group" aria-label="Training categories">
        {TRAINING_CATEGORIES.map((cat) => {
          const v = state.trainingPoints[cat];
          const hit = highlight === cat;
          return (
            <div key={cat} className="efb-progression-row" data-active={v > 0 ? "true" : undefined} data-testid={`progression-cat-${cat}`}>
              <div className="efb-progression__row-head">
                <button
                  type="button"
                  id={ids.catLabel(cat)}
                  aria-pressed={hit}
                  aria-describedby={ids.catStats(cat)}
                  {...preview?.(cat)}
                  onClick={() => onHighlight?.(hit ? null : cat)}
                  className="efb-progression-row__label hit-44 motion-reduce:transition-none"
                  data-testid={`progression-cat-${cat}-label`}
                >
                  {labelOf(cat)}
                </button>
                {/* No `title`: the stats are the label's description here and
                    a visible list in "About this build"; the costs are in the
                    spinbutton's value text and the visible "next N". */}
                <span id={ids.catStats(cat)} className="sr-only">
                  Raises {categoryStatsText(cat)}. Focus previews these stats; press to pin the highlight.
                </span>
                {/* Visible next cost (spec "Cost Curve"), compact so the row
                    keeps its 42 px; aria-hidden because the spinbutton's
                    value text already says "next costs N". */}
                <span className="efb-progression-row__next" aria-hidden data-next-cost={pts(nextStatPointCost(v))}>
                  next {pts(nextStatPointCost(v))}
                </span>
                <CategoryStepper cat={cat} state={state} onChange={onChange} labelledBy={ids.catLabel(cat)} />
              </div>
              {/* Track on a fixed scale (the whole budget in one category).
                  Not a tab stop — the spinbutton above carries the keyboard
                  interaction and the accessible name; a drag past what is
                  affordable is clamped. */}
              <input
                type="range"
                tabIndex={-1}
                aria-hidden
                min={0}
                max={Math.max(trackMax, v)}
                step={1}
                value={v}
                onChange={(e) => emit(withCategory(state, cat, Number(e.target.value)))}
                style={rangeStyle(v, 0, Math.max(trackMax, v))}
                className="efb-range"
                data-testid={`progression-cat-${cat}-slider`}
              />
            </div>
          );
        })}
      </div>

      {embedded && <BuildSettings player={player} state={state} result={result} onChange={onChange} idBase={idBase} notes={notes} embedded />}

      {/* Live region: points left, the overall and any reset notice. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="progression-live">
        {pts(remaining)} pts left · {result.overall} at {state.position} · proficiency {mp}
        {manager ? ` · ${manager.name}` : ""}
        {notice ? ` · ${notice}` : ""}
      </p>
    </section>
  );
}

/** "Build settings": Max Level + Position, the overall at the position and
 *  the explanatory notes behind "About this build". From lg a non-sticky card
 *  at the end of the left column, below the pinned Progression card's travel
 *  (it holds what does not fit the pinned
 *  card's 819 px); inside the sheet it follows the categories (`embedded`). */
export function BuildSettings({
  player,
  state,
  result,
  onChange,
  idBase,
  notes,
  embedded = false,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  result: BuildResult;
  onChange: ProgressionChange;
  idBase: string;
  /** Static explanatory copy (build-notes.ts, passed down from the server page). */
  notes: BuildNotes;
  embedded?: boolean;
}) {
  const ids = progressionIds(idBase);
  const levelCap = Math.max(1, player.levelCap);
  const budget = trainingPointsAvailable(state.maxLevel);
  const proficiency = result.proficiency;
  const mp = result.config.managerProficiency;
  const manager = state.manager;
  const customBuild = useMemo(() => isCustomBuild(state, defaultProgressionState(player), player), [state, player]);

  // Max Level is edited through a draft string: typing never commits (a
  // half-typed "2" of "25" must not clamp the level and wipe the allocation);
  // the draft is committed and clamped on blur / Enter, while the spinner and
  // the arrow keys commit immediately. A committed level that can no longer
  // afford the current spend resets the allocation with a notice (shown and
  // announced by the panel).
  const [levelDraft, setLevelDraft] = useState<string | null>(null);

  /** Commit a raw Max Level value: invalid / empty reverts to the committed
   *  level; otherwise clamp to 1..levelCap and reset the allocation only when
   *  the new budget no longer covers the points already spent. */
  const commitMaxLevel = (raw: string) => {
    setLevelDraft(null);
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? NaN : Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const maxLevel = Math.min(Math.max(1, Math.floor(parsed)), levelCap);
    if (maxLevel === state.maxLevel) return;
    const spent = allocationCost(state.trainingPoints);
    const available = trainingPointsAvailable(maxLevel);
    const fits = spent <= available;
    onChange(
      { ...state, maxLevel, trainingPoints: fits ? state.trainingPoints : emptyAllocation() },
      fits ? null : `allocation reset: level ${maxLevel} gives ${pts(available)} pts, fewer than the ${pts(spent)} spent`,
    );
  };
  const onLevelInput = (e: ChangeEvent<HTMLInputElement>) => {
    // Typing carries an inputType (insertText, deleteContentBackward, …);
    // the native spinner does not — it commits at once.
    const typing = Boolean((e.nativeEvent as Partial<InputEvent>).inputType);
    if (typing) setLevelDraft(e.target.value);
    else commitMaxLevel(e.target.value);
  };
  const onLevelKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitMaxLevel(e.currentTarget.value);
    } else if (e.key === "Escape") {
      // Inside the bottom sheet Escape would also close the sheet; a draft
      // being edited is reverted first.
      if (levelDraft !== null) {
        e.preventDefault();
        e.stopPropagation();
      }
      setLevelDraft(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const draft = levelDraft?.trim() ?? "";
      const from = draft !== "" && Number.isFinite(Number(draft)) ? Math.floor(Number(draft)) : state.maxLevel;
      commitMaxLevel(String(from + (e.key === "ArrowUp" ? 1 : -1)));
    }
  };

  const labelOf = (cat: TrainingCategory) => PROGRESSION_CATEGORY_LABELS[cat];

  const body = (
    <>
      {/* Max Level + Position, then the overall there. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <label htmlFor={ids.level} className="efb-progression__field-label">
            Max Level <span className="text-[var(--color-text-dim)]">(1–{levelCap})</span>
          </label>
          <input
            id={ids.level}
            type="number"
            inputMode="numeric"
            min={1}
            max={levelCap}
            step={1}
            value={levelDraft ?? String(state.maxLevel)}
            onChange={onLevelInput}
            onKeyDown={onLevelKey}
            onBlur={(e) => commitMaxLevel(e.currentTarget.value)}
            aria-describedby={ids.levelHint}
            className="field field--sm mt-1 tabular-nums"
          />
          <span id={ids.levelHint} className="sr-only">
            Applied when you leave the field or press Enter; an allocation the new level cannot afford is reset.
          </span>
        </div>
        <div className="min-w-0">
          <label htmlFor={ids.position} className="efb-progression__field-label">
            Position
          </label>
          <span className="efb-progression__select mt-1">
            <select id={ids.position} value={state.position} onChange={(e) => onChange({ ...state, position: e.target.value as Position })} className="field field--sm">
              {POSITIONS.map((p) => {
                const prof = proficiencyFromAptitude(player.positionAptitudes[p]);
                return (
                  <option key={p} value={p} data-proficiency={prof}>
                    {p} · {PROFICIENCY_LABELS[prof]}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="efb-progression__select-icon size-4" aria-hidden />
          </span>
        </div>
      </div>
      <div className="efb-progression__estimate" data-testid="progression-estimate">
        <div className="min-w-0">
          <div className="text-sm text-[var(--color-text-secondary)]">
            OVR at {state.position} · {PROFICIENCY_LABELS[proficiency]}
          </div>
          <div className="text-xs text-[var(--color-text-dim)]">
            {customBuild ? "Custom build" : "Max-OVR build"} · {manager ? `${manager.name} (${mp})` : `proficiency ${mp}`}
          </div>
        </div>
        <div className="efb-progression__overall" data-testid="progression-overall">
          {result.overall}
        </div>
      </div>

      {/* Explanatory notes, limits and the build status behind a disclosure. */}
      <details className="efb-progression__about">
        <summary className="efb-progression__about-summary hit-44">
          About this build
          <ChevronDown className="efb-progression__about-icon size-4" aria-hidden />
        </summary>
        <div className="efb-progression__about-body">
          <p data-testid="progression-overall-label" data-proficiency={proficiency}>
            {overallLabel(mp, manager)}
          </p>
          <p id={ids.mpNote} data-testid="progression-proficiency-note">
            {proficiencyNote(mp)}
            {manager ? " Moving the slider deselects the manager." : ""}
          </p>
          <p>{customBuild ? notes.customBuild : notes.openingBuild}</p>
          <p>{notes.costRule}</p>
          {/* The stats, spent and next cost of every category in one list
              (the rows show "next N" visibly; the spinbutton's value text
              says both; the label describes its stats to screen readers). */}
          <dl className="efb-progression__costs" aria-label="Stats, points spent and next stat point cost per category">
            {TRAINING_CATEGORIES.map((cat) => (
              <div key={cat} className="contents">
                <dt>{labelOf(cat)}</dt>
                <dd>
                  spent {pts(categoryCost(state.trainingPoints[cat]))} · next {pts(nextStatPointCost(state.trainingPoints[cat]))} pts
                </dd>
                <dd className="efb-progression__cost-stats">{categoryStatsText(cat)}</dd>
              </div>
            ))}
          </dl>
          <p>
            Max OVR picks the allocation with the highest weighted stat sum of the formula at {state.position} for the {pts(budget)}-point budget, {notes.maxOvrRest}
          </p>
          <p className="text-[var(--color-text-dim)]" data-testid="progression-limits">
            {notes.limits}
          </p>
        </div>
      </details>
    </>
  );

  if (embedded) {
    return (
      <div className="contents" data-testid="build-settings">
        {body}
      </div>
    );
  }
  return (
    <section aria-labelledby={ids.settingsTitle} data-testid="build-settings" className="efb-progression efb-build-settings efb-card">
      <h2 id={ids.settingsTitle} className="efb-progression__title">
        Build settings
      </h2>
      {body}
    </section>
  );
}

/** Mobile (< lg) dock of the Progression panel: a floating category strip
 *  and a 366 × 50 bar above the tab bar (efootbase-behaviour-parity, reference
 *  `detail-mobile-progression-sheet.png`).
 *   - The proficiency chip and the manager avatar toggle one small NON-MODAL
 *     popover (the shared PopoverPanel: `role="dialog"`, light dismiss, the
 *     page not dimmed) anchored above the strip — so above the dock, with the
 *     strip still visible between them — and as wide as the dock: "Select
 *     Manager" (opens the manager drawer) and the Manager Proficiency control
 *     with 36 px − / + buttons. Focus goes to the slider (Tab order: Select
 *     Manager, −, slider, +); Escape or a tap outside closes it and focus
 *     returns to the chip / avatar that opened it; Tab out of it closes it.
 *     A press on either trigger while it is open closes it.
 *   - The strip, the points and the "Progression" button open the bottom
 *     sheet with the full panel (`onOpen`; the parent scrolls it to the
 *     category rows).
 *   - Reset and Max OVR act at once through the same helpers as the panel.
 *  Changes made here are announced. Every button that opens a dialog says so
 *  (`aria-haspopup="dialog"`) and exposes whether that dialog is open: the
 *  chip and the avatar the popover's state, the others the sheet's
 *  (`expanded`). */
export function ProgressionDock({
  state,
  result,
  onChange,
  onOpen,
  onOpenIntent,
  expanded,
}: {
  state: ProgressionState;
  result: BuildResult;
  onChange: (next: ProgressionState) => void;
  onOpen: () => void;
  /** Pointer over / focus on / a press of a control that opens the sheet
   *  (the parent starts loading the sheet's code, deferred.tsx). */
  onOpenIntent?: () => void;
  /** Whether the sheet the dock opens is open. */
  expanded: boolean;
}) {
  const opensSheet = {
    onClick: onOpen,
    onPointerEnter: onOpenIntent,
    onFocus: onOpenIntent,
    onPointerDown: onOpenIntent,
    "aria-haspopup": "dialog",
    "aria-expanded": expanded,
  } as const;
  const budget = trainingPointsAvailable(state.maxLevel);
  const mp = result.config.managerProficiency;
  const manager = state.manager;
  // Manager / proficiency popover and the manager drawer it opens (loaded on
  // its first opening, deferred.tsx).
  const popId = `dock-pop-${useId().replace(/:/g, "")}`;
  const stripRef = useRef<HTMLButtonElement>(null);
  const popTriggerRef = useRef<HTMLElement | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Open at the press: in an engine without `showPopover({ source })` the
  // press light-dismisses the popover before the click, which would reopen it.
  const openAtPress = useRef<boolean | null>(null);
  const opensPopover = {
    "aria-haspopup": "dialog",
    "aria-expanded": popOpen,
    "aria-controls": popId,
    // The popover holds "Select Manager": its drawer's code starts loading
    // on intent (deferred.tsx).
    onPointerEnter: prefetchManagerPicker,
    onFocus: prefetchManagerPicker,
    onPointerDown: () => {
      prefetchManagerPicker();
      openAtPress.current = popOpen;
    },
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      const wasOpen = openAtPress.current ?? popOpen;
      openAtPress.current = null;
      if (wasOpen) {
        setPopOpen(false);
        return;
      }
      // Focus returns to the control that opened it.
      popTriggerRef.current = e.currentTarget;
      setPopOpen(true);
    },
  } as const;
  // The announcement belongs to the state its action produced: once the
  // build changes any other way (the sheet, the Overview boosters) it is gone,
  // so the live region never re-announces a stale action with a new overall.
  const [announce, setAnnounce] = useState<{ text: string; state: ProgressionState } | null>(null);
  const spent = TRAINING_CATEGORIES.filter((c) => state.trainingPoints[c] > 0);
  const stripName = `Open Progression. Training categories: ${
    spent.length > 0 ? spent.map((c) => `${PROGRESSION_CATEGORY_LABELS[c]} ${state.trainingPoints[c]}`).join(", ") : "no stat points spent"
  }`;
  const act = (next: ProgressionState, text: string) => {
    onChange(next);
    setAnnounce({ text, state: next });
  };
  const usedAfter = (next: ProgressionState) => pts(allocationCost(next.trainingPoints));
  // "Select Manager" in the popover: the popover closes first (its effect
  // hands focus back to the chip / avatar, which the drawer then records as
  // its opener and refocuses when it closes), then the drawer opens.
  const openPicker = () => {
    setPopOpen(false);
    setPickerOpen(true);
  };
  const chooseManager = (m: PickerManagerDTO) => {
    setPickerOpen(false);
    const next = withManagerChoice(state, m);
    act(next, next.manager ? `${m.name} selected: Manager Proficiency ${next.managerProficiency}` : `${m.name} deselected`);
  };

  return (
    <div className="efb-dock-wrap lg:hidden" data-progression-dock="">
      <button ref={stripRef} type="button" {...opensSheet} className="efb-dock-strip hit-44" aria-label={stripName} data-testid="dock-strip">
        {/* The clip lives on this inner row: on the button it would cut the
            coarse-pointer hit area (::after). */}
        <span className="efb-dock-strip__items">
        {spent.length > 0 ? (
          spent.map((c) => {
            const Icon = CATEGORY_ICON[c];
            const suffix = CATEGORY_SUFFIX[c];
            return (
              <span key={c} className="efb-dock-strip__item" aria-hidden>
                <Icon className="size-3.5 shrink-0" />
                {suffix && <span className="efb-category-strip__sub">{suffix}</span>}
                {state.trainingPoints[c]}
              </span>
            );
          })
        ) : (
          <span className="text-xs font-medium text-[var(--color-text-secondary)]" aria-hidden>
            No stat points spent
          </span>
        )}
        </span>
      </button>

      <div className="efb-dock" role="group" aria-label="Progression">
        <button type="button" {...opensPopover} className="efb-dock__proficiency hit-44" aria-label={`Manager Proficiency ${mp} — change manager and proficiency`} data-testid="dock-proficiency-chip">
          {mp}
        </button>
        <button
          type="button"
          {...opensPopover}
          className="efb-dock__manager hit-44"
          aria-label={manager ? `Manager ${manager.name}, rating ${manager.rating} — change manager and proficiency` : "No manager selected — change manager and proficiency"}
          data-testid="dock-manager-avatar"
        >
          {manager?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={manager.imageUrl} alt="" width={36} height={36} loading="lazy" decoding="async" className="size-full rounded-[inherit] object-cover" />
          ) : manager ? (
            <span aria-hidden>{manager.name.slice(0, 1)}</span>
          ) : (
            <UserRoundCog className="size-5" aria-hidden />
          )}
        </button>
        <span className="efb-dock__points">
          <button type="button" {...opensSheet} className="efb-dock__points-value hit-44" aria-label={`${pts(result.pointsUsed)} of ${pts(budget)} pts used — open Progression`} data-testid="dock-points">
            {pts(result.pointsUsed)}/{pts(budget)}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = withReset(state);
              act(next, `Reset: ${usedAfter(next)}/${pts(budget)} pts used`);
            }}
            className="efb-dock__reset hit-44"
            aria-label="Reset"
            title="Reset: every category to 0 (keeps the proficiency and the manager)"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
        </span>
        <span className="min-w-0 flex-1" aria-hidden />
        <button
          type="button"
          onClick={() => {
            const next = withMaxOvr(state);
            act(next, `Max OVR: ${usedAfter(next)}/${pts(budget)} pts used`);
          }}
          className="button button--sm button--primary shrink-0"
        >
          Max OVR
        </button>
        <button type="button" {...opensSheet} className="button button--sm button--ghost button--icon-only shrink-0" aria-label="Progression" title="Open Progression" data-testid="dock-open-sheet">
          <SlidersHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      {/* Before the drawer in the tree: its close effect (focus back to the
          trigger) runs before the drawer's open effect records its opener. */}
      <PopoverPanel
        id={popId}
        open={popOpen}
        onOpenChange={setPopOpen}
        triggerRef={popTriggerRef}
        anchorRef={stripRef}
        side="top"
        matchWidth
        label="Manager and proficiency"
        className="efb-dock-popover"
        data-testid="dock-popover"
      >
        <div className="efb-dock-popover__body">
          <ManagerTrigger manager={manager} onClick={openPicker} testId="dock-manager-button" />
          <ProficiencyControl state={state} level={mp} onChange={onChange} id={`${popId}-mp`} steppers autoFocus testIds={DOCK_PROFICIENCY_TESTIDS} />
        </div>
      </PopoverPanel>
      <DeferredManagerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selectedId={manager?.id ?? null} onChoose={chooseManager} />
      {/* The overall comes from the parent's result after the change. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announce && announce.state === state ? `${announce.text} · ${result.overall} at ${state.position}` : ""}
      </p>
    </div>
  );
}
