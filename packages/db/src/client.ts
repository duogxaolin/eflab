import { Prisma, PrismaClient } from "./generated/client.js";
import type { User as GeneratedUser } from "./generated/client.js";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

// Re-export the generator-exit types so consumers across the monorepo can import them.
export { Prisma };
export type PrismaClientType = PrismaClient;
export type DbUser = GeneratedUser;
export const client = prisma;
export default prisma;
