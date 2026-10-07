// communityRouter — build saving, tier voting, reviews, and the headless build
// simulator. Mutations require an authenticated session (protectedProcedure);
// the old hardcoded seed-user behavior is gone.
import { prisma } from "@eflab/db";
import {
  buildSaveInput,
  buildSimulateInput,
  simulateBuild,
  reviewInput,
  tierVoteInput,
  type BuildResult,
} from "@eflab/shared";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

export const communityRouter = router({
  // Tier vote for a player card — upserts by (userId, playerId). Requires auth.
  voteTier: protectedProcedure.input(tierVoteInput).mutation(async ({ input, ctx }) => {
    const userId = ctx.session.id;
    const vote = await prisma.tierVote.upsert({
      where: { userId_playerId: { userId, playerId: input.playerId } },
      create: { userId, playerId: input.playerId, tier: input.tier },
      update: { tier: input.tier },
    });
    // Aggregate consensus tier (mode of votes).
    const agg = await prisma.tierVote.groupBy({
      by: ["tier"],
      where: { playerId: input.playerId },
      _count: { _all: true },
      orderBy: { _count: { tier: "desc" } },
    });
    const consensus = agg[0]?.tier ?? input.tier;
    await prisma.player.update({ where: { id: input.playerId }, data: { communityTier: consensus } });
    return { tier: vote.tier, consensus };
  }),

  // Submit a 1-5 star review. Requires auth.
  review: protectedProcedure.input(reviewInput).mutation(async ({ input, ctx }) => {
    const review = await prisma.review.create({
      data: {
        authorId: ctx.session.id,
        playerId: input.playerId,
        rating: input.rating,
        content: input.content,
      },
    });
    return { id: review.id, rating: review.rating, createdAt: review.createdAt.toISOString() };
  }),

  // List reviews for a card (public).
  reviews: publicProcedure.input(tierVoteInput.pick({ playerId: true })).query(async ({ input }) => {
    const reviews = await prisma.review.findMany({
      where: { playerId: input.playerId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { username: true, avatarUrl: true } } },
    });
    const avgAgg = await prisma.review.aggregate({ where: { playerId: input.playerId }, _avg: { rating: true } });
    return {
      items: reviews.map((r) => ({
        id: r.id,
        author: r.author.username,
        authorAvatar: r.author.avatarUrl,
        rating: r.rating,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })),
      averageRating: avgAgg._avg.rating ?? 0,
    };
  }),

  // Save a build (public). Training points stored as JSON. Requires auth.
  saveBuild: protectedProcedure.input(buildSaveInput).mutation(async ({ input, ctx }) => {
    const build = await prisma.build.create({
      data: {
        authorId: ctx.session.id,
        playerId: input.playerId,
        managerId: input.managerId ?? null,
        level: input.level,
        trainingPoints: input.trainingPoints as object,
        boosters: input.boosters as object,
        note: input.note ?? null,
        isPublic: input.isPublic,
        isPro: ctx.session.isPro,
      },
    });
    return { id: build.id, createdAt: build.createdAt.toISOString(), isPublic: build.isPublic };
  }),

  // List public builds for a card (public read).
  builds: publicProcedure.input(tierVoteInput.pick({ playerId: true })).query(async ({ input }) => {
    const builds = await prisma.build.findMany({
      where: { playerId: input.playerId, isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { author: { select: { username: true, avatarUrl: true } } },
    });
    return {
      items: builds.map((b) => ({
        id: b.id,
        author: b.author.username,
        level: b.level,
        note: b.note,
        isPro: b.isPro,
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }),

  // Headless build simulator — runs the same progression engine exposed for server-side compute.
  simulate: publicProcedure.input(buildSimulateInput).query(async ({ input }): Promise<BuildResult> => {
    const player = await prisma.player.findUnique({ where: { id: input.playerId } });
    if (!player) throw new Error("player not found");
    const baseStats = Object.fromEntries(
      (["offensiveAwareness","ballControl","dribbling","tightPossession","lowPass","loftedPass","finishing","heading","placeKicking","curl","speed","acceleration","kickingPower","jump","physicalContact","balance","stamina","defensiveAwareness","ballWinning","defensiveEngagement","aggression","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach"] as const).map(k => [k, (player as unknown as Record<string, number>)[k] ?? 40]),
    ) as Record<string, number>;
    const boosters = [];
    if (input.boosters[0] && player.boosterId1) {
      const b = await prisma.booster.findUnique({ where: { id: player.boosterId1 } });
      if (b) boosters.push({
        id: b.id, name: b.name,
        stats: Object.fromEntries(Object.entries(b as unknown as Record<string, number>)
          .filter(([k, v]) => ["offensiveAwareness","ballControl","dribbling","tightPossession","lowPass","loftedPass","finishing","heading","placeKicking","curl","speed","acceleration","kickingPower","jump","physicalContact","balance","stamina","defensiveAwareness","ballWinning","defensiveEngagement","aggression","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach","weakFootAccuracy"].includes(k) && typeof v === "number" && v > 0)),
      });
    }
    if (input.boosters[1] && player.boosterId2) {
      const b = await prisma.booster.findUnique({ where: { id: player.boosterId2 } });
      if (b) boosters.push({
        id: b.id, name: b.name,
        stats: Object.fromEntries(Object.entries(b as unknown as Record<string, number>)
          .filter(([k, v]) => ["offensiveAwareness","ballControl","dribbling","tightPossession","lowPass","loftedPass","finishing","heading","placeKicking","curl","speed","acceleration","kickingPower","jump","physicalContact","balance","stamina","defensiveAwareness","ballWinning","defensiveEngagement","aggression","gkAwareness","gkCatching","gkParrying","gkReflexes","gkReach","weakFootAccuracy"].includes(k) && typeof v === "number" && v > 0)),
      });
    }
    let managerTactics: Record<string, number> | undefined;
    if (input.managerId) {
      const m = await prisma.manager.findUnique({ where: { id: input.managerId } });
      if (m) {
        managerTactics = {
          possessionGame: (m as unknown as Record<string, number>).possessionGame ?? 0,
          quickCounter: (m as unknown as Record<string, number>).quickCounter ?? 0,
          longBallCounter: (m as unknown as Record<string, number>).longBallCounter ?? 0,
          outWide: (m as unknown as Record<string, number>).outWide ?? 0,
          longBall: (m as unknown as Record<string, number>).longBall ?? 0,
          overload: (m as unknown as Record<string, number>).overload ?? 0,
        };
      }
    }
    const playerTactics = {
      possessionGame: (player as unknown as Record<string, number>).possessionGame ?? 0,
      quickCounter: (player as unknown as Record<string, number>).quickCounter ?? 0,
      longBallCounter: (player as unknown as Record<string, number>).longBallCounter ?? 0,
      outWide: (player as unknown as Record<string, number>).outWide ?? 0,
      longBall: (player as unknown as Record<string, number>).longBall ?? 0,
    };
    return simulateBuild({
      base: baseStats as never,
      config: {
        playerId: input.playerId.toString(),
        level: input.level,
        maxLevel: input.maxLevel,
        trainingPoints: input.trainingPoints,
        boosters: input.boosters,
        managerId: input.managerId?.toString() ?? null,
      },
      boosters: boosters as never,
      managerTactics,
      playerTactics,
    });
  }),
});
