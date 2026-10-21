"use client";
import type { ButtonHTMLAttributes } from "react";
import { Shield, Swords } from "lucide-react";
import { playingStyleName, type CardPreview } from "@eflab/shared";
import { CARD_TYPE_LABEL, positionOf, statTierBg, statTierForeground } from "@/lib/card-display";
import { playerCardDynamicUrl } from "@/lib/r2-images";

/**
 * One player result (search palette, compare picker, home search dropdown):
 * a 40 × 56 card-face thumbnail (`cards/{id}_dynamic.webp` through the R2
 * helper, lazy), the name 14/500, a 12 px muted line "POS · attack style ·
 * defence style" with 12 px style icons and the card type as a soft lime chip,
 * and the max-level overall at the right as a 40 × 24 badge filled with its
 * tier colour (black text). The badge is the card's overall at max level from
 * the dump (Booster 1 on), so its accessible text says "max overall".
 * Extra button props (role="option", data attributes) pass through.
 */
export function PlayerSearchRow({
  player,
  className = "",
  ...rest
}: { player: CardPreview } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">) {
  const pos = positionOf(player.registeredPosition);
  const attack = player.playingStyleAttack != null ? playingStyleName(player.playingStyleAttack) : null;
  const defence = player.playingStyleDefense != null ? playingStyleName(player.playingStyleDefense) : null;
  const typeLabel = CARD_TYPE_LABEL[player.cardType] ?? player.cardType;
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
          <span className="efb-result-row__type">{typeLabel}</span>
        </span>
      </span>
      <span className={`efb-result-row__ovr ${statTierBg(player.maxOvr)} ${statTierForeground(player.maxOvr)}`} title={`Max overall ${player.maxOvr} (max level, from the dump)`}>
        <span className="sr-only">Max overall </span>
        {player.maxOvr}
      </span>
    </button>
  );
}
