"use client";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  CATEGORY_POINT_MAX,
  HIGHLIGHT_MAX_LEVEL,
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
  allocationForMaxLevel,
  bestAllocation,
  buildMode,
  categoryCost,
  categoryLimit,
  clampManagerProficiency,
  emptyAllocation,
  maxLevelRange,
  modeHasCategories,
  nextStatPointCost,
  openingBuildState,
  positionFromIndex,
  proficiencyFromAptitude,
  sameBuildState,
  setCategoryPoints,
  statBreakdown,
  toDisplayPoints,
  trainingPointsAvailable,
  type BaseStat,
  type BuildMode,
  type BuildResult,
  type BuildUrlState,
  type PickerManagerDTO,
  type PlayerCardDTO,
  type Position,
  type SecondBoosterDTO,
  type TrainingCategory,
} from "@eflab/shared";
import { ATTACKING_STATS, DEFENDING_STATS, STRENGTH_STATS, boosterLabel, statLabel } from "@/lib/card-display";
import { DeferredManagerPicker, prefetchManagerPicker } from "@/components/build-simulator/deferred";
import { CATEGORY_ICON, CATEGORY_SUFFIX, type CategoryPreviewBind } from "@/components/detail/StatGrid";
import { Popover, PopoverPanel } from "@/components/ui/Popover";
// Type only: the static copy itself comes from the server page (`notes`).
import type { BuildNotes } from "@/components/build-simulator/build-notes";
import { ChevronDown, Minus, Plus, RotateCcw, SlidersHorizontal, UserRound, UserRoundCog } from "lucide-react";

// Progression controls of the player detail page (player-progression-simulator;
// exact model since efootbase-exact-model-managers; layout of change
// efootbase-ui-redesign, split in efootbase-behaviour-parity; card kinds, the
// build in the URL, booster levels and the Adjust popover of change
// efootbase-function-parity). The parent (PlayerDetailClient) owns the state —
// it feeds the projected stats into the stat grid, the card face and the Pitch
// Map, keeps the build in the URL and remembers the manager — and runs the
// shared engine (`simulateCardBuild`); this file renders the controls:
//   ProgressionPanel  the pinned card. By card kind (`buildMode`):
//                     capped     "Progression": "used/total pts", Max OVR,
//                                reset; Select Manager; Manager Proficiency;
//                                ten 42 px category rows (label = pin,
//                                next cost, − n +, 0–25 track);
//                     highlight  (Highlight, level cap 1) the same plus the
//                                "Max Level N" note and a 1–80 slider with
//                                − / +; points, Max OVR, reset and the rows
//                                from Max Level 2;
//                     trending   "Build": Select Manager and the proficiency
//                                only.
//                     Below lg it runs inside the bottom sheet (`embedded`,
//                     which also holds the Build settings).
//   BuildSettings     the non-sticky card at the end of the left column:
//                     Max Level (level cap above 1) + Position, the overall
//                     there and "About this build" (notes, limits and the
//                     26-row "Stat breakdown").
//   CategoryAdjust    the Adjust popover's content (a stat row, a category
//                     strip item): per category − value + and a 0–25 slider.
//   CategoryStepper   − value + of one panel row.
//   ProficiencyControl  the Manager Proficiency row (with 36 px − / + in the
//                     dock popover).
//   ManagerTrigger    the 48 px "Select Manager" pill.
//   ProgressionDock   below lg: a floating category strip (its items open the
//                     Adjust popover) and a 366 × 50 dock above the tab bar
//                     (proficiency + manager popover, points as
//                     remaining/total and the Progression button → the sheet,
//                     reset, Max OVR).
// Booster controls live in the Overview card (same state). Points are printed
// in the displayed whole-point unit (toDisplayPoints: twice the engine's
// training points). Rules: packages/shared/src/progression.ts and build.ts.

/** Readings the formula was checked against (change
 *  efootbase-exact-model-managers, docs/efootbase-exact-model.md): every
 *  overall displayed in the survey of five cards. */
export const EXACT_MODEL_READINGS = 793;

/** The build (the URL's state, `BuildUrlState`: categories, Max Level, the
 *  slider's proficiency, the manager id, booster levels, the second booster
 *  slug) plus the selected position, which the URL does not carry. */
export type ProgressionState = BuildUrlState & { position: Position };

/** The list entries a build refers to by id, resolved by the page once the
 *  lists answered (`manager.picker`, `booster.secondChoices`). */
export interface BuildRefs {
  manager: PickerManagerDTO | null;
  second: SecondBoosterDTO | null;
}

/** A notice of a change (points removed by a lower Max Level): `text` is
 *  announced by the live region and shown in the phone sheet; `short` is the
 *  one-line visible copy of the pinned card, which must fit a 1440 × 900
 *  viewport without an inner scrollbar (the points label beside it already
 *  shows the new budget). */
export interface BuildNotice {
  text: string;
  short: string;
}

/** What a change means beyond the new state: the Max Level notice that the
 *  panel shows and announces (any other change clears it), and whether the
 *  change chose a manager ("remember") or deselected it / moved the
 *  proficiency ("forget") — the page keeps the remembered manager. */
export interface BuildChangeMeta {
  notice?: BuildNotice | null;
  manager?: "remember" | "forget";
}
export type ProgressionChange = (next: ProgressionState, meta?: BuildChangeMeta) => void;

type BoosterSlotInfo = { label: string; deltas: Array<[BaseStat, number]>; usable: boolean };
type BoosterPlayer = Pick<PlayerCardDTO, "boosterId1" | "boosterId2" | "booster1" | "booster2">;

/** Booster slot: readable label ("+5 · Dribbling, Tight Possession, Speed,
 *  Balance", `boosterLabel`) + sparse deltas, or the reason it is unusable.
 *  A booster whose stat vector is empty (e.g. the seeded "Booster +1" rows
 *  with no stat data) is as unusable as an unknown id: there is nothing to
 *  toggle, so it never gets a control. */
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

/** Opening state of a card (`openingBuildState`): the Max-OVR allocation at
 *  its level cap (no point on a Highlight card with a level cap of 1), every
 *  usable booster on, Manager Proficiency 90, no manager, no second booster,
 *  at the registered position. A remembered manager is applied by the page. */
export function openingProgressionState(player: PlayerCardDTO): ProgressionState {
  return { ...openingBuildState(player), position: positionFromIndex(player.registeredPosition) };
}

/** True once the build differs from the card's opening state (any part of
 *  the URL's build — a selected manager included — or the position). One
 *  rule with the URL writer (`sameBuildState`). */
export function isCustomBuild(state: ProgressionState, player: PlayerCardDTO): boolean {
  return state.position !== positionFromIndex(player.registeredPosition) || !sameBuildState(state, openingBuildState(player), player);
}

/** True when the build can spend training points: a card with a level cap
 *  above 1, or a Highlight card with a level cap of 1 from Max Level 2. */
export function canSpendPoints(mode: BuildMode, state: Pick<ProgressionState, "maxLevel">): boolean {
  return mode === "capped" || (mode === "highlight" && state.maxLevel >= 2);
}

/** Max OVR: the optimal allocation for the committed level at the selected
 *  position; the proficiency, the boosters and the manager stay. */
export function withMaxOvr(state: ProgressionState): ProgressionState {
  return { ...state, allocation: bestAllocation(state.position, trainingPointsAvailable(state.maxLevel)) };
}

/** Reset: every category to zero; the proficiency, the boosters, the manager
 *  and the Max Level stay. */
export function withReset(state: ProgressionState): ProgressionState {
  return { ...state, allocation: emptyAllocation() };
}

/** Most stat points `cat` can hold (budget left by the others, never above 25). */
export function categoryMax(state: ProgressionState, cat: TrainingCategory): number {
  return categoryLimit(state.allocation, cat, trainingPointsAvailable(state.maxLevel));
}

/** Points left of the budget (engine half-point unit). */
export function pointsLeft(state: ProgressionState): number {
  return trainingPointsAvailable(state.maxLevel) - allocationCost(state.allocation);
}

/** One category set to `value` (`setCategoryPoints`: never below 0, an
 *  increase limited to the largest affordable value and to 25). Null when
 *  nothing changes. */
export function withCategory(state: ProgressionState, cat: TrainingCategory, value: number): ProgressionState | null {
  const allocation = setCategoryPoints(state.allocation, cat, value, trainingPointsAvailable(state.maxLevel));
  return allocation ? { ...state, allocation } : null;
}

/** Manager Proficiency moved to `value` (70–90) from the level in effect
 *  (`level`: the selected manager's rating, else the slider's): a new value
 *  deselects the manager. Null when nothing moves. */
export function withManagerProficiency(state: ProgressionState, value: number, level: number): ProgressionState | null {
  const managerProficiency = clampManagerProficiency(value);
  if (managerProficiency === level) return null;
  return { ...state, managerProficiency, managerId: null };
}

/** A manager chosen in the picker: it sets the proficiency to its rating;
 *  choosing the selected one again deselects it and returns the proficiency
 *  to 90 (the reference, S1 §6, on two cards from 90, 80 and 75). */
export function withManagerChoice(state: ProgressionState, m: PickerManagerDTO): ProgressionState {
  if (state.managerId === m.id) return withManagerCleared(state);
  return { ...state, managerId: m.id, managerProficiency: clampManagerProficiency(m.rating) };
}

/** "Clear" in the picker (or the selected manager chosen again). */
export function withManagerCleared(state: ProgressionState): ProgressionState {
  return { ...state, managerId: null, managerProficiency: MANAGER_PROFICIENCY_DEFAULT };
}

/** A committed Max Level (clamped to the card's range): points are removed
 *  one at a time from the last categories holding them until the build fits
 *  (`allocationForMaxLevel`); the notice says so. Null when the level does not
 *  change. */
export function withMaxLevel(state: ProgressionState, player: PlayerCardDTO, level: number): { state: ProgressionState; notice: BuildNotice | null } | null {
  const [lo, hi] = maxLevelRange(player);
  const maxLevel = Math.min(hi, Math.max(lo, Math.floor(level)));
  if (!Number.isFinite(maxLevel) || maxLevel === state.maxLevel) return null;
  const { allocation, trimmed } = allocationForMaxLevel(state.allocation, maxLevel);
  return {
    state: { ...state, maxLevel, allocation },
    notice: trimmed
      ? { text: `level ${maxLevel} gives ${pts(trainingPointsAvailable(maxLevel))} pts; points removed from the last categories`, short: "Points removed from the last categories." }
      : null,
  };
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
  levelNote: `${base}-level-note`,
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
 * − value + of one panel category row: 18 × 18 icon buttons (44 × 44 on
 * touch) around a `role="spinbutton"` value (Arrow / Page / Home / End keys;
 * named by `labelledBy`; value text "N stat points, X pts spent, next costs
 * Y"). "+" is disabled when the next stat point costs more than what is left
 * or the category holds 25. The buttons are not tab stops (the spinbutton is
 * the row's one stop); a button that becomes disabled while focused hands
 * focus to the value.
 */
export function CategoryStepper({
  cat,
  state,
  onChange,
  labelledBy,
}: {
  cat: TrainingCategory;
  state: ProgressionState;
  onChange: ProgressionChange;
  labelledBy: string;
}) {
  const v = state.allocation[cat];
  const max = categoryMax(state, cat);
  const canInc = v < max;
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
    set(Math.min(Math.max(0, target), Math.max(v, max)));
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
      <button type="button" tabIndex={-1} aria-label={`Decrease ${label}`} disabled={v === 0} onClick={() => set(v - 1)} className="efb-stepper__button hit-44" {...track("dec")}>
        <Minus className="size-3.5" aria-hidden />
      </button>
      <div
        ref={valueRef}
        role="spinbutton"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={Math.max(v, max)}
        aria-valuetext={`${v} stat points, ${costText}`}
        onKeyDown={onKey}
        className="efb-stepper__value"
      >
        {v}
      </div>
      <button type="button" tabIndex={-1} aria-label={`Increase ${label}`} disabled={!canInc} onClick={() => set(v + 1)} className="efb-stepper__button hit-44" {...track("inc")}>
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Content of the Adjust popover (a stat row, a category strip item — D6): the
 * title (the category; Jumping: "Aerial Strength & Goalkeeper 1") and, per
 * category, − / value / + and a 0–25 slider acting exactly like the panel
 * (the slider never sets more than 25 or more than the budget buys: it
 * commits the largest affordable value at or below the request). No
 * breakdown, next cost or points left — the breakdown is the "Stat
 * breakdown" list of "About this build". − and + are `aria-disabled` at a
 * bound (they keep focus); the first slider takes the popover's focus. A
 * polite status announces each change made here (the panel's own live
 * region is absent below lg).
 */
export function CategoryAdjust({
  cats,
  state,
  result,
  onChange,
  headingId,
}: {
  cats: readonly TrainingCategory[];
  state: ProgressionState;
  result: BuildResult;
  onChange: ProgressionChange;
  /** id of the title (the popover is labelled by it). */
  headingId: string;
}) {
  const opened = useRef(state);
  const changed = state !== opened.current;
  const multi = cats.length > 1;
  return (
    <div className="efb-adjust">
      <h3 id={headingId} className="efb-adjust__title">
        {cats.map((c) => PROGRESSION_CATEGORY_LABELS[c]).join(" & ")}
      </h3>
      {cats.map((cat, i) => {
        const v = state.allocation[cat];
        const max = categoryMax(state, cat);
        const label = PROGRESSION_CATEGORY_LABELS[cat];
        const labelId = multi ? `${headingId}-${cat}` : headingId;
        const set = (value: number) => {
          const s = withCategory(state, cat, value);
          if (s) onChange(s);
        };
        return (
          <div key={cat} className="efb-adjust__cat" data-active={v > 0 ? "true" : undefined} data-testid={`adjust-cat-${cat}`}>
            {multi && (
              <span id={labelId} className="efb-adjust__cat-label">
                {label}
              </span>
            )}
            <div className="efb-adjust__controls">
              <button
                type="button"
                aria-label={`Decrease ${label}`}
                aria-disabled={v === 0 || undefined}
                onClick={() => {
                  if (v > 0) set(v - 1);
                }}
                className="efb-adjust__step hit-44"
                data-testid={`adjust-decrease-${cat}`}
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="efb-adjust__value" aria-hidden data-testid={`adjust-value-${cat}`}>
                {v}
              </span>
              <button
                type="button"
                aria-label={`Increase ${label}`}
                aria-disabled={v >= max || undefined}
                onClick={() => {
                  if (v < max) set(v + 1);
                }}
                className="efb-adjust__step hit-44"
                data-testid={`adjust-increase-${cat}`}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={CATEGORY_POINT_MAX}
              step={1}
              value={Math.min(v, CATEGORY_POINT_MAX)}
              aria-labelledby={labelId}
              aria-valuetext={`${v} stat points`}
              onChange={(e) => set(Number(e.target.value))}
              style={rangeStyle(v, 0, CATEGORY_POINT_MAX)}
              className="efb-range"
              data-autofocus={i === 0 ? "" : undefined}
              data-testid={`adjust-slider-${cat}`}
            />
          </div>
        );
      })}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {changed ? `${cats.map((c) => `${PROGRESSION_CATEGORY_LABELS[c]} ${state.allocation[c]}`).join(", ")} · ${result.overall} at ${state.position}` : ""}
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
 *  and a native range drawn as a 16 px track, showing the level in effect (a
 *  selected manager's rating). Moving it to a new value deselects the manager
 *  and forgets the remembered one (withManagerProficiency). Arrow / Home / End
 *  are native; PageUp / PageDown move by 5 (browsers disagree on their step).
 *  `steppers` (the phone dock's popover) adds 36 px round − / + buttons (44 px
 *  touch area, step 1) on either side of the slider, in the Tab order − slider
 *  +; at a bound a button is `aria-disabled`, so it keeps focus, and each
 *  press is announced. `autoFocus` marks the slider as the control a popover
 *  focuses on opening. */
export function ProficiencyControl({
  state,
  level,
  manager,
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
  /** The selected manager, resolved (its name in the announcement). */
  manager: PickerManagerDTO | null;
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
    const s = withManagerProficiency(state, value, level);
    if (s) onChange(s, { manager: "forget" });
    return s;
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "PageUp" && e.key !== "PageDown") return;
    e.preventDefault();
    set(level + (e.key === "PageUp" ? 5 : -5));
  };
  const step = (delta: 1 | -1) => {
    const s = set(level + delta);
    if (s) setStepped(`Manager proficiency ${s.managerProficiency}${manager ? `, ${manager.name} deselected` : ""}`);
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
 *  selected it shows the art, the name, the rating and the "+1" pills; while
 *  a linked or remembered manager waits for the picker list it says so. The
 *  panel's trigger and the phone dock popover's share it. Pointer over, focus
 *  or a press start loading the drawer's code (deferred.tsx).
 *  `wrap` (the compare slots, 138 px wide at 320): the text wraps at spaces
 *  instead of being cut with an ellipsis, the trigger grows in height, and the
 *  manager's picture is left out below 768 px (decorative; the name keeps the
 *  room). */
export function ManagerTrigger({
  manager,
  pending = false,
  onClick,
  testId,
  wrap = false,
}: {
  manager: PickerManagerDTO | null;
  pending?: boolean;
  onClick: () => void;
  testId: string;
  wrap?: boolean;
}) {
  const fit = wrap ? "break-words" : "truncate";
  const picture = wrap ? "max-md:hidden" : "";
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
      data-wrap={wrap ? "true" : undefined}
      className="efb-manager-trigger"
    >
      {manager ? (
        <>
          {manager.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={manager.imageUrl} alt="" width={32} height={32} loading="lazy" decoding="async" className={`size-8 shrink-0 rounded-full object-cover ${picture}`} />
          ) : (
            <UserRound className={`size-5 shrink-0 ${picture}`} aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-left">
            <span className={`block ${fit} text-white`}>
              <span className="sr-only">Select Manager — selected: </span>
              {manager.name} <span className="text-[var(--color-text-secondary)]">· {manager.rating}</span>
            </span>
            <span className={`block ${fit} text-xs`}>{pillText(manager)}</span>
          </span>
        </>
      ) : (
        <>
          <UserRoundCog className="size-5 shrink-0" aria-hidden />
          <span className={`min-w-0 flex-1 ${fit} text-left`}>{pending ? "Loading manager…" : "Select Manager"}</span>
        </>
      )}
    </button>
  );
}

/** Max Level of a Highlight card with a level cap of 1 (D5): "Max Level N",
 *  the note that the card's official max level is not listed, and a 1–80
 *  slider with − / + (step 1; `aria-disabled` at a bound). Lowering trims the
 *  last categories (withMaxLevel), announced by the panel. */
function HighlightMaxLevel({
  player,
  state,
  onChange,
  id,
  noteId,
  note,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  onChange: ProgressionChange;
  id: string;
  noteId: string;
  note: string;
}) {
  const ml = state.maxLevel;
  const set = (value: number) => {
    const r = withMaxLevel(state, player, value);
    if (r) onChange(r.state, { notice: r.notice });
  };
  const stepButton = (delta: 1 | -1) => {
    const atBound = delta > 0 ? ml >= HIGHLIGHT_MAX_LEVEL : ml <= 1;
    return (
      <button
        type="button"
        aria-label={`${delta > 0 ? "Increase" : "Decrease"} Max Level`}
        aria-disabled={atBound || undefined}
        onClick={() => {
          if (!atBound) set(ml + delta);
        }}
        className="efb-proficiency-step hit-44"
        data-testid={delta > 0 ? "progression-max-level-increase" : "progression-max-level-decrease"}
      >
        {delta > 0 ? <Plus className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      </button>
    );
  };
  return (
    <div className="min-w-0" data-testid="progression-max-level">
      <div className="efb-progression__row-head">
        <label htmlFor={id} className="efb-progression__label text-white">
          Max Level <span data-testid="progression-max-level-value">{ml}</span>
        </label>
      </div>
      <p id={noteId} className="efb-progression__level-note">
        {note}
      </p>
      <div className="efb-proficiency-steps">
        {stepButton(-1)}
        <input
          id={id}
          type="range"
          min={1}
          max={HIGHLIGHT_MAX_LEVEL}
          step={1}
          value={ml}
          aria-valuetext={`Max Level ${ml}, ${pts(trainingPointsAvailable(ml))} pts`}
          aria-describedby={noteId}
          onChange={(e) => set(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key !== "PageUp" && e.key !== "PageDown") return;
            e.preventDefault();
            set(ml + (e.key === "PageUp" ? 5 : -5));
          }}
          style={rangeStyle(ml, 1, HIGHLIGHT_MAX_LEVEL)}
          className="efb-range"
          data-testid="progression-max-level-slider"
        />
        {stepButton(1)}
      </div>
    </div>
  );
}

export function ProgressionPanel({
  player,
  state,
  result,
  refs,
  managerPending = false,
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
  refs: BuildRefs;
  /** A linked / remembered manager id waits for the picker list. */
  managerPending?: boolean;
  onChange: ProgressionChange;
  /** Static explanatory copy (build-notes.ts, from the server page). */
  notes: BuildNotes;
  /** Max Level notice of the last change (shown and announced). */
  notice?: BuildNotice | null;
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
  const mode = buildMode(player);
  const budget = trainingPointsAvailable(state.maxLevel);
  const remaining = result.remainingPoints;
  const mp = result.config.managerProficiency;
  const manager = refs.manager;
  const spend = canSpendPoints(mode, state);
  const [pickerOpen, setPickerOpen] = useState(false);

  const emit = (next: ProgressionState | null) => {
    if (next) onChange(next);
  };
  // Choosing a manager sets the level to its rating and remembers it;
  // choosing the selected one again (or Clear) deselects it, returns the
  // level to 90 and forgets it.
  const chooseManager = (m: PickerManagerDTO) => {
    setPickerOpen(false);
    const next = withManagerChoice(state, m);
    onChange(next, { manager: next.managerId ? "remember" : "forget" });
  };
  const clearManager = () => {
    setPickerOpen(false);
    onChange(withManagerCleared(state), { manager: "forget" });
  };

  const labelOf = (cat: TrainingCategory) => PROGRESSION_CATEGORY_LABELS[cat];
  const title = mode === "trending" ? "Build" : "Progression";

  return (
    <section
      aria-labelledby={ids.title}
      data-testid="progression-panel"
      data-mode={mode}
      className={embedded ? "efb-progression efb-progression--embedded" : "efb-progression efb-card"}
    >
      {/* Header: title + points, Max OVR, reset (32 px each) — the last three
          only while the build can spend points. */}
      <div className="efb-progression__header">
        <div className="min-w-0 flex-1">
          <h2 id={ids.title} className={embedded ? "sr-only" : "efb-progression__title"}>
            {title}
          </h2>
          {spend && (
            <p className="efb-progression__points" data-testid="progression-budget">
              <span data-testid="progression-used">{pts(result.pointsUsed)}</span>/{pts(budget)} pts
            </p>
          )}
        </div>
        {spend && (
          <>
            <button type="button" onClick={() => emit(withMaxOvr(state))} className="button button--sm button--primary shrink-0" data-testid="progression-max-ovr">
              Max OVR
            </button>
            <button type="button" onClick={() => emit(withReset(state))} aria-label="Reset" className="button button--sm button--ghost button--icon-only shrink-0" data-testid="progression-reset">
              <RotateCcw className="size-4" aria-hidden />
            </button>
          </>
        )}
        {notice ? (
          // Visible copy of the live region's notice (announced there), on
          // its own line under the points it explains — inside the header,
          // so it adds no flex gap: one line in the pinned card (which must
          // fit 1440 × 900 without an inner scrollbar), the full text in the
          // sheet.
          <p className="efb-progression__notice efb-progression__header-notice" aria-hidden data-testid="progression-notice">
            {embedded ? notice.text : notice.short}
          </p>
        ) : null}
      </div>
      {mode === "highlight" && (
        <HighlightMaxLevel player={player} state={state} onChange={onChange} id={ids.level} noteId={ids.levelNote} note={notes.highlightLevel} />
      )}

      {/* Select Manager: 48 px pill; the rating becomes the proficiency level,
          the pills get +1 after the boosters. */}
      <div className="min-w-0" data-testid="progression-manager">
        <ManagerTrigger manager={manager} pending={managerPending} onClick={() => setPickerOpen(true)} testId="progression-manager-button" />
        <DeferredManagerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selectedId={state.managerId} onChoose={chooseManager} onClear={clearManager} />
      </div>

      {/* Manager Proficiency (70–90, default 90). */}
      <ProficiencyControl state={state} level={mp} manager={manager} onChange={onChange} id={ids.mp} describedBy={ids.mpNote} />

      {/* Ten category rows (42 px): label button (hover / keyboard focus
          previews the category's stats in the stat grid, a press pins the
          highlight), next cost, − value +, 16 px track (0–25). */}
      {modeHasCategories(mode) && spend && (
        <div id={ids.cats} className="efb-progression__cats" role="group" aria-label="Training categories">
          {TRAINING_CATEGORIES.map((cat) => {
            const v = state.allocation[cat];
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
                {/* Track 0–25 (the most one category holds). Not a tab stop —
                    the spinbutton above carries the keyboard interaction and
                    the accessible name; a drag past what is affordable is
                    clamped to the largest affordable value. */}
                <input
                  type="range"
                  tabIndex={-1}
                  aria-hidden
                  min={0}
                  max={CATEGORY_POINT_MAX}
                  step={1}
                  value={Math.min(v, CATEGORY_POINT_MAX)}
                  onChange={(e) => emit(withCategory(state, cat, Number(e.target.value)))}
                  style={rangeStyle(v, 0, CATEGORY_POINT_MAX)}
                  className="efb-range"
                  data-testid={`progression-cat-${cat}-slider`}
                />
              </div>
            );
          })}
        </div>
      )}

      {embedded && <BuildSettings player={player} state={state} result={result} refs={refs} onChange={onChange} idBase={idBase} notes={notes} embedded />}

      {/* Live region: points left, the overall and any notice. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="progression-live">
        {spend ? `${pts(remaining)} pts left · ` : ""}
        {result.overall} at {state.position} · proficiency {mp}
        {manager ? ` · ${manager.name}` : ""}
        {notice ? ` · ${notice.text}` : ""}
      </p>
    </section>
  );
}

/** Stats in the stat grid's order (Attacking, Defending, Strength). */
const BREAKDOWN_ORDER: readonly BaseStat[] = [...ATTACKING_STATS, ...DEFENDING_STATS, ...STRENGTH_STATS];
const signedPart = (v: number): string => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

/** "Stat breakdown" (D6): one row per stat (26) with its base, training, the
 *  part cut at 99, the proficiency bonus, the boosters, the manager's +1 and
 *  the shown value — reachable by mouse, keyboard and touch inside "About
 *  this build" (the stat rows carry no `title`, the Adjust popover holds the
 *  controls only). Short visible column heads, full names for screen
 *  readers; the table scrolls inside its own box when the card is narrow. */
function StatBreakdownTable({ result }: { result: BuildResult }) {
  const rows = statBreakdown(result);
  const cols: Array<[keyof Omit<ReturnType<typeof statBreakdown>[BaseStat], "stat">, string, string]> = [
    ["base", "Base", "Base"],
    ["training", "Trn", "Training"],
    ["cut", "Cut", "Cut at 99"],
    ["proficiency", "Prof", "Proficiency bonus"],
    ["boosters", "Bst", "Boosters"],
    ["manager", "Mgr", "Manager"],
    ["shown", "Shown", "Shown value"],
  ];
  const captionId = useId();
  return (
    <div className="efb-breakdown" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className="efb-breakdown__table" data-testid="stat-breakdown">
        <caption id={captionId} className="efb-breakdown__caption">
          Stat breakdown
        </caption>
        <thead>
          <tr>
            <th scope="col">Stat</th>
            {cols.map(([key, short, full]) => (
              <th key={key} scope="col">
                <span aria-hidden>{short}</span>
                <span className="sr-only">{full}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BREAKDOWN_ORDER.map((stat) => {
            const r = rows[stat];
            return (
              <tr key={stat} data-stat={stat}>
                <th scope="row">{statLabel(stat)}</th>
                {cols.map(([key]) => {
                  const v = r[key];
                  const plain = key === "base" || key === "shown";
                  return (
                    <td key={key} data-zero={!plain && v === 0 ? "true" : undefined} data-part={key}>
                      {plain ? v : signedPart(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Build settings": Max Level (a card with a level cap above 1) + Position,
 *  the overall at the position and the explanatory notes and the Stat
 *  breakdown behind "About this build". From lg a non-sticky card at the end
 *  of the left column, below the pinned Progression card's travel; inside
 *  the sheet it follows the categories (`embedded`). */
export function BuildSettings({
  player,
  state,
  result,
  refs,
  onChange,
  idBase,
  notes,
  embedded = false,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  result: BuildResult;
  refs: BuildRefs;
  onChange: ProgressionChange;
  idBase: string;
  /** Static explanatory copy (build-notes.ts, passed down from the server page). */
  notes: BuildNotes;
  embedded?: boolean;
}) {
  const ids = progressionIds(idBase);
  const mode = buildMode(player);
  const capped = mode === "capped";
  const levelCap = Math.max(1, player.levelCap);
  const budget = trainingPointsAvailable(state.maxLevel);
  const proficiency = result.proficiency;
  const mp = result.config.managerProficiency;
  const manager = refs.manager;
  const customBuild = useMemo(() => isCustomBuild(state, player), [state, player]);

  // Max Level (level cap above 1) is edited through a draft string: typing
  // never commits (a half-typed "2" of "25" must not clamp the level and trim
  // the allocation); the draft is committed and clamped on blur / Enter,
  // while the spinner and the arrow keys commit immediately. A committed
  // level that can no longer afford the current spend removes points from
  // the last categories (withMaxLevel), with a notice the panel shows and
  // announces.
  const [levelDraft, setLevelDraft] = useState<string | null>(null);
  const commitMaxLevel = (raw: string) => {
    setLevelDraft(null);
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? NaN : Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const r = withMaxLevel(state, player, parsed);
    if (r) onChange(r.state, { notice: r.notice });
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
  const positionField = (
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
  );

  const body = (
    <>
      {/* Max Level (level cap above 1) + Position, then the overall there. */}
      {capped ? (
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
              Applied when you leave the field or press Enter; points the new level cannot afford are removed from the last categories.
            </span>
          </div>
          {positionField}
        </div>
      ) : (
        positionField
      )}
      <div className="efb-progression__estimate" data-testid="progression-estimate">
        <div className="min-w-0">
          <div className="text-sm text-[var(--color-text-secondary)]">
            OVR at {state.position} · {PROFICIENCY_LABELS[proficiency]}
          </div>
          <div className="text-xs text-[var(--color-text-dim)]">
            {customBuild ? "Custom build" : capped ? "Max-OVR build" : "Opening build"} · {manager ? `${manager.name} (${mp})` : `proficiency ${mp}`}
          </div>
        </div>
        <div className="efb-progression__overall" data-testid="progression-overall">
          {result.overall}
        </div>
      </div>

      {/* Explanatory notes, limits and the Stat breakdown behind a disclosure. */}
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
          <p>{mode === "trending" ? notes.trendingBuild : customBuild ? notes.customBuild : notes.openingBuild}</p>
          {modeHasCategories(mode) && (
            <>
              <p>{notes.costRule}</p>
              {/* The stats, spent and next cost of every category in one list
                  (the rows show "next N" visibly; the spinbutton's value text
                  says both; the label describes its stats to screen readers). */}
              <dl className="efb-progression__costs" aria-label="Stats, points spent and next stat point cost per category">
                {TRAINING_CATEGORIES.map((cat) => (
                  <div key={cat} className="contents">
                    <dt>{labelOf(cat)}</dt>
                    <dd>
                      spent {pts(categoryCost(state.allocation[cat]))} · next {pts(nextStatPointCost(state.allocation[cat]))} pts
                    </dd>
                    <dd className="efb-progression__cost-stats">{categoryStatsText(cat)}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Max OVR picks the allocation with the highest weighted stat sum of the formula at {state.position} for the {pts(budget)}-point budget, {notes.maxOvrRest}
              </p>
            </>
          )}
          <StatBreakdownTable result={result} />
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
 *  and a 366 × 50 bar above the tab bar.
 *   - The strip lists the categories holding points; each item opens that
 *     category's Adjust popover (the same content as a stat row's, placed
 *     above the strip; a bottom sheet below 640 px when taller than half the
 *     viewport). With no point spent it is one button that opens the sheet.
 *   - The proficiency chip and the manager avatar toggle one small NON-MODAL
 *     popover (the shared PopoverPanel) above the strip: "Select Manager"
 *     and the Manager Proficiency control with 36 px − / + buttons. Escape or
 *     a tap outside closes it and focus returns to the chip / avatar.
 *   - The points (remaining/total, the reference's phone pill: "60/60" for a
 *     build without points, "0/60" for a full one) and the "Progression"
 *     button open the bottom sheet with the full panel (`onOpen`; the parent
 *     scrolls it to the category rows).
 *   - Reset and Max OVR act at once through the same helpers as the panel.
 *  A card whose build cannot spend points (a Trending card, a Highlight card
 *  with a level cap of 1 at Max Level 1) has no strip, points, Reset or Max
 *  OVR here. Changes made here are announced. */
export function ProgressionDock({
  player,
  state,
  result,
  refs,
  managerPending = false,
  onChange,
  onOpen,
  onOpenIntent,
  expanded,
  renderAdjust,
  onAdjust,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  result: BuildResult;
  refs: BuildRefs;
  managerPending?: boolean;
  onChange: ProgressionChange;
  onOpen: () => void;
  /** Pointer over / focus on / a press of a control that opens the sheet
   *  (the parent starts loading the sheet's code, deferred.tsx). */
  onOpenIntent?: () => void;
  /** Whether the sheet the dock opens is open. */
  expanded: boolean;
  /** The Adjust popover's content for a strip item. */
  renderAdjust: (cat: TrainingCategory, headingId: string) => ReactNode;
  /** Reports the open strip popover's category (its stats are highlighted). */
  onAdjust: (owner: string, cats: readonly TrainingCategory[] | null) => void;
}) {
  const mode = buildMode(player);
  const spend = canSpendPoints(mode, state);
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
  const manager = refs.manager;
  const uid = useId().replace(/:/g, "");
  // Manager / proficiency popover and the manager drawer it opens (loaded on
  // its first opening, deferred.tsx).
  const popId = `dock-pop-${uid}`;
  const stripRef = useRef<HTMLDivElement>(null);
  const popTriggerRef = useRef<HTMLElement | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The strip item whose Adjust popover is open.
  const [openCat, setOpenCat] = useState<TrainingCategory | null>(null);
  const setCatOpen = (cat: TrainingCategory, open: boolean) => {
    setOpenCat((cur) => (open ? cat : cur === cat ? null : cur));
    onAdjust(`dock:${cat}`, open ? [cat] : null);
  };
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
  const spent = TRAINING_CATEGORIES.filter((c) => state.allocation[c] > 0);
  const act = (next: ProgressionState, text: string, meta?: Parameters<ProgressionChange>[1]) => {
    onChange(next, meta);
    setAnnounce({ text, state: next });
  };
  const usedAfter = (next: ProgressionState) => pts(allocationCost(next.allocation));
  const leftAfter = (next: ProgressionState) => pts(trainingPointsAvailable(next.maxLevel) - allocationCost(next.allocation));
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
    act(next, next.managerId ? `${m.name} selected: Manager Proficiency ${next.managerProficiency}` : `${m.name} deselected: Manager Proficiency ${next.managerProficiency}`, {
      manager: next.managerId ? "remember" : "forget",
    });
  };
  const clearManager = () => {
    setPickerOpen(false);
    const next = withManagerCleared(state);
    act(next, `Manager cleared: Manager Proficiency ${next.managerProficiency}`, { manager: "forget" });
  };
  // A strip item that leaves the strip (its category emptied) closes its popover.
  const spentKey = spent.join(",");
  useEffect(() => {
    if (openCat && !spentKey.split(",").includes(openCat)) {
      setOpenCat(null);
      onAdjust(`dock:${openCat}`, null);
    }
  }, [spentKey, openCat, onAdjust]);

  return (
    <div className="efb-dock-wrap lg:hidden" data-progression-dock="">
      {spend && (
        // data-floating-floor: no popover or tooltip covers the strip or the
        // dock (floating.ts `chromeFloor`, browser QA 2026-10-25 W3).
        <div ref={stripRef} className="efb-dock-strip" data-testid="dock-strip" data-floating-floor="" role="group" aria-label="Training categories of the current build">
          {spent.length > 0 ? (
            <span className="efb-dock-strip__items">
              {spent.map((c) => {
                const Icon = CATEGORY_ICON[c];
                const suffix = CATEGORY_SUFFIX[c];
                const headingId = `dock-adjust-${uid}-${c}`;
                return (
                  <Popover
                    key={c}
                    open={openCat === c}
                    onOpenChange={(o) => setCatOpen(c, o)}
                    labelledBy={headingId}
                    side="top"
                    sheetBelow={640}
                    className="efb-adjust-popover efb-adjust-popover--strip"
                    data-testid="dock-adjust"
                    trigger={(tp) => (
                      <button
                        {...tp}
                        type="button"
                        aria-label={`Adjust ${PROGRESSION_CATEGORY_LABELS[c]}: ${state.allocation[c]}`}
                        className="efb-dock-strip__item hit-44"
                        data-testid={`dock-strip-${c}`}
                      >
                        <Icon className="size-3.5 shrink-0" aria-hidden />
                        {suffix && (
                          <span className="efb-category-strip__sub" aria-hidden>
                            {suffix}
                          </span>
                        )}
                        <span aria-hidden>{state.allocation[c]}</span>
                      </button>
                    )}
                  >
                    {renderAdjust(c, headingId)}
                  </Popover>
                );
              })}
            </span>
          ) : (
            <button type="button" {...opensSheet} className="efb-dock-strip__empty hit-44" aria-label="No stat points spent — open Progression">
              No stat points spent
            </button>
          )}
        </div>
      )}

      <div className="efb-dock" data-floating-floor="" role="group" aria-label={mode === "trending" ? "Build" : "Progression"}>
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
        {spend && (
          <span className="efb-dock__points">
            <button
              type="button"
              {...opensSheet}
              className="efb-dock__points-value hit-44"
              aria-label={`${pts(result.remainingPoints)} of ${pts(budget)} pts left — open Progression`}
              data-testid="dock-points"
            >
              {pts(result.remainingPoints)}/{pts(budget)}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = withReset(state);
                act(next, `Reset: ${leftAfter(next)}/${pts(budget)} pts left`);
              }}
              className="efb-dock__reset hit-44"
              aria-label="Reset"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
          </span>
        )}
        <span className="min-w-0 flex-1" aria-hidden />
        {spend && (
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
        )}
        <button type="button" {...opensSheet} className="button button--sm button--ghost button--icon-only shrink-0" aria-label={mode === "trending" ? "Build settings" : "Progression"} data-testid="dock-open-sheet">
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
        anchorRef={spend ? stripRef : popTriggerRef}
        side="top"
        matchWidth={spend}
        label="Manager and proficiency"
        className="efb-dock-popover"
        data-testid="dock-popover"
      >
        <div className="efb-dock-popover__body">
          <ManagerTrigger manager={manager} pending={managerPending} onClick={openPicker} testId="dock-manager-button" />
          <ProficiencyControl state={state} level={mp} manager={manager} onChange={onChange} id={`${popId}-mp`} steppers autoFocus testIds={DOCK_PROFICIENCY_TESTIDS} />
        </div>
      </PopoverPanel>
      <DeferredManagerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selectedId={state.managerId} onChoose={chooseManager} onClear={clearManager} />
      {/* The overall comes from the parent's result after the change. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announce && announce.state === state ? `${announce.text} · ${result.overall} at ${state.position}` : ""}
      </p>
    </div>
  );
}
