"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Shield, Swords } from "lucide-react";
import type { CardPreview } from "@eflab/shared";
import { playingStyleName } from "@eflab/shared";
import { CARD_TYPE_COLOR_VAR, CARD_TYPE_LABEL, positionOf } from "@/lib/card-display";
import { playerCardDynamicUrl, conditionUrl } from "@/lib/r2-images";
import { useNearViewport } from "./useNearViewport";

// efootbase-aligned card tile. The face is the single `cards/{id}_dynamic.webp`
// render from R2 (animated background + frame baked in); the OVR block,
// condition badge and detail overlays are markup on top, positioned by the
// proportional `.pcb*` CSS in globals.css (container-query units, so the
// geometry is identical at every card width). This component only supplies
// markup + class names — no inline position/size classes on `.pcb__*`.
//
// Accessibility / performance contract (site-quality-baseline):
//   · the whole tile (card + optional caption) is ONE real <Link> with an
//     explicit accessible name, keyboard-focusable with a visible focus ring;
//   · images are lazy + async-decoded with explicit dimensions, and the face
//     only receives its `src` once the card is within FACE_LOAD_MARGIN of the
//     viewport (native lazy loading alone fetches ~1250 px ahead, far too much
//     for a 190-card page); `priority` opts the first row into eager loading;
//   · hover / keyboard focus scales the card to 1.05 above its neighbours and
//     brightens the caption — pure CSS (`.pcb-tile*` in globals.css); under
//     prefers-reduced-motion the scale applies without a transition.

type CardSize = "sm" | "md" | "full";

/** Text under the card, inside the same link:
 *   "name"   — the player name on one line (home, carousels, skill holders);
 *   "styles" — the name visually hidden, then the attack and defence playing
 *              styles on two lines with an icon each (/players, packs);
 *   "none"   — the card only. */
export type CardCaption = "name" | "styles" | "none";

const SIZE_CLASS: Record<CardSize, string> = {
  sm: "w-24",     // 96px — trending horizontal scroll (efootbase w-24)
  md: "w-28",     // 112px — pack grids (efootbase w-28)
  full: "w-full", // grid cell fills its column / carousel slot
};

/** Native size of the R2 card art (cards/{id}_dynamic.webp). */
export const CARD_ART_WIDTH = 240;
export const CARD_ART_HEIGHT = 339;
/** Distance from the viewport at which a card face starts loading. */
const FACE_LOAD_MARGIN = "200px";

/** Card input: the slim preview, optionally carrying the full DTO's `levelCap`
 *  (PlayerCardDTO extends CardPreview, so the detail page can pass it as is). */
export type PlayerCardData = CardPreview & { levelCap?: number | null };

export function PlayerCard({
  player,
  size = "full",
  caption = "none",
  showDetails = false,
  priority = false,
  levelCap,
  className = "",
}: {
  player: PlayerCardData;
  size?: CardSize;
  /** Caption variant below the card (see `CardCaption`). */
  caption?: CardCaption;
  /** Render the extra overlays (used by the compare slots only):
   *    .pcb__nation            — circular nationality flag (left-mid)
   *    .pcb__badge--max-level   — "MAX LVL NN" pill (bottom-left, green)
   *    .pcb__badge--max-ovr    — "MAX NN" pill (bottom-right, replaces condition)
   *  The player detail face (efootbase-ui-redesign) passes none of them: the
   *  reference face is the card with its condition letter only — no MAX
   *  badges, and no flag circle over the club crest baked into the render. */
  showDetails?: boolean;
  /** Eager-load the face (first row of a grid / above the fold). Everything
   *  else is lazy. */
  priority?: boolean;
  /** Real max level for the MAX LEVEL badge (efootbase `level_cap`). Falls back
   *  to `player.levelCap` when the full DTO is passed; the badge is omitted
   *  when neither is known (never a substitute number). */
  levelCap?: number | null;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [faceError, setFaceError] = useState(false);
  const nearViewport = useNearViewport(cardRef, FACE_LOAD_MARGIN, priority);
  const cardColor = CARD_TYPE_COLOR_VAR[player.cardType];
  const typeLabel = CARD_TYPE_LABEL[player.cardType] ?? player.cardType;

  const pos = positionOf(player.registeredPosition);
  const faceUrl = playerCardDynamicUrl(player.id);
  // Condition letter: stored as "A"–"E" (seeded from the dump) or null.
  const condLetter =
    typeof player.condition === "string" && /^[a-eA-E]$/.test(player.condition)
      ? player.condition.toUpperCase()
      : null;
  const maxLevel = levelCap ?? player.levelCap ?? null;
  const showMaxOvr = player.maxOvr != null && player.maxOvr > 0;
  const href = `/players/${player.baseId}/${player.id}` as const;
  const accessibleName = `${player.name}, ${typeLabel} ${player.ovr} OVR, ${pos}`;

  const cardEl = (
    // `.pcb-tile__card` is the element that scales on hover / focus.
    <div className={`pcb-tile__card select-none ${SIZE_CLASS[size]} ${className}`}>
      <div ref={cardRef} className="pcb">
        {faceError ? (
          // Face unavailable (R2 404 / offline): keep the geometry and render
          // OVR + position in-card on a card-type tinted gradient.
          <div
            className="pcb__placeholder"
            style={{
              background: `linear-gradient(180deg, color-mix(in srgb, ${cardColor} 18%, transparent) 0%, var(--color-canvas) 80%)`,
            }}
          >
            <span className="font-black tabular-nums text-[var(--color-text-primary)]" style={{ fontSize: "12cqw" }}>
              {player.ovr}
            </span>
            <span className="font-mono uppercase text-[var(--color-text-secondary)]" style={{ fontSize: "5cqw" }}>
              {pos}
            </span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            // src is withheld until the card nears the viewport (see useNearViewport)
            src={nearViewport ? faceUrl : undefined}
            data-src={faceUrl}
            alt=""
            width={CARD_ART_WIDTH}
            height={CARD_ART_HEIGHT}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            onError={() => setFaceError(true)}
            className="pcb__face"
            draggable={false}
          />
        )}

        {/* OVR + position block (proportional .pcb__ovr-block geometry). */}
        {!faceError && (
          <div className="pcb__ovr-block" aria-hidden>
            <span className="pcb__ovr">{player.ovr}</span>
            <span className="pcb__position">{pos}</span>
          </div>
        )}

        {/* Condition badge (A–E, bottom-right) — also on the detail face. With
            showDetails (compare) the MAX OVR badge takes this slot, so it is
            hidden there. */}
        {condLetter && !faceError && !showDetails && (
          <div className="pcb__condition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={conditionUrl(condLetter)}
              alt={`Condition ${condLetter}`}
              title={`Condition ${condLetter}`}
              width={32}
              height={32}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="pcb__condition-img"
            />
          </div>
        )}

        {/* showDetails overlays (compare): nation flag (left-mid), MAX LEVEL
            (bottom-left), MAX OVR (bottom-right). */}
        {showDetails && !faceError && (
          <>
            {player.flagUrl && (
              <div className="pcb__nation">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={player.flagUrl}
                  alt=""
                  aria-hidden
                  width={42}
                  height={42}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="pcb__nation-img"
                />
              </div>
            )}
            {maxLevel != null && maxLevel > 0 && (
              <div className="pcb__badge pcb__badge--bottom-left pcb__badge--max-level">
                <span className="sr-only">Max level </span>
                <span aria-hidden>MAX LVL </span>
                {maxLevel}
              </div>
            )}
            {showMaxOvr && (
              <div className="pcb__badge pcb__badge--bottom-right pcb__badge--max-ovr">
                <span className="sr-only">Max overall </span>
                <span aria-hidden>MAX </span>
                {player.maxOvr}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const hasPlaystyle = player.playingStyleAttack != null || player.playingStyleDefense != null;

  return (
    <Link href={href} className="card-link pcb-tile" aria-label={accessibleName}>
      {cardEl}
      {caption === "name" && <span className="pcb-caption pcb-caption--name">{player.name}</span>}
      {caption === "styles" && (
        <span className="pcb-caption pcb-caption--styles">
          {/* The name stays in the tile's text for assistive technology; the
              link's accessible name (aria-label) carries it too. */}
          <span className="sr-only">{player.name}.</span>
          {hasPlaystyle && (
            <>
              <span className="pcb-caption__line">
                <Swords className="pcb-caption__icon pcb-caption__icon--attack" aria-hidden />
                <span className="sr-only">Attack: </span>
                <span className="pcb-caption__text">{playingStyleName(player.playingStyleAttack)}</span>
              </span>
              <span className="pcb-caption__line">
                <Shield className="pcb-caption__icon pcb-caption__icon--defence" aria-hidden />
                <span className="sr-only">Defence: </span>
                <span className="pcb-caption__text">{playingStyleName(player.playingStyleDefense)}</span>
              </span>
            </>
          )}
        </span>
      )}
    </Link>
  );
}
