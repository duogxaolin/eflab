// feedRouter — community feed: create, list, like/unlike, comment, comments.
import { prisma } from "@eflab/db";
import {
  feedCreateInput,
  feedListInput,
  postByIdInput,
  commentInput,
  commentsListInput,
} from "@eflab/shared";
import type { FeedPostDTO, FeedCommentDTO } from "@eflab/shared";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

function toPostDTO(p: {
  id: string;
  authorId: string;
  content: string;
  mediaUrls: string[];
  playerId: bigint | null;
  region: string | null;
  country: string | null;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  author: { username: string; avatarUrl: string | null; region: string | null; country: string | null };
  player: { id: bigint; baseId: bigint; name: string; cardType: string; ovr: number; registeredPosition: number } | null;
}, likedByMe: boolean): FeedPostDTO {
  return {
    id: p.id,
    authorId: p.authorId,
    authorName: p.author.username,
    authorAvatar: p.author.avatarUrl,
    content: p.content,
    mediaUrls: p.mediaUrls,
    playerId: p.playerId != null ? p.playerId.toString() : null,
    playerCard: p.player
      ? {
          id: p.player.id.toString(),
          baseId: p.player.baseId.toString(),
          name: p.player.name,
          cardType: p.player.cardType,
          ovr: p.player.ovr,
          registeredPosition: p.player.registeredPosition,
        }
      : null,
    region: p.region,
    country: p.country,
    likesCount: p.likesCount,
    commentsCount: p.commentsCount,
    likedByMe,
    createdAt: p.createdAt.toISOString(),
  };
}

async function likedSet(postIds: string[], userId: string | null): Promise<Set<string>> {
  if (!userId || postIds.length === 0) return new Set();
  const rows = await prisma.postLike.findMany({
    where: { userId, postId: { in: postIds } },
    select: { postId: true },
  });
  return new Set(rows.map((r) => r.postId));
}

export const feedRouter = router({
  // Create a feed post. Author's region/country is denormalized onto the Post
  // row at write time so the region/country filter can be a simple indexed WHERE.
  create: protectedProcedure.input(feedCreateInput).mutation(async ({ input, ctx }) => {
    const user = await prisma.user.findUnique({
      where: { id: ctx.session.id },
      select: { region: true, country: true },
    });
    const post = await prisma.post.create({
      data: {
        authorId: ctx.session.id,
        content: input.content,
        mediaUrls: input.mediaUrls,
        playerId: input.playerId ?? null,
        region: user?.region ?? null,
        country: user?.country ?? null,
      },
      include: {
        author: { select: { username: true, avatarUrl: true, region: true, country: true } },
        player: { select: { id: true, baseId: true, name: true, cardType: true, ovr: true, registeredPosition: true } },
      },
    });
    return toPostDTO(post, false);
  }),

  // List feed posts — newest first, optional region/country filter, paginated.
  list: publicProcedure.input(feedListInput).query(async ({ input, ctx }) => {
    const skip = (input.page - 1) * input.limit;
    const where: Record<string, unknown> = {};
    if (input.region) where.region = input.region;
    if (input.country) where.country = input.country;

    const rows = await prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip, take: input.limit,
      include: {
        author: { select: { username: true, avatarUrl: true, region: true, country: true } },
        player: { select: { id: true, baseId: true, name: true, cardType: true, ovr: true, registeredPosition: true } },
      },
    });
    const liked = await likedSet(rows.map((r) => r.id), ctx.session?.id ?? null);
    return {
      items: rows.map((r) => toPostDTO(r, liked.has(r.id))),
      total: await prisma.post.count({ where }),
      page: input.page,
      limit: input.limit,
    };
  }),

  // Like a post (toggle on if already liked).
  like: protectedProcedure.input(postByIdInput).mutation(async ({ input, ctx }) => {
    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId: input.postId, userId: ctx.session.id } },
      select: { postId: true },
    });
    if (existing) return { liked: true, likesCount: await prisma.postLike.count({ where: { postId: input.postId } }) };
    await prisma.$transaction([
      prisma.postLike.create({ data: { postId: input.postId, userId: ctx.session.id } }),
      prisma.post.update({ where: { id: input.postId }, data: { likesCount: { increment: 1 } } }),
    ]);
    return { liked: true, likesCount: await prisma.postLike.count({ where: { postId: input.postId } }) };
  }),

  // Unlike a post (toggle off).
  unlike: protectedProcedure.input(postByIdInput).mutation(async ({ input, ctx }) => {
    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId: input.postId, userId: ctx.session.id } },
      select: { postId: true },
    });
    if (!existing) return { liked: false, likesCount: await prisma.postLike.count({ where: { postId: input.postId } }) };
    await prisma.$transaction([
      prisma.postLike.delete({ where: { postId_userId: { postId: input.postId, userId: ctx.session.id } } }),
      prisma.post.update({ where: { id: input.postId }, data: { likesCount: { decrement: 1 } } }),
    ]);
    return { liked: false, likesCount: await prisma.postLike.count({ where: { postId: input.postId } }) };
  }),

  // Add a comment to a post.
  comment: protectedProcedure.input(commentInput).mutation(async ({ input, ctx }) => {
    const comment = await prisma.comment.create({
      data: { postId: input.postId, authorId: ctx.session.id, content: input.content },
      include: { author: { select: { username: true, avatarUrl: true } } },
    });
    await prisma.post.update({
      where: { id: input.postId },
      data: { commentsCount: { increment: 1 } },
    });
    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      authorName: comment.author.username,
      authorAvatar: comment.author.avatarUrl,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    } satisfies FeedCommentDTO;
  }),

  // List comments for a post.
  comments: publicProcedure.input(commentsListInput).query(async ({ input }) => {
    const skip = (input.page - 1) * input.limit;
    const [total, rows] = await prisma.$transaction([
      prisma.comment.count({ where: { postId: input.postId } }),
      prisma.comment.findMany({
        where: { postId: input.postId },
        orderBy: { createdAt: "desc" },
        skip, take: input.limit,
        include: { author: { select: { username: true, avatarUrl: true } } },
      }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        postId: c.postId,
        authorId: c.authorId,
        authorName: c.author.username,
        authorAvatar: c.author.avatarUrl,
        content: c.content,
        createdAt: c.createdAt.toISOString(),
      })) satisfies FeedCommentDTO[],
      total, page: input.page, limit: input.limit,
    };
  }),
});
