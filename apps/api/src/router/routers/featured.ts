// featuredRouter — efootbase homepage "specialPlayerList" bundles.
// 17 curated featured bundles, each with an ordered card list (efootbase's
// exact display order, including legend spotlights). Source:
// dump/efootbase/packs.json → data.specialPlayerList, seeded into
// FeaturedBundle + FeaturedBundleCard (ordinal preserves `list` order).
import { prisma } from "@eflab/db";
import type { FeaturedBundleDTO } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

const cardSelect = {
  id: true,
  baseId: true,
  name: true,
  cardType: true,
  ovr: true,
  maxOvr: true,
  condition: true,
  registeredPosition: true,
  playingStyleAttack: true,
  playingStyleDefense: true,
} as const;

export const featuredRouter = router({
  // All 17 bundles in efootbase homepage order: releaseDate DESC, position ASC.
  // Each bundle's cards are ordered by `ordinal` (the efootbase `list` array order).
  list: publicProcedure.query(async () => {
    const bundles = await prisma.featuredBundle.findMany({
      orderBy: [{ releaseDate: "desc" }, { position: "asc" }],
      include: {
        cards: {
          orderBy: { ordinal: "asc" },
          include: { player: { select: cardSelect } },
        },
      },
    });
    return bundles.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      releaseDate: b.releaseDate.toISOString(),
      position: b.position,
      cards: b.cards.map((c) => ({
        id: c.player.id.toString(),
        baseId: c.player.baseId.toString(),
        name: c.player.name,
        cardType: c.player.cardType,
        ovr: c.player.ovr,
        maxOvr: c.player.maxOvr,
        condition: c.player.condition,
        registeredPosition: c.player.registeredPosition,
        playingStyleAttack: c.player.playingStyleAttack,
        playingStyleDefense: c.player.playingStyleDefense,
      })),
    })) satisfies FeaturedBundleDTO[];
  }),
});
