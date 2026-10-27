"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, Circle, CircleCheck, Footprints, MoveVertical, Sparkles, Swords, Weight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PlayerCard } from "@/components/cards/PlayerCard";
import { PitchMap } from "@/components/players/PitchMap";
import { InlineQueryError, QueryErrorState } from "@/lib/query-state";
import { formatUtcDate } from "@/lib/format-date";
import { conditionUrl } from "@/lib/r2-images";
import { forgetRememberedManager, readRememberedManager, rememberManager } from "@/lib/remembered-manager";
import {
  CARD_TYPE_LABELS,
  MATCH_STATE_OFF,
  PLAYING_STYLE_DESCRIPTIONS,
  POSITIONS,
  TRENDING_BOOSTER_CYCLE,
  TRENDING_BOOSTER_MAGNITUDE,
  bestFitPosition,
  booster1Levels,
  buildMode,
  decodeBuildQuery,
  encodeBuildQuery,
  formatFeetInches,
  isIdParam,
  matchStateForCard,
  modeHasBuild,
  nextBoosterLevel,
  openingBuildState,
  ownBooster2Levels,
  positionFromIndex,
  positionTiles,
  resolveBuildLists,
  sameBuildState,
  simulateCardBuild,
  takesSecondBooster,
  type BaseStat,
  type BoosterLevel,
  type BuildQueryLists,
  type BuildUrlState,
  type CardPreview,
  type HeldMatchState,
  type MatchState,
  type Position,
  type PlayerCardDTO,
  type SecondBoosterDTO,
  type SkillDTO,
  type TrainingCategory,
} from "@eflab/shared";
import { DeferredModal, DeferredSecondBoosterPicker, prefetchModal, prefetchSecondBoosterPicker } from "@/components/build-simulator/deferred";
import {
  BuildSettings,
  CategoryAdjust,
  ProgressionDock,
  ProgressionPanel,
  boosterSummary,
  canSpendPoints,
  isCustomBuild,
  openingProgressionState,
  progressionIds,
  type BuildChangeMeta,
  type BuildNotice,
  type BuildRefs,
  type ProgressionChange,
  type ProgressionState,
} from "@/components/build-simulator/ProgressionPanel";
// Type only: the static copy is passed in by the server page (`notes`).
import type { BuildNotes } from "@/components/build-simulator/build-notes";
import { CardInfo } from "@/components/detail/CardInfo";
import { BodyModel } from "@/components/detail/BodyModel";
import { StarRating, WeakFootStars } from "@/components/detail/StarRating";
import { CategoryRow, KeyStats, STAT_CATEGORIES, StatGrid, useCategoryPreview, type ActiveCategories, type StatHighlight } from "@/components/detail/StatGrid";
import { isShowtimeSkill, orderSkills, skillDisplayName } from "@/components/detail/skill-display";
import { SkillChip } from "@/components/detail/SkillChip";
import { PlaystyleTrigger } from "@/components/detail/PlaystyleTrigger";
import { Tooltip } from "@/components/ui/Tooltip";
import { POSITION_LABEL, boosterLabel, cardLeagueOf, conditionLabel, positionOf, playingStyleLabel, statTierClass } from "@/lib/card-display";

// Player detail page body (layout of change efootbase-ui-redesign, measured
// on the reference capture of 2026-10-20):
//   header   breadcrumb (14/20); H1 36/40 (30/36 below md) + ONE accent pill
//            "{maxOvr} OVR" (the dump's max-level overall) + a muted 12 px
//            "dump max · no proficiency bonus" note; a line with position ·
//            attack style · defence style · condition (12 px icons; the two
//            styles are description triggers, PlaystyleTrigger); the polite
//            "link adjusted" message;
//   left     (280 px from lg) 180 px card face (condition letter, no MAX
//            badges; its OVR block prints the live build overall at the
//            selected position, with that position's label), three 28 px
//            round marks (nation, club, league), the Progression card
//            (pinned at 64 px: the face, marks and card sit in a flexible
//            wrapper that fills the column — as tall as the main column —
//            minus the Build settings card at its end, so the card stays in
//            view while the main column scrolls and never covers anything),
//            then the non-sticky Build settings card (Max Level, Position,
//            the overall there, "About this build" with the Stat breakdown);
//   row      under both columns, full width: Card Info and Other Versions
//            (56 px thumbnails, "+N" tile), side by side from lg;
//   phone    (< lg) no panel in the column: a floating category strip (its
//            items open the Adjust popover) and a dock above the tab bar
//            (ProgressionDock) — its proficiency chip and avatar open a small
//            non-modal manager / proficiency popover, the points and the
//            Progression button open the bottom sheet holding the same panel
//            and the Build settings, scrolled to the category rows; one
//            state source (`build`) for all;
//   main     one "Overview" content card — a Compare shortcut in its heading,
//            description (playstyle triggers, up to two skill links, "and
//            other N player skills"), spec line, category strip (its items
//            open the Adjust popover), booster buttons (Booster 1 on / off or,
//            on a Trending card, through its levels; the card's own Booster 2
//            on / off, else the "Select Booster" slot), stat view switch, stat
//            grid (3 columns from lg, 2 below; five tier colours, filled "+N"
//            booster / "+1" manager chips; a row opens its Adjust popover
//            when the build can spend points, else it is plain), skills
//            (Showtime first, links with a preview) — then Body Model and
//            Position & Playstyle (Best Fit / At POS / "N Full · N Half",
//            pitch, style panel, WF / Form / Injury Resistance stars).
// The root carries `data-card-tint` (the card type) for the backdrop's static
// tint (globals.css `.efb-backdrop__tint`).
//
// The build (change efootbase-function-parity, card kinds by `buildMode`):
// a card with a level cap above 1 has the full Progression panel; a
// Highlight card with a level cap of 1 a panel with a 1–80 Max Level slider
// (empty at Max Level 1); a Trending card the "Build" panel (manager and
// proficiency, Booster 1 levels); any other card with a level cap of 1 no
// build (the dump's stats and the note). It lives here because the stat grid,
// the card face, the booster buttons and the Pitch Map render the engine's
// projection (`simulateCardBuild`). Best Fit, "At POS" and the 13 Pitch Map
// values come from the exact overall formula on the stats shown, never from
// the stored eFHUB ratings (change efootbase-exact-model-managers).
//
// Build in the URL (D2, spec "Build State In The Card URL"): the state is
// read from the query on the server and the first client render alike
// (`decodeBuildQuery`, so hydration matches) and every change made here is
// written with `history.replaceState` (`encodeBuildQuery`; Next's router
// adopts it — no navigation, no server request — and useSearchParams
// follows). The opening state, and the opening state with the remembered
// manager, write no query. Every query this page writes is remembered until
// the router hands it back, so an echo changes nothing; any other query is a
// navigation to this card and is adopted. A link that had to be corrected
// (over budget, out of range, unknown manager or booster) is rewritten at
// once — one tick after mount, when Next has patched the history — and a
// polite message says so. The remembered manager (D3) is read after mount
// and applied only to a plain URL, without writing it.
//
// Match state (change efootbase-s4-measure, design D1): the Build settings'
// Position Training and Weak foot toggles are NOT part of the build — held
// here with the card id they belong to (off for any other card, so they are
// off again when another card opens), never written to the URL, never a
// "Custom build", never stored. Weak foot changes the shown stats only
// (`shownStats`, orange "−N" chips); Position Training changes the 13 tiles,
// Best Fit, "At POS" and the panel overall at a trained position. The card
// face, the "Build (N)" label and the stats heading read the untrained
// overall (`untrainedTiles`), so neither toggle moves them.

// Key stats shown on the attack / defence playing-style cards.
const ATTACK_KEY_STATS: readonly BaseStat[] = ["offensiveAwareness", "finishing", "dribbling", "lowPass"];
const DEFENCE_KEY_STATS: readonly BaseStat[] = ["defensiveAwareness", "ballWinning", "defensiveEngagement", "aggression"];

/** Form / injury resistance are stored 0–2 and shown as value + 1 stars of 3
 *  (efootbase); weak foot (stored 0–3) goes through `WeakFootStars`. */
const THREE_STAR_MAX = 3;
/** Skills linked in the Overview paragraph (Showtime first), as the reference. */
const OVERVIEW_SKILL_LINKS = 2;
/** Other Versions slots before the "+N" tile (4 × 2 grid of 56 px cards). */
const VERSIONS_PREVIEW = 8;
/** The message of a link whose build had to be corrected. */
const LINK_ADJUSTED = "The link's build was adjusted to fit this card.";

/** Which values the stat grid shows: the build's projection, the dump's
 *  max-level stats (`max_attributes`, a different lift that includes the
 *  dump's own booster handling) or the level-1 base. Any change in the build
 *  switches back to "build", so the two "max" meanings never mix without the
 *  user choosing one. */
type StatView = "build" | "max" | "base";

/** True from lg (1024 px), false below, null before the first client
 *  measurement (the server render and the first paint, where the CSS
 *  `hidden lg:block` / `lg:hidden` switches decide what is visible). After
 *  mount only one Progression panel instance exists: the column's from lg,
 *  the sheet's below. */
function useDesktopLayout(): boolean | null {
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

/** The stats a booster raises, as readable names ("Offensive Awareness, Ball Control, …"). */
const boosterStatNames = (b: { stats: Partial<Record<BaseStat, number>> }): string =>
  boosterLabel("Booster", (Object.entries(b.stats) as Array<[BaseStat, number]>).filter(([, v]) => typeof v === "number" && v !== 0)).replace(/^[^·]*·\s*/, "");

/** "Off" in words on a switched-off booster toggle (browser QA 2026-10-25
 *  (f)): the state was only an empty circle icon and `aria-pressed`; a
 *  Trending card's level pill already says "Off". Outside the truncating
 *  label, so it never gets cut. Hidden from assistive technology: the
 *  button's explicit name ends ", Off" (`boosterToggleName`) — a name built
 *  from the content got a layout space before the comma ("Balance , Off").
 *  The space before the badge (not rendered in the flex row) keeps "Off" a
 *  word of its own in the visible text. */
function BoosterOffBadge() {
  return (
    <>
      {" "}
      <span className="efb-booster-button__off" data-testid="booster-off" aria-hidden>
        Off
      </span>
    </>
  );
}

/** The name of an on / off booster toggle (change a11y-names-and-card-league
 *  D3): the slot, the visible label, then ", Off" when it is switched off —
 *  "Booster 1: +4 · Dribbling, Tight Possession, Speed, Balance, Off". */
const boosterToggleName = (slot: string, label: string, on: boolean): string => `${slot}: ${label}${on ? "" : ", Off"}`;

/** One booster control of the Overview card: the shared look, the readable
 *  label truncated on a wide mouse layout with the full text in a tooltip
 *  (wrapped on phones and touch devices). */
function BoosterButton({
  slot,
  tooltip,
  children,
  className = "",
  ...button
}: {
  slot: 1 | 2;
  tooltip: string;
  children: ReactNode;
  className?: string;
  onClick: () => void;
  onPointerEnter?: () => void;
  onFocus?: () => void;
  "aria-pressed"?: boolean;
  "aria-haspopup"?: "dialog";
  "aria-expanded"?: boolean;
  "aria-label"?: string;
  "data-state"?: string;
  "data-kind"?: string;
}) {
  return (
    <Tooltip content={<p className="text-sm text-white">{tooltip}</p>} className="efb-booster-tip">
      {(tp) => (
        <button
          {...tp}
          {...button}
          // The tooltip repeats the visible label; do not announce it twice.
          aria-describedby={undefined}
          type="button"
          onClick={(e) => {
            tp.onClick(e);
            button.onClick();
          }}
          onPointerEnter={(e) => {
            tp.onPointerEnter(e);
            button.onPointerEnter?.();
          }}
          onFocus={(e) => {
            tp.onFocus(e);
            button.onFocus?.();
          }}
          className={`efb-booster-button hit-44 ${className}`}
          data-testid={`progression-booster-${slot}`}
          data-usable="true"
        >
          {children}
        </button>
      )}
    </Tooltip>
  );
}

export function PlayerDetailClient({
  baseId,
  cardId,
  initialData,
  notes,
}: {
  baseId: string;
  cardId: string;
  initialData: PlayerCardDTO;
  /** Static explanatory copy of the Progression controls and the stat grid
   *  (build-notes.ts): sent with the server render, not in this bundle. */
  notes: BuildNotes;
}) {
  const searchParams = useSearchParams();
  const urlQs = searchParams.toString();
  const pagePath = `/players/${baseId}/${cardId}`;
  const mode = buildMode(initialData);
  const hasBuild = modeHasBuild(mode);
  const [statView, setStatView] = useState<StatView>(hasBuild ? "build" : "max");
  // Pinned category highlight (a Progression panel label press), the
  // transient hover / keyboard-focus preview of a category, and the open
  // Adjust popover's categories (a stat row, a strip item) — the popover wins,
  // then the preview, then the pin.
  const [highlight, setHighlight] = useState<StatHighlight>(null);
  const categoryPreview = useCategoryPreview();
  const [adjust, setAdjust] = useState<{ owner: string; cats: readonly TrainingCategory[] } | null>(null);
  const reportAdjust = useCallback((owner: string, cats: readonly TrainingCategory[] | null) => {
    setAdjust((cur) => (cats ? { owner, cats } : cur?.owner === owner ? null : cur));
  }, []);
  const [allVersions, setAllVersions] = useState(false);
  // "+N" in Other Versions: index of the version link to focus once the rest
  // is shown, and the polite announcement of it.
  const versionsListRef = useRef<HTMLUListElement>(null);
  const focusVersionRef = useRef<number | null>(null);
  const [versionsNotice, setVersionsNotice] = useState("");
  useLayoutEffect(() => {
    const index = focusVersionRef.current;
    if (!allVersions || index === null) return;
    focusVersionRef.current = null;
    versionsListRef.current?.querySelectorAll<HTMLElement>("a.pcb-tile")[index]?.focus();
  }, [allVersions]);
  // Below lg the long "how the build stats are made" explanation is behind a
  // small disclosure, so the stat grid starts right under the stat view
  // (always shown from lg).
  const [statsHelpOpen, setStatsHelpOpen] = useState(false);
  const statsHelpId = useId();

  // ---- The build and its URL ----
  // Read from the query on the server and in the first client render (the
  // same decode, so hydration matches). Lists a value is checked against
  // (picker managers, second boosters) are not loaded yet: those checks wait
  // (`resolveBuildLists` below).
  const [initial] = useState(() => decodeBuildQuery(urlQs, initialData));
  const [build, setBuildState] = useState<ProgressionState>(() => ({ ...initial.state, position: positionFromIndex(initialData.registeredPosition) }));
  const latest = useRef(build);
  // What the plain URL stands for: the opening state, plus the remembered
  // manager once it is applied (a build equal to it writes no query).
  const baseline = useRef<BuildUrlState>(openingBuildState(initialData));
  // The query last written or adopted, and the queries written but not yet
  // handed back by the router (their echoes change nothing).
  const lastQs = useRef(urlQs);
  const ownWrites = useRef<string[]>([]);
  // Max Level notice of the last change (the panel shows and announces it);
  // the link-correction message (page level, announced). Any change clears both.
  const [buildNotice, setBuildNotice] = useState<BuildNotice | null>(null);
  const [linkNotice, setLinkNotice] = useState("");

  const commitState = useCallback((next: ProgressionState) => {
    latest.current = next;
    setBuildState(next);
  }, []);
  const writeUrl = useCallback(
    (next: BuildUrlState) => {
      const qs = sameBuildState(next, baseline.current, initialData) ? "" : encodeBuildQuery(next, initialData).toString();
      if (qs === lastQs.current) return;
      lastQs.current = qs;
      ownWrites.current = [...ownWrites.current.slice(-31), qs];
      window.history.replaceState(null, "", qs ? `${pagePath}?${qs}` : pagePath);
    },
    [initialData, pagePath],
  );
  const setBuild = useCallback<ProgressionChange>(
    (next, meta: BuildChangeMeta = {}) => {
      commitState(next);
      setBuildNotice(meta.notice ?? null);
      setLinkNotice("");
      setStatView("build");
      if (meta.manager === "remember" && next.managerId) rememberManager(next.managerId);
      else if (meta.manager === "forget") forgetRememberedManager();
      writeUrl(next);
    },
    [commitState, writeUrl],
  );

  // A link that had to be corrected: announce it and rewrite the URL one tick
  // after mount (Next patches history.replaceState in an effect of the
  // router, which runs after this page's first effects).
  useEffect(() => {
    if (initial.corrections.length === 0) return;
    setLinkNotice(LINK_ADJUSTED);
    const t = window.setTimeout(() => writeUrl(latest.current), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The lists already loaded (set below, after their queries): a query
  // adopted later is checked against them at once, as their effect does not
  // run again for lists that did not change.
  const loadedLists = useRef<BuildQueryLists>({});

  // The router hands back the queries this page wrote (echoes) — forget them;
  // any other query is a navigation to this card with another build (or the
  // address edited): adopt it like a link.
  useEffect(() => {
    const at = ownWrites.current.indexOf(urlQs);
    if (at >= 0) {
      ownWrites.current = ownWrites.current.slice(at + 1);
      return;
    }
    if (urlQs === lastQs.current) return;
    lastQs.current = urlQs;
    ownWrites.current = [];
    baseline.current = openingBuildState(initialData);
    const d = decodeBuildQuery(urlQs, initialData, loadedLists.current);
    commitState({ ...d.state, position: latest.current.position });
    setBuildNotice(null);
    setLinkNotice(d.corrections.length > 0 ? LINK_ADJUSTED : "");
    if (d.corrections.length > 0) writeUrl({ ...d.state });
  }, [urlQs, initialData, commitState, writeUrl]);

  // ---- Remembered manager (D3) ----
  // Read after mount, only for a plain URL (build parameters decide alone).
  const [storedManagerId, setStoredManagerId] = useState<string | null>(null);
  useEffect(() => {
    if (!hasBuild || initial.hasBuildParams) return;
    const id = readRememberedManager();
    if (id === null) return;
    if (isIdParam(id)) setStoredManagerId(id);
    else forgetRememberedManager();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lists: requested on load when the build refers to them (a linked or
  // remembered manager, a linked second booster); otherwise by the drawers on
  // their first opening — the cache is shared.
  const pickerQ = trpc.manager.picker.useQuery(undefined, {
    enabled: hasBuild && (build.managerId !== null || storedManagerId !== null),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const secondQ = trpc.booster.secondChoices.useQuery(undefined, {
    enabled: build.secondBooster !== null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  useLayoutEffect(() => {
    loadedLists.current = {
      managerIds: pickerQ.data?.map((m) => m.id) ?? null,
      secondBoosterSlugs: secondQ.data?.map((b) => b.slug) ?? null,
    };
  }, [pickerQ.data, secondQ.data]);

  // The remembered manager, once the list answered: selected (its rating as
  // the proficiency, its pills) if it is a picker manager and the build is
  // still the opening one; an id that is not one is forgotten. No URL write.
  useEffect(() => {
    if (storedManagerId === null || !pickerQ.data) return;
    setStoredManagerId(null);
    const m = pickerQ.data.find((x) => x.id === storedManagerId);
    if (!m) {
      forgetRememberedManager();
      return;
    }
    const cur = latest.current;
    const opening = openingProgressionState(initialData);
    if (cur.position !== opening.position || !sameBuildState(cur, opening, initialData)) return;
    const next: ProgressionState = { ...cur, managerId: m.id, managerProficiency: m.rating };
    baseline.current = { ...openingBuildState(initialData), managerId: m.id, managerProficiency: m.rating };
    commitState(next);
  }, [storedManagerId, pickerQ.data, initialData, commitState]);

  // The deferred checks of a link: a manager id that is not a picker manager
  // and a second-booster slug that is not a choice are dropped once their
  // list answered — announced and written back.
  useEffect(() => {
    if (!pickerQ.data && !secondQ.data) return;
    const cur = latest.current;
    const res = resolveBuildLists(cur, { managerIds: pickerQ.data?.map((m) => m.id) ?? null, secondBoosterSlugs: secondQ.data?.map((b) => b.slug) ?? null });
    if (res.corrections.length === 0) return;
    const next: ProgressionState = { ...cur, ...res.state };
    commitState(next);
    setLinkNotice(LINK_ADJUSTED);
    writeUrl(next);
  }, [pickerQ.data, secondQ.data, commitState, writeUrl]);

  // Ids shared by the Progression card and the Build settings card.
  const progressionIdBase = useId().replace(/:/g, "");
  const desktop = useDesktopLayout();
  // Crossing lg unmounts the column's panel (or the dock): a label hovered or
  // focused, or a dock popover open, at that moment never reports its leave /
  // blur / close, so the preview and the popover highlight are dropped with it.
  const clearCategoryPreview = categoryPreview.clear;
  useEffect(() => {
    clearCategoryPreview();
    setAdjust(null);
  }, [desktop, clearCategoryPreview]);
  // Mobile Progression sheet. It can only be open below lg: crossing to lg
  // closes it (the Modal's `open` turns false and its close event resets this).
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetShown = sheetOpen && desktop === false;
  // Second-booster drawer (a card with a level cap above 1 and no usable
  // Booster 2 of its own).
  const [secondOpen, setSecondOpen] = useState(false);
  // The dock opens the sheet scrolled to the category rows. Called by the
  // Modal once the dialog is shown and laid out (`onShown`); the offset is
  // taken between two rects of the same translated panel, so the slide-in
  // does not skew it, and only the sheet's scrolling body moves.
  const scrollSheetToCategories = (dialog: HTMLDialogElement) => {
    const cats = document.getElementById(progressionIds(progressionIdBase).cats);
    const body = cats?.closest<HTMLElement>(".efb-modal__body");
    if (!cats || !body || !dialog.contains(body)) return;
    const padTop = parseFloat(getComputedStyle(body).paddingTop) || 0;
    body.scrollTop = Math.max(0, body.scrollTop + cats.getBoundingClientRect().top - body.getBoundingClientRect().top - padTop);
  };

  const q = trpc.player.byId.useQuery({ baseId, cardId }, { initialData });
  const p = q.data ?? initialData;

  // ---- Match state (D1: not the build; off for any other card) ----
  const [matchHeld, setMatchHeld] = useState<HeldMatchState>(() => ({ ...MATCH_STATE_OFF, cardId }));
  const match: MatchState = matchStateForCard(matchHeld, cardId);
  const setMatch = useCallback(
    (next: MatchState) => {
      setMatchHeld({ weakFoot: next.weakFoot, positionTraining: next.positionTraining, cardId });
      // A press shows the build's stats (the chips exist in that view only).
      setStatView("build");
    },
    [cardId],
  );

  // The list entries the build refers to, once loaded.
  const refManager = (build.managerId !== null && pickerQ.data?.find((m) => m.id === build.managerId)) || null;
  const refSecond = (build.secondBooster !== null && secondQ.data?.find((b) => b.slug === build.secondBooster)) || null;
  const refs = useMemo<BuildRefs>(() => ({ manager: refManager, second: refSecond }), [refManager, refSecond]);
  const managerPending = build.managerId !== null && refManager === null;

  // Pure, client-side engine (packages/shared: progression.ts, build.ts).
  const buildResult = useMemo(
    () => simulateCardBuild(p, build, build.position, { manager: refs.manager, second: refs.second, matchState: match }),
    [p, build, refs, match],
  );
  const canSpend = canSpendPoints(mode, build);
  useEffect(() => {
    if (!canSpend) setAdjust(null);
  }, [canSpend]);

  // Skill slug → skill (the DTO carries slugs; name, group, artwork, description
  // and boosts live in skill.list).
  const skillsQ = trpc.skill.list.useQuery({}, { staleTime: 60 * 60_000 });
  const skillBySlug = useMemo(() => {
    const map = new Map<string, SkillDTO>();
    for (const s of skillsQ.data ?? []) map.set(s.slug, s);
    return map;
  }, [skillsQ.data]);

  if (q.isError) {
    return <QueryErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load this player" />;
  }
  if (!p) {
    // The server wrapper already 404s; this only happens if the card vanished
    // between the server render and a client refetch.
    return (
      <div className="efb-card space-y-3 p-12 text-center text-sm text-[var(--color-text-secondary)]">
        <p>Player card not found.</p>
        <Link href="/players" className="button button--sm button--secondary">
          Back to Players
        </Link>
      </div>
    );
  }

  const pos = positionOf(p.registeredPosition);
  const posLabel = pos === "—" ? "—" : POSITION_LABEL[pos];
  const playstyleAtk = playingStyleLabel(p.playingStyleAttack);
  const playstyleDef = playingStyleLabel(p.playingStyleDefense);
  const packTitle = p.pack?.name ?? CARD_TYPE_LABELS[p.cardType];
  const heightImperial = formatFeetInches(p.height);
  const condLetter = p.condition && /^[a-eA-E]$/.test(p.condition) ? p.condition.toUpperCase() : null;

  const orderedSkills = orderSkills(p.skills, skillBySlug);
  const skillLabels = orderedSkills.map((slug) => skillDisplayName(slug, skillBySlug.get(slug)));
  const showtimeCount = orderedSkills.filter((slug) => isShowtimeSkill(skillBySlug.get(slug))).length;
  // Overview paragraph: up to two skill links, Showtime first — only once the
  // skill list is loaded (before that the groups and names are unknown).
  const overviewSkills = skillsQ.data ? orderedSkills.slice(0, OVERVIEW_SKILL_LINKS) : [];
  const otherSkills = orderedSkills.length - overviewSkills.length;

  const regPos: Position = POSITIONS[p.registeredPosition] ?? "GK";
  const fullPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 0);
  const halfPositions = POSITIONS.filter((k) => p.positionAptitudes[k] === 1);

  const customBuild = hasBuild && isCustomBuild(build, p);
  const view: StatView = hasBuild ? statView : statView === "build" ? "max" : statView;
  // The shown stats (with the weak-foot deduction while Weak foot is on).
  const stats = view === "build" ? buildResult.shownStats : view === "max" ? p.maxStats : p.stats;
  const boosterDeltas = view === "build" ? buildResult.boosterDeltas : undefined;
  const managerDeltas = view === "build" ? buildResult.managerDeltas : undefined;
  const weakFootDeltas = view === "build" && match.weakFoot ? buildResult.weakFootDeltas : undefined;
  // The build's overall at the selected position at the card's own
  // proficiency: Position Training never moves the face, the "Build (N)"
  // label or the stats heading (the panel overall and the tiles follow it).
  const buildOvr = buildResult.untrainedTiles[build.position];
  // Position tiles (exact formula): the build's when the card has one (the
  // tile at the panel's position is the panel's overall; trained positions at
  // full while Position Training is on), else the stats in the grid. Best
  // Fit = the highest tile (registered position on a tie).
  const tiles = hasBuild ? buildResult.tiles : positionTiles(stats, { height: p.height, weakFootAccuracy: p.weakFootAccuracy }, p.positionAptitudes);
  const trained = hasBuild ? buildResult.trainedPositions : [];
  const bestPos = bestFitPosition(tiles, regPos);
  // The "At <POS>" tile reads the position the card face prints: the one
  // chosen in Build settings when the card has a build, else the registered
  // one.
  const atPos: Position = hasBuild ? build.position : regPos;
  // Without a build the card's level cap is 1: "Max" = base + Booster 1 (dump).
  const tilesSource = hasBuild ? "current build" : view === "max" ? "max-level stats (Booster 1 on)" : "level-1 stats";
  // The card face prints the build's overall at the selected position with
  // that position's label (as the reference prints "108 RWF" there — also at
  // level 1, where the proficiency bonus is included); the header pill is the
  // dump's max overall with its visible "dump max · no proficiency bonus"
  // note, so the two are never confused.
  const cardPlayer = hasBuild ? { ...p, ovr: buildOvr, registeredPosition: POSITIONS.indexOf(build.position) } : p;
  const atkDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleAtk];
  const defDesc = PLAYING_STYLE_DESCRIPTIONS[playstyleDef];
  const onHighlight = (next: TrainingCategory | null) => setHighlight(next);
  // What the grid and the strip light: an open Adjust popover's categories,
  // else the hovered / focused category, else the pinned one.
  const activeCats: ActiveCategories = adjust?.cats ?? (categoryPreview.preview ? [categoryPreview.preview] : highlight ? [highlight] : null);
  const renderAdjust = (cats: readonly TrainingCategory[], headingId: string) => (
    <CategoryAdjust cats={cats} state={build} result={buildResult} onChange={setBuild} headingId={headingId} />
  );

  // ---- Boosters (Overview card; D4) ----
  const b1Levels = booster1Levels(p);
  const b2Levels = ownBooster2Levels(p);
  const takesSecond = takesSecondBooster(p);
  const boosterInfo = [boosterSummary(p, 0), boosterSummary(p, 1)] as const;
  const cycleB1 = () => setBuild({ ...build, booster1: nextBoosterLevel(b1Levels, build.booster1) });
  const toggleB2 = () => setBuild({ ...build, booster2: nextBoosterLevel(b2Levels, build.booster2) });
  const chooseSecond = (b: SecondBoosterDTO) => {
    setSecondOpen(false);
    setBuild({ ...build, secondBooster: build.secondBooster === b.slug ? null : b.slug });
  };
  const clearSecond = () => {
    setSecondOpen(false);
    setBuild({ ...build, secondBooster: null });
  };
  const hasSlot1 = p.booster1 !== null || (p.boosterId1 ?? 0) > 0;
  const boosterControls: ReactNode[] = [];
  if (!hasBuild) {
    // No build (a card with a level cap of 1 that is neither Highlight nor
    // Trending): static labels; Booster 1 is already inside the dump's
    // max-level stats (said in visible text, not only in a title).
    if (boosterInfo.some((i) => i.usable)) {
      boosterInfo.forEach((info, slot) =>
        boosterControls.push(
          <div key={slot} className="efb-booster-button" data-testid={`progression-booster-${slot + 1}`} data-usable={info.usable ? "true" : "false"}>
            <Sparkles className="size-4 shrink-0" aria-hidden />
            <span className="efb-booster-button__label efb-booster-button__label--wrap min-w-0 break-words">
              <span className="sr-only">Booster {slot + 1}: </span>
              {info.label}
              {info.usable && slot === 0 && <span className="text-[var(--color-text-secondary)]"> (in the max-level stats)</span>}
            </span>
          </div>,
        ),
      );
    }
  } else {
    // Booster 1: on / off, or a Trending card's +3 → off → +1 → +2 cycle
    // (level text, three level bars, the level in the accessible name).
    if (b1Levels.length > 0 && p.booster1) {
      const trending = b1Levels === TRENDING_BOOSTER_CYCLE;
      const b1Level: BoosterLevel = build.booster1;
      const on = b1Level !== 0;
      const names = boosterStatNames(p.booster1);
      if (trending) {
        const n = b1Level === "full" ? TRENDING_BOOSTER_MAGNITUDE : b1Level;
        const levelText = n === 0 ? "Off" : `+${n}`;
        boosterControls.push(
          <BoosterButton
            key="b1"
            slot={1}
            tooltip={`Booster 1: ${levelText} · ${names}`}
            onClick={cycleB1}
            aria-pressed={on}
            // The visible "+3 · Low Pass, …" (or "Off · …") in order, then
            // the level and the action (WCAG 2.5.3 Label in Name).
            aria-label={`Booster 1: ${levelText} · ${names}${n === 0 ? "" : `, level +${n} of +${TRENDING_BOOSTER_MAGNITUDE}`} — change level`}
            data-state={String(n)}
            data-kind="levels"
            className="efb-booster-button--levels"
          >
            <span className="efb-booster-levels" aria-hidden data-testid="booster-level-bars">
              {Array.from({ length: TRENDING_BOOSTER_MAGNITUDE }, (_, i) => (
                <span key={i} className="efb-booster-levels__bar" data-on={i < n ? "true" : undefined} />
              ))}
            </span>
            <span className="efb-booster-button__label min-w-0" aria-hidden>
              <span className="efb-booster-button__level" data-testid="booster-level-text">
                {levelText}
              </span>{" "}
              · {names}
            </span>
          </BoosterButton>,
        );
      } else {
        const StateIcon = on ? CircleCheck : Circle;
        boosterControls.push(
          <BoosterButton
            key="b1"
            slot={1}
            tooltip={`Booster 1: ${boosterInfo[0].label}`}
            onClick={cycleB1}
            aria-pressed={on}
            aria-label={boosterToggleName("Booster 1", boosterInfo[0].label, on)}
          >
            <StateIcon className="size-4 shrink-0" aria-hidden data-testid="booster-state-icon" data-state={on ? "on" : "off"} />
            <span className="efb-booster-button__label min-w-0">{boosterInfo[0].label}</span>
            {!on && <BoosterOffBadge />}
          </BoosterButton>,
        );
      }
    } else if (hasSlot1) {
      // Booster 1 without stat data (or an unknown id): a label, no control.
      boosterControls.push(
        <div key="b1" className="efb-booster-button" data-testid="progression-booster-1" data-usable="false">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          <span className="efb-booster-button__label efb-booster-button__label--wrap min-w-0 break-words">
            <span className="sr-only">Booster 1: </span>
            {boosterInfo[0].label}
          </span>
        </div>,
      );
    }
    // Booster 2: the card's own (a fixed orange pill, on / off), else the
    // "Select Booster" slot (a card with a level cap above 1), else a
    // Trending card's own one applied as it is.
    if (b2Levels.length > 0 && p.booster2) {
      const on = build.booster2 !== 0;
      const StateIcon = on ? CircleCheck : Circle;
      boosterControls.push(
        <BoosterButton
          key="b2"
          slot={2}
          tooltip={`Booster 2 (the card's own): ${boosterInfo[1].label}`}
          onClick={toggleB2}
          aria-pressed={on}
          aria-label={boosterToggleName("Booster 2, the card's own", boosterInfo[1].label, on)}
          data-kind="own"
          className="efb-booster-button--own"
        >
          <StateIcon className="size-4 shrink-0" aria-hidden data-testid="booster-state-icon" data-state={on ? "on" : "off"} />
          <span className="efb-booster-button__label min-w-0">{boosterInfo[1].label}</span>
          {!on && <BoosterOffBadge />}
        </BoosterButton>,
      );
    } else if (takesSecond) {
      const chosen: SecondBoosterDTO | null = refs.second;
      const pending = build.secondBooster !== null && chosen === null;
      const chosenLabel = chosen ? boosterLabel(chosen.name, Object.entries(chosen.stats) as Array<[BaseStat, number]>) : null;
      boosterControls.push(
        <BoosterButton
          key="b2"
          slot={2}
          tooltip={chosenLabel ? `Booster 2: ${chosenLabel} — change or clear` : "Booster 2: choose a second booster"}
          onClick={() => {
            prefetchSecondBoosterPicker();
            setSecondOpen(true);
          }}
          onPointerEnter={prefetchSecondBoosterPicker}
          onFocus={prefetchSecondBoosterPicker}
          aria-haspopup="dialog"
          aria-expanded={secondOpen}
          data-kind="second"
          data-state={chosen ? "chosen" : "empty"}
          className={chosen ? "efb-booster-button--chosen" : "efb-booster-button--select"}
        >
          <Sparkles className="size-4 shrink-0" aria-hidden />
          <span className="efb-booster-button__label min-w-0">
            <span className="sr-only">Booster 2: </span>
            {chosenLabel ?? (pending ? "Loading booster…" : "Select Booster")}
          </span>
        </BoosterButton>,
      );
    } else if (p.booster2 && boosterInfo[1].usable) {
      boosterControls.push(
        <div key="b2" className="efb-booster-button" data-testid="progression-booster-2" data-usable="true">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          <span className="efb-booster-button__label efb-booster-button__label--wrap min-w-0 break-words">
            <span className="sr-only">Booster 2: </span>
            {boosterInfo[1].label}
          </span>
        </div>,
      );
    }
  }

  const versionPreviews: CardPreview[] = p.otherVersions.map((v) => ({
    id: v.id,
    baseId: p.baseId,
    name: p.name,
    cardType: v.cardType,
    ovr: v.ovr,
    maxOvr: v.maxOvr,
    registeredPosition: v.registeredPosition,
    condition: "",
  }));
  // Up to 8 slots; when there are more versions the 8th slot is a "+N" tile
  // that shows the rest.
  const collapsed = !allVersions && versionPreviews.length > VERSIONS_PREVIEW;
  const shownVersions = collapsed ? versionPreviews.slice(0, VERSIONS_PREVIEW - 1) : versionPreviews;
  const hiddenVersions = versionPreviews.length - shownVersions.length;

  const level = buildResult.config.managerProficiency;
  const statsHeading =
    view === "build"
      ? `Stats · ${customBuild ? "custom build" : mode === "capped" ? "Max-OVR build" : "opening build"} · ${mode === "trending" ? "" : `level ${build.maxLevel} · `}${
          refs.manager ? `${refs.manager.name} (${level})` : `proficiency ${level}`
        } · ${buildOvr} at ${build.position}`
      : view === "max"
        ? `Stats at max level ${p.levelCap} (dump)`
        : "Stats at level 1";

  const viewOptions: Array<[StatView, string]> = hasBuild
    ? [
        ["build", `Build (${buildOvr})`],
        ["max", `Max (${p.maxOvr})`],
        ["base", `Base (${p.ovr})`],
      ]
    : [
        ["max", `Max (${p.maxOvr})`],
        ["base", `Base (${p.ovr})`],
      ];

  // The league mark names the card's own league — the one the League filter
  // matches —, the team's only when the card stores none (`cardLeagueOf`).
  const league = cardLeagueOf(p);
  const marks: Array<{ key: string; src: string | null | undefined; name: string | null | undefined; fallback: string; fill: boolean }> = [
    { key: "nation", src: p.flagUrl, name: p.countryName, fallback: "Nationality", fill: true },
    { key: "team", src: p.teamEmblemUrl, name: p.teamName, fallback: "Team", fill: false },
    { key: "league", src: league?.emblemUrl, name: league?.name, fallback: "League", fill: false },
  ];

  return (
    <div data-card-tint={p.cardType}>
      {/* Breadcrumb (a navigation landmark; the last item is the page) */}
      <nav aria-label="Breadcrumb">
        <ol data-slot="breadcrumbs" className="breadcrumbs -ml-0.5 mb-3 list-none p-0">
          <li className="breadcrumbs__item">
            <Link className="breadcrumbs__link hit-44" href="/">
              Home
            </Link>
            <span className="breadcrumbs__separator" aria-hidden>
              ›
            </span>
          </li>
          <li className="breadcrumbs__item">
            <Link className="breadcrumbs__link hit-44" href="/players">
              Players
            </Link>
            <span className="breadcrumbs__separator" aria-hidden>
              ›
            </span>
          </li>
          <li className="breadcrumbs__item breadcrumbs__item--muted">
            {p.name}
            <span className="breadcrumbs__separator" aria-hidden>
              ›
            </span>
          </li>
          <li className="breadcrumbs__item" aria-current="page">
            {packTitle}
          </li>
        </ol>
      </nav>

      {/* ================= HEADER: name + one OVR pill ================= */}
      <header className="mb-10 min-w-0 text-center lg:text-left">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
          <h1 className="text-display-sm md:text-display font-bold text-white">{p.name}</h1>
          <span className="chip chip--accent chip--lg tabular-nums" data-testid="ovr-pill">
            <span className="chip__label">{p.maxOvr} OVR</span>
          </span>
          {/* Visible qualifier: the pill is the dump's max overall (Booster 1,
              no Manager Proficiency bonus), so it sits below the build estimate
              the card face prints at proficiency 90. */}
          {/* Header text sits on the aurora + card-type tint: the on-backdrop
              tone (≥ 4.8:1 there), not the muted token. */}
          <span className="text-caption whitespace-nowrap text-[var(--color-text-on-backdrop)]" data-testid="ovr-pill-note">
            dump max · no proficiency bonus
          </span>
          {/* The full explanation, once only in a `title` (unreachable by
              keyboard and touch — browser QA 2026-10-25 (d)): read after the
              visible note, not shown again. */}
          <span className="sr-only" data-testid="ovr-pill-explanation">
            The pill is the overall at max level {p.levelCap} from the data dump, with Booster 1 only and no Manager Proficiency bonus; the card shows the overall of the
            current build.
          </span>
        </div>
        {/* A <div>, not a <p>: the playstyle triggers render their tooltip
            and popover (<div>s) next to the button. */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-[var(--color-text-on-backdrop)] lg:justify-start" data-testid="hero-line">
          {/* Each item after the first carries its own "·", so a wrapped line
              never ends on a dangling separator. */}
          <span>{posLabel}</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_attack.svg" alt="" width={12} height={12} className="size-3" />
            <PlaystyleTrigger style={playstyleAtk} kind="attack" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>·</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/playstyle_defence.svg" alt="" width={12} height={12} className="size-3" />
            <PlaystyleTrigger style={playstyleDef} kind="defence" />
          </span>
          {condLetter && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>·</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={conditionUrl(condLetter)} alt="" width={12} height={12} loading="lazy" decoding="async" className="size-3" />
              <span>
                <span className="sr-only">Condition: </span>
                {conditionLabel(condLetter)}
              </span>
            </span>
          )}
        </div>
        {/* A corrected link (over budget, out of range, an unknown manager
            or booster): always rendered — empty in the server HTML, filled
            after mount — so the message is announced. */}
        <p role="status" aria-live="polite" className="efb-link-notice" data-testid="build-link-notice">
          {linkNotice}
        </p>
      </header>

      {/* ======= TWO COLUMNS, then the full-width row (DOM order = phone order) ======= */}
      <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left column (from lg as tall as the main column): the flexible
            wrapper with the face, the marks and the pinned Progression card —
            the card's travel range — then the Build settings card at the
            column's end, outside that range, so the pinned card never covers
            it. */}
        <div className="flex flex-col gap-6 lg:col-start-1">
        <div className="flex flex-col gap-6 lg:flex-1">
        <div className="flex flex-col items-center gap-3">
          <div className="w-[180px]">
            <PlayerCard player={cardPlayer} size="full" caption="none" priority />
          </div>
          {hasBuild && (
            // The face's OVR block is the build's overall (no tag on the face).
            <p className="sr-only" data-testid="card-build-overall">
              The card shows the overall of the current build: {buildOvr} at {build.position}.
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            {marks.map((m) => (
              <span key={m.key} className={`efb-detail-mark ${m.src ? "" : "bg-[var(--color-default)]"}`} title={m.name ?? m.fallback}>
                {m.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.src}
                    alt={m.name ?? ""}
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    className={m.fill ? "size-full object-cover" : "size-full object-contain"}
                  />
                ) : (
                  <span className="text-[10px] text-[var(--color-text-secondary)]">
                    <span aria-hidden>—</span>
                    <span className="sr-only">{m.fallback} unknown</span>
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Progression (or the Trending card's "Build") — none for the other
            level-cap-1 cards. From lg: the card pinned at 64 px (it fits a
            900 px viewport; a max height of the viewport below the header,
            scrolling inside, is only a safety net). Below lg it is not
            rendered here (the dock and the sheet below take over); before
            the first client measurement CSS hides it on a phone. */}
        {hasBuild ? (
          desktop !== false && (
            <div className="efb-progression-sticky hidden lg:block">
              <ProgressionPanel
                player={p}
                state={build}
                result={buildResult}
                refs={refs}
                managerPending={managerPending}
                onChange={setBuild}
                notice={buildNotice}
                idBase={progressionIdBase}
                highlight={highlight}
                onHighlight={onHighlight}
                preview={categoryPreview.bind}
                notes={notes}
                match={match}
                onMatchChange={setMatch}
              />
            </div>
          )
        ) : (
          <p data-testid="progression-none" className="efb-card text-sm text-[var(--color-text-secondary)]">
            No Progression panel for this card: its max level is 1, so it has no training points to spend.
          </p>
        )}
        </div>
        {hasBuild && desktop !== false && (
          <div className="hidden lg:block">
            <BuildSettings
              player={p}
              state={build}
              result={buildResult}
              refs={refs}
              onChange={setBuild}
              idBase={progressionIdBase}
              notes={notes}
              match={match}
              onMatchChange={setMatch}
            />
          </div>
        )}
        </div>

        {/* ================= MAIN COLUMN ================= */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:self-start">
          {/* Overview */}
          <section aria-labelledby="overview-title" className="efb-card space-y-4">
            <div className="-mx-4 flex items-end justify-between gap-3 border-b border-[var(--color-line-separator)] px-4">
              <h2 id="overview-title" className="efb-card__title inline-block border-b-2 border-[var(--color-accent)] pb-1.5">
                Overview
              </h2>
              {/* Compare shortcut (the reference's 32 × 32 ghost icon link at
                  the right of its tab row): this card in the left slot, with
                  its default compare build (the `left` / `right` form of the
                  two-build compare; an old `?ids=` link still opens). */}
              <Link
                href={`/compare?left=${p.id}`}
                aria-label={`Compare ${p.name}`}
                className="button button--sm button--ghost button--icon-only mb-1 shrink-0"
                data-testid="overview-compare"
              >
                <Swords className="size-4" aria-hidden />
              </Link>
            </div>
            {/* Description built from parts (a <div>, not a <p>: the inline
                triggers render their tooltip and popover <div>s next to them):
                the playing styles are description triggers, up to two skills
                (Showtime first) are skill links with the preview, then "and
                other N player skills". */}
            <div className="text-sm leading-6 text-white/85" data-testid="overview-text">
              {p.name}&apos;s {CARD_TYPE_LABELS[p.cardType]} card{p.pack ? ` from "${p.pack.name}"` : ""} is rated {p.ovr}
              {p.maxOvr > p.ovr ? `, peaking at ${p.maxOvr} at level ${p.levelCap}` : ""}. A {p.height} cm ({heightImperial}) {posLabel} with the{" "}
              <PlaystyleTrigger style={playstyleAtk} kind="attack" /> playing style
              {playstyleDef !== "Basic" && (
                <>
                  {" "}
                  and the <PlaystyleTrigger style={playstyleDef} kind="defence" /> defensive style
                </>
              )}
              {p.countryName ? `, from ${p.countryName}` : ""}
              {p.teamName ? `, playing for ${p.teamName}` : ""}.{p.releaseDate ? ` Released ${formatUtcDate(p.releaseDate)}.` : ""}{" "}
              {orderedSkills.length === 0 ? (
                "Has no skills."
              ) : overviewSkills.length === 0 ? (
                `Features ${orderedSkills.length} skill${orderedSkills.length === 1 ? "" : "s"}.`
              ) : (
                <>
                  Features{" "}
                  {overviewSkills.map((slug, i) => (
                    <span key={slug}>
                      {i > 0 && (otherSkills > 0 ? ", " : " and ")}
                      <SkillChip slug={slug} label={skillLabels[i]!} skill={skillBySlug.get(slug)} variant="inline" />
                    </span>
                  ))}
                  {otherSkills > 0 ? ` and other ${otherSkills} player skill${otherSkills === 1 ? "" : "s"}` : ""}.
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-white/85" data-testid="spec-line">
              <span className="inline-flex items-center gap-1.5">
                <MoveVertical className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                {p.height} CM
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Weight className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                {p.weight} KG
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                {p.age} years
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Footprints className="size-4 text-[var(--color-text-secondary)]" aria-hidden />
                Strong Foot: {p.strongerFoot === 1 ? "Left" : p.strongerFoot === 2 ? "Both" : "Right"}
              </span>
              <span aria-hidden className="text-[var(--color-text-secondary)]">·</span>
              <span className="inline-flex items-center gap-1.5">
                WF Accuracy <WeakFootStars level={p.weakFootAccuracy} label="Weak foot accuracy" />
              </span>
              <span className="inline-flex items-center gap-1.5">
                WF Usage <WeakFootStars level={p.weakFootUsage} label="Weak foot usage" />
              </span>
            </div>

            {canSpend && (
              <CategoryRow
                allocation={build.allocation}
                active={activeCats}
                preview={categoryPreview.bind}
                renderAdjust={(cat, headingId) => renderAdjust([cat], headingId)}
                onAdjust={reportAdjust}
              />
            )}

            {/* Two columns; a single booster control takes the whole row, so
                its stat list is not cut at half width (browser QA 2026-10-25
                (g): a Trending card's "+3 · GK Awareness, …" at 1440 px). */}
            {boosterControls.length > 0 && (
              <div className={`grid gap-2 ${boosterControls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`} role="group" aria-label="Boosters" data-testid="booster-row">
                {boosterControls}
              </div>
            )}
            {takesSecond && (
              <DeferredSecondBoosterPicker open={secondOpen} onClose={() => setSecondOpen(false)} selectedSlug={build.secondBooster} onChoose={chooseSecond} onClear={clearSecond} />
            )}

            {/* Stat view: build projection (default) / dump max / base. */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <h3 className="min-w-0 text-sm font-medium text-white" data-testid="stats-heading">
                {statsHeading}
              </h3>
              {/* Below 400 px the three items may not fit: the track scrolls
                  sideways there, with 6 px padding so the focus ring and the
                  44 px touch area stay inside the scroller. */}
              <div className="segment max-w-full max-[399px]:overflow-x-auto max-[399px]:overflow-y-hidden max-[399px]:p-1.5" role="group" aria-label="Stat view">
                {viewOptions.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    data-testid={`stat-view-${v}`}
                    onClick={() => setStatView(v)}
                    className="segment__item hit-44"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {view === "build" && (
              <button
                type="button"
                aria-expanded={statsHelpOpen}
                aria-controls={statsHelpId}
                onClick={() => setStatsHelpOpen((v) => !v)}
                className="efb-inline-disclosure hit-44 lg:hidden"
              >
                How these stats are built
                <ChevronDown className={`size-3.5 transition-transform motion-reduce:transition-none ${statsHelpOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
            )}
            {view === "build" && (
              <p id={statsHelpId} className={`text-xs text-[var(--color-text-secondary)] ${statsHelpOpen ? "" : "max-lg:hidden"}`}>
                {notes.statsHelp}
                {canSpend
                  ? highlight
                    ? " click the pinned Progression category again to clear its highlight."
                    : " hovering or focusing a category previews the stats it trains; a strip item or a stat opens its category's controls, a Progression category label pins the highlight."
                  : " this card's build has no training points to spend."}
              </p>
            )}
            <StatGrid
              values={stats}
              boosterDeltas={boosterDeltas}
              managerDeltas={managerDeltas}
              weakFootDeltas={weakFootDeltas}
              highlight={activeCats}
              renderAdjust={canSpend ? (stat, headingId) => renderAdjust(STAT_CATEGORIES[stat], headingId) : undefined}
              onAdjust={reportAdjust}
            />

            {/* Skills — Showtime first (gold), classic after; each chip links
                to the skill's page with a preview of its artwork,
                description and boosts (a popover with the link on touch). */}
            <div className="pt-1">
              <h3 className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
                Skills · {skillLabels.length}
                {showtimeCount ? ` · ${showtimeCount} Showtime` : ""}
              </h3>
              {skillLabels.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No skills.</p>
              ) : skillsQ.isPending ? (
                // Same chip height while the skill list loads (it is cached for an hour).
                <ul className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading skills">
                  {orderedSkills.map((slug) => (
                    <li key={slug} className="h-[30px] w-28 animate-pulse rounded-lg bg-[var(--color-default)]" />
                  ))}
                </ul>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-label="Skills" data-testid="skill-list">
                  {orderedSkills.map((slug, i) => (
                    <li key={slug} className="min-w-0 max-w-full">
                      <SkillChip slug={slug} label={skillLabels[i]!} skill={skillBySlug.get(slug)} />
                    </li>
                  ))}
                </ul>
              )}
              {/* The skill list failed (API error, offline): the chips keep
                  their fallback names; this line says so and retries. */}
              {skillsQ.isError && skillLabels.length > 0 && (
                <InlineQueryError
                  error={skillsQ.error}
                  onRetry={() => void skillsQ.refetch()}
                  what="the skill details"
                  className="mt-2"
                  data-testid="skill-list-error"
                />
              )}
            </div>
          </section>

          <BodyModel player={p} />

          {/* ================= POSITION & PLAYSTYLE ================= */}
          <section aria-labelledby="pos-title" className="efb-card space-y-3">
            <h2 id="pos-title" className="efb-card__title">
              Position &amp; Playstyle
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="efb-detail-tile min-h-[92px]">
                <div className="text-sm text-[var(--color-text-secondary)]">Best Fit</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">{POSITION_LABEL[bestPos]}</span>
                  <span className={`text-sm font-semibold tabular-nums ${statTierClass(tiles[bestPos])}`} data-testid="best-fit-value">
                    {tiles[bestPos]}
                  </span>
                </div>
              </div>
              <div className="efb-detail-tile min-h-[92px]">
                <div className="text-sm text-[var(--color-text-secondary)]">At {POSITION_LABEL[atPos]}</div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
                  <span className={`text-2xl font-bold tabular-nums ${statTierClass(tiles[atPos])}`} data-testid="at-position-value">
                    {tiles[atPos]}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)]">{tilesSource}</span>
                </div>
              </div>
              <div className="efb-detail-tile min-h-[92px]">
                <div className="text-sm text-[var(--color-text-secondary)]">Proficiency</div>
                {/* textContent reads "N Full · N Half" (catalog-browsing-parity). */}
                <div className="mt-2 text-sm text-[var(--color-text-secondary)]" data-testid="proficiency-text">
                  <span className="text-2xl font-bold tabular-nums text-[var(--color-accent)]">{fullPositions.length}</span> Full
                  {halfPositions.length > 0 && (
                    <>
                      {" · "}
                      <span className="text-2xl font-bold tabular-nums text-white">{halfPositions.length}</span> Half
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 20 px between the pitch and the style panel from 768 px (the
                reference's gap: 382 + 20 + 382 in its 784 px card at 1440). */}
            <div className="grid items-start gap-3 md:grid-cols-2 md:gap-5">
              {/* The pitch box (#272727, radius 12, padding 16 — the
                  reference's 382 × 352 at 1440), then the legend and the note
                  under it, outside the box. */}
              <div className="flex min-w-0 flex-col items-center gap-3">
                <PitchMap positionAptitudes={p.positionAptitudes} tiles={tiles} registeredPosition={regPos} trainedPositions={trained} />
                <p className="w-full text-xs leading-relaxed text-[var(--color-text-secondary)]" data-testid="pitch-note">
                  Overall at each position, computed with the game&apos;s overall formula from the {tilesSource}.
                  {hasBuild ? "" : " The formula matched every measured tile on the five surveyed cards; other cards are checked in bulk only, not tile by tile."}
                  {trained.length > 0 ? ` Position Training is on: ${trained.join(", ")} scored at full proficiency.` : ""}
                </p>
              </div>

              <div className="divide-y divide-[var(--color-line-separator)] rounded-2xl bg-[var(--color-panel)] p-4 [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
                {/* Attack playing style — from the attacking data */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_attack.svg" alt="" width={20} height={20} className="size-5" />
                    <span className="text-xl font-semibold text-white">{playstyleAtk}</span>
                    <span className="ml-auto text-xs text-[var(--color-text-secondary)]">Attack</span>
                  </div>
                  {atkDesc && <p className="text-sm text-[var(--color-text-secondary)]">{atkDesc}</p>}
                  <KeyStats statKeys={ATTACK_KEY_STATS} values={stats} boosterDeltas={boosterDeltas} weakFootDeltas={weakFootDeltas} />
                </div>

                {/* Defence playing style — from the defensive data */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/playstyle_defence.svg" alt="" width={20} height={20} className="size-5" />
                    <span className="text-xl font-semibold text-white">{playstyleDef}</span>
                    <span className="ml-auto text-xs text-[var(--color-text-secondary)]">Defence</span>
                  </div>
                  {playstyleDef === "Basic" ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">No defensive playing style — the AI defends with the default behaviour.</p>
                  ) : (
                    defDesc && <p className="text-sm text-[var(--color-text-secondary)]">{defDesc}</p>
                  )}
                  <KeyStats statKeys={DEFENCE_KEY_STATS} values={stats} boosterDeltas={boosterDeltas} weakFootDeltas={weakFootDeltas} />
                </div>

                {/* Compatible positions (aptitude data) */}
                <div className="space-y-2">
                  <div className="text-sm text-[var(--color-text-secondary)]">Compatible positions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fullPositions.map((role) => (
                      <span key={role} className="rounded-md bg-[#5cbf2a] px-2 py-0.5 text-sm font-semibold text-black">
                        {role}
                        <span className="sr-only"> (fully proficient)</span>
                      </span>
                    ))}
                    {halfPositions.map((role) => (
                      <span key={role} className="rounded-md bg-[#3d6b25] px-2 py-0.5 text-sm font-semibold text-white">
                        {role}
                        <span className="sr-only"> (half proficient)</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* AI Playing Styles */}
                <div className="space-y-2">
                  <div className="text-sm text-[var(--color-text-secondary)]">AI Playing Styles</div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["trickster", "Trickster"],
                        ["mazingRun", "Mazing Run"],
                        ["speedingBullet", "Speeding Bullet"],
                        ["incisiveRun", "Incisive Run"],
                        ["longBallExpert", "Long Ball Expert"],
                        ["earlyCross", "Early Crosser"], // efootbase's name, same as AI_PLAYING_STYLES / the filter
                      ] as const
                    )
                      .filter(([key]) => p.playstyles[key])
                      .map(([key, label]) => (
                        <span key={key} className="rounded-lg bg-[var(--color-default)] px-2.5 py-1 text-sm font-semibold text-white">
                          {label}
                        </span>
                      ))}
                    {Object.values(p.playstyles).every((v) => !v) && <span className="text-sm text-[var(--color-text-secondary)]">None.</span>}
                  </div>
                </div>

                {/* WF / Form / Injury Resistance (the reference's star list) */}
                <dl className="space-y-1.5 text-sm" data-testid="star-list">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">WF Usage</dt>
                    <dd>
                      <WeakFootStars level={p.weakFootUsage} label="Weak foot usage" />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">WF Accuracy</dt>
                    <dd>
                      <WeakFootStars level={p.weakFootAccuracy} label="Weak foot accuracy" />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">Form</dt>
                    <dd data-testid="form-stars">
                      {typeof p.form === "number" ? (
                        <StarRating filled={p.form + 1} max={THREE_STAR_MAX} label="Form" />
                      ) : (
                        <span className="text-[var(--color-text-secondary)]" title="Stored for every card; the player API does not expose it yet">
                          not exposed by the API yet
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--color-text-secondary)]">Injury Resistance</dt>
                    <dd data-testid="injury-stars">
                      {typeof p.injuryResistance === "number" ? (
                        <StarRating filled={p.injuryResistance + 1} max={THREE_STAR_MAX} label="Injury resistance" />
                      ) : (
                        <span className="text-[var(--color-text-secondary)]" title="Stored for every card; the player API does not expose it yet">
                          not exposed by the API yet
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Full-width row under both columns: Card Info and Other Versions,
          side by side from lg (after the main column on a phone, as before).
          The pinned Progression card ends above it, so it never covers them. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start" data-testid="detail-info-row">
        <CardInfo player={p} />

        {/* Other Versions: 56 px thumbnails from lg, four columns below. */}
        <section aria-labelledby="versions-title" data-testid="other-versions" className="efb-card">
          <h2 id="versions-title" className="efb-card__title">
            Other Versions <span className="text-[var(--color-text-secondary)]">· {versionPreviews.length}</span>
          </h2>
          {versionPreviews.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">This is the only card of {p.name}.</p>
          ) : (
            <ul ref={versionsListRef} className="mt-3 grid grid-cols-4 gap-2 lg:grid-cols-[repeat(auto-fill,56px)]">
              {shownVersions.map((v) => (
                <li key={v.id} className="min-w-0">
                  <PlayerCard player={v} size="full" caption="none" />
                </li>
              ))}
              {collapsed && (
                <li className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      // The button unmounts: focus moves to the first newly
                      // shown version (B5), announced politely.
                      focusVersionRef.current = shownVersions.length;
                      setVersionsNotice(`${hiddenVersions} more version${hiddenVersions === 1 ? "" : "s"} shown`);
                      setAllVersions(true);
                    }}
                    aria-label={`Show ${hiddenVersions} more versions`}
                    className="flex aspect-[240/339] w-full items-center justify-center rounded-lg bg-[var(--color-default)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-default-hover)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                  >
                    +{hiddenVersions}
                  </button>
                </li>
              )}
            </ul>
          )}
          {/* Always rendered (empty until "+N"), so the text is announced. */}
          <p role="status" aria-live="polite" className="sr-only">
            {versionsNotice}
          </p>
        </section>
      </div>
      </div>

      {/* Phone (< lg): category strip + dock above the tab bar, opening the
          bottom sheet with the full panel (same `build` state). */}
      {hasBuild && (
        <>
          {desktop !== true && (
            <ProgressionDock
              player={p}
              state={build}
              result={buildResult}
              refs={refs}
              managerPending={managerPending}
              onChange={setBuild}
              onOpen={() => setSheetOpen(true)}
              onOpenIntent={prefetchModal}
              expanded={sheetShown}
              renderAdjust={(cat, headingId) => renderAdjust([cat], headingId)}
              onAdjust={reportAdjust}
            />
          )}
          {/* Loaded and mounted on the first opening (deferred.tsx), then kept
              for the slide-out; its content exists only while open, so there
              is never a second panel instance next to the column's. */}
          <DeferredModal open={sheetShown} onClose={() => setSheetOpen(false)} title={mode === "trending" ? "Build" : "Progression"} variant="sheet" onShown={scrollSheetToCategories}>
            <ProgressionPanel
              player={p}
              state={build}
              result={buildResult}
              refs={refs}
              managerPending={managerPending}
              onChange={setBuild}
              notice={buildNotice}
              idBase={progressionIdBase}
              highlight={highlight}
              onHighlight={onHighlight}
              notes={notes}
              match={match}
              onMatchChange={setMatch}
              embedded
            />
          </DeferredModal>
        </>
      )}
    </div>
  );
}
