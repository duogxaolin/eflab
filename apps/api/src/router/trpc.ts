import { initTRPC, TRPCError } from "@trpc/server";
import { superjson } from "@eflab/shared";
import { isDev } from "../env.js";
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
