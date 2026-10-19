import { initTRPC, TRPCError } from "@trpc/server";
import { superjson } from "@eflab/shared";
import { isDev } from "../env.js";
import { adminCsrfOk } from "../auth/admin.js";
import type { CreateAppContext } from "./context.js";

const t = initTRPC.context<CreateAppContext>().create({
  transformer: superjson,
  // Explicit: tRPC only attaches `data.stack` to error shapes when isDev is true.
  // NODE_ENV comes from the package scripts (dev = development, start = production).
  isDev,
  errorFormatter({ shape, error }) {
    const zod =
      error.cause instanceof Error &&
      "errors" in error.cause &&
      typeof (error.cause as { errors?: unknown }).errors !== "undefined"
        ? (error.cause as { errors: unknown }).errors
        : null;
    // Expected failures (BAD_REQUEST, NOT_FOUND, UNAUTHORIZED, CONFLICT, …) keep
    // their typed message. Unexpected ones (INTERNAL_SERVER_ERROR) carry the raw
    // Prisma / Postgres text and the stack; outside development only a generic
    // message leaves the process.
    const unexpected = error.code === "INTERNAL_SERVER_ERROR";
    const { stack, ...data } = shape.data;
    return {
      ...shape,
      message: unexpected && !isDev ? "Internal server error" : shape.message,
      data: {
        ...data,
        ...(isDev && stack ? { stack } : {}),
        zod,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// protectedProcedure — rejects unauthenticated callers with 401 UNAUTHORIZED and
// injects the authenticated `User` (as `ctx.session`) into the handler.
// `ctx.session` is already populated by `createContext`, so the middleware only
// checks for presence and throws if null. Re-checking here keeps the contract
// local to the procedure definition (callers cannot accidentally forget the
// middleware when refactoring a procedure from public → protected).
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// ---- Admin procedures (openspec admin-sync-worker, capability admin-access) ----
// Independent of the visitor session: the admin session comes from the
// `eflab_admin` cookie (ctx.getAdmin), never from `ctx.session`. Every admin
// response is `Cache-Control: no-store` (also set by the onSend hook in
// server.ts, which covers batched calls and errors raised before a procedure).

const adminNoStore = t.middleware(({ ctx, next }) => {
  ctx.res.header("Cache-Control", "no-store");
  return next();
});

// CSRF: a state-changing admin request needs `x-eflab-admin: 1` and an allowed Origin.
const adminCsrf = t.middleware(({ ctx, type, next }) => {
  if (type === "mutation" && !adminCsrfOk(ctx.req)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin request refused: the x-eflab-admin header or an allowed Origin is missing" });
  }
  return next();
});

/** Admin procedures that run without a session — only `admin.signIn`. */
export const adminPublicProcedure = t.procedure.use(adminNoStore).use(adminCsrf);

/** Every other admin procedure: 401 without a valid admin session, then the CSRF guard. */
export const adminProcedure = t.procedure
  .use(adminNoStore)
  .use(async ({ ctx, next }) => {
    const admin = await ctx.getAdmin();
    if (!admin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin sign-in required" });
    return next({ ctx: { ...ctx, admin } });
  })
  .use(adminCsrf);
