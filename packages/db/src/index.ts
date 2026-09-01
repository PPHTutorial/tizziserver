/**
 * @stall/db — the single Prisma entry point for every Node service.
 *
 * Prisma 7 uses a driver adapter (pg) for the client runtime; the connection
 * string comes from the validated env in @stall/config. A process-wide
 * singleton keeps dev hot-reload from opening a new pool on every reload.
 */
export * from "./generated/client.ts";

import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@stall/config";
import { PrismaClient } from "./generated/client.ts";

const globalForPrisma = globalThis as unknown as {
  __stallPrisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_POOLING_URL ?? env.DATABASE_URL,
  });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.__stallPrisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.__stallPrisma = prisma;
}

export default prisma;
