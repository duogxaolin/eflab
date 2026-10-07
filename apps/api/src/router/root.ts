import { router } from "./trpc.js";
import { playerRouter } from "./routers/player.js";
import { managerRouter } from "./routers/manager.js";
import { skillRouter } from "./routers/skill.js";
import { packRouter } from "./routers/pack.js";
import { communityRouter } from "./routers/community.js";
import { authRouter } from "./routers/auth.js";
import { userRouter } from "./routers/user.js";
import { tierListRouter } from "./routers/tierList.js";
import { feedRouter } from "./routers/feed.js";
import { pagesRouter } from "./routers/pages.js";

export const appRouter = router({
  player: playerRouter,
  manager: managerRouter,
  skill: skillRouter,
  pack: packRouter,
  community: communityRouter,
  auth: authRouter,
  user: userRouter,
  tierList: tierListRouter,
  feed: feedRouter,
  pages: pagesRouter,
});

export type AppRouter = typeof appRouter;
