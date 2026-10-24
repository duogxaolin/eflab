// Tests for the fixture data this change serves (openspec change
// efootbase-function-parity): the 29 basic boosters of the "Select second
// booster" drawer (BASIC_BOOSTERS, from fixtures/boosters.json) with their URL
// slugs, and the public skill slugs over the committed skill fixture. Pure:
// no database. Run: pnpm --filter @eflab/db test   (or: tsx packages/db/src/boosters.test.ts)
import { readFileSync } from "node:fs";
import { BASE_STATS, secondBoosterSlug, skillKeyFromPublicSlug, skillPublicSlug } from "@eflab/shared";
import { BASIC_BOOSTERS, BASIC_BOOSTER_COUNT, basicBoostersFromFixture } from "./boosters.js";
import { SKILL_KEY_ALIASES, skillKeyToSlug } from "./efootbase-map.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}
const throws = (fn: () => unknown): boolean => {
  try { fn(); return false; } catch { return true; }
};

const fixture = JSON.parse(readFileSync(new URL("../fixtures/boosters.json", import.meta.url), "utf-8")) as {
  statKeys: string[];
  basic: Array<{ id: number; nameEn: string; bonus: number[] }>;
};

// 1. BASIC_BOOSTERS = the fixture's basic boosters 1–29.
{
  assert(BASIC_BOOSTERS.length === 29 && BASIC_BOOSTER_COUNT === 29, "29 basic boosters");
  assert(BASIC_BOOSTERS.every((b, i) => b.id === i + 1), "ids 1–29 in order (id 0 \"No Booster\" left out)");
  const statSet = new Set<string>(BASE_STATS);
  assert(BASIC_BOOSTERS.every((b) => Object.keys(b.stats).length === 4 && Object.entries(b.stats).every(([s, v]) => statSet.has(s) && v === 1)), "each raises four base stats by +1");
  const byId = new Map(fixture.basic.map((b) => [b.id, b]));
  assert(BASIC_BOOSTERS.every((b) => b.name === byId.get(b.id)?.nameEn && b.name.endsWith(" +1")), "names = the fixture's English names (\"… +1\")");
  // Stats mapped through the fixture's statKeys order (jumping → jump, tackling → ballWinning, set_piece_taking → placeKicking).
  const sameStats = BASIC_BOOSTERS.every((b) => {
    const raw = byId.get(b.id)!;
    const expected = raw.bonus.flatMap((v, i) => (v === 0 ? [] : [fixture.statKeys[i]!]));
    return expected.length === 4 && expected.every((k) => Object.keys(b.stats).includes(({ jumping: "jump", tackling: "ballWinning", set_piece_taking: "placeKicking" } as Record<string, string>)[k] ?? k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())));
  });
  assert(sameStats, "every booster's four stats follow the fixture's statKeys");
  const strikers = BASIC_BOOSTERS.find((b) => b.name === "Striker's Instinct +1");
  assert(strikers?.id === 28 && JSON.stringify(Object.keys(strikers.stats).sort()) === JSON.stringify(["acceleration", "ballControl", "finishing", "offensiveAwareness"]), "Striker's Instinct +1 (id 28) = Offensive Awareness, Ball Control, Finishing, Acceleration");
  const aerial = BASIC_BOOSTERS.find((b) => b.name === "Aerial +1");
  assert(aerial && aerial.stats.jump === 1 && aerial.stats.heading === 1 && aerial.stats.physicalContact === 1 && aerial.stats.finishing === 1, "Aerial +1 = Finishing, Heading, Physical Contact, Jump");
  // Alphabetical: plain code-unit order of the lower-case names equals the id order.
  const names = BASIC_BOOSTERS.map((b) => b.name.toLowerCase());
  assert(names.every((n, i) => i === 0 || names[i - 1]! < n), "the id order is alphabetical (code-unit order of the names: \"Ball Protection\" before \"Ball-carrying\", \"Off the Ball\" before \"Offence Creator\")");
  assert(Object.isFrozen(BASIC_BOOSTERS), "the list is frozen");
}

// 2. Second-booster slugs.
{
  const slugs = BASIC_BOOSTERS.map((b) => secondBoosterSlug(b.name));
  assert(new Set(slugs).size === 29, "29 distinct slugs");
  assert(slugs.every((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*1$/.test(s)), "every slug is lower-case letters / digits / single hyphens, ending in 1");
  assert(slugs.includes("strikers-instinct1") && slugs.includes("ball-carrying1") && slugs.includes("free-kick-taking1") && slugs.includes("off-the-ball1"), "strikers-instinct1, ball-carrying1, free-kick-taking1, off-the-ball1");
}

// 3. The loader refuses a fixture that breaks the rules (tamper cases).
{
  const clone = () => JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  assert(basicBoostersFromFixture(clone()).length === 29, "the committed fixture loads");
  const swapped = clone();
  [swapped.statKeys[0], swapped.statKeys[1]] = [swapped.statKeys[1]!, swapped.statKeys[0]!];
  assert(throws(() => basicBoostersFromFixture(swapped)), "reordered statKeys are refused");
  const plusTwo = clone();
  plusTwo.basic[1]!.bonus = plusTwo.basic[1]!.bonus.map((v) => (v === 1 ? 2 : v));
  assert(throws(() => basicBoostersFromFixture(plusTwo)), "a +2 basic booster is refused");
  const weakFoot = clone();
  weakFoot.basic[1]!.bonus[26] = 1;
  assert(throws(() => basicBoostersFromFixture(weakFoot)), "a weak-foot bonus (not a base stat) is refused");
  const missing = clone();
  missing.basic = missing.basic.filter((b) => b.id !== 7);
  assert(throws(() => basicBoostersFromFixture(missing)), "a missing id is refused");
  const three = clone();
  three.basic[2]!.bonus = three.basic[2]!.bonus.map((v, i) => (v === 1 && i === three.basic[2]!.bonus.indexOf(1) ? 0 : v));
  assert(throws(() => basicBoostersFromFixture(three)), "a booster with three stats is refused");
}

// 4. Public skill slugs over the committed skill fixture: the stored key of a
//    fixture skill is the alias key or `s_` + the slug with `_` (the inverse of
//    skillKeyToSlug); its public slug is the stored slug except for the four
//    aliased keys, which give the reference's slugs. Unique, and never another
//    skill's stored slug. (The database check of the 67 public skills is in
//    scripts/smoke-test.sh.)
{
  const skills = (JSON.parse(readFileSync(new URL("../fixtures/skills.json", import.meta.url), "utf-8")) as { skills: Array<{ slug: string; released?: boolean }> }).skills;
  const aliasByslug = new Map(Object.entries(SKILL_KEY_ALIASES).map(([key, slug]) => [slug, key]));
  const keyOf = (slug: string) => aliasByslug.get(slug) ?? `s_${slug.replace(/-/g, "_")}`;
  const pub = skills.map((s) => ({ stored: s.slug, key: keyOf(s.slug), public: skillPublicSlug({ slug: s.slug, efbKey: keyOf(s.slug) }) }));
  assert(skills.length === 89 && pub.every((p) => skillKeyToSlug(p.key) === p.stored), "89 fixture skills; each key maps back to its stored slug");
  const changed = pub.filter((p) => p.public !== p.stored).map((p) => `${p.stored}→${p.public}`).sort();
  assert(JSON.stringify(changed) === JSON.stringify(["acrobatic-clear→acrobatic-clearance", "phenomenal-passing→phenomenal-pass", "rising-shots→rising-shot", "s-heading→heading"]), "only the four aliased skills get another public slug: phenomenal-pass, heading, rising-shot, acrobatic-clearance");
  assert(new Set(pub.map((p) => p.public)).size === pub.length, "public slugs are unique");
  const stored = new Map(pub.map((p) => [p.stored, p.key]));
  assert(pub.every((p) => !stored.has(p.public) || stored.get(p.public) === p.key), "a public slug is never another skill's stored slug");
  assert(pub.every((p) => skillKeyFromPublicSlug(p.public) === p.key), "every public slug maps back to its key (skill.byId's public-slug lookup)");
}

if (process.exitCode === 1) process.exit(1);
console.log("\n✓ booster and slug fixture tests passed");
