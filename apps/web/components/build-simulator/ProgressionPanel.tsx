"use client";
import { useId, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  OVR_LOWER_CONFIDENCE_POSITIONS,
  OVR_PROFICIENCY_LOWER_CONFIDENCE,
  POSITIONS,
  PROFICIENCY_LABELS,
  TRAINING_CATEGORIES,
  TRAINING_CATEGORY_LABELS,
  TRAINING_STATS,
  allocationCost,
  bestAllocation,
  categoryCost,
  emptyAllocation,
  isGoalkeeperCard,
  maxGainForBudget,
  nextStatPointCost,
  positionFromIndex,
  proficiencyFromAptitude,
  trainingPointsAvailable,
  type BaseStat,
  type BuildResult,
  type PlayerCardDTO,
  type Position,
  type PositionProficiency,
  type TrainingAllocation,
  type TrainingCategory,
} from "@eflab/shared";
import { statLabel } from "@/lib/card-display";
import { Sparkles } from "lucide-react";

// Progression sheet of the player detail page (player-progression-simulator).
// The parent owns the state (it feeds the projected stats into the stat
// sections and the card overlay) and runs the shared engine; this component
// renders the controls: Max Level, position, ten category steppers with the
// next cost, points used / left, Booster 1 / 2 toggles, Max OVR and Reset.
// The rules it follows are the ones recovered from the eFHUB data — see
// packages/shared/src/progression.ts.

export interface ProgressionState {
  maxLevel: number;
  position: Position;
  trainingPoints: TrainingAllocation;
  boosters: [boolean, boolean];
}

/** Untouched state of a card: level cap, registered position, no training,
 *  Booster 1 on (it is applied by default in the game), Booster 2 off. */
export function defaultProgressionState(player: Pick<PlayerCardDTO, "levelCap" | "registeredPosition">): ProgressionState {
  return {
    maxLevel: Math.max(1, player.levelCap),
    position: positionFromIndex(player.registeredPosition),
    trainingPoints: emptyAllocation(),
    boosters: [true, false],
  };
}

type BoosterSlotInfo = { label: string; deltas: Array<[BaseStat, number]>; usable: boolean };
type BoosterPlayer = Pick<PlayerCardDTO, "boosterId1" | "boosterId2" | "booster1" | "booster2">;

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

/** True once the user changed anything from the default state. Booster
 *  toggles only count on slots that carry a usable booster. */
export function isCustomBuild(state: ProgressionState, defaults: ProgressionState, player: BoosterPlayer): boolean {
  return (
    state.maxLevel !== defaults.maxLevel ||
    state.position !== defaults.position ||
    ([0, 1] as const).some((slot) => boosterSummary(player, slot).usable && state.boosters[slot] !== defaults.boosters[slot]) ||
    TRAINING_CATEGORIES.some((c) => state.trainingPoints[c] !== 0)
  );
}

const formatPoints = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Accuracy note for the estimate at `position` given the card's proficiency
 *  there (numbers = held-out rates recorded in ovrWeights.ts). */
function estimateNote(position: Position, proficiency: PositionProficiency): string {
  if (proficiency === "full") {
    const lower = OVR_LOWER_CONFIDENCE_POSITIONS.includes(position);
    return `The overall is an estimate: about ±1 at full-proficiency positions${lower ? ` (lower confidence at ${position})` : ""}.`;
  }
  const lower = OVR_PROFICIENCY_LOWER_CONFIDENCE[proficiency].includes(position);
  if (proficiency === "none" && position === "GK") {
    return `${position} is not a proficient position for this card: outfield cards sit at a flat 40 there in the eFHUB data, so the estimate is 40.`;
  }
  const where = proficiency === "half" ? `${position} is a half-proficiency position for this card` : `${position} is not a proficient position for this card`;
  return `${where}: a fitted proficiency penalty is applied (within ±1 on ${
    proficiency === "half" ? "99.9 %" : "99.7 %"
  } of held-out hub cards${lower ? `; lower confidence at ${position}` : ""}).`;
}

export function ProgressionPanel({
  player,
  state,
  result,
  onChange,
}: {
  player: PlayerCardDTO;
  state: ProgressionState;
  result: BuildResult;
  onChange: (next: ProgressionState) => void;
}) {
  const uid = useId();
  const goalkeeper = isGoalkeeperCard(positionFromIndex(player.registeredPosition));
  const levelCap = Math.max(1, player.levelCap);
  const budget = trainingPointsAvailable(state.maxLevel);
  const remaining = result.remainingPoints;
  const proficiency = result.proficiency;

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
      fits ? null : `allocation reset: level ${maxLevel} gives ${available} point${available === 1 ? "" : "s"}, fewer than the ${formatPoints(spent)} spent`,
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
  const maxOvr = () => setAllocation(bestAllocation(state.position, budget, { goalkeeper }));
  const reset = () => setAllocation(emptyAllocation());

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

  return (
    <section
      aria-labelledby={`${uid}-title`}
      data-testid="progression-panel"
      className="card card--secondary rounded-xl bg-[var(--color-panel)] border border-[var(--color-line)] p-5 sm:p-6 space-y-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${uid}-title`} className="text-xs font-bold text-white uppercase tracking-wider">Progression</h2>
          <p className="mt-1 text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
            One training point per level above 1 · the nth stat point of a category costs 0.5 × ⌈n / 4⌉ points. No manager effects.
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-secondary)] leading-relaxed" data-testid="progression-estimate-note" data-proficiency={proficiency}>
            {estimateNote(state.position, proficiency)}
          </p>
        </div>
        <div className="shrink-0 text-right" data-testid="progression-estimate">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
            Est. OVR at {state.position} · {PROFICIENCY_LABELS[proficiency]}
          </div>
          <div className="font-mono text-2xl font-black tabular-nums text-[var(--color-accent)]">
            <span aria-hidden>~</span>
            <span className="sr-only">about </span>
            {result.estimatedOvr}
          </div>
        </div>
      </div>

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

      {/* Budget — the live region announces points left, the estimate and any reset notice. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-xs">
        <span className="text-[var(--color-text-secondary)]">
          Points used <span className="font-mono font-bold text-white" data-testid="progression-used">{formatPoints(result.pointsUsed)}</span> / {budget}
        </span>
        <span role="status" aria-live="polite" aria-atomic="true" className="font-mono font-bold text-[var(--color-accent)]" data-testid="progression-live">
          {formatPoints(remaining)} left · ~{result.estimatedOvr} at {state.position}
          {notice ? <span className="font-normal text-[var(--color-accent-warn)]"> · {notice}</span> : null}
        </span>
      </div>

      {/* Ten category steppers */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Training categories">
        {TRAINING_CATEGORIES.map((cat) => {
          const v = state.trainingPoints[cat];
          const next = nextStatPointCost(v);
          const others = allocationCost({ ...state.trainingPoints, [cat]: 0 });
          const max = maxGainForBudget(budget - others);
          const canInc = next <= remaining + 1e-9;
          const statsText = TRAINING_STATS[cat]
            .map((s) => (goalkeeper && s === "jump" ? `${statLabel(s)} (n/a)` : statLabel(s)))
            .join(", ");
          return (
            <div key={cat} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] px-2.5 py-2" data-testid={`progression-cat-${cat}`}>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white">
                  {/* The spinbutton's accessible name is the category label only; the cost lives in aria-valuetext. */}
                  <span id={`${uid}-cat-${cat}-label`}>{TRAINING_CATEGORY_LABELS[cat]}</span>
                  <span className="ml-1.5 font-mono text-[10px] font-normal text-[var(--color-text-dim)]">
                    spent {formatPoints(categoryCost(v))} · next {formatPoints(next)}
                  </span>
                </div>
                <div className="truncate text-[10px] text-[var(--color-text-dim)]" title={statsText}>{statsText}</div>
              </div>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Decrease ${TRAINING_CATEGORY_LABELS[cat]}`}
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
                aria-valuetext={`${v} stat points, ${formatPoints(categoryCost(v))} spent, next costs ${formatPoints(next)}`}
                onKeyDown={onStepperKey(cat)}
                className="w-8 shrink-0 rounded-md py-0.5 text-center font-mono text-sm font-bold tabular-nums text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
              >
                {v}
              </div>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Increase ${TRAINING_CATEGORY_LABELS[cat]}`}
                disabled={!canInc}
                onClick={() => setCategory(cat, v + 1)}
                className="size-7 shrink-0 rounded-md border border-[var(--color-line)] bg-[var(--color-elevated)] text-sm font-bold text-white transition-colors hover:border-[var(--color-line-active)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                +
              </button>
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
                <span className={`truncate font-semibold ${b.usable ? "text-white" : "text-[var(--color-text-secondary)]"}`}>Booster {slot + 1}: {b.label}</span>
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
          className="button button--sm button--secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Reset
        </button>
        <span className="text-[10px] text-[var(--color-text-dim)]">
          Max OVR picks the allocation with the highest estimate at {state.position} for the {budget}-point budget.
          {goalkeeper ? " Goalkeeper Jump is card-specific and not projected." : ""}
        </span>
      </div>
    </section>
  );
}
