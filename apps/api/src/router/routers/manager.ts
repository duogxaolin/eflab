// managerRouter — list (filter by 6 tactic masteries) + byId + squad compatibility scoring.
import { prisma } from "@eflab/db";
import type { ManagerDTO, ManagerId } from "@eflab/shared";
import { managerListInput, managerByIdInput, managerCompatInput } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";
import { MANAGER_TACTICS, type ManagerTactic } from "@eflab/shared";

function toManagerDTO(m: ManagerRowForDto): ManagerDTO {
  return {
    id: m.id.toString(),
    name: m.name,
    accentedName: m.accentedName ?? null,
    japName: m.japName ?? null,
    chineseName: m.chineseName ?? null,
    age: m.age,
    adaptability: m.adaptability,
    affinity: m.affinity,
    tactics: {
      possessionGame: m.possessionGame,
      quickCounter: m.quickCounter,
      longBallCounter: m.longBallCounter,
      outWide: m.outWide,
      longBall: m.longBall,
      overload: m.overload,
    },
    boosts: [m.boostId1, m.boostId2].filter((b): b is number => b != null),
  };
}

export const managerRouter = router({
  list: publicProcedure.input(managerListInput).query(async ({ input }) => {
    const page = input.page;
    const limit = input.limit;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (input.q) {
      where.OR = [
        { name: { contains: input.q, mode: "insensitive" as const } },
        { accentedName: { contains: input.q, mode: "insensitive" as const } },
      ];
    }
    if (input.tacticMin) {
      for (const tactic of MANAGER_TACTICS) {
        const min = (input.tacticMin as Record<string, number | undefined>)[tactic];
        if (min !== undefined) where[tactic] = { gte: min };
      }
    }
    // sort by one of the six tactics or name/age.
    const orderBy: Record<string, "asc" | "desc"> = { [input.sort]: input.order } as Record<string, "asc" | "desc">;
    const [total, rows] = await prisma.$transaction([
      prisma.manager.count({ where }),
      prisma.manager.findMany({ where, orderBy, skip, take: limit }),
    ]);
    return {
      items: (rows as ManagerRowForDto[]).map(toManagerDTO),
      total, page, limit, totalPages: Math.ceil(total / limit) || 1,
    };
  }),

  byId: publicProcedure.input(managerByIdInput).query(async ({ input }) => {
    const m = await prisma.manager.findUnique({ where: { id: input.id } });
    return m ? toManagerDTO(m as ManagerRowForDto) : null;
  }),

  // Squad compatibility — average of player tactics weighted by manager tactic ratings.
  compat: publicProcedure.input(managerCompatInput).query(async ({ input }) => {
    const [m, p] = await prisma.$transaction([
      prisma.manager.findUnique({ where: { id: input.managerId } }),
      prisma.player.findUnique({ where: { id: input.playerId } }),
    ]);
    if (!m || !p) return null;
    let totalWeight = 0;
    let compatibility = 0;
    for (const tactic of MANAGER_TACTICS) {
      const mRating = (m as unknown as Record<string, number>)[tactic as string] ?? 0;
      const pRating = (p as unknown as Record<string, number>)[tactic as string] ?? 0;
      if (mRating === 0) continue;
      totalWeight += mRating;
      compatibility += (pRating / 99) * mRating;
    }
    return {
      managerId: (input.managerId as ManagerId).toString(),
      playerId: (input.playerId as ManagerId).toString(),
      compatibility: totalWeight > 0 ? Math.round((compatibility / totalWeight) * 100) : 0,
      breakdown: Object.fromEntries(MANAGER_TACTICS.map((t: ManagerTactic) => [
        t, {
          managerRating: (m as unknown as Record<string, number>)[t] ?? 0,
          playerRating: (p as unknown as Record<string, number>)[t] ?? 0,
        },
      ])),
    };
  }),
});

interface ManagerRowForDto {
  id: bigint;
  name: string;
  accentedName: string | null;
  japName: string | null;
  chineseName: string | null;
  age: number;
  country: number;
  adaptability: number;
  affinity: number;
  possessionGame: number;
  quickCounter: number;
  longBallCounter: number;
  outWide: number;
  longBall: number;
  overload: number;
  boostId1: number | null;
  boostId2: number | null;
}
