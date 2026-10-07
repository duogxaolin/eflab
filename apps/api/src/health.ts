import type { FastifyInstance, FastifyPluginCallback } from "fastify";

export const healthRoutes: FastifyPluginCallback = (server: FastifyInstance, _opts, done) => {
  server.get("/health", async (_req, reply) => {
    try {
      // Dynamic import so we don't pull prisma into a health check dependency tree by default.
      const { prisma } = await import("@eflab/db");
      await prisma.$queryRaw`SELECT 1`;
      await reply.code(200).send({ status: "ok", db: "connected", time: new Date().toISOString() });
    } catch (err) {
      server.log.error(err, "health check db probe failed");
      await reply.code(503).send({ status: "degraded", db: "unreachable", time: new Date().toISOString() });
    }
  });
  done();
};
