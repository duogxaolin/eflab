"use client";
import { BarChart3, ChevronRight, Globe, PersonStanding, ShieldHalf, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { skillLabel } from "@/lib/skill-labels";
import type { PlayersState } from "@/lib/filter-url";
import {
  AI_PLAYING_STYLES,
  CARD_TYPES,
  CARD_TYPE_LABELS,
  CONDITIONS,
  CONDITION_FILTER_LABELS,
  FILTER_RANGE_BOUNDS,
  FORM_LABELS,
  PLAYING_STYLES,
  POSITIONS,
  WEAK_FOOT_ACCURACY_LABELS,
  WEAK_FOOT_USAGE_LABELS,
  sortPositions,
  type CardType,
  type Condition,
  type Position,
} from "@eflab/shared";
import { conditionUrl } from "@/lib/r2-images";
import { RangeFields } from "./RangeFields";
import { ToggleGroup } from "./ToggleGroup";

// Kept as a plain union here (not imported from FilterDialogs) so the dialog
// chunk stays out of the page's first load.
export type FilterDialogKind = "stats" | "body" | "style" | "skills" | "nation" | "league" | "team";

// Position order of efootbase's filter grid (attack → defence, 3 per row).
const POSITION_GRID: readonly Position[] = ["LWF", "CF", "RWF", "LMF", "SS", "RMF", "AMF", "CMF", "DMF", "LB", "CB", "RB", "GK"];
const STARS = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * The /players filter sidebar (efootbase layout): dialog launchers for the
 * long lists (Stats, Body Model, Playing Style, Skills, Nation, League, Team)
 * followed by the inline sections — Position, Card Type, Base / Max Overall
 * Rating, Strong Foot, Condition, Form, WF Accuracy, WF Usage, Height, Weight,
 * Age. Rendered in the desktop <aside> and inside the mobile "Filters" bottom
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
}: {
  state: PlayersState;
  update: (patch: Partial<PlayersState>) => void;
  openDialog: (kind: FilterDialogKind) => void;
  conditionIcon?: (letter: string) => string;
}) {
  // Names for the launcher summaries (cached lists; the dialogs share them).
  const countries = trpc.player.countries.useQuery(undefined, { staleTime: 60 * 60_000, enabled: state.nat.length > 0 });
  const leagues = trpc.player.leagues.useQuery(undefined, { staleTime: 60 * 60_000, enabled: state.league.length > 0 });
  const teams = trpc.player.teams.useQuery(undefined, { staleTime: 60 * 60_000, enabled: state.team.length > 0 });
  const skills = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000, enabled: state.skills.length > 0 });
  // "Argentina · Brazil" for the multi-valued pickers (ids until the list loads).
  const namesOf = (ids: readonly number[], rows: ReadonlyArray<{ id: number; name: string }> | undefined) =>
    ids.map((id) => rows?.find((r) => r.id === id)?.name ?? `#${id}`).join(" · ");

  const statCount = Object.keys(state.stats).length;
  const bodyCount = Object.keys(state.body).length;
  const styleSummary = [
    state.style !== undefined ? PLAYING_STYLES[state.style] : null,
    ...state.ai.map((k) => AI_PLAYING_STYLES.find((s) => s.key === k)?.label),
  ].filter(Boolean);
  const skillNames = state.skills.map((id) => {
    const s = skills.data?.find((x) => x.id === id);
    return s ? skillLabel(s) : `#${id}`;
  });
  const launchers: ReadonlyArray<{ kind: FilterDialogKind; label: string; icon: LucideIcon; summary: string }> = [
    { kind: "stats", label: "Stats", icon: BarChart3, summary: statCount ? `${statCount} range${statCount > 1 ? "s" : ""}${state.statsAtMax ? " · max" : ""}` : "" },
    { kind: "body", label: "Body Model", icon: PersonStanding, summary: bodyCount ? `${bodyCount} range${bodyCount > 1 ? "s" : ""}` : "" },
    { kind: "style", label: "Playing Style", icon: Target, summary: styleSummary.join(" · ") },
    { kind: "skills", label: "Skills", icon: Zap, summary: skillNames.join(" · ") },
    { kind: "nation", label: "Nation", icon: Globe, summary: namesOf(state.nat, countries.data) },
    { kind: "league", label: "League", icon: Trophy, summary: namesOf(state.league, leagues.data) },
    { kind: "team", label: "Team", icon: ShieldHalf, summary: namesOf(state.team, teams.data) },
  ];

  const b = FILTER_RANGE_BOUNDS;
  // Sections are separated by `.filter-panel`'s rules (12 px above / below).
  return (
    <div className="filter-panel">
      <ul className="filter-rows">
        {launchers.map((l) => (
          <li key={l.kind}>
            <button type="button" onClick={() => openDialog(l.kind)} aria-haspopup="dialog" className="filter-row hit-44">
              <span className="filter-row__icon" aria-hidden>
                <l.icon className="size-4" />
              </span>
              <span className="filter-row__label">{l.label}</span>
              {l.summary && <span className="filter-row__summary">{l.summary}</span>}
              <ChevronRight className="filter-row__chevron size-4" aria-hidden />
            </button>
          </li>
        ))}
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

      <ToggleGroup<CardType>
        label="Card Type"
        columns={2}
        options={CARD_TYPES.map((t) => ({ value: t, label: CARD_TYPE_LABELS[t] }))}
        selected={state.types ?? []}
        onChange={(types) => update({ types: types.length === 0 || types.length === CARD_TYPES.length ? null : CARD_TYPES.filter((t) => types.includes(t)) })}
      />

      <RangeFields label="Base Overall Rating" value={state.base} bounds={b.ovr} onChange={(base) => update({ base })} />
      <RangeFields label="Max Overall Rating" value={state.max} bounds={b.maxOvr} onChange={(max) => update({ max })} />

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

      <RangeFields label="Height" unit=" cm" value={state.height} bounds={b.height} onChange={(height) => update({ height })} />
      <RangeFields label="Weight" unit=" kg" value={state.weight} bounds={b.weight} onChange={(weight) => update({ weight })} />
      <RangeFields label="Age" value={state.age} bounds={b.age} onChange={(age) => update({ age })} />
    </div>
  );
}
