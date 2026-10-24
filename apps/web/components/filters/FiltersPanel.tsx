"use client";
import { BarChart3, ChevronRight, Globe, PersonStanding, ShieldHalf, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import { filterDialogCounts, type FilterDialogRow, type PlayersState } from "@/lib/filter-url";
import {
  CARD_TYPES,
  CARD_TYPE_FILTER_ORDER,
  CARD_TYPE_LABELS,
  CONDITIONS,
  CONDITION_FILTER_LABELS,
  FILTER_RANGE_BOUNDS,
  FORM_LABELS,
  WEAK_FOOT_ACCURACY_LABELS,
  WEAK_FOOT_USAGE_LABELS,
  sortPositions,
  type CardType,
  type Condition,
  type Position,
} from "@eflab/shared";
import { conditionUrl } from "@/lib/r2-images";
import { CommunityRatingFilter } from "./CommunityRatingFilter";
import { RangeFields } from "./RangeFields";
import { ToggleGroup } from "./ToggleGroup";

// The dialog rows of the rail (a plain union from @eflab/shared, not imported
// from FilterDialogs, so the dialog chunk stays out of the page's first load).
export type FilterDialogKind = FilterDialogRow;

// Position order of efootbase's filter grid (attack → defence, 3 per row).
const POSITION_GRID: readonly Position[] = ["LWF", "CF", "RWF", "LMF", "SS", "RMF", "AMF", "CMF", "DMF", "LB", "CB", "RB", "GK"];
const STARS = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * The /players filter sidebar (efootbase layout): dialog launchers for the
 * long lists (Stats, Body Model, Playing Style, Skills, Nation, League, Team)
 * followed by the inline sections — Position, Card Type, Base / Max Overall
 * Rating, Strong Foot, Condition, Form, WF Accuracy, WF Usage, Height, Weight,
 * Age, Community Rating (the spec's filter priority order; change
 * efootbase-data-refresh-1024). Rendered in the desktop <aside> and inside the mobile "Filters" bottom
 * sheet. Every change goes through `update`, which writes the URL and resets
 * the page. Look (`.filter-*` in globals.css): 40 px launcher rows with a
 * Lucide icon tile and a chevron, 34 px toggles, 36 px number fields, 12 px
 * muted section labels and #ffffff0f rules between the sections.
 */
export function FiltersPanel({
  state,
  update,
  openDialog,
  conditionIcon = conditionUrl,
  resetKey,
}: {
  state: PlayersState;
  update: (patch: Partial<PlayersState>) => void;
  openDialog: (kind: FilterDialogKind) => void;
  conditionIcon?: (letter: string) => string;
  /** Bumped by a navigation: the range fields re-sync their drafts (RangeFields `resetKey`). */
  resetKey?: number;
}) {
  // Each dialog row shows how many values it holds as a badge (survey
  // 2026-10-23 S2 §6: "Nation 2", "Playing Style 5", "Stats 2" = a stat range
  // plus the max switch); the values themselves are the chips under the
  // search field.
  const counts = filterDialogCounts(state);
  const launchers: ReadonlyArray<{ kind: FilterDialogKind; label: string; icon: LucideIcon }> = [
    { kind: "stats", label: "Stats", icon: BarChart3 },
    { kind: "body", label: "Body Model", icon: PersonStanding },
    { kind: "style", label: "Playing Style", icon: Target },
    { kind: "skills", label: "Skills", icon: Zap },
    { kind: "nation", label: "Nation", icon: Globe },
    { kind: "league", label: "League", icon: Trophy },
    { kind: "team", label: "Team", icon: ShieldHalf },
  ];

  const b = FILTER_RANGE_BOUNDS;
  // Sections are separated by `.filter-panel`'s rules (12 px above / below).
  return (
    <div className="filter-panel">
      <ul className="filter-rows">
        {launchers.map((l) => {
          const n = counts[l.kind];
          return (
            <li key={l.kind}>
              <button type="button" onClick={() => openDialog(l.kind)} aria-haspopup="dialog" data-active={n > 0 || undefined} className="filter-row hit-44">
                <span className="filter-row__icon" aria-hidden>
                  <l.icon className="size-4" />
                </span>
                <span className="filter-row__label">{l.label}</span>
                {n > 0 && (
                  <span className="filter-row__badge" data-testid={`filter-badge-${l.kind}`}>
                    <span aria-hidden>{n}</span>
                    <span className="sr-only">, {n} selected</span>
                  </span>
                )}
                <ChevronRight className="filter-row__chevron size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      {/* 13 independent toggles (aria-pressed): a card matches when it plays
          any selected position (multi-select-filters). Pitch rows 3,3,3,3,1 —
          GK sits in the middle column. */}
      <ToggleGroup<Position>
        label="Position"
        columns={3}
        options={POSITION_GRID.map((p) => ({ value: p, label: p, className: p === "GK" ? "col-start-2" : undefined }))}
        selected={state.pos}
        onChange={(pos) => update({ pos: sortPositions(pos) })}
      />

      {/* efootbase's toggle order and display labels (CARD_TYPE_FILTER_ORDER,
          CARD_TYPE_LABELS: Standard, Selection, Icons, Trending, Highlight,
          Epic - Big Time, then Strike Arena); the state and the URL keep the
          code order (CARD_TYPES). */}
      <ToggleGroup<CardType>
        label="Card Type"
        columns={2}
        options={CARD_TYPE_FILTER_ORDER.map((t) => ({ value: t, label: CARD_TYPE_LABELS[t] }))}
        selected={state.types ?? []}
        onChange={(types) => update({ types: types.length === 0 || types.length === CARD_TYPES.length ? null : CARD_TYPES.filter((t) => types.includes(t)) })}
      />

      <RangeFields label="Base Overall Rating" value={state.base} bounds={b.ovr} onChange={(base) => update({ base })} resetKey={resetKey} />
      <RangeFields label="Max Overall Rating" value={state.max} bounds={b.maxOvr} onChange={(max) => update({ max })} resetKey={resetKey} />

      <ToggleGroup<0 | 1>
        label="Strong Foot"
        single
        columns={2}
        options={[
          { value: 1, label: "Left" },
          { value: 0, label: "Right" },
        ]}
        selected={state.foot === undefined ? [] : [state.foot]}
        onChange={([foot]) => update({ foot })}
      />

      <ToggleGroup<Condition>
        label="Condition"
        columns={5}
        options={CONDITIONS.map((c) => ({
          value: c,
          ariaLabel: CONDITION_FILTER_LABELS[c],
          label: (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={conditionIcon(c.toLowerCase())} alt="" width={18} height={18} className="mx-auto size-[18px]" />
          ),
        }))}
        selected={state.condition}
        onChange={(condition) => update({ condition: CONDITIONS.filter((c) => condition.includes(c)) })}
        buttonClassName="px-0"
      />

      <ToggleGroup<number>
        label="Form"
        columns={3}
        options={STARS(3).map((n) => ({ value: n, label: n, ariaLabel: `Form: ${n} of 3 stars (${FORM_LABELS[n - 1]})` }))}
        selected={state.form}
        onChange={(form) => update({ form: form.sort((a, c) => a - c) })}
      />
      <ToggleGroup<number>
        label="WF Accuracy"
        columns={4}
        options={STARS(4).map((n) => ({ value: n, label: n, ariaLabel: `WF Accuracy: ${n} of 4 stars (${WEAK_FOOT_ACCURACY_LABELS[n - 1]})` }))}
        selected={state.wfa}
        onChange={(wfa) => update({ wfa: wfa.sort((a, c) => a - c) })}
      />
      <ToggleGroup<number>
        label="WF Usage"
        columns={4}
        options={STARS(4).map((n) => ({ value: n, label: n, ariaLabel: `WF Usage: ${n} of 4 stars (${WEAK_FOOT_USAGE_LABELS[n - 1]})` }))}
        selected={state.wfu}
        onChange={(wfu) => update({ wfu: wfu.sort((a, c) => a - c) })}
      />

      <RangeFields label="Height" unit=" cm" value={state.height} bounds={b.height} onChange={(height) => update({ height })} resetKey={resetKey} />
      <RangeFields label="Weight" unit=" kg" value={state.weight} bounds={b.weight} onChange={(weight) => update({ weight })} resetKey={resetKey} />
      <RangeFields label="Age" value={state.age} bounds={b.age} onChange={(age) => update({ age })} resetKey={resetKey} />

      <CommunityRatingFilter value={state.rating} onChange={(rating) => update({ rating })} />
    </div>
  );
}
