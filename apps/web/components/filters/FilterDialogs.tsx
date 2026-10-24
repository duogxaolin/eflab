"use client";
import { Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PHYSIQUE_LABEL } from "@/lib/card-display";
import { SKILL_GROUP_LABELS, compareSkills, skillGroup, skillLabel } from "@/lib/skill-labels";
import { groupTeamsForPicker, orderNationsForPicker, type PlayersState } from "@/lib/filter-url";
import {
  AI_PLAYING_STYLES,
  AI_PLAYING_STYLE_KEYS,
  FILTER_RANGE_BOUNDS,
  MAX_FILTER_IDS,
  MAX_FILTER_SKILLS,
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
  resetKey,
}: {
  dialog: FilterDialogKind;
  onClose: () => void;
  state: PlayersState;
  update: (patch: Partial<PlayersState>) => void;
  /** Bumped by a navigation: the Stats / Body Model range fields re-sync their drafts. */
  resetKey?: number;
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
                <RangeFields
                  key={s}
                  compact
                  label={statFilterLabel(s)}
                  value={state.stats[s] ?? null}
                  bounds={FILTER_RANGE_BOUNDS.stat}
                  onChange={(r) => setStat(s, r)}
                  resetKey={resetKey}
                />
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
                <RangeFields
                  key={f}
                  compact
                  label={PHYSIQUE_LABEL[f]}
                  value={state.body[f] ?? null}
                  bounds={FILTER_RANGE_BOUNDS.physique}
                  onChange={(r) => setBody(f, r)}
                  resetKey={resetKey}
                />
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
    // Several styles at once (survey 2026-10-23 S2 §6): the main styles of
    // both groups widen the list (any of them, in either slot — Box-to-Box and
    // Anchor Man sit in both groups with one id, so they toggle together);
    // the AI styles narrow it (all of them).
    const toggleStyle = (id: number) =>
      update({ styles: state.styles.includes(id) ? state.styles.filter((s) => s !== id) : sortIds([...state.styles, id]) });
    const toggleAi = (key: AiPlayingStyleKey) =>
      update({ ai: state.ai.includes(key) ? state.ai.filter((k) => k !== key) : AI_PLAYING_STYLE_KEYS.filter((k) => k === key || state.ai.includes(k)) });
    return (
      <Modal open onClose={onClose} title="Playing Style">
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.title} className="space-y-2" aria-label={g.title}>
              <h3 className="filter-label">{g.title}</h3>
              <div className="filter-options">
                {g.ids.map((id) => {
                  const on = state.styles.includes(id);
                  return (
                    <button key={id} type="button" aria-pressed={on} onClick={() => toggleStyle(id)} title={PLAYING_STYLES[id]} className="filter-option">
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
          </section>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Several Attack or Defence styles widen the list to cards with any of them; several AI styles narrow it to cards that have all of them.
          </p>
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
  // Only skills that cards actually carry are offered (the zero-holder
  // catalogue entries would always return no rows); the value is the stored
  // skill key, the URL's `skill=s_*` (every skill with holders has one).
  const items = [...(q.data ?? [])]
    .filter((s): s is typeof s & { key: string } => s.playerCount > 0 && s.key !== null)
    .sort(compareSkills)
    .map((s) => ({ value: s.key, label: skillLabel(s), group: SKILL_GROUP_LABELS[skillGroup(s)], hint: `${s.playerCount.toLocaleString("en-US")} cards` }));
  return (
    <Modal open onClose={onClose} title="Skills">
      <PickerList
        items={items}
        selected={state.skills}
        onChange={(skills) => update({ skills })}
        // The list bound is shared with skills still named by an old link's ids.
        max={MAX_FILTER_SKILLS - state.legacySkillIds.length}
        load={loadOf(q, "skills")}
      />
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

function NationDialog({ state, update, onClose }: DialogProps) {
  const q = trpc.player.countries.useQuery(undefined, { staleTime: 60 * 60_000 });
  // The reference's fixed ten first (England, France, Spain, Brazil, …), then
  // every other nation once, A–Z, without group headings (survey 2026-10-23
  // S2 §6; FIXED_FIRST_NATIONS in @eflab/shared).
  const items = orderNationsForPicker(q.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  return (
    <Modal open onClose={onClose} title="Nation">
      <PickerList items={items} selected={state.nat} onChange={(nat) => update({ nat: sortIds(nat) })} max={MAX_FILTER_IDS} load={loadOf(q, "nations")} />
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
  // Every team under its league heading (leagues A–Z, teams A–Z, teams
  // without a league last), whatever leagues are selected — a Team selection
  // combines with a League selection by AND (survey 2026-10-23 S2 §6). The
  // value is the team name, the URL's `team=<name>` (names are unique).
  const items = groupTeamsForPicker(teams.data ?? [], leagues.data ?? []).map(({ team, league }) => ({
    value: team.name,
    label: team.name,
    group: league ?? "No league",
  }));
  const load: PickerLoad = {
    isPending: teams.isPending || leagues.isPending,
    isError: teams.isError || leagues.isError,
    refetch: () => Promise.all([teams.refetch(), leagues.refetch()]),
    what: "teams",
  };
  return (
    <Modal open onClose={onClose} title="Team">
      <PickerList
        items={items}
        selected={state.teams}
        onChange={(names) => update({ teams: names })}
        // The list bound is shared with teams still named by an old link's ids.
        max={MAX_FILTER_IDS - state.legacyTeamIds.length}
        load={load}
      />
      <p className={NOTE_CLASS}>{OR_NOTE}</p>
    </Modal>
  );
}
