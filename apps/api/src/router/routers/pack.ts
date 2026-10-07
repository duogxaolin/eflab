// packRouter — list of packs and details (with cards).
import { prisma } from "@eflab/db";
import { packListInput, packByIdInput } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

export const packRouter = router({
  list: publicProcedure.input(packListInput).query(async ({ input }) => {
    const where = input.type === "all" ? {} : { type: input.type };
    const packs = await prisma.pack.findMany({ where, orderBy: { releaseDate: "desc" } });
    return packs.map(p => ({
      id: p.id, name: p.name, releaseDate: p.releaseDate.toISOString(),
      type: p.type, playerCount: p.playerCount,
    }));
  }),
  featured: publicProcedure.query(async () => {
    const featuredIds = [
      "spanish-league-selection-midfielders-5-oct-26",
      "piemonte-bn-selection-5-oct-26",
      "national-team-selection-netherlands-1-oct-26",
    ];
    const packs = await prisma.pack.findMany({
      where: { id: { in: featuredIds } },
      include: {
        cards: {
          include: {
            player: {
              select: {
                id: true,
                baseId: true,
                name: true,
                cardType: true,
                ovr: true,
                maxOvr: true,
                condition: true,
                registeredPosition: true,
              },
            },
          },
        },
      },
    });
    return featuredIds
      .map((id) => packs.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((pack) => ({
        id: pack.id,
        name: pack.name,
        releaseDate: pack.releaseDate.toISOString(),
        type: pack.type,
        playerCount: pack.playerCount,
        cards: pack.cards.map((c) => ({
          id: c.player.id.toString(),
          baseId: c.player.baseId.toString(),
          name: c.player.name,
          cardType: c.player.cardType,
          ovr: c.player.ovr,
          maxOvr: c.player.maxOvr,
          registeredPosition: c.player.registeredPosition,
          condition: c.player.condition,
        })),
      }));
  }),
  byId: publicProcedure.input(packByIdInput).query(async ({ input }) => {
    const pack = await prisma.pack.findUnique({ where: { id: input.id }, include: { cards: { include: { player: { select: { id: true, baseId: true, name: true, cardType: true, ovr: true, maxOvr: true, condition: true, registeredPosition: true } } } } } });
    if (!pack) return null;
    return {
      id: pack.id, name: pack.name, releaseDate: pack.releaseDate.toISOString(),
      type: pack.type, playerCount: pack.playerCount,
      cards: pack.cards.map(c => ({
        id: c.player.id.toString(),
        baseId: c.player.baseId.toString(),
        name: c.player.name,
        cardType: c.player.cardType,
        ovr: c.player.ovr,
        maxOvr: c.player.maxOvr,
        registeredPosition: c.player.registeredPosition,
        condition: c.player.condition,
      })),
    };
  }),
});
