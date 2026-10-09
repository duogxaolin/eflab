"use client";
import { useRef, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CardPreview } from "@eflab/shared";
import { CARD_TYPE_COLOR_VAR, positionOf } from "@/lib/card-display";
import { playingStyleName } from "@eflab/shared";
import {
  playerCardDynamicUrl,
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
  showDetails = false,
  className = "",
}: {
  player: CardPreview;
  size?: CardSize;
  /** Render the player name as a separate <a> link below the card, matching
   *  efootbase's verbatim `<a class="mt-1 block text-center text-xs ...">`. */
  showName?: boolean;
  /** Render the 3 detail-only overlays (efootbase dna §10 /players/{id}):
   *    .pcb__nation            — circular nationality flag (left-mid)
   *    .pcb__badge--max-level   — "MAX LEVEL NN" pill (bottom-left, green)
   *    .pcb__badge--max-ovr    — "MAX NN" pill (bottom-right, replaces condition)
   *  Grid view defaults to false (matches efootbase homepage / list cards,
   *  which render only bg + face + frame + OVR block + condition). The detail
   *  page passes showDetails=true. Added 2026-10-08 — was the missing diff. */
  showDetails?: boolean;
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
  // efootbase renders the card as a single dynamic.webp (animated bg + frame
  // baked-in). Matching efootbase 1:1: use the dynamic variant instead of the
  // layered bg+face+frame composite. OVR block + condition + detail overlays +
  // glare stay as markup on top.
  const faceUrl = playerCardDynamicUrl(player.id);
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
        {/* Face — efootbase renders a single dynamic.webp with animated bg +
            frame baked-in. OVR block + condition + detail overlays sit on top.
            Gradient+initial fallback on error. */}
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

        {/* OVR + position block — position/typography driven by .pcb__ovr-block
            in globals.css (proportional cqw, matches efootbase geometry). */}
        {!faceError && (
          <div className="pcb__ovr-block">
            <span className="pcb__ovr">{player.ovr}</span>
            <span className="pcb__position">{pos}</span>
          </div>
        )}

        {/* Layer 4 — condition badge (optional, A–E). Wrapped in .pcb__condition
            so the badge sits BOTTOM-right per efootbase (was top-right).
            NOTE: on the detail card (showDetails=true) efootbase REPLACES this
            bottom-right slot with the "MAX OVR" badge — so the condition badge
            is hidden when showDetails is on, and max-ovr renders below. */}
        {condLetter && !faceError && !showDetails && (
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

        {/* Detail-only overlays (efootbase dna §10 /players/{id} render):
         *    nation flag (left-mid) + MAX LEVEL badge (bottom-left) +
         *    MAX OVR badge (bottom-right, replacing condition). Grid cards omit
         *    these three; the detail page passes showDetails=true. Added
         *    2026-10-08 — these were the missing layers users noticed. */}
        {showDetails && !faceError && (
          <>
            {/* Nation flag circle (left-mid). flagUrl comes from the API join
                (Country.flagUrl, R2 SHA256 hash filename). If absent, skip the
                overlay rather than render an empty circle. */}
            {player.flagUrl && (
              <div className="pcb__nation">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={player.flagUrl}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  draggable={false}
                  className="pcb__nation-img"
                />
              </div>
            )}
            {/* Max LEVEL badge — efootbase shows the player's max level number.
                We don't store maxLevel separately in CardPreview yet, so render
                maxOvr here as the "max" proxy (efootbase's bottom-left pill shows
                the max-level value; on eflab the meaningful "max" number is maxOvr).
                TODO: when CardPreview carries maxLevel, switch to "MAX LEVEL {n}". */}
            {player.maxOvr != null && player.maxOvr > 0 && (
              <div className="pcb__badge pcb__badge--bottom-left pcb__badge--max-level">
                MAX {player.maxOvr}
              </div>
            )}
            {/* Max OVR badge (bottom-right, replaces condition on detail). */}
            {player.maxOvr != null && player.maxOvr > 0 && (
              <div className="pcb__badge pcb__badge--bottom-right pcb__badge--max-ovr">
                MAX {player.maxOvr}
              </div>
            )}
          </>
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
    // efootbase grid/list card name link: name + 2 playstyle lines, all inside one <a>.
    //   <a class="mt-1 block text-center text-xs">
    //     <span class="sr-only">Name. </span>  ← efootbase uses sr-only for the name
    //     <span class="flex flex-col gap-0.5 text-[11px] leading-tight">
    //       <span> ↑icon  Attack: <style>
    //       <span> ↓icon  Defence: <style>
    // Both playstyle ids resolve via PLAYING_STYLES; 0/absent → "Basic".
    const hasPlaystyle = player.playingStyleAttack != null || player.playingStyleDefense != null;
    const atk = playingStyleName(player.playingStyleAttack);
    const def = playingStyleName(player.playingStyleDefense);
    return (
      <div className="block">
        <div onClick={handleCardClick} className="block cursor-pointer">
          {cardEl}
        </div>
        <Link
          href={href}
          className="mt-1 block text-center text-xs focus:outline-none text-[var(--color-text-primary)]/80 hover:text-[var(--color-text-primary)] transition-colors"
        >
          <span className="block truncate">{player.name}</span>
          {/* Playstyle badges — pill style: attack pill border red (#FF3464),
              defence pill border cyan (#00EFFF), text white. Phân biệt bằng màu,
              k prefix. Only rendered when the card carries playstyle ids. */}
          {hasPlaystyle && (
            <span className="mt-1 flex flex-col items-center gap-1 leading-tight">
              <span className="inline-flex min-w-0 max-w-full items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-white truncate"
                style={{ borderColor: "#FF346466", background: "#FF34641a" }}>
                {atk}
              </span>
              <span className="inline-flex min-w-0 max-w-full items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-white truncate"
                style={{ borderColor: "#00EFFF66", background: "#00EFFF1a" }}>
                {def}
              </span>
            </span>
          )}
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
