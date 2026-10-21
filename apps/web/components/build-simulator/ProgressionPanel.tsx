"use client";
import { useId, useMemo, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from "react";
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
import { statLabel } from "@/lib/card-display";
import { ManagerPicker } from "@/components/build-simulator/ManagerPicker";
import { CATEGORY_ICON, CATEGORY_SUFFIX } from "@/components/detail/StatGrid";
import { ChevronDown, Minus, Plus, RotateCcw, SlidersHorizontal, UserRound, UserRoundCog } from "lucide-react";

// Progression sheet of the player detail page (player-progression-simulator;
// exact model since efootbase-exact-model-managers; layout of change
// efootbase-ui-redesign, measured on the reference capture of 2026-10-20).
// The parent (PlayerDetailClient) owns the state — it feeds the projected
// stats into the stat grid, the card face and the Pitch Map — and runs the
// shared engine; this file renders the controls:
//   ProgressionPanel  the card: header (title, "used/total pts", Max OVR,
//                     reset icon), "Select Manager", Manager Proficiency
//                     (70–90), ten 42 px category rows (label button, − n +,
//                     16 px track), Max Level + Position, the overall at the
//                     position, and the explanatory notes behind a
//                     disclosure. Sticky in the left column from lg; below lg
//                     the same component runs inside the bottom sheet
//                     (`embedded`).
//   ProgressionDock   below lg: a floating category strip and a 366 × 50 dock
//                     above the tab bar (proficiency, manager, points + reset,
//                     Max OVR, Progression) that opens the sheet.
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

type BoosterSlotInfo = { label: string; deltas: Array<[BaseStat, number]>; usable: boolean };
type BoosterPlayer = Pick<PlayerCardDTO, "boosterId1" | "boosterId2" | "booster1" | "booster2">;
type DefaultsPlayer = Pick<PlayerCardDTO, "levelCap" | "registeredPosition"> & BoosterPlayer;

/** Booster slot: resolved name + sparse deltas, or the reason it is unusable.
 *  A booster whose stat vector is empty (e.g. the seeded "Booster +1" rows
 *  with no stat data) is as unusable as an unknown id: there is nothing to
 *  toggle, so it never gets an ON/OFF control. */
export function boosterSummary(player: BoosterPlayer, slot: 0 | 1): BoosterSlotInfo {
  const id = slot === 0 ? player.boosterId1 : player.boosterId2;
  const b = slot === 0 ? player.booster1 : player.booster2;
  if (b) {
    const deltas = (Object.entries(b.stats) as Array<[BaseStat, number]>).filter(([, v]) => typeof v === "number" && v !== 0);
    if (deltas.length === 0) return { label: `${b.name} (no stat data)`, deltas: [], usable: false };
    return { label: b.name, deltas, usable: true };
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

/** Points in the displayed (whole-point) unit. */
const pts = (v: number): string => String(toDisplayPoints(v));

const pillText = (m: PickerManagerDTO): string => m.pills.map((p) => `+1 ${statLabel(p)}`).join(", ");

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

/** Limits of the model (spec "Honest Limits"); the population figures are
 *  the read-only check of change efootbase-exact-model-managers (the
 *  max-level overall is the dump's `overall_at_max_level`; the max-level
 *  stats are the cross-fill dataset's — named in docs, never in public copy,
 *  spec "Branding In Public UI"). */
export const LIMITS_NOTE =
  "Stats, height and weak-foot accuracy come from the database dump. Cards other than the five measured ones were checked in bulk only: the formula equals the dump's overall on 99.9 % of the 40,516 cards without progression; fed a second public dataset's max-level stats, it equals the dump's max-level overall on 95.1 % of 9,843 cards (within 1 on 98.4 %). Base + training + bonus stops at 99 before the boosters, by the source model's rule (no measured reading reaches it): stat points bought past 99 are not counted (a stat's tooltip shows the part cut). Not modelled: Position Training, In-Match Roles and manager tactics.";

/** Track fill of a range input as a CSS variable (0..1 of its min..max), read
 *  by `.efb-range` (the fill ends at the thumb's far edge). */
const rangeStyle = (value: number, min: number, max: number): CSSProperties =>
  ({ "--range-p": max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0 }) as CSSProperties;

export function ProgressionPanel({
  player,
  state,
  result,
  onChange,
  highlight = null,
  onHighlight,
  embedded = false,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  result: BuildResult;
  onChange: (next: ProgressionState) => void;
  /** Category whose stats the stat grid highlights; the label buttons toggle it. */
  highlight?: TrainingCategory | null;
  onHighlight?: (next: TrainingCategory | null) => void;
  /** Rendered inside the mobile bottom sheet: no card chrome, the sheet's
   *  title replaces the visible heading. */
  embedded?: boolean;
}) {
  const uid = useId();
  const levelCap = Math.max(1, player.levelCap);
  const budget = trainingPointsAvailable(state.maxLevel);
  const remaining = result.remainingPoints;
  const proficiency = result.proficiency;
  const mp = result.config.managerProficiency;
  const manager = state.manager;
  const [pickerOpen, setPickerOpen] = useState(false);
  const customBuild = useMemo(() => isCustomBuild(state, defaultProgressionState(player), player), [state, player]);
  /** Fixed scale of the category tracks: the most stat points one category
   *  can hold with the whole budget, so every track reads on the same scale. */
  const trackMax = maxGainForBudget(budget);

  // Max Level is edited through a draft string: typing never commits (a
  // half-typed "2" of "25" must not clamp the level and wipe the allocation);
  // the draft is committed and clamped on blur / Enter, while the spinner and
  // the arrow keys commit immediately. `notice` is announced through the live
  // region (and shown in amber) when a committed level can no longer afford
  // the current spend.
  const [levelDraft, setLevelDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emit = (next: ProgressionState, msg: string | null = null) => {
    setNotice(msg);
    onChange(next);
  };
  const setAllocation = (trainingPoints: TrainingAllocation) => emit({ ...state, trainingPoints });
  const setCategory = (cat: TrainingCategory, value: number) => {
    const cur = state.trainingPoints[cat];
    const next = Math.max(0, Math.floor(value));
    if (next === cur) return;
    const others = allocationCost({ ...state.trainingPoints, [cat]: 0 });
    // Never exceed the budget: clamp an increase to what is still affordable.
    const affordable = maxGainForBudget(budget - others);
    setAllocation({ ...state.trainingPoints, [cat]: Math.min(next, Math.max(cur, affordable)) });
  };
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
    emit(
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
  const maxOvr = () => emit(withMaxOvr(state));
  // Reset clears the training only; the proficiency level and the manager stay.
  const reset = () => emit(withReset(state));
  // Moving the slider (to a new value) deselects the manager.
  const setManagerProficiency = (value: number) => {
    const managerProficiency = clampManagerProficiency(value);
    if (managerProficiency !== state.managerProficiency) emit({ ...state, managerProficiency, manager: null });
  };
  // Choosing a manager sets the level to its rating; choosing the selected
  // one again deselects it and leaves the level where it is.
  const chooseManager = (m: PickerManagerDTO) => {
    setPickerOpen(false);
    if (manager?.id === m.id) emit({ ...state, manager: null });
    else emit({ ...state, manager: m, managerProficiency: clampManagerProficiency(m.rating) });
  };
  // Arrow / Home / End are native to the range input; PageUp / PageDown move
  // by 5 here (browsers disagree on their native step).
  const onProficiencyKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "PageUp" && e.key !== "PageDown") return;
    e.preventDefault();
    setManagerProficiency(state.managerProficiency + (e.key === "PageUp" ? 5 : -5));
  };

  const onStepperKey = (cat: TrainingCategory) => (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = state.trainingPoints[cat];
    const others = allocationCost({ ...state.trainingPoints, [cat]: 0 });
    const max = maxGainForBudget(budget - others);
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "+") next = cur + 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "-") next = cur - 1;
    else if (e.key === "PageUp") next = cur + 4;
    else if (e.key === "PageDown") next = cur - 4;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = max;
    if (next === null) return;
    e.preventDefault();
    setCategory(cat, Math.min(Math.max(0, next), max));
  };

  const labelOf = (cat: TrainingCategory) => PROGRESSION_CATEGORY_LABELS[cat];

  return (
    <section
      aria-labelledby={`${uid}-title`}
      data-testid="progression-panel"
      className={embedded ? "efb-progression efb-progression--embedded" : "efb-progression efb-card"}
    >
      {/* Header: title + points, Max OVR, reset (32 px each). */}
      <div className="efb-progression__header">
        <div className="min-w-0 flex-1">
          <h2 id={`${uid}-title`} className={embedded ? "sr-only" : "efb-progression__title"}>
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
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setPickerOpen(true)}
          data-testid="progression-manager-button"
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
        <ManagerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selectedId={manager?.id ?? null} onChoose={chooseManager} />
      </div>

      {/* Manager Proficiency (70–90, default 90). */}
      <div className="min-w-0" data-testid="progression-proficiency">
        <div className="efb-progression__row-head">
          <label htmlFor={`${uid}-mp`} className="efb-progression__label text-[var(--color-text-secondary)]">
            Manager Proficiency
          </label>
          <output htmlFor={`${uid}-mp`} className="efb-progression__proficiency-value" data-testid="progression-proficiency-value">
            {mp}
          </output>
        </div>
        <input
          id={`${uid}-mp`}
          type="range"
          min={MANAGER_PROFICIENCY_MIN}
          max={MANAGER_PROFICIENCY_MAX}
          step={1}
          value={mp}
          aria-label="Manager proficiency"
          aria-valuetext={`Manager proficiency ${mp}`}
          aria-describedby={`${uid}-mp-note`}
          onChange={(e) => setManagerProficiency(Number(e.target.value))}
          onKeyDown={onProficiencyKey}
          style={rangeStyle(mp, MANAGER_PROFICIENCY_MIN, MANAGER_PROFICIENCY_MAX)}
          className="efb-range efb-range--proficiency"
          data-testid="progression-proficiency-slider"
        />
      </div>

      {/* Ten category rows (42 px): label button (highlights the category's
          stats in the stat grid), − value +, 16 px track. */}
      <div className="efb-progression__cats" role="group" aria-label="Training categories">
        {TRAINING_CATEGORIES.map((cat) => {
          const v = state.trainingPoints[cat];
          const next = nextStatPointCost(v);
          const others = allocationCost({ ...state.trainingPoints, [cat]: 0 });
          const max = maxGainForBudget(budget - others);
          const canInc = next <= remaining + 1e-9;
          const statsText = TRAINING_STATS[cat].map((s) => statLabel(s)).join(", ");
          const costText = `${pts(categoryCost(v))} pts spent, next costs ${pts(next)}`;
          const hit = highlight === cat;
          return (
            <div key={cat} className="efb-progression-row" data-active={v > 0 ? "true" : undefined} data-testid={`progression-cat-${cat}`}>
              <div className="efb-progression__row-head">
                <button
                  type="button"
                  id={`${uid}-cat-${cat}-label`}
                  aria-pressed={hit}
                  onClick={() => onHighlight?.(hit ? null : cat)}
                  title={`${statsText} · ${costText} — click to highlight these stats`}
                  className="efb-progression-row__label hit-44"
                  data-testid={`progression-cat-${cat}-label`}
                >
                  {labelOf(cat)}
                </button>
                {/* Visible next cost (spec "Cost Curve"), compact so the row
                    keeps its 42 px; aria-hidden because the spinbutton's
                    value text already says "next costs N". */}
                <span className="efb-progression-row__next" aria-hidden data-next-cost={pts(next)}>
                  next {pts(next)}
                </span>
                <div className="efb-stepper">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Decrease ${labelOf(cat)}`}
                    disabled={v === 0}
                    onClick={() => setCategory(cat, v - 1)}
                    className="efb-stepper__button hit-44"
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                  <div
                    role="spinbutton"
                    tabIndex={0}
                    aria-labelledby={`${uid}-cat-${cat}-label`}
                    aria-valuenow={v}
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuetext={`${v} stat points, ${costText}`}
                    title={costText}
                    onKeyDown={onStepperKey(cat)}
                    className="efb-stepper__value"
                  >
                    {v}
                  </div>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Increase ${labelOf(cat)}`}
                    title={`Next stat point costs ${pts(next)} pts`}
                    disabled={!canInc}
                    onClick={() => setCategory(cat, v + 1)}
                    className="efb-stepper__button hit-44"
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                </div>
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
                onChange={(e) => setCategory(cat, Number(e.target.value))}
                style={rangeStyle(v, 0, Math.max(trackMax, v))}
                className="efb-range"
                data-testid={`progression-cat-${cat}-slider`}
              />
            </div>
          );
        })}
      </div>

      {/* Compact controls: Max Level + Position, then the overall there. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <label htmlFor={`${uid}-level`} className="efb-progression__field-label">
            Max Level <span className="text-[var(--color-text-dim)]">(1–{levelCap})</span>
          </label>
          <input
            id={`${uid}-level`}
            type="number"
            inputMode="numeric"
            min={1}
            max={levelCap}
            step={1}
            value={levelDraft ?? String(state.maxLevel)}
            onChange={onLevelInput}
            onKeyDown={onLevelKey}
            onBlur={(e) => commitMaxLevel(e.currentTarget.value)}
            aria-describedby={`${uid}-level-hint`}
            className="field field--sm mt-1 tabular-nums"
          />
          <span id={`${uid}-level-hint`} className="sr-only">
            Applied when you leave the field or press Enter; an allocation the new level cannot afford is reset.
          </span>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-position`} className="efb-progression__field-label">
            Position
          </label>
          <span className="efb-progression__select mt-1">
            <select id={`${uid}-position`} value={state.position} onChange={(e) => emit({ ...state, position: e.target.value as Position })} className="field field--sm">
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

      {/* Live region: points left, the overall and any reset notice. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="progression-live">
        {pts(remaining)} pts left · {result.overall} at {state.position} · proficiency {mp}
        {manager ? ` · ${manager.name}` : ""}
        {notice ? ` · ${notice}` : ""}
      </p>

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
          <p id={`${uid}-mp-note`} data-testid="progression-proficiency-note">
            {proficiencyNote(mp)}
            {manager ? " Moving the slider deselects the manager." : ""}
          </p>
          <p>
            {customBuild
              ? "Custom build: it differs from the opening Max-OVR build (level, position, proficiency, manager, a booster or a category). Max OVR restores the optimal allocation; Reset zeroes every category."
              : "Opening build: the Max-OVR allocation at the registered position with every usable booster on, Manager Proficiency 90 and no manager."}
          </p>
          <p>Two points per level above 1 · the nth stat point of a category costs ⌈n / 4⌉ points (the first four cost 1 each).</p>
          {/* Spent and next cost of every category in one list (the rows
              show "next N" visibly and carry both in their title and the
              spinbutton's value text). */}
          <dl className="efb-progression__costs" aria-label="Points spent and next stat point cost per category">
            {TRAINING_CATEGORIES.map((cat) => (
              <div key={cat} className="contents">
                <dt>{labelOf(cat)}</dt>
                <dd>
                  spent {pts(categoryCost(state.trainingPoints[cat]))} · next {pts(nextStatPointCost(state.trainingPoints[cat]))} pts
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Max OVR picks the allocation with the highest weighted stat sum of the formula at {state.position} for the {pts(budget)}-point budget, before the Manager Proficiency
            bonus and the cut at 99, so it is the same build at every proficiency and with any manager (as in every measured Max build); a hand-made build can read up to 1
            higher, or up to 2 when the preset trains a stat past 99 (those points are not counted). Reset zeroes every category and keeps the proficiency and the manager.
            Jumping rises with Aerial Strength and with Goalkeeper 1 alike. Boosters are toggled in the Overview card.
          </p>
          <p className="text-[var(--color-text-dim)]" data-testid="progression-limits">
            {LIMITS_NOTE}
          </p>
        </div>
      </details>
    </section>
  );
}

/** Mobile (< lg) dock of the Progression panel: a floating category strip
 *  and a 366 × 50 bar above the tab bar. The strip, the proficiency chip, the
 *  manager avatar, the points and the "Progression" button open the bottom
 *  sheet (`onOpen`, which holds the full panel); Reset and Max OVR act at
 *  once through the same helpers as the panel and announce the result. */
export function ProgressionDock({
  state,
  result,
  onChange,
  onOpen,
}: {
  state: ProgressionState;
  result: BuildResult;
  onChange: (next: ProgressionState) => void;
  onOpen: () => void;
}) {
  const budget = trainingPointsAvailable(state.maxLevel);
  const mp = result.config.managerProficiency;
  const manager = state.manager;
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

  return (
    <div className="efb-dock-wrap lg:hidden" data-progression-dock="">
      <button type="button" onClick={onOpen} className="efb-dock-strip hit-44" aria-label={stripName}>
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
        <button type="button" onClick={onOpen} className="efb-dock__proficiency hit-44" aria-label={`Manager Proficiency ${mp} — open Progression`}>
          {mp}
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="efb-dock__manager hit-44"
          aria-label={manager ? `Manager ${manager.name}, rating ${manager.rating} — open Progression` : "No manager selected — open Progression"}
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
          <button type="button" onClick={onOpen} className="efb-dock__points-value hit-44" aria-label={`${pts(result.pointsUsed)} of ${pts(budget)} pts used — open Progression`}>
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
        <button type="button" onClick={onOpen} className="button button--sm button--ghost button--icon-only shrink-0" aria-label="Progression" title="Open Progression">
          <SlidersHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      {/* The overall comes from the parent's result after the change. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announce && announce.state === state ? `${announce.text} · ${result.overall} at ${state.position}` : ""}
      </p>
    </div>
  );
}
