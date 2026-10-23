"use client";
import { useId } from "react";
import { PLAYING_STYLE_DESCRIPTIONS } from "@eflab/shared";
import { Tooltip } from "@/components/ui/Tooltip";

// Playing-style name as an inline trigger (efootbase-behaviour-parity; the
// reference's hero playstyles are buttons and the Overview paragraph links
// them): a button whose only action is to show the style's description —
// hover (after the shared tooltip delay) or keyboard focus show it as a
// tooltip; click, Enter, Space and tap toggle a popover (`role="dialog"`,
// named by the style) with the same text. A style without a known
// description is plain text, never an empty trigger. `kind` names the slot
// ("Attack style" / "Defence style") for screen readers and in the popover.

export function PlaystyleTrigger({
  style,
  kind,
  className = "",
}: {
  style: string;
  kind: "attack" | "defence";
  className?: string;
}) {
  const titleId = `style-pop-${useId().replace(/:/g, "")}-title`;
  const description = PLAYING_STYLE_DESCRIPTIONS[style];
  const kindLabel = kind === "attack" ? "Attack style" : "Defence style";
  if (!description) {
    return (
      <span className={className}>
        <span className="sr-only">{kindLabel}: </span>
        {style}
      </span>
    );
  }
  return (
    <Tooltip
      content={<p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>}
      className="efb-style-tip"
      popoverOn="click"
      popover={{
        content: (
          <div className="space-y-1 p-3">
            <h4 id={titleId} className="text-sm font-semibold text-white">
              {style} <span className="font-normal text-[var(--color-text-secondary)]">· {kindLabel}</span>
            </h4>
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
          </div>
        ),
        labelledBy: titleId,
        className: "efb-style-tip",
        "data-testid": "playstyle-popover",
      }}
    >
      {(tp) => (
        <button type="button" {...tp} className={`efb-inline-trigger hit-44 ${className}`} data-playstyle={kind}>
          <span className="sr-only">{kindLabel}: </span>
          {style}
        </button>
      )}
    </Tooltip>
  );
}
