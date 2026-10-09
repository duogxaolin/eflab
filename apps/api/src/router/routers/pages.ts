// pagesRouter — read-only listings for /new-players, /tournaments, /pro meta.
// No mutations here: /new-players and /tournaments are read-only from seeded data;
// /pro is a static landing page (client UI is a "Coming Soon" page; no payment
// processing this phase).
import { prisma } from "@eflab/db";
import { newPlayersInput } from "@eflab/shared";
import type { NewPlayerPackDTO, LeaderboardTeamDTO } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

export const pagesRouter = router({
  // Newest packs by releaseDate DESC with their constituent cards as thumbnails.
  newPlayers: publicProcedure.input(newPlayersInput).query(async ({ input }) => {
    const packs = await prisma.pack.findMany({
      orderBy: { releaseDate: "desc" },
      take: input.limit,
      include: {
        cards: {
          take: 24,
          orderBy: { player: { ovr: "desc" } as const },
          select: {
            player: {
              select: { id: true, baseId: true, name: true, cardType: true, ovr: true, maxOvr: true, registeredPosition: true, condition: true },
            },
          },
        },
      },
    });
    return packs.map((p) => ({
      id: p.id,
      name: p.name,
      releaseDate: p.releaseDate.toISOString(),
      type: p.type,
      playerCount: p.playerCount,
      players: p.cards.map((c) => ({
        id: c.player.id.toString(),
        baseId: c.player.baseId.toString(),
        name: c.player.name,
        cardType: c.player.cardType,
        ovr: c.player.ovr,
        maxOvr: c.player.maxOvr,
        registeredPosition: c.player.registeredPosition,
        condition: c.player.condition,
      })),
    })) satisfies NewPlayerPackDTO[];
  }),

  // Tournament leaderboard — read-only seeded teams (we don't have a live tournament
  // integration this phase). Points come from a fixed seeded fixtures source so the
  // page renders a ranked table; the seeded Team model has no score column so we
  // derive a stable pseudo-points from teamId + name length so the ranking is
  // deterministic yet still readable as "Team / Points / Rank".
  leaderboard: publicProcedure.query(async () => {
    const teams = await prisma.team.findMany({
      where: { national: false },
      select: { id: true, name: true, countryId: true },
      take: 50,
    });
    const countryRows = await prisma.country.findMany({
      select: { id: true, name: true },
    });
    const countryById = new Map(countryRows.map((c) => [c.id, c.name]));
    let rank = 1;
    const rows: LeaderboardTeamDTO[] = teams
      .map((t) => ({
        id: t.id,
        name: t.name,
        country: t.countryId != null ? (countryById.get(t.countryId) ?? t.name) : t.name,
        // Deterministic pseudo-points: stable enough for a read-only leaderboard
        // scaffold without a live scoring source. Replaced by real ranking in Phase 3.
        points: 1000 - (Math.abs(t.id) % 500) - (t.name.length * 7),
      }))
      .sort((a, b) => b.points - a.points)
      .map((r) => ({ ...r, rank: rank++ }));
    return rows;
  }),
});
