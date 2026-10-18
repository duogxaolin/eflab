// featuredRouter — efootbase homepage "Latest Packs" bundles.
// 24 bundles (17 specialPlayerList + 7 spotlights), each with an ordered card
// list (efootbase's exact display order, including legend spotlights). Source:
// dump/efootbase/packs.json → FeaturedBundle + FeaturedBundleCard (ordinal
// preserves `list` order). Slugs are stable name + release-date slugs
// (`spanish-league-midfielders-2026-10-05`, `spotlight-…`), never the
// autoincrement id, so links survive a reseed.
import { prisma } from "@eflab/db";
import { featuredBySlugInput } from "@eflab/shared";
import type { CardPreview, CardType, FeaturedBundleDTO } from "@eflab/shared";
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

const bundleInclude = {
  cards: {
    orderBy: { ordinal: "asc" },
    include: { player: { select: cardSelect } },
  },
} as const;

type BundleRow = {
  id: number;
  name: string;
  slug: string;
  releaseDate: Date;
  position: number;
  cards: Array<{ player: { [K in keyof typeof cardSelect]: K extends "id" | "baseId" ? bigint : K extends "name" | "condition" | "cardType" ? string : number } }>;
};

function toBundleDTO(b: BundleRow): FeaturedBundleDTO {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    releaseDate: b.releaseDate.toISOString(),
    position: b.position,
    cards: b.cards.map((c): CardPreview => ({
      id: c.player.id.toString(),
      baseId: c.player.baseId.toString(),
      name: c.player.name,
      cardType: c.player.cardType as CardType,
      ovr: c.player.ovr,
      maxOvr: c.player.maxOvr,
      condition: c.player.condition,
      registeredPosition: c.player.registeredPosition,
      playingStyleAttack: c.player.playingStyleAttack,
      playingStyleDefense: c.player.playingStyleDefense,
    })),
  };
}

export const featuredRouter = router({
  // All bundles in efootbase homepage order: releaseDate DESC, position ASC.
  list: publicProcedure.query(async (): Promise<FeaturedBundleDTO[]> => {
    const bundles = await prisma.featuredBundle.findMany({
      orderBy: [{ releaseDate: "desc" }, { position: "asc" }],
      include: bundleInclude,
    });
    return bundles.map(toBundleDTO);
  }),

  // One bundle by slug with its ordered cards, or null (→ 404 on the web).
  bySlug: publicProcedure.input(featuredBySlugInput).query(async ({ input }): Promise<FeaturedBundleDTO | null> => {
    const b = await prisma.featuredBundle.findUnique({
      where: { slug: input.slug },
      include: bundleInclude,
    });
    return b ? toBundleDTO(b) : null;
  }),
});
