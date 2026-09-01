/**
 * @grandprice/db — the single Prisma entry point for every Node service.
 *
 * Prisma 7 uses a driver adapter (pg) for the client runtime; the connection
 * string comes from the validated env in @grandprice/config. A process-wide
 * singleton keeps dev hot-reload from opening a new pool on every reload.
 */
export * from "./generated/client.ts";

import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@grandprice/config";
import { PrismaClient } from "./generated/client.ts";

const globalForPrisma = globalThis as unknown as {
  __grandpricePrisma?: PrismaClient;
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
  globalForPrisma.__grandpricePrisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.__grandpricePrisma = prisma;
}

export default prisma;
