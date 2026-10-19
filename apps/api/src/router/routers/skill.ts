// skillRouter — skill catalogue (84 public slugs; the 5 unreleased skills are
// stored but never returned) with real holder counts, byId, and the paginated
// holders of one skill. Group, icon, effects and activation come from the static
// efootbase snapshot the seed loads (openspec efootbase-static-data).
import { prisma } from "@eflab/db";
import { BASE_STATS, skillListInput, skillByIdInput, skillPlayersInput } from "@eflab/shared";
import type { BaseStat, CardType, SkillDTO, SkillEffect, SkillGroup, SkillPlayersResult } from "@eflab/shared";
import { r2ObjectUrl } from "../../env.js";
import { publicProcedure, router } from "../trpc.js";

const BASE_STAT_SET: ReadonlySet<string> = new Set(BASE_STATS);

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

/** Skill.effects (jsonb, written by the seed with eFootLab stat names) → DTO.
 *  Anything that is not a { stat: BaseStat, value: int } entry is dropped. */
function parseEffects(raw: unknown): SkillEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillEffect[] = [];
  for (const e of raw) {
    if (e === null || typeof e !== "object") continue;
    const { stat, value } = e as { stat?: unknown; value?: unknown };
    if (typeof stat === "string" && BASE_STAT_SET.has(stat) && typeof value === "number" && Number.isInteger(value)) {
      out.push({ stat: stat as BaseStat, value });
    }
  }
  return out;
}

type SkillRow = {
  id: number; slug: string; name: string; description: string; category: string;
  group: "SHOWTIME" | "CLASSIC" | null; sortOrder: number | null; released: boolean;
  iconKey: string | null; effects: unknown; activation: string | null;
};

function toSkillDTO(s: SkillRow, playerCount: number): SkillDTO {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    category: s.category,
    group: s.group ? (s.group.toLowerCase() as SkillGroup) : null,
    sortOrder: s.sortOrder,
    iconUrl: r2ObjectUrl(s.iconKey),
    effects: parseEffects(s.effects),
    activation: s.activation,
    released: s.released,
    playerCount,
  };
}

export const skillRouter = router({
  // Public skills only (released), in efootbase's wiki order; the entries without
  // an efootbase order (the "Other" group) follow by name.
  list: publicProcedure.input(skillListInput).query(async ({ input }): Promise<SkillDTO[]> => {
    const rows = await prisma.skill.findMany({
      where: { released: true, ...(input.category ? { category: input.category } : {}) },
      orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    });
    const counts = await holderCounts(rows.map((r) => r.id));
    return rows.map((s) => toSkillDTO(s, counts.get(s.id) ?? 0));
  }),
  // An unreleased skill is hidden like a missing one (the page 404s).
  byId: publicProcedure.input(skillByIdInput).query(async ({ input }): Promise<SkillDTO | null> => {
    const s = await prisma.skill.findUnique({ where: { slug: input.slug } });
    if (!s || !s.released) return null;
    const counts = await holderCounts([s.id]);
    return toSkillDTO(s, counts.get(s.id) ?? 0);
  }),
  // Cards that have this skill — paginated, deterministic (ovr DESC, id DESC so
  // ties never shuffle between pages). A small `limit` is the "top cards" call;
  // `total` is always the full holder count.
  players: publicProcedure.input(skillPlayersInput).query(async ({ input }): Promise<SkillPlayersResult> => {
    const skill = await prisma.skill.findUnique({ where: { slug: input.slug }, select: { id: true, released: true } });
    if (!skill || !skill.released) return { items: [], total: 0, page: input.page, limit: input.limit, totalPages: 0 };
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
