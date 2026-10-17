import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import { prisma } from "@eflab/db";

// GET /health — 200 {status:"ok", db:"connected"} when Postgres answers,
// 503 {status:"degraded", db:"unreachable"} otherwise. Used by the smoke test
// to wait for the API and by any uptime probe.
export const healthRoutes: FastifyPluginCallback = (server: FastifyInstance, _opts, done) => {
  server.get("/health", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await reply.code(200).send({ status: "ok", db: "connected", time: new Date().toISOString() });
    } catch (err) {
      server.log.error({ err: (err as Error).message }, "health check db probe failed");
      await reply.code(503).send({ status: "degraded", db: "unreachable", time: new Date().toISOString() });
    }
  });
  done();
};
