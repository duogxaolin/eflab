import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { superjson } from "@eflab/shared";
import { appRouter } from "./router/root.js";
import { createContext } from "./router/context.js";
import { googleOAuthRoutes } from "./auth/google.js";
import { healthRoutes } from "./health.js";
import { API_HOST, API_PORT, isDev, webOrigins } from "./env.js";

// Largest number of procedures one batched tRPC request may carry. The web
// client's httpBatchLink must use the same (or a lower) `maxItems`.
export const TRPC_MAX_BATCH_SIZE = 10;

export async function buildServer() {
  const server = Fastify({
    logger: { level: "info" },
    // tRPC batched GETs put the comma-joined procedure names in the path param
    // (`/trpc/player.list,player.trending`); 10 procedures never need more than
    // a few hundred characters. `routerOptions` is the non-deprecated home of
    // this setting in Fastify 5.
    routerOptions: { maxParamLength: 2_000 },
  });

  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, { origin: [...webOrigins], credentials: true });

  // Non-tRPC routes (health, OAuth): never echo an internal error message or a
  // stack outside development; expected 4xx errors keep their message.
  server.setErrorHandler((err: unknown, req, reply) => {
    const e = err instanceof Error ? err : new Error(String(err));
    const raw = (e as { statusCode?: number }).statusCode;
    const statusCode = typeof raw === "number" && raw >= 400 ? raw : 500;
    if (statusCode >= 500) {
      req.log.error({ err: e, url: req.url }, "unhandled route error");
      void reply.code(statusCode).send({
        statusCode,
        error: "Internal Server Error",
        message: isDev ? e.message : "Internal server error",
      });
      return;
    }
    void reply.code(statusCode).send({ statusCode, error: e.name, message: e.message });
  });

  await server.register(healthRoutes);
  await server.register(googleOAuthRoutes);

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      transformer: superjson,
      maxBatchSize: TRPC_MAX_BATCH_SIZE,
      onError({ path, error }: { path?: string | undefined; error: Error }) {
        server.log.error({ path, error: error.message }, "tRPC error");
      },
    },
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = await buildServer();
  try {
    await server.listen({ port: API_PORT, host: API_HOST });
    server.log.info({ port: API_PORT, env: process.env.NODE_ENV ?? "(unset)" }, "eflab api listening");
  } catch (err) {
    server.log.error(err, "failed to start api");
    process.exit(1);
  }
}

// Run when invoked directly. Node resolves the main module to its real path
// (symlinks followed), so `import.meta.url` is the realpath URL while
// `process.argv[1]` is whatever path the launcher typed; compare file URLs of
// the resolved path (not a hand-built `file://` + argv string) so a symlinked
// entry file or a repository path with spaces / percent-encoded characters
// still starts the server, while a plain `import` of this module never does.
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  let resolved = entry;
  try {
    resolved = realpathSync(entry);
  } catch {
    // Path not on disk (virtual loader entry): fall back to the literal path.
  }
  return import.meta.url === pathToFileURL(resolved).href;
}
if (isMainModule()) {
  void startServer();
}
