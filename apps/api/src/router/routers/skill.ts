// skillRouter — list all 67 skills (with optional category filter) + byId + matching players.
import { prisma } from "@eflab/db";
import { skillListInput, skillByIdInput, skillPlayersInput } from "@eflab/shared";
import type { SkillDTO } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

export const skillRouter = router({
  list: publicProcedure.input(skillListInput).query(async ({ input }): Promise<SkillDTO[]> => {
    const rows = await prisma.skill.findMany(
      input.category ? { where: { category: input.category } } : undefined,
    );
    return rows.map(s => ({
      id: s.id, slug: s.slug, name: s.name, description: s.description, category: s.category,
    }));
  }),
  byId: publicProcedure.input(skillByIdInput).query(async ({ input }) => {
    const s = await prisma.skill.findUnique({ where: { slug: input.slug } });
    if (!s) return null;
    return { id: s.id, slug: s.slug, name: s.name, description: s.description, category: s.category } satisfies SkillDTO;
  }),
  // List of players with this skill — paginated.
  players: publicProcedure.input(skillPlayersInput).query(async ({ input }) => {
    const skill = await prisma.skill.findUnique({ where: { slug: input.slug } });
    if (!skill) return { items: [], total: 0, page: input.page, limit: input.limit, totalPages: 0 };
    const skip = (input.page - 1) * input.limit;
    const [total, playerSkills] = await prisma.$transaction([
      prisma.playerSkill.count({ where: { skillId: skill.id } }),
      prisma.playerSkill.findMany({
        where: { skillId: skill.id },
        orderBy: { player: { ovr: "desc" } as const },
        skip, take: input.limit,
        include: { player: { select: { id: true, baseId: true, name: true, cardType: true, ovr: true, maxOvr: true, registeredPosition: true, condition: true } } },
      }),
    ]);
    return {
      items: playerSkills.map(ps => ({
        id: ps.player.id.toString(),
        baseId: ps.player.baseId.toString(),
        name: ps.player.name,
        cardType: ps.player.cardType,
        ovr: ps.player.ovr,
        maxOvr: ps.player.maxOvr,
        registeredPosition: ps.player.registeredPosition,
        condition: ps.player.condition,
      })),
      total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) || 1,
    };
  }),
});
