"use client";
import { useRef, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CardPreview } from "@eflab/shared";
import { CARD_TYPE_COLOR_VAR, positionOf } from "@/lib/card-display";
import {
  playerCardUrl,
  cardBgUrl,
  cardFrameUrl,
  conditionUrl,
} from "@/lib/r2-images";

// efootbase-aligned card render (DNA §10): 4-layer composite —
//   layer 1: background  (card-backgrounds/{Type}.webp, or gradient fallback)
//   layer 2: face        (R2 cards/{pid}_transparent.webp)
//   layer 3: frame       (frames/{Name}_Frame.webp — optional)
//   layer 4: condition   (conditions/condition_{a-e}.svg — optional, bottom-right)
//
// All overlay geometry (OVR block, condition badge) is driven by the proportional
// `.pcb*` CSS in globals.css using container-query units (cqw) — so badges land
// at the exact same spot whether the card is w-24 (trending) or w-full (grid),
// matching efootbase's geometry exactly. This component only supplies the markup
// + class names; NO inline Tailwind position/size classes on .pcb__* (those would
// override the proportional CSS and cause drift at different card sizes).
//
// With `showName`, a separate <a> "Name" link is rendered BELOW the card (efootbase
// verbatim: `mt-1 block text-center text-xs truncate text-foreground/80`), wrapped
// together in `<div class="block">`. CSS 3D tilt + glare preserved as the eflab
// signature (pointer-driven, no default chrome). NO flag in card list.

type CardSize = "sm" | "md" | "full";

const SIZE_CLASS: Record<CardSize, string> = {
  sm: "w-24",     // 96px — trending horizontal scroll (efootbase w-24)
  md: "w-28",     // 112px — pack grids (efootbase w-28)
  full: "w-full", // dense players grid (cell fills column)
};

export function PlayerCard({
  player,
  size = "full",
  showName = false,
  className = "",
}: {
  player: CardPreview;
  size?: CardSize;
  /** Render the player name as a separate <a> link below the card, matching
   *  efootbase's verbatim `<a class="mt-1 block text-center text-xs ...">`. */
  showName?: boolean;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, glare: 50 });
  const [faceError, setFaceError] = useState(false);
  const cardColor = CARD_TYPE_COLOR_VAR[player.cardType];

  const handleMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * 16;
    const rx = -(py - 0.5) * 16;
    setTilt({ rx, ry, glare: px * 100 });
  }, []);

  const reset = useCallback(() => setTilt({ rx: 0, ry: 0, glare: 50 }), []);

  const pos = positionOf(player.registeredPosition);
  const faceUrl = playerCardUrl(player.id);
  const packHint =
    "featuredPackId" in player && typeof player.featuredPackId === "string"
      ? player.featuredPackId
      : "pack" in player && player.pack && typeof player.pack === "object" && "name" in player.pack
      ? String(player.pack.name)
      : null;
  const bgUrl = cardBgUrl(player.cardType, packHint);
  const frameUrl = cardFrameUrl(player.cardType, packHint);
  // Condition letter (DNA §12): stored as "A"–"E" or null; lowercase for URL.
  const condLetter =
    typeof player.condition === "string" &&
    player.condition.length === 1 &&
    /[a-eA-E]/.test(player.condition)
      ? player.condition
      : null;

  const cardEl = (
    <div className={`perspective-card select-none ${SIZE_CLASS[size]} ${className}`}>
      <div
        ref={cardRef}
        onPointerMove={handleMove}
        onPointerLeave={reset}
        onPointerCancel={reset}
        aria-label={player.name}
        className="pcb card-3d-surface preserve-3d cursor-pointer"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        }}
      >
        {/* Layer 1 — background (by cardType) or gradient fallback.
            Geometry/positioning driven by .pcb__background in globals.css. */}
        {bgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgUrl}
            alt=""
            aria-hidden
            loading="lazy"
            draggable={false}
            className="pcb__background"
          />
        ) : (
          <div
            className="pcb__background"
            style={{
              background: `linear-gradient(180deg, ${cardColor}33 0%, ${cardColor}11 50%, var(--color-canvas) 100%)`,
            }}
          />
        )}

        {/* Layer 2 — face / player photo (gradient+initial fallback on error) */}
        {faceError ? (
          <div
            className="pcb__placeholder"
            style={{
              background: `linear-gradient(180deg, ${cardColor}22, var(--color-canvas) 80%)`,
            }}
          >
            <span className="font-black text-[var(--color-text-primary)] tabular-nums" style={{ fontSize: "12cqw" }}>
              {player.ovr}
            </span>
            <span className="uppercase font-mono text-[var(--color-text-secondary)]" style={{ fontSize: "5cqw" }}>
              {pos}
            </span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faceUrl}
            alt={player.name}
            onError={() => setFaceError(true)}
            className="pcb__face"
            draggable={false}
          />
        )}

        {/* Layer 3 — frame (optional, only some card types) */}
        {frameUrl && !faceError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frameUrl}
            alt=""
            aria-hidden
            loading="lazy"
            draggable={false}
            className="pcb__frame"
          />
        )}

        {/* OVR + position block — position/typography driven by .pcb__ovr-block
            in globals.css (proportional cqw, matches efootbase geometry). */}
        {!faceError && (
          <div className="pcb__ovr-block">
            <span className="pcb__ovr">{player.ovr}</span>
            <span className="pcb__position">{pos}</span>
          </div>
        )}

        {/* Layer 4 — condition badge (optional, A–E). Wrapped in .pcb__condition
            so the badge sits BOTTOM-right per efootbase (was top-right). */}
        {condLetter && !faceError && (
          <div className="pcb__condition">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={conditionUrl(condLetter)}
              alt={`Condition ${condLetter.toUpperCase()}`}
              title={`Condition ${condLetter.toUpperCase()}`}
              loading="lazy"
              draggable={false}
              className="pcb__condition-img"
            />
          </div>
        )}

        {/* Glare overlay (CSS 3D signature — pointer-driven, no default chrome) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at ${tilt.glare}% 0%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 60%)`,
            transition: "background 50ms linear",
            zIndex: 4,
          }}
        />
      </div>
    </div>
  );

  const router = useRouter();
  const href = `/players/${player.baseId}/${player.id}`;

  const handleCardClick = () => {
    router.push(href);
  };

  if (showName) {
    return (
      <div className="block">
        <div onClick={handleCardClick} className="block cursor-pointer">
          {cardEl}
        </div>
        <Link
          href={href}
          className="mt-1 block text-center text-xs focus:outline-none truncate text-[var(--color-text-primary)]/80 hover:text-[var(--color-text-primary)] transition-colors"
        >
          {player.name}
        </Link>
      </div>
    );
  }
  return (
    <div onClick={handleCardClick} className="block cursor-pointer">
      {cardEl}
    </div>
  );
}
