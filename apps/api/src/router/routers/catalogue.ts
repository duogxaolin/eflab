// catalogueRouter — facts about the catalogue as a whole (change
// efootbase-data-refresh-1024, design D4; catalogue-data-refresh "Stored Dump
// Date"). `meta` returns when the seeded efootbase dump was taken
// (CatalogueMeta.playersDumpedAt, the single row the seed writes): the date of
// the stored community ratings, which the /players Community Rating control
// shows as "Ratings as of <date>". Null until a seed stored it.
//
// Since change auto-image-version (design D5) `meta` also returns the stored
// card-image cache version (CatalogueMeta.imageVersion, raised by the sync
// worker after a run replaced card images on R2): the value when it matches
// the stored format, else null — never a throw, so the web root layout's read
// of it can fail only by being unreachable. The route stays public.
import { prisma } from "@eflab/db";
import { isImageVersion, type CatalogueMetaDTO } from "@eflab/shared";
import { publicProcedure, router } from "../trpc.js";

export const catalogueRouter = router({
  meta: publicProcedure.query(async (): Promise<CatalogueMetaDTO> => {
    const row = await prisma.catalogueMeta.findUnique({ where: { id: 1 }, select: { playersDumpedAt: true, imageVersion: true } });
    return {
      playersDumpedAt: row?.playersDumpedAt ? row.playersDumpedAt.toISOString() : null,
      imageVersion: isImageVersion(row?.imageVersion) ? row.imageVersion : null,
    };
  }),
});
