// skillRouter — skill catalogue (84 public slugs; the 5 unreleased skills are
// stored but never returned) with real holder counts and each skill's leader
// card, byId (stored or public slug), and the top cards of one skill. Group,
// icon, effects and activation come from the static efootbase snapshot the
// seed loads (openspec efootbase-static-data); the public slug, the leader and
// the top-card rule are change efootbase-function-parity (design decision D12).
import { prisma, Prisma } from "@eflab/db";
import {
  BASE_STATS,
  SKILL_TOP_CARDS,
  skillByIdInput,
  skillKeyFromPublicSlug,
  skillListInput,
  skillPlayersInput,
  skillPublicSlug,
} from "@eflab/shared";
import type { BaseStat, CardPreview, CardType, SkillDTO, SkillEffect, SkillGroup, SkillPlayersResult } from "@eflab/shared";
import { r2ObjectUrl } from "../../env.js";
import { publicProcedure, router } from "../trpc.js";
import { ttlCache } from "../ttl-cache.js";

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

const previewSelect = {
  id: true, baseId: true, name: true, cardType: true, ovr: true, maxOvr: true,
  registeredPosition: true, condition: true, playingStyleAttack: true, playingStyleDefense: true,
} as const;

type PreviewRow = {
  id: bigint; baseId: bigint; name: string; cardType: string; ovr: number; maxOvr: number;
  registeredPosition: number; condition: string; playingStyleAttack: number; playingStyleDefense: number;
};

function toPreview(p: PreviewRow): CardPreview {
  return {
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
  };
}

// Leader of every skill: the holder with the highest max overall, ties by the
// higher card id. One aggregate over PlayerSkill ⋈ Player — the
// lexicographic max of [maxOvr, id], so no sort of the 195,607 holder rows
// (the Player side is an index-only scan of (maxOvr, id)); read-only EXPLAIN
// ANALYZE ≈ 58 ms against 162 ms for the equivalent DISTINCT ON, whose sort
// spilled to disk at the default 4 MB work_mem. Kept 60 s in memory (the
// holders change only when the catalogue is re-seeded or synced).
const LEADER_TTL_MS = 60_000;
const skillLeaders = ttlCache(LEADER_TTL_MS, async (): Promise<Map<number, CardPreview>> => {
  const rows = await prisma.$queryRaw<Array<{ skillId: number; leaderId: bigint }>>(Prisma.sql`
    SELECT ps."skillId", (max(ARRAY[p."maxOvr"::bigint, p.id]))[2] AS "leaderId"
    FROM "PlayerSkill" ps
    JOIN "Player" p ON p.id = ps."playerId"
    GROUP BY ps."skillId"
  `);
  const cards = rows.length > 0
    ? await prisma.player.findMany({ where: { id: { in: rows.map((r) => r.leaderId) } }, select: previewSelect })
    : [];
  const byId = new Map(cards.map((c) => [c.id.toString(), toPreview(c)]));
  const leaders = new Map<number, CardPreview>();
  for (const r of rows) {
    const card = byId.get(r.leaderId.toString());
    if (card) leaders.set(r.skillId, card);
  }
  return leaders;
});

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
  efbKey: string | null; iconKey: string | null; effects: unknown; activation: string | null;
};

function toSkillDTO(s: SkillRow, playerCount: number, leader: CardPreview | null): SkillDTO {
  return {
    id: s.id,
    slug: s.slug,
    publicSlug: skillPublicSlug(s),
    key: s.efbKey,
    leader,
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

/** A skill by its public slug (the stored key without `s_`, `-` for `_`) or
 *  its stored slug, in that order (no public slug is another skill's stored
 *  slug in the data; the public one is the page URL, so it wins a clash).
 *  Unreleased skills are returned too — callers hide them. */
async function findSkill(slug: string): Promise<SkillRow | null> {
  const key = skillKeyFromPublicSlug(slug);
  if (key) {
    const byKey = await prisma.skill.findUnique({ where: { efbKey: key } });
    if (byKey) return byKey;
  }
  return prisma.skill.findUnique({ where: { slug } });
}

export const skillRouter = router({
  // Public skills only (released), in efootbase's wiki order; the entries without
  // an efootbase order (no group) follow by name. Each with its holder count,
  // its leader card and its public slug / key.
  list: publicProcedure.input(skillListInput).query(async ({ input }): Promise<SkillDTO[]> => {
    const rows = await prisma.skill.findMany({
      where: { released: true, ...(input.category ? { category: input.category } : {}) },
      orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    });
    const [counts, leaders] = await Promise.all([holderCounts(rows.map((r) => r.id)), skillLeaders()]);
    return rows.map((s) => toSkillDTO(s, counts.get(s.id) ?? 0, leaders.get(s.id) ?? null));
  }),
  // By stored or public slug. An unreleased skill is hidden like a missing one
  // (the page 404s).
  byId: publicProcedure.input(skillByIdInput).query(async ({ input }): Promise<SkillDTO | null> => {
    const s = await findSkill(input.slug);
    if (!s || !s.released) return null;
    const [counts, leaders] = await Promise.all([holderCounts([s.id]), skillLeaders()]);
    return toSkillDTO(s, counts.get(s.id) ?? 0, leaders.get(s.id) ?? null);
  }),
  // Top cards of one skill (the reference's rule, survey 2026-10-23 S3 §6):
  // the best card of each base player that carries it (max overall DESC, then
  // card id DESC, one card per base player), the first of them being the
  // leader, then up to SKILL_TOP_CARDS (12) others — no paging (the old
  // `page` / `limit` are accepted and ignored). Bounded by the holders of one
  // skill (≤ 9,125 rows today).
  players: publicProcedure.input(skillPlayersInput).query(async ({ input }): Promise<SkillPlayersResult> => {
    const skill = await findSkill(input.slug);
    if (!skill || !skill.released) return { leader: null, rows: [] };
    const rows = await prisma.$queryRaw<PreviewRow[]>(Prisma.sql`
      SELECT id, "baseId", name, "cardType", ovr, "maxOvr", "registeredPosition", condition,
             "playingStyleAttack", "playingStyleDefense"
      FROM (
        SELECT DISTINCT ON (p."baseId")
               p.id, p."baseId", p.name, p."cardType"::text AS "cardType", p.ovr, p."maxOvr",
               p."registeredPosition", p.condition, p."playingStyleAttack", p."playingStyleDefense"
        FROM "PlayerSkill" ps
        JOIN "Player" p ON p.id = ps."playerId"
        WHERE ps."skillId" = ${skill.id}
        ORDER BY p."baseId", p."maxOvr" DESC, p.id DESC
      ) best
      ORDER BY "maxOvr" DESC, id DESC
      LIMIT ${SKILL_TOP_CARDS + 1}
    `);
    const [leader, ...rest] = rows.map(toPreview);
    return { leader: leader ?? null, rows: rest };
  }),
});
