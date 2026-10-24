// boosterRouter — the 29 basic "+1" boosters a card without its own Booster 2
// can take as its second booster (change efootbase-function-parity, design
// decision D4: the reference's "Select second booster" drawer). Served from
// the committed booster fixture (BASIC_BOOSTERS in @eflab/db, ids 1–29), not
// from the Booster table, whose ids 12–29 hold the dump's scaled boosters; no
// database access. Alphabetical by name (= the fixture's id order, asserted by
// the @eflab/db tests), each with its `b2=` URL slug.
import { BASIC_BOOSTERS } from "@eflab/db";
import { secondBoosterSlug, type SecondBoosterDTO } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

const SECOND_CHOICES: readonly SecondBoosterDTO[] = Object.freeze(
  [...BASIC_BOOSTERS]
    .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.id - b.id))
    .map((b) => ({ id: b.id, name: b.name, magnitude: 1, tier: "basic", stats: { ...b.stats }, slug: secondBoosterSlug(b.name) })),
);

export const boosterRouter = router({
  secondChoices: publicProcedure.query((): SecondBoosterDTO[] => SECOND_CHOICES.map((b) => ({ ...b, stats: { ...b.stats } }))),
});
