import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@eflab/db";
import { getSessionFromCookie, type SessionUser } from "../auth/session.js";

export interface CreateAppContext {
  req: FastifyRequest;
  res: FastifyReply;
  // Populated lazily by `requireAuth` middleware; `null` when unauthenticated.
  session: SessionUser | null;
}

// Fastify adapter hands us this shape.
export type CreateFastifyContextOptions = {
  req: FastifyRequest;
  res: FastifyReply;
};

// Eagerly resolve the session once per request so both `publicProcedure` and
// `protectedProcedure` consumers see it without each re-hitting the DB.
export async function createContext({ req, res }: CreateFastifyContextOptions): Promise<CreateAppContext> {
  const session = await getSessionFromCookie(req.headers.cookie ?? "", prisma);
  return { req, res, session };
}
