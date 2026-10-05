import { NextResponse } from "next/server";
import { prisma } from "@stall/db";
import { getRedis } from "@stall/core";

export const dynamic = "force-dynamic";

async function check(fn: () => Promise<unknown>, ms = 2000): Promise<boolean> {
  try {
    await Promise.race([fn(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Liveness + dependency probe for the deploy smoke test and rollback gate
 * (`.github/workflows/deploy.yml` greps for `"ok":true`). Deliberately not
 * wrapped in `withApi`: it must answer without a platform header, auth, or a
 * Redis-backed rate limit. Postgres is required (503 when down); Redis is
 * reported but degraded-only, since the API serves reads without it.
 */
export async function GET() {
  const db = await check(() => prisma.$queryRaw`SELECT 1`);
  const redisClient = getRedis();
  const redis = redisClient ? await check(() => redisClient.ping()) : false;
  const body = {
    ok: db,
    data: { db, redis, uptimeSec: Math.round(process.uptime()) },
    error: db ? null : { code: "UNAVAILABLE", message: "Database unreachable", details: null },
  };
  return NextResponse.json(body, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
