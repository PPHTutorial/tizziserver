import Redis from "ioredis";
import { env } from "@stall/config";

let client: Redis | null | undefined;

/** Shared Redis connection. Returns null when REDIS_URL is unset (dev-lite). */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  if (!env.REDIS_URL) {
    client = null;
    return null;
  }
  client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  client.on("error", (e) => console.error("[redis]", e.message));
  return client;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSec: number;
}

/**
 * Fixed-window counter. `key` should already be namespaced by route + principal/ip.
 * No-ops (always ok) when Redis is unavailable.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const r = getRedis();
  if (!r) return { ok: true, remaining: limit, resetSec: windowSec };
  const k = `rl:${key}`;
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, windowSec);
  const ttl = await r.ttl(k);
  return { ok: n <= limit, remaining: Math.max(0, limit - n), resetSec: ttl < 0 ? windowSec : ttl };
}
