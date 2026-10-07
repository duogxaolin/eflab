// userRouter — public profiles + follow graph + user-scoped listings.
import { prisma } from "@eflab/db";
import {
  byUsernameInput,
  followInput,
  followListInput,
  userBuildsInput,
  userReviewsInput,
  userTierVotesInput,
} from "@eflab/shared";
import type {
  UserDTO,
  UserBuildDTO,
  UserReviewDTO,
  UserTierVoteDTO,
  FollowDTO,
} from "@eflab/shared";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

async function loadUserByUsername(username: string, viewerId: string | null): Promise<UserDTO | null> {
  const u = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, username: true, displayName: true, avatarUrl: true,
      region: true, country: true, followersCount: true, followingCount: true, isPro: true,
    },
  });
  if (!u) return null;
  let isFollowing = false;
  if (viewerId) {
    const row = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: u.id } },
      select: { followerId: true },
    });
    isFollowing = !!row;
  }
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    region: u.region,
    country: u.country,
    followersCount: u.followersCount,
    followingCount: u.followingCount,
    isPro: u.isPro,
    isFollowing,
  };
}

export const userRouter = router({
  // Public profile by username. Includes `isFollowing` relative to the viewer.
  byUsername: publicProcedure.input(byUsernameInput).query(async ({ input, ctx }): Promise<UserDTO | null> => {
    return loadUserByUsername(input.username, ctx.session?.id ?? null);
  }),

  // Follow a user — atomic follower/following counter update via $transaction.
  follow: protectedProcedure.input(followInput).mutation(async ({ input, ctx }) => {
    const me = ctx.session.id;
    const target = await prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.id === me) throw new Error("CANNOT_FOLLOW_SELF");
    // Guard the increment on whether the Follow edge already exists — repeated
    // follow calls must NOT keep raising the counters (mirrors unfollow side).
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: me, followingId: target.id } },
      select: { followerId: true },
    });
    if (existing) return { ok: true };

    await prisma.$transaction([
      prisma.follow.create({ data: { followerId: me, followingId: target.id } }),
      prisma.user.update({ where: { id: target.id }, data: { followersCount: { increment: 1 } } }),
      prisma.user.update({ where: { id: me }, data: { followingCount: { increment: 1 } } }),
    ]);
    return { ok: true };
  }),

  // Unfollow a user — counter decrement by guarded update (only if the row exists).
  unfollow: protectedProcedure.input(followInput).mutation(async ({ input, ctx }) => {
    const me = ctx.session.id;
    const target = await prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (!target) throw new Error("USER_NOT_FOUND");
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: me, followingId: target.id } },
      select: { followerId: true },
    });
    if (existing) {
      await prisma.$transaction([
        prisma.follow.delete({ where: { followerId_followingId: { followerId: me, followingId: target.id } } }),
        prisma.user.update({ where: { id: target.id }, data: { followersCount: { decrement: 1 } } }),
        prisma.user.update({ where: { id: me }, data: { followingCount: { decrement: 1 } } }),
      ]);
    }
    return { ok: true };
  }),

  // List a user's followers.
  followers: publicProcedure.input(followListInput).query(async ({ input }) => {
    const u = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (!u) return { items: [] as FollowDTO[], total: 0, page: input.page, limit: input.limit };
    const [total, rows] = await prisma.$transaction([
      prisma.follow.count({ where: { followingId: u.id } }),
      prisma.follow.findMany({
        where: { followingId: u.id },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: { follower: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.follower.id,
        username: r.follower.username,
        displayName: r.follower.displayName,
        avatarUrl: r.follower.avatarUrl,
      })),
      total, page: input.page, limit: input.limit,
    };
  }),

  // List who a user follows.
  following: publicProcedure.input(followListInput).query(async ({ input }) => {
    const u = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (!u) return { items: [] as FollowDTO[], total: 0, page: input.page, limit: input.limit };
    const [total, rows] = await prisma.$transaction([
      prisma.follow.count({ where: { followerId: u.id } }),
      prisma.follow.findMany({
        where: { followerId: u.id },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: { following: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.following.id,
        username: r.following.username,
        displayName: r.following.displayName,
        avatarUrl: r.following.avatarUrl,
      })),
      total, page: input.page, limit: input.limit,
    };
  }),

  // User's public builds.
  userBuilds: publicProcedure.input(userBuildsInput).query(async ({ input }) => {
    const u = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (!u) return { items: [] as UserBuildDTO[], total: 0, page: input.page, limit: input.limit };
    const skip = (input.page - 1) * input.limit;
    const [total, rows] = await prisma.$transaction([
      prisma.build.count({ where: { authorId: u.id, isPublic: true } }),
      prisma.build.findMany({
        where: { authorId: u.id, isPublic: true },
        orderBy: { createdAt: "desc" },
        skip, take: input.limit,
        select: {
          id: true, playerId: true, level: true, note: true, isPro: true, isPublic: true, createdAt: true,
          player: { select: { id: true, baseId: true, name: true, cardType: true, ovr: true } },
        },
      }),
    ]);
    return {
      items: rows.map((b) => ({
        id: b.id,
        playerId: b.playerId.toString(),
        level: b.level,
        note: b.note,
        isPro: b.isPro,
        isPublic: b.isPublic,
        createdAt: b.createdAt.toISOString(),
        player: {
          id: b.player.id.toString(),
          baseId: b.player.baseId.toString(),
          name: b.player.name,
          cardType: b.player.cardType,
          ovr: b.player.ovr,
        },
      })) as UserBuildDTO[],
      total, page: input.page, limit: input.limit,
    };
  }),

  // User's reviews.
  userReviews: publicProcedure.input(userReviewsInput).query(async ({ input }) => {
    const u = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (!u) return { items: [] as UserReviewDTO[], total: 0, page: input.page, limit: input.limit };
    const skip = (input.page - 1) * input.limit;
    const [total, rows] = await prisma.$transaction([
      prisma.review.count({ where: { authorId: u.id } }),
      prisma.review.findMany({
        where: { authorId: u.id },
        orderBy: { createdAt: "desc" },
        skip, take: input.limit,
        select: {
          id: true, playerId: true, rating: true, content: true, createdAt: true,
          player: { select: { id: true, baseId: true, name: true, cardType: true, ovr: true } },
        },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        playerId: r.playerId.toString(),
        rating: r.rating,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        player: {
          id: r.player.id.toString(),
          baseId: r.player.baseId.toString(),
          name: r.player.name,
          cardType: r.player.cardType,
          ovr: r.player.ovr,
        },
      })) as UserReviewDTO[],
      total, page: input.page, limit: input.limit,
    };
  }),

  // User's tier votes.
  userTierVotes: publicProcedure.input(userTierVotesInput).query(async ({ input }) => {
    const u = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (!u) return { items: [] as UserTierVoteDTO[], total: 0, page: input.page, limit: input.limit };
    const skip = (input.page - 1) * input.limit;
    const [total, rows] = await prisma.$transaction([
      prisma.tierVote.count({ where: { userId: u.id } }),
      prisma.tierVote.findMany({
        where: { userId: u.id },
        orderBy: { player: { ovr: "desc" } as const },
        skip, take: input.limit,
        select: {
          playerId: true, tier: true,
          player: { select: { id: true, baseId: true, name: true, cardType: true, ovr: true } },
        },
      }),
    ]);
    return {
      items: rows.map((t) => ({
        playerId: t.playerId.toString(),
        tier: t.tier,
        player: {
          id: t.player.id.toString(),
          baseId: t.player.baseId.toString(),
          name: t.player.name,
          cardType: t.player.cardType,
          ovr: t.player.ovr,
        },
      })) as UserTierVoteDTO[],
      total, page: input.page, limit: input.limit,
    };
  }),
});
