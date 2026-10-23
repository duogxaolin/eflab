"use client";
import { Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PHYSIQUE_LABEL } from "@/lib/card-display";
import { SKILL_GROUP_LABELS, compareSkills, skillGroup, skillLabel } from "@/lib/skill-labels";
import type { PlayersState } from "@/lib/filter-url";
import {
  AI_PLAYING_STYLES,
  FILTER_RANGE_BOUNDS,
  MAX_FILTER_IDS,
  PHYSIQUE_FIELDS,
  PLAYING_STYLES,
  PLAYING_STYLES_UNAVAILABLE,
  PLAYING_STYLE_GROUPS,
  sortIds,
  type AiPlayingStyleKey,
  type BaseStat,
  type IntRange,
  type PhysiqueField,
} from "@eflab/shared";
import { Modal } from "./Modal";
import { RangeFields } from "./RangeFields";
import { PickerList, type PickerLoad } from "./PickerList";
import { STAT_FILTER_GROUPS, statFilterLabel } from "./stat-filter-labels";
import type { FilterDialogKind } from "./FiltersPanel";

// Body-model layout: two columns as on efootbase (torso / limbs).
const BODY_COLUMNS: readonly (readonly PhysiqueField[])[] = [PHYSIQUE_FIELDS.slice(0, 6), PHYSIQUE_FIELDS.slice(6)];

// Query state handed to the picker, which renders the loading / retry row and
// shows its empty-search message only once the list is loaded.
const loadOf = (q: { isPending: boolean; isError: boolean; refetch: () => unknown }, what: string): PickerLoad => ({
  isPending: q.isPending,
  isError: q.isError,
  refetch: q.refetch,
  what,
});

/**
 * The seven filter dialogs of the players page, loaded on demand (one chunk)
 * and mounted only while one of them is open.
 */
export function FilterDialogs({
  dialog,
  onClose,
  state,
  update,
}: {
  dialog: FilterDialogKind;
  onClose: () => void;
  state: PlayersState;
  update: (patch: Partial<PlayersState>) => void;
}) {
  const setStat = (stat: BaseStat, r: IntRange | null) => {
    const next = { ...state.stats };
    if (r) next[stat] = r;
    else delete next[stat];
    update({ stats: next });
  };
  const setBody = (field: PhysiqueField, r: IntRange | null) => {
    const next = { ...state.body };
    if (r) next[field] = r;
    else delete next[field];
    update({ body: next });
  };

  if (dialog === "stats") {
    return (
      <Modal
        open
        onClose={onClose}
        title="Stats"
        headerExtra={
          // The label is the switch's touch target: on coarse pointers its hit-44 area makes the
          // whole row 44 px tall, and the span's hit-44 gives the 40 × 22 switch its own 44 × 44
          // area centred on it (2 px past its left edge, where the label starts). Layout unchanged.
          <label className="hit-44 flex w-fit cursor-pointer items-center gap-3 text-sm font-medium text-[var(--color-text-primary)]">
            <span className="hit-44 inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                aria-checked={state.statsAtMax}
                checked={state.statsAtMax}
                onChange={(e) => update({ statsAtMax: e.target.checked })}
                className="filter-switch"
              />
            </span>
            Max attribute potential
          </label>
        }
      >
        {/* Three columns (Attacking / Strength / Defending) of numeric
            min / max pairs; a dual-handle slider is deliberately not used. */}
        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-3">
          {STAT_FILTER_GROUPS.map((g) => (
            <section key={g.title} className="min-w-0 space-y-4" aria-label={g.title}>
              <h3 className="filter-label">{g.title}</h3>
              {g.stats.map((s) => (
                <RangeFields key={s} compact label={statFilterLabel(s)} value={state.stats[s] ?? null} bounds={FILTER_RANGE_BOUNDS.stat} onChange={(r) => setStat(s, r)} />
              ))}
            </section>
          ))}
        </div>
      </Modal>
    );
  }

  if (dialog === "body") {
    return (
      <Modal open onClose={onClose} title="Body Model">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {BODY_COLUMNS.map((col, i) => (
            <section key={i} className="min-w-0 space-y-4">
              {col.map((f) => (
                <RangeFields key={f} compact label={PHYSIQUE_LABEL[f]} value={state.body[f] ?? null} bounds={FILTER_RANGE_BOUNDS.physique} onChange={(r) => setBody(f, r)} />
              ))}
            </section>
          ))}
        </div>
      </Modal>
    );
  }

  if (dialog === "style") {
    const byLabel = (a: number, b: number) => (PLAYING_STYLES[a] ?? "").localeCompare(PLAYING_STYLES[b] ?? "");
    const groups: ReadonlyArray<{ title: string; ids: readonly number[]; unavailable: readonly string[] }> = [
      { title: "Attack", ids: [...PLAYING_STYLE_GROUPS.attack].sort(byLabel), unavailable: PLAYING_STYLES_UNAVAILABLE.attack },
      { title: "Defence", ids: [...PLAYING_STYLE_GROUPS.defence].sort(byLabel), unavailable: PLAYING_STYLES_UNAVAILABLE.defence },
    ];
    const toggleAi = (key: AiPlayingStyleKey) =>
      update({ ai: state.ai.includes(key) ? state.ai.filter((k) => k !== key) : [...state.ai, key] });
    return (
      <Modal open onClose={onClose} title="Playing Style">
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.title} className="space-y-2" aria-label={g.title}>
              <h3 className="filter-label">{g.title}</h3>
              <div className="filter-options">
                {g.ids.map((id) => {
                  const on = state.style === id;
                  return (
                    <button key={id} type="button" aria-pressed={on} onClick={() => update({ style: on ? undefined : id })} title={PLAYING_STYLES[id]} className="filter-option">
                      <span className="filter-option__label">{PLAYING_STYLES[id]}</span>
                      {on && <Check className="size-4 shrink-0" aria-hidden />}
                    </button>
                  );
                })}
                {g.unavailable.map((name) => (
                  <span
                    key={name}
                    aria-disabled="true"
                    title="No card in this database carries this style (it was added to the game after the data was taken)."
                    className="filter-option"
                  >
                    <span className="filter-option__label">{name}</span>
                  </span>
                ))}
              </div>
            </section>
          ))}
          <section className="space-y-2" aria-label="AI Playing Styles">
            <h3 className="filter-label">AI Playing Styles</h3>
            <div className="filter-options">
              {AI_PLAYING_STYLES.map((s) => {
                const on = state.ai.includes(s.key);
                return (
                  <button key={s.key} type="button" aria-pressed={on} onClick={() => toggleAi(s.key)} title={s.label} className="filter-option">
                    <span className="filter-option__label">{s.label}</span>
                    {on && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">Several AI styles narrow the list to cards that have all of them.</p>
          </section>
        </div>
      </Modal>
    );
  }

  if (dialog === "skills") return <SkillsDialog state={state} update={update} onClose={onClose} />;
  if (dialog === "nation") return <NationDialog state={state} update={update} onClose={onClose} />;
  if (dialog === "league") return <LeagueDialog state={state} update={update} onClose={onClose} />;
  return <TeamDialog state={state} update={update} onClose={onClose} />;
}

type DialogProps = { state: PlayersState; update: (patch: Partial<PlayersState>) => void; onClose: () => void };

// One-line note under a picker: 12 px muted.
const NOTE_CLASS = "mt-4 text-xs text-[var(--color-text-secondary)]";

function SkillsDialog({ state, update, onClose }: DialogProps) {
  const q = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });
  // Only skills that cards actually carry are offered (the 17 zero-holder
  // fixture entries would always return no rows).
  const items = [...(q.data ?? [])]
    .filter((s) => s.playerCount > 0)
    .sort(compareSkills)
    .map((s) => ({ value: s.id, label: skillLabel(s), group: SKILL_GROUP_LABELS[skillGroup(s)], hint: `${s.playerCount.toLocaleString("en-US")} cards` }));
  return (
    <Modal open onClose={onClose} title="Skills">
      <PickerList items={items} selected={state.skills} onChange={(skills) => update({ skills })} load={loadOf(q, "skills")} />
      <p className={NOTE_CLASS}>Several skills narrow the list to cards that have all of them.</p>
    </Modal>
  );
}

// Nation / League / Team are multi-select (multi-select-filters): any of the
// selected values matches (OR), the URL helper keeps the ids ascending and the
// picker refuses a selection beyond MAX_FILTER_IDS (the URL / API bound) with a
// visible message instead of letting the serialiser drop one. The Modal
// provides the Done button, the focus trap, Escape and the focus return.
const OR_NOTE = "Several selections widen the list to cards matching any of them.";

// Size of the Nation dialog's "Popular" group (efootbase lists ten nations
// first; ours are the ten with the most cards, from player.countries).
const POPULAR_NATIONS = 10;

function NationDialog({ state, update, onClose }: DialogProps) {
  const q = trpc.player.countries.useQuery(undefined, { staleTime: 60 * 60_000 });
  const countries = q.data ?? [];
  // The list arrives A–Z; "All nations" keeps that order.
  const items = countries.map((c) => ({ value: c.id, label: c.name }));
  const popular = [...countries]
    .filter((c) => c.playerCount > 0)
    .sort((a, b) => b.playerCount - a.playerCount || a.name.localeCompare(b.name, "en") || a.id - b.id)
    .slice(0, POPULAR_NATIONS)
    .map((c) => c.id);
  return (
    <Modal open onClose={onClose} title="Nation">
      <PickerList
        items={items}
        selected={state.nat}
        onChange={(nat) => update({ nat: sortIds(nat) })}
        max={MAX_FILTER_IDS}
        load={loadOf(q, "nations")}
        featured={{ label: "Popular", values: popular, restLabel: "All nations" }}
      />
      <p className={NOTE_CLASS}>{OR_NOTE}</p>
    </Modal>
  );
}

function LeagueDialog({ state, update, onClose }: DialogProps) {
  const q = trpc.player.leagues.useQuery(undefined, { staleTime: 60 * 60_000 });
  const items = (q.data ?? []).map((l) => ({ value: l.id, label: l.name }));
  return (
    <Modal open onClose={onClose} title="League">
      <PickerList items={items} selected={state.league} onChange={(league) => update({ league: sortIds(league) })} max={MAX_FILTER_IDS} load={loadOf(q, "leagues")} />
      <p className={NOTE_CLASS}>{OR_NOTE}</p>
    </Modal>
  );
}

function TeamDialog({ state, update, onClose }: DialogProps) {
  const teams = trpc.player.teams.useQuery(undefined, { staleTime: 60 * 60_000 });
  const leagues = trpc.player.leagues.useQuery(undefined, { staleTime: 60 * 60_000 });
  const leagueName = new Map((leagues.data ?? []).map((l) => [l.id, l.name]));
  const teamName = new Map((teams.data ?? []).map((t) => [t.id, t.name]));
  // Chosen leagues narrow the team list to their clubs; a team selected before
  // the narrowing keeps its chip (labelOf) so it can still be removed.
  const rows = (teams.data ?? []).filter((t) => state.league.length === 0 || (t.leagueId !== null && state.league.includes(t.leagueId)));
  const items = rows.map((t) => ({
    value: t.id,
    label: t.name,
    hint: t.national ? "National team" : t.leagueId !== null ? leagueName.get(t.leagueId) : undefined,
  }));
  return (
    <Modal open onClose={onClose} title="Team">
      <PickerList
        items={items}
        selected={state.team}
        onChange={(team) => update({ team: sortIds(team) })}
        labelOf={(id) => teamName.get(id) ?? `#${id}`}
        max={MAX_FILTER_IDS}
        load={loadOf(teams, "teams")}
        emptyText={state.league.length > 0 ? `No team of the selected league${state.league.length > 1 ? "s" : ""} matches.` : "No team matches."}
      />
      <p className={NOTE_CLASS}>{OR_NOTE}</p>
    </Modal>
  );
}
