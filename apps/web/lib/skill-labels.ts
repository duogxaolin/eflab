// Display-only skill labels and grouping (efootbase-parity-round2, design
// decision 8). The database keeps the fixture names (packages/db/fixtures/
// skills.json); this table maps a stored slug to the label efootbase shows
// and to its Showtime / Classic group, both read from the 2026-10-18 capture of
// efootbase /wiki/skills (23 Showtime + 44 Classic skills) and the Skills
// filter dialog. Only names observed there are changed; everything else keeps
// its stored name. No rarity, rank or stat boost is synthesised.

/** efootbase label per slug where it differs from the stored name. */
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

/** Showtime skills in efootbase's wiki order (23, all with holders in the dump). */
export const SHOWTIME_SKILL_SLUGS: readonly string[] = [
  "momentum-dribbling", "acceleration-burst", "magnetic-feet", "tap-trick", "bullet-header",
  "blitz-curler", "low-screamer", "snap-strike", "phenomenal-finishing", "willpower",
  "edged-crossing", "game-changing-pass", "visionary-pass", "phenomenal-passing",
  "gk-directing-defence", "gk-spirit-roar", "long-reach-tackle", "power-tackle", "fortress",
  "aerial-fort", "attack-trigger", "shadow-hunt", "attacking-surge",
];

/** Classic skills in efootbase's wiki order (44). */
export const CLASSIC_SKILL_SLUGS: readonly string[] = [
  "scissors-feint", "double-touch", "flip-flap", "marseille-turn", "sombrero", "chop-turn",
  "cut-behind-turn", "scotch-move", "sole-control", "s-heading", "long-range-curler",
  "chip-shot-control", "knuckle-shot", "dipping-shot", "rising-shots", "long-range-shooting",
  "acrobatic-finishing", "heel-trick", "first-time-shot", "one-touch-pass", "through-passing",
  "weighted-pass", "pinpoint-crossing", "outside-curler", "rabona", "no-look-pass",
  "low-lofted-pass", "gk-low-punt", "gk-high-punt", "long-throw", "gk-long-throw",
  "penalty-specialist", "gk-penalty-saver", "gamesmanship", "man-marking", "track-back",
  "interception", "blocker", "aerial-superiority", "sliding-tackle", "acrobatic-clear",
  "captaincy", "super-sub", "fighting-spirit",
];

export type SkillGroup = "showtime" | "classic" | "other";

export const SKILL_GROUP_LABELS: Readonly<Record<SkillGroup, string>> = {
  showtime: "Showtime Skills",
  classic: "Classic Skills",
  // Fixture entries efootbase does not list as skills (AI playing styles, motion
  // styles, set-piece variants); no card in the dump carries them.
  other: "Other catalogue entries",
};
export const SKILL_GROUP_ORDER: readonly SkillGroup[] = ["showtime", "classic", "other"];

const ORDER: ReadonlyMap<string, number> = new Map(
  [...SHOWTIME_SKILL_SLUGS, ...CLASSIC_SKILL_SLUGS].map((slug, i) => [slug, i]),
);

/** The label to show for a skill — efootbase's where observed, else the stored name. */
export function skillLabel(skill: { slug: string; name: string }): string {
  return LABEL_OVERRIDES[skill.slug] ?? skill.name;
}

/**
 * The description to show. The 21 fixture blurbs of the former "Premium"
 * category start with an invented tier prefix ("Premium — …", "Premium skill
 * — …"); it is dropped for display (the sentence is then capitalised) so no
 * made-up tier label reaches the page. The stored text is not changed.
 */
export function skillDescription(skill: { description: string }): string {
  const stripped = skill.description.replace(/^Premium(?: skill)?\s*[—–-]\s*/i, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

export function skillGroup(slug: string): SkillGroup {
  if (SHOWTIME_SKILL_SLUGS.includes(slug)) return "showtime";
  if (CLASSIC_SKILL_SLUGS.includes(slug)) return "classic";
  return "other";
}

/** Sort key: efootbase's wiki order for listed skills, then stored name. */
export function compareSkills(a: { slug: string; name: string }, b: { slug: string; name: string }): number {
  const ia = ORDER.get(a.slug);
  const ib = ORDER.get(b.slug);
  if (ia !== undefined && ib !== undefined) return ia - ib;
  if (ia !== undefined) return -1;
  if (ib !== undefined) return 1;
  return skillLabel(a).localeCompare(skillLabel(b));
}
