// skillRouter — skill catalogue (84 slugs) with real holder counts, byId, and
// the paginated holders of one skill.
import { prisma } from "@eflab/db";
import { skillListInput, skillByIdInput, skillPlayersInput } from "@eflab/shared";
import type { CardType, SkillDTO, SkillPlayersResult } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

// Holder count per skill id — one grouped count over PlayerSkill (indexed on
// skillId). Skills no card carries are simply absent → 0.
async function holderCounts(skillIds?: number[]): Promise<Map<number, number>> {
  const grouped = await prisma.playerSkill.groupBy({
    by: ["skillId"],
    _count: { _all: true },
    ...(skillIds ? { where: { skillId: { in: skillIds } } } : {}),
  });
  return new Map(grouped.map((g) => [g.skillId, g._count._all]));
}

function toSkillDTO(s: { id: number; slug: string; name: string; description: string; category: string }, playerCount: number): SkillDTO {
  return { id: s.id, slug: s.slug, name: s.name, description: s.description, category: s.category, playerCount };
}

export const skillRouter = router({
  list: publicProcedure.input(skillListInput).query(async ({ input }): Promise<SkillDTO[]> => {
    const rows = await prisma.skill.findMany({
      ...(input.category ? { where: { category: input.category } } : {}),
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    const counts = await holderCounts(rows.map((r) => r.id));
    return rows.map((s) => toSkillDTO(s, counts.get(s.id) ?? 0));
  }),
  byId: publicProcedure.input(skillByIdInput).query(async ({ input }): Promise<SkillDTO | null> => {
    const s = await prisma.skill.findUnique({ where: { slug: input.slug } });
    if (!s) return null;
    const counts = await holderCounts([s.id]);
    return toSkillDTO(s, counts.get(s.id) ?? 0);
  }),
  // Cards that have this skill — paginated, deterministic (ovr DESC, id DESC so
  // ties never shuffle between pages). A small `limit` is the "top cards" call;
  // `total` is always the full holder count.
  players: publicProcedure.input(skillPlayersInput).query(async ({ input }): Promise<SkillPlayersResult> => {
    const skill = await prisma.skill.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (!skill) return { items: [], total: 0, page: input.page, limit: input.limit, totalPages: 0 };
    const skip = (input.page - 1) * input.limit;
    const where = { skills: { some: { skillId: skill.id } } };
    const [total, players] = await prisma.$transaction([
      prisma.player.count({ where }),
      prisma.player.findMany({
        where,
        orderBy: [{ ovr: "desc" }, { id: "desc" }],
        skip,
        take: input.limit,
        select: {
          id: true, baseId: true, name: true, cardType: true, ovr: true, maxOvr: true,
          registeredPosition: true, condition: true, playingStyleAttack: true, playingStyleDefense: true,
        },
      }),
    ]);
    return {
      items: players.map((p) => ({
        id: p.id.toString(),
        baseId: p.baseId.toString(),
        name: p.name,
        cardType: p.cardType as CardType,
        ovr: p.ovr,
        maxOvr: p.maxOvr,
        registeredPosition: p.registeredPosition,
        condition: p.condition,
        playingStyleAttack: p.playingStyleAttack,
        playingStyleDefense: p.playingStyleDefense,
      })),
      total,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(total / input.limit) || 1,
    };
  }),
});
