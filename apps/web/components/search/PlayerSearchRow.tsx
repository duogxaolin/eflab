"use client";
import type { ButtonHTMLAttributes } from "react";
import { Shield, Swords } from "lucide-react";
import { playingStyleName, type CardPreview } from "@eflab/shared";
import { positionOf, statTierBg, statTierForeground } from "@/lib/card-display";
import { playerCardDynamicUrl } from "@/lib/r2-images";

/**
 * One player result (search palette, compare picker, home search list): a
 * 40 × 56 card-face thumbnail (`cards/{id}_dynamic.webp` through the R2
 * helper, lazy), the name 14/500, a 12 px muted line "POS · attack style ·
 * defence style" with 12 px style icons and the card's pack / campaign name
 * as a soft lime chip when it has one (change efootbase-function-parity
 * "Search Result Lists"; it replaced the card-type chip), and the max-level
 * overall at the right as a 40 × 24 badge filled with its tier colour (black
 * text). The badge is the card's overall at max level from the dump
 * (Booster 1 on), so its accessible text says "max overall".
 * On a narrow row (a phone: text column under 360 px — a container query in
 * globals.css) the line wraps instead of cutting the words that tell the
 * cards of one player apart (browser QA 2026-10-25 W4): the styles flow onto
 * a second line when they do not fit (no "·" separators there — the icons
 * separate them), and the pack chip takes its own line, up to two lines.
 * Wider rows keep the single line.
 * Extra button props (role="option", id, aria-selected, tabIndex, mouse
 * handlers) pass through: the lists keep DOM focus in their input and point
 * at the active row with `aria-activedescendant`.
 */
export function PlayerSearchRow({
  player,
  className = "",
  ...rest
}: { player: CardPreview } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">) {
  const pos = positionOf(player.registeredPosition);
  const attack = player.playingStyleAttack != null ? playingStyleName(player.playingStyleAttack) : null;
  const defence = player.playingStyleDefense != null ? playingStyleName(player.playingStyleDefense) : null;
  const pack = player.packName?.trim() || null;
  return (
    <button type="button" className={`efb-result-row ${className}`} {...rest}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={playerCardDynamicUrl(player.id)}
        alt=""
        width={40}
        height={56}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="efb-result-row__thumb"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <span className="efb-result-row__body">
        <span className="efb-result-row__name">{player.name}</span>
        <span className="efb-result-row__meta">
          <span className="shrink-0">{pos}</span>
          {attack && (
            <>
              <span aria-hidden className="efb-result-row__sep">·</span>
              <span className="efb-result-row__style">
                <Swords className="efb-result-row__icon efb-result-row__icon--attack" aria-hidden />
                <span className="sr-only">Attack: </span>
                <span className="truncate">{attack}</span>
              </span>
            </>
          )}
          {defence && (
            <>
              <span aria-hidden className="efb-result-row__sep">·</span>
              <span className="efb-result-row__style">
                <Shield className="efb-result-row__icon efb-result-row__icon--defence" aria-hidden />
                <span className="sr-only">Defence: </span>
                <span className="truncate">{defence}</span>
              </span>
            </>
          )}
          {pack && (
            <>
              {/* A line break before the chip on a narrow row (CSS). */}
              <span aria-hidden className="efb-result-row__break" />
              <span className="efb-result-row__pack">
                <span className="sr-only">Pack: </span>
                {pack}
              </span>
            </>
          )}
        </span>
      </span>
      <span className={`efb-result-row__ovr ${statTierBg(player.maxOvr)} ${statTierForeground(player.maxOvr)}`}>
        <span className="sr-only">Max overall </span>
        {player.maxOvr}
      </span>
    </button>
  );
}
