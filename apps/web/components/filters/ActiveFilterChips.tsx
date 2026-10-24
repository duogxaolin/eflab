"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PHYSIQUE_LABEL } from "@/lib/card-display";
import { skillLabel } from "@/lib/skill-labels";
import { activeFilterKey, activeFilters, type ActiveFilter, type PlayersState } from "@/lib/filter-url";
import {
  AI_PLAYING_STYLES,
  CARD_TYPE_LABELS,
  CONDITION_FILTER_LABELS,
  PLAYING_STYLES,
  type IntRange,
  type SkillDTO,
} from "@eflab/shared";
import { statFilterLabel } from "./stat-filter-labels";

/** "≥ 99", "18–21", "≤ 85" (a range edge left open is not shown). */
function rangeText(r: IntRange, unit = ""): string {
  if (r.min !== undefined && r.max !== undefined) return r.min === r.max ? `${r.min}${unit}` : `${r.min}–${r.max}${unit}`;
  if (r.min !== undefined) return `≥ ${r.min}${unit}`;
  return `≤ ${r.max}${unit}`;
}

const LONG = 60 * 60_000;

/**
 * The /players active-filter chips (survey 2026-10-23 S2 §7; spec
 * efootbase-function-parity "Players Filter Chips, Badges And Reset"): under
 * the search field at every width, one removable chip per active filter value
 * in the URL's key order ("Legendary", "Max OVR ≥ 99", "Age 18–21", "Form 3★",
 * a nation, league or team name …). Removing a chip removes only that value;
 * focus then goes to the chip that took its place, else to the search field
 * (never to the Reset chip, so a repeated Enter cannot clear every filter).
 * Below 1024 px the row ends with a "Reset" chip (Reset keeps the search and
 * the sort). A chip whose name comes from a list (nations, leagues, skills,
 * an old link's team id) shows the raw value until that list has loaded.
 */
export function ActiveFilterChips({
  state,
  onRemove,
  onReset,
  searchRef,
}: {
  state: PlayersState;
  onRemove: (filter: ActiveFilter) => void;
  onReset: () => void;
  /** Where focus goes when no chip takes the removed one's place. */
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const filters = activeFilters(state);
  const has = (kind: ActiveFilter["kind"]) => filters.some((f) => f.kind === kind);
  // Names for the chips (the same cached lists as the dialogs).
  const countries = trpc.player.countries.useQuery(undefined, { staleTime: LONG, enabled: has("nat") });
  const leagues = trpc.player.leagues.useQuery(undefined, { staleTime: LONG, enabled: has("league") });
  const teams = trpc.player.teams.useQuery(undefined, { staleTime: LONG, enabled: has("teamId") });
  const skills = trpc.skill.list.useQuery({}, { staleTime: LONG, enabled: has("skill") || has("skillId") });
  const nameById = (rows: ReadonlyArray<{ id: number; name: string }> | undefined, id: number) => rows?.find((r) => r.id === id)?.name ?? String(id);
  const skillName = (match: (s: SkillDTO) => boolean, raw: string) => {
    const s = skills.data?.find(match);
    return s ? skillLabel(s) : raw;
  };

  const label = (f: ActiveFilter): string => {
    switch (f.kind) {
      case "pos":
        return f.value;
      case "card":
        return CARD_TYPE_LABELS[f.value];
      case "base":
        return `Base OVR ${rangeText(f.range)}`;
      case "max":
        return `Max OVR ${rangeText(f.range)}`;
      case "foot":
        return f.value === 1 ? "Left foot" : "Right foot";
      case "condition":
        return CONDITION_FILTER_LABELS[f.value];
      case "form":
        return `Form ${f.value}★`;
      case "wfa":
        return `WF Accuracy ${f.value}★`;
      case "wfu":
        return `WF Usage ${f.value}★`;
      case "height":
        return `Height ${rangeText(f.range, " cm")}`;
      case "weight":
        return `Weight ${rangeText(f.range, " kg")}`;
      case "age":
        return `Age ${rangeText(f.range)}`;
      case "style":
        return PLAYING_STYLES[f.value] ?? String(f.value);
      case "ai":
        return AI_PLAYING_STYLES.find((s) => s.key === f.value)?.label ?? f.value;
      case "skill":
        return skillName((s) => s.key === f.value, f.value);
      case "skillId":
        return skillName((s) => s.id === f.value, String(f.value));
      case "nat":
        return nameById(countries.data, f.value);
      case "league":
        return nameById(leagues.data, f.value);
      case "team":
        return f.value;
      case "teamId":
        return nameById(teams.data, f.value);
      case "stat":
        return `${statFilterLabel(f.value)} ${rangeText(f.range)}`;
      case "statsAtMax":
        return "Max attribute potential";
      case "body":
        return `${PHYSIQUE_LABEL[f.value]} ${rangeText(f.range)}`;
    }
  };

  // After a removal: the chip now at the removed one's index, else the
  // search field. Set before the change, applied once the chips re-rendered.
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<number | "search" | null>(null);
  const keys = filters.map(activeFilterKey).join("|");
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const chip = target === "search" ? undefined : listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-chip]")[target];
    (chip ?? searchRef.current)?.focus();
  }, [keys, searchRef]);

  if (filters.length === 0) return null;
  return (
    <ul ref={listRef} aria-label="Active filters" className="mt-3 m-0 flex list-none flex-wrap gap-2 p-0" data-testid="active-filter-chips">
      {filters.map((f, i) => {
        const text = label(f);
        return (
          <li key={activeFilterKey(f)} className="max-w-full">
            <button
              type="button"
              data-chip
              onClick={() => {
                pendingFocus.current = i < filters.length - 1 ? i : "search";
                onRemove(f);
              }}
              aria-label={`Remove ${text}`}
              className="filter-chip filter-chip--page hit-44"
            >
              <span className="truncate">{text}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </button>
          </li>
        );
      })}
      <li className="lg:hidden">
        <button
          type="button"
          onClick={() => {
            pendingFocus.current = "search";
            onReset();
          }}
          className="filter-chip filter-chip--page filter-chip--reset hit-44"
          data-testid="filter-chip-reset"
        >
          Reset
        </button>
      </li>
    </ul>
  );
}
