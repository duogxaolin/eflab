import { router } from "./trpc.js";
import { playerRouter } from "./routers/player.js";
import { skillRouter } from "./routers/skill.js";
import { authRouter } from "./routers/auth.js";
import { featuredRouter } from "./routers/featured.js";

// The public tRPC surface. Only the routers the web app, the auth plumbing and
// the smoke test use are mounted; the community / feed / tierList / user /
// pages / pack / manager routers were deleted in change remove-dead-surface
// (no caller — the Pack and Manager tables stay as data assets).
export const appRouter = router({
  player: playerRouter,
  skill: skillRouter,
  auth: authRouter,
  featured: featuredRouter,
});

export type AppRouter = typeof appRouter;
