"use client";
import { useId, useState, type ChangeEvent, type KeyboardEvent } from "react";
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
import { RotateCcw, Sparkles, UserRound } from "lucide-react";

// Progression sheet of the player detail page (player-progression-simulator,
// efootbase's exact model since efootbase-exact-model-managers). The parent
// owns the state (it feeds the projected stats into the stat grid, the card
// face and the Pitch Map) and runs the shared engine; this component renders
// the controls: Max Level, position, Manager Proficiency (70–90, efootbase's
// slider), "Select Manager", ten category rows (label button, − n +, slider)
// with the next cost, "used/total pts", Booster 1 / 2 toggles, Max OVR and
// Reset. Points are printed in efootbase's whole-point unit (toDisplayPoints:
// twice the engine's training points). Rules: packages/shared/src/progression.ts.

/** Readings the formula was checked against (change
 *  efootbase-exact-model-managers, docs/efootbase-exact-model.md): every
 *  overall efootbase displayed in the survey of five cards. */
export const EXACT_MODEL_READINGS = 793;

export interface ProgressionState {
  maxLevel: number;
  position: Position;
  trainingPoints: TrainingAllocation;
  boosters: [boolean, boolean];
  /** Manager Proficiency level 70–90 (default 90, efootbase's default; the
   *  selected manager's rating while a manager is selected). */
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

/** Opening state of a card, as efootbase opens its sheet: the card's level
 *  cap, its registered position, the Max-OVR allocation for that budget,
 *  every usable booster on (a slot without stat data stays off — there is
 *  nothing to apply), Manager Proficiency 90 and no manager. */
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

/** Points in the displayed (whole-point) unit. */
const pts = (v: number): string => String(toDisplayPoints(v));

const pillText = (m: PickerManagerDTO): string => m.pills.map((p) => `+1 ${statLabel(p)}`).join(", ");

/** The label next to the overall (spec "Honest Estimate Label"): the setting
 *  in effect (proficiency level, or the selected manager) and what the figure
 *  is. */
export function overallLabel(level: number, manager: PickerManagerDTO | null): string {
  const setting = manager
    ? `Manager ${manager.name} (rating ${manager.rating}: proficiency ${level}, ${pillText(manager)} after the boosters)`
    : `Manager Proficiency ${level}, no manager selected`;
  return `${setting}. Computed with efootbase's own overall formula, which reproduced all ${EXACT_MODEL_READINGS} overall readings taken from efootbase on five cards.`;
}

/** What the Manager Proficiency control does at `level`. */
export function proficiencyNote(level: number): string {
  const bands = PROFICIENCY_BANDS[level] ?? [];
  if (bands.length === 0) return `At ${level} no stat gains a proficiency bonus (levels ${MANAGER_PROFICIENCY_MIN}–76).`;
  const top = Math.max(...bands.map((b) => b.bonus));
  return `At ${level} a stat of ${bands[0]!.min} or more gains 1 to ${top} after training, by the level's band table, never past 99; boosters and a manager's +1 come after it.`;
}

/** Limits of the model (spec "Honest Limits"); the population figures are
 *  the read-only check of change efootbase-exact-model-managers. */
export const LIMITS_NOTE =
  "Stats, height and weak-foot accuracy come from the database dump. Cards other than the five measured ones were checked in bulk only: the formula equals the dump's overall on 99.9 % of the 40,516 cards without progression; fed the eFHUB max-level stats, it equals efootbase's max-level overall on 95.1 % of 9,843 cards (within 1 on 98.4 %). As on efootbase's sheet, base + training + bonus stops at 99 before the boosters: stat points bought past 99 are not counted (a stat's tooltip shows the part cut). Not modelled: Position Training, In-Match Roles and manager tactics.";

export function ProgressionPanel({
  player,
  state,
  result,
  onChange,
  highlight = null,
  onHighlight,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  result: BuildResult;
  onChange: (next: ProgressionState) => void;
  /** Category whose stats the stat grid highlights; the label buttons toggle it. */
  highlight?: TrainingCategory | null;
  onHighlight?: (next: TrainingCategory | null) => void;
}) {
  const uid = useId();
  const levelCap = Math.max(1, player.levelCap);
  const budget = trainingPointsAvailable(state.maxLevel);
  const remaining = result.remainingPoints;
  const proficiency = result.proficiency;
  const mp = result.config.managerProficiency;
  const manager = state.manager;
  const [pickerOpen, setPickerOpen] = useState(false);

  // Max Level is edited through a draft string: typing never commits (a
  // half-typed "2" of "25" must not clamp the level and wipe the allocation);
  // the draft is committed and clamped on blur / Enter, while the spinner and
  // the arrow keys commit immediately. `notice` is announced through the live
  // region when a committed level can no longer afford the current spend.
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
      setLevelDraft(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const draft = levelDraft?.trim() ?? "";
      const from = draft !== "" && Number.isFinite(Number(draft)) ? Math.floor(Number(draft)) : state.maxLevel;
      commitMaxLevel(String(from + (e.key === "ArrowUp" ? 1 : -1)));
    }
  };
  const toggleBooster = (slot: 0 | 1) => {
    const boosters: [boolean, boolean] = [state.boosters[0], state.boosters[1]];
    boosters[slot] = !boosters[slot];
    emit({ ...state, boosters });
  };
  const maxOvr = () => setAllocation(bestAllocation(state.position, budget));
  // Reset clears the training only; the proficiency level and the manager stay.
  const reset = () => setAllocation(emptyAllocation());
  // Moving the slider (to a new value) deselects the manager, as on efootbase.
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

  const boosterSlots: Array<0 | 1> = [0, 1];
  const labelOf = (cat: TrainingCategory) => PROGRESSION_CATEGORY_LABELS[cat];

  return (
    <section
      aria-labelledby={`${uid}-title`}
      data-testid="progression-panel"
      className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${uid}-title`} className="text-xs font-bold text-white uppercase tracking-wider">Progression</h2>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-white" data-testid="progression-budget">
            <span data-testid="progression-used">{pts(result.pointsUsed)}</span>/{pts(budget)} pts
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
            Two points per level above 1 · the nth stat point of a category costs ⌈n / 4⌉ points (the first four cost 1 each).
          </p>
        </div>
        <div className="shrink-0 text-right" data-testid="progression-estimate">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            OVR at {state.position} · {PROFICIENCY_LABELS[proficiency]}
          </div>
          <div className="font-mono text-2xl font-black tabular-nums text-[var(--color-accent)]" data-testid="progression-overall">
            {result.overall}
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]" data-testid="progression-overall-label" data-proficiency={proficiency}>
        {overallLabel(mp, manager)}
      </p>
      <p className="text-[11px] leading-relaxed text-[var(--color-text-dim)]" data-testid="progression-limits">
        {LIMITS_NOTE}
      </p>

      {/* Max level + position */}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={`${uid}-level`} className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Max level <span className="font-normal normal-case">(1–{levelCap})</span>
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
            className="mt-1 h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2.5 font-mono text-sm font-bold text-white focus:outline-none focus:border-[var(--color-line-active)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
          />
          <span id={`${uid}-level-hint`} className="sr-only">
            Applied when you leave the field or press Enter; an allocation the new level cannot afford is reset.
          </span>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-position`} className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Position <span className="font-normal normal-case">(proficiency)</span>
          </label>
          <select
            id={`${uid}-position`}
            value={state.position}
            onChange={(e) => emit({ ...state, position: e.target.value as Position })}
            className="mt-1 h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2 font-mono text-sm font-bold text-white focus:outline-none focus:border-[var(--color-line-active)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
          >
            {POSITIONS.map((p) => {
              const prof = proficiencyFromAptitude(player.positionAptitudes[p]);
              return (
                <option key={p} value={p} data-proficiency={prof}>
                  {p} · {PROFICIENCY_LABELS[prof]}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Manager Proficiency (efootbase's slider, 70–90, default 90). */}
      <div className="min-w-0" data-testid="progression-proficiency">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${uid}-mp`} className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Manager proficiency <span className="font-normal normal-case">({MANAGER_PROFICIENCY_MIN}–{MANAGER_PROFICIENCY_MAX})</span>
          </label>
          <output htmlFor={`${uid}-mp`} className="font-mono text-sm font-bold tabular-nums text-white" data-testid="progression-proficiency-value">
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
          className="progression-slider mt-1 block w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          data-testid="progression-proficiency-slider"
        />
        <p id={`${uid}-mp-note`} className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]" data-testid="progression-proficiency-note">
          {proficiencyNote(mp)}
          {manager ? " Moving the slider deselects the manager." : ""}
        </p>
      </div>

      {/* Manager (efootbase's "Select Manager"): the rating becomes the
          proficiency level, the pills get +1 after the boosters. */}
      <div className="min-w-0" data-testid="progression-manager">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setPickerOpen(true)}
          data-testid="progression-manager-button"
          data-manager-id={manager?.id ?? ""}
          className={`flex w-full min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
            manager ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10" : "border-[var(--color-line)] bg-[var(--color-canvas)] hover:border-[var(--color-line-active)]"
          }`}
        >
          {manager?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={manager.imageUrl} alt="" width={28} height={28} loading="lazy" decoding="async" className="size-7 shrink-0 rounded-md object-cover" />
          ) : (
            <UserRound className="size-4 shrink-0 text-[var(--color-text-dim)]" aria-hidden />
          )}
          {manager ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-white">
                <span className="sr-only">Select Manager — selected: </span>
                {manager.name} <span className="font-mono text-[var(--color-text-secondary)]">· {manager.rating}</span>
              </span>
              <span className="block truncate font-mono text-[10px] text-[var(--color-accent)]">{pillText(manager)}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 font-semibold text-white">Select Manager</span>
          )}
        </button>
        <ManagerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} selectedId={manager?.id ?? null} onChoose={chooseManager} />
      </div>

      {/* Live region: points left, the overall and any reset notice. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-xs">
        <span className="text-[var(--color-text-secondary)]">
          Points used <span className="font-mono font-bold text-white">{pts(result.pointsUsed)}</span> / {pts(budget)}
        </span>
        <span role="status" aria-live="polite" aria-atomic="true" className="font-mono font-bold text-[var(--color-accent)]" data-testid="progression-live">
          {pts(remaining)} pts left · {result.overall} at {state.position} · proficiency {mp}
          {manager ? ` · ${manager.name}` : ""}
          {notice ? <span className="font-normal text-[var(--color-accent-warn)]"> · {notice}</span> : null}
        </span>
      </div>

      {/* Ten category rows: label button (highlights the category's stats in
          the stat grid), − value +, slider. */}
      <div className="space-y-1.5" role="group" aria-label="Training categories">
        {TRAINING_CATEGORIES.map((cat) => {
          const v = state.trainingPoints[cat];
          const next = nextStatPointCost(v);
          const others = allocationCost({ ...state.trainingPoints, [cat]: 0 });
          const max = maxGainForBudget(budget - others);
          const canInc = next <= remaining + 1e-9;
          const statsText = TRAINING_STATS[cat].map((s) => statLabel(s)).join(", ");
          const hit = highlight === cat;
          const inactive = v === 0 && !hit;
          return (
            <div
              key={cat}
              className={`rounded-lg border bg-[var(--color-canvas)] px-2.5 py-1.5 ${hit ? "border-[var(--color-accent)]/50" : "border-[var(--color-line)]"}`}
              data-testid={`progression-cat-${cat}`}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    id={`${uid}-cat-${cat}-label`}
                    aria-pressed={hit}
                    onClick={() => onHighlight?.(hit ? null : cat)}
                    title={`${statsText} — click to highlight these stats`}
                    className={`max-w-full truncate text-left text-xs font-semibold cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                      inactive ? "text-[var(--color-text-secondary)]" : "text-white"
                    } ${hit ? "underline decoration-[var(--color-accent)] underline-offset-2" : ""}`}
                    data-testid={`progression-cat-${cat}-label`}
                  >
                    {labelOf(cat)}
                  </button>
                  <span className="ml-1.5 font-mono text-[10px] text-[var(--color-text-dim)]">
                    spent {pts(categoryCost(v))} · next {pts(next)}
                  </span>
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Decrease ${labelOf(cat)}`}
                  disabled={v === 0}
                  onClick={() => setCategory(cat, v - 1)}
                  className="size-7 shrink-0 rounded-md border border-[var(--color-line)] bg-[var(--color-elevated)] text-sm font-bold text-white transition-colors hover:border-[var(--color-line-active)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  −
                </button>
                <div
                  role="spinbutton"
                  tabIndex={0}
                  aria-labelledby={`${uid}-cat-${cat}-label`}
                  aria-valuenow={v}
                  aria-valuemin={0}
                  aria-valuemax={max}
                  aria-valuetext={`${v} stat points, ${pts(categoryCost(v))} pts spent, next costs ${pts(next)}`}
                  onKeyDown={onStepperKey(cat)}
                  className={`w-8 shrink-0 rounded-md py-0.5 text-center font-mono text-sm font-bold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                    v > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-dim)]"
                  }`}
                >
                  {v}
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Increase ${labelOf(cat)}`}
                  disabled={!canInc}
                  onClick={() => setCategory(cat, v + 1)}
                  className="size-7 shrink-0 rounded-md border border-[var(--color-line)] bg-[var(--color-elevated)] text-sm font-bold text-white transition-colors hover:border-[var(--color-line-active)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  +
                </button>
              </div>
              {/* Slider (efootbase row layout). Not a tab stop — the spinbutton
                  above carries the keyboard interaction and the accessible name. */}
              <input
                type="range"
                tabIndex={-1}
                aria-hidden
                min={0}
                max={Math.max(max, v)}
                step={1}
                value={v}
                onChange={(e) => setCategory(cat, Number(e.target.value))}
                className="progression-slider mt-1 block w-full"
                data-testid={`progression-cat-${cat}-slider`}
              />
            </div>
          );
        })}
      </div>

      {/* Boosters — a slot without a usable stat vector is a static note, not a toggle. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Boosters">
        {boosterSlots.map((slot) => {
          const b = boosterSummary(player, slot);
          const on = state.boosters[slot] && b.usable;
          const content = (
            <>
              <span className="flex w-full items-center gap-1.5">
                <Sparkles className={`size-3 shrink-0 ${on ? "text-[var(--color-accent-secondary)]" : "text-[var(--color-text-dim)]"}`} aria-hidden />
                <span className={`truncate font-semibold ${b.usable ? "text-white" : "text-[var(--color-text-secondary)]"}`} title={`Booster ${slot + 1}: ${b.label}`}>Booster {slot + 1}: {b.label}</span>
                {b.usable ? (
                  <span className={`ml-auto shrink-0 font-mono text-[10px] font-bold ${on ? "text-[var(--color-accent-secondary)]" : "text-[var(--color-text-dim)]"}`}>
                    {on ? "ON" : "OFF"}
                  </span>
                ) : null}
              </span>
              {b.deltas.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {b.deltas.map(([k, v]) => (
                    <span key={k} className="rounded-md bg-[var(--color-accent-secondary)]/10 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-accent-secondary)]">
                      +{v} {statLabel(k)}
                    </span>
                  ))}
                </span>
              )}
            </>
          );
          if (!b.usable) {
            return (
              <div
                key={slot}
                data-testid={`progression-booster-${slot + 1}`}
                data-usable="false"
                className="flex min-w-0 flex-col items-start gap-1 rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-left text-xs"
              >
                {content}
              </div>
            );
          }
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={on}
              onClick={() => toggleBooster(slot)}
              data-testid={`progression-booster-${slot + 1}`}
              data-usable="true"
              className={`flex min-w-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                on
                  ? "border-[var(--color-accent-secondary)]/50 bg-[var(--color-accent-secondary)]/10"
                  : "border-[var(--color-line)] bg-[var(--color-canvas)] hover:border-[var(--color-line-active)]"
              }`}
            >
              {content}
            </button>
          );
        })}
      </div>

      {/* Actions + notes */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={maxOvr}
          className="button button--sm bg-[var(--color-accent)] text-[var(--color-accent-foreground)] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Max OVR
        </button>
        <button
          type="button"
          onClick={reset}
          className="button button--sm button--secondary inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </button>
        <span className="text-[10px] text-[var(--color-text-dim)]">
          Max OVR picks the allocation with the highest weighted stat sum of the formula at {state.position} for the {pts(budget)}-point budget, before the Manager Proficiency bonus and the cut at 99, so it is the same build at every proficiency and with any manager (as on efootbase); a hand-made build can read up to 1 higher, or up to 2 when the preset trains a stat past 99 (those points are not counted). Reset zeroes every category and keeps the proficiency and the manager. Jumping rises with Aerial Strength and with Goalkeeper 1 alike.
        </span>
      </div>
    </section>
  );
}
