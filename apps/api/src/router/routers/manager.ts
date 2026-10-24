// managerRouter — the managers efootbase offers in its picker (change
// efootbase-exact-model-managers). The rows of the static efootbase snapshot
// carry `Manager.inPicker` (docs/efootbase-static-snapshot.md; 70 since the
// 2026-10-24 snapshot, 69 before); their two stat pills are stored as eFootLab
// stat names in booster1Stat / booster2Stat (24 of the 70 have only
// booster1Stat — efootbase lists them with one pill).
// The web's Progression panel uses the rating (it becomes the Manager
// Proficiency level) and the pills (+1 each after the boosters).
// Order: rating DESC, then the reference's own order inside a rating — the
// stored position in the static snapshot, read from its drawer
// (`Manager.pickerOrder`, change efootbase-data-refresh-1024,
// catalogue-data-refresh "Manager Picker Order") — then id ASC for a picker
// row without one (none after a seed with the snapshot).
import { TRPCError } from "@trpc/server";
import { prisma } from "@eflab/db";
import { BASE_STATS, type BaseStat, type PickerManagerDTO } from "@eflab/shared";
import { rebaseR2Url } from "../../env.js";
import { publicProcedure, router } from "../trpc.js";

const isBaseStat = (s: string): s is BaseStat => (BASE_STATS as readonly string[]).includes(s);

/** The one or two pill stats of a picker row. A missing first pill, or a name
 *  that is not a BaseStat, is a data error: it is reported, never guessed. */
function pillsOf(row: { id: bigint; booster1Stat: string | null; booster2Stat: string | null }): BaseStat[] {
  const names = [row.booster1Stat, row.booster2Stat];
  if (!names[0]) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `picker manager ${row.id} has no stat pill` });
  }
  const pills: BaseStat[] = [];
  for (const n of names) {
    if (n == null) continue;
    if (!isBaseStat(n)) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `picker manager ${row.id} has an unknown pill stat` });
    }
    pills.push(n);
  }
  return pills;
}

export const managerRouter = router({
  picker: publicProcedure.query(async (): Promise<PickerManagerDTO[]> => {
    const rows = await prisma.manager.findMany({
      where: { inPicker: true },
      orderBy: [{ rating: "desc" }, { pickerOrder: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      select: { id: true, name: true, rating: true, imageUrl: true, booster1Stat: true, booster2Stat: true },
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      name: r.name,
      rating: r.rating,
      imageUrl: rebaseR2Url(r.imageUrl),
      pills: pillsOf(r),
    }));
  }),
});
