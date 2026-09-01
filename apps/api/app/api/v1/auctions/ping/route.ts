import { withApi } from "@/src/http/route";

/**
 * Phase 1 capability-gate probe — a stand-in for the real Inverse-Draw
 * endpoints (§17–§18). It exists only to prove the per-platform feature gate:
 *
 *   x-platform: grandprice  → 200 { pong: true }
 *   x-platform: tizzi-gas   → 403 FEATURE_DISABLED
 *
 * Replace with the real auction surface in Phase 5.
 */
export const GET = withApi(
  { auth: true, capability: "auction" },
  async ({ ctx }) => ({
    pong: true,
    platform: ctx.platform,
    activeRole: ctx.principal!.activeRole,
    at: new Date().toISOString(),
  }),
);
