// Skill naming for the player detail page — a thin view over the single
// display table in apps/web/lib/skill-labels.ts (efootbase-parity-round2
// decision 8: stored names stay, efootbase's observed labels and its
// Showtime / Classic grouping are display-only). The detail page shows the
// card's Showtime skills first, keeping the card's own order inside each group.
import { skillGroup, skillLabel } from "@/lib/skill-labels";

export const isShowtimeSkill = (slug: string): boolean => skillGroup(slug) === "showtime";

/** Label to print for a skill: efootbase's spelling where observed, otherwise
 *  the stored name (or the slug while the name list is still loading). */
export function skillDisplayName(slug: string, storedName?: string | null): string {
  return skillLabel({ slug, name: storedName ?? slug });
}

/** Showtime skills first (stable order inside each group). */
export function orderSkills(slugs: readonly string[]): string[] {
  const showtime = slugs.filter(isShowtimeSkill);
  const classic = slugs.filter((s) => !isShowtimeSkill(s));
  return [...showtime, ...classic];
}
