import { router } from "./trpc.js";
import { playerRouter } from "./routers/player.js";
import { skillRouter } from "./routers/skill.js";
import { authRouter } from "./routers/auth.js";
import { featuredRouter } from "./routers/featured.js";
import { managerRouter } from "./routers/manager.js";

// The public tRPC surface. Only the routers the web app, the auth plumbing and
// the smoke test use are mounted; the community / feed / tierList / user /
// pages / pack routers and the old manager router were deleted in change
// remove-dead-surface (no caller — the Pack table stays as a data asset). The
// new `manager` router (efootbase-exact-model-managers) serves only the picker
// of the Progression panel (`manager.picker`).
export const appRouter = router({
  player: playerRouter,
  skill: skillRouter,
  auth: authRouter,
  featured: featuredRouter,
  manager: managerRouter,
});

export type AppRouter = typeof appRouter;
