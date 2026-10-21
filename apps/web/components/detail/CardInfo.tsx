"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { CARD_TYPE_LABELS, formatFeetInches, type PlayerCardDTO } from "@eflab/shared";
import { formatUtcDate } from "@/lib/format-date";
import { conditionLabel, positionOf, strongerFootLabel } from "@/lib/card-display";
import { conditionUrl } from "@/lib/r2-images";

// "Card Info" block of the player detail page (efootbase left column): the
// card's identity facts in efootbase's order, with a copy control on the id.
// Every value comes from the DTO; a missing relation prints "—".

export function CardInfo({ player: p }: { player: PlayerCardDTO }) {
  const [copied, setCopied] = useState(false);
  const condLetter = p.condition && /^[a-eA-E]$/.test(p.condition) ? p.condition.toUpperCase() : null;
  const copyCardId = async () => {
    try {
      await navigator.clipboard.writeText(p.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / insecure context): the id stays
      // selectable as text, nothing else to do.
    }
  };
  const rows: Array<[string, React.ReactNode]> = [
    ["Name", p.name],
    ["Featured", p.pack?.name ?? "—"],
    ["Card Type", CARD_TYPE_LABELS[p.cardType]],
    // The card's real max level (dump `level_cap`) — since the face dropped
    // its MAX LEVEL badge (efootbase-ui-redesign) this row shows it on every
    // card (catalog-browsing-parity "Player Detail Accuracy").
    ["Max Level", String(Math.max(1, p.levelCap))],
    [
      "Nationality",
      <span key="nat" className="inline-flex items-center gap-1.5">
        {p.flagUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.flagUrl} alt="" width={16} height={16} loading="lazy" decoding="async" className="size-4 rounded-sm object-contain" />
        )}
        {p.countryName ?? "—"}
      </span>,
    ],
    [
      "Team",
      <span key="team" className="inline-flex items-center gap-1.5">
        {p.teamEmblemUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.teamEmblemUrl} alt="" width={16} height={16} loading="lazy" decoding="async" className="size-4 object-contain" />
        )}
        {p.teamName ?? "—"}
      </span>,
    ],
    ["Position", positionOf(p.registeredPosition)],
    ["Age", String(p.age)],
    ["Strong Foot", strongerFootLabel(p.strongerFoot)],
    ["Height", `${p.height} CM · ${formatFeetInches(p.height)}`],
    ["Weight", `${p.weight} KG`],
    [
      "Condition",
      condLetter ? (
        <span key="cond" className="inline-flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={conditionUrl(condLetter)} alt="" width={16} height={16} loading="lazy" decoding="async" className="size-4 object-contain" />
          {conditionLabel(condLetter)} ({condLetter})
        </span>
      ) : (
        "—"
      ),
    ],
    [
      "Card ID",
      <span key="id" className="inline-flex items-center gap-1.5">
        <span className="tabular-nums" data-testid="card-id">{p.id}</span>
        <button
          type="button"
          onClick={() => void copyCardId()}
          className="hit-44 inline-flex size-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-default)] hover:text-white cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          title="Copy Card ID"
          aria-label={copied ? "Card ID copied" : "Copy card ID"}
          data-testid="copy-card-id"
        >
          {copied ? <Check className="size-3.5 text-[var(--color-accent)]" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
        <span className="sr-only" role="status" aria-live="polite">{copied ? "Card ID copied" : ""}</span>
      </span>,
    ],
    ["Release Date", p.releaseDate ? formatUtcDate(p.releaseDate) : "—"],
  ];
  return (
    <section aria-labelledby="card-info-title" data-testid="card-info" className="efb-card">
      <h2 id="card-info-title" className="efb-card__title">Card Info</h2>
      <dl className="mt-1.5 divide-y divide-[var(--color-line-separator)] text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-1.5 leading-6">
            <dt className="shrink-0 text-[var(--color-text-secondary)]">{label}</dt>
            <dd className="min-w-0 text-right font-semibold text-white break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
