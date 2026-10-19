// Skill naming and order for the player detail page — a thin view over the
// skill list (skill.list: efootbase name, group, artwork, boosts) and the label
// helpers in apps/web/lib/skill-labels.ts. The detail page shows the card's
// Showtime skills first, keeping the card's own order inside each group; the
// group is the stored efootbase group (openspec efootbase-static-data).
import type { SkillDTO } from "@eflab/shared";
import { skillLabel } from "@/lib/skill-labels";

export const isShowtimeSkill = (skill: SkillDTO | undefined): boolean => skill?.group === "showtime";

/** Label to print for a skill: the stored (efootbase) name, efootbase's
 *  spelling for a fixture name, or the slug while the list is still loading. */
export function skillDisplayName(slug: string, skill?: SkillDTO): string {
  return skillLabel({ slug, name: skill?.name ?? slug });
}

/** Showtime skills first (stable order inside each group). */
export function orderSkills(slugs: readonly string[], bySlug: ReadonlyMap<string, SkillDTO>): string[] {
  const showtime = slugs.filter((s) => isShowtimeSkill(bySlug.get(s)));
  const rest = slugs.filter((s) => !isShowtimeSkill(bySlug.get(s)));
  return [...showtime, ...rest];
}
