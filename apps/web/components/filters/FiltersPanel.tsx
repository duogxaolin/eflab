"use client";
import { ChevronRight } from "lucide-react";
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
 * Age. Rendered in the desktop <aside> and inside the mobile "Filters" dialog.
 * Every change goes through `update`, which writes the URL and resets the page.
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
  const countries = trpc.player.countries.useQuery(undefined, { staleTime: 60 * 60_000, enabled: state.nat !== undefined });
  const leagues = trpc.player.leagues.useQuery(undefined, { staleTime: 60 * 60_000, enabled: state.league !== undefined });
  const teams = trpc.player.teams.useQuery(undefined, { staleTime: 60 * 60_000, enabled: state.team !== undefined });
  const skills = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000, enabled: state.skills.length > 0 });

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
  const launchers: ReadonlyArray<{ kind: FilterDialogKind; label: string; summary: string }> = [
    { kind: "stats", label: "Stats", summary: statCount ? `${statCount} range${statCount > 1 ? "s" : ""}${state.statsAtMax ? " · max" : ""}` : "" },
    { kind: "body", label: "Body Model", summary: bodyCount ? `${bodyCount} range${bodyCount > 1 ? "s" : ""}` : "" },
    { kind: "style", label: "Playing Style", summary: styleSummary.join(" · ") },
    { kind: "skills", label: "Skills", summary: skillNames.join(" · ") },
    { kind: "nation", label: "Nation", summary: state.nat === undefined ? "" : countries.data?.find((c) => c.id === state.nat)?.name ?? `#${state.nat}` },
    { kind: "league", label: "League", summary: state.league === undefined ? "" : leagues.data?.find((l) => l.id === state.league)?.name ?? `#${state.league}` },
    { kind: "team", label: "Team", summary: state.team === undefined ? "" : teams.data?.find((t) => t.id === state.team)?.name ?? `#${state.team}` },
  ];

  const b = FILTER_RANGE_BOUNDS;
  return (
    <div className="space-y-5 text-xs">
      <ul className="m-0 list-none divide-y divide-white/5 p-0">
        {launchers.map((l) => (
          <li key={l.kind}>
            <button
              type="button"
              onClick={() => openDialog(l.kind)}
              aria-haspopup="dialog"
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-white hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{l.label}</span>
                {l.summary && <span className="block truncate text-[11px] text-[var(--color-accent)]">{l.summary}</span>}
              </span>
              <ChevronRight className="size-4 shrink-0 text-white/40" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <ToggleGroup<Position>
        label="Position"
        single
        columns={3}
        options={POSITION_GRID.map((p) => ({ value: p, label: p }))}
        selected={state.pos ? [state.pos] : []}
        onChange={([pos]) => update({ pos: pos ?? "" })}
        buttonClassName="h-9 font-semibold"
      />

      <ToggleGroup<CardType>
        label="Card Type"
        columns={2}
        options={CARD_TYPES.map((t) => ({ value: t, label: CARD_TYPE_LABELS[t] }))}
        selected={state.types ?? []}
        onChange={(types) => update({ types: types.length === 0 || types.length === CARD_TYPES.length ? null : CARD_TYPES.filter((t) => types.includes(t)) })}
        buttonClassName="h-9"
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
        buttonClassName="h-9"
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
        buttonClassName="h-9 px-0"
      />

      <ToggleGroup<number>
        label="Form"
        columns={3}
        options={STARS(3).map((n) => ({ value: n, label: n, ariaLabel: `Form: ${n} of 3 stars (${FORM_LABELS[n - 1]})` }))}
        selected={state.form}
        onChange={(form) => update({ form: form.sort((a, c) => a - c) })}
        buttonClassName="h-9"
      />
      <ToggleGroup<number>
        label="WF Accuracy"
        columns={4}
        options={STARS(4).map((n) => ({ value: n, label: n, ariaLabel: `WF Accuracy: ${n} of 4 stars (${WEAK_FOOT_ACCURACY_LABELS[n - 1]})` }))}
        selected={state.wfa}
        onChange={(wfa) => update({ wfa: wfa.sort((a, c) => a - c) })}
        buttonClassName="h-9"
      />
      <ToggleGroup<number>
        label="WF Usage"
        columns={4}
        options={STARS(4).map((n) => ({ value: n, label: n, ariaLabel: `WF Usage: ${n} of 4 stars (${WEAK_FOOT_USAGE_LABELS[n - 1]})` }))}
        selected={state.wfu}
        onChange={(wfu) => update({ wfu: wfu.sort((a, c) => a - c) })}
        buttonClassName="h-9"
      />

      <RangeFields label="Height" unit=" cm" value={state.height} bounds={b.height} onChange={(height) => update({ height })} />
      <RangeFields label="Weight" unit=" kg" value={state.weight} bounds={b.weight} onChange={(weight) => update({ weight })} />
      <RangeFields label="Age" value={state.age} bounds={b.age} onChange={(age) => update({ age })} />
    </div>
  );
}
