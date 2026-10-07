// tierListRouter — create + browse community tier lists, vote on cards (which
// recomputes the cached communityTier consensus on Player).
import { prisma } from "@eflab/db";
import {
  tierListCreateInput,
  tierListByIdInput,
  tierListVoteCardInput,
} from "@eflab/shared";
import { z } from "zod";
import type { TierListItemDTO } from "@eflab/shared";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";

function tierListToDTO(t: {
  id: string;
  authorId: string;
  name: string;
  tiers: unknown;
  isPublic: boolean;
  submissions: number;
  createdAt: Date;
  author: { username: string };
}): TierListItemDTO {
  const tiers = (t.tiers as Record<string, unknown>) ?? {};
  const tierMap: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(tiers)) {
    tierMap[k] = Array.isArray(v) ? v.map((x) => String(x)) : [];
  }
  return {
    id: t.id,
    authorId: t.authorId,
    authorName: t.author.username,
    name: t.name,
    tiers: tierMap,
    isPublic: t.isPublic,
    submissions: t.submissions,
    createdAt: t.createdAt.toISOString(),
  };
}

export const tierListRouter = router({
  // Create a community tier list. `tiers` is a JSON map of S/A/B/C/D → BigInt IDs.
  create: protectedProcedure.input(tierListCreateInput).mutation(async ({ input, ctx }) => {
    const tierMap: Record<string, bigint[]> = {};
    for (const [tier, ids] of Object.entries(input.tiers)) {
      tierMap[tier] = (ids as bigint[]).map((x) => BigInt(x));
    }
    const t = await prisma.tierList.create({
      data: {
        authorId: ctx.session.id,
        name: input.name,
        tiers: tierMap as unknown as object,
        isPublic: input.isPublic,
      },
      include: { author: { select: { username: true } } },
    });
    return tierListToDTO(t);
  }),

  // Browse community lists — newest first.
  list: publicProcedure.input(z.object({}).optional()).query(async () => {
    const rows = await prisma.tierList.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { author: { select: { username: true } } },
    });
    return rows.map(tierListToDTO);
  }),

  // Single tier list by id.
  byId: publicProcedure.input(tierListByIdInput).query(async ({ input }) => {
    const t = await prisma.tierList.findUnique({
      where: { id: input.id },
      include: { author: { select: { username: true } } },
    });
    if (!t) return null;
    return tierListToDTO(t);
  }),

  // Vote on a single card tier; recomputes the cached Player.communityTier consensus.
  voteCard: protectedProcedure.input(tierListVoteCardInput).mutation(async ({ input, ctx }) => {
    await prisma.tierVote.upsert({
      where: { userId_playerId: { userId: ctx.session.id, playerId: input.playerId } },
      create: { userId: ctx.session.id, playerId: input.playerId, tier: input.tier },
      update: { tier: input.tier },
    });
    const agg = await prisma.tierVote.groupBy({
      by: ["tier"],
      where: { playerId: input.playerId },
      _count: { _all: true },
      orderBy: { _count: { tier: "desc" } },
    });
    const consensus = agg[0]?.tier ?? input.tier;
    await prisma.player.update({ where: { id: input.playerId }, data: { communityTier: consensus } });
    return { tier: input.tier, consensus };
  }),
});
