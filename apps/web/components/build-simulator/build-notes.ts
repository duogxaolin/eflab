// Static explanatory copy of the player page's Progression controls ("About
// this build" in the Build settings card, the stat grid's "How these stats
// are built"). Deliberately NOT a client module: the server page
// (`app/players/[baseId]/[cardId]/page.tsx`) imports it and hands the strings
// to PlayerDetailClient as the `notes` prop, so they reach the browser in the
// server-rendered HTML instead of the route's JavaScript
// (efootbase-behaviour-parity, F.2 bundle budget). Client components may only
// `import type` from here — a value import would put the text back into the
// bundle. Copy that depends on the build (position, budget, proficiency,
// manager) stays in ProgressionPanel.tsx.

/** Limits of the model (spec "Honest Limits"); the population figures are the
 *  read-only check of change efootbase-exact-model-managers (the max-level
 *  overall is the dump's `overall_at_max_level`; the max-level stats are the
 *  cross-fill dataset's — named in docs, never in public copy, spec "Branding
 *  In Public UI"). */
export const LIMITS_NOTE =
  "Stats, height and weak-foot accuracy come from the database dump. Cards other than the five measured ones were checked in bulk only: the formula equals the dump's overall on 99.9 % of the 40,516 cards without progression; fed a second public dataset's max-level stats, it equals the dump's max-level overall on 95.1 % of 9,843 cards (within 1 on 98.4 %). Base + training + bonus stops at 99 before the boosters, by the source model's rule (no measured reading reaches it): stat points bought past 99 are not counted (a stat row's breakdown shows the part cut). Not modelled: Position Training, In-Match Roles and manager tactics.";

export interface BuildNotes {
  /** LIMITS_NOTE. */
  limits: string;
  /** The training cost rule. */
  costRule: string;
  /** Shown while the build is the opening Max-OVR build … */
  openingBuild: string;
  /** … and once it differs from it. */
  customBuild: string;
  /** What Max OVR and Reset do, after "Max OVR picks … for the N-point budget, ". */
  maxOvrRest: string;
  /** The stat grid's "How these stats are built" text, before its highlight hint. */
  statsHelp: string;
}

export const BUILD_NOTES: BuildNotes = {
  limits: LIMITS_NOTE,
  costRule: "Two points per level above 1 · the nth stat point of a category costs ⌈n / 4⌉ points (the first four cost 1 each).",
  openingBuild: "Opening build: the Max-OVR allocation at the registered position with every usable booster on, Manager Proficiency 90 and no manager.",
  customBuild:
    "Custom build: it differs from the opening Max-OVR build (level, position, proficiency, manager, a booster or a category). Max OVR restores the optimal allocation; Reset zeroes every category.",
  maxOvrRest:
    "before the Manager Proficiency bonus and the cut at 99, so it is the same build at every proficiency and with any manager (as in every measured Max build); a hand-made build can read up to 1 higher, or up to 2 when the preset trains a stat past 99 (those points are not counted). Reset zeroes every category and keeps the proficiency and the manager. Jumping rises with Aerial Strength and with Goalkeeper 1 alike. Boosters are toggled in the Overview card; a stat row opens the steppers of its categories.",
  statsHelp:
    "Base stats + training + the Manager Proficiency bonus, limited to 99, then active boosters + the manager's +1 (cyan chips are booster bumps, lime chips the manager; the training lift and the bonus are inside the value — \"Max\" shows the dump's own max-level values, without the bonus, instead). A stat opens its category's steppers and splits its value into those parts;",
};
