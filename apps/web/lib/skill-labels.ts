// Skill display helpers. Since openspec change efootbase-static-data the API
// carries efootbase's data per skill (name, description, group, wiki order,
// icon, stat effects, activation — loaded by the seed from the static snapshot,
// docs/efootbase-static-snapshot.md), so the grouping and the order come from
// the data; nothing here infers a group. No rarity, rank or stat boost is
// synthesised: effects are shown only when efootbase showed them. Within a
// group the order is efootbase's wiki order (stored sortOrder).
import { BASE_STATS, type BaseStat, type SkillEffect, type SkillGroup } from "@eflab/shared";
import { statLabel } from "@/lib/card-display";

/**
 * efootbase label per slug where it differs from the fixture name. The seed now
 * stores efootbase's name, so these only matter for a database seeded without
 * the static snapshot (fixture names such as "One-Time Pass").
 */
const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  "one-touch-pass": "One-touch Pass",
  "no-look-pass": "No Look Pass",
  "first-time-shot": "First-time Shot",
  "rising-shots": "Rising Shot",
  "flip-flap": "Flip Flap",
  sombrero: "Sombrero",
  "super-sub": "Super-sub",
  "long-reach-tackle": "Long Reach Tackle",
  "phenomenal-passing": "Phenomenal Pass",
  "long-range-curler": "Long-Range Curler",
  "s-heading": "Heading",
};

/** Page sections: efootbase's two groups plus "other" for the catalogue entries
 *  efootbase does not treat as skills (group null). */
export type SkillSection = SkillGroup | "other";

export const SKILL_GROUP_LABELS: Readonly<Record<SkillSection, string>> = {
  showtime: "Showtime Skills",
  classic: "Classic Skills",
  // Fixture entries efootbase does not list as skills (AI playing styles, motion
  // styles, set-piece variants); no card in the dump carries them.
  other: "Other catalogue entries",
};
export const SKILL_GROUP_ORDER: readonly SkillSection[] = ["showtime", "classic", "other"];

/** The label to show for a skill — the stored (efootbase) name, or efootbase's
 *  spelling when the database still holds a fixture name. */
export function skillLabel(skill: { slug: string; name: string }): string {
  return LABEL_OVERRIDES[skill.slug] ?? skill.name;
}

/**
 * The description to show — the stored text (efootbase's, or the fixture's for a
 * database seeded without the snapshot). The fixture carries no tier label, so
 * nothing is rewritten here.
 */
export function skillDescription(skill: { description: string }): string {
  return skill.description;
}

/** Section of a skill from its stored group. */
export function skillGroup(skill: { group: SkillGroup | null }): SkillSection {
  return skill.group ?? "other";
}

type Sortable = { slug: string; name: string; group: SkillGroup | null; sortOrder: number | null };

/** Section first (Showtime, Classic, Other — grouped pickers need contiguous
 *  sections), then efootbase's wiki order, then entries without an order by label. */
export function compareSkills(a: Sortable, b: Sortable): number {
  const sa = SKILL_GROUP_ORDER.indexOf(skillGroup(a));
  const sb = SKILL_GROUP_ORDER.indexOf(skillGroup(b));
  if (sa !== sb) return sa - sb;
  if (a.sortOrder !== null && b.sortOrder !== null) return a.sortOrder - b.sortOrder;
  if (a.sortOrder !== null) return -1;
  if (b.sortOrder !== null) return 1;
  return skillLabel(a).localeCompare(skillLabel(b));
}

/** "+6 Dribbling" */
export function effectLabel(e: SkillEffect): string {
  return `${e.value > 0 ? "+" : ""}${e.value} ${statLabel(e.stat)}`;
}

/**
 * Short form for long effect lists (Super-sub boosts 25 of the 26 stats by +1):
 * when every effect has the same value and at most three stats are left out,
 * "+1 to every stat except Stamina"; otherwise null (list the effects).
 */
export function effectSummary(effects: readonly SkillEffect[]): string | null {
  if (effects.length < 8) return null;
  const v = effects[0]!.value;
  if (effects.some((e) => e.value !== v)) return null;
  const boosted = new Set<BaseStat>(effects.map((e) => e.stat));
  const missing = BASE_STATS.filter((s) => !boosted.has(s));
  if (missing.length > 3) return null;
  const sign = v > 0 ? "+" : "";
  return missing.length === 0
    ? `${sign}${v} to every stat`
    : `${sign}${v} to every stat except ${missing.map(statLabel).join(", ")}`;
}
