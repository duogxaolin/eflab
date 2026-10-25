import { router } from "./trpc.js";
import { playerRouter } from "./routers/player.js";
import { skillRouter } from "./routers/skill.js";
import { authRouter } from "./routers/auth.js";
import { featuredRouter } from "./routers/featured.js";
import { managerRouter } from "./routers/manager.js";
import { boosterRouter } from "./routers/booster.js";
import { adminRouter } from "./routers/admin.js";
import { catalogueRouter } from "./routers/catalogue.js";

// The public tRPC surface. Only the routers the web app, the auth plumbing and
// the smoke test use are mounted; the community / feed / tierList / user /
// pages / pack routers and the old manager router were deleted in change
// remove-dead-surface (no caller — the Pack table stays as a data asset). The
// new `manager` router (efootbase-exact-model-managers) serves only the picker
// of the Progression panel (`manager.picker`). `admin` (openspec
// admin-sync-worker) is the private admin area: its own accounts, cookie and
// guard (adminProcedure), separate from the visitor `auth` router. `booster`
// (efootbase-function-parity) serves the 29 second-booster choices of the
// player page (`booster.secondChoices`, from the committed fixture).
// `catalogue` (efootbase-data-refresh-1024) serves the date of the seeded dump
// (`catalogue.meta`, the "Ratings as of" date of /players).
export const appRouter = router({
  player: playerRouter,
  skill: skillRouter,
  auth: authRouter,
  featured: featuredRouter,
  manager: managerRouter,
  booster: boosterRouter,
  admin: adminRouter,
  catalogue: catalogueRouter,
});

export type AppRouter = typeof appRouter;
