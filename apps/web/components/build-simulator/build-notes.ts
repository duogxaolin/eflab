// Static explanatory copy of the player page's Progression controls ("About
// this build" in the Build settings card, the stat grid's "How these stats
// are built", the Highlight Max Level note). Deliberately NOT a client
// module: the server page (`app/players/[baseId]/[cardId]/page.tsx`) imports
// it and hands the strings to PlayerDetailClient as the `notes` prop, so they
// reach the browser in the server-rendered HTML instead of the route's
// JavaScript (efootbase-behaviour-parity, F.2 bundle budget). Client
// components may only `import type` from here — a value import would put the
// text back into the bundle. Copy that depends on the build (position,
// budget, proficiency, manager) stays in ProgressionPanel.tsx.

/** Limits of the model (spec "Honest Limits"); the population figures are the
 *  read-only check of change efootbase-exact-model-managers (the max-level
 *  overall is the dump's `overall_at_max_level`; the max-level stats are the
 *  cross-fill dataset's — named in docs, never in public copy, spec "Branding
 *  In Public UI"). */
export const LIMITS_NOTE =
  "Stats, height and weak-foot accuracy come from the database dump. The formula reproduced every reading measured on the five surveyed cards; other cards were checked in bulk only: it equals the dump's overall on 99.9 % of the 40,516 cards without progression and, fed a second public dataset's max-level stats, the dump's max-level overall on 95.1 % of 9,843 cards (within 1 on 98.4 %). Base + training + bonus stops at 99 before the boosters, by the source model's rule: stat points bought past 99 are not counted (the Stat breakdown shows the part cut). Position Training and Weak foot follow the rules described above — measured where those notes say so, eFootLab's inference elsewhere. Not modelled: Form, the remaining-stamina effect, In-Match Roles and manager tactics.";

/** "Position Training" in "About this build" (spec efootbase-s4-measure
 *  "Position Training Toggle": the rule, where it was checked, goalkeepers). */
export const POSITION_TRAINING_NOTE =
  "Position Training scores the positions the card trains at full proficiency in the position tiles, Best Fit and the overall at a trained position; the stats and the card face do not change. Trained: every half-proficiency position, plus every position next to the registered one on the pitch that is not already full (never GK) — a rule checked on seven outfield cards registered at four positions (RWF, LWF, CB, CF); other registered positions use the same pitch grid. Goalkeepers are not modelled. On a tie Best Fit keeps the registered position.";

/** "Weak foot" in "About this build" (spec efootbase-s4-measure "Weak-Foot
 *  Chips": what it changes, the measured levels, and the order against the
 *  boosters and the manager — eFootLab's inference, said as such). */
export const WEAK_FOOT_NOTE =
  "Weak foot takes a flat amount off Ball Control, Low Pass, Lofted Pass, Finishing and Curl by the card's weak-foot accuracy, never below 40. It changes the shown stats only: the overall, the position tiles and the card face stay. Measured levels: weak-foot accuracy 3★ on three cards, 2★ and 1★ on two cards each; 4★ was read on one card only and is not modelled. eFootLab takes the amount from the value after the proficiency bonus and the cut at 99, before the boosters and the manager's +1; that order only matters near 40 and was not measured there.";

export interface BuildNotes {
  /** LIMITS_NOTE. */
  limits: string;
  /** The training cost rule. */
  costRule: string;
  /** Shown while the build is the opening build … */
  openingBuild: string;
  /** … and once it differs from it. */
  customBuild: string;
  /** The "Build" panel of a Trending card (no training categories). */
  trendingBuild: string;
  /** Under "Max Level N" of a Highlight card with a level cap of 1. */
  highlightLevel: string;
  /** What Max OVR and Reset do, after "Max OVR picks … for the N-point budget, ". */
  maxOvrRest: string;
  /** The stat grid's "How these stats are built" text, before its highlight hint. */
  statsHelp: string;
  /** POSITION_TRAINING_NOTE. */
  positionTraining: string;
  /** WEAK_FOOT_NOTE. */
  weakFoot: string;
  /** Visible reason of the disabled Position Training toggle (a goalkeeper). */
  positionTrainingGoalkeeper: string;
  /** Visible reason of the disabled Weak foot toggle (an unmeasured accuracy). */
  weakFootUnmeasured: string;
}

export const BUILD_NOTES: BuildNotes = {
  limits: LIMITS_NOTE,
  costRule: "Two points per level above 1 · the nth stat point of a category costs ⌈n / 4⌉ points (the first four cost 1 each) · at most 25 stat points per category.",
  openingBuild:
    "Opening build: the Max-OVR allocation at the registered position (no point on a card whose official max level is not listed) with every usable booster on, Manager Proficiency 90 and no manager — or the manager you chose last, which this browser remembers for every card.",
  customBuild:
    "Custom build: it differs from the opening build (level, position, proficiency, manager, a booster or a category). The page address holds it (all but the position), so a reload or a shared link opens the same build. Max OVR restores the optimal allocation; Reset zeroes every category.",
  trendingBuild:
    "Build: this card's max level is 1, so it has no training points to spend — choose a manager and the Manager Proficiency here; Booster 1 steps through its levels in the Overview card.",
  highlightLevel: "This card's official max level is not listed. Pick a level to try a build.",
  maxOvrRest:
    "before the Manager Proficiency bonus and the cut at 99, so it is the same build at every proficiency and with any manager (as in every measured Max build); a hand-made build can read up to 1 higher, or up to 2 when the preset trains a stat past 99 (those points are not counted). Reset zeroes every category and keeps the proficiency, the manager, the boosters and the Max Level; lowering the Max Level removes points from the last categories first. Jumping rises with Aerial Strength and with Goalkeeper 1 alike. Boosters are toggled in the Overview card; a stat row or a category strip item opens its category's controls.",
  statsHelp:
    "Base stats + training + the Manager Proficiency bonus, limited to 99, then active boosters + the manager's +1 (cyan chips are booster bumps, lime chips the manager, orange chips the weak-foot deduction while Weak foot is on; the training lift and the bonus are inside the value — \"Max\" shows the dump's own max-level values, without the bonus, instead). The Stat breakdown in \"About this build\" splits every value into those parts;",
  positionTraining: POSITION_TRAINING_NOTE,
  weakFoot: WEAK_FOOT_NOTE,
  positionTrainingGoalkeeper: "Not measured for goalkeepers",
  weakFootUnmeasured: "Not measured for this weak-foot level",
};
