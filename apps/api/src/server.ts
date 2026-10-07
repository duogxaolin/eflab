import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { superjson } from "@eflab/shared";
import { appRouter } from "./router/root.js";
import { createContext } from "./router/context.js";
import { googleOAuthRoutes } from "./auth/google.js";

const PORT = Number(process.env.API_PORT ?? 4000);
const HOST = process.env.API_HOST ?? "0.0.0.0";

export async function buildServer() {
  const server = Fastify({
    logger: { level: "info" },
    maxParamLength: 10_000,
  });

  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, { origin: ["http://localhost:3000", "http://127.0.0.1:3000"], credentials: true });

  await server.register(googleOAuthRoutes);

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      transformer: superjson,
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
    await server.listen({ port: PORT, host: HOST });
    server.log.info({ port: PORT }, "eflab api listening");
  } catch (err) {
    server.log.error(err, "failed to start api");
    process.exit(1);
  }
}

// Run when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}
