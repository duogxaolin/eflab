"use client";
import { useId } from "react";
import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import type { SkillDTO } from "@eflab/shared";
import { SKILL_GROUP_LABELS, skillDescription, skillGroup } from "@/lib/skill-labels";
import { SkillIcon } from "@/components/skills/SkillIcon";
import { SkillEffects } from "@/components/skills/SkillEffects";
import { Tooltip } from "@/components/ui/Tooltip";

// Player-page skill name (efootbase-static-data; restyled in
// efootbase-ui-redesign; a link with a preview since
// efootbase-behaviour-parity — the reference's skill names are links with a
// hover tooltip). Two looks: `chip` (Skills section: 14/600 radius-8 chip,
// gold for Showtime, a bolt when the skill raises stats) and `inline` (the
// Overview paragraph: an underlined link, gold for Showtime).
//
// - Mouse: hovering shows the preview after the shared tooltip delay (at once
//   during the warm-up); a click follows the link to /skills/[slug].
// - Keyboard: focus shows the preview at once (`aria-describedby`), Enter
//   follows the link, Escape hides the preview without moving focus.
// - Touch / pen: the first tap does not navigate; it opens the same content
//   as a popover (`role="dialog"`, named by the skill) with a "Skill page and
//   cards" link — tapping that navigates; Escape or a tap outside closes it
//   and focus returns to the skill name.
// The preview (288 px, `.efb-skill-tip`) has the artwork on top, edge to edge
// and letterboxed (SkillIcon: a 576×324 still inside the 576:346 box, never
// cropped), then the name 14/600 (gold for Showtime), the group, the
// description, the stored stat boosts and activation. It holds no link (a
// tooltip must not be interactive); only the touch popover does. Placement
// (Tooltip / Popover, components/ui/floating.ts): under the name when it
// fits, else above, ≥ 8 px inside the visible viewport; the popover scrolls
// inside when taller than the viewport.

function SkillPreview({ slug, label, skill, titleId }: { slug: string; label: string; skill: SkillDTO | undefined; titleId?: string }) {
  const showtime = skill?.group === "showtime";
  const nameClass = `text-sm font-semibold ${showtime ? "text-[var(--color-showtime)]" : "text-white"}`;
  return (
    <>
      {skill?.iconUrl && <SkillIcon src={skill.iconUrl} width="fluid" />}
      <div className="space-y-2 p-3">
        <div className="space-y-0.5">
          {titleId ? (
            <h4 id={titleId} className={nameClass}>
              {label}
            </h4>
          ) : (
            <p className={nameClass}>{label}</p>
          )}
          {skill && <p className="text-xs text-[var(--color-text-secondary)]">{SKILL_GROUP_LABELS[skillGroup(skill)]}</p>}
        </div>
        {skill?.description && <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{skillDescription(skill)}</p>}
        {skill && <SkillEffects effects={skill.effects} activation={skill.activation} compact />}
        {titleId && (
          <Link
            href={`/skills/${slug}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          >
            Skill page and cards <ArrowRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>
    </>
  );
}

export function SkillChip({
  slug,
  label,
  skill,
  variant = "chip",
}: {
  slug: string;
  label: string;
  skill: SkillDTO | undefined;
  variant?: "chip" | "inline";
}) {
  const titleId = `skill-pop-${useId().replace(/:/g, "")}-title`;
  const showtime = skill?.group === "showtime";
  // Bolt after the name = the skill raises stats (it has stored boosts).
  const boosts = (skill?.effects?.length ?? 0) > 0;

  return (
    <Tooltip
      content={<SkillPreview slug={slug} label={label} skill={skill} />}
      className="efb-skill-tip"
      data-testid="skill-preview"
      popover={{
        content: <SkillPreview slug={slug} label={label} skill={skill} titleId={titleId} />,
        labelledBy: titleId,
        className: "efb-skill-tip",
        "data-testid": "skill-popover",
      }}
    >
      {(tp) => (
        <Link
          href={`/skills/${slug}`}
          {...tp}
          data-showtime={showtime ? "true" : undefined}
          data-skill={slug}
          className={variant === "chip" ? "efb-skill-chip hit-44" : "efb-inline-link"}
        >
          {variant === "chip" ? (
            <>
              <span className="min-w-0 break-words">{label}</span>
              {boosts && (
                <>
                  <Zap className="size-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="sr-only">(raises stats)</span>
                </>
              )}
            </>
          ) : (
            label
          )}
        </Link>
      )}
    </Tooltip>
  );
}
