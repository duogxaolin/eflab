// communityRouter — build saving, tier voting, reviews, and the headless build
// simulator. Mutations require an authenticated session (protectedProcedure);
// the old hardcoded seed-user behavior is gone.
import { prisma } from "@eflab/db";
import {
  BASE_STATS,
  buildSaveInput,
  buildSimulateInput,
  positionFromIndex,
  reviewInput,
  simulateBuild,
  tierVoteInput,
  type BaseStat,
  type BoosterLike,
  type BuildResult,
} from "@eflab/shared";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

// Resolve the two booster slots of a card to sparse stat vectors (only the
// non-zero stat columns, like `boosterRowToDTO` in the player router). An id
// without a Booster row resolves to null — the engine then applies nothing.
async function boosterSlots(
  boosterId1: number | null,
  boosterId2: number | null,
): Promise<[BoosterLike | null, BoosterLike | null]> {
  const ids = [boosterId1, boosterId2].filter((id): id is number => id != null && id > 0);
  const byId = new Map<number, BoosterLike>();
  if (ids.length > 0) {
    const rows = await prisma.booster.findMany({ where: { id: { in: ids } } });
    for (const row of rows) {
      const r = row as unknown as Record<string, unknown>;
      const stats: Partial<Record<BaseStat, number>> = {};
      for (const s of BASE_STATS) {
        const v = r[s];
        if (typeof v === "number" && v !== 0) stats[s] = v;
      }
      byId.set(row.id, { stats });
    }
  }
  const slot = (id: number | null) => (id != null && id > 0 ? (byId.get(id) ?? null) : null);
  return [slot(boosterId1), slot(boosterId2)];
}

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

  // Save a build. Requires auth. `Build.level` stores the selected max level,
  // `trainingPoints` the stat points per training category and `boosters` the
  // two slot toggles. The Build model has no position column and this change
  // adds no migration, so the position the overall was estimated for is not
  // persisted (the saved build is listed by level + note only). No manager.
  saveBuild: protectedProcedure.input(buildSaveInput).mutation(async ({ input, ctx }) => {
    const build = await prisma.build.create({
      data: {
        authorId: ctx.session.id,
        playerId: input.playerId,
        level: input.maxLevel,
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

  // Headless build simulator — the same progression engine the detail page
  // runs client-side (@eflab/shared progression.ts). maxLevel defaults to the
  // card's level cap, position to its registered position.
  simulate: publicProcedure.input(buildSimulateInput).query(async ({ input }): Promise<BuildResult> => {
    const player = await prisma.player.findUnique({ where: { id: input.playerId } });
    if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
    const row = player as unknown as Record<string, unknown>;
    const base = Object.fromEntries(
      BASE_STATS.map((s) => [s, typeof row[s] === "number" ? (row[s] as number) : 40]),
    ) as Record<BaseStat, number>;
    const registeredPosition = positionFromIndex(player.registeredPosition);
    const boosters = await boosterSlots(player.boosterId1, player.boosterId2);
    return simulateBuild({
      base,
      levelCap: player.levelCap,
      registeredPosition,
      config: {
        playerId: input.playerId.toString(),
        maxLevel: input.maxLevel ?? player.levelCap,
        position: input.position ?? registeredPosition,
        trainingPoints: input.trainingPoints,
        boosters: input.boosters,
      },
      boosters,
    });
  }),
});
