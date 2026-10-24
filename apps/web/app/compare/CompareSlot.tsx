"use client";
import { useState } from "react";
import Link from "next/link";
import { Sparkles, RotateCcw, X } from "lucide-react";
import {
  CARD_TYPE_LABELS,
  PROGRESSION_CATEGORY_LABELS,
  TRAINING_CATEGORIES,
  compareHasCategories,
  isUsableBooster,
  registeredPositionOf,
  toDisplayPoints,
  trainingPointsAvailable,
  type BaseStat,
  type BoosterDTO,
  type BuildResult,
  type CompareSide,
  type PickerManagerDTO,
  type PlayerCardDTO,
  type TrainingAllocation,
} from "@eflab/shared";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PlaystyleTrigger } from "@/components/detail/PlaystyleTrigger";
import { CATEGORY_ICON, CATEGORY_SUFFIX } from "@/components/detail/StatGrid";
import { ManagerTrigger } from "@/components/build-simulator/ProgressionPanel";
import { DeferredManagerPicker } from "@/components/build-simulator/deferred";
import { boosterLabel, playingStyleLabel } from "@/lib/card-display";
import { ComparePitch } from "./ComparePitch";

// One filled compare slot (change efootbase-function-parity, design D11, spec
// "Two-Build Compare"): the card face printing the build's overall at the
// registered position, Remove, the name (a link to the card page), the two
// playing styles, then the slot's build —
//   a card with a level cap above 1: "used/total pts", Max OVR (the side's
//     default, the Max-OVR allocation) and Reset (every category 0);
//   every card: Select Manager (the player page's drawer; the choice is NOT
//     remembered here — compare never touches `eflab:selected-manager`) with
//     "Manager Proficiency <rating>", or "No proficiency bonus" without one;
//   the card's usable boosters as read-only pills (both on — choosing or
//     toggling boosters in compare was not measured on the reference);
//   the ten category values as text (no editing here: not measured);
//   the 13 position tiles of the build (ComparePitch).
// A card with a level cap of 1 has no points, categories, Max OVR or Reset.
// The face is the plain face at every width, like the player page's: it
// prints the build's overall, so the dump's "MAX" badge (Booster 1 only, no
// bonus) is not drawn next to it; the level cap is in the line under the name.

/** The side's build as the page holds it. */
export interface SlotBuild {
  allocation: TrainingAllocation;
  managerId: string | null;
}

/** A booster's readable label (`boosterLabel`, as on the player page). */
function readableBooster(b: BoosterDTO): string {
  const deltas = (Object.entries(b.stats) as Array<[BaseStat, number]>).filter(([, v]) => typeof v === "number" && v !== 0);
  return boosterLabel(b.name, deltas);
}

export function CompareSlot({
  side,
  slotNumber,
  card,
  build,
  result,
  manager,
  managerPending,
  onMaxOvr,
  onReset,
  onChooseManager,
  onClearManager,
  onRemove,
}: {
  side: CompareSide;
  slotNumber: 1 | 2;
  card: PlayerCardDTO;
  build: SlotBuild;
  result: BuildResult;
  /** The selected manager once the picker list answered (null without one). */
  manager: PickerManagerDTO | null;
  /** A manager id from the link waits for the picker list. */
  managerPending: boolean;
  onMaxOvr: () => void;
  onReset: () => void;
  onChooseManager: (m: PickerManagerDTO) => void;
  onClearManager: () => void;
  onRemove: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const categories = compareHasCategories(card);
  const regPos = registeredPositionOf(card);
  const budget = trainingPointsAvailable(card.levelCap);
  const boosters = [card.booster1, card.booster2].filter((b): b is BoosterDTO => isUsableBooster(b));
  const attack = playingStyleLabel(card.playingStyleAttack);
  const defence = playingStyleLabel(card.playingStyleDefense);
  const face = { ...card, ovr: result.overall };
  const nameId = `compare-${side}-name`;

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3" data-testid={`compare-slot-${side}`} data-card-id={card.id}>
      <div className="relative w-full md:max-w-40">
        {/* caption "none": the slot prints the name (a link) below the card. */}
        <PlayerCard player={face} size="full" caption="none" />
        {/* z-20: above the card tile, which rises to z 10 on hover / focus. */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${card.name} from slot ${slotNumber}`}
          className="button button--sm button--icon-only button--secondary absolute -right-2 -top-2 z-20 shadow-md"
          data-testid="compare-remove"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <p className="sr-only" data-testid="compare-face-overall">
        The card shows the overall of this build: {result.overall} at {regPos}.
      </p>

      <div className="w-full min-w-0 text-center">
        <h2 id={nameId} className="text-sm font-semibold text-[var(--color-text-primary)]">
          {/* hit-44: a 44 px tall tap area on touch screens; inline-block keeps one box when a long name wraps. */}
          <Link href={`/players/${card.baseId}/${card.id}`} className="hit-44 inline-block transition-colors hover:text-[var(--color-accent)]">
            {card.name}
          </Link>
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] tabular-nums">
          {CARD_TYPE_LABELS[card.cardType]} · Max Lv {Math.max(1, card.levelCap)}
        </p>
        {/* A <div>: the playstyle triggers render their tooltip / popover next to them. */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--color-text-secondary)]" data-testid="compare-styles">
          <span className="inline-flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_attack.svg" alt="" width={12} height={12} className="size-3" />
            <PlaystyleTrigger style={attack} kind="attack" />
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_defence.svg" alt="" width={12} height={12} className="size-3" />
            <PlaystyleTrigger style={defence} kind="defence" />
          </span>
        </div>
      </div>

      <section aria-labelledby={`compare-${side}-build`} className="efb-compare-build" data-testid="compare-build" data-mode={categories ? "categories" : "level-1"}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h3 id={`compare-${side}-build`} className="text-sm font-semibold text-white">
            {categories ? "Progression" : "Build"}
            <span className="sr-only"> · {card.name}</span>
          </h3>
          {categories && (
            <p className="text-sm font-semibold tabular-nums text-white" data-testid="compare-points">
              <span data-testid="compare-points-used">{toDisplayPoints(result.pointsUsed)}</span>/{toDisplayPoints(budget)} pts
            </p>
          )}
        </div>
        {categories && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" onClick={onMaxOvr} aria-label={`Max OVR, slot ${slotNumber}`} className="button button--sm button--primary" data-testid="compare-max-ovr">
              Max OVR
            </button>
            <button type="button" onClick={onReset} aria-label={`Reset slot ${slotNumber}`} className="button button--sm button--ghost button--icon-only" data-testid="compare-reset">
              <RotateCcw className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Select Manager: the player page's drawer; its rating becomes the
            proficiency, its pills +1 after the boosters. Not remembered. */}
        <div className="min-w-0" data-testid="compare-manager-row">
          {/* wrap: a slot is 138 px wide at 320 — the label wraps, never cut. */}
          <ManagerTrigger manager={manager} pending={managerPending} onClick={() => setPickerOpen(true)} testId="compare-manager" wrap />
          <DeferredManagerPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            selectedId={build.managerId}
            onChoose={(m) => {
              setPickerOpen(false);
              onChooseManager(m);
            }}
            onClear={() => {
              setPickerOpen(false);
              onClearManager();
            }}
            remembered={false}
          />
        </div>
        <p className={`text-xs ${manager ? "font-semibold text-[var(--color-accent-soft-foreground)]" : "text-[var(--color-text-secondary)]"}`} data-testid="compare-proficiency">
          {manager ? `Manager Proficiency ${manager.rating}` : managerPending ? "" : "No proficiency bonus"}
        </p>

        {boosters.length > 0 && (
          <ul className="flex min-w-0 flex-col gap-1.5" aria-label="Boosters (both on)" data-testid="compare-boosters">
            {boosters.map((b, i) => (
              <li key={`${i}-${b.id}`} className="efb-compare-booster">
                <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{readableBooster(b)}</span>
              </li>
            ))}
          </ul>
        )}

        {categories && (
          <dl className="efb-compare-cats" aria-label="Stat points per category" data-testid="compare-categories">
            {TRAINING_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICON[cat];
              const suffix = CATEGORY_SUFFIX[cat];
              const v = build.allocation[cat];
              return (
                <div key={cat} className="efb-compare-cats__row" data-cat={cat} data-value={v} data-zero={v === 0 ? "true" : undefined}>
                  <dt className="flex min-w-0 items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    {suffix && (
                      <span aria-hidden className="-ml-1 text-[10px] font-bold leading-none">
                        {suffix}
                      </span>
                    )}
                    <span className="min-w-0 break-words">{PROGRESSION_CATEGORY_LABELS[cat]}</span>
                  </dt>
                  <dd className="shrink-0 font-semibold tabular-nums">{v}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </section>

      <ComparePitch tiles={result.tiles} positionAptitudes={card.positionAptitudes} registeredPosition={regPos} label={`Overall at each position, ${card.name}`} />
    </div>
  );
}
