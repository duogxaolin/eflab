"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { SearchPalette } from "@/components/search/SearchPalette";
import { QueryErrorState } from "@/lib/query-state";
import {
  COMPARE_NO_MANAGER_PROFICIENCY,
  COMPARE_SIDES,
  appendCompareSideBuild,
  appendRawCompareSide,
  compareSideDefault,
  decodeCompareSide,
  defaultMaxLevel,
  emptyAllocation,
  isIdParam,
  parseCompareCards,
  registeredPositionOf,
  simulateCardBuild,
  type BaseStat,
  type BuildResult,
  type CompareSide,
  type PickerManagerDTO,
  type PlayerCardDTO,
} from "@eflab/shared";
import { Plus, ArrowLeftRight, Link as LinkIcon, Check } from "lucide-react";
import { CompareSlot, type SlotBuild } from "./CompareSlot";
import { CompareTable } from "./CompareTable";

// /compare — two slots, `left` and `right`, each a card with its own build
// (change efootbase-function-parity, design D11; specs "Two-Build Compare",
// comparison-tool "Multi-Card Side-by-Side Comparison", behaviour-parity
// "Compare Guards" / "Focus Is Never Lost").
//
// URL (packages/shared/src/compare-url.ts): `left=<id>&right=<id>`, then each
// side's build when it differs from its default — `l_*` / `r_*` category
// keys, `lb=1` / `rb=1` for a side without any category point, `l_mgr` /
// `r_mgr`. The page holds the state; every change is written with
// `history.replaceState` (Next's router adopts it — no navigation, no server
// request — and useSearchParams follows). Every query written here is
// remembered until the router hands it back (its echo changes nothing); any
// other query (Back / Forward, a link to /compare) is adopted like a link —
// the card page's pattern. A side's build is read from the link once its card
// has loaded (`decodeCompareSide`: its budget and default need the card);
// until then the side keeps the link's raw parameters, so a Swap, a Remove or
// a pick in the other slot never loses them (`appendRawCompareSide`). A side
// picked from the palette opens with its default build: the Max-OVR
// allocation, both usable boosters on, no manager and NO proficiency bonus
// (the engine at COMPARE_NO_MANAGER_PROFICIENCY = 70, whose band gives 0); a
// chosen manager applies its rating and its "+1" pills.
// Corrections (an id that is malformed or not found, a build over budget, an
// unknown manager, build keys of an empty side) are applied, the URL is
// rewritten at once and a polite line says what happened. A legacy
// `?ids=a,b,…` link is looked up (batches of 4, at most 20 ids): the first
// two cards that exist fill left and right, the rest are reported.
// Slots never close up: Remove empties only its slot (focus goes to that
// slot's "Add Player"), the next pick fills the slot the picker was opened
// for, the same card may sit in both slots (two builds of one card), and Swap
// exchanges the cards with their builds. The radar is unchanged (its build
// axes are pending): it draws each slot card's base stats.

// Side colours: left = accent (lime), right = cyan — every panel.
const SIDE_A = "var(--color-accent)";
const SIDE_B = "var(--color-accent-secondary)";
const SLOT_NUMBER: Record<CompareSide, 1 | 2> = { left: 1, right: 2 };
/** `player.compare` bound per request (legacy look-up batches). */
const COMPARE_BATCH = 4;
/** Card data per side: kept 5 minutes (Swap, Remove and duplicates reuse it). */
const CARD_STALE_MS = 5 * 60_000;

/** Hexagonal radar chart comparing SHT, PAS, STR, DEF, SPD, DRI. */
function CompareRadar({ p1, p2 }: { p1?: PlayerCardDTO; p2?: PlayerCardDTO }) {
  const size = 260;
  const center = size / 2;
  const radius = 80;
  const axes = [
    { label: "SHT", angle: -Math.PI / 2, stat: "finishing" },
    { label: "PAS", angle: -Math.PI / 6, stat: "lowPass" },
    { label: "STR", angle: Math.PI / 6, stat: "physicalContact" },
    { label: "DEF", angle: Math.PI / 2, stat: "defensiveAwareness" },
    { label: "SPD", angle: (5 * Math.PI) / 6, stat: "speed" },
    { label: "DRI", angle: (-5 * Math.PI) / 6, stat: "dribbling" },
  ] as const;

  const polygon = (player: PlayerCardDTO) =>
    axes
      .map((a) => {
        const val = player.stats[a.stat as BaseStat] ?? 40;
        const norm = Math.max(0.2, Math.min(1, val / 100));
        const r = radius * norm;
        return `${center + r * Math.cos(a.angle)},${center + r * Math.sin(a.angle)}`;
      })
      .join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="h-auto max-w-full overflow-visible" role="img" aria-label="Stat radar">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={axes.map((a) => `${center + radius * scale * Math.cos(a.angle)},${center + radius * scale * Math.sin(a.angle)}`).join(" ")}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="1"
        />
      ))}
      {axes.map((a) => (
        <g key={a.label}>
          <line x1={center} y1={center} x2={center + radius * Math.cos(a.angle)} y2={center + radius * Math.sin(a.angle)} stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1" />
          {/* Axis labels 12 px muted (Inter, as the rest of the page). */}
          <text
            x={center + (radius + 18) * Math.cos(a.angle)}
            y={center + (radius + 18) * Math.sin(a.angle)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="12"
            style={{ fill: "var(--color-text-secondary)" }}
          >
            {a.label}
          </text>
        </g>
      ))}
      {p1 && <polygon points={polygon(p1)} strokeWidth="2" style={{ fill: `color-mix(in srgb, ${SIDE_A} 25%, transparent)`, stroke: SIDE_A }} />}
      {p2 && <polygon points={polygon(p2)} strokeWidth="2" style={{ fill: `color-mix(in srgb, ${SIDE_B} 25%, transparent)`, stroke: SIDE_B }} />}
    </svg>
  );
}

/** One slot: its card and its build — decoded once the card has loaded
 *  (`build`), or still the link's raw parameters (`raw`, with the side they
 *  were written for), or the default (`raw` null: a card from the palette). */
interface Slot {
  cardId: string;
  build: SlotBuild | null;
  raw: { qs: string; side: CompareSide } | null;
}
type Slots = Record<CompareSide, Slot | null>;

/** What the polite line under the subtitle says about the opened link. */
interface LinkNotice {
  /** Ids that are malformed or not found. */
  notFound: number;
  /** Cards beyond the two slots (a legacy `ids` link). */
  extra: number;
  /** Any other correction (a build over budget, an unknown manager, …). */
  adjusted: boolean;
}
const NO_NOTICE: LinkNotice = { notFound: 0, extra: 0, adjusted: false };

interface ReadLink {
  slots: Slots;
  /** A legacy `?ids` link: the well-formed ids to look up (at most
   *  COMPARE_LEGACY_MAX_IDS), and how many more well-formed ids it held. */
  legacy: { ids: string[]; overflow: number } | null;
  notice: LinkNotice;
  /** The query must be rewritten (a correction, or a legacy link). */
  rewrite: boolean;
}

const isIdKey = (key: string) => key === "left" || key === "right" || key === "ids";

/** Step 1 of reading a link: the cards (parseCompareCards). */
function readLink(qs: string): ReadLink {
  const parsed = parseCompareCards(qs);
  const notFound = parsed.corrections.filter((c) => c.kind === "invalid" && isIdKey(c.key)).length;
  const adjusted = parsed.corrections.some((c) => !(c.kind === "invalid" && isIdKey(c.key)));
  const slot = (side: CompareSide): Slot | null => {
    const id = parsed[side];
    return id ? { cardId: id, build: null, raw: { qs, side } } : null;
  };
  let legacy: ReadLink["legacy"] = null;
  if (parsed.legacyIds) {
    const sp = new URLSearchParams(qs);
    const wellFormed = sp
      .getAll("ids")
      .flatMap((v) => v.split(","))
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && isIdParam(s)).length;
    // parseCompareCards keeps the first COMPARE_LEGACY_MAX_IDS well-formed ids.
    legacy = { ids: parsed.legacyIds, overflow: Math.max(0, wellFormed - parsed.legacyIds.length) };
  }
  return {
    slots: { left: slot("left"), right: slot("right") },
    legacy,
    notice: { notFound, extra: 0, adjusted },
    rewrite: parsed.corrections.length > 0 || legacy !== null,
  };
}

/** The compare query of the slots: the cards, then each side's build — the
 *  decoded build when it differs from its default, else the link's raw
 *  parameters re-keyed for the side the card now sits in. */
function composeQuery(slots: Slots, cardOf: (id: string) => PlayerCardDTO | undefined): string {
  const sp = new URLSearchParams();
  for (const side of COMPARE_SIDES) {
    const s = slots[side];
    if (s) sp.append(side, s.cardId);
  }
  for (const side of COMPARE_SIDES) {
    const s = slots[side];
    if (!s) continue;
    if (s.build) {
      const card = cardOf(s.cardId);
      if (card) appendCompareSideBuild(sp, side, s.build, card);
    } else if (s.raw) {
      appendRawCompareSide(sp, s.raw.qs, s.raw.side, side);
    }
  }
  return sp.toString();
}

/** A side's build through the engine: its allocation at the card's level cap,
 *  both usable boosters on, no second booster; the manager's rating as the
 *  proficiency and its pills — without a manager proficiency 70, i.e. no
 *  bonus (D11; the S3 replay). Face and tiles at the registered position. */
function runBuild(card: PlayerCardDTO, build: SlotBuild, manager: PickerManagerDTO | null): BuildResult {
  return simulateCardBuild(
    card,
    { allocation: build.allocation, maxLevel: defaultMaxLevel(card), managerProficiency: COMPARE_NO_MANAGER_PROFICIENCY, booster1: "full", booster2: "full" },
    registeredPositionOf(card),
    { manager: manager ? { rating: manager.rating, pills: manager.pills } : null, second: null },
  );
}

export function CompareClient() {
  const searchParams = useSearchParams();
  const urlQs = searchParams.toString();

  // ---- State and URL ----
  const [initialLink] = useState(() => readLink(urlQs));
  const [slots, setSlotsState] = useState<Slots>(initialLink.slots);
  const slotsRef = useRef(slots);
  const [notice, setNotice] = useState<LinkNotice>(initialLink.notice);
  // A legacy link is being looked up: both slots wait.
  const [resolving, setResolving] = useState(initialLink.legacy !== null);
  const lookupToken = useRef(0);
  // The query last written or adopted, and the queries written but not yet
  // handed back by the router (their echoes change nothing).
  const lastQs = useRef(urlQs);
  const ownWrites = useRef<string[]>([]);
  // Loaded cards by id (filled from the side queries before any effect runs),
  // so a write can tell a side's default build from a custom one.
  const cardCache = useRef(new Map<string, PlayerCardDTO>());
  const cardOf = useCallback((id: string) => cardCache.current.get(id), []);

  const writeQs = useCallback((qs: string) => {
    if (qs === lastQs.current) return;
    lastQs.current = qs;
    ownWrites.current = [...ownWrites.current.slice(-31), qs];
    window.history.replaceState(null, "", qs ? `/compare?${qs}` : "/compare");
  }, []);
  /** Sets the slots and writes their query. */
  const commit = useCallback(
    (next: Slots) => {
      slotsRef.current = next;
      setSlotsState(next);
      writeQs(composeQuery(next, cardOf));
    },
    [writeQs, cardOf],
  );
  /** A change made on the page: the link's notice is over, a running legacy
   *  look-up is abandoned. */
  const userCommit = useCallback(
    (next: Slots) => {
      lookupToken.current++;
      setResolving(false);
      setNotice(NO_NOTICE);
      commit(next);
    },
    [commit],
  );

  // A legacy `?ids` link: look the ids up (batches of COMPARE_BATCH), the first
  // two that exist fill left and right; missing ids count as not found, found
  // ids beyond the two as extra. A look-up that fails (network) keeps the first
  // two ids; the side queries then drop an unknown one.
  const utils = trpc.useUtils();
  const resolveLegacy = useCallback(
    async (legacy: NonNullable<ReadLink["legacy"]>, base: LinkNotice) => {
      const token = ++lookupToken.current;
      setResolving(true);
      const found: string[] = [];
      let missing = 0;
      let failed = false;
      try {
        for (let i = 0; i < legacy.ids.length; i += COMPARE_BATCH) {
          const batch = legacy.ids.slice(i, i + COMPARE_BATCH);
          const rows = await utils.player.compare.fetch({ cardIds: batch });
          for (const r of rows) cardCache.current.set(r.id, r);
          const have = new Set(rows.map((r) => r.id));
          for (const id of batch) {
            if (have.has(id)) found.push(id);
            else missing++;
          }
        }
      } catch {
        failed = true;
      }
      if (token !== lookupToken.current) return;
      const ids = failed ? legacy.ids.slice(0, 2) : found.slice(0, 2);
      const extra = (failed ? Math.max(0, legacy.ids.length - 2) : Math.max(0, found.length - 2)) + legacy.overflow;
      setResolving(false);
      setNotice({ notFound: base.notFound + (failed ? 0 : missing), extra, adjusted: base.adjusted });
      commit({
        left: ids[0] ? { cardId: ids[0], build: null, raw: null } : null,
        right: ids[1] ? { cardId: ids[1], build: null, raw: null } : null,
      });
    },
    [commit, utils],
  );

  // The opened link: a legacy link is looked up; a corrected one is rewritten
  // one tick after mount (Next patches history.replaceState in an effect of
  // the router, which runs after this page's first effects).
  useEffect(() => {
    if (initialLink.legacy) {
      void resolveLegacy(initialLink.legacy, initialLink.notice);
      return;
    }
    if (!initialLink.rewrite) return;
    const t = window.setTimeout(() => writeQs(composeQuery(slotsRef.current, cardOf)), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The router hands back the queries this page wrote (echoes) — forget them;
  // any other query is a navigation to /compare (Back / Forward, a link, the
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
    lookupToken.current++;
    const link = readLink(urlQs);
    slotsRef.current = link.slots;
    setSlotsState(link.slots);
    setNotice(link.notice);
    setResolving(link.legacy !== null);
    if (link.legacy) void resolveLegacy(link.legacy, link.notice);
    else if (link.rewrite) writeQs(composeQuery(link.slots, cardOf));
  }, [urlQs, resolveLegacy, writeQs, cardOf]);

  // ---- Cards (one query per side, cached by id: Swap, Remove and the same
  // card twice cost no request) ----
  const leftId = slots.left?.cardId ?? null;
  const rightId = slots.right?.cardId ?? null;
  const leftQ = trpc.player.compare.useQuery({ cardIds: [leftId ?? "0"] }, { enabled: leftId !== null, staleTime: CARD_STALE_MS });
  const rightQ = trpc.player.compare.useQuery({ cardIds: [rightId ?? "0"] }, { enabled: rightId !== null, staleTime: CARD_STALE_MS });
  const leftCard = leftId !== null ? leftQ.data?.find((p) => p.id === leftId) : undefined;
  const rightCard = rightId !== null ? rightQ.data?.find((p) => p.id === rightId) : undefined;
  useLayoutEffect(() => {
    if (leftCard) cardCache.current.set(leftCard.id, leftCard);
    if (rightCard) cardCache.current.set(rightCard.id, rightCard);
  }, [leftCard, rightCard]);
  const queryOf = { left: leftQ, right: rightQ } as const;
  const cardOfSide = { left: leftCard, right: rightCard } as const;
  // Not found: the card query answered without the card.
  const leftMissing = leftId !== null && leftQ.isSuccess && !leftCard;
  const rightMissing = rightId !== null && rightQ.isSuccess && !rightCard;
  useEffect(() => {
    if (!leftMissing && !rightMissing) return;
    const next: Slots = { ...slotsRef.current };
    let dropped = 0;
    if (leftMissing && next.left) {
      next.left = null;
      dropped++;
    }
    if (rightMissing && next.right) {
      next.right = null;
      dropped++;
    }
    if (dropped === 0) return;
    setNotice((n) => ({ ...n, notFound: n.notFound + dropped }));
    commit(next);
  }, [leftMissing, rightMissing, commit]);

  // ---- Managers (the picker list: requested once a side has a manager; the
  // drawer requests it on its first opening — one cache) ----
  const anyManager = slots.left?.build?.managerId != null || slots.right?.build?.managerId != null;
  const pickerQ = trpc.manager.picker.useQuery(undefined, { enabled: anyManager, staleTime: Infinity, gcTime: Infinity });
  const pickerIds = useMemo(() => (pickerQ.data ? new Set(pickerQ.data.map((m) => m.id)) : null), [pickerQ.data]);
  const managerById = useCallback((id: string | null | undefined) => (id && pickerQ.data ? pickerQ.data.find((m) => m.id === id) ?? null : null), [pickerQ.data]);

  // A side's build is read once its card is in: from the link (corrected and
  // announced) or the default for a card from the palette.
  useEffect(() => {
    const cur = slotsRef.current;
    const next: Slots = { ...cur };
    let changed = false;
    let adjusted = false;
    for (const side of COMPARE_SIDES) {
      const s = cur[side];
      if (!s || s.build) continue;
      const card = cardCache.current.get(s.cardId) ?? cardOfSide[side];
      if (!card || card.id !== s.cardId) continue;
      if (s.raw) {
        const d = decodeCompareSide(s.raw.qs, s.raw.side, card, { managerIds: pickerIds });
        next[side] = { cardId: s.cardId, build: { allocation: d.allocation, managerId: d.managerId }, raw: null };
        if (d.corrections.length > 0) adjusted = true;
      } else {
        next[side] = { cardId: s.cardId, build: { allocation: compareSideDefault(card), managerId: null }, raw: null };
      }
      changed = true;
    }
    if (!changed) return;
    if (adjusted) {
      setNotice((n) => ({ ...n, adjusted: true }));
      commit(next);
    } else {
      slotsRef.current = next;
      setSlotsState(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, leftCard, rightCard, pickerIds, commit]);

  // A manager id the picker does not list is dropped once the list answered.
  useEffect(() => {
    if (!pickerIds) return;
    const cur = slotsRef.current;
    const next: Slots = { ...cur };
    let changed = false;
    for (const side of COMPARE_SIDES) {
      const s = cur[side];
      if (s?.build?.managerId != null && !pickerIds.has(s.build.managerId)) {
        next[side] = { ...s, build: { ...s.build, managerId: null } };
        changed = true;
      }
    }
    if (!changed) return;
    setNotice((n) => ({ ...n, adjusted: true }));
    commit(next);
  }, [pickerIds, commit]);

  // ---- Builds through the engine ----
  const leftManager = managerById(slots.left?.build?.managerId);
  const rightManager = managerById(slots.right?.build?.managerId);
  const leftBuild = slots.left?.build ?? null;
  const rightBuild = slots.right?.build ?? null;
  const leftResult = useMemo(() => (leftCard && leftBuild ? runBuild(leftCard, leftBuild, leftManager) : null), [leftCard, leftBuild, leftManager]);
  const rightResult = useMemo(() => (rightCard && rightBuild ? runBuild(rightCard, rightBuild, rightManager) : null), [rightCard, rightBuild, rightManager]);
  const resultOf = { left: leftResult, right: rightResult } as const;
  const managerOf = { left: leftManager, right: rightManager } as const;

  const setSideBuild = (side: CompareSide, build: SlotBuild) => {
    const s = slotsRef.current[side];
    if (!s) return;
    userCommit({ ...slotsRef.current, [side]: { ...s, build } });
  };

  // ---- Picker, Remove, Swap, focus ----
  const [pickSide, setPickSide] = useState<CompareSide | null>(null);
  const lastPickSide = useRef<CompareSide>("left");
  const slotRefs = useRef<Record<CompareSide, HTMLDivElement | null>>({ left: null, right: null });
  // Slot just filled from the picker: focus waits on its wrapper and moves to
  // the card link once the card is on screen (the opener button is gone).
  const [focusSide, setFocusSide] = useState<CompareSide | null>(null);
  const pendingFocusRef = useRef<CompareSide | null>(null);
  // Slot just emptied by Remove: focus moves to its "Add Player".
  const [focusAddSide, setFocusAddSide] = useState<CompareSide | null>(null);

  const openPicker = (side: CompareSide) => {
    lastPickSide.current = side;
    setPickSide(side);
  };
  const pickCard = (id: string) => {
    if (pickSide === null) return;
    // Every card can be picked, the one in the other slot too (two builds of
    // one card); it fills the slot the picker was opened for.
    userCommit({ ...slotsRef.current, [pickSide]: { cardId: id, build: null, raw: null } });
    pendingFocusRef.current = pickSide;
    setFocusSide(pickSide);
  };
  const removeSide = (side: CompareSide) => {
    // The button unmounts with the card: park focus on the slot's wrapper at
    // once, then hand it to the slot's "Add Player" once it renders. The other
    // card stays where it is.
    slotRefs.current[side]?.focus();
    setFocusAddSide(side);
    userCommit({ ...slotsRef.current, [side]: null });
  };
  useEffect(() => {
    if (focusAddSide === null || slots[focusAddSide] !== null) return;
    const add = slotRefs.current[focusAddSide]?.querySelector<HTMLElement>("[data-slot-add]");
    if (!add) return;
    const active = document.activeElement;
    if (active === null || active === document.body || Object.values(slotRefs.current).includes(active as HTMLDivElement)) add.focus();
    setFocusAddSide(null);
  }, [focusAddSide, slots]);
  const focusFilled = focusSide !== null && slots[focusSide]?.build != null && cardOfSide[focusSide] !== undefined;
  useEffect(() => {
    if (focusSide === null || !focusFilled) return;
    const wrap = slotRefs.current[focusSide];
    const active = document.activeElement;
    if (wrap && (active === wrap || active === document.body || active === null)) wrap.querySelector<HTMLElement>("a.pcb-tile")?.focus();
    setFocusSide(null);
  }, [focusSide, focusFilled]);

  const canSwap = slots.left !== null && slots.right !== null;
  const swapHintId = useId();
  const copyHintId = useId();
  const swap = () => {
    if (!canSwap) return;
    userCommit({ left: slotsRef.current.right, right: slotsRef.current.left });
  };

  // ---- Copy link ----
  // "Link copied" (announced, shown for 2 s), or the clipboard refused
  // (permissions, an insecure context): the link shown and selected for a
  // manual copy, for 5 s or until the selection changes (QA 2026-10-23).
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const linkTextRef = useRef<HTMLSpanElement>(null);
  const [failedLink, setFailedLink] = useState("");
  // An empty compare has nothing to share: Copy link waits for a card, as
  // Swap waits for two (browser QA 2026-10-25 W6 — it used to copy a bare
  // /compare and say "Link copied").
  const canCopy = slots.left !== null || slots.right !== null;
  const copyLink = async () => {
    if (!canCopy) return;
    clearTimeout(copyTimer.current);
    const href = window.location.href;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(href);
      setCopy("copied");
      copyTimer.current = setTimeout(() => setCopy("idle"), 2000);
    } catch {
      setFailedLink(href);
      setCopy("failed");
      copyTimer.current = setTimeout(() => setCopy("idle"), 5000);
    }
  };
  // The shown link belongs to the selection it was copied from: a new
  // selection clears the failure line at once.
  useEffect(() => {
    setCopy((c) => (c === "failed" ? "idle" : c));
  }, [leftId, rightId]);
  useLayoutEffect(() => {
    if (copy !== "failed") return;
    const el = linkTextRef.current;
    const selection = window.getSelection();
    if (!el || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [copy, failedLink]);

  // ---- Render ----
  const renderSlot = (side: CompareSide) => {
    const n = SLOT_NUMBER[side];
    const s = slots[side];
    const card = cardOfSide[side];
    const result = resultOf[side];
    const q = queryOf[side];
    if (s && card && s.build && result) {
      const build = s.build;
      const managerPending = build.managerId !== null && managerOf[side] === null;
      return (
        <CompareSlot
          side={side}
          slotNumber={n}
          card={card}
          build={build}
          result={result}
          manager={managerOf[side]}
          managerPending={managerPending}
          onMaxOvr={() => setSideBuild(side, { ...build, allocation: compareSideDefault(card) })}
          onReset={() => setSideBuild(side, { ...build, allocation: emptyAllocation() })}
          onChooseManager={(m) => setSideBuild(side, { ...build, managerId: build.managerId === m.id ? null : m.id })}
          onClearManager={() => setSideBuild(side, { ...build, managerId: null })}
          onRemove={() => removeSide(side)}
        />
      );
    }
    if (s && q.isError) {
      // Retry re-runs the query; Remove empties this slot.
      return (
        <div className="flex w-full flex-col items-center gap-2 md:max-w-40">
          <QueryErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load this card" className="w-full !p-4" />
          <button type="button" onClick={() => removeSide(side)} aria-label={`Remove card #${s.cardId} from slot ${n}`} className="button button--sm button--ghost text-[var(--color-accent)]">
            Remove
          </button>
        </div>
      );
    }
    if (s || resolving) {
      // Loading (a card not found is dropped by the effect above, with the message).
      return <div className="efb-compare-slot animate-pulse" aria-busy="true" aria-label={`Loading the card of slot ${n}`} />;
    }
    return (
      <button type="button" onClick={() => openPicker(side)} aria-haspopup="dialog" data-slot-add="" aria-label={`Add Player to slot ${n}: search and select a player`} className="efb-compare-slot">
        <span className="efb-compare-slot__plus" aria-hidden>
          <Plus className="size-5" />
        </span>
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">Add Player</span>
        <span className="text-xs text-[var(--color-text-secondary)]">Search and select a player</span>
      </button>
    );
  };

  const noticeText = [
    notice.notFound === 0 ? "" : `${notice.notFound} ${notice.notFound === 1 ? "card in the link was" : "cards in the link were"} not found.`,
    notice.extra === 0 ? "" : "Compare shows two cards — extra cards in the link were ignored.",
    notice.adjusted ? "The link was adjusted to fit the cards." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const tableReady = leftCard && rightCard && leftResult && rightResult;

  return (
    <div>
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
          <li className="breadcrumbs__item" aria-current="page">
            Compare
          </li>
        </ol>
      </nav>

      {/* Title row: H1 36/40 (30/36 below 768) + the 36 × 36 ghost swap and
          copy-link buttons at the right. */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="efb-h1 text-[var(--color-text-primary)]">Compare</h1>
        <div className="flex shrink-0 items-center gap-0.5">
          {/* Unavailable actions stay focusable (aria-disabled) and say why
              in their description, not only in the title. */}
          <button
            type="button"
            onClick={swap}
            aria-disabled={!canSwap}
            aria-describedby={canSwap ? undefined : swapHintId}
            className="button button--md button--icon-only button--ghost"
            title={canSwap ? "Swap players" : "Pick two players to swap them"}
            aria-label="Swap the two players"
            data-testid="compare-swap"
          >
            <ArrowLeftRight className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void copyLink()}
            aria-disabled={!canCopy}
            aria-describedby={canCopy ? undefined : copyHintId}
            className="button button--md button--icon-only button--ghost"
            title={canCopy ? "Copy share link" : "Pick a player to copy the link"}
            aria-label={copy === "copied" ? "Link copied" : "Copy share link"}
            data-testid="compare-copy-link"
          >
            {copy === "copied" ? <Check className="size-5 text-[var(--color-accent)]" aria-hidden /> : <LinkIcon className="size-5" aria-hidden />}
          </button>
          <span id={swapHintId} className="sr-only">
            Pick two players to swap them.
          </span>
          <span id={copyHintId} className="sr-only">
            Pick a player to copy the link.
          </span>
        </div>
      </div>
      <p className="efb-subtitle mt-3">
        Compare two eFootball player cards side by side — set a build for each (Max OVR, Reset or a manager), then read stats, skills and the overall at every position.
      </p>
      {/* Always mounted (polite live region); empty and room-less unless the
          opened link was corrected — a card not found, cards beyond the two
          slots, a build adjusted. */}
      <p role="status" className={noticeText ? "mt-2 text-xs text-[var(--color-accent-warn)]" : "sr-only"} data-testid="compare-dropped">
        {noticeText}
      </p>
      {/* Copy link: "Link copied", or the refused copy with the link selected for a manual copy (polite). */}
      <p role="status" className={copy === "idle" ? "sr-only" : copy === "failed" ? "mt-2 break-all text-xs text-[var(--color-accent-warn)]" : "mt-2 text-xs text-[var(--color-accent)]"} data-testid="compare-copy-status">
        {copy === "copied" ? (
          "Link copied"
        ) : copy === "failed" ? (
          <>
            Copy failed — select the link: <span ref={linkTextRef} className="text-[var(--color-text-primary)]">{failedLink}</span>
          </>
        ) : (
          ""
        )}
      </p>

      {/* Console: left slot · radar · right slot — 260 / flexible / 260 from
          768 px; below, the two slots side by side and the radar under them. */}
      <div className="efb-compare-console mt-6">
        <div ref={(el) => void (slotRefs.current.left = el)} tabIndex={-1} className="efb-compare-console__slot outline-none" data-slot-side="left">
          {renderSlot("left")}
        </div>
        <div className="efb-compare-console__radar">
          <CompareRadar p1={leftCard} p2={rightCard} />
        </div>
        <div ref={(el) => void (slotRefs.current.right = el)} tabIndex={-1} className="efb-compare-console__slot outline-none" data-slot-side="right">
          {renderSlot("right")}
        </div>
      </div>

      {/* Picker = the shared search palette (named modal dialog, focus trap,
          Escape, focus return). Enter picks the active row — the first
          result while typing. Every card is listed and selectable. */}
      <SearchPalette
        open={pickSide !== null}
        onClose={() => setPickSide(null)}
        title={`Select player for slot ${SLOT_NUMBER[pickSide ?? lastPickSide.current]}`}
        onSelect={(p) => pickCard(p.id)}
        // After a pick: the slot's wrapper (the effect above then moves focus
        // to the card link); after Escape / backdrop: the opener (null).
        returnFocusTo={() => {
          const side = pendingFocusRef.current;
          pendingFocusRef.current = null;
          return side !== null ? slotRefs.current[side] ?? null : null;
        }}
      />

      {tableReady && <CompareTable left={{ card: leftCard, result: leftResult }} right={{ card: rightCard, result: rightResult }} />}
    </div>
  );
}
